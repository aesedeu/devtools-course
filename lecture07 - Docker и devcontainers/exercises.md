# Упражнения к лекции 7 - Docker

## Упражнение 1. Кэш сборки и порядок слоёв

Дан Dockerfile небольшого сервиса:

```dockerfile
FROM python:3.12-slim                  # 1
WORKDIR /app                           # 2
COPY . .                               # 3
RUN pip install -r requirements.txt    # 4
EXPOSE 8000                            # 5
CMD ["python", "main.py"]              # 6
```

Образ уже собирали, кэш есть. Ответьте на вопросы:

1. Вы поправили одну строку в `main.py` и снова запустили `docker build`. Какие шаги возьмутся из кэша,
   а какие выполнятся заново? Почему сборка идёт долго?
2. Перепишите Dockerfile так, чтобы правка `main.py` не переустанавливала зависимости.
3. Какие шаги нового Dockerfile выполнятся заново, если поменять `requirements.txt`?
4. Коллега добавил после шага 4 строку `RUN rm -rf /root/.cache/pip`. Уменьшится ли образ? Как сделать правильно?

<details>
<summary>Решение</summary>

1. Шаги 1 и 2 — из кэша. Шаг 3 `COPY . .` выполнится заново: изменился один из копируемых файлов.
   С этого места кэш больше не используется, поэтому шаг 4 `pip install` тоже выполнится заново — и это долго.
   Шаги 5 и 6 только записывают настройки образа, они быстрые.
2. Сначала копируем только список зависимостей, потом код:

   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   EXPOSE 8000
   CMD ["python", "main.py"]
   ```

   Теперь при правке `main.py` заново выполняется только последний `COPY . .`.
3. `COPY requirements.txt .`, `RUN pip install ...` и `COPY . .` — изменившийся слой и все после него.
4. Нет. Файлы кэша остались в слое шага 4, следующий слой их только скрывает. Удалять нужно в той же
   инструкции `RUN` или не создавать кэш вовсе: `pip install --no-cache-dir -r requirements.txt`.
</details>

---

## Упражнение 2. Найдите ошибки в Dockerfile

```dockerfile
FROM python:latest
ENV OPENAI_API_KEY=sk-live-1234567890
WORKDIR /app
COPY . .
RUN apt-get update
RUN apt-get install -y curl
RUN pip install -r requirements.txt
CMD ["python", "main.py"]
```

Найдите минимум четыре проблемы и напишите исправленную версию. Рядом с Dockerfile лежат папки `.venv/`,
`.git/` и файл `.env`.

<details>
<summary>Решение</summary>

1. `python:latest` — версия не зафиксирована, завтра под этим тегом окажется другой Python.
   Нужно `python:3.12-slim`.
2. Ключ API записан в образ. Его увидит любой, у кого есть образ (`docker history`, `docker inspect`).
   Секреты передают при запуске: `docker run -e OPENAI_API_KEY=...` или `--env-file .env`.
3. `COPY . .` стоит до установки зависимостей — любая правка кода переустанавливает все пакеты (упражнение 1).
4. Нет `.dockerignore`: в образ попадут `.venv/`, `.git/` и `.env` с секретами.
5. `apt-get update` и `apt-get install` в разных `RUN`. Слой с `update` закэшируется, и через месяц `install`
   возьмёт устаревший список пакетов. Их пишут в одной инструкции и там же чистят списки пакетов.
6. Контейнер работает от root.

Исправленная версия:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 1000 app
COPY --chown=app:app . .
USER app
CMD ["python", "main.py"]
```

`.dockerignore`:

```
.venv/
.git/
.env
**/__pycache__/
```

Запуск с ключом: `docker run --env-file .env myapp:0.1`.
</details>

---

## Упражнение 3. Разберите вывод `docker ps -a`

```
CONTAINER ID   IMAGE                                      COMMAND                  CREATED          STATUS                       PORTS                                 NAMES
a1b2c3d4e5f6   nginx:1.30                                 "/docker-entrypoint.…"   3 minutes ago    Up 3 minutes                 0.0.0.0:80->80/tcp, [::]:80->80/tcp   nginx_balancer
b2c3d4e5f6a1   nginx:1.30                                 "/docker-entrypoint.…"   3 minutes ago    Up 3 minutes (healthy)       80/tcp                                nginx_static_1
c3d4e5f6a1b2   nginx:1.30                                 "/docker-entrypoint.…"   3 minutes ago    Up 3 minutes (unhealthy)     80/tcp                                nginx_static_2
d4e5f6a1b2c3   quay.io/prometheus/node-exporter:v1.12.1   "/bin/node_exporter …"   3 minutes ago    Up 3 minutes                 127.0.0.1:9100->9100/tcp              node_exporter
e5f6a1b2c3d4   gateway:0.1                                "python main.py"         10 minutes ago   Exited (137) 2 minutes ago                                         gateway
```

Ответьте на вопросы:

1. К каким контейнерам можно обратиться с ноутбука и по какому адресу? Можно ли зайти на `node_exporter`
   с другого компьютера в локальной сети?
2. Почему у `nginx_static_1` в статусе есть `(healthy)`, а у `nginx_balancer` нет?
3. Что значит `(unhealthy)` у `nginx_static_2`? Перезапустит ли Docker этот контейнер сам?
4. Что значит `Exited (137)` у `gateway`? Какой командой проверить, что дело в нехватке памяти?
5. Почему `gateway` не виден в выводе обычного `docker ps`?

