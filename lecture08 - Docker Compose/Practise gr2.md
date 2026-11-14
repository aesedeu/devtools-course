# Docker Compose. Практика

[Теория](<Theory gr2.md>)

Соберём приложение по шагам: API с JSON → том → PostgreSQL → веб-страница. Затем проверим сбои, сохранность данных, рестарт и лимиты. Все команды выполняются **на ВМ**. Adminer, подробный журнал проверок и резервная копия вынесены в дополнения после основного маршрута.

### 1. Один сервис вместо одной команды docker run

Перейдём в подготовленную папку:

```bash
cd ~/devtools-compose/examples
ls -a
```

Начинаем с JSON API: `json_app.py` и обычного `Dockerfile`. Прочитаем сборку и зависимости:

```bash
cat Dockerfile
cat requirements.txt
```
<!-- check: read-dockerfile -->

Находим установку зависимостей, копирование кода и запуск Uvicorn. Описываем один сервис:

```yaml
name: lecture08-notes
services:
  api:
    build: .
    ports:
      - "127.0.0.1:18082:8000"
```

`build: .` выбирает текущую папку проекта и её `Dockerfile`; `ports` публикует API на порту ВМ `18082`.

Рабочий файл – `compose.yaml`. Команды `cp` берут готовую версию из `steps/` после разбора изменения и **заменяют рабочий файл**: собственные правки предварительно сохраняйте. Снимки через `-f steps/...` не запускаем, чтобы не менять базовую папку относительных путей.

```bash
cp steps/01-api.yaml compose.yaml
docker compose config --quiet
docker compose config --services
```
<!-- check: simple-config -->

`--quiet` проверяет описание без вывода нормализованного файла, `--services` выводит имена сервисов. Пока получим только `api`.

Запустим его:

```bash
docker compose up -d --build
docker compose ps
```
<!-- check: simple-up -->

В `ps` видим запущенный API. Его контейнером управляет обычный Docker Engine.

Проверим HTTP и создадим заметку. Пока сервер запускается, `--retry 5` разрешает до пяти повторов GET-запроса, а `--retry-all-errors` включает ошибки соединения.

```bash
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/health
curl -fsS http://127.0.0.1:18082/notes \
  -H 'Content-Type: application/json' \
  -d '{"text":"Первая заметка в JSON"}'
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: json-note -->

Находим одну заметку по `id` в ответах POST и GET. Создание автоматически не повторяем, чтобы не получить дубликат. Знакомые `-H` и `-d` задают заголовок и тело POST; `-fsS` оставляет ошибки и убирает индикатор передачи.

Повторим `up` без изменения файла. Сравним ID контейнера до и после: `ps -q api` выводит только его идентификатор.

```bash
docker compose ps -q api
docker compose up -d
docker compose ps -q api
```
<!-- check: repeated-up -->

ID прежний: нужный контейнер уже работает, пересоздавать или перезапускать его не понадобилось.

#### Логи и команды внутри API

Посмотрим сообщения сервера. В логах найдём и запуск Uvicorn, и наши HTTP-запросы:

```bash
docker compose logs --tail 15 api
```
<!-- check: api-logs -->

Чтобы видеть новые сообщения по мере появления, включим наблюдение:

```bash
docker compose logs -f --tail 5 api
```
<!-- check: follow-logs -->

Откройте `http://127.0.0.1:18082/docs` через подготовленный SSH-туннель: появится новая строка запроса. Затем нажмите `Ctrl+C`. Мы закрыли просмотр логов; API продолжает работать.

Теперь откроем дополнительную оболочку **в контейнере**:

```bash
docker compose exec api sh
```
<!-- check: shell-enter -->

Следующие команды вводим уже в ней:

```bash
pwd
python --version
exit
```
<!-- check: shell-inside -->

Увидим `/app` и версию Python из образа. `exit` завершает только оболочку и возвращает нас на ВМ.

#### Остановка и перезапуск

