# Сборка и запуск мессенджера

## Требования

### Для сервера
- **Go 1.21+** — скачать с https://go.dev/dl/
- **SQLite** — встроен в драйвер, дополнительная установка не требуется
- **Docker** (опционально) — для контейнеризации

### Для клиента
- Любой современный браузер с поддержкой Web Crypto API:
  - Chrome 80+
  - Firefox 75+
  - Safari 15.4+
  - Edge 80+

---

## Быстрый старт

### 1. Клонирование репозитория

```bash
git clone https://github.com/galimov-i/WebMessenger.git
cd WebMessenger
```

### 2. Запуск сервера (нативный)

```bash
# Сделать скрипт исполняемым
chmod +x server.sh

# Запуск сервера
./server.sh
```

Сервер запустится на http://localhost:8080

#### Параметры запуска сервера

Можно указать переменные окружения или параметры:

```bash
# Изменение порта
PORT=3000 ./server.sh

# Изменение пути к базе данных
DB_PATH=/path/to/database.db ./server.sh

# Изменение директории статических файлов
STATIC_DIR=/path/to/client ./server.sh
```

### 3. Запуск через Docker

```bash
# Сборка образа
docker build -t webmessenger .

# Запуск контейнера
docker run -p 8080:8080 webmessenger

# Или с помощью docker-compose (включает клиентскую часть)
docker-compose up
```

### 4. Запуск клиента

Клиент не требует сборки — это статические файлы.

После запуска сервера откройте в браузере: **http://localhost:8080**

---

## Ручная установка (без скриптов)

### Сервер

```bash
# Переход в директорию сервера
cd Server

# Установка зависимостей
go mod tidy

# Сборка
go build -o messenger .

# Запуск
./messenger -port 8080 -db ./messenger.db -static ../Client
```

### Проверка работы сервера

```bash
# Проверка доступности
curl http://localhost:8080

# Health check
curl http://localhost:8080/health
```

---

## Структура проекта

```
messenger/
├── Server/                 # Серверная часть (Go)
│   ├── main.go            # Точка входа
│   ├── handlers/          # HTTP обработчики
│   │   ├── auth.go        # Регистрация, вход, выход
│   │   ├── messages.go    # Сообщения
│   │   └── websocket.go   # WebSocket
│   ├── models/            # Модели данных
│   ├── crypto/            # Криптография
│   └── db/                # SQLite база данных
├── Client/                # Клиентская часть
│   ├── index.html        # Главная страница
│   ├── css/
│   │   └── style.css     # Стили
│   └── js/
│       ├── crypto.js     # Web Crypto API
│       ├── api.js        # HTTP клиент
│       ├── ui.js         # Управление UI
│       └── app.js        # Логика приложения
├── Dockerfile            # Docker образ сервера
├── docker-compose.yml    # Docker Compose для полного стека
├── server.sh             # Скрипт запуска сервера
├── client.sh             # Скрипт проверки клиента
├── BUILD.md              # Этот файл
└── Security-Audit-Report.md # Отчёт аудита безопасности
```

---

## Конфигурация

### Порт сервера

По умолчанию: `8080`

Изменить можно через переменную `PORT`:

```bash
PORT=3000 ./server.sh
```

### База данных

По умолчанию: `./Server/messenger.db`

При первом запуске создаётся автоматически.

```bash
DB_PATH=/custom/path/db.sqlite ./server.sh
```

### Статические файлы

По умолчанию: `./Client`

```bash
STATIC_DIR=/path/to/html ./server.sh
```

---

## Использование мессенджера

### Регистрация

1. Откройте http://localhost:8080
2. Нажмите "Регистрация"
3. Введите имя пользователя (3-30 символов)
4. Введите пароль (минимум 4 символа)
5. Нажмите "Зарегистрироваться"

### Вход

1. Введите имя пользователя и пароль
2. Нажмите "Войти"

### Отправка сообщений

1. Выберите пользователя из списка слева
2. Введите сообщение в поле ввода
3. Нажмите "Отправить" или Enter

