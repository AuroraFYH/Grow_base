from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select

from app.api.llm_config import get_user_llm_config
from app.core.database import AsyncSessionLocal
from app.models.knowledge import KnowledgeItem
from app.models.wiki import KnowledgeOperationLog, KnowledgeProposal, WikiPage
from app.services.llm_client import chat_completion, extract_json


WIKI_COMPILER_SYSTEM = """你是团队知识库的编译器。你的任务不是给单篇资料写摘要，而是把新资料中的长期知识融合进现有 Wiki。

规则：
- 优先更新已有页面；只有出现真正独立的新概念、实体或综合主题时才创建页面
- 页面必须能够脱离原始资料独立阅读，不要按原文顺序复述
- 不编造事实；所有来自当前资料的重要结论必须提供原文逐字引用
- quote 必须是当前资料中可以直接搜索到的连续原文，不要改写
- 如果资料与旧结论冲突，把冲突写入 conflicts，不要静默覆盖
- 链接使用现有页面或本次新建页面的准确标题
- GitHub 资料只整理项目事实、架构决策和可复用技术知识，不生成使用教程
- 每个页面输出完整 Markdown；更新页面时返回更新后的完整正文
- 没有长期价值或没有新信息时 pages 可以为空

严格输出 JSON：
{
  "summary": "本次资料对知识库的价值",
  "pages": [
    {
      "action": "create 或 update",
      "page_id": "update 时填写已有页面 id，create 时为 null",
      "title": "页面标题",
      "page_type": "concept/entity/overview/comparison/tutorial",
      "summary": "一句话页面摘要",
      "content": "完整 Markdown 正文",
      "reason": "为什么新增或修改",
      "citations": [
        {"claim": "该引用支持的结论", "quote": "原文逐字引用", "locator": "章节或段落说明"}
      ],
      "links": ["相关页面标题"]
    }
  ],
  "conflicts": [
    {"page_title": "涉及页面", "existing": "旧结论", "incoming": "新资料结论", "recommendation": "建议处理方式"}
  ]
}"""


def slugify_title(title: str) -> str:
    value = re.sub(r"[^\w\u4e00-\u9fff]+", "-", title.strip().lower(), flags=re.UNICODE)
    return value.strip("-")[:220] or "untitled"


def normalize_change_set(
    raw: dict[str, Any],
    source_content: str,
    existing_pages: dict[int, WikiPage],
) -> dict[str, Any]:
    pages: list[dict[str, Any]] = []
    seen_updates: set[int] = set()
    for candidate in raw.get("pages", []):
        if not isinstance(candidate, dict):
            continue
        action = str(candidate.get("action") or "").lower()
        title = str(candidate.get("title") or "").strip()[:240]
        content = str(candidate.get("content") or "").strip()
        if action not in {"create", "update"} or not title or len(content) < 80:
            continue

        page_id = candidate.get("page_id")
        if action == "update":
            try:
                page_id = int(page_id)
            except (TypeError, ValueError):
                continue
            if page_id not in existing_pages or page_id in seen_updates:
                continue
            seen_updates.add(page_id)
        else:
            page_id = None

        citations: list[dict[str, Any]] = []
        for index, citation in enumerate(candidate.get("citations", []), 1):
            if not isinstance(citation, dict):
                continue
            quote = str(citation.get("quote") or "").strip()
            if not quote:
                continue
            citations.append({
                "key": f"src-{index}",
                "claim": str(citation.get("claim") or "").strip()[:1000] or None,
                "quote": quote[:3000],
                "locator": str(citation.get("locator") or "").strip()[:240] or None,
                "verified": quote in source_content,
            })

        links = []
        for link in candidate.get("links", []):
            value = str(link).strip()[:240]
            if value and value != title and value not in links:
                links.append(value)

        pages.append({
            "action": action,
            "page_id": page_id,
            "title": title,
            "page_type": str(candidate.get("page_type") or "concept")[:30],
            "summary": str(candidate.get("summary") or "").strip()[:2000] or None,
            "content": content[:50000],
            "reason": str(candidate.get("reason") or "").strip()[:2000] or None,
            "previous_content": existing_pages[page_id].content if action == "update" else None,
            "citations": citations,
            "links": links[:20],
        })

    conflicts = []
    for conflict in raw.get("conflicts", []):
        if isinstance(conflict, dict):
            conflicts.append({
                "page_title": str(conflict.get("page_title") or "").strip()[:240],
                "existing": str(conflict.get("existing") or "").strip()[:2000],
                "incoming": str(conflict.get("incoming") or "").strip()[:2000],
                "recommendation": str(conflict.get("recommendation") or "").strip()[:2000],
            })
    return {
        "summary": str(raw.get("summary") or "").strip()[:4000],
        "pages": pages,
        "conflicts": conflicts[:30],
        "validation": {
            "page_count": len(pages),
            "unverified_citation_count": sum(
                1 for page in pages for citation in page["citations"] if not citation["verified"]
            ),
        },
    }


