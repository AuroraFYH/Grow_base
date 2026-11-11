# GrowBase

GrowBase 是一个面向个人和小型团队的 AI 知识库系统。它把网页、GitHub 项目、视频、文档和手动笔记集中到知识库中，再根据用户的要求完成分类、摘要、教程整理、Wiki 沉淀和 AI 问答。

GrowBase 的重点不是“把链接收藏起来”，而是让资料逐步变成可以复用的知识：

- 个人可以建立多个知识库，按目录管理自己的学习和工作资料；
- 团队可以通过邀请码加入知识库，由创建者和管理员维护成员、权限和正式 Wiki；
- 链接和文件保留原始来源，AI 只在用户明确要求时整理成教程或知识文档；
- 视频可以通过 DTK 或 `yt-dlp + Whisper` 提取字幕，再生成结构化教程；
- GitHub 默认作为代码来源保存，不会无意义地把代码项目改写成教程；
- Wiki 经过提案和审核后发布，并可同步到用户自己的 Obsidian Vault；
- 可接入 n8n 等外部工作流，定时收集新闻、文章和社交媒体内容，并发送到飞书。

## 项目意义

很多资料收藏工具只能解决“保存”，不能解决“理解、归纳和复用”。GrowBase 将资料箱、团队协作和知识编译放在同一个工作流中：原始资料可以追溯，AI 负责降低整理成本，管理员负责控制正式知识的质量。它适合学习小组、研发团队、个人研究和长期内容积累等场景。

## 功能概览

### 知识采集

- 添加网页、CSDN、新闻、GitHub 仓库等链接；
- 上传 Markdown、文本、PDF、DOCX 及常见代码/配置文件；
- 保存原始链接、上传者、处理状态和来源信息；
- 普通文件默认只存档，只有用户明确要求时才进行 AI 整理。

### AI 整理

- 自动提取标题、摘要、标签和分类建议；
- 按用户指令把文章或文件整理成知识文档；
- 将视频字幕整理成有目录、概念解释、步骤和复习要点的教程；
- 低置信度结果保留在资料箱中，不会直接覆盖正式知识。

### 团队知识库

- 注册、登录和多知识库切换；
- 创建者生成邀请码，成员输入邀请码加入；
- `owner`、`admin`、`member` 三种角色；
- 管理成员、管理员和普通成员的添加/删除/AI 使用权限；
- 知识库创建者可以永久删除知识库及其数据库资料。

### Wiki 与本地知识库

- 从资料生成 Wiki 提案；
- 管理员审核、修改和发布提案；
- 保留页面版本、来源引用和页面关系；
- 发布后可同步到用户配置的 Obsidian Vault；
- Vault 中已有的个人 Markdown 不会被删除。

### 自动简讯

- 设置关注话题、来源和发送频率；
- 通过 Webhook 调用 n8n 等信息聚合工作流；
- 将工作流返回的简讯写入知识库，并可发送到飞书机器人。

## 技术栈

- 前端：React 19、TypeScript、Vite、Ant Design、Three.js、Zustand；
- 后端：Python 3.10+、FastAPI、SQLAlchemy 2、Pydantic；
- 数据库：默认 SQLite，也支持 PostgreSQL；
- 内容处理：`readability-lxml`、`pypdf`、`yt-dlp`、`faster-whisper`；
- AI：OpenAI 兼容的 Chat Completions 接口，可使用 OpenAI 或其他兼容服务；
- 外部工作流：n8n Webhook、飞书机器人 Webhook；
- 本地知识库出口：Obsidian Vault。

## 环境要求

- Python 3.10 或更高版本；
- Node.js 18 或更高版本，建议使用当前 LTS；
- npm；
- Git；
- 如果需要视频转教程，建议准备 FFmpeg，并配置 DTK 或本地 Whisper 环境；
- 如果使用 PostgreSQL，准备 Docker 和 Docker Compose。

## 快速开始

### 1. 获取代码

```bash
git clone https://github.com/AuroraFYH/Grow_base.git
cd Grow_base
```

### 2. 配置后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

编辑 `backend/.env`，至少设置一个随机的 `SECRET_KEY`：

```dotenv
DATABASE_URL=sqlite+aiosqlite:///./growbase.db
SECRET_KEY=请替换为长度足够且随机的字符串
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# 可选：视频平台内容提取服务
DTK_BASE_URL=http://localhost:9000
DTK_API_KEY=
```

开发环境使用 SQLite 时，数据库会自动创建为 `backend/growbase.db`。数据库表也会在后端启动时自动初始化。