Сохраним ID контейнера для сравнения и остановим API:

```bash
docker compose ps -q api
docker compose stop api
docker compose ps -a
```
<!-- check: stop-json-api -->

`-q` показывает только ID, `-a` включает остановленные контейнеры. Статус станет `Exited`; контейнер и его файлы всё ещё существуют.

Короткий опыт с `curl`: запросим остановленный API с двумя повторами и паузой `--retry-delay 1`:

```bash
curl -fsS --retry 2 --retry-all-errors --retry-delay 1 \
  http://127.0.0.1:18082/health
```
<!-- check: retry-stopped-api -->

Ожидаем три ошибки `curl: (7)`: первую попытку и два повтора. Повторный запрос не запускает сервер; команда закончится ошибкой. Без `--retry-all-errors` такой отказ по умолчанию не повторяется.

Возобновим тот же контейнер и повторим запрос уже успешно:

```bash
docker compose start api
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/notes
docker compose ps -q api
```
<!-- check: start-json-api -->

ID и заметка сохранились: `start` возобновил прежний контейнер. Теперь проверим, что произойдёт при его замене.

### 2. Данные отдельно от контейнера

Пока JSON лежит в изменяемом слое контейнера. При его удалении заметка потеряется. Подключим том в `/data`, куда пишет наше приложение. К описанию добавляются два небольших блока:

```yaml
services:
  api:
    volumes:
      - jsondata:/data
volumes:
  jsondata:
```

Это фрагмент изменения: прежние `build` и `ports` сохраняются. Внешний `volumes` объявляет том, внутренний подключает его к API.

Проверим, зачем нужно внешнее объявление. Скопируем версию с томом:

```bash
cp steps/02-json-volume.yaml compose.yaml
```
<!-- check: prepare-missing-volume -->

Откройте `nano compose.yaml` и временно удалите **только две последние строки**: верхнеуровневый `volumes:` и вложенный `jsondata:`. Строку `- jsondata:/data` у API оставьте. Сохраним файл и проверим:

```bash
docker compose config --quiet
```
<!-- check: missing-volume -->

Ожидаем ошибку с текстом `refers to undefined volume jsondata`. Ссылка есть, а ресурс не объявлен. Проверка не меняет уже работающий контейнер. Вернём правильное описание и применим его:

```bash
cp steps/02-json-volume.yaml compose.yaml
docker compose up -d
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/notes
```
<!-- check: json-volume -->

Compose пересоздаёт API с новой настройкой. Старый JSON из изменяемого слоя прежнего контейнера в новый том **не переносится**. При первом прохождении список пуст; при повторном здесь могут быть записи из уже существующего тома.

Создадим запись уже в томе и проверим заменой контейнера:

```bash
curl -fsS http://127.0.0.1:18082/notes \
  -H 'Content-Type: application/json' \
  -d '{"text":"Эта заметка живёт в томе"}'
docker compose up -d --force-recreate api
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/notes
```
<!-- check: json-volume-note -->

`--force-recreate` требует создать контейнер заново, даже если описание не менялось. Запись с тем же `id` остаётся: новый контейнер подключил прежний `jsondata`.

Том сохраняет данные при замене контейнера; JSON API по-прежнему нужен этот файл с состоянием.

### 3. Добавляем базу как отдельный сервис

Запустим PostgreSQL отдельно. API пока продолжает писать JSON: добавление базы не меняет его код.

Пароль подготовлен на ВМ в `~/devtools-compose/examples/secrets/db_password.txt`. Файл исключён из Git; проверим, что он существует и непустой, не выводя содержимое:

```bash
test -s secrets/db_password.txt && printf 'Файл пароля подготовлен\n'
```
<!-- check: password-file -->

`test -s` проверяет непустой файл. Если сообщения нет, подготовка не завершена. Уже используемый пароль не заменяем: это не изменит пароль пользователя в существующей базе.

