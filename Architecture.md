# Архитектура мессенджера

**Техническое описание системы**

---

## 1. Обзор

Легковесный мессенджер с минимальными зависимостями. Сервер на Go + SQLite, клиент — браузерный SPA на чистом JS/CSS/HTML. Асимметричное шифрование RSA-OAEP защищает сообщения, bcrypt хэширует пароли.

**Ключевые принципы:**
- Минимум внешних зависимостей
- Стандартные библиотеки Go
- Web Crypto API в браузере
- SQLite как встроенная БД

---

## 2. Структура проекта

```
project/
├── Server/                      # Серверная часть (Go)
│   ├── main.go                  # Точка входа
│   ├── handlers/                # HTTP-обработчики
│   │   ├── auth.go              # Регистрация/логин
│   │   ├── messages.go          # Сообщения
│   │   └── websocket.go         # Real-time
│   ├── models/                  # Структуры данных
│   │   └── user.go
│   ├── crypto/                  # Шифрование
│   │   └── rsa.go
│   ├── db/                      # База данных
│   │   └── sqlite.go
│   └── messenger.db             # Файл SQLite
│
└── Client/                      # Браузерный клиент
    ├── index.html               # Главная страница
    ├── css/
    │   └── style.css            # Стили
    └── js/
        ├── app.js               # Главный модуль
        ├── crypto.js            # Web Crypto wrapper
        ├── api.js               # HTTP клиент
        └── ui.js                # DOM управление
```

---

## 3. Архитектура сервера

### 3.1 Компоненты

| Компонент | Библиотека | Назначение |
|-----------|------------|------------|
| HTTP Server | `net/http` | REST API + статика |
| WebSocket | `golang.org/x/net/websocket` | Real-time сообщения |
| Database | `database/sql` + `github.com/mattn/go-sqlite3` | SQLite драйвер |
| Crypto | `crypto/rsa`, `crypto/bcrypt` | Шифрование + хэш |

### 3.2 Схема базы данных

```sql
-- Пользователи
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    public_key BLOB,
    private_key BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Сообщения
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    encrypted_content BLOB NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- Сессии
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 4. Архитектура клиента

### 4.1 Модули JavaScript

**app.js** — главная точка входа:
```javascript
// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    await CryptoModule.init();
    await APIModule.checkSession();
    UIModule.renderLogin();
});
```

**crypto.js** — обёртка Web Crypto API:
```javascript
const CryptoModule = {
    // Шифрование сообщения открытым ключом
    async encrypt(message, publicKeyPem) {
        const publicKey = await this.importPublicKey(publicKeyPem);
        const encoded = new TextEncoder().encode(message);
        return await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            encoded
        );
    },
    
    // Импорт открытого ключа из PEM
    async importPublicKey(pem) {
        const binary = atob(pem.replace(/-----BEGIN.*-----/g, '').replace(/\s/g, ''));
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return await crypto.subtle.importKey(
            'spki', buffer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ['encrypt']
        );
    }
};
```

**api.js** — HTTP клиент:
```javascript
const APIModule = {
    async login(username, password) {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (data.token) sessionStorage.setItem('token', data.token);
        return data;
    }
};
```

---

## 5. Система шифрования

### 5.1 Алгоритм

**RSA-OAEP 2048 бит** — асимметричное шифрование с оптимальным дополнением.

### 5.2 Распределение ключей

```
┌─────────────┐                    ┌─────────────┐
│   Сервер    │                    │   Клиент    │
├─────────────┤                    ├─────────────┤
│ private_key │◄─── хранится тут   │             │
│ public_key  │─── передаётся ───► │ public_key  │
└─────────────┘                    └─────────────┘
```

### 5.3 Процесс шифрования

1. **Регистрация:** сервер генерирует пару RSA-ключей
2. **Клиент:** получает открытый ключ, сохраняет в `localStorage`
3. **Отправка:** клиент шифрует сообщение открытым ключом
4. **Передача:** шифротекст идёт на сервер через HTTPS/WebSocket
5. **Расшифровка:** сервер расшифровывает закрытым ключом

---

## 6. Аутентификация

### 6.1 Регистрация

```
Клиент                              Сервер
  │                                   │
  │ POST /api/register                │
  │ {username, password}              │
  │──────────────────────────────────►│
  │                                   │ hash = bcrypt(password, cost=12)
  │                                   │ generate RSA keypair
  │                                   │ store user in DB
  │                                   │
  │ {token, public_key}               │
  │◄──────────────────────────────────│
