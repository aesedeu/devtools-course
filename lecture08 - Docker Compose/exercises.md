# Упражнения к лекции 8 - Docker Compose

## Упражнение 1. От набора docker run к compose.yaml

Стек из трёх контейнеров запускают вручную:

```bash
docker network create appnet
docker run -d --name db --network appnet \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=pass \
  -v pgdata:/var/lib/postgresql/data postgres:16
docker run -d --name cache --network appnet redis:7
docker build -t api .
docker run -d --name api --network appnet -p 8000:8000 \
  -e REDIS_URL=redis://cache:6379/0 api
```

Ответьте на вопросы:

1. Напишите `compose.yaml`, который запускает тот же стек одной командой `docker compose up -d`.
2. Какие из четырёх команд выше в Compose писать не нужно? Кто их заменит?
3. Что в `compose.yaml` необходимо, а в `docker run` для тома `pgdata` было не нужно?
4. Папка проекта называется `shop`. Как будут называться сеть, том и три контейнера?
5. Контейнер теперь называется `shop-cache-1`. Почему `REDIS_URL=redis://cache:6379/0` всё равно работает?
6. Вы поправили `main.py` и снова запустили `docker compose up -d`. Правка не видна. Что запустить? Как остановить стек и удалить контейнеры с сетью, сохранив данные БД?

<details>
<summary>Решение</summary>

1. Каждый `docker run` превращается в сервис:

   ```yaml
   services:
     db:
       image: postgres:16
       environment:
         POSTGRES_USER: app
         POSTGRES_PASSWORD: pass
       volumes:
         - pgdata:/var/lib/postgresql/data
     cache:
       image: redis:7
     api:
       build: .
       ports: ["8000:8000"]
       environment:
         REDIS_URL: redis://cache:6379/0
   volumes:
     pgdata:
   ```

2. `docker network create` и `--network appnet` не нужны: Compose сам создаёт сеть проекта и подключает к ней
   все сервисы. `docker build -t api .` заменяет ключ `build: .` (сборка происходит при `up`).
   Флаги `-d`, `--name` тоже не нужны: `-d` переходит в `up -d`, а имя берётся из имени сервиса.
3. Именованный том нужно объявить в секции верхнего уровня `volumes:`. Docker run создаёт `pgdata`
   сам, Compose без объявления выдаст ошибку, что сервис ссылается на неопределённый том.
4. Префикс — имя проекта (по умолчанию имя папки): сеть `shop_default`, том `shop_pgdata`,
   контейнеры `shop-db-1`, `shop-cache-1`, `shop-api-1`.
5. Хостом служит имя сервиса, а не имя контейнера: в сети проекта Docker резолвит `cache` в адрес контейнера
   этого сервиса. Поэтому имя хоста в URL должно в точности совпадать с именем сервиса в yaml.
6. `docker compose up -d --build`: `up -d` без `--build` не пересобирает образ. Остановить и удалить
   контейнеры с сетью: `docker compose down`. Том `shop_pgdata` останется на месте, `-v` его удалил бы.
</details>

---

## Упражнение 2. Найдите ошибки в compose.yaml

```yaml
version: "3.8"
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://app:secret@localhost:5432/app
      REDIS_URL: redis://redis:6379/0
    depends_on: [db, cache]
  db:
    image: postgres:latest
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
  cache:
    image: redis:7
```

Найдите минимум пять проблем и напишите исправленную версию. Пароль нужно вынести в `.env`.
Напишите, что ещё должно лежать рядом с `compose.yaml` и что нужно записать в `.gitignore`.

<details>
<summary>Решение</summary>

1. `version: "3.8"` — ключ устарел: Compose предупредит и проигнорирует его. Строку удаляем.
2. `localhost:5432` в `DATABASE_URL`. Внутри контейнера api `localhost` — это сам api, там нет Postgres,
   будет `Connection refused`. Нужно имя сервиса: `db:5432`.
3. `redis://redis:6379/0`: сервис называется `cache`, а не `redis`. Имя хоста совпадает с именем сервиса
   один к одному: `cache:6379`.
4. `depends_on: [db, cache]` ждёт только запуска контейнера, а не готовности Postgres. Нужны `healthcheck`
   у `db` и `condition: service_healthy` (упражнение 4).