В `services`, рядом с `api`, добавляем `db`:

```yaml
  db:
    image: postgres:17-bookworm
    environment:
      POSTGRES_USER: notes
      POSTGRES_DB: notes
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
```

Образ готовый. Пользователь и база называются `notes`, пароль берётся из подготовленного файла. Это первоначальные настройки PostgreSQL, а не параметры API.

На верхнем уровне дополняем ресурсы проекта:

```yaml
volumes:
  jsondata:
  pgdata:
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

У каждого хранилища свой том: JSON-файл остаётся в `jsondata`, файлы PostgreSQL попадут в `pgdata`. Публиковать порт базы на ВМ не требуется.

`file` выбирает файл на ВМ. `secrets` у сервиса подключает его в контейнер как `/run/secrets/db_password`; `POSTGRES_PASSWORD_FILE` указывает PostgreSQL этот путь. Это один секрет, доступный по разным путям.

```bash
cp steps/03-database.yaml compose.yaml
docker compose config --quiet
docker compose up -d db
```
<!-- check: add-db -->

Теперь контейнеров два. При первом запуске база ещё создаёт служебные файлы. Проверим готовность из её контейнера:

```bash
docker compose exec -T db pg_isready -h 127.0.0.1 -U notes -d notes
```
<!-- check: db-ready -->

Если видим `rejecting connections` или `no response`, повторяем эту команду через несколько секунд. Это ожидаемая стадия инициализации. Когда получим `accepting connections`, выполним простой запрос:

```bash
docker compose exec -T db psql -U notes -d notes -c 'SELECT 1;'
```
<!-- check: db-sql -->

`exec` запускает команду внутри существующего контейнера, `-T` отключает выделение терминала. `psql` – клиент PostgreSQL: `-U` выбирает пользователя, `-d` – базу, `-c` – SQL-запрос. Результат `1` подтверждает, что база принимает запросы. API ещё не обращается к ней.

### 4. Подключаем API к PostgreSQL

Мы вручную дождались базы. Но после общего запуска это ожидание должно работать само. Добавим `healthcheck` **сервису `db`**:

```yaml
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-U", "notes", "-d", "notes"]
      interval: 2s
      timeout: 3s
      retries: 30
```

Теперь знакомую проверку будет повторять Docker. Применим её и дождёмся успешного состояния базы:

```bash
cp steps/04-db-health.yaml compose.yaml
docker compose up -d --wait --wait-timeout 90 db
docker compose ps
```
<!-- check: db-health -->

`--wait` ждёт готовности, `--wait-timeout 90` ограничивает ожидание 90 секундами. У базы появится `healthy`. API по-прежнему работает с JSON.

Для SQL подготовлен `postgres_app.py`. Его [postgres/Dockerfile](examples/postgres/Dockerfile) устанавливает клиентскую библиотеку базы и копирует новый код. Первый Dockerfile с JSON остаётся в корне проекта. Прочитаем новый:

```bash
cat postgres/Dockerfile
```
<!-- check: read-postgres-dockerfile -->

Теперь короткое `build: .` заменяем развёрнутой записью. `context` по-прежнему выбирает папку проекта, `dockerfile` явно выбирает файл инструкций внутри неё. Меняем описание `api`:

```yaml
  api:
    build:
      context: .
      dockerfile: postgres/Dockerfile
    ports:
      - "127.0.0.1:18082:8000"
    environment:
      PGHOST: db
      PGUSER: notes
      PGDATABASE: notes
    secrets:
      - db_password
    depends_on:
      db:
        condition: service_healthy
