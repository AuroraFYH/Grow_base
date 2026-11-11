import unittest
from unittest.mock import AsyncMock, patch

from app.services.content_fetcher import (
    _fetch_video_via_dtk,
    _parse_vtt,
    fetch_video_transcript,
    is_github_url,
    is_video_url,
)
from app.services.knowledge_ai import (
    _missing_tutorial_sections,
    generate_video_tutorial,
    requests_document_organization,
    requests_video_tutorial,
)


class VideoTutorialIntentTests(unittest.TestCase):
    def test_detects_explicit_chinese_request(self):
        self.assertTrue(requests_video_tutorial("把视频内容转换成知识库文档，再整理成文字版教程"))

    def test_does_not_treat_normal_note_as_tutorial_request(self):
        self.assertFalse(requests_video_tutorial("这是我对视频内容的一些补充笔记"))

    def test_video_url_context_allows_short_document_request(self):
        self.assertTrue(requests_video_tutorial("整理成文档", is_video=True))
        self.assertTrue(requests_video_tutorial("转换成知识库文档", is_video=True))

    def test_short_request_without_video_context_stays_false(self):
        self.assertFalse(requests_video_tutorial("整理成文档"))

    def test_explicit_document_request_applies_to_normal_sources(self):
        self.assertTrue(requests_document_organization("把这篇博客整理成知识库文档"))
        self.assertTrue(requests_document_organization("转换成文章"))
        self.assertFalse(requests_document_organization("只打标签并归类"))

    def test_recognizes_supported_video_urls(self):
        self.assertTrue(is_video_url("https://www.bilibili.com/video/BV123"))
        self.assertTrue(is_video_url("https://youtu.be/abcdefghijk"))
        self.assertFalse(is_video_url("https://example.com/article"))

    def test_github_is_code_source_not_video(self):
        url = "https://github.com/CosmosMount/rmuc2027_mjarena"
        self.assertTrue(is_github_url(url))
        self.assertFalse(is_video_url(url))

    def test_vtt_parser_removes_timestamps_and_duplicate_lines(self):
        raw = """WEBVTT

00:00:00.000 --> 00:00:01.000
第一句

00:00:01.000 --> 00:00:02.000
第一句
第二句
"""
        self.assertEqual(_parse_vtt(raw), "第一句 第二句")


class VideoTranscriptRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_dtk_skips_archived_task_when_download_is_already_done(self):
        class Response:
            def __init__(self, payload):
                self.payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self.payload

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def post(self, path, **kwargs):
                if path == "/api/v1/downloads":
                    return Response({
                        "success": True,
                        "data": {"download_id": "download-1", "task_id": "archived-task", "state": "done"},
                    })
                return Response({
                    "success": True,
                    "data": {"transcription_id": "transcription-1", "state": "done", "title": "随机森林", "text": "字幕内容"},
                })

            async def get(self, path):
                raise AssertionError(f"completed download should not poll {path}")

        with (
            patch("app.services.content_fetcher._dtk_config", return_value=("http://dtk", "secret")),
            patch("app.services.content_fetcher.httpx.AsyncClient", return_value=Client()),
        ):
            result = await _fetch_video_via_dtk("https://www.douyin.com/video/7704656654873493113", "douyin")

        self.assertEqual(result, ("随机森林", "字幕内容"))

    async def test_dtk_platform_uses_dtk_when_configured(self):
        expected = ("标题", "字幕")
        with (
            patch("app.services.content_fetcher._dtk_config", return_value=("http://dtk", "secret")),
            patch(
                "app.services.content_fetcher._fetch_video_via_dtk",
                new=AsyncMock(return_value=expected),
            ) as dtk,
        ):
            result = await fetch_video_transcript("https://www.bilibili.com/video/BV123")

        self.assertEqual(result, expected)
        dtk.assert_awaited_once_with("https://www.bilibili.com/video/BV123", "bilibili")

    async def test_youtube_passes_cookies_to_ytdlp_whisper_pipeline(self):
        expected = ("标题", "字幕")
        with patch(
            "app.services.content_fetcher._fetch_video_ytdlp",
            new=AsyncMock(return_value=expected),
        ) as ytdlp:
            result = await fetch_video_transcript(
                "https://youtu.be/abcdefghijk",
                cookies_file="/tmp/cookies.txt",
            )

        self.assertEqual(result, expected)
        ytdlp.assert_awaited_once_with(
            "https://youtu.be/abcdefghijk",
            cookies_file="/tmp/cookies.txt",
        )

    async def test_dtk_failure_falls_back_to_ytdlp_with_cookies(self):
        with (
            patch("app.services.content_fetcher._dtk_config", return_value=("http://dtk", "secret")),
            patch(
                "app.services.content_fetcher._fetch_video_via_dtk",
                new=AsyncMock(side_effect=RuntimeError("unsupported DTK endpoint")),
            ),
            patch(
                "app.services.content_fetcher._fetch_video_ytdlp",
                new=AsyncMock(return_value=("标题", "字幕")),
            ) as ytdlp,
        ):
            result = await fetch_video_transcript(
                "https://www.douyin.com/video/756360762224342",
                cookies_file="/tmp/douyin-cookies.txt",
            )

        self.assertEqual(result, ("标题", "字幕"))
        ytdlp.assert_awaited_once_with(
            "https://www.douyin.com/video/756360762224342",
            cookies_file="/tmp/douyin-cookies.txt",
        )


