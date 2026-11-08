"""
Write knowledge items as Obsidian-compatible markdown files.
Produces two layers:
  1. 视频笔记/{branch}/日期-标题.md  — full structured note
  2. 知识节点/{branch}/ID 概念.md    — one file per key concept extracted
  3. 知识节点/{branch}/_索引.md      — branch index (appended/updated)
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.llm_client import chat_completion, extract_json


# ── helpers ─────────────────────────────────────────────────────────────────

def _safe(name: str) -> str:
    """Strip Obsidian-illegal characters from filename."""
    name = re.sub(r'[\\/:*?"<>|#^\[\]]', "-", name)
    return name.strip("-").strip()[:120] or "untitled"


def scan_vault_titles(vault_path: str) -> list[dict[str, str]]:
    """Return [{title, rel_path}] for every .md in vault (skip hidden dirs)."""
    root = Path(vault_path)
    if not root.is_dir():
        return []
    out = []
    for md in root.rglob("*.md"):
        if any(p.startswith(".") for p in md.parts):
            continue
        out.append({
            "title": md.stem,
            "rel_path": str(md.relative_to(root).with_suffix("")),
        })
    return out


def _infer_branch_from_content(
    content: str,
    vault_titles: list[dict[str, str]],
    default_branch: str,
) -> str:
    """Use existing wikilinks to place a tutorial in the closest vault branch."""
    links = [
        re.sub(r"^[A-Z]+\d+\s+", "", value.split("|", 1)[0]).strip().lower()
        for value in re.findall(r"\[\[([^\]]+)\]\]", content)
    ]
    scores: dict[str, int] = {}
    for entry in vault_titles:
        parts = Path(entry["rel_path"]).parts
        if len(parts) < 3 or parts[0] != "知识节点" or entry["title"] == "_索引":
            continue
        branch = parts[1]
        node_name = re.sub(r"^[A-Z]+\d+\s+", "", entry["title"]).strip().lower()
        for link in links:
            if len(link) >= 2 and (link in node_name or node_name in link):
                scores[branch] = scores.get(branch, 0) + 1
    return max(scores, key=scores.get) if scores else default_branch


def _fallback_structure_from_markdown(
    content: str,
    item_title: str,
    item_summary: str | None,
    branch: str,
    existing_nodes: list[dict],
) -> dict[str, Any]:
    """Parse the structured tutorial produced by the first LLM call."""
    title_match = re.search(r"^#\s+(.+)$", content, flags=re.MULTILINE)
    title = title_match.group(1).strip() if title_match else item_title

    sections: list[dict[str, str]] = []
    headings = list(re.finditer(r"^##\s+(.+)$", content, flags=re.MULTILINE))
    for index, heading in enumerate(headings):
        start = heading.end()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(content)
        sections.append({
            "heading": heading.group(1).strip(),
            "content": content[start:end].strip(),
        })

    branch_match = re.search(r"<!--\s*branch:\s*(.+?)\s*-->", content)
    if branch_match:
        branch = branch_match.group(1).strip()

    existing_by_name = {
        node["name"].strip().lower(): node["id"]
        for node in existing_nodes
    }
    existing_ids = [node["id"] for node in existing_nodes]
    prefix_counts: dict[str, int] = {}
    max_by_prefix: dict[str, int] = {}
    for node_id in existing_ids:
        match = re.fullmatch(r"([A-Z]+)(\d+)", node_id)
        if not match:
            continue
        prefix, number = match.group(1), int(match.group(2))
        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1
        max_by_prefix[prefix] = max(max_by_prefix.get(prefix, 0), number)
    prefix_match = re.search(r"<!--\s*branch-prefix:\s*([A-Z]{1,2})\s*-->", content)
    suggested_prefix = prefix_match.group(1) if prefix_match else "K"
    prefix = max(prefix_counts, key=prefix_counts.get) if prefix_counts else suggested_prefix
    next_number = max_by_prefix.get(prefix, 0) + 1

    nodes: list[dict[str, Any]] = []
    node_section = next((s["content"] for s in sections if s["heading"] == "可复用知识节点"), "")
    node_matches = list(re.finditer(r"^###\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$", node_section, flags=re.MULTILINE))
    for index, match in enumerate(node_matches):
        name = match.group(1).strip()
        body_start = match.end()
        body_end = node_matches[index + 1].start() if index + 1 < len(node_matches) else len(node_section)
        description = node_section[body_start:body_end].strip()
        if any(name.lower() in known or known in name.lower() for known in existing_by_name):
            continue
        # Chinese punctuation does not require following whitespace; Latin
        # punctuation does, so decimal values such as 36.8% stay intact.
        first_sentence = re.split(
            r"(?<=[。！？])|(?<=[.!?])\s+",
            description,
            maxsplit=1,
        )[0].strip()
        nodes.append({
            "id": f"{prefix}{next_number}",
            "name": name,
            "branch": branch,
            "作用": first_sentence or description[:120],
            "直觉": description,
            "例子": "见来源教程中的对应章节。",
            "依赖": existing_ids[-1:] if existing_ids else [],
            "相邻概念": "；".join(
                other.group(1).strip()
                for other in node_matches
                if other.group(1).strip() != name
            )[:240],
            "边界": "以来源教程中的定义和适用范围为准。",
        })
        next_number += 1

    return {
        "branch": branch,
        "branch_prefix": prefix,
        "video_title": title,
        "video_summary": item_summary or "根据视频字幕整理的结构化教程。",
        "nodes": nodes,
        "video_sections": sections,
        "confusion_table": [],
        "_parsed_from_tutorial": True,
    }


# ── Step 1: extract structured knowledge from transcript ────────────────────

EXTRACT_SYSTEM = """你是一个知识库构建助手。用户会给你一段视频/文章的原始内容（字幕或正文），你需要：