```

API получает адрес `db`, пароль и зависимость `service_healthy`. JSON-том ему больше не подключаем: теперь записи обслуживает PostgreSQL.

И `postgres/Dockerfile`, и пути в `COPY` отсчитываются от контекста `examples/`. Перенос Dockerfile в подпапку не меняет источник для `COPY`.

#### Действительно ли API ждёт проверку базы?

Подготовим новое описание и удалим прежние контейнеры, **сохранив тома**. Так увидим именно новый запуск, а не поведение уже работающего API:

```bash
docker compose down
cp steps/05-postgres-api.yaml compose.yaml
```
<!-- check: prepare-dependency -->

Сделаем одну намеренную ошибку в проверке. В `nano compose.yaml` заменим блок `healthcheck` **у `db`** на:

```yaml
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-p", "1", "-U", "notes", "-d", "notes"]
      interval: 2s
      timeout: 3s
      retries: 3
```

Флаг `-p` у `pg_isready` задаёт порт. PostgreSQL работает на `5432`, а проверка теперь обращается к `1`. Число неудач уменьшили до трёх, чтобы не ждать минуту. Сам сервер базы мы не меняли. Запустим проект:

```bash
docker compose up -d --build --wait --wait-timeout 30
```
<!-- check: blocked-dependency -->

Эта команда **должна завершиться ошибкой**: после трёх неудач база получает `unhealthy`, а условие `service_healthy` не позволяет запустить API. Посмотрим состояние и проверим настоящий порт:

```bash
docker compose ps -a
docker compose exec -T db pg_isready -h 127.0.0.1 -p 5432 -U notes -d notes
```
<!-- check: inspect-dependency -->

API не запущен, хотя база на правильном порту сообщает `accepting connections`. Ошибка в проверке: Compose опирается на её результат.

Вернём правильную проверку копированием исходной версии. Теперь запускаем тот же проект успешно:

```bash
cp steps/05-postgres-api.yaml compose.yaml
docker compose up -d --build --wait --wait-timeout 90
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/health
```
<!-- check: postgres-api -->

HTTP подтвердил готовность API. JSON-запись **не переехала в PostgreSQL**. Старый `jsondata` остаётся в Docker, но из описания проекта он убран; в этой версии объявлен только `pgdata`.

Создадим новую запись через API и найдём её непосредственно в базе:

```bash
curl -fsS http://127.0.0.1:18082/notes \
  -H 'Content-Type: application/json' \
  -d '{"text":"Проверить сохранность заметки"}'
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: create-note -->

```bash
docker compose exec -T db psql -U notes -d notes \
  -c 'SELECT id, text FROM notes;'
```
<!-- check: sql -->

В SQL-результате находим тот же `id`. Теперь два контейнера участвуют в одной операции: API принимает HTTP-запрос, PostgreSQL сохраняет заметку.

API теперь не хранит заметки у себя: постоянное состояние находится в PostgreSQL и томе `pgdata`.

#### Проверяем готовность самого API

Мы пока проверяли ответ API вручную. Автоматизируем и это: добавим **сервису `api`** проверку `/health` и явно оставим автоматический перезапуск выключенным:

```yaml
    restart: "no"
    healthcheck:
      test: ["CMD", "python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=2)"]
      interval: 2s
      timeout: 3s
      retries: 3
      start_period: 10s
```

Проверка выполняется внутри API. Его `/health` теперь делает запрос `SELECT 1` к базе, поэтому проверяем и HTTP, и соединение с PostgreSQL.

```bash
cp steps/06-api-health.yaml compose.yaml
docker compose up -d --wait --wait-timeout 90
docker compose ps
```
<!-- check: api-health -->

Теперь `healthy` должно быть у обоих сервисов. Именно такую готовность ждёт `--wait`, когда у сервиса есть `healthcheck`.

### 5. Добавляем свою страницу

Заметки уже можно сохранять через API. Теперь сделаем это удобным для человека: подключим готовую страницу с полем ввода, кнопкой «Добавить» и списком заметок.

Посмотрим, что она собирается отдельно от Python:

```bash
cat frontend/Dockerfile
```

У API остаётся его Dockerfile, у страницы – свой. Добавим в `services` ещё один блок:

