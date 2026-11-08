"""Knowledge AI: LLM-powered classification and summarization with rule-based fallback."""
from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from app.services.llm_client import chat_completion, extract_json


_VIDEO_WORDS = ("视频", "字幕", "音频", "课程", "播客", "video", "subtitle", "transcript")
_TUTORIAL_WORDS = ("教程", "文档", "知识库", "文章", "笔记", "文字版", "tutorial", "document", "notes")
_CONVERSION_WORDS = ("转成", "转换", "整理", "生成", "制作", "提取", "沉淀", "写成", "变成", "convert", "create")


def requests_video_tutorial(value: str | None) -> bool:
    """Detect an explicit request to turn video/audio into a written document."""
    text = (value or "").strip().lower()
    if not text:
        return False
    has_action = any(word in text for word in _CONVERSION_WORDS)
    has_video = any(word in text for word in _VIDEO_WORDS)
    has_output = any(word in text for word in _TUTORIAL_WORDS)
    return has_action and has_output and (has_video or "字幕" in text)


def _missing_tutorial_sections(tutorial: str) -> list[str]:
    headings = re.findall(r"^##\s+(.+)$", tutorial, flags=re.MULTILINE)
    required_sections = {
        "内容概览": ("内容概览", "教程概览", "概述"),
        "要点回顾": ("要点回顾", "核心要点", "总结", "小结"),
        "自测题": ("自测题", "自测", "练习题", "思考题"),
        "可复用知识节点": ("可复用知识节点",),
    }
    missing = [
        label
        for label, alternatives in required_sections.items()
        if not any(any(alternative in heading for alternative in alternatives) for heading in headings)
    ]

    # A useful tutorial normally uses topic-specific numbered chapters instead
    # of wrapping all teaching content below a literal "正文教程" heading.
    meta_terms = tuple(term for alternatives in required_sections.values() for term in alternatives)
    meta_terms += ("学习目标", "前置知识", "来源", "知识树链接")
    teaching_sections = [
        heading
        for heading in headings
        if not any(term in heading for term in meta_terms)
    ]
    explicit_body = any(
        any(term in heading for term in ("正文教程", "教程正文", "核心原理", "工作机制"))
        for heading in headings
    )
    if not explicit_body and len(teaching_sections) < 3:
        missing.insert(1, "正文教程（至少 3 个实质章节）")

    node_count = len(re.findall(r"^###\s+\[\[[^\]]+\]\]", tutorial, flags=re.MULTILINE))
    if "可复用知识节点" not in missing and not 2 <= node_count <= 5:
        missing.append("2–5 个可复用知识节点")
    return missing


