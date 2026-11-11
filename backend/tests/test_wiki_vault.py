import tempfile
import unittest
from pathlib import Path

from app.services.wiki_vault import _write_files, render_wiki_page_markdown


class WikiVaultTests(unittest.TestCase):
    def setUp(self):
        self.page = {
            "id": 7,
            "title": "随机森林",
            "slug": "随机森林",
            "page_type": "concept",
            "summary": "集成多棵决策树。",
            "content": "# 随机森林\n\n随机森林通过集成降低方差。",
            "version": 2,
        }

    def test_render_includes_metadata_links_and_evidence(self):
        markdown = render_wiki_page_markdown(
            self.page,
            "机器学习",
            [{
                "source_id": 3,
                "source_title": "课程字幕",
                "source_url": "https://example.com/video",
                "claim_text": "集成可以降低方差",
                "quote": "随机森林集成了多棵树",
                "locator": "第 2 节",
                "verified": True,
            }],
            [{"target_title": "决策树", "target_slug": "决策树", "label": "相关知识"}],
        )
        self.assertIn("growbase_page_id: 7", markdown)
        self.assertIn("[[GrowBase/机器学习/Wiki/决策树|决策树]]", markdown)
        self.assertIn("随机森林集成了多棵树", markdown)

    def test_write_creates_page_and_index(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            files = _write_files(
                temp_dir,
                "机器学习",
                [{"page": self.page, "citations": [], "links": []}],
            )
            expected = Path(temp_dir) / "GrowBase" / "机器学习" / "Wiki" / "随机森林.md"
            self.assertEqual(files, [str(expected)])
            self.assertTrue(expected.is_file())
            self.assertIn("随机森林", (expected.parent / "_索引.md").read_text("utf-8"))

    def test_missing_vault_is_rejected(self):
        with self.assertRaises(FileNotFoundError):
            _write_files("/path/that/does/not/exist", "知识库", [])


if __name__ == "__main__":
    unittest.main()
