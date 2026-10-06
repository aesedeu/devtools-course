# Лекция 5. Сеть: SSH, порты, HTTP, WebSocket, gRPC

**Материалы:** [презентация](lecture06-network.pptx) · [семинар](семинар.md)

## Зачем
Сервисы общаются по сети. Нужно понимать протоколы, прежде чем поднимать API и ботов.

## Инструменты
ssh, `curl`, `ss`, HTTP, WebSocket, gRPC/protobuf.

## Теория
- Модель TCP/IP кратко: IP, порты, TCP vs UDP, сокеты.
- **SSH:** асимметричная криптография, ключевая пара, `ssh-keygen`, `authorized_keys`, проброс портов (local/remote forwarding), `scp`/`rsync`.
- **HTTP:** запрос/ответ, методы, статусы, заголовки, REST-семантика, HTTP/1.1 vs HTTP/2.
- **Real-time модели:** short polling, long polling, **WebSocket** (полнодуплекс) — когда что применять.
- **gRPC:** RPC-парадигма, protobuf, HTTP/2, стриминг; чем отличается от REST.
- Порты в контексте контейнеров (мостик к Docker).

## Практика
Генерация ключей и вход по SSH, проброс портов, исследование HTTP через `curl`, сравнение polling vs WebSocket на живом примере, простой gRPC-вызов.
