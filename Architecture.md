# Архитектура мессенджера

**Техническое описание системы**

---

## 1. Обзор

Легковесный мессенджер с end-to-end шифрованием. Сервер на Go + SQLite, клиент — браузерный SPA на чистом JS/CSS/HTML. Асимметричное шифрование RSA-OAEP 2048 бит защищает сообщения.

**Ключевые принципы:**
- End-to-end шифрование (ключи генерируются на клиенте)
- Сервер не видит содержимое сообщений
- Минимум внешних зависимостей
- SQLite как встроенная БД
- Docker контейнеризация для лёгкого развёртывания
- Аудит безопасности и защита от распространённых уязвимостей

---

## 2. Структура проекта

```
WebMessenger/
├── Server/                      # Серверная часть (Go)
│   ├── main.go                  # Точка входа
│   ├── handlers/                # HTTP-обработчики
│   │   ├── auth.go              # Регистрация/логин
│   │   ├── messages.go          # Сообщения
│   │   ├── websocket.go         # Real-time
│   │   ├── health.go            # Health check
│   │   └── health_test.go       # Тесты health
│   ├── models/                  # Структуры данных
│   │   └── user.go
│   ├── crypto/                  # Шифрование (серверное)
│   │   └── rsa.go
│   ├── db/                      # База данных
│   │   └── sqlite.go
│   ├── go.mod                   # Зависимости Go
│   └── messenger.db             # Файл SQLite
│
├── Client/                      # Браузерный клиент
│   ├── index.html               # Главная страница
│   ├── css/
│   │   └── style.css            # Стили
│   └── js/
│       ├── app.js               # Главный модуль
│       ├── crypto.js            # Web Crypto API
│       ├── api.js               # HTTP клиент
│       ├── ui.js                # DOM управление
│       ├── api.test.skip.js     # Тесты API (пропущенные)
│       ├── smoke.test.js        # Дымовые тесты
│       └── jest.setup.js        # Настройка Jest
│
├── Dockerfile                   # Docker образ сервера
├── docker-compose.yml           # Docker Compose для полного стека
├── server.sh                    # Скрипт запуска сервера
├── client.sh                    # Скрипт запуска клиента
├── test.sh                      # Скрипт запуска тестов
├── .gitignore
├── README.md
├── BUILD.md
├── Architecture.md
├── Security-Audit-Report.md     # Отчёт аудита безопасности
└── test_architecture.md         # Архитектура тестирования
```

---

## 3. Архитектура сервера

### 3.1 Компоненты

| Компонент | Библиотека | Назначение |
|-----------|------------|------------|
| HTTP Server | `net/http` | REST API + статика |
| WebSocket | `github.com/gorilla/websocket` | Real-time сообщения |
| Database | `github.com/mattn/go-sqlite3` | SQLite драйвер |
| Crypto | `golang.org/x/crypto/bcrypt` | Хэширование паролей |
| Middleware | собственная реализация | CORS, безопасные заголовки, аутентификация |

### 3.2 Схема базы данных

```sql
-- Пользователи (public_key - PEM формат)
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    public_key TEXT,              -- PEM формат открытого ключа
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Сообщения (зашифрованный контент)
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    encrypted_content BLOB NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- Сессии (токены)
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 4. Архитектура клиента

### 4.1 Модули JavaScript

```
Client/js/
├── app.js      # Инициализация, WebSocket, отправка сообщений
├── api.js      # HTTP клиент (fetch)
├── crypto.js   # Web Crypto API (RSA-OAEP, генерация ключей)
├── password-strength.js # Оценка сложности пароля
└── ui.js       # DOM манипуляции
```

### 4.2 Ключевые функции crypto.js

```javascript
// Генерация ключевой пары RSA-OAEP 2048
async function generateKeyPair() {
    return await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
}

// Шифрование сообщения
async function encrypt(message, publicKeyPEM) {
    const publicKey = await importPublicKey(publicKeyPEM);
    const encoded = new TextEncoder().encode(message);
    const encrypted = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" }, publicKey, encoded
    );
    return arrayBufferToBase64(encrypted);
}

// Расшифровка сообщения
async function decrypt(encryptedBase64, privateKeyPEM) {
    const privateKey = await importPrivateKey(privateKeyPEM);
    const decrypted = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, privateKey, base64ToArrayBuffer(encryptedBase64)
    );
    return new TextDecoder().decode(decrypted);
}
```

---

## 5. Система шифрования

### 5.1 Алгоритм

**RSA-OAEP 2048 бит + SHA-256** — асимметричное шифрование с оптимальным дополнением.

### 5.2 Распределение ключей

```
┌─────────────┐                    ┌─────────────┐
│   Сервер    │                    │   Клиент    │
├─────────────┤                    ├─────────────┤
│ public_key  │◄─── отправляет ────│ public_key  │
│   (PEM)     │                    │   (PEM)     │
│             │                    │ private_key │◄── генерируется
│             │                    │   (PEM)     │    локально
└─────────────┘                    └─────────────┘
```

### 5.3 Процесс (end-to-end)

```
1. Регистрация: клиент генерирует RSA ключи
2. Публичный ключ отправляется на сервер
3. Закрытый ключ сохраняется в localStorage браузера
4. Отправка: клиент шифрует открытым ключом ПОЛУЧАТЕЛЯ
5. Сервер получает зашифрованное сообщение, сохраняет
6. Получатель расшифровывает своим закрытым ключом
```

---

## 6. Аутентификация

### 6.1 Регистрация (клиент генерирует ключи)

```
Клиент                              Сервер
  │                                   │
  │  generate RSA keypair             │
  │  (Web Crypto API)                 │
  │                                   │
  │ POST /api/register                │
  │ {username, password, public_key}  │
  │──────────────────────────────────►│
  │                                   │ hash = bcrypt(password, cost=12)
  │                                   │ store user + public_key in DB
  │                                   │
  │ {token, public_key, user}         │
  │◄──────────────────────────────────│
  │                                   │
  │ save private_key to localStorage  │
