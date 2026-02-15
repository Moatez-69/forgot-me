import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL_NAME = "qwen2.5:3b"  # Under 4B params — hackathon constraint


async def generate(prompt: str, temperature: float = 0.3) -> str:
    """
    Call Ollama's /api/generate endpoint with Qwen2.5-3B.
    Uses low temperature for factual/structured outputs.
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": 1024,
                },
            },
        )
        response.raise_for_status()
        return response.json()["response"]


async def generate_description(filename: str, content: str) -> dict:
    """
    Ask the LLM to produce a structured description, category, and summary.
    Returns parsed dict with keys: description, category, summary.
    """
    prompt = f"""You are analyzing a file to create a searchable description.
File name: {filename}
Content: {content[:2000]}

Generate a JSON response with these fields:
- description: 2-3 sentences describing the main topic and content of this file
- category: one of [work, study, personal, medical, finance, other]
- summary: one short sentence (max 12 words) for display

Respond ONLY with valid JSON, no markdown, no explanation."""

    raw = await generate(prompt)
    return _parse_json(
        raw,
        fallback={
            "description": f"File: {filename}",
            "category": "other",
            "summary": filename,
        },
    )


async def extract_events(content: str) -> dict:
    """
    Ask the LLM to find dates/deadlines/appointments in the content.
    Returns dict with has_events (bool) and events (list).
    """
    prompt = f"""Analyze this content and extract any dates, deadlines, appointments, or reminders.
Content: {content[:2000]}

Respond with JSON:
- has_events: true or false
- events: array of objects with fields: title (string), date (ISO string or null), description (string)

If no events found, return has_events: false and empty events array.
Respond ONLY with valid JSON."""

    raw = await generate(prompt)
    return _parse_json(
        raw,
        fallback={
            "has_events": False,
            "events": [],
        },
    )


async def answer_query(
    question: str, context: str, conversation_history: list[dict] | None = None
) -> str:
    """Generate an answer grounded in the retrieved file context."""
    conv_context = ""
    if conversation_history:
        recent = conversation_history[-3:]  # Last 3 turns
        parts = []
        for turn in recent:
            q = turn.get("question", "")
            a = turn.get("answer", "")[:200]  # Truncate answers
            parts.append(f"User: {q}\nAssistant: {a}")
        conv_context = "\n\n".join(parts)

    prompt = f"""You are a helpful personal assistant that helps users find and understand their files.
Read the file descriptions and content below, then answer the question.
Use the information from the files to give a helpful answer. Mention which file(s) the answer comes from.
For images, describe what is in the photo based on the description provided.
For documents, summarize the relevant content.
Always try to give a useful answer based on the files provided — do NOT say you couldn't find information if files are listed below.

--- FILES START ---
{context}
--- FILES END ---
"""
    if conv_context:
        prompt += f"""
--- PREVIOUS CONVERSATION ---
{conv_context}
--- END PREVIOUS CONVERSATION ---
"""
    prompt += f"""
Question: {question}

Answer:"""

    return await generate(prompt, temperature=0.3)


async def verify_answer(question: str, context: str, answer: str) -> bool:
    """
    Self-verification step: ask the LLM if its own answer is grounded.
    Returns True if the answer is verified as grounded.
    """
    prompt = f"""Does the answer below use information from the provided files? Reply YES or NO only.

Files:
{context[:1500]}

Answer: {answer}

Reply YES or NO:"""

    raw = await generate(prompt, temperature=0.1)
    return raw.strip().upper().startswith("YES")


async def check_availability() -> bool:
    """Health check — verify Ollama is running and model is loaded."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            # Check if our model (or a variant tag) is available
            return any(MODEL_NAME.split(":")[0] in m for m in models)
    except Exception:
        return False


def _parse_json(raw: str, fallback: dict) -> dict:
    """
    Robustly parse JSON from LLM output.
    LLMs sometimes wrap JSON in markdown code fences — strip those.
    """
    text = raw.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        logger.warning(f"Failed to parse LLM JSON output: {text[:200]}")
        return fallback
