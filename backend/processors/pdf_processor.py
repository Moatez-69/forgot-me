import io
import logging

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes) -> str:
    """
    Extract text from a PDF using PyMuPDF.
    Concatenates all pages with page separators.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                pages.append(text.strip())
        doc.close()
        return "\n\n---\n\n".join(pages)
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        return ""