```yaml
  frontend:
    build: ./frontend
    ports:
      - "127.0.0.1:${FRONTEND_PORT:-18084}:80"
    depends_on:
      api:
        condition: service_healthy
```

`build: ./frontend` выбирает папку с Dockerfile и файлами страницы. На её порт `80` направляем порт ВМ `18084`; значение можно задать в `.env` через `FRONTEND_PORT`. Фронтенд запускается после готовности API.

Одновременно сделаем порт API настраиваемым: вместо `"127.0.0.1:18082:8000"` используем `"127.0.0.1:${APP_PORT:-18082}:8000"`. Применим подготовленный шаг и посмотрим, откуда Compose получает числа:

```bash
cp steps/07-frontend.yaml compose.yaml
test -f .env || cp .env.example .env
cat .env
docker compose config
```
<!-- check: env-config -->

`test -f ... || cp ...` сохраняет существующий `.env` или создаёт его из примера. В нём только три номера портов; в `config` они уже подставлены вместо `${...}`.

Переопределим порт только для чтения конфигурации:

```bash
APP_PORT=28082 docker compose config
```
<!-- check: env-override -->

В описании получился `28082`, но работающий контейнер не изменился. Следующая команда без присваивания снова использует подготовленные порты из `.env`.

```bash
docker compose up -d --build --wait --wait-timeout 90
docker compose ps
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18084/api/health
```
<!-- check: frontend -->

Последний запрос проходит через Nginx к API, а API проверяет базу. У `frontend` сейчас проверяется только состояние `running`: собственного `healthcheck` ему не добавляли.

Попала ли `APP_PORT` в окружение Python?

```bash
docker compose exec -T api python -c 'import os; print(os.getenv("APP_PORT", "не передана"))'
```
<!-- check: env-container -->

Получим `не передана`: переменная нужна Compose, а в `environment` API её нет. Сервер слушает `8000`.

При работающем SSH-туннеле откроем **на вашей машине** `http://127.0.0.1:18084`. Уже созданная SQL-заметка видна на странице. Добавим ещё одну и нажмём «Обновить». В браузере теперь выполняется та же операция POST и GET, которую мы делали через `curl`.

Можно проверить весь путь и из терминала:

```bash
curl -fsS http://127.0.0.1:18084/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"text":"Запись через веб-сервер"}'
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: frontend-note -->

Запрос отправили на порт фронтенда, а прочитали запись напрямую через API. Отдельные образы вместе обслуживают одно приложение; данные по-прежнему находятся в PostgreSQL.

#### Проверяем адреса изнутри и снаружи

Посмотрим созданную сеть проекта:

```bash
docker network inspect lecture08-notes_default --format '{{.Driver}}'
```
<!-- check: bridge-network -->

Получим `bridge`. Проверим адрес базы внутри этой сети и опубликованный порт API:

```bash
docker compose exec -T api python -c 'import socket; print(socket.gethostbyname("db"))'
docker compose port api 8000
```
<!-- check: network -->

`socket.gethostbyname` найдёт текущий IP базы по имени `db`. В настройки сохраняем имя, не IP. Вторая команда покажет `127.0.0.1:18082` для доступа с ВМ; API обращается к базе внутри сети по `db:5432`.

### 6. База недоступна, но API ещё работает

Что увидим, если остановить только PostgreSQL?

```bash
docker compose stop db
curl -i --max-time 5 http://127.0.0.1:18082/health
docker compose logs --tail 15 api
```
<!-- check: stop-db -->

`curl -i` показывает HTTP-заголовки вместе с телом, `--max-time 5` ограничивает запрос пятью секундами. Здесь **ожидаем HTTP 500**: сервер API жив и отвечает, но его обращение к базе не удалось. Это намеренно созданная неисправность.

Страница фронтенда при этом может открываться, но её кнопка «Обновить» покажет ошибку загрузки заметок. Наличие HTML-страницы ещё не означает работоспособность всей цепочки.

Через несколько проверок повторим:

```bash
docker compose ps -a
```
<!-- check: unhealthy -->

У API появится `unhealthy`, но процесс останется запущенным. Обычно нужно 10–20 секунд: ориентируемся на состояние, а не секундомер. При `interval: 2s` и `retries: 3` Docker ждёт три последовательные неудачи. Проверка обнаружила проблему, но не запустила базу заново. Подробный журнал посмотрим в дополнении.

Вернём PostgreSQL и дождёмся готовности:

```bash
docker compose up -d --wait --wait-timeout 90 db
curl -fsS --retry 5 http://127.0.0.1:18082/health
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: recover-db -->