class TutorialGenerationTests(unittest.IsolatedAsyncioTestCase):
    def test_quality_check_accepts_numbered_equivalent_headings(self):
        tutorial = """## 一、内容概览
## 二、问题背景
## 三、核心原理与工作机制
## 四、实践示例
## 五、总结与核心要点
## 六、自测与思考题
## 可复用知识节点
### [[概念一]]
定义。
### [[概念二]]
定义。"""
        self.assertEqual(_missing_tutorial_sections(tutorial), [])

    def test_quality_check_rejects_outline_without_substantive_tutorial(self):
        tutorial = """## 内容概览
概览。
## 要点回顾
回顾。
## 自测题
问题？
## 可复用知识节点
### [[概念一]]
定义。
### [[概念二]]
定义。"""
        self.assertIn("正文教程（至少 3 个实质章节）", _missing_tutorial_sections(tutorial))

    def test_quality_check_requires_two_to_five_reusable_nodes(self):
        tutorial = """## 内容概览
## 1. 背景
## 2. 原理
## 3. 实践
## 要点回顾
## 自测题
## 可复用知识节点
### [[唯一概念]]
定义。"""
        self.assertIn("2–5 个可复用知识节点", _missing_tutorial_sections(tutorial))

    async def test_requires_llm_instead_of_saving_cleaned_transcript(self):
        with self.assertRaisesRegex(ValueError, "需要先在设置中配置"):
            await generate_video_tutorial(
                title="示例课程",
                transcript="第一步安装工具。第二步运行命令。",
                source_url="https://youtu.be/abcdefghijk",
                user_instructions=None,
                api_key=None,
                base_url=None,
                model_name=None,
            )

    async def test_strips_markdown_fence_from_llm_result(self):
        tutorial = """# 教程

## 内容概览
概览。

## 正文教程
{body}

## 可复用知识节点
### [[核心概念]]
独立定义。
### [[相关概念]]
另一条独立定义。

## 要点回顾
回顾。

## 自测题
问题？
""".format(body="教程正文。" * 180).strip()
        with patch(
            "app.services.knowledge_ai.chat_completion",
            new=AsyncMock(return_value=f"```markdown\n{tutorial}\n```"),
        ):
            result = await generate_video_tutorial(
                title="示例课程",
                transcript="字幕内容",
                source_url=None,
                user_instructions="整理成教程",
                api_key="key",
                base_url=None,
                model_name="model",
            )

        self.assertEqual(result, tutorial)

    async def test_surfaces_llm_failure_instead_of_saving_raw_transcript(self):
        with patch(
            "app.services.knowledge_ai.chat_completion",
            new=AsyncMock(side_effect=RuntimeError("provider unavailable")),
        ):
            with self.assertRaisesRegex(ValueError, "AI 教程生成失败"):
                await generate_video_tutorial(
                    title="示例课程",
                    transcript="这里是字幕内容。",
                    source_url=None,
                    user_instructions="整理成教程",
                    api_key="key",
                    base_url=None,
                    model_name="model",
                )


if __name__ == "__main__":
    unittest.main()
