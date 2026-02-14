import io
import logging
from email import policy
from email.parser import BytesParser

from docx import Document

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes, filename: str = "") -> str:
    """
    Extract text from plain text files (.txt, .md), .docx, and .eml files.
    Routes based on file extension.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

    if ext == "docx":
        return _extract_docx(file_bytes)
    elif ext == "eml":
        return _extract_email(file_bytes)
    else:
        return _extract_plain(file_bytes)


def _extract_plain(file_bytes: bytes) -> str:
    """Decode plain text/markdown with fallback encoding."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return file_bytes.decode(encoding)
        except (UnicodeDecodeError, ValueError):
            continue
    return file_bytes.decode("utf-8", errors="replace")


def _extract_docx(file_bytes: bytes) -> str:
    """Extract text from a .docx file using python-docx."""
    try:
        doc = Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as e:
        logger.error(f"DOCX extraction failed: {e}")
        return ""


def _extract_email(file_bytes: bytes) -> str:
    """Extract text content from an .eml email file."""
    try:
        msg = BytesParser(policy=policy.default).parsebytes(file_bytes)
        parts = []
        # Include headers for context
        if msg["subject"]:
            parts.append(f"Subject: {msg['subject']}")
        if msg["from"]:
            parts.append(f"From: {msg['from']}")
        if msg["date"]:
            parts.append(f"Date: {msg['date']}")
        parts.append("")  # blank line

        body = msg.get_body(preferencelist=("plain", "html"))
        if body:
            content = body.get_content()
            parts.append(content)
        return "\n".join(parts)
    except Exception as e:
        logger.error(f"Email extraction failed: {e}")
        return ""