1. 提取 3–10 个核心知识节点（概念/技术/方法）
2. 生成可以独立阅读和复习的完整文字教程，而不是摘要或标签列表
3. 优先复用现有知识节点；只有出现真正的新概念时才创建新节点

教程写作规则：
- 用编号章节解释“是什么、为什么、怎样工作、何时使用”，保留公式、步骤和具体例子
- 严格区分视频明确讲过的内容与编辑补充；补充内容以“【补充】”标记
- 修正明显转写错误，不确定的术语和数字放入转写校正表
- 在正文中用完整 wikilink（如 [[T6 泛化与过拟合|泛化与过拟合]]）连接相关节点
- 结尾包含边界/常见误区、要点回顾和至少一道自测题

每个知识节点格式：
- id: 分支缩写+序号，例如 N1, B3, T2（用英文字母表示分支，数字表示序号，从现有节点的最大序号+1开始）
- name: 概念名称（中文，简洁）
- branch: 所属分支（和视频整体分支一致）
- 作用: 一句话说明这个概念做什么
- 直觉: 用类比或直觉解释
- 例子: 一个具体例子
- 依赖: 依赖哪些其他节点（用 id 列表，只填已知的）
- 相邻概念: 相关但不依赖的概念词（逗号分隔）
- 边界: 容易误解的地方或适用范围限制