Ждём именно `db`: у API до следующей проверки ещё может оставаться `unhealthy`. Запись сохранилась, запросы снова работают. API сам открывает новое соединение; `depends_on` не переподключает его. Очередная успешная проверка вернёт `healthy`.

### 7. Удаляем контейнеры, сохраняем данные

До удаления посмотрим ID базы:

```bash
docker compose ps -q db
docker compose down
docker volume ls --filter name=lecture08-notes_pgdata
```
<!-- check: before-down -->

Контейнеры и сеть удалены, именованный том остался. Это сильнее предыдущего опыта: при `stop` сохранялись и сами контейнеры.

Создадим проект снова:

```bash
docker compose up -d --wait --wait-timeout 90
docker compose ps -q db
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: recreate -->

ID базы изменился, а `id` и текст заметки остались прежними. Данные лежали в томе, который новый контейнер подключил по тому же описанию проекта.

### 8. Применяем настройку и проверяем автоматический рестарт

Теперь хотим, чтобы Docker возобновлял API после завершения основного процесса. В `compose.yaml` **только у сервиса `api`** заменим `restart: "no"` на:

```yaml
    restart: unless-stopped
```

Файл можно открыть командой `nano compose.yaml`. Сохраняем изменение. Достаточно ли перезапустить уже созданный контейнер?

```bash
docker compose config --quiet
docker compose restart api
docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$(docker compose ps -q api)"
```
<!-- check: restart-old-config -->

`ps -q api` возвращает только ID контейнера; подстановка `$(...)` передаёт его в `docker inspect`. Формат выбирает имя политики. Пока увидим `no`: `restart` перезапустил прежний контейнер с прежними настройками.

Применим новое описание:

```bash
docker compose up -d --wait --wait-timeout 90
docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$(docker compose ps -q api)"
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: apply-restart -->

Теперь политика – `unless-stopped`, заметка сохранилась. После обновления DNS-адреса API страница тоже продолжит работать; пересборка образа не нужна.

#### Завершение процесса и автоматический рестарт

Политика у API уже равна `unless-stopped`, база работает. Проверим именно автоматическое действие Docker. Сохраним ID контейнера и дадим ему поработать не менее десяти секунд:

```bash
api_id=$(docker compose ps -q api)
sleep 10
docker inspect --format '{{.RestartCount}}' "$api_id"
```
<!-- check: restart-before -->

`RestartCount` – счётчик автоматических перезапусков. В новом контейнере обычно увидим `0`.

Попросим главный процесс API завершиться сигналом `SIGTERM` **изнутри контейнера**:

```bash
docker compose exec -T api python -c 'import os, signal; os.kill(1, signal.SIGTERM)'
```
<!-- check: terminate-api -->

У нашего сервера Uvicorn есть обработчик этого сигнала. Он завершит процесс с PID 1, но Docker не получит команду ручной остановки контейнера. Это проверка завершения процесса, не обязательно ошибки с ненулевым кодом. Команда `exec` при завершении контейнера тоже может прерваться.

Через несколько секунд проверим состояние. Между этими действиями **не выполняем** `up`, `start` или `restart`, иначе сами вмешаемся в восстановление:

```bash
docker inspect --format '{{.RestartCount}} {{.State.Status}} {{.State.Health.Status}}' "$api_id"
curl -fsS --retry 5 --retry-all-errors http://127.0.0.1:18082/health
```
<!-- check: restart-after -->

