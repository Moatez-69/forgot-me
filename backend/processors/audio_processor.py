import logging
import os
import tempfile

import whisper

logger = logging.getLogger(__name__)

# Lazy-loaded whisper model — tiny for speed
_model = None


def _get_model():
    global _model
    if _model is None:
        _model = whisper.load_model("tiny")
    return _model


def extract_text(file_bytes: bytes, filename: str = "audio.mp3") -> str:
    """
    Transcribe audio to text using Whisper (tiny model).
    Writes to a temp file because Whisper needs a file path.
    """
    ext = os.path.splitext(filename)[1] or ".mp3"
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        model = _get_model()
        result = model.transcribe(tmp_path)
        return result.get("text", "")
    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        return ""
    finally:
        if "tmp_path" in locals():
            os.unlink(tmp_path)
