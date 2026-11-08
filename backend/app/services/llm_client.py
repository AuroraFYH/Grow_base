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


def extract_json(text: str) -> dict:
    """Extract first JSON object from LLM output."""
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("LLM 响应中没有找到 JSON")
    return json.loads(match.group())