Счётчик увеличился, тот же контейнер снова работает и становится `healthy`. Теперь остановим его явно:

```bash
docker compose stop api
docker compose ps -a
```
<!-- check: manual-stop -->

API останется в `Exited`: `unless-stopped` уважает ручную остановку. Возобновим работу:

```bash
docker compose up -d --wait --wait-timeout 90
```
<!-- check: resume-api -->

### 9. Ограничиваем ресурсы API

API, база и Nginx делят одну ВМ. Ограничим ресурсы API, чтобы он не мог занять всю доступную память или всё процессорное время. К его настройкам, рядом с `restart`, добавим:

```yaml
    cpus: 0.5
    mem_limit: 256m
```

В [итоговом шаге](examples/steps/09-resources.yaml) сохранён `unless-stopped` и добавлены лимиты. Там также описан необязательный Adminer: без профиля он не запускается. Применим файл:

```bash
cp steps/09-resources.yaml compose.yaml
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90
docker inspect --format 'CPU={{.HostConfig.NanoCpus}} Memory={{.HostConfig.Memory}}' "$(docker compose ps -q api)"
docker compose stats --no-stream api
curl -fsS http://127.0.0.1:18082/notes
```
<!-- check: resource-limits -->

`NanoCpus` хранит число CPU в миллиардных долях: `500000000` означает `0.5`. Память указана в байтах: `268435456` – 256 МиБ. `stats --no-stream` показывает один снимок фактического потребления; колонка памяти содержит использование и лимит. Низкий CPU у ожидающего запросов API нормален: лимит не заставляет его потреблять ресурс.

Заметки остаются в базе. Для изменения лимитов пересборка не понадобилась; при этом одного редактирования YAML было бы недостаточно – настройки применил `up`.

### Завершаем основной маршрут

Удалим контейнеры и сеть, сохранив тома для следующего запуска:

```bash
docker compose down
```
<!-- check: core-cleanup -->

Основная практика завершена: приложение связано сетью, данные переживают замену контейнеров, а перезапуск и лимиты проверены. На этом можно остановиться.

## Дополнительно

Эти опыты можно пропустить. Если продолжаем после основного маршрута, возобновим готовый проект с прежними данными:

```bash
docker compose up -d --wait --wait-timeout 90
```
<!-- check: extras-up -->

### Adminer для просмотра таблиц

В итоговом `compose.yaml` уже описан Adminer. Это браузерный клиент PostgreSQL; включим его только на время просмотра таблиц:

```yaml
  adminer:
    image: adminer:5
    profiles: [tools]
    environment:
      ADMINER_DEFAULT_SERVER: db
    ports:
      - "127.0.0.1:${ADMINER_PORT:-18083}:8080"
    depends_on:
      db:
        condition: service_healthy
```

Для Adminer используем ещё одну настройку внешнего порта из `.env`: `${ADMINER_PORT:-18083}`. Настройки API и фронтенда сохраняются, поэтому их адреса не изменятся.

```bash
docker compose config --services
docker compose --dry-run --profile tools up -d
```
<!-- check: final-config -->

Без профиля список содержит `api`, `frontend` и `db`. Пробный запуск с профилем показывает, что к проекту добавится Adminer. Выполним его:

```bash
docker compose --profile tools up -d --wait --wait-timeout 90
docker compose --profile tools ps
```
<!-- check: adminer -->

При работающем SSH-туннеле открываем **на вашей машине** `http://127.0.0.1:18083`. Выбираем PostgreSQL, сервер `db`, пользователя `notes` и базу `notes`; вводим подготовленный пароль. В таблице `notes` находим запись.

Браузер общается с Adminer через опубликованный порт, а Adminer сам обращается к базе по `db:5432`. После просмотра инструмент можно остановить:

