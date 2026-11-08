from copy import deepcopy
from typing import Any


# These are starter structures. Users can edit the generated categories after applying one.
_TEMPLATES: list[dict[str, Any]] = [
    {
        "key": "para",
        "name": "PARA",
        "summary": "按项目、领域、资源和归档组织内容",
        "description": "以当前行动和责任范围为中心，适合项目交付、团队协作和需要快速聚焦的知识库。",
        "suitable_for": "项目经理、自媒体创作者、自由职业者、独立开发者",
        "default_prompt": "请按照 PARA 方法对资料进行分类。优先判断资料是否服务于一个有明确目标和截止时间的项目；如果不是，再判断它是否属于需要长期维护的领域、暂时有用的资源，或已经结束/暂停的归档内容。只返回最匹配的目录和简短理由。",
        "categories": [
            {"name": "Projects 项目", "description": "有明确目标、截止日期和交付物的事项", "children": []},
            {"name": "Areas 领域", "description": "需要长期维护、没有明确结束日期的责任范围", "children": []},
            {"name": "Resources 资源", "description": "当前感兴趣或未来可能有用的资料", "children": []},
            {"name": "Archives 归档", "description": "已结束、暂停或放弃的项目、领域和资源", "children": []},
        ],
    },
    {
        "key": "decimal",
        "name": "十进制编号法",
        "summary": "用稳定的数字区间建立资料坐标",
        "description": "使用 00-09、10-19 等编号区间建立稳定层级，适合资料量大、结构稳定、需要精确定位的场景。",
        "suitable_for": "工程、财务、行政、合同和大量结构化资料管理",
        "default_prompt": "请按照十进制编号法为资料选择稳定的数字坐标。先判断资料所属的大领域区间（00-09、10-19，直到 90-99），再给出建议的子编号和名称。不要为了短期变化频繁修改已有编号；无法确定时返回最接近的区间并说明理由。",
        "categories": [
            {"name": "00-09 通用与待整理", "description": "跨领域通用内容、收件箱和待整理资料", "children": []},
            {"name": "10-19 领域一", "description": "用户可继续细分的第一个业务或生活领域", "children": []},
            {"name": "20-29 领域二", "description": "用户可继续细分的第二个业务或生活领域", "children": []},
            {"name": "30-39 领域三", "description": "用户可继续细分的第三个业务或生活领域", "children": []},
            {"name": "40-49 领域四", "description": "用户可继续细分的第四个业务或生活领域", "children": []},
            {"name": "50-59 领域五", "description": "用户可继续细分的第五个业务或生活领域", "children": []},
            {"name": "60-69 领域六", "description": "用户可继续细分的第六个业务或生活领域", "children": []},
            {"name": "70-79 领域七", "description": "用户可继续细分的第七个业务或生活领域", "children": []},
            {"name": "80-89 领域八", "description": "用户可继续细分的第八个业务或生活领域", "children": []},
            {"name": "90-99 领域九", "description": "用户可继续细分的第九个业务或生活领域", "children": []},
        ],
    },
    {
        "key": "ace",
        "name": "ACE",
        "summary": "分离长期知识、时间记录和行动项目",
        "description": "将长期有效的知识、按时间发生的记录和正在推进的行动分开，形成记录到输出的闭环。",
        "suitable_for": "学者、知识工作者、自媒体创作者和长期学习者",
        "default_prompt": "请按照 ACE 方法分类：Atlas 用于长期有效的知识、概念和思维模型；Calendar 用于日记、会议纪要和按时间发生的记录；Efforts 用于正在推进的项目、任务和交付物。先识别资料的主要使用意图，只返回一个最匹配的目录。",
        "categories": [
            {"name": "Atlas 长期知识", "description": "长期有效的概念、方法、思维模型和内容地图", "children": []},
            {"name": "Calendar 时间记录", "description": "日记、周复盘、会议纪要等按时间发生的记录", "children": []},
            {"name": "Efforts 行动项目", "description": "正在推进的项目、任务和具体交付物", "children": []},
        ],
    },
    {
        "key": "moc",
        "name": "MOC 内容地图",
        "summary": "用主题导航和逻辑关系连接知识",
        "description": "把主题、问题、概念和相关笔记组织成可持续调整的内容地图，适合跨主题学习和复杂信息整合。",
        "suitable_for": "课程研发者、研究者、作者和跨学科知识工作者",
        "default_prompt": "请按照 MOC 内容地图方法分类。判断资料最适合成为哪个主题地图的入口、概念说明、待解决问题、子主题，还是某个主题下的参考笔记。优先保留资料与主题之间的逻辑关系，并给出建议的关联主题。",
        "categories": [
            {"name": "主题地图 MOC", "description": "组织一个主题的导航页和知识入口", "children": []},
            {"name": "概念", "description": "主题中的关键概念和定义", "children": []},
            {"name": "问题", "description": "待研究、待回答或需要进一步拆解的问题", "children": []},
            {"name": "子主题", "description": "可以从主题地图继续展开的内容分支", "children": []},
            {"name": "参考笔记", "description": "支持主题理解的资料和相关笔记", "children": []},
        ],
    },
    {
        "key": "zettelkasten",
        "name": "卡片盒笔记法",
        "summary": "用原子卡片和连接构建思想网络",
        "description": "区分闪念、文献、永久和结构笔记，适合长期研究、写作和理论构建。",
        "suitable_for": "学术研究者、长篇作者和长期理论研究者",
        "default_prompt": "请按照卡片盒笔记法分类。临时灵感归入闪念笔记，外部材料的个人转述归入文献笔记，可长期复用的单一观点归入永久笔记，用于组织一组卡片的导航和大纲归入结构笔记。请指出资料是否需要拆成多个原子观点。",
        "categories": [
            {"name": "闪念笔记", "description": "未经整理的灵感、想法和临时观察", "children": []},
            {"name": "文献笔记", "description": "阅读外部材料后的个人转述和来源记录", "children": []},
            {"name": "永久笔记", "description": "用自己的话表达、可长期复用的单一观点", "children": []},
            {"name": "结构笔记", "description": "对一组卡片进行导航、连接和编排", "children": []},
        ],
    },
    {
        "key": "entity",
        "name": "面向对象实体法",
        "summary": "按实体、属性和关系管理信息",
        "description": "把信息组织为人、项目、书籍、会议等实体，并围绕属性和关系进行检索和自动化。",
        "suitable_for": "产品经理、创业团队、猎头和业务数据管理者",
        "default_prompt": "请按照面向对象实体法识别资料的主要实体类型。优先判断它描述的是人、项目、书籍、会议，还是其他需要长期维护的业务对象；提取可用于检索的属性和与其他实体的关系。只选择一个主要实体类型，并列出关键属性。",
        "categories": [
            {"name": "人", "description": "姓名、联系方式、关系和其他人物信息", "children": []},
            {"name": "项目", "description": "项目名、负责人、截止日期、状态和交付物", "children": []},
            {"name": "书籍与文献", "description": "作者、主题、阅读状态、评分和来源", "children": []},
            {"name": "会议", "description": "时间、参与者、结论和待办事项", "children": []},
            {"name": "其他实体", "description": "无法归入以上类型但需要属性化管理的对象", "children": []},
        ],
    },
    {
        "key": "timeline",
        "name": "时间流记录法",
        "summary": "以时间线作为低阻力的统一入口",
        "description": "先按发生顺序记录，不要求输入时立即完成分类，再通过周期性复盘提炼高价值知识。",
        "suitable_for": "高频记录灵感、会议密集或习惯日记和复盘的人",
        "default_prompt": "请按照时间流记录法处理资料。优先保留发生时间、上下文和事件顺序；判断它属于日常记录、灵感、事实、观点、待办还是周期性复盘内容。不要强行套入过细的主题目录，无法判断时保留在时间流记录中。",
        "categories": [
            {"name": "时间流收件箱", "description": "尚未整理、但需要保留发生时间和上下文的输入", "children": []},
            {"name": "日常记录", "description": "当天发生的事实、观察和活动记录", "children": []},
            {"name": "灵感与观点", "description": "从时间流中捕捉到的想法和思考", "children": []},
            {"name": "待办事项", "description": "需要后续行动、跟进或交付的内容", "children": []},
            {"name": "周期性复盘", "description": "周、月或阶段性回顾和提炼结果", "children": []},
        ],
    },
    {
        "key": "faceted",
        "name": "多维分面组配法",
        "summary": "用多个标签维度替代单一层级",
        "description": "通过类型、主题、状态、来源和格式等维度组合筛选，适合海量素材和跨主题检索。",
        "suitable_for": "视频创作者、设计师、媒体工作者和数字素材管理者",
        "default_prompt": "请按照多维分面组配法为资料提取多个描述维度。至少考虑内容类型、主题、状态、来源和格式；标签要具体、稳定、可复用，避免同义词泛滥。返回建议标签及每个标签所属的维度，不要强行选择唯一的文件夹。",
        "categories": [
            {"name": "内容类型", "description": "教程、案例、观点、参考资料、作品等", "children": []},
            {"name": "主题", "description": "资料涉及的业务、技术或兴趣主题", "children": []},
            {"name": "状态", "description": "待整理、进行中、已完成、已归档等", "children": []},
            {"name": "来源", "description": "个人记录、团队资料、书籍、网页、课程等", "children": []},
            {"name": "格式", "description": "文档、网页、图片、音频、视频和代码等", "children": []},
        ],
    },
    {
        "key": "custom",
        "name": "自定义模板",
        "summary": "自己定义分类提示词和目录结构",
        "description": "不使用预设体系，直接编写适合个人或团队业务的分类提示词，并手工维护目录。",
        "suitable_for": "有明确业务规则、特殊领域或希望完全掌控分类逻辑的用户",
        "default_prompt": "",
        "categories": [],
    },
]


def list_templates() -> list[dict[str, Any]]:
    return deepcopy(_TEMPLATES)


def get_template(key: str) -> dict[str, Any] | None:
    return next((deepcopy(template) for template in _TEMPLATES if template["key"] == key), None)
