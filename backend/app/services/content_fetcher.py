"""Content fetcher: extracts text from URLs (web pages, GitHub repos, YouTube/Bilibili videos)."""
from __future__ import annotations

import re
import os
from urllib.parse import urlparse

import httpx


def _dtk_config() -> tuple[str, str]:
    try:
        from app.core.config import settings
        return settings.DTK_BASE_URL, settings.DTK_API_KEY
    except Exception:
        return os.environ.get("DTK_BASE_URL", "http://localhost:8000"), os.environ.get("DTK_API_KEY", "")

_DTK_PLATFORMS = {
    "douyin.com": "douyin",
    "iesdouyin.com": "douyin",
    "v.douyin.com": "douyin",
    "tiktok.com": "tiktok",
    "vm.tiktok.com": "tiktok",
    "vt.tiktok.com": "tiktok",
    "bilibili.com": "bilibili",
    "b23.tv": "bilibili",
}


def _dtk_platform(host: str) -> str | None:
    for domain, platform in _DTK_PLATFORMS.items():
        if domain in host:
            return platform
    return None


def is_video_url(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return bool(_dtk_platform(host) or "youtube.com" in host or "youtu.be" in host)


def is_github_url(url: str) -> bool:
    """Return whether a URL points to GitHub code or repository content."""
    host = urlparse(url).netloc.lower().split(":", 1)[0]
    return host == "github.com" or host.endswith(".github.com")


async def fetch_video_transcript(
    url: str,
    cookies_file: str | None = None,
) -> tuple[str, str]:
    """Return a video title and transcript using DTK or yt-dlp + Whisper."""
    host = urlparse(url).netloc.lower()
    platform = _dtk_platform(host)
    if platform:
        _, dtk_api_key = _dtk_config()
        if dtk_api_key:
            try:
                return await _fetch_video_via_dtk(url, platform)
            except Exception as dtk_error:
                # A definitive DTK result (missing/deleted content or an
                # unavailable platform identity) should not be hidden by a
                # second, usually less informative yt-dlp error.
                if any(marker in str(dtk_error) for marker in ("找不到这个", "需要可用的")):
                    raise
                # DTK deployments can expose different endpoint generations or
                # lack an identity for a platform. Keep the local yt-dlp +
                # Whisper path available instead of stopping at a DTK 404.
                try:
                    return await _fetch_video_ytdlp(url, cookies_file=cookies_file)
                except Exception as fallback_error:
                    raise ValueError(
                        f"DTK 提取失败：{dtk_error}；备用 yt-dlp/Whisper 也失败：{fallback_error}"
                    ) from fallback_error
    if is_video_url(url):
        return await _fetch_video_ytdlp(url, cookies_file=cookies_file)
    raise ValueError("该链接不是当前支持的视频平台")


async def fetch_content(url: str) -> tuple[str, str]:
    """Returns (title, text_content). Raises ValueError if extraction fails."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if is_github_url(url):
        return await _fetch_github(url)

    platform = _dtk_platform(host)
    if platform:
        _, dtk_api_key = _dtk_config()
        if dtk_api_key:
            return await _fetch_video_via_dtk(url, platform)
        return await _fetch_video_ytdlp(url)

    if "youtube.com" in host or "youtu.be" in host:
        return await _fetch_video_ytdlp(url)

    return await _fetch_webpage(url)


async def _fetch_webpage(url: str) -> tuple[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; GrowBase/1.0; +https://github.com/growbase)",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "html" not in content_type:
            raise ValueError(f"不支持的内容类型：{content_type}")
        html = resp.text

    try:
        from readability import Document
        doc = Document(html)
        title = doc.title() or ""
        import html as html_lib
        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.parts: list[str] = []
                self._skip = False
            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style"):
                    self._skip = True
            def handle_endtag(self, tag):
                if tag in ("script", "style"):
                    self._skip = False
            def handle_data(self, data):
                if not self._skip:
                    stripped = data.strip()
                    if stripped:
                        self.parts.append(stripped)

        extractor = _TextExtractor()
        extractor.feed(doc.summary())
        text = " ".join(extractor.parts)
        text = re.sub(r"\s+", " ", text).strip()
    except ImportError:
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else ""

    if not text:
        raise ValueError("无法从该网页提取文字内容")
    return title, text[:15000]


async def _fetch_github(url: str) -> tuple[str, str]:
    match = re.match(r"https?://github\.com/([^/]+)/([^/?#]+)", url)
    if not match:
        return await _fetch_webpage(url)

    owner, repo = match.group(1), match.group(2).rstrip(".git")
    api_url = f"https://api.github.com/repos/{owner}/{repo}/readme"
    headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "GrowBase/1.0"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(api_url, headers=headers)
        if resp.status_code == 404:
            raise ValueError("该 GitHub 仓库不存在或没有 README")
        resp.raise_for_status()
        readme_text = resp.text

    text = re.sub(r"```[\s\S]*?```", "", readme_text)
    text = re.sub(r"`[^`]+`", "", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"#+\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    title = f"{owner}/{repo}"
    return title, text[:15000]


async def _fetch_video_via_dtk(url: str, platform: str) -> tuple[str, str]:
    """Download + transcribe via the DTK v5 unified API."""
    dtk_base_url, dtk_api_key = _dtk_config()
    headers = {"X-API-Key": dtk_api_key}

    def unwrap(body: dict, action: str) -> dict:
        if body.get("success"):
            return body.get("data") or {}
        error = body.get("error") or {}
        code = error.get("code") or "UNKNOWN"
        detail = error.get("details") or {}
        message = error.get("message") or "未知错误"
        if code == "NOT_FOUND":
            content_id = detail.get("content_id") or url
            raise ValueError(f"DTK 找不到这个 {platform} 视频（作品 ID：{content_id}），请检查链接是否完整或视频是否已删除/设为不可见")
        if code in {"IDENTITY_POOL_EXHAUSTED", "UPSTREAM_RISK_CONTROL", "LOGIN_REQUIRED"}:
            raise ValueError(f"DTK {action}需要可用的 {platform} 登录身份或 cookies：{message}")
        raise ValueError(f"DTK {action}失败 [{code}]：{message}")

    import asyncio
    async with httpx.AsyncClient(base_url=dtk_base_url, headers=headers, timeout=30) as client:
        download_response = await client.post(
            "/api/v1/downloads",
            json={"url": url, "skip_existing": True},
        )
        download_response.raise_for_status()
        download = unwrap(download_response.json(), "下载")
        download_id = download.get("download_id")
        task_id = download.get("task_id")
        if not download_id:
            raise ValueError("DTK 下载响应缺少 download_id")

        # A download is asynchronous in DTK v5. Poll its task until media is
        # available; task failures contain stable error codes in the envelope.
        # DTK removes/archives completed tasks, so a response with state=done
        # must not be followed by a GET /tasks/{task_id} (which then returns
        # 404 even though the media is available).
        state = download.get("state") or ""
        if state != "done":
            for _ in range(60):
                if task_id:
                    task_response = await client.get(f"/api/v1/tasks/{task_id}")
                    task_response.raise_for_status()
                    task = unwrap(task_response.json(), "下载任务")
                    state = task.get("state") or ""
                    if state == "done":
                        break
                    if state in {"failed", "cancelled"}:
                        unwrap({"success": False, "error": task.get("error") or {}}, "下载")
                else:
                    detail_response = await client.get(f"/api/v1/downloads/{download_id}")
                    detail_response.raise_for_status()
                    state = (detail_response.json().get("data") or {}).get("state") or ""
                    if state == "done":
                        break
                    if state in {"failed", "cancelled", "partial"}:
                        raise ValueError(f"DTK 下载失败，状态：{state}")
                await asyncio.sleep(2)
            else:
                raise ValueError("DTK 下载超时（超过 120 秒）")

        transcription_response = await client.post(
            "/api/v1/transcriptions?wait=30",
            json={"download_id": download_id, "normalize": True},
        )
        transcription_response.raise_for_status()
        transcription = unwrap(transcription_response.json(), "转写")
        transcription_id = transcription.get("transcription_id")
        task_id = transcription.get("task_id")
        if transcription.get("state") == "done" and transcription.get("text"):
            return transcription.get("title") or url, transcription["text"][:15000]

        for _ in range(60):
            if task_id:
                task_response = await client.get(f"/api/v1/tasks/{task_id}")
                task_response.raise_for_status()
                task = unwrap(task_response.json(), "转写任务")
                state = task.get("state")
                result = task.get("data") or {}
                if state == "done":
                    text = result.get("text") or transcription.get("text") or ""
                    if not text:
                        raise ValueError("DTK 转写完成但文本为空")
                    return result.get("title") or transcription.get("title") or url, text[:15000]
                if state in {"failed", "cancelled"}:
                    unwrap({"success": False, "error": task.get("error") or {}}, "转写")
            elif transcription_id:
                detail_response = await client.get(f"/api/v1/transcriptions/{transcription_id}")
                detail_response.raise_for_status()
                result = unwrap(detail_response.json(), "转写")
                state = result.get("state")
                if state == "done":
                    text = result.get("text") or ""
                    if not text:
                        raise ValueError("DTK 转写完成但文本为空")
                    return result.get("title") or url, text[:15000]
                if state in {"failed", "cancelled"}:
                    raise ValueError(f"DTK 转写失败，状态：{state}")
            await asyncio.sleep(5)

    raise ValueError("DTK 转写超时（超过 5 分钟）")


async def _fetch_video_ytdlp(
    url: str,
    cookies_file: str | None = None,
) -> tuple[str, str]:
    """Fallback: use yt-dlp for YouTube and other platforms not supported by DTK."""
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        title, text = await asyncio.wait_for(
            loop.run_in_executor(None, _fetch_video_ytdlp_sync, url, cookies_file),
            timeout=600,
        )
    except asyncio.TimeoutError:
        raise ValueError("视频处理超时（超过 10 分钟），请检查链接或 cookies 配置")
    return title, text


def _fetch_video_ytdlp_sync(url: str, cookies_file: str | None = None) -> tuple[str, str]:
    import yt_dlp
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        subtitle_text = _try_download_subtitles(url, tmpdir, cookies_file)
        if subtitle_text:
            title = _get_video_title(url, cookies_file)
            return title, subtitle_text[:15000]

        audio_path = _download_audio(url, tmpdir, cookies_file)
        if not audio_path:
            raise ValueError("无法下载视频音频，请检查链接是否有效")

        transcript = _transcribe_audio(audio_path)
        if not transcript.strip():
            raise ValueError("Whisper 转写完成但字幕为空")
        title = _get_video_title(url, cookies_file)
        return title, transcript[:15000]


def _cookie_options(cookies_file: str | None) -> dict[str, str]:
    return {"cookiefile": cookies_file} if cookies_file else {}


def _get_video_title(url: str, cookies_file: str | None = None) -> str:
    try:
        import yt_dlp
        options = {"quiet": True, "no_warnings": True, **_cookie_options(cookies_file)}
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("title", url) if info else url
    except Exception:
        return url


def _try_download_subtitles(url: str, tmpdir: str, cookies_file: str | None = None) -> str | None:
    try:
        import yt_dlp
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["zh-Hans", "zh-Hant", "zh", "en"],
            "subtitlesformat": "vtt",
            "outtmpl": os.path.join(tmpdir, "sub"),
            **_cookie_options(cookies_file),
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        for fname in os.listdir(tmpdir):
            if fname.endswith(".vtt"):
                with open(os.path.join(tmpdir, fname), encoding="utf-8") as f:
                    raw = f.read()
                text = _parse_vtt(raw)
                if text.strip():
                    return text
    except Exception:
        pass
    return None


def _parse_vtt(vtt: str) -> str:
    lines = vtt.splitlines()
    text_lines: list[str] = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line or re.match(r"^\d+$", line):
            continue
        cleaned = re.sub(r"<[^>]+>", "", line)
        if cleaned and (not text_lines or text_lines[-1] != cleaned):
            text_lines.append(cleaned)
    return " ".join(text_lines)


def _download_audio(url: str, tmpdir: str, cookies_file: str | None = None) -> str | None:
    try:
        import yt_dlp
        audio_path = os.path.join(tmpdir, "audio.%(ext)s")
        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio/best",
            "outtmpl": audio_path,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }],
            **_cookie_options(cookies_file),
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        for fname in os.listdir(tmpdir):
            if fname.endswith(".mp3"):
                return os.path.join(tmpdir, fname)
    except Exception:
        pass
    return None


def _transcribe_audio(audio_path: str) -> str:
    errors: list[str] = []
    try:
        import faster_whisper
        model = faster_whisper.WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(audio_path, beam_size=5)
        return " ".join(segment.text.strip() for segment in segments)
    except Exception as exc:
        errors.append(f"faster-whisper: {exc}")

    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(audio_path)
        return result.get("text", "")
    except Exception as exc:
        errors.append(f"whisper: {exc}")

    detail = "；".join(errors)
    raise ValueError(f"Whisper 无法转写音频：{detail}")
