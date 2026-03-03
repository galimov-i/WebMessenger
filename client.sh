#!/bin/bash

# Установка и запуск клиента мессенджера

set -e

echo "=== Установка клиента мессенджера ==="

# Определение директории клиента
CLIENT_DIR="$(dirname "$0")/Client"

if [ ! -d "$CLIENT_DIR" ]; then
    echo "Ошибка: Директория клиента не найдена: $CLIENT_DIR"
    exit 1
fi

echo "Клиент находится в: $CLIENT_DIR"

# Проверка наличия необходимых файлов
if [ ! -f "$CLIENT_DIR/index.html" ]; then
    echo "Ошибка: index.html не найден"
    exit 1
fi

echo "Проверка структуры клиента..."
for file in "index.html" "css/style.css" "js/crypto.js" "js/api.js" "js/ui.js" "js/app.js"; do
    if [ ! -f "$CLIENT_DIR/$file" ]; then
        echo "Ошибка: файл не найден: $file"
        exit 1
    fi
    echo "  ✓ $file"
done

echo ""
echo "=== Клиент готов ==="
echo "Клиент представляет собой статические файлы и не требует сборки."
echo ""
echo "Для запуска клиента вам нужно:"
echo "1. Запустить сервер: ./server.sh"
echo "2. Открыть в браузере: http://localhost:8080"
echo ""
echo "Также можно использовать любой HTTP-сервер:"
echo "  python3 -m http.server 8080 -d Client"
echo "  npx serve Client"
echo "  php -S localhost:8080 -t Client"
