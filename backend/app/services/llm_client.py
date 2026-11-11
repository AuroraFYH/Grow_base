"""Generic OpenAI-compatible LLM client."""
from __future__ import annotations

import json
import re

import httpx


def _build_endpoint(base_url: str | None) -> str:
    """
    Accept any of these formats from the user and return the correct endpoint:
      https://api.openai.com          → https://api.openai.com/v1/chat/completions
      https://api.openai.com/v1       → https://api.openai.com/v1/chat/completions
      https://api.openai.com/v1/      → https://api.openai.com/v1/chat/completions
      https://proxy.example.com/v1    → https://proxy.example.com/v1/chat/completions
    """
    base = (base_url or "https://api.openai.com").rstrip("/")
    if base.endswith("/v1"):
        return base + "/chat/completions"
    if "/v1/" in base:
        # already has a subpath under v1, just append
        return base.rstrip("/") + "/chat/completions"
    return base + "/v1/chat/completions"


async def chat_completion(
    api_key: str,
    model_name: str,
    messages: list[dict],
    base_url: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: int = 120,
) -> str:
    """Call OpenAI-compatible chat completions endpoint, return assistant text."""
    url = _build_endpoint(base_url)
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


def extract_json(text: str, expected_keys: set[str] | None = None) -> dict:
    """Extract a JSON object from an LLM response.

    Models often wrap JSON in Markdown fences or add a short explanation. A
    greedy regex can also capture multiple objects at once, so use the JSON
    decoder to scan complete objects and optionally prefer a known root shape.
    """
    decoder = json.JSONDecoder()
    candidates: list[tuple[int, dict]] = []
    for match in re.finditer(r"\{", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            score = len(expected_keys.intersection(value)) if expected_keys else 0
            candidates.append((score, value))

    if not candidates:
        raise ValueError("LLM 响应中没有找到有效 JSON 对象")
    if expected_keys:
        matching = [candidate for candidate in candidates if candidate[0] > 0]
        if not matching:
            raise ValueError("LLM JSON 响应缺少预期字段")
        return max(matching, key=lambda candidate: candidate[0])[1]
    return candidates[0][1]