### 3. 启动后端

在 `backend` 目录中执行：

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端地址：<http://127.0.0.1:8000><br>
接口文档：<http://127.0.0.1:8000/docs><br>
健康检查：<http://127.0.0.1:8000/health>

### 4. 安装并启动前端

新开一个终端：

```bash
cd Grow_base/frontend
npm install
cp .env.example .env.local
npm run dev
```

默认前端地址：<http://127.0.0.1:5173>。如果 5173 已被占用，Vite 会自动使用其他端口，终端会显示实际地址。

前端环境变量示例：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

打开前端地址后，先注册账号，再创建或加入知识库。

## 可选配置

### AI 模型

AI 密钥不是写在仓库配置里的，而是在登录后进入“设置”页面配置：

1. 选择 OpenAI 或其他 OpenAI 兼容服务；
2. 填写 API Key、Base URL 和模型名称；
3. 如需写入 Obsidian，填写本机 Vault 的绝对路径；
4. 保存后再提交需要 AI 整理的资料。

API Key 会在后端加密保存，不要把真实密钥提交到 Git。

### 视频转教程

视频处理优先尝试 DTK。配置 `DTK_BASE_URL` 和 `DTK_API_KEY` 后，系统会调用对应平台的提取接口；DTK 不可用时，部分平台可以回退到 `yt-dlp + faster-whisper`。不同平台可能受登录态、地区限制、视频删除和版权策略影响。

### PostgreSQL

项目根目录提供了 PostgreSQL/pgvector 的 Docker Compose 配置：

```bash
docker compose up -d db
```

然后把 `backend/.env` 中的 `DATABASE_URL` 改为 PostgreSQL 地址，例如 `postgresql+asyncpg://growbase:growbase123@127.0.0.1:5432/growbase`。项目依赖中已包含 `asyncpg`。SQLite 是默认的本地开发方案。

### n8n 与飞书

根目录的 `n8n-GrowBase信息聚合器-v1.json` 是一个可导入 n8n 的示例工作流。导入后需要在 n8n 中重新配置凭据、外部数据源和模型节点，并把 Webhook URL 填入 GrowBase 的“自动简讯与知识库自生长”设置。

工作流应接收 GrowBase 发送的订阅信息，并返回以下任一种 JSON：

```json
{"title":"AI 行业简讯","content":"Markdown 内容"}
```

或：

```json
{"title":"AI 行业简讯","items":[{"title":"标题","summary":"摘要","url":"https://example.com"}]}
```

飞书机器人 Webhook 只应配置在本地数据库或部署环境中，不要提交到工作流 JSON 或 Git。

## 常用命令

```bash
# 后端开发模式
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 前端开发模式
cd frontend
npm run dev

# 前端生产构建
npm run build

# 前端静态预览
npm run preview

# 后端单元测试（不依赖 pytest）
cd backend
python -m unittest discover -s tests -p 'test_*.py'
```

## 项目结构

```text
Grow_base/
├── backend/
│   ├── app/
│   │   ├── api/          # 认证、组织、知识、Wiki、订阅等 API
│   │   ├── models/       # SQLAlchemy 数据模型
│   │   ├── schemas/      # Pydantic 请求/响应模型
│   │   ├── services/     # 内容抓取、AI、文件、Vault、简讯服务
│   │   └── core/         # 配置、数据库和认证安全
│   ├── tests/            # 后端单元测试
│   ├── .env.example      # 后端配置模板
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/          # API 客户端
│   │   ├── components/   # 可复用组件
│   │   └── pages/        # 页面
│   ├── public/           # favicon、图标和主题资源
│   ├── .env.example      # 前端配置模板
│   └── package.json
├── n8n-GrowBase信息聚合器-v1.json
├── docker-compose.yml
└── LICENSE
```

## 安全与部署提醒

- 不要提交 `.env`、API Key、JWT Secret、数据库文件、上传文件或个人 Vault 内容；
- 公开仓库前请重新生成 `SECRET_KEY`，并轮换曾经在本地提交或分享过的第三方密钥；
- 默认 SQLite 适合个人开发，不适合多进程或高并发生产部署；
- 生产环境应使用 HTTPS、强密码、独立数据库和受限的上传目录；
- 定时简讯调度器在后端进程内运行，多进程部署时应确保只有一个调度实例；
- 本项目的 AI 输出需要人工核对，尤其是教程、引用和 Wiki 发布内容。

## 许可证

本项目使用 [MIT License](LICENSE)。