严格输出 JSON，不要其他文字：
{
  "branch": "分支名称（中文）",
  "branch_prefix": "分支缩写（1-2个英文大写字母）",
  "video_title": "视频/文章标题（简洁，20字以内）",
  "video_summary": "2-3句话概括这个视频/文章的核心价值和适合谁看",
  "existing_node_max_id": 0,
  "nodes": [
    {
      "id": "B1",
      "name": "概念名称",
      "branch": "分支名称",
      "作用": "...",
      "直觉": "...",
      "例子": "...",
      "依赖": ["B0"],
      "相邻概念": "概念A；概念B；概念C",
      "边界": "..."
    }
  ],
  "video_sections": [
    {
      "heading": "章节标题",
      "content": "章节内容（保留关键细节，可以引用 [[节点id 节点名]] 格式的链接）"
    }
  ],
  "confusion_table": [
    {"wrong": "容易混淆的说法", "correct": "正确说法", "confidence": "高/中/低"}
  ]
}"""


async def extract_knowledge_structure(
    content: str,
    source_url: str | None,
    category_name: str | None,
    classification_prompt: str,
    existing_nodes: list[dict],  # [{id, name}] from existing vault for this branch
    api_key: str,
    base_url: str | None,
    model_name: str,
) -> dict[str, Any]:
    """Call LLM to extract structured knowledge from raw content."""
    existing_str = ""
    if existing_nodes:
        existing_str = "\n\n现有知识节点（请不要重复，依赖关系可以引用这些 id）：\n" + "\n".join(
            f"- {n['id']}: {n['name']}" for n in existing_nodes
        )

    user_prompt = (
        f"分类体系说明：{classification_prompt or '通用知识库'}\n"
        f"当前分支：{category_name or '通用'}\n"
        f"来源链接：{source_url or '无'}\n"
        f"{existing_str}\n\n"
        f"原始内容：\n{content[:8000]}"
    )

    raw = await chat_completion(
        api_key=api_key,
        model_name=model_name,
        base_url=base_url,
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=4000,
        timeout=180,
    )
    return extract_json(raw)


# ── Step 2: generate wikilinks for each node ────────────────────────────────

async def assign_wikilinks(
    nodes: list[dict],
    vault_titles: list[dict],
    extra_instructions: str,
    api_key: str,
    base_url: str | None,
    model_name: str,
) -> dict[str, list[str]]:
    """
    For each new node, decide which existing vault notes to link.
    Returns {node_id: [linked_title, ...]}
    """
    if not vault_titles or not nodes:
        return {}

    titles_str = "\n".join(f"- {t['title']}" for t in vault_titles[:400])
    nodes_str = "\n".join(
        f"- {n['id']} {n['name']}：{n.get('作用', '')}" for n in nodes
    )

    system = f"""你是知识链接助手。根据节点内容，从已有 vault 笔记中选出真正相关的笔记建立 wikilink。
{f'用户补充要求：{extra_instructions}' if extra_instructions else ''}

规则：
- 只链接内容真正相关的笔记，不要因为标题相似就随意链接
- 每个节点最多 5 个外部链接
- 输出 JSON：{{"节点id": ["笔记标题1", "笔记标题2"]}}，不相关则留空列表"""

    user = f"新节点：\n{nodes_str}\n\n已有 vault 笔记：\n{titles_str}"

    try:
        raw = await chat_completion(
            api_key=api_key, model_name=model_name, base_url=base_url,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.1, max_tokens=800,
        )
        result = extract_json(raw)
        valid = {t["title"] for t in vault_titles}
        return {
            nid: [l for l in links if l in valid][:5]
            for nid, links in result.items()
            if isinstance(links, list)
        }
    except Exception:
        return {}


# ── Step 3: render markdown files ───────────────────────────────────────────

def render_node_md(
    node: dict,
    branch: str,
    source_id: str,
    date_str: str,
    video_title: str,
    video_note_rel: str,
    external_links: list[str],
    node_titles: dict[str, str],
) -> str:
    node_id = node["id"]
    node_name = node["name"]
    dep_links = " · ".join(
        f"[[{node_titles[d]}|{d}]]" if d in node_titles else f"[[{d}]]"
        for d in node.get("依赖", [])
    )
    ext_links = " · ".join(f"[[{l}]]" for l in external_links)

    fm = f"""---
id: {node_id}
branch: {branch}
mastery: L0
tags: [知识树]
---"""

    body = f"""# {node_id} {node_name}

