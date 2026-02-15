from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
class TestLLMService:
    async def test_generate_description(self, mock_llm):
        from services.llm_service import generate_description

        result = await generate_description("notes.txt", "Meeting notes from Q1")
        assert "description" in result
        assert "category" in result
        assert "summary" in result

    async def test_extract_events_no_events(self, mock_llm):
        from services.llm_service import extract_events

        result = await extract_events("Just a regular document with no dates.")
        assert result["has_events"] is False
        assert result["events"] == []

    async def test_answer_query(self, mock_llm):
        from services.llm_service import answer_query

        answer = await answer_query(
            "What is the meaning?", "File: test.txt\nContent: 42"
        )
        assert len(answer) > 0

    async def test_verify_answer_yes(self, mock_llm):
        from services.llm_service import verify_answer

        result = await verify_answer("q", "context", "answer")
        assert result is True

    async def test_check_availability_success(self):
        """Mock the /api/tags endpoint to simulate Ollama running."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"models": [{"name": "qwen2.5:3b"}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.llm_service import check_availability

            result = await check_availability()
            assert result is True

    async def test_check_availability_failure(self):
        """Mock Ollama being unreachable."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.llm_service import check_availability

            result = await check_availability()
            assert result is False


class TestParseJson:
    def test_parse_clean_json(self):
        from services.llm_service import _parse_json

        result = _parse_json('{"key": "value"}', {"key": "default"})
        assert result["key"] == "value"

    def test_parse_json_with_code_fences(self):
        from services.llm_service import _parse_json

        raw = '```json\n{"key": "value"}\n```'
        result = _parse_json(raw, {"key": "default"})
        assert result["key"] == "value"

    def test_parse_json_with_surrounding_text(self):
        from services.llm_service import _parse_json

        raw = 'Here is the result: {"key": "value"} hope that helps!'
        result = _parse_json(raw, {"key": "default"})
        assert result["key"] == "value"

    def test_parse_json_fallback(self):
        from services.llm_service import _parse_json

        result = _parse_json("not json at all", {"key": "default"})
        assert result["key"] == "default"