```

### 6.2 Хранение паролей

```go
// Go: хэширование пароля
func hashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    return string(bytes), err
}

// Проверка пароля
func checkPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

### 6.3 Сессионный токен

```go
// Генерация токена
func generateToken() string {
    b := make([]byte, 32)
    rand.Read(b)
    return base64.URLEncoding.EncodeToString(b)
}
```

---

## 7. REST API

| Метод | Endpoint | Описание | Auth |
|-------|----------|----------|------|
| POST | `/api/register` | Регистрация пользователя | Нет |
| POST | `/api/login` | Аутентификация | Нет |
| POST | `/api/logout` | Завершение сессии | Да |
| GET | `/api/messages` | Список сообщений | Да |
| POST | `/api/messages` | Отправить сообщение | Да |
| GET | `/api/keys/:userId` | Открытый ключ пользователя | Да |
| GET | `/api/users` | Список контактов | Да |
| WS | `/ws` | WebSocket соединение | Да |

### Примеры запросов

**Регистрация:**
```bash
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"username": "user1", "password": "secret123"}'
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
| RAM | 128 MB минимум |
| Storage | 100 MB для БД |
| OS | Linux / macOS / Windows |

### Клиент (браузер)

| Браузер | Мин. версия |
|---------|-------------|
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

### Сборка сервера

```bash
cd Server
go mod init messenger
go mod tidy
go build -o messenger-server
```

### Запуск

```bash
./messenger-server \
  --port=8080 \
  --db=./messenger.db \
  --static=../Client
```

### Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `8080` | Порт сервера |
| `DB_PATH` | `./messenger.db` | Путь к БД |
| `STATIC_DIR` | `./Client` | Директория клиента |

### systemd сервис

```ini
[Unit]
Description=Messenger Server
After=network.target

[Service]
Type=simple
User=messenger
WorkingDirectory=/opt/messenger
ExecStart=/opt/messenger/messenger-server
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 10. Диаграмма архитектуры

```
                    HTTPS / WebSocket
    ┌─────────────────────────────────────────┐
    │                                         │
    ▼                                         │
┌───────────┐                           ┌─────┴─────┐
│  Browser  │                           │  Browser  │
│  (Client) │                           │  (Client) │
└─────┬─────┘                           └─────┬─────┘
      │                                       │
      │  1. Login/Register                    │
      │─────────────────────────────────────► │
      │                                       │
      │  2. Get Public Key                    │
      │─────────────────────────────────────► │
      │                                       │
      │  3. Encrypt + Send Message            │
      │─────────────────────────────────────► │
      │                                       │
      ▼                                       ▼
┌─────────────────────────────────────────────────────┐
│                    SERVER (Go)                       │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ HTTP    │  │ WebSocket│  │ Crypto Module       │ │
│  │ Handler │  │ Handler  │  │ (RSA-OAEP, bcrypt)  │ │
│  └────┬────┘  └────┬─────┘  └──────────┬──────────┘ │
│       │            │                   │            │
│       └────────────┴───────────────────┘            │
│                    │                                │
│                    ▼                                │
│           ┌───────────────┐                         │
│           │    SQLite     │                         │
│           │ (messenger.db)│                         │
│           └───────────────┘                         │
└─────────────────────────────────────────────────────┘
```

---

**Документ создан:** 2026-03-02  
**Версия:** 1.0
