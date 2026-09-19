# Лекция 2. Git: основы и устройство

**Материалы:** [презентация](lecture02-git-osnovy.pptx) · [семинар](семинар.md)

## Зачем
Git — стандарт версионирования. Понимание его внутренней модели.

## Инструменты
git CLI, `.gitignore`, GitHub/GitLab.

## Теория
- Зачем VCS: история, коллаборация, откаты.
- **Объектная модель Git:** blob, tree, commit, tag — content-addressable storage (SHA).
- Три состояния файла: working directory / staging (index) / repository.
- Что такое коммит на самом деле (снимок дерева + ссылка на родителя), почему история — это DAG.
- HEAD, ссылки (refs), ветка как указатель.
- Устройство `.git/` изнутри.

## Практика
`init`, `add`, `commit`, `status`, `log`, `diff`, `show`; исследование `.git/objects` через `cat-file`; работа с remote (`clone`, `push`, `pull`, `fetch`); `.gitignore`.
