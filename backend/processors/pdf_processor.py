import io
import logging

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes) -> str:
    """
    Extract text from a PDF using PyMuPDF.
    Concatenates all pages with page separators.
    Falls back to OCR for scanned PDFs.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                pages.append(text.strip())

        result = "\n\n---\n\n".join(pages)

        # OCR fallback for scanned PDFs
        if len(result.strip()) < 50:
            result = _ocr_fallback(doc)

        doc.close()
        return result
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        return ""


def _ocr_fallback(doc) -> str:
    """Use OCR on PDF pages when text extraction yields little content."""
    try:
        import pytesseract
        from PIL import Image

        pages = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = pytesseract.image_to_string(img)
            if text.strip():
                pages.append(text.strip())
        return "\n\n---\n\n".join(pages)
    except ImportError:
        logger.warning("pytesseract not installed, OCR unavailable")
        return ""
    except Exception as e:
        logger.warning(f"OCR fallback failed: {e}")
        return ""