5. У `db` нет тома. При пересоздании контейнера (`down` и `up`) данные пропадут. Нужен именованный том
   и объявление в секции `volumes:` верхнего уровня.
6. `ports: ["5432:5432"]` у базы лишний: api и так видит её по сети, а с такой записью порт открыт на всех
   интерфейсах хоста. Порт убираем. Нужен `psql` — `docker compose exec db psql -U app`. Если очень надо с хоста,
   то только `127.0.0.1:5432:5432`.
7. Пароль `secret` записан прямо в файл, который коммитят. Выносим в `.env` и подставляем `${DB_PW}`.
8. `postgres:latest` — версия не зафиксирована. Нужно `postgres:16`.

Исправленная версия:

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://app:${DB_PW}@db:5432/app
      REDIS_URL: redis://cache:6379/0
    depends_on:
      db: {condition: service_healthy}
      cache: {condition: service_started}
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PW}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      retries: 5
  cache:
    image: redis:7
volumes:
  pgdata:
```

Рядом лежат `.env` с настоящим значением (`DB_PW=secret`) и `.env.example` с пустым (`DB_PW=`).
Коммитим только `.env.example`, а в `.gitignore` записываем `.env`.
</details>

---

## Упражнение 3. Конфигурация: `.env`, `${VAR}` и override

Файлы в папке проекта:

```
# .env
DB_USER=app
DB_PW=secret
API_PORT=9000
```

```yaml
# compose.yaml
services:
  api:
    build: .
    ports:
      - "${API_PORT:-8000}:8000"
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PW}@db:5432/${DB_NAME:-app}
      LOG_LEVEL: info
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PW}
```

```yaml
# compose.override.yaml
services:
  api:
    volumes:
      - .:/app
    environment:
      LOG_LEVEL: debug
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--reload"]
```

Ответьте на вопросы:

1. Что покажет `docker compose config` для опубликованного порта api, `DATABASE_URL` и `LOG_LEVEL`?
2. Что изменится в порте, если запустить `API_PORT=8080 docker compose config`?
3. Из `.env` удалили строку `DB_PW=secret`. Что напишет Compose, во что превратится `DATABASE_URL` и что будет с контейнером `db`?
4. Как сделать, чтобы Compose отказывался стартовать, когда `DB_PW` не задан?
5. Попадёт ли переменная `API_PORT` внутрь контейнера api? Как её туда передать?
6. Какой командой поднять стек для прода с файлом `compose.prod.yaml`? Откуда api возьмёт команду запуска в dev и откуда в проде?

<details>
<summary>Решение</summary>

1. Порт: `target: 8000`, `published: "9000"` (значение из `.env`). `DATABASE_URL`:
   `postgresql://app:secret@db:5432/app`, потому что `DB_NAME` нигде не задана и сработало значение по
   умолчанию `app`. `LOG_LEVEL`: `debug`. `config` показывает итог после слияния с `compose.override.yaml`,
   а `environment` сливается по ключам, поэтому `debug` побеждает `info`.
2. Опубликованный порт станет `"8080"`: окружение shell важнее `.env`.
3. Предупреждение `The "DB_PW" variable is not set. Defaulting to a blank string.` Подставится пустая строка,
   `DATABASE_URL` станет `postgresql://app:@db:5432/app`. Образ `postgres` откажется стартовать без пароля,
   поэтому контейнер `db` упадёт, а api не сможет подключиться.
4. Использовать форму с ошибкой: `POSTGRES_PASSWORD: ${DB_PW:?задайте DB_PW в .env}`. Если переменной нет,
   Compose завершится ошибкой с этим текстом и ничего не запустит.
5. Нет. `.env` читает только сам Compose для подстановки `${VAR}` в файл, внутрь контейнера он не попадает.
   Передать можно явно: `environment: API_PORT: ${API_PORT}`, или целиком файлом через `env_file`.
6. `docker compose -f compose.yaml -f compose.prod.yaml up -d`. Если указан `-f`, `compose.override.yaml`
   сам не читается. В dev команда берётся из override (с `--reload`). В базовом `compose.yaml` ключа `command`
   нет, поэтому в проде используется `CMD` из Dockerfile.
</details>

