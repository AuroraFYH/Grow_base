import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from unittest.mock import AsyncMock

from fastapi import UploadFile

from app.services.file_storage import clean_filename, extract_text, save_upload
from app.services.knowledge_ai import organize_uploaded_document


class FileStorageTests(unittest.TestCase):
    def test_clean_filename_removes_path_traversal(self):
        self.assertEqual(clean_filename("../../private/notes.md"), "notes.md")
        self.assertEqual(clean_filename(r"..\..\private\notes.md"), "notes.md")

    def test_extracts_utf8_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stored.txt"
            path.write_text("第一章\n这是一份测试笔记。", encoding="utf-8")
            self.assertIn("测试笔记", extract_text(path, "笔记.txt"))

    def test_rejects_oversized_upload_and_removes_partial_file(self):
        upload = UploadFile(filename="large.txt", file=io.BytesIO(b"12345"))
        with tempfile.TemporaryDirectory() as directory:
            with (
                patch("app.services.file_storage.UPLOAD_ROOT", Path(directory)),
                patch("app.services.file_storage.MAX_FILE_SIZE", 4),
            ):
                with self.assertRaisesRegex(ValueError, "25 MB"):
                    asyncio.run(save_upload(upload, 7))
                self.assertEqual(list(Path(directory).rglob("*.txt")), [])

    def test_unsupported_binary_is_archivable_but_not_extractable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stored.bin"
            path.write_bytes(b"\x00\x01\x02")
            with self.assertRaisesRegex(ValueError, "可以存档"):
                extract_text(path, "archive.bin")


class FileOrganizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_file_organization_requires_configured_ai(self):
        with self.assertRaisesRegex(ValueError, "配置可用的 AI 模型"):
            await organize_uploaded_document("笔记", "足够的原始文字", None, None, None, None)

    async def test_file_organization_uses_user_instructions(self):
        organized = "# 教程\n\n" + "结构化正文" * 80
        mocked = AsyncMock(return_value=f"```markdown\n{organized}\n```")
        with patch("app.services.knowledge_ai.chat_completion", mocked):
            result = await organize_uploaded_document(
                "课程资料",
                "原始内容" * 100,
                "整理成面向初学者的教程",
                "test-key",
                None,
                "test-model",
            )
        self.assertTrue(result.startswith("# 教程"))
        prompt = mocked.await_args.kwargs["messages"][1]["content"]
        self.assertIn("整理成面向初学者的教程", prompt)


if __name__ == "__main__":
    unittest.main()
