#!/usr/bin/env python3
"""
Clear all data from ChromaDB to fix SQLITE_FULL error.
Run this after deploying the fix to start with a clean database.
"""

import os
import shutil

# Path used in production (docker-compose volume)
CHROMA_PATH = "/home/moatez/hack/mindvault/chroma_db"

# Fallback to local path if running from backend directory
if not os.path.exists(CHROMA_PATH):
    CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

print(f"ChromaDB path: {CHROMA_PATH}")

if os.path.exists(CHROMA_PATH):
    print(f"Deleting {CHROMA_PATH}...")
    shutil.rmtree(CHROMA_PATH)
    print("✓ ChromaDB cleared successfully!")
    print("\nRestart the backend to create a fresh database.")
else:
    print("ChromaDB directory not found. Nothing to clear.")