---

## Упражнение 4. depends_on и healthcheck

Стек запускают с нуля:

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://app:secret@db:5432/app
      REDIS_URL: redis://cache:6379/0
    depends_on: [db, cache]
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
  cache:
    image: redis:7
```

```bash
docker compose down && docker compose up -d && curl localhost:8000/health
```

Сразу после `up` ответ `{"db":false,"cache":true}`, а через несколько секунд тот же `curl` возвращает
`{"db":true,"cache":true}`.

Ответьте на вопросы:

1. Почему `db` сначала `false`, а `cache` сразу `true`?
2. Исправьте yaml так, чтобы api стартовал только после готовности Postgres.
3. Какие строки про `db` появятся в выводе `up -d` в исправленной версии и в каком порядке? Что покажет `docker compose ps`, если посмотреть на `db` в первые секунды и позже? Какой командой узнать статус проверки напрямую (контейнер называется `compose-demo-db-1`)?
4. Вы случайно написали `test: ["CMD-SHELL", "exit 1"]`. Что произойдёт при `up -d`? Через какое время при `interval: 5s` и `retries: 5`?
5. Почему для `cache` достаточно `service_started`?

<details>
<summary>Решение</summary>

1. Короткая форма `depends_on: [db, cache]` ждёт только запуска контейнеров. Redis готов почти сразу,
   а Postgres после старта контейнера ещё несколько секунд инициализируется и не принимает соединения.
   `depends_on` задаёт порядок запуска, а не готовность.
2. Добавляем `healthcheck` для `db` и условие `service_healthy`:

   ```yaml
   api:
     depends_on:
       db: {condition: service_healthy}
       cache: {condition: service_started}
   db:
     image: postgres:16
     healthcheck:
       test: ["CMD-SHELL", "pg_isready -U app"]
       interval: 5s
       retries: 5
   ```

3. Сначала `compose-demo-db-1 Started`, затем `Waiting`, потом `Healthy`, и только после этого запускается api.
   В `ps` в первые секунды статус `Up … (health: starting)`, после первой удачной проверки `Up … (healthy)`.
   Напрямую: `docker inspect --format '{{.State.Health.Status}}' compose-demo-db-1` (выведет `healthy`).
4. Проверка всегда завершается ошибкой. После `retries` неудачных проверок подряд (около 25 секунд при
   `interval: 5s`) контейнер получает статус `unhealthy`, `up -d` завершается ошибкой
   `dependency failed to start: container … is unhealthy`, api не стартует.
5. Redis запускается почти мгновенно. К тому же api при недоступном кэше не падает, а отвечает
   `"cache":false`. Для Postgres такого запаса нет, поэтому ему нужна проверка готовности.
</details>

---

## Упражнение 5. Тома и жизненный цикл стека

В проекте `compose-demo` есть сервис `db` с томом `pgdata` на `/var/lib/postgresql/data`.
Выполняют команды по порядку:

```bash
docker compose up -d
docker compose exec db psql -U app -d app -c \
  "CREATE TABLE students(name text); INSERT INTO students VALUES ('Ivan');"
