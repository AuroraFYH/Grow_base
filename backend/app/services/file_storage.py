from __future__ import annotations

import re
import zipfile
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import UploadFile


UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "data" / "uploads"
MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_EXTRACTED_CHARS = 200_000

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl",
    ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".jsx",
    ".ts", ".tsx", ".py", ".java", ".go", ".rs", ".c", ".h", ".cpp",
    ".hpp", ".sql", ".sh", ".toml", ".ini", ".conf", ".log",
}


def clean_filename(filename: str | None) -> str:
    name = Path((filename or "未命名文件").replace("\\", "/")).name.strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    return name[:500] or "未命名文件"


async def save_upload(upload: UploadFile, org_id: int) -> tuple[Path, str, int]:
    original_name = clean_filename(upload.filename)
    suffix = Path(original_name).suffix[:20].lower()
    target_dir = UPLOAD_ROOT / str(org_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{uuid4().hex}{suffix}"

    size = 0
    try:
        with target.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise ValueError("文件不能超过 25 MB")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
    return target, original_name, size


def extract_text(path: str | Path, original_name: str) -> str:
    source = Path(path)
    suffix = Path(original_name).suffix.lower()
    if suffix in TEXT_EXTENSIONS:
        raw = source.read_bytes()
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                return raw.decode(encoding)[:MAX_EXTRACTED_CHARS]
            except UnicodeDecodeError:
                continue
        raise ValueError("无法识别文本文件编码")

    if suffix == ".docx":
        with zipfile.ZipFile(source) as archive:
            xml = archive.read("word/document.xml")
        root = ElementTree.fromstring(xml)
        paragraphs: list[str] = []
        for paragraph in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
            text = "".join(
                node.text or ""
                for node in paragraph.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
            ).strip()
            if text:
                paragraphs.append(text)
        return "\n\n".join(paragraphs)[:MAX_EXTRACTED_CHARS]

    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ValueError("服务器尚未安装 PDF 文本提取组件") from exc
        reader = PdfReader(source)
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)[:MAX_EXTRACTED_CHARS]

    raise ValueError("该格式可以存档，但暂不支持 AI 整理；目前支持文本、Markdown、PDF 和 DOCX")


def remove_upload(path: str | None) -> None:
    if not path:
        return
    candidate = Path(path).resolve()
    root = UPLOAD_ROOT.resolve()
    if candidate.is_relative_to(root):
        candidate.unlink(missing_ok=True)