**作用**：{node.get("作用", "")}

**直觉**：{node.get("直觉", "")}

**例子**：{node.get("例子", "")}

**依赖**：{dep_links or "（无）"}

**相邻概念**：{node.get("相邻概念", "")}

**边界**：{node.get("边界", "")}

**掌握程度**：L0

**来源**：{source_id}（整理于 {date_str}）

---

所属分支：[[知识节点/{_safe(branch)}/_索引|{branch}]]

深入阅读：[[{video_note_rel}|{video_title}]]"""

    if ext_links:
        body += f"\n\n相关笔记：{ext_links}"

    return fm + "\n\n" + body


def render_video_note_md(
    structure: dict,
    source_url: str | None,
    source_id: str,
    date_str: str,
    nodes: list[dict],
    node_titles: dict[str, str] | None = None,
) -> str:
    title = structure.get("video_title", "未命名视频")
    summary = structure.get("video_summary", "")
    branch = structure.get("branch", "通用")
    sections = structure.get("video_sections", [])
    confusion = structure.get("confusion_table", [])

    node_ids = [node.get("id", "") for node in nodes if node.get("id")]
    fm = f"""---
title: {title}
source_id: "{source_id}"
source_url: {source_url or "~"}
date: {date_str}
transcriber: whisper
evidence: AI 整理自字幕/正文；具体数字与引用未外部核验
nodes: [{", ".join(node_ids)}]
---"""

    body_parts = [f"# {title}", ""]
    if summary:
        body_parts += [f"> {_resolve_wikilinks(summary, node_titles or {})}", ""]

    for sec in sections:
        heading = sec.get("heading", "")
        content = sec.get("content", "")
        if heading:
            body_parts.append(f"## {heading}")
        if content:
            body_parts.append(_resolve_wikilinks(content, node_titles or {}))
        body_parts.append("")

    if confusion:
        body_parts.append("## 字幕校正表")
        body_parts.append("")
        body_parts.append("| 字幕转写 | 采用术语 | 置信度 |")
        body_parts.append("|---|---|---|")
        for row in confusion:
            body_parts.append(f"| {row.get('wrong','')} | {row.get('correct','')} | {row.get('confidence','')} |")
        body_parts.append("")

    # knowledge tree links
    node_links = "\n".join(
        f"- [[知识节点/{_safe(branch)}/{node['id']} {_safe(node['name'])}|{node['id']} {node['name']}]]"
        for node in nodes
        if node.get("id") and node.get("name")
    )
    if node_links:
        body_parts += ["## 知识树链接", "", node_links]

    return fm + "\n\n" + "\n".join(body_parts)


def _resolve_wikilinks(markdown: str, node_titles: dict[str, str]) -> str:
    """Rewrite concept-only links to actual `ID Name` filenames in the vault."""
    names = {
        re.sub(r"^[A-Z]+\d+\s+", "", title).strip().lower(): title
        for title in node_titles.values()
    }

    def replace(match: re.Match[str]) -> str:
        raw = match.group(1)
        target, separator, alias = raw.partition("|")
        target = target.strip()
        if "/" in target or re.match(r"^[A-Z]+\d+\s+", target):
            return match.group(0)
        normalized = target.lower()
        resolved = names.get(normalized)
        if not resolved:
            candidates = [title for name, title in names.items() if normalized in name or name in normalized]
            resolved = candidates[0] if len(candidates) == 1 else None
        if not resolved:
            return match.group(0)
        display = alias.strip() if separator else target
        return f"[[{resolved}|{display}]]"

    return re.sub(r"\[\[([^\]]+)\]\]", replace, markdown)


def update_index_md(index_path: Path, branch: str, new_nodes: list[dict]) -> None:
    """Append new nodes to the branch index, creating it if needed."""
    if index_path.exists():
        existing = index_path.read_text("utf-8")
    else:
        existing = f"# {branch}\n\n## 节点\n\n"

    # find existing node ids already in index
    existing_ids: set[str] = set()
    for target in re.findall(r'\[\[([^\]|]+)', existing):
        match = re.search(r'(?:^|/)([A-Z]+\d+)\s', target)
        if match:
            existing_ids.add(match.group(1))

    additions = []
    for node in new_nodes:
        nid = node["id"]
        if nid not in existing_ids:
            name = node["name"]
            desc = node.get("作用", "")
            safe_branch = _safe(branch)
            additions.append(
                f"- [[知识节点/{safe_branch}/{nid} {_safe(name)}|{nid} {name}]] — {desc}"
            )

    if not additions:
        return

    # insert before last line or append
    content = existing.rstrip()
    content += "\n" + "\n".join(additions) + "\n"
    index_path.write_text(content, "utf-8")


def update_overview_md(vault_root: Path, branch: str, note_path: Path) -> None:
    """Keep the vault overview in sync without replacing hand-written sections."""
    overview_path = vault_root / "00 总览.md"
    if overview_path.exists():
        content = overview_path.read_text("utf-8")
    else:
        content = """# GrowBase 知识树

