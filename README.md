# MindVault

**A local-first personal cognitive assistant that scans your files, understands their content using a local LLM, and lets you query your knowledge base using natural language.**

MindVault processes documents, images, audio, and calendar files on your phone, generates semantic descriptions using Qwen2.5-3B (running locally via Ollama), stores them in a vector database, and enables intelligent retrieval with self-verified answers. A built-in notification system proactively extracts upcoming events and deadlines from your files.

**No data ever leaves your network. Everything runs locally.**

---

## Architecture

```
Phone (Expo Go)                    Your Machine (Docker)
+------------------+               +---------------------------+
|  React Native    |  HTTP/JSON    |  FastAPI Backend           |
|  Mobile App      | ------------> |  :8000                     |
|                  |               |                            |
|  - Scan folders  |               |  +-- Storage Agent ------+ |
|  - Query files   |               |  | Detect modality       | |
|  - Browse memory |               |  | Extract content       | |
|  - View events   |               |  | LLM description       | |
+------------------+               |  | LLM event extraction  | |
                                   |  | Embed + store         | |
                                   |  +------------------------+ |
                                   |                            |
                                   |  ChromaDB    (vectors)     |
                                   |  SQLite      (events)      |
                                   |  Ollama      (Qwen2.5-3B)  |
                                   +----------------------------+
```

---

## Features

- **Multi-modal file processing** -- PDF, images, audio, text, Word docs, emails, and calendar files
- **Semantic search** -- Find files by meaning, not just keywords, using sentence-transformer embeddings
- **Natural language Q&A** -- Ask questions about your files and get cited answers
- **Self-verification** -- Every answer is checked by a second LLM call for groundedness
- **Event extraction** -- Automatically finds deadlines, appointments, and reminders in your files
- **Category tagging** -- Files are auto-classified as work, study, personal, medical, finance, or other
- **Privacy-first** -- All processing happens locally. No external API calls. Only descriptions are stored, not raw content
- **Persistent storage** -- ChromaDB and SQLite data survive container restarts

---

## Tech Stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | FastAPI + Uvicorn | REST API server |
| Vector DB | ChromaDB (persistent mode) | Semantic search over file descriptions |
| Embeddings | all-MiniLM-L6-v2 (sentence-transformers) | 384-dim local embeddings |
| LLM | Qwen2.5-3B via Ollama | Description generation, event extraction, Q&A |
| PDF | PyMuPDF (fitz) | Text extraction from PDFs |
| Images | BLIP (Salesforce/blip-image-captioning-base) | Image captioning |
| Audio | OpenAI Whisper (tiny) | Speech-to-text transcription |
| Calendar | icalendar | .ics file parsing |
| Documents | python-docx | .docx text extraction |
| Email | Python email.parser | .eml parsing with headers |
| Events DB | SQLite via aiosqlite | Structured event storage |
| Runtime | Python 3.12, Docker | Containerized deployment |

### Mobile

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React Native 0.81 + Expo SDK 54 | Cross-platform mobile app |
| Navigation | expo-router 6.x (file-based) | Tab navigation |
| File access | expo-file-system (StorageAccessFramework) | Read files from device storage |
| Storage | AsyncStorage | Backend URL configuration |
| HTTP | Native fetch API | Backend communication |
| Language | TypeScript 5.9 | Type safety |

---

## Project Structure

```
mindvault/
├── backend/
│   ├── main.py                    # FastAPI app with all endpoints
│   ├── agents/
│   │   └── storage_agent.py       # Core ingestion pipeline
│   ├── processors/
│   │   ├── pdf_processor.py       # PyMuPDF text extraction
│   │   ├── image_processor.py     # BLIP image captioning
│   │   ├── audio_processor.py     # Whisper transcription
│   │   ├── text_processor.py      # txt/md/docx/eml extraction
│   │   └── calendar_processor.py  # .ics event parsing
│   ├── services/
│   │   ├── vector_store.py        # ChromaDB interface + embeddings
│   │   ├── llm_service.py         # Ollama/Qwen2.5-3B wrapper
│   │   └── notif_service.py       # SQLite event storage
│   ├── models/
│   │   └── schemas.py             # Pydantic request/response models
│   ├── requirements.txt
│   └── Dockerfile
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx            # Tab navigation + setup screen
│   │   ├── index.tsx              # Home / Query screen
│   │   ├── scan.tsx               # Folder scanner + ingestion
│   │   ├── memories.tsx           # Memory browser with filters
│   │   └── notifications.tsx      # Upcoming events screen
│   ├── components/
│   │   ├── QueryInput.tsx         # Search bar component
│   │   ├── MemoryCard.tsx         # File memory display card
│   │   └── NotifCard.tsx          # Event notification card
│   ├── services/
│   │   └── api.ts                 # Typed API client (fetch-based)
│   ├── package.json
│   └── app.json
└── docker-compose.yml
```

---

## API Endpoints

### POST /ingest
Ingest a single file through the storage agent pipeline.