docker compose stop            # шаг A
docker compose start           # шаг B
docker compose down            # шаг C
docker compose up -d           # шаг D
docker compose down -v         # шаг E
docker compose up -d           # шаг F
docker compose exec db psql -U app -d app -c "SELECT * FROM students;"
```

Ответьте на вопросы:

1. Заполните таблицу: после каждого шага укажите, что с контейнерами, что с томом и что вернёт `SELECT * FROM students;` (если базу можно спросить).
2. Как называется том и какой командой его увидеть?
3. Коллега склонировал репозиторий в папку `backend` и запустил `docker compose up -d`. Увидит ли он таблицу `students`, которая была у вас? Как сделать, чтобы имя проекта не зависело от папки?
4. В другом проекте том смонтирован так: `pgdata:/data`. Данные пропали после `down` и `up`. Почему?

<details>
<summary>Решение</summary>

1.

   | Шаг | Контейнеры | Том `pgdata` | `SELECT * FROM students;` |
   |-----|-----------|--------------|---------------------------|
   | A. `stop` | остановлены (видны в `ps -a`) | на месте | базу не спросить: контейнер остановлен |
   | B. `start` | запущены те же контейнеры | на месте | `Ivan` |
   | C. `down` | удалены вместе с сетью | на месте | базу не спросить: контейнеров нет |
   | D. `up -d` | созданы заново | тот же | `Ivan` |
   | E. `down -v` | удалены | удалён | базу не спросить |
   | F. `up -d` | созданы заново | создан новый, пустой | `ERROR:  relation "students" does not exist` |

2. `compose-demo_pgdata`: имя тома — `<проект>_<том>`. Увидеть: `docker volume ls`
   (например, `docker volume ls | grep compose-demo`).
3. Нет. Проект называется `backend`, поэтому том будет `backend_pgdata`: новый и пустой. Чтобы имя не
   зависело от папки, задайте его явно: `docker compose -p compose-demo up -d` или `name: compose-demo`
   в начале `compose.yaml`.
4. Postgres пишет данные в `/var/lib/postgresql/data`, а `pgdata` смонтирован в `/data`, куда никто
   не пишет. Данные оказываются вне именованного тома, и новый контейнер после `down` стартует с пустой базой.
   Том нужно монтировать в `/var/lib/postgresql/data`.
</details>

---

## Упражнение 6. Разберите вывод `docker compose ps -a`

Вы подняли стек в папке `shop` командой `docker compose up -d`.

```
NAME           IMAGE         COMMAND                  SERVICE   CREATED         STATUS                     PORTS
shop-api-1     shop-api      "uvicorn main:app --…"   api       3 minutes ago   Exited (1) 3 minutes ago
shop-cache-1   redis:7       "docker-entrypoint.s…"   cache     3 minutes ago   Up 3 minutes               6379/tcp
shop-db-1      postgres:16   "docker-entrypoint.s…"   db        3 minutes ago   Up 3 minutes (healthy)     5432/tcp
```

Первые строки `docker compose logs api`:

```
api-1  | Traceback (most recent call last):
api-1  |   File "/app/main.py", line 7, in <module>
api-1  |     R = redis.from_url(os.environ["REDIS_URL"])
api-1  | KeyError: 'REDIS_URL'
```

Ответьте на вопросы:

1. Какой сервис упал и что значит `Exited (1)`? Чем это отличается от `Exited (137)` из лекции 7?
2. Почему у `shop-db-1` есть `(healthy)`, а у `shop-cache-1` нет?
3. В чём причина падения? Какой командой проверить, какие переменные Compose передаёт в api, не запуская его? Что сделать после исправления yaml и нужна ли пересборка?
4. `docker compose exec api sh` отвечает `service "api" is not running`. Как всё-таки зайти в окружение api?
5. В `compose.yaml` есть сервис `adminer` с `profiles: [tools]`, но в выводе его нет. Почему? Как его запустить и как потом убрать?

<details>
<summary>Решение</summary>

1. Упал `api`. `Exited (1)` значит, что процесс сам завершился с ошибкой (здесь — необработанное исключение
   Python). Код 137 означает, что процесс убит сигналом KILL, чаще всего ядром за превышение лимита памяти.
2. Статус `healthy` / `unhealthy` появляется, только если у сервиса задан `healthcheck`. У `db` он есть,
   у `cache` нет.
3. `main.py` читает `os.environ["REDIS_URL"]` при импорте, а в контейнер переменная не попала: её нет
   в `environment` сервиса api (опечатка в имени или она записана не у того сервиса). Проверить, что Compose прочитал
   на самом деле: `docker compose config`. После исправления достаточно `docker compose up -d`: конфигурация
   сервиса изменилась, и Compose пересоздаст api. Образ не менялся, поэтому `--build` не нужен.
4. `exec` работает только с запущенным контейнером. Запустите новый разовый контейнер того же сервиса:
   `docker compose run --rm api sh` и выполните `env | grep REDIS`. Это не вход в упавший контейнер: причину падения
   надо искать в `docker compose logs api`.
5. Сервис с `profiles` не стартует, пока профиль не включён. Запуск: `docker compose --profile tools up -d`
   (или `COMPOSE_PROFILES=tools`). Остановить и удалить вместе с остальными: `docker compose --profile tools down`,
   без `--profile` команда `down` adminer не тронет.
</details>
