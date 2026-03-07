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

// securityHeadersMiddleware добавляет заголовки безопасности
func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Защита от clickjacking
		w.Header().Set("X-Frame-Options", "DENY")
		// Защита от MIME-sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// CSP - базовая политика
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:")
		// Защита от XSS
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		// Referrer policy
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// Same Origin Policy
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))

		next.ServeHTTP(w, r)
	})
}

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

	// Статические файлы (клиент) с security headers
	fs := http.FileServer(http.Dir(*staticDir))
	http.Handle("/", securityHeadersMiddleware(fs))

	// API маршруты с security headers
	apiHandler := func(fn http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// Добавляем security headers
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-XSS-Protection", "1; mode=block")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			fn(w, r)
		}
	}

	http.HandleFunc("/api/register", apiHandler(handlers.Register))
	http.HandleFunc("/api/login", apiHandler(handlers.Login))
	http.HandleFunc("/api/logout", apiHandler(handlers.Logout))
	http.HandleFunc("/api/messages", apiHandler(handlers.Messages))
	http.HandleFunc("/api/keys/", apiHandler(handlers.GetPublicKey))
	http.HandleFunc("/api/users", apiHandler(handlers.GetUsers))
	http.HandleFunc("/api/me", apiHandler(handlers.GetCurrentUser))
	http.HandleFunc("/health", apiHandler(handlers.HealthCheck))

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
