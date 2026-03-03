package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"messenger/db"
	"messenger/handlers"
)

func main() {
	// Параметры командной строки
	port := flag.String("port", "8080", "Server port")
	dbPath := flag.String("db", "./messenger.db", "Database path")
	staticDir := flag.String("static", "../Client", "Static files directory")
	flag.Parse()

	// Инициализация БД
	if err := db.Init(*dbPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Запуск очистки просроченных сессий
	db.Cleanup()

	// Запуск WebSocket хаба
	go handlers.RunHub()

	// Статические файлы (клиент)
	fs := http.FileServer(http.Dir(*staticDir))
	http.Handle("/", fs)

	// API маршруты
	http.HandleFunc("/api/register", handlers.Register)
	http.HandleFunc("/api/login", handlers.Login)
	http.HandleFunc("/api/logout", handlers.Logout)
	http.HandleFunc("/api/messages", handlers.Messages)
	http.HandleFunc("/api/keys/", handlers.GetPublicKey)
	http.HandleFunc("/api/users", handlers.GetUsers)
	http.HandleFunc("/api/me", handlers.GetCurrentUser)

	// WebSocket
	http.HandleFunc("/ws", handlers.HandleWebSocket)

	// Обработка завершения
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Server starting on port %s", *port)
		log.Printf("Static files from: %s", *staticDir)
		if err := http.ListenAndServe(":"+*port, nil); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-quit
	log.Println("Server shutting down...")
}