节点总数：0

## 内容分支

## 视频笔记

## 使用方式

- 从视频笔记进入概念节点。
- 在节点页查看依赖、边界和相关概念。
"""
    node_root = vault_root / "知识节点"
    node_count = sum(
        1
        for path in node_root.rglob("*.md")
        if path.name != "_索引.md"
    ) if node_root.is_dir() else 0
    if re.search(r"节点总数：\d+", content):
        content = re.sub(r"节点总数：\d+", f"节点总数：{node_count}", content, count=1)

    safe_branch = _safe(branch)
    branch_nodes = list((node_root / safe_branch).glob("*.md")) if (node_root / safe_branch).is_dir() else []
    branch_count = sum(1 for path in branch_nodes if path.name != "_索引.md")
    branch_line = f"- [[知识节点/{safe_branch}/_索引|{branch}]]（{branch_count} 个节点）"
    branch_pattern = rf"^- \[\[知识节点/{re.escape(safe_branch)}/_索引\|[^\]]+\]\](?:（\d+ 个节点）)?$"
    if re.search(branch_pattern, content, flags=re.MULTILINE):
        content = re.sub(branch_pattern, branch_line, content, flags=re.MULTILINE)
    elif "## 内容分支" in content:
        content = content.replace("## 内容分支\n", f"## 内容分支\n\n{branch_line}\n", 1)

    note_rel = str(note_path.relative_to(vault_root).with_suffix(""))
    note_line = f"- [[{note_rel}|{note_path.stem}]]"
    if note_rel not in content and "## 视频笔记" in content:
        content = content.replace("## 视频笔记\n", f"## 视频笔记\n\n{note_line}\n", 1)

    overview_path.write_text(content, "utf-8")


# ── main entry point ─────────────────────────────────────────────────────────

async def write_to_vault(
    vault_path: str,
    org_name: str,
    item_title: str,
    item_summary: str | None,
    item_tags: list[str],
    category_name: str | None,
    source_url: str | None,
    source_type: str,
    content: str | None,
    classification_prompt: str,
    extra_link_instructions: str,
    api_key: str | None,
    base_url: str | None,
    model_name: str | None,
) -> str:
    """
    Main entry. Extracts knowledge structure from content, writes all vault files.
    Returns path of the video note file written.
    """
    vault_root = Path(vault_path)
    if not vault_root.is_dir():
        raise FileNotFoundError(f"vault 路径不存在：{vault_path}")

    if not api_key or not model_name:
        # no LLM: write a simple flat note
        return await _write_simple_note(vault_root, org_name, item_title, item_summary,
                                        item_tags, category_name, source_url, content)

    date_str = datetime.now().strftime("%Y-%m-%d")
    branch = category_name or org_name

    # scan vault for existing nodes and titles
    vault_titles = await asyncio.get_event_loop().run_in_executor(
        None, scan_vault_titles, vault_path
    )

    branch = _infer_branch_from_content(content or "", vault_titles, branch)

    # find existing nodes for this branch (to avoid id collision)
    existing_nodes = [
        {"id": t["title"].split()[0], "name": " ".join(t["title"].split()[1:])}
        for t in vault_titles
        if re.match(r"^[A-Z]+\d+\s", t["title"])
        and _safe(branch) in t["rel_path"]
    ]

    # ── Step 1: extract structure ──
    tutorial_content = content or item_summary or item_title
    if "## 可复用知识节点" in tutorial_content:
        structure = _fallback_structure_from_markdown(
            tutorial_content,
            item_title,
            item_summary,
            branch,
            existing_nodes,
        )
    else:
        try:
            structure = await extract_knowledge_structure(
                content=tutorial_content,
                source_url=source_url,
                category_name=branch,
                classification_prompt=classification_prompt,
                existing_nodes=existing_nodes,
                api_key=api_key,
                base_url=base_url,
                model_name=model_name,
            )
        except Exception:
            structure = _fallback_structure_from_markdown(
                tutorial_content,
                item_title,
                item_summary,
                branch,
                existing_nodes,
            )

    nodes = structure.get("nodes", [])
    actual_branch = structure.get("branch", branch)
    video_title = structure.get("video_title", item_title)

    # ── Step 2: assign wikilinks ──
    link_map = {} if structure.get("_parsed_from_tutorial") else await assign_wikilinks(
        nodes=nodes,
        vault_titles=vault_titles,
        extra_instructions=extra_link_instructions,
        api_key=api_key,
        base_url=base_url,
        model_name=model_name,
    )

    # ── Step 3: determine source_id ──
    source_id = item_title
    if source_url:
        # extract video id or domain
        bv = re.search(r'(BV[a-zA-Z0-9]+)', source_url)
        av = re.search(r'av(\d+)', source_url)
        yt = re.search(r'(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})', source_url)
        dy = re.search(r'(?:modal_id=|/video/)(\d+)', source_url)
        if bv:
            source_id = bv.group(1)
        elif av:
            source_id = f"av{av.group(1)}"
        elif yt:
            source_id = yt.group(1)
        elif dy:
            source_id = dy.group(1)

    safe_branch = _safe(actual_branch)

    # Resolve the final note path before writing nodes so their links stay valid
    # when a same-day file with the same title already exists.
    note_folder = vault_root / "视频笔记" / safe_branch
    note_folder.mkdir(parents=True, exist_ok=True)
    note_path = note_folder / f"{date_str}-{_safe(video_title)}.md"
    counter = 1
    while note_path.exists():
        note_path = note_folder / f"{date_str}-{_safe(video_title)}-{counter}.md"
        counter += 1
    video_note_rel = str(note_path.relative_to(vault_root).with_suffix(""))

    # ── Step 4: write node files ──
    node_folder = vault_root / "知识节点" / safe_branch
    node_folder.mkdir(parents=True, exist_ok=True)

    node_titles = {
        title.split()[0]: title
        for title in (entry["title"] for entry in vault_titles)
        if re.match(r"^[A-Z]+\d+\s", title)
    }
    node_titles.update({node["id"]: f"{node['id']} {node['name']}" for node in nodes})

    for node in nodes:
        nid = node["id"]
        nname = node["name"]
        ext_links = link_map.get(nid, [])
        md = render_node_md(
            node=node,
            branch=actual_branch,
            source_id=source_id,
            date_str=date_str,
            video_title=video_title,
            video_note_rel=video_note_rel,
            external_links=ext_links,
            node_titles=node_titles,
        )
        node_file = node_folder / f"{nid} {_safe(nname)}.md"
        await asyncio.get_event_loop().run_in_executor(
            None, node_file.write_text, md, "utf-8"
        )

    # ── Step 5: write video note ──
    note_md = render_video_note_md(
        structure=structure,
        source_url=source_url,
        source_id=source_id,
        date_str=date_str,
        nodes=nodes,
        node_titles=node_titles,
    )
    await asyncio.get_event_loop().run_in_executor(
        None, note_path.write_text, note_md, "utf-8"
    )

    # ── Step 6: update branch index ──
    index_path = node_folder / "_索引.md"
    await asyncio.get_event_loop().run_in_executor(
        None, update_index_md, index_path, actual_branch, nodes
    )
    await asyncio.get_event_loop().run_in_executor(
        None, update_overview_md, vault_root, actual_branch, note_path
    )

    return str(note_path)


async def _write_simple_note(
    vault_root: Path,
    org_name: str,
    item_title: str,
    item_summary: str | None,
    item_tags: list[str],
    category_name: str | None,
    source_url: str | None,
    content: str | None,
) -> str:
    """Fallback: write a single flat note when no LLM is configured."""
    date_str = datetime.now().strftime("%Y-%m-%d")
    branch = _safe(category_name or org_name)
    folder = vault_root / "GrowBase" / branch
    folder.mkdir(parents=True, exist_ok=True)

    tags_yaml = "\n".join(f"  - {t}" for t in item_tags) if item_tags else "  - GrowBase"
    md = f"""---
