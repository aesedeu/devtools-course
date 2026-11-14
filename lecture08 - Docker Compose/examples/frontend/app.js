"use strict";

const form = document.querySelector("#note-form");
const input = document.querySelector("#note-text");
const addButton = document.querySelector("#add-button");
const refreshButton = document.querySelector("#refresh-button");
const status = document.querySelector("#status");
const list = document.querySelector("#notes-list");
const emptyMessage = document.querySelector("#empty-message");
const count = document.querySelector("#note-count");
let notes = [];
let busy = false;
let loaded = false;

function showStatus(message, kind = "info") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setBusy(value, saving = false) {
  busy = value;
  addButton.disabled = value || !loaded;
  refreshButton.disabled = value;
  input.disabled = value && saving;
  addButton.textContent = saving && value ? "Сохраняем…" : "Добавить";
  refreshButton.textContent = value && !saving ? "Загружаем…" : "Обновить";
  list.setAttribute("aria-busy", String(value));
}

function isNote(value) {
  return value !== null && typeof value === "object" &&
    typeof value.id === "string" && typeof value.text === "string";
}

function renderNotes() {
  const items = notes.map((note) => {
    const item = document.createElement("li");
    item.className = "note";
    // Заметки могут содержать HTML: отображаем его как обычный текст.
    item.textContent = note.text;
    return item;
  });
  list.replaceChildren(...items);
  count.textContent = String(notes.length);
  emptyMessage.hidden = notes.length !== 0;
}

async function requestNotes(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/notes", {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshNotes() {
  if (busy) return;
  setBusy(true);
  showStatus("Загружаем заметки…");
  try {
    const data = await requestNotes();
    if (!Array.isArray(data) || !data.every(isNote)) throw new Error("Invalid notes");
    notes = data;
    loaded = true;
    renderNotes();
    showStatus("Список обновлён.");
  } catch {
    showStatus("Не удалось загрузить заметки. Проверьте соединение и нажмите «Обновить» ещё раз.", "error");
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !loaded) return;
  const text = input.value.trim();
  if (!text) {
    showStatus("Напишите текст заметки.", "error");
    input.focus();
    return;
  }
  setBusy(true, true);
  showStatus("Сохраняем заметку…");
  try {
    // POST выполняется ровно один раз: повтор после ошибки мог бы создать дубликат.
    const note = await requestNotes({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!isNote(note)) throw new Error("Invalid note");
    notes = [note, ...notes.filter((existing) => existing.id !== note.id)];
    renderNotes();
    input.value = "";
    showStatus("Заметка сохранена.");
  } catch {
    showStatus("Не удалось подтвердить сохранение. Текст остался в поле. Сначала нажмите «Обновить» и проверьте список, чтобы не добавить заметку дважды.", "error");
  } finally {
    setBusy(false);
    input.focus();
  }
});

refreshButton.addEventListener("click", refreshNotes);
refreshNotes();
