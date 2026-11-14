# Лекция 7. Docker и devcontainers

**Материалы:** [презентация](lecture07-docker.pdf) · [семинар](семинар.md) · [презентация – Group 2](<Docker – verbosed.md>)

## Зачем
Docker — практический инструмент упаковки приложений. После темы 6 «магии» уже нет — только команды и best practices.

## Инструменты
docker CLI, Dockerfile, Docker Hub, VS Code Dev Containers.

## Теория
- Архитектура Docker: daemon, client, registry, образы, контейнеры.
- **Слоистая файловая система** образов, кэширование слоёв.
- **Dockerfile:** `FROM`, `RUN`, `COPY`, `WORKDIR`, `CMD` vs `ENTRYPOINT`, `EXPOSE`, `ENV`, `ARG`.
- Жизненный цикл контейнера, `docker run` и его флаги.
- **Volumes** и bind mounts (персистентность данных).
- **Сеть** контейнеров, публикация портов.
- Best practices: минимальные образы, `.dockerignore`, multi-stage builds, непривилегированный пользователь.
- **Devcontainers:** воспроизводимая среда разработки как код.

## Практика
Запуск контейнеров, сборка своего образа для Python-приложения, работа с volumes и портами, публикация в registry, настройка devcontainer.

## → ведёт к ДЗ-3 (Docker)