async def generate_video_tutorial(
    title: str,
    transcript: str,
    source_url: str | None,
    user_instructions: str | None,
    api_key: str | None,
    base_url: str | None,
    model_name: str | None,
) -> str:
    """Turn a Whisper transcript into a factual, structured Markdown tutorial."""
    if not api_key or not model_name:
        raise ValueError("生成 AI 文字教程需要先在设置中配置可用的 AI 模型")

    system_prompt = """你是一名严谨的中文课程作者和知识库编辑。输入是自动转写字幕，不要按字幕顺序改写或扩写成流水账；先识别真正的教学主题，再重组为一篇能够让读者学会并应用该主题的 Markdown 教程。

要求：
- 去掉口头禅、重复表达、营销话术和与主题无关的段落；类比只保留能帮助理解的部分
- 保留视频中的关键事实、操作步骤和例子，同时主动补足学习该主题必需但字幕没有讲清的标准知识
- 所有外部知识补充必须以“【AI 补充】”开头；不能确认的字幕术语或数字标注“【待核对】”
- 不得声称已经核验未实际核验的事实，也不要编造来源、实验结果或视频时间戳
- 按“问题背景 → 核心直觉 → 工作机制 → 公式/步骤 → 示例 → 实际使用 → 边界”的学习路径组织，不照抄字幕顺序
- 技术主题在适用时必须给出关键公式、逐项解释、一个具体数值例子和一个最小可运行代码示例；非技术主题不要强行加入公式或代码
- 对相似概念进行比较，说明适用条件、失效场景和常见误区
- 必须包含：内容概览、学习目标、前置知识、正文教程、实践示例、常见误区或注意事项、要点回顾、自测题、可复用知识节点
- “可复用知识节点”只保留 2–5 个值得独立长期复用的核心概念，避免把参数、掩码、训练模式等细节各拆成一个低价值节点
- “可复用知识节点”使用 `## 可复用知识节点` 标题；每个节点使用 `### [[节点名称]]`，下一段给出脱离本教程也能理解的独立定义
- 第一行输出 `<!-- branch: 领域分支名称 -->`，第二行输出 `<!-- branch-prefix: 1-2个大写英文字母 -->`，用于知识库归档
- 不要输出 YAML frontmatter，不要用代码围栏包裹整篇文档
- 只输出最终 Markdown 教程"""
    user_prompt = (
        f"视频标题：{title}\n"
        f"来源链接：{source_url or '无'}\n"
        f"用户处理要求：{user_instructions or '整理成适合知识库阅读的文字教程'}\n\n"
        f"字幕：\n{transcript[:15000]}"
    )
    try:
        result = await chat_completion(
            api_key=api_key,
            model_name=model_name,
            base_url=base_url,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=6000,
            timeout=300,
        )
    except Exception as exc:
        raise ValueError(f"AI 教程生成失败：{exc}") from exc
    tutorial = result.strip()
    tutorial = re.sub(r"^```(?:markdown|md)?\s*", "", tutorial, flags=re.IGNORECASE)
    tutorial = re.sub(r"\s*```$", "", tutorial)
    missing = _missing_tutorial_sections(tutorial)
    if len(tutorial) >= 800 and missing:
        revision_prompt = f"""下面是一份根据视频字幕生成的教程首稿，但缺少这些必要章节：{'、'.join(missing)}。

请返回修订后的完整 Markdown 教程，要求：
- 保留首稿中有价值的原理、公式、数值例子和代码
- 总长度控制在 2500–5000 个中文字，避免末尾被截断
- 补齐缺失章节，并保留 `## 可复用知识节点` 及 2–5 个 `### [[节点名称]]`
- 第一、二行的 branch 注释必须保留
- 只输出完整教程，不要解释修改过程

首稿：
{tutorial[:18000]}"""
        try:
            revised = await chat_completion(
                api_key=api_key,
                model_name=model_name,
                base_url=base_url,
                messages=[
                    {"role": "system", "content": "你是知识库教程终审编辑，负责修复不完整教程并输出可直接入库的最终稿。"},
                    {"role": "user", "content": revision_prompt},
                ],
                temperature=0.1,
                max_tokens=6000,
                timeout=300,
            )
        except Exception as exc:
            raise ValueError(f"AI 教程修订失败：{exc}") from exc
        tutorial = revised.strip()
        tutorial = re.sub(r"^```(?:markdown|md)?\s*", "", tutorial, flags=re.IGNORECASE)
        tutorial = re.sub(r"\s*```$", "", tutorial)
        missing = _missing_tutorial_sections(tutorial)
    if len(tutorial) < 800 or missing:
        detail = f"，缺少章节：{'、'.join(missing)}" if missing else ""
        raise ValueError(f"AI 返回的教程不符合知识库质量要求{detail}")
    return tutorial


def _tokens(value: str) -> list[str]:
    chunks = re.findall(r"[一-鿿]{2,}|[a-zA-Z][a-zA-Z0-9_-]{1,}|\d+", value.lower())
    return list(dict.fromkeys(chunks))


def flatten_categories(categories: Iterable[Any]) -> list[Any]:
    result: list[Any] = []
    for category in categories:
        result.append(category)
        result.extend(flatten_categories(getattr(category, "children", [])))
    return result


def _fallback_tags(title: str, source_url: str | None) -> list[str]:
    tags = _tokens(title)[:5]
    if source_url:
        match = re.match(r"https?://([^/]+)", source_url.lower())
        if match:
            tags.append(match.group(1).removeprefix("www."))
    return list(dict.fromkeys(tags))[:6]