```

### 6.2 Вход

```
Клиент                              Сервер
  │                                   │
  │ POST /api/login                   │
  │ {username, password}              │
  │──────────────────────────────────►│
  │                                   │ verify password with bcrypt
  │                                   │ generate session token
  │                                   │
  │ {token, public_key, user}         │
  │◄──────────────────────────────────│
```

### 6.3 WebSocket подключение

Токен передаётся через query-параметр (для аутентификации при установке соединения):

```
ws://localhost:8080/ws?token=<session_token>
```

Сервер проверяет токен и связывает соединение с пользователем.

---

## 7. REST API

| Метод | Endpoint | Описание | Auth |
|-------|----------|----------|------|
| POST | `/api/register` | Регистрация + отправка public_key | Нет |
| POST | `/api/login` | Аутентификация | Нет |
| POST | `/api/logout` | Завершение сессии | Да |
| GET | `/api/me` | Текущий пользователь | Да |
| GET | `/api/users` | Список пользователей | Да |
| GET | `/api/keys/:userId` | Открытый ключ пользователя | Да |
| GET | `/api/messages?with=:id` | Сообщения с пользователем | Да |
| POST | `/api/messages` | Отправить сообщение | Да |
| WS | `/ws?token=:token` | WebSocket соединение | Да |
| GET | `/health` | Health check сервера | Нет |

### Примеры

**Регистрация:**
```bash
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"username": "user1", "password": "secret123", "public_key": "-----BEGIN PUBLIC KEY-----\n..."}'
```

**Отправка сообщения:**
```bash
curl -X POST http://localhost:8080/api/messages \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"recipient_id": 2, "encrypted_content": "<base64>"}'
```

---

## 8. Системные требования

### Сервер

| Параметр | Значение |
|----------|----------|
| Go | 1.21+ |
| RAM | 128 MB |
| Storage | 100 MB для БД |
| OS | Linux / macOS / Windows |
| Docker | опционально |

### Клиент

| Браузер | Версия |
|---------|--------|
| Chrome | 60+ |
| Firefox | 55+ |
| Safari | 11+ |
| Edge | 79+ |

**Обязательные API:**
- Web Crypto API (RSA-OAEP)
- WebSocket
- Fetch API
- ES6+ (async/await)

---

## 9. Развёртывание

### Сборка и запуск

```bash
# Сервер
cd Server
go mod tidy
go build -o messenger .
./messenger -port 8080 -db ./messenger.db -static ../Client

# Клиент открыть в браузере
http://localhost:8080
```

### Docker

```bash
# Сборка образа
docker build -t webmessenger .

# Запуск
docker run -p 8080:8080 webmessenger

# Или через docker-compose
docker-compose up
```

### Параметры сервера

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `-port` | 8080 | Порт сервера |
| `-db` | ./messenger.db | Путь к БД |
| `-static` | ../Client | Директория статики |

---

## 10. Безопасность

### Меры защиты

- **Сквозное шифрование** — RSA-OAEP 2048 бит
- **Хэширование паролей** — bcrypt с cost factor 12
- **Валидация сложности паролей** — оценка сложности пароля при регистрации, блокировка слабых паролей, рекомендации по генерации
- **Защита от SQL-инъекций** — параметризованные запросы
- **Экранирование HTML** — функция `escapeHtml` на клиенте
- **Безопасные заголовки HTTP** — CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **CORS** — разрешён любой origin (для разработки)
- **Валидация сессий** — токены с ограниченным сроком действия (30 дней)
- **Аутентификация WebSocket** — проверка токена при подключении

### Аудит безопасности

Проведён аудит безопасности, выявлены и классифицированы уязвимости. Подробный отчёт доступен в файле [Security-Audit-Report.md](Security-Audit-Report.md). Рекомендации по улучшению безопасности включены в отчёт.

---

## 11. Диаграмма архитектуры

```
                    HTTPS / WebSocket
    ┌─────────────────────────────────────────┐
    │                                         │
    ▼                                         │
┌───────────┐                           ┌─────┴─────┐
│  Browser  │                           │  Browser  │
│  (User A) │                           │  (User B) │
└─────┬─────┘                           └─────┬─────┘
      │                                       │
      │  1. Register + send public_key        │
      │─────────────────────────────────────► │
      │                                       │
      │  2. Get public_key of recipient       │
      │─────────────────────────────────────► │
      │                                       │
      │  3. Encrypt with recipient's key      │
      │─────────────────────────────────────► │
      │                                       │
      │  4. WebSocket / API                   │
      │─────────────────────────────────────► │
      │                                       │
      ▼                                       ▼
┌─────────────────────────────────────────────────────┐
│                    SERVER (Go)                       │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ HTTP    │  │WebSocket │  │ Auth (bcrypt)       │ │
│  │ Handler │  │ Handler  │  │                     │ │
│  └────┬────┘  └────┬─────┘  └──────────┬──────────┘ │
│       │            │                   │            │
│       └────────────┴───────────────────┘            │
│                    │                                │
│                    ▼                                │
│           ┌───────────────┐                         │
│           │    SQLite     │                         │
│           │ (users, msgs, │                         │
│           │   sessions)   │                         │
│           └───────────────┘                         │
└─────────────────────────────────────────────────────┘
```

---

**Документ обновлён:** 2026-03-12
**Версия:** 3.0
