import unittest

from app.api.knowledge import _should_write_to_vault


class KnowledgeVaultRoutingTests(unittest.TestCase):
    def test_ready_video_can_be_written(self):
        self.assertTrue(
            _should_write_to_vault("https://www.douyin.com/video/123", "ready")
        )

    def test_failed_generation_never_writes_raw_content(self):
        self.assertFalse(
            _should_write_to_vault("https://www.douyin.com/video/123", "error")
        )

    def test_github_repo_stays_in_app_without_tutorial_file(self):
        self.assertFalse(
            _should_write_to_vault("https://github.com/example/project", "ready")
        )


if __name__ == "__main__":
    unittest.main()
