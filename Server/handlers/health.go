package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"messenger/db"
)

// HealthResponse структура ответа health check
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Database  string    `json:"database"`
	Uptime    string    `json:"uptime,omitempty"`
}

var startTime = time.Now()

// HealthCheck обработчик для /health
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Проверяем соединение с БД
	dbStatus := "ok"
	if err := db.DB.Ping(); err != nil {
		dbStatus = "error"
	}

	uptime := time.Since(startTime).Round(time.Second).String()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC(),
		Database:  dbStatus,
		Uptime:    uptime,
	})
}