---

## Криптографическая защита

- **Шифрование:** RSA-OAEP 2048 бит + SHA-256
- **Пароли:** bcrypt (стоимость 12)
- **Сессии:** токены на 30 дней

### Как работает шифрование

1. При регистрации генерируется пара RSA-ключей
2. Открытый ключ сохраняется на сервере
3. Закрытый ключ сохраняется в браузере пользователя
4. Сообщение шифруется открытым ключом получателя
5. Расшифровка возможна только с закрытым ключом получателя

---

## Устранение проблем

### Ошибка: "Go не установлен"

```bash
# Проверка установки Go
go version

# Если не установлен, скачайте с https://go.dev/dl/
```

### Ошибка: "port already in use"

```bash
# Измените порт
PORT=3000 ./server.sh
```

### Ошибка: "database is locked"

Закройте другие экземпляры сервера или удалите файл базы данных:

```bash
rm Server/messenger.db
./server.sh
```

### Клиент не загружается

1. Проверьте что сервер запущен: `curl http://localhost:8080`
2. Проверьте что директория Client существует
3. Проверьте консоль браузера на ошибки

---

## Разработка

### Пересборка сервера

```bash
cd Server
go build -o messenger .
```

### Добавление зависимостей

```bash
cd Server
go get github.com/gorilla/websocket
go mod tidy
```

### Логирование

Сервер выводит логи в stdout:

```bash
./server.sh 2>&1 | tee server.log
```

---

## Запуск на VPS (Production)

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Go (если не установлен)
wget https://go.dev/dl/go1.21.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

### 2. Загрузка проекта

```bash
# Клонирование репозитория
git clone https://github.com/galimov-i/WebMessenger.git
cd WebMessenger/Server

# Или через scp с локального компьютера
# scp -r ./Server user@vps:/opt/WebMessenger/
```

### 3. Сборка сервера

```bash
cd Server
go mod tidy
go build -o messenger .
```

### 4. Запуск сервера

```bash
# Запуск в фоне
./messenger -port 8080 -db ./messenger.db -static ../Client &

# Или с проверкой
curl http://localhost:8080
```

### 5. Настройка systemd (рекомендуется)

```bash
sudo nano /etc/systemd/system/messenger.service
```

Содержимое:
```ini
[Unit]
Description=WebMessenger Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/WebMessenger/Server
ExecStart=/opt/WebMessenger/Server/messenger -port 8080 -db ./messenger.db -static ../Client
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable messenger
sudo systemctl start messenger

# Проверка статуса
sudo systemctl status messenger
```

### 6. Настройка nginx (для домена)

```bash
sudo apt install nginx

sudo nano /etc/nginx/sites-available/messenger
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/messenger /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Открытие порта в firewall

```bash
# Ubuntu (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Если без nginx, также:
sudo ufw allow 8080/tcp
```

### 8. Подключение

Откройте в браузере:
- **Без домена:** `http://IP_VPS:8080`
- **С доменом:** `http://your-domain.com`

---

## Docker развёртывание

### Сборка образа

```bash
docker build -t webmessenger .
```

### Запуск контейнера

```bash
docker run -d \
  -p 8080:8080 \
  -v /path/to/data:/app/data \
  --name messenger \
  webmessenger
```

### Docker Compose

Используйте готовый `docker-compose.yml`:

```bash
docker-compose up -d
```

### Обновление

```bash
docker-compose pull
docker-compose up -d
```

---

## Безопасность

Приложение включает следующие меры безопасности:

- Сквозное шифрование RSA-OAEP 2048 бит
- Хэширование паролей bcrypt (cost 12)
- Защита от SQL-инъекций (параметризованные запросы)
- Экранирование HTML на клиенте
- Безопасные заголовки HTTP (CSP, X-Frame-Options, X-Content-Type-Options)
- Валидация сессий и токенов

Подробный аудит безопасности доступен в файле [Security-Audit-Report.md](Security-Audit-Report.md).

---

## Лицензия

MIT License