```json
// Request
{
  "file_path": "/storage/documents/report.pdf",
  "file_content_base64": "JVBERi0xLjQK...",
  "filename": "report.pdf"
}

// Response
{
  "success": true,
  "file_path": "/storage/documents/report.pdf",
  "description": "A quarterly financial report covering Q3 2025 revenue, expenses, and projections for the next fiscal year.",
  "category": "finance",
  "has_events": true,
  "error": ""
}
```

### POST /ingest/batch
Process multiple files concurrently using asyncio.gather.

### POST /query
Semantic search + LLM Q&A with self-verification.

```json
// Request
{ "question": "When is the project deadline?", "top_k": 5 }

// Response
{
  "answer": "According to meeting_notes.txt, the launch deadline is April 20, 2026.",
  "sources": [
    {
      "file_name": "meeting_notes.txt",
      "file_path": "/storage/documents/meeting_notes.txt",
      "description": "Meeting notes outlining key decisions...",
      "category": "work"
    }
  ],
  "verified": true
}
```

### GET /memories
Retrieve stored file memories with optional category/modality filtering.

### GET /notifications
Get upcoming events extracted from ingested files (date >= today).

### GET /health
Service health check for ChromaDB, Ollama, and SQLite.

---

## Ingestion Pipeline

When a file is ingested, the storage agent executes this pipeline:

```
1. Decode base64 content
        |
2. Detect modality from file extension
        |
3. Route to processor:
   .pdf  --> PyMuPDF      --> extracted text
   .jpg  --> BLIP caption  --> "[Image content]: a photo of..."
   .mp3  --> Whisper tiny  --> transcribed speech
   .ics  --> icalendar     --> "Event: Team Meeting, Start: ..."
   .txt  --> UTF-8 decode  --> raw text
   .docx --> python-docx   --> paragraphs
   .eml  --> email.parser  --> subject + from + body
        |
4. LLM generates description (2-3 sentences), category, summary
        |
5. LLM checks for dates/deadlines/events
        |
6. Description embedded with MiniLM --> stored in ChromaDB
        |
7. If events found --> stored in SQLite
        |
8. Return result to mobile app
```

**Key design decision:** Only the LLM-generated description is embedded and stored -- not the raw file content. This provides better semantic search results and preserves privacy.

---

## Query Pipeline

```
1. User asks a question
        |
2. Question embedded with MiniLM (384-dim vector)
        |
3. ChromaDB cosine similarity search --> top-k relevant descriptions
        |
4. Context built from retrieved file metadata
        |
5. LLM generates answer, citing file names
        |
6. Self-verification: second LLM call checks if answer is grounded
        |  
7. If unverified: disclaimer appended to answer
        |
8. Return answer + sources + verification status
```

---

## Supported File Types

| Type | Extensions | Processor | What Happens |
|------|-----------|-----------|-------------|
| PDF | .pdf | PyMuPDF | All pages extracted, text concatenated |
| Plain text | .txt, .md | UTF-8 decode | Direct text with encoding fallback |
| Word | .docx | python-docx | Paragraphs extracted and joined |
| Email | .eml | email.parser | Subject, From, Date headers + body |
| Image | .jpg, .jpeg, .png | BLIP | AI-generated caption describes the image |
| Audio | .mp3, .m4a, .wav | Whisper tiny | Speech transcribed to text |
| Calendar | .ics | icalendar | Events parsed with dates, locations, descriptions |

---

## Setup & Running

### Prerequisites
- Docker and Docker Compose
- Ollama installed and running on the host
- Node.js 18+
- Expo Go app on your Android phone
- Phone and computer on the same Wi-Fi network

### 1. Start Ollama and pull the model

```bash
# Ollama must listen on all interfaces for Docker access
sudo systemctl edit ollama
# Add:
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl restart ollama

# Pull the model
ollama pull qwen2.5:3b
```

### 2. Start the backend

```bash
cd mindvault
docker compose up --build -d
```

Verify it's running:

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": [
    {"name": "chromadb", "status": "ok"},
    {"name": "ollama", "status": "ok", "detail": "Qwen2.5-3B available"},
    {"name": "sqlite", "status": "ok"}
  ]
}
```

### 3. Start the mobile app

```bash
cd mindvault/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone.

### 4. Connect

On the setup screen, enter your computer's local IP:
```
http://<YOUR_IP>:8000
```

Tap **Test Connection**, then **Continue**.

### 5. Ingest files

1. Create a folder on your phone with test documents
2. Go to the **Scan** tab
3. Tap **Select Folder to Scan**
4. Grant access to the folder
5. Select files and tap **Ingest**

### 6. Query

Go to the **Home** tab and ask questions like:
- "What are the key deadlines in my documents?"
- "Summarize the financial reports"
- "When is the next meeting?"

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `CHROMA_PATH` | `./chroma_db` | ChromaDB persistent storage path |
| `SQLITE_PATH` | `./mindvault.db` | SQLite database file path |

---

## Constraints

1. **No external AI APIs** -- Only Ollama with local models. No OpenAI, Anthropic, or any hosted service.
2. **Model size limit** -- Qwen2.5-3B (under 4B parameters).
3. **Local network only** -- Mobile app connects to backend via LAN IP.
4. **Description-based search** -- ChromaDB stores semantic descriptions, not raw file content.
5. **Self-verification required** -- Every query answer is verified for groundedness before being returned.