async def _source_text(item: KnowledgeItem) -> str:
    if item.content and item.content.strip():
        return item.content.strip()
    if item.source_type == "file" and item.file_path and item.file_name:
        from app.services.file_storage import extract_text

        return extract_text(item.file_path, item.file_name).strip()
    if item.source_url:
        from app.services.content_fetcher import fetch_content

        _, content = await fetch_content(item.source_url)
        return content.strip()
    return ""


async def generate_wiki_proposal(proposal_id: int, user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        proposal = await db.get(KnowledgeProposal, proposal_id)
        if not proposal or proposal.status != "generating":
            return
        try:
            source = await db.get(KnowledgeItem, proposal.source_id)
            if not source or source.organization_id != proposal.organization_id:
                raise ValueError("原始资料不存在或不属于当前知识库")
            source_content = await _source_text(source)
            if len(source_content) < 40:
                raise ValueError("原始资料内容不足，无法编译为 Wiki")

            llm_creds = await get_user_llm_config(user_id, db)
            if not llm_creds:
                raise ValueError("请先在 AI 设置中配置可用模型")

            page_result = await db.execute(
                select(WikiPage)
                .where(
                    WikiPage.organization_id == proposal.organization_id,
                    WikiPage.status == "published",
                )
                .order_by(WikiPage.updated_at.desc(), WikiPage.id.desc())
                .limit(80)
            )
            existing = list(page_result.scalars().all())
            page_index = "\n\n".join(
                f"[页面 id={page.id}] {page.title}｜类型：{page.page_type}\n"
                f"摘要：{page.summary or '无'}\n正文摘录：{page.content[:1800]}"
                for page in existing
            ) or "（当前还没有 Wiki 页面）"

            user_prompt = (
                f"资料标题：{source.title}\n"
                f"资料类型：{source.source_type}\n"
                f"资料链接：{source.source_url or '无'}\n"
                f"用户要求：{proposal.instructions or '提取长期可复用知识并融合进现有 Wiki'}\n\n"
                f"现有 Wiki：\n{page_index}\n\n"
                f"当前资料全文：\n{source_content[:18000]}"
            )
            api_key, base_url, model_name = llm_creds
            response = await chat_completion(
                api_key=api_key,
                model_name=model_name,
                base_url=base_url,
                messages=[
                    {"role": "system", "content": WIKI_COMPILER_SYSTEM},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=7000,
                timeout=300,
            )
            try:
                raw = extract_json(response, expected_keys={"summary", "pages"})
            except ValueError as parse_error:
                # A long Wiki change set is easy for an LLM to truncate or
                # corrupt with an unescaped quote. Give the model one focused
                # repair pass instead of failing the whole proposal.
                repair_response = await chat_completion(
                    api_key=api_key,
                    model_name=model_name,
                    base_url=base_url,
                    messages=[
                        {
                            "role": "system",
                            "content": "你是 JSON 修复器。只输出严格合法的 JSON 对象，不要 Markdown 代码块、注释或额外文字。根对象必须包含 summary、pages、conflicts 三个字段；字符串中的换行、引号和反斜杠必须正确转义。",
                        },
                        {
                            "role": "user",
                            "content": f"下面的 Wiki 编译结果不是合法 JSON，请修复并完整返回同一份数据。不要删掉 pages 中的有效内容。\n\n解析错误：{parse_error}\n\n原始结果：\n{response[:24000]}",
                        },
                    ],
                    temperature=0,
                    max_tokens=7000,
                    timeout=300,
                )
                raw = extract_json(repair_response, expected_keys={"summary", "pages"})
            proposal.change_set = normalize_change_set(
                raw,
                source_content,
                {page.id: page for page in existing},
            )
            proposal.summary = proposal.change_set.get("summary") or "Wiki 编译提案已生成"
            proposal.status = "pending"
            proposal.error = None
            db.add(KnowledgeOperationLog(
                organization_id=proposal.organization_id,
                proposal_id=proposal.id,
                actor_id=user_id,
                operation="proposal_generated",
                details=proposal.change_set.get("validation", {}),
            ))
        except Exception as exc:
            proposal.status = "failed"
            proposal.error = str(exc)[:4000]
            db.add(KnowledgeOperationLog(
                organization_id=proposal.organization_id,
                proposal_id=proposal.id,
                actor_id=user_id,
                operation="proposal_failed",
                details={"error": proposal.error},
            ))
        await db.commit()