def _rule_classify(title: str, content: str, source_url: str | None, categories: list[Any]) -> dict[str, Any]:
    """Fast keyword-based classification, used as fallback when no LLM configured."""
    text = " ".join(part for part in [title, content, source_url or ""] if part).lower()
    text_tokens = _tokens(text)
    if not categories:
        return {
            "category": None,
            "confidence": 0.2,
            "reason": "当前知识库还没有可用目录，请先选择分类模板或创建目录。",
            "tags": _fallback_tags(title, source_url),
        }
    best_category = categories[0]
    best_score = 0
    for category in categories:
        category_text = f"{category.name} {category.description or ''}"
        category_tokens = _tokens(category_text)
        score = sum(2 for token in category_tokens if token in text)
        score += sum(1 for token in category_tokens if token in text_tokens)
        if score > best_score:
            best_category = category
            best_score = score
    confidence = min(0.95, 0.38 + best_score * 0.11) if best_score else 0.32
    reason = (
        f'根据标题和内容关键词，匹配到"{best_category.name}"。'
        if best_score
        else f'暂未发现明确关键词，先放入"{best_category.name}"，建议在 AI 助手中确认。'
    )
    tags = _fallback_tags(title, source_url)
    tags.insert(0, best_category.name)
    return {"category": best_category, "confidence": confidence, "reason": reason, "tags": list(dict.fromkeys(tags))[:8]}


async def classify_and_summarize(
    title: str,
    content: str,
    source_url: str | None,
    categories: list[Any],
    classification_prompt: str,
    api_key: str,
    base_url: str | None,
    model_name: str,
) -> dict[str, Any]:
    """Use LLM to classify and summarize. Returns dict with category, summary, tags, reason."""
    flat = flatten_categories(categories)
    cat_list = "\n".join(
        f"- {cat.name}：{cat.description or '无描述'}"
        for cat in flat
    ) or "（暂无分类目录）"

    content_preview = (content or "")[:3000]
    system_prompt = f"""{classification_prompt}

你需要从以下目录中选出最合适的一个，并给出摘要和标签。

当前知识库目录：
{cat_list}

请严格按以下 JSON 格式回复（不要加任何额外说明）：
{{
  "category_name": "目录名称（必须完全匹配上面列表中的名称，如无合适则填 null）",
  "summary": "100字以内的中文摘要",
  "tags": ["标签1", "标签2", "标签3"],
  "reason": "分类原因（30字以内）"
}}"""

    user_prompt = f"标题：{title}\n来源链接：{source_url or '无'}\n\n内容：\n{content_preview}"

    try:
        raw = await chat_completion(
            api_key=api_key,
            model_name=model_name,
            base_url=base_url,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=512,
        )
        result = extract_json(raw)
    except Exception as e:
        fallback = _rule_classify(title, content, source_url, flat)
        fallback["reason"] = f"LLM 调用失败（{type(e).__name__}），已使用关键词匹配。"
        return fallback

    cat_name = result.get("category_name")
    matched_cat = next((c for c in flat if c.name == cat_name), None)
    if not matched_cat and flat:
        matched_cat = flat[0]

    return {
        "category": matched_cat,
        "summary": result.get("summary", ""),
        "tags": result.get("tags", [])[:8],
        "reason": result.get("reason", ""),
        "confidence": 0.85,
    }


def classify_text(title: str, content: str, source_url: str | None, categories: list[Any]) -> dict[str, Any]:
    """Sync rule-based fallback (used when no LLM configured)."""
    return _rule_classify(title, content, source_url, flatten_categories(categories))


def summarize(title: str, content: str | None, source_url: str | None) -> str:
    raw = (content or "").strip().replace("\n", " ")
    if raw:
        return raw[:220] + ("..." if len(raw) > 220 else "")
    if source_url:
        return f"来自链接：{source_url}"
    return title


def answer_from_knowledge(question: str, items: list[Any]) -> str:
    if not items:
        return "当前知识库还没有可供检索的内容。你可以先添加一个链接或粘贴一段笔记，我会按当前分类体系整理。"
    lines = [f"我在当前知识库中找到 {len(items)} 条相关内容："]
    for item in items[:5]:
        category = item.category.name if item.category else "待整理"
        lines.append(f"- {item.title}（{category}）：{item.summary or '暂无摘要'}")
    lines.append("你可以继续问我某个主题、来源或分类，我会从这些知识条目中筛选。")
    return "\n".join(lines)