```bash
docker compose stop adminer
```
<!-- check: stop-adminer -->

API, фронтенд и база продолжают работать. Включение профиля не изменило их лимиты и политику рестарта.

### Подробный журнал healthcheck

`logs api` показывает вывод приложения. Результаты отдельных проверок хранятся отдельно; посмотрим их через `inspect`:

```bash
docker inspect --format '{{.State.Health.Status}} {{.State.Health.FailingStreak}}' "$(docker compose ps -q api)"
docker inspect --format '{{range .State.Health.Log}}{{println .Start .ExitCode .Output}}{{end}}' "$(docker compose ps -q api)"
```
<!-- check: health-details -->

У исправного API увидим `healthy 0`. `FailingStreak` считает последовательные неудачи и сбрасывается при успехе. В журнале `Start` – время запуска проверки, `ExitCode` – её код завершения, `Output` – вывод. Сравним время соседних запусков с `interval: 2s`.

Сейчас проверки успешны. Если повторить опыт с остановкой базы из шага 6, здесь появятся HTTP-ошибки, а после трёх неудач – `unhealthy`. После запуска базы достаточно одного успешного healthcheck для восстановления состояния. Шаблон `range` используем готовым: цель – прочитать результат проверки.

### Резервная копия PostgreSQL

Том переживает замену контейнера, но ошибочный SQL-запрос изменит данные в самом томе. Сделаем логическую копию: `pg_dump` выгружает структуру и записи базы в SQL-команды.

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U notes -d notes --no-owner --no-privileges \
  > backups/notes.sql
test -s backups/notes.sql
```
<!-- check: backup -->

`>` сохраняет вывод **на ВМ**, поскольку перенаправление выполняет её оболочка. `--no-owner` и `--no-privileges` исключают команды назначения владельцев и прав. `test -s` подтверждает только, что файл непустой. При повторном выполнении файл заменяется.

Проверим копию восстановлением в отдельную базу `notes_restore`, сохраняя исходные заметки:

```bash
docker compose exec -T db createdb -U notes notes_restore
docker compose exec -T db psql -U notes -d notes_restore -v ON_ERROR_STOP=1 \
  < backups/notes.sql
docker compose exec -T db psql -U notes -d notes_restore \
  -c 'SELECT id, text FROM notes;'
```
<!-- check: restore -->

`createdb` создаёт базу, `<` передаёт SQL-файл на вход `psql`. Терминал отключён через `-T`, чтобы передавались обычные данные. `ON_ERROR_STOP=1` требует остановиться при SQL-ошибке. В восстановленной таблице находим прежний `id` заметки.

Удалим только проверочную базу:

```bash
docker compose exec -T db dropdb -U notes notes_restore
```
<!-- check: drop-restore -->

Если при повторении `createdb` сообщает, что база уже существует, сначала проверьте её содержимое: предыдущий опыт мог остаться незавершённым. Не удаляйте её автоматически. SQL-файл содержит данные приложения; он исключён из Git, а для настоящей резервной копии его также надо хранить вне этой ВМ.

### Завершаем дополнительные опыты

Удалим контейнеры и сеть, сохранив данные для повторного запуска:

```bash
docker compose --profile tools down
```
<!-- check: cleanup -->

Если именно учебные данные больше не нужны, `docker compose --profile tools down -v` удаляет том базы из текущего проекта. Старый JSON-том уже не описан в финальном файле; его удаляют отдельно через `docker volume rm lecture08-notes_jsondata`. Обе команды осознанно удаляют данные и не являются обязательным завершением занятия.

## Дополнительно почитать

- [Compose Specification](https://docs.docker.com/reference/compose-file/) – поля полного файла.
- [Жизненный цикл `up`](https://docs.docker.com/reference/cli/docker/compose/up/) и [одноразовый `run`](https://docs.docker.com/reference/cli/docker/compose/run/).
- [Официальный образ Adminer](https://hub.docker.com/_/adminer).
