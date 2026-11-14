"""Учебный API: заметки в одном JSON-файле. Запускать с одним worker."""

import json
import os
from pathlib import Path
from uuid import uuid4
from threading import Lock

from fastapi import FastAPI
from pydantic import BaseModel, Field

VERSION = "v1"
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))

file_lock = Lock()


def read_notes():
    path = DATA_DIR / "notes.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


app = FastAPI(title="Заметки: JSON")


class NoteBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"status": "ok", "version": VERSION}


@app.post("/notes", status_code=201)
def create_note(body: NoteBody):
    # Один worker; блокировка защищает чтение-изменение-запись от параллельных запросов.
    with file_lock:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        notes = read_notes()
        note = {"id": uuid4().hex, "text": body.text}
        notes.append(note)
        temporary = DATA_DIR / "notes.tmp"
        temporary.write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")
        temporary.replace(DATA_DIR / "notes.json")
    return note


@app.get("/notes")
def list_notes():
    with file_lock:
        return read_notes()