title: "{item_title}"
date: {date_str}
source: {source_url or "~"}
tags:
{tags_yaml}
---

# {item_title}

{f"> {item_summary}" if item_summary else ""}

{content[:3000] if content else ""}
"""
    filepath = folder / f"{date_str}-{_safe(item_title)}.md"
    await asyncio.get_event_loop().run_in_executor(None, filepath.write_text, md, "utf-8")
    return str(filepath)


async def rewrite_vault_links(
    vault_path: str,
    org_name: str,
    item_title: str,
    category_name: str | None,
    extra_link_instructions: str,
    classification_prompt: str,
    item_summary: str | None,
    item_tags: list[str],
    api_key: str,
    base_url: str | None,
    model_name: str,
) -> tuple[str, list[str]]:
    """Find existing node files for this item and rewrite their wikilinks section."""
    vault_root = Path(vault_path)
    safe_branch = _safe(category_name or org_name)
    node_folder = vault_root / "知识节点" / safe_branch

    vault_titles = await asyncio.get_event_loop().run_in_executor(
        None, scan_vault_titles, vault_path
    )

    # find all node files for this branch written recently
    targets = list(node_folder.glob("*.md")) if node_folder.is_dir() else []
    targets = [t for t in targets if not t.stem.startswith("_")]

    if not targets:
        raise FileNotFoundError(f"未找到 vault 节点文件（{safe_branch}/）")

    nodes_meta = [{"id": t.stem.split()[0], "name": " ".join(t.stem.split()[1:]), "作用": ""} for t in targets]
    link_map = await assign_wikilinks(
        nodes=nodes_meta,
        vault_titles=vault_titles,
        extra_instructions=extra_link_instructions,
        api_key=api_key,
        base_url=base_url,
        model_name=model_name,
    )

    rewritten = 0
    all_links: list[str] = []
    for target in targets:
        nid = target.stem.split()[0]
        new_links = link_map.get(nid, [])
        all_links.extend(new_links)
        existing = target.read_text("utf-8")
        new_section = "相关笔记：" + (" · ".join(f"[[{l}]]" for l in new_links) or "（暂无）")
        if "相关笔记：" in existing:
            existing = re.sub(r"相关笔记：.*", new_section, existing)
        else:
            existing = existing.rstrip() + "\n\n" + new_section + "\n"
        target.write_text(existing, "utf-8")
        rewritten += 1

    return str(node_folder), list(dict.fromkeys(all_links))
