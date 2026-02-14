import io
import logging

from PIL import Image
from transformers import pipeline

logger = logging.getLogger(__name__)

# Lazy-loaded captioning pipeline
_captioner = None


def _get_captioner():
    global _captioner
    if _captioner is None:
        _captioner = pipeline(
            "image-to-text",
            model="Salesforce/blip-image-captioning-base",
        )
    return _captioner


def extract_text(file_bytes: bytes) -> str:
    """
    Generate a text caption from an image using BLIP.
    Returns the caption as the "text content" of the image.
    """
    try:
        image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        captioner = _get_captioner()
        results = captioner(image)
        caption = results[0]["generated_text"] if results else "An image"
        return f"[Image content]: {caption}"
    except Exception as e:
        logger.error(f"Image captioning failed: {e}")
        return "[Image content]: Unable to process image"
