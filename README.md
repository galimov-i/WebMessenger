# WebMessenger

Легковесный мессенджер с **end-to-end шифрованием** на базе RSA-OAEP.

![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat&logo=go)
![License](https://img.shields.io/badge/License-MIT-green)

## Возможности

- 🔒 **End-to-end шифрование** — сервер не видит содержимое сообщений
- ⚡ **Real-time сообщения** — WebSocket для мгновенной доставки
- 🔑 **Клиентская генерация ключей** — RSA ключи создаются в браузере
- 🗄️ **SQLite база данных** — встроенная БД без внешних зависимостей
- 🌐 **Браузерный клиент** — чистый HTML/CSS/JS без фреймворков

## Структура проекта

```
WebMessenger/
├── Server/                 # Серверная часть (Go)
│   ├── main.go            # Точка входа
│   ├── handlers/          # HTTP обработчики
│   │   ├── auth.go        # Регистрация, вход
│   │   ├── messages.go    # Сообщения
│   │   └── websocket.go   # WebSocket
│   ├── models/            # Модели данных
│   ├── crypto/            # Криптография
│   └── db/                # SQLite
│
├── Client/                # Клиентская часть
│   ├── index.html        # Главная страница
│   ├── css/style.css     # Стили
│   └── js/
│       ├── app.js        # Логика приложения
│       ├── crypto.js     # Web Crypto API
│       ├── api.js        # HTTP клиент
│       └── ui.js         # UI компоненты
│
├── server.sh             # Скрипт запуска сервера
├── BUILD.md              # Инструкция по сборке
└── Architecture.md       # Архитектура системы
```

## Требования

### Сервер
- **Go 1.21+** — [скачать](https://go.dev/dl/)

### Клиент
- Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- Поддержка Web Crypto API

## Быстрый старт

### 1. Клонирование

```bash
git clone https://github.com/galimov-i/WebMessenger.git
cd WebMessenger
```

### 2. Запуск сервера

```bash
cd Server
go mod tidy
go build -o messenger .
./messenger -port 8080 -db ./messenger.db -static ../Client
```

### 3. Использование

Откройте в браузере: **http://localhost:8080**

1. Зарегистрируйте нового пользователя
2. Войдите в систему
3. Выберите пользователя из списка
4. Отправьте сообщение

## Как работает шифрование

```
1. Регистрация: клиент генерирует RSA-2048 ключи
2. Публичный ключ → сервер (сохраняется в БД)
3. Закрытый ключ → localStorage браузера
4. Отправка: шифрование публичным ключом ПОЛУЧАТЕЛЯ
5. Сервер: сохраняет зашифрованное сообщение
6. Получатель: расшифровывает своим закрытым ключом
```

```
┌─────────────┐                    ┌─────────────┐
│   Клиент A  │                    │   Клиент B  │
├─────────────┤                    ├─────────────┤
│ private_key │ ◄─── генерируется  │ private_key │
│ public_key  │ ──────► сервер ◄───│ public_key  │
└─────────────┘                    └─────────────┘
```

## API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/register` | Регистрация |
| POST | `/api/login` | Вход |
| POST | `/api/logout` | Выход |
| GET | `/api/me` | Текущий пользователь |
| GET | `/api/users` | Список пользователей |
| GET | `/api/keys/:id` | Публичный ключ |
| GET | `/api/messages?with=:id` | Сообщения |
| POST | `/api/messages` | Отправить сообщение |
| WS | `/ws?token=:token` | WebSocket |

## Запуск на VPS

См. [BUILD.md](BUILD.md) для подробной инструкции.

```bash
# Базовые шаги
cd Server
go build -o messenger .
./messenger -port 8080 -static ../Client

# Для автозапуска настройте systemd
```

## Зависимости

### Сервер
- `github.com/gorilla/websocket` — WebSocket
- `github.com/mattn/go-sqlite3` — SQLite
- `golang.org/x/crypto` — bcrypt

### Клиент
- Без внешних зависимостей
- Web Crypto API

## Лицензия

MIT License — подробнее в файле LICENSE.
