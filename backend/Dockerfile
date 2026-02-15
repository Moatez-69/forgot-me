FROM python:3.12-slim

WORKDIR /app

# System deps for PyMuPDF, audio processing, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    tesseract-ocr \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create persistent storage directories
RUN mkdir -p /app/chroma_db

# Pre-download the sentence-transformer model at build time
# so it doesn't need internet access at runtime
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
