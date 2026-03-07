package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"messenger/crypto"
	"messenger/db"
	"messenger/models"

	"golang.org/x/crypto/bcrypt"
)

// generateToken генерирует случайный токен сессии
func generateToken() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		log.Printf("Error generating token: %v", err)
	}
	return base64.URLEncoding.EncodeToString(b)
}

// hashPassword хэширует пароль с bcrypt
func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

// checkPassword проверяет пароль против хэша
func checkPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// getSessionToken извлекает токен из заголовка Authorization
func getSessionToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		return authHeader[7:]
	}
	return ""
}

// getUserFromSession возвращает пользователя по токену сессии
func getUserFromSession(r *http.Request) *models.User {
	token := getSessionToken(r)
	if token == "" {
		return nil
	}

	session, err := db.GetSession(token)
	if err != nil {
		return nil
	}

	if time.Now().After(session.ExpiresAt) {
		db.DeleteSession(token)
		return nil
	}

	user, err := db.GetUserByID(session.UserID)
	if err != nil {
		return nil
	}
	return user
}

// RequireAuth middleware для проверки аутентификации
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := getUserFromSession(r)
		if user == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Unauthorized"})
			return
		}
		// Добавляем пользователя в контекст
		r.Header.Set("X-User-ID", strconv.FormatInt(user.ID, 10))
		next(w, r)
	}
}

// RegisterRequest теперь включает публичный ключ клиента
type RegisterRequestWithKey struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	PublicKey string `json:"public_key"` // PEM формат публичного ключа от клиента
}

// Register обработчик регистрации
func Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequestWithKey
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid request"})
		return
	}

	// Валидация
	if req.Username == "" || req.Password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Username and password required"})
		return
	}

	// Проверка длины имени пользователя
	if len(req.Username) < 3 || len(req.Username) > 30 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Username must be 3-30 characters"})
		return
	}

	// Проверка допустимых символов в имени пользователя
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9_-]+$`, req.Username)
	if !matched {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Username can only contain letters, numbers, underscores and hyphens"})
		return
	}

	// Проверка длины пароля
	if len(req.Password) < 4 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Password must be at least 4 characters"})
		return
	}

	// Проверка существования пользователя
	_, err := db.GetUserByUsername(req.Username)
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Username already exists"})
		return
	}

	// Хэширование пароля
	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to hash password"})
		return
	}

	// Публичный ключ - декодируем из PEM и храним байты
	var publicKeyBytes []byte
	var publicKeyPEM string
	var userID int64
	if req.PublicKey != "" {
		log.Printf("Received public key, length: %d chars", len(req.PublicKey))
		// Сохраняем PEM как есть
		userID, err = db.CreateUser(req.Username, passwordHash, req.PublicKey, "")
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to create user"})
			return
		}

		// Создание сессии
		token := generateToken()
		expiresAt := time.Now().Add(30 * 24 * time.Hour)
		if err := db.CreateSession(token, userID, expiresAt); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to create session"})
			return
		}

		user := &models.User{
			ID:        userID,
			Username:  req.Username,
			CreatedAt: time.Now(),
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.RegisterResponse{
			Token:     token,
			PublicKey: req.PublicKey,
			User:      *user,
		})
		return
	}

	// Старый путь - генерация ключей на сервере (для обратной совместимости)
	log.Printf("No public key provided, will generate one")
	_, publicKey, err := crypto.GenerateRSAKeyPair(2048)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to generate keys"})
		return
	}
	publicKeyBytes = crypto.PublicKeyToBytes(publicKey)
	publicKeyPEM = crypto.PublicKeyToPEM(publicKeyBytes)

	// Создание пользователя
	userID, err = db.CreateUser(req.Username, passwordHash, publicKeyPEM, "")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to create user"})
		return
	}

	// Создание сессии
	token := generateToken()
	expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30 дней
	if err := db.CreateSession(token, userID, expiresAt); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to create session"})
		return
	}

	user := &models.User{
		ID:        userID,
		Username:  req.Username,
		CreatedAt: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.RegisterResponse{
		Token:     token,
		PublicKey: publicKeyPEM,
		User:      *user,
	})
}

// LoginRequestWithKey включает публичный ключ (опционально для обновления)
type LoginRequestWithKey struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	PublicKey string `json:"public_key"` // Можно обновить публичный ключ при входе
}

// Login обработчик входа
func Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequestWithKey
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid request"})
		return
	}

	// Поиск пользователя
	user, err := db.GetUserByUsername(req.Username)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid credentials"})
		return
	}

	// Проверка пароля
	if !checkPassword(req.Password, user.PasswordHash) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid credentials"})
		return
	}

	// Если предоставлен новый публичный ключ, обновляем его
	if req.PublicKey != "" {
		if err := db.UpdateUserPublicKey(user.ID, req.PublicKey); err != nil {
			log.Printf("Failed to update public key for user %d: %v", user.ID, err)
		}
	}

	// Получаем PEM из БД
	publicKeyPEM, _ := db.GetUserPublicKey(user.ID)

	// Создание сессии
	token := generateToken()
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	if err := db.CreateSession(token, user.ID, expiresAt); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to create session"})
		return
	}

	// Ответ
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.LoginResponse{
		Token:     token,
		PublicKey: publicKeyPEM,
		User:      *user,
	})
}

// Logout обработчик выхода
func Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := getSessionToken(r)
	if token != "" {
		db.DeleteSession(token)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetCurrentUser обработчик получения текущего пользователя
func GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := getUserFromSession(r)
	if user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Unauthorized"})
		return
	}

	// Получаем публичный ключ из БД
	publicKeyPEM, err := db.GetUserPublicKey(user.ID)
	if err != nil {
		log.Printf("Failed to get public key for user %d: %v", user.ID, err)
		publicKeyPEM = ""
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.LoginResponse{
		Token:     "",
		PublicKey: publicKeyPEM,
		User:      *user,
	})
}
