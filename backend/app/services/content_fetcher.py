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
            return await _fetch_video_via_dtk(url, platform)
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
    """Download + transcribe via local DTK instance."""
    dtk_base_url, dtk_api_key = _dtk_config()
    headers = {"X-API-Key": dtk_api_key}

    async with httpx.AsyncClient(base_url=dtk_base_url, headers=headers, timeout=30) as client:
        # 1. Get video metadata (title)
        meta_resp = await client.get(f"/api/v1/{platform}/video", params={"url": url, "wait": 10})
        meta_resp.raise_for_status()
        meta = meta_resp.json()
        if not meta.get("success"):
            raise ValueError(f"DTK 无法获取视频信息：{meta.get('error', {}).get('message', '未知错误')}")
        title = meta["data"].get("title") or url

        # 2. Start download
        dl_resp = await client.post("/api/v1/downloads", json={"url": url, "skip_existing": True})
        dl_resp.raise_for_status()
        dl = dl_resp.json()
        if not dl.get("success"):
            raise ValueError(f"DTK 下载失败：{dl.get('error', {}).get('message', '未知错误')}")
        download_id = dl["data"]["download_id"]

    # 3. Wait for download to finish (poll, up to 60s)
    import asyncio
    async with httpx.AsyncClient(base_url=dtk_base_url, headers=headers, timeout=15) as client:
        download_done = False
        for _ in range(20):
            await asyncio.sleep(3)
            r = await client.get(f"/api/v1/downloads/{download_id}")
            r.raise_for_status()
            state = r.json().get("data", {}).get("state", "")
            if state == "done":
                download_done = True
                break
            if state in ("failed", "cancelled"):
                raise ValueError(f"DTK 下载失败，状态：{state}")
        if not download_done:
            raise ValueError("DTK 下载超时（超过 60 秒）")

        # 4. Start transcription
        tr_resp = await client.post("/api/v1/transcriptions",
                                    json={"download_id": download_id, "normalize": True})
        tr_resp.raise_for_status()
        tr = tr_resp.json()
        if not tr.get("success"):
            raise ValueError(f"DTK 转写失败：{tr.get('error', {}).get('message', '未知错误')}")
        transcription_id = tr["data"]["transcription_id"]

        # 5. Wait for transcription (up to 5 min)
        for _ in range(60):
            await asyncio.sleep(5)
            r = await client.get(f"/api/v1/transcriptions/{transcription_id}")
            r.raise_for_status()
            tdata = r.json().get("data", {})
            state = tdata.get("state", "")
            if state == "done":
                text = tdata.get("text") or ""
                if not text:
                    raise ValueError("DTK 转写完成但文本为空")
                return title, text[:15000]
            if state in ("failed", "cancelled"):
                raise ValueError(f"DTK 转写失败，状态：{state}")

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
