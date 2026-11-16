# Лекция 8. Docker Compose

**Материалы:** [презентация](lecture08-compose.pdf) · [семинар](семинар.md)
**Материалы:** [теория – Group 2](<Theory gr2.md>) · [практика – Group 2](<Practise gr2.md>)

## Зачем
Реальное приложение — это несколько сервисов (API + БД + кэш + бот). Compose оркеструет их одной командой.

## Инструменты
docker compose, YAML.

## Теория
- Проблема многоконтейнерных приложений; декларативное описание vs набор `docker run`.
- Структура `compose.yaml`: services, networks, volumes.
- **Связь между сервисами** через DNS-имена внутри сети Compose.
- `depends_on`, healthchecks, порядок старта.
- Переменные окружения, `.env`, секреты.
- Named volumes для БД, переопределения (override-файлы) dev/prod.
- Жизненный цикл: `up`/`down`, `logs`, `exec`, `ps`, масштабирование.

## Практика
Сборка стека «FastAPI + PostgreSQL + Redis» через Compose, настройка сети и volumes, healthchecks и зависимости, окружения dev/prod.

