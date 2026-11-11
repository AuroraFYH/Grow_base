from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _safe_path_part(value: str) -> str:
    value = re.sub(r'[\\/:*?"<>|#^\[\]]', "-", value.strip())
    return value.strip("-.")[:120] or "untitled"


def _yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _wiki_target(org_name: str, slug: str) -> str:
    return f"GrowBase/{_safe_path_part(org_name)}/Wiki/{_safe_path_part(slug)}"


def render_wiki_page_markdown(
    page: dict[str, Any],
    org_name: str,
    citations: list[dict[str, Any]],
    links: list[dict[str, Any]],
) -> str:
    updated_at = page.get("updated_at") or datetime.now(timezone.utc)
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()
    tags = ["GrowBase", "Wiki", str(page.get("page_type") or "concept")]
    frontmatter = [
        "---",
        f"title: {_yaml_string(str(page['title']))}",
        f"growbase_page_id: {page['id']}",
        f"organization: {_yaml_string(org_name)}",
        f"page_type: {_yaml_string(str(page.get('page_type') or 'concept'))}",
        f"version: {page.get('version') or 1}",
        f"updated_at: {_yaml_string(str(updated_at))}",
        "tags:",
        *(f"  - {_yaml_string(tag)}" for tag in tags),
        "---",
    ]

    content = str(page.get("content") or "").strip()
    body = ["\n".join(frontmatter), "", content or f"# {page['title']}"]

    if links:
        body.extend(["", "## 相关页面", ""])
        for link in links:
            target = _wiki_target(org_name, str(link["target_slug"]))
            label = link["target_title"]
            body.append(f"- [[{target}|{label}]]")

    body.extend(["", "## 来源证据", ""])
    if not citations:
        body.append("_当前页面没有来源引用。_")
    else:
        for citation in citations:
            source_title = citation.get("source_title") or f"资料 {citation['source_id']}"
            verified = "已核对" if citation.get("verified") else "待核对"
            body.append(f"### {source_title}（{verified}）")
            if citation.get("claim_text"):
                body.append(f"- 支持结论：{citation['claim_text']}")
            if citation.get("locator"):
                body.append(f"- 位置：{citation['locator']}")
            if citation.get("source_url"):
                body.append(f"- 来源：{citation['source_url']}")
            quote = str(citation.get("quote") or "").replace("\n", "\n> ")
            body.extend(["", f"> {quote}", ""])

    body.extend([
        "",
        "---",
        "_此文件由 GrowBase 正式 Wiki 同步生成。请在 GrowBase 中审核和修改，以免下次同步覆盖本地改动。_",
        "",
    ])
    return "\n".join(body)


def _write_files(
    vault_path: str,
    org_name: str,
    pages: list[dict[str, Any]],
) -> list[str]:
    vault_root = Path(vault_path).expanduser()
    if not vault_root.is_dir():
        raise FileNotFoundError(f"Vault 路径不存在：{vault_root}")

    wiki_root = vault_root / "GrowBase" / _safe_path_part(org_name) / "Wiki"
    wiki_root.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    index_lines = [f"# {org_name} Wiki", "", "由 GrowBase 正式 Wiki 自动同步。", ""]

    for payload in pages:
        page = payload["page"]
        filename = f"{_safe_path_part(str(page['slug']))}.md"
        destination = wiki_root / filename
        markdown = render_wiki_page_markdown(
            page,
            org_name,
            payload.get("citations", []),
            payload.get("links", []),
        )
        temporary = destination.with_suffix(".md.tmp")
        temporary.write_text(markdown, encoding="utf-8")
        temporary.replace(destination)
        written.append(str(destination))
        summary = re.sub(r"\s+", " ", str(page.get("summary") or "暂无摘要")).strip()
        index_lines.append(f"- [[{_wiki_target(org_name, str(page['slug']))}|{page['title']}]] - {summary}")

    index_path = wiki_root / "_索引.md"
    index_temp = index_path.with_suffix(".md.tmp")
    index_temp.write_text("\n".join(index_lines).rstrip() + "\n", encoding="utf-8")
    index_temp.replace(index_path)
    return written


async def write_wiki_pages_to_vault(
    vault_path: str,
    org_name: str,
    pages: list[dict[str, Any]],
) -> list[str]:
    return await asyncio.to_thread(_write_files, vault_path, org_name, pages)
