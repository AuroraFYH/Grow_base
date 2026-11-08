import tempfile
import unittest
from pathlib import Path

from app.services.vault_writer import (
    _fallback_structure_from_markdown,
    _infer_branch_from_content,
    _resolve_wikilinks,
    render_node_md,
    render_video_note_md,
    update_index_md,
    update_overview_md,
)


class VaultWriterTests(unittest.TestCase):
    def test_resolves_concept_links_to_actual_node_filenames(self):
        result = _resolve_wikilinks(
            "使用[[Dropout（随机失活）]]缓解[[过拟合]]。",
            {
                "T7": "T7 Dropout（随机失活）",
                "T6": "T6 泛化与过拟合",
            },
        )

        self.assertEqual(
            result,
            "使用[[T7 Dropout（随机失活）|Dropout（随机失活）]]缓解[[T6 泛化与过拟合|过拟合]]。",
        )

    def test_structured_tutorial_is_parsed_without_second_llm_call(self):
        content = """# 理解 Dropout

## 内容概览
Dropout 用于缓解[[过拟合]]。

## 可复用知识节点

### [[Dropout（随机失活）]]
训练时随机屏蔽部分激活值。

### [[Inverted Dropout]]
缩放保留的激活值以维持期望。
"""
        structure = _fallback_structure_from_markdown(
            content,
            "原始标题",
            "摘要",
            "从数据到参数",
            [{"id": "T6", "name": "泛化与过拟合"}],
        )

        self.assertEqual(structure["video_title"], "理解 Dropout")
        self.assertEqual([node["id"] for node in structure["nodes"]], ["T7", "T8"])
        self.assertTrue(structure["_parsed_from_tutorial"])

    def test_node_summary_does_not_split_decimal_number(self):
        content = """# OOB

## 可复用知识节点

### [[袋外样本]]
袋外样本平均约占 36.8%，可用于内部评估。下一句说明。

### [[Bagging]]
Bagging 聚合多个模型。
"""
        structure = _fallback_structure_from_markdown(
            content,
            "原始标题",
            "摘要",
            "机器学习基础",
            [],
        )

        self.assertEqual(
            structure["nodes"][0]["作用"],
            "袋外样本平均约占 36.8%，可用于内部评估。",
        )

    def test_branch_is_inferred_from_existing_wikilink(self):
        branch = _infer_branch_from_content(
            "Dropout 可以缓解[[过拟合]]。",
            [{
                "title": "T6 泛化与过拟合",
                "rel_path": "知识节点/从数据到参数/T6 泛化与过拟合",
            }],
            "文献笔记",
        )

        self.assertEqual(branch, "从数据到参数")

    def test_index_recognizes_multi_letter_node_prefix(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            index = Path(tmpdir) / "_索引.md"
            index.write_text(
                "# 深度学习基础\n\n## 节点\n"
                "- [[知识节点/深度学习基础/DL1 Dropout|DL1 Dropout]] — 已有节点\n",
                "utf-8",
            )
            update_index_md(
                index,
                "深度学习基础",
                [
                    {"id": "DL1", "name": "Dropout", "作用": "不应重复"},
                    {"id": "DL2", "name": "协同适应", "作用": "新增节点"},
                ],
            )
            result = index.read_text("utf-8")

        self.assertEqual(result.count("DL1 Dropout"), 2)
        self.assertIn("DL2 协同适应", result)

    def test_video_note_links_to_full_node_filename(self):
        markdown = render_video_note_md(
            structure={
                "video_title": "理解 Dropout",
                "branch": "神经网络积木",
                "nodes": [],
                "video_sections": [],
            },
            source_url="https://example.com/video",
            source_id="video-1",
            date_str="2026-11-08",
            nodes=[{"id": "N6", "name": "Dropout 随机失活"}],
        )

        self.assertIn(
            "[[知识节点/神经网络积木/N6 Dropout 随机失活|N6 Dropout 随机失活]]",
            markdown,
        )

    def test_node_dependency_uses_resolvable_wikilink(self):
        markdown = render_node_md(
            node={"id": "N6", "name": "Dropout", "依赖": ["T6"]},
            branch="神经网络积木",
            source_id="video-1",
            date_str="2026-11-08",
            video_title="理解 Dropout",
            video_note_rel="视频笔记/神经网络积木/2026-11-08-理解 Dropout",
            external_links=[],
            node_titles={"T6": "T6 泛化与过拟合"},
        )

        self.assertIn("[[T6 泛化与过拟合|T6]]", markdown)

    def test_overview_adds_branch_note_and_updates_count(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            overview = root / "00 总览.md"
            overview.write_text(
                "# Fei 工程与人工智能知识树\n\n节点总数：0\n\n## 内容分支\n\n## 视频笔记\n",
                "utf-8",
            )
            node_dir = root / "知识节点" / "神经网络积木"
            node_dir.mkdir(parents=True)
            (node_dir / "N6 Dropout.md").write_text("# N6", "utf-8")
            note = root / "视频笔记" / "神经网络积木" / "2026-11-08-理解Dropout.md"
            note.parent.mkdir(parents=True)
            note.write_text("# 理解 Dropout", "utf-8")

            update_overview_md(root, "神经网络积木", note)
            result = overview.read_text("utf-8")

        self.assertIn("节点总数：1", result)
        self.assertIn("知识节点/神经网络积木/_索引", result)
        self.assertIn("视频笔记/神经网络积木/2026-11-08-理解Dropout", result)