<details>
<summary>Решение</summary>

1. `nginx_balancer` — http://localhost (порт 80 опубликован на всех интерфейсах, значит, доступен и из локальной
   сети). `node_exporter` — только http://127.0.0.1:9100: порт опубликован на loopback, с другого компьютера
   не открыть. У `nginx_static_*` написано `80/tcp` без стрелки: порт не опубликован, к ним можно попасть
   только из контейнеров той же сети.
2. Статус `healthy` / `unhealthy` появляется, только если у контейнера задан healthcheck. В `docker-compose.yml`
   семинара он есть у `nginx_static_*` и нет у `nginx_balancer`.
3. Команда проверки (у нас `curl -f http://localhost/`) несколько раз подряд завершилась ошибкой. Docker только
   меняет статус, перезапуска нет. Nginx-балансировщик про этот статус не знает: он исключит бэкенд сам,
   если запросы к нему начнут падать (`max_fails`, `fail_timeout`).
4. 137 = 128 + 9: процесс убит сигналом KILL. Чаще всего так ядро убивает контейнер, превысивший лимит памяти.
   Проверка: `docker inspect gateway --format '{{.State.OOMKilled}}'` — `true` значит нехватку памяти.
   Последние строки лога: `docker logs gateway`.
5. `docker ps` показывает только запущенные контейнеры. Остановленные видны с флагом `-a`.
</details>

---

## Упражнение 4. Какой адрес писать

Compose-проект из двух сервисов:

```yaml
services:
  gateway:
    build: .
    ports:
      - "8000:8000"
  vllm:
    image: vllm/vllm-openai:v0.32.0
    # порт 8080 внутри контейнера, наружу не опубликован
```

Кроме того, на самом ноутбуке (не в Docker) запущен `llama-server` на порту 8081.

Напишите адрес для каждого случая:

1. gateway обращается к vLLM;
2. gateway обращается к `llama-server` на ноутбуке;
3. вы из терминала ноутбука обращаетесь к gateway;
4. вы из терминала ноутбука хотите проверить `/health` у vLLM;
5. Prometheus, добавленный в этот же compose, собирает метрики gateway с пути `/metrics`.

И объясните: почему с `LLM_RAW=http://localhost:8080` gateway получает `Connection refused`?

<details>
<summary>Решение</summary>

1. `http://vllm:8080` — имя сервиса в общей сети Compose.
2. `http://host.docker.internal:8081`. На Linux это имя нужно добавить в сервис:
   `extra_hosts: ["host.docker.internal:host-gateway"]`, а сервер должен слушать `0.0.0.0`.
3. `http://localhost:8000` — порт опубликован `8000:8000`.
4. Напрямую никак: порт 8080 не опубликован. Варианты: добавить `ports: ["8080:8080"]` (лучше
   `"127.0.0.1:8080:8080"`) или проверить из контейнера в той же сети:
   `docker run --rm --network <имя_проекта>_default curlimages/curl -s http://vllm:8080/health`.
5. `http://gateway:8000/metrics` (в `prometheus.yml`: `targets: ['gateway:8000']`).

`localhost` внутри контейнера gateway — это сам контейнер gateway. На его порту 8080 никто не слушает,
поэтому соединение отклонено.
</details>

---

## Упражнение 5. Свой образ вместо bind mount (нужен запущенный Docker)

На семинаре страница попадала в nginx через bind mount. Теперь положите её внутрь образа.

1. В каталоге `4_docker/4_1_introduce_docker` создайте файл `Dockerfile.chat`: образ на основе `nginx:1.30`,
   в который скопирована страница `nginx_container_3/index.html` на место `/usr/share/nginx/html/index.html`.
2. Соберите образ `chat-page:0.1`, запустите контейнер с портом 8081 на ноутбуке и проверьте заголовок страницы через `curl`.
3. Посмотрите `docker history chat-page:0.1`. Сколько слоёв добавил ваш Dockerfile поверх `nginx:1.30`?
4. Чем этот способ отличается от bind mount? Когда какой удобнее?

<details>
<summary>Решение</summary>

`Dockerfile.chat`:

```dockerfile
FROM nginx:1.30
COPY nginx_container_3/index.html /usr/share/nginx/html/index.html
```

Команды:

```bash
cd 4_docker/4_1_introduce_docker
docker build -f Dockerfile.chat -t chat-page:0.1 .
docker run -d --rm --name chat -p 8081:80 chat-page:0.1
curl -s localhost:8081 | grep title
docker history chat-page:0.1 | head -3
docker stop chat
```

`curl` выводит заголовок страницы из `nginx_container_3/index.html`:

```
    <title>LLM Chat Interface</title>
```

В `docker history` верхняя строка — инструкция `COPY nginx_container_3/index.html ...` размером около 11,6 kB
(размер файла 11 557 байт). Это единственный новый слой, всё ниже — слои `nginx:1.30`.

Отличие: при bind mount файл берётся с диска хоста в момент запуска, и правка видна сразу без пересборки — удобно
при разработке. Здесь страница внутри образа: образ самодостаточен, его можно отправить в registry и запустить
на другой машине без файлов проекта, но после правки страницы нужно пересобрать образ. Так собирают образы для прода.
</details>
