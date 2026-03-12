package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"messenger/db"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHealthCheck(t *testing.T) {
	// Initialize in-memory database
	err := db.Init(":memory:")
	require.NoError(t, err)
	defer db.Close()

	// Reset startTime for predictable uptime
	originalStartTime := startTime
	startTime = time.Now().Add(-5 * time.Minute)
	defer func() { startTime = originalStartTime }()

	t.Run("GET request returns 200 OK", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		HealthCheck(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, "application/json", resp.Header.Get("Content-Type"))

		var healthResp HealthResponse
		err := json.NewDecoder(resp.Body).Decode(&healthResp)
		require.NoError(t, err)

		assert.Equal(t, "ok", healthResp.Status)
		assert.Equal(t, "ok", healthResp.Database) // DB is reachable
		assert.NotEmpty(t, healthResp.Uptime)
		assert.WithinDuration(t, time.Now().UTC(), healthResp.Timestamp, 1*time.Second)
	})

	t.Run("Non-GET request returns 405", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/health", nil)
		w := httptest.NewRecorder()
		HealthCheck(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		assert.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
	})
}
