#!/bin/bash

# Установка и запуск сервера мессенджера

set -e

echo "=== Установка сервера мессенджера ==="

# Проверка наличия Go
if ! command -v go &> /dev/null; then
    echo "Ошибка: Go не установлен. Установите Go с https://go.dev/dl/"
    exit 1
fi

echo "Версия Go: $(go version)"

# Переход в директорию Server
cd "$(dirname "$0")/Server" || exit 1

echo "Установка зависимостей..."
go mod tidy

echo "Сборка сервера..."
go build -o messenger .

echo "=== Запуск сервера ==="
echo "Сервер будет доступен по адресу: http://localhost:8080"
echo "Для остановки нажмите Ctrl+C"
echo ""

# Запуск сервера с параметрами по умолчанию
PORT="${PORT:-8080}"
DB_PATH="${DB_PATH:-./messenger.db}"
STATIC_DIR="${STATIC_DIR:-../Client}"

./messenger.exe -port "$PORT" -db "$DB_PATH" -static "$STATIC_DIR"
