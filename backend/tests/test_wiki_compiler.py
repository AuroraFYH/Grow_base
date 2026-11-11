import unittest

from app.models.wiki import WikiPage
from app.services.llm_client import extract_json
from app.services.wiki_compiler import normalize_change_set, slugify_title


class WikiCompilerTests(unittest.TestCase):
    def test_extract_json_ignores_markdown_fence_and_trailing_text(self):
        response = '```json\n{"summary":"更新知识","pages":[],"conflicts":[]}\n```\n以上是结果。'
        self.assertEqual(extract_json(response, expected_keys={"summary", "pages"})["summary"], "更新知识")

    def test_slug_keeps_chinese_title_readable(self):
        self.assertEqual(slugify_title("Agent Memory 基础"), "agent-memory-基础")

    def test_exact_source_quote_is_verified(self):
        source = "长期记忆需要明确的数据生命周期，而不只是向量检索。"
        result = normalize_change_set(
            {
                "summary": "补充记忆设计原则",
                "pages": [{
                    "action": "create",
                    "page_id": None,
                    "title": "Agent Memory",
                    "page_type": "concept",
                    "content": "# Agent Memory\n\n长期记忆需要生命周期管理，而不是只依赖检索。" * 3,
                    "citations": [{
                        "claim": "长期记忆需要生命周期管理",
                        "quote": "长期记忆需要明确的数据生命周期",
                        "locator": "第一段",
                    }],
                    "links": [],
                }],
            },
            source,
            {},
        )
        self.assertTrue(result["pages"][0]["citations"][0]["verified"])
        self.assertEqual(result["validation"]["unverified_citation_count"], 0)

    def test_paraphrased_quote_is_flagged_for_review(self):
        result = normalize_change_set(
            {
                "pages": [{
                    "action": "create",
                    "title": "检索增强生成",
                    "content": "# 检索增强生成\n\n这是一段足够长的页面正文，用于说明知识编译和查询时检索之间的差异。" * 3,
                    "citations": [{"quote": "原文中并不存在的改写"}],
                }],
            },
            "这是唯一的原始资料内容。",
            {},
        )
        self.assertEqual(result["validation"]["unverified_citation_count"], 1)

    def test_update_cannot_target_page_outside_current_wiki(self):
        known = WikiPage(id=2, organization_id=1, title="已知页面", slug="known", content="正文", created_by=1, updated_by=1)
        result = normalize_change_set(
            {
                "pages": [{
                    "action": "update",
                    "page_id": 99,
                    "title": "越权页面",
                    "content": "不应该被接受的页面正文。" * 10,
                }],
            },
            "来源",
            {known.id: known},
        )
        self.assertEqual(result["pages"], [])

    def test_update_keeps_previous_content_for_review_diff(self):
        known = WikiPage(id=2, organization_id=1, title="记忆", slug="memory", content="旧版本正文", created_by=1, updated_by=1)
        result = normalize_change_set(
            {
                "pages": [{
                    "action": "update",
                    "page_id": 2,
                    "title": "记忆",
                    "content": "# 记忆\n\n这是加入新来源之后形成的完整页面正文，用于让管理员在发布之前比较新旧内容。" * 3,
                }],
            },
            "来源资料",
            {known.id: known},
        )
        self.assertEqual(result["pages"][0]["previous_content"], "旧版本正文")


if __name__ == "__main__":
    unittest.main()
