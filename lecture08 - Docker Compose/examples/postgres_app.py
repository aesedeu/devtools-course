"""Тот же API заметок; данные хранятся в PostgreSQL."""
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI
from pydantic import BaseModel, Field

VERSION = "v1"


def connect():
    password = Path(os.environ.get("DB_PASSWORD_FILE", "/run/secrets/db_password")).read_text().strip()
    return psycopg.connect(
        host=os.environ.get("PGHOST", "db"),
        dbname=os.environ.get("PGDATABASE", "notes"),
        user=os.environ.get("PGUSER", "notes"),
        password=password,
        connect_timeout=3,
        row_factory=dict_row,
    )


@asynccontextmanager
async def lifespan(app):
    with connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, text TEXT NOT NULL)")
    yield


app = FastAPI(title="Заметки в PostgreSQL", lifespan=lifespan)


class NoteBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    with connect() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok", "version": VERSION}


@app.post("/notes", status_code=201)
def create_note(body: NoteBody):
    note = {"id": uuid4().hex, "text": body.text}
    with connect() as conn:
        conn.execute("INSERT INTO notes (id, text) VALUES (%s, %s)", (note["id"], note["text"]))
    return note


@app.get("/notes")
def list_notes():
    with connect() as conn:
        return conn.execute("SELECT id, text FROM notes ORDER BY id").fetchall()
