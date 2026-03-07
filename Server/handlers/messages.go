package handlers

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"messenger/crypto"
	"messenger/db"
	"messenger/models"
)

// Messages обработчик для работы с сообщениями
func Messages(w http.ResponseWriter, r *http.Request) {
	user := getUserFromSession(r)
	if user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Unauthorized"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		getMessages(w, r, user)
	case http.MethodPost:
		sendMessage(w, r, user)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getMessages возвращает сообщения пользователя
func getMessages(w http.ResponseWriter, r *http.Request, user *models.User) {
	// Получаем ID собеседника
	chatWith := r.URL.Query().Get("with")
	if chatWith == "" {
		// Возвращаем все сообщения
		messages, err := db.GetMessagesForUser(user.ID)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to get messages"})
			return
		}

		var response []models.MessageResponse
		for _, msg := range messages {
			response = append(response, models.MessageResponse{
				ID:               msg.ID,
				SenderID:         msg.SenderID,
				RecipientID:      msg.RecipientID,
				EncryptedContent: base64.StdEncoding.EncodeToString(msg.EncryptedContent),
				Timestamp:        msg.Timestamp.Format("2006-01-02T15:04:05Z"),
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Сообщения с конкретным пользователем
	chatWithID, err := strconv.ParseInt(chatWith, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid user ID"})
		return
	}

	messages, err := db.GetMessages(user.ID, chatWithID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to get messages"})
		return
	}

	var response []models.MessageResponse
	for _, msg := range messages {
		response = append(response, models.MessageResponse{
			ID:               msg.ID,
			SenderID:         msg.SenderID,
			RecipientID:      msg.RecipientID,
			EncryptedContent: base64.StdEncoding.EncodeToString(msg.EncryptedContent),
			Timestamp:        msg.Timestamp.Format("2006-01-02T15:04:05Z"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// sendMessage отправляет сообщение
func sendMessage(w http.ResponseWriter, r *http.Request, user *models.User) {
	var req models.MessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid request"})
		return
	}

	// Валидация
	if req.RecipientID == 0 || req.EncryptedContent == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Recipient and content required"})
		return
	}

	// Проверяем что получатель существует
	_, err := db.GetUserByID(req.RecipientID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Recipient not found"})
		return
	}

	// Декодирование content из base64
	encryptedContent, err := base64.StdEncoding.DecodeString(req.EncryptedContent)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid encrypted content"})
		return
	}

	// Проверка размера зашифрованного сообщения (максимум 256 байт для RSA 2048)
	if len(encryptedContent) > 256 || len(encryptedContent) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Message too long or empty"})
		return
	}

	// Сохранение сообщения
	messageID, err := db.SaveMessage(user.ID, req.RecipientID, encryptedContent)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to save message"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.MessageResponse{
		ID:               messageID,
		SenderID:         user.ID,
		RecipientID:      req.RecipientID,
		EncryptedContent: req.EncryptedContent,
	})
}

// GetPublicKey обработчик для получения публичного ключа пользователя
func GetPublicKey(w http.ResponseWriter, r *http.Request) {
	user := getUserFromSession(r)
	if user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Unauthorized"})
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Получаем ID пользователя из URL
	userIDStr := r.URL.Path[len("/api/keys/"):]
	if userIDStr == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "User ID required"})
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid user ID"})
		return
	}

	// Получаем публичный ключ
	publicKey, err := db.GetUserPublicKey(userID)
	if err != nil {
		log.Printf("GetPublicKey: user %d not found, error: %v", userID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "User not found"})
		return
	}

	if publicKey == "" {
		log.Printf("GetPublicKey: user %d has no public key", userID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Public key not found"})
		return
	}

	log.Printf("GetPublicKey: raw key for user %d, starts with: %q, length: %d", userID, publicKey[:min(30, len(publicKey))], len(publicKey))

	// Определяем формат ключа
	// 1. Если содержит "-----BEGIN" - это уже PEM
	if strings.Contains(publicKey, "-----BEGIN") {
		log.Printf("GetPublicKey: key already in PEM format")
	} else {
		// 2. Пробуем декодировать как base64
		keyBytes, err := base64.StdEncoding.DecodeString(publicKey)
		if err != nil {
			// 3. Возможно это сырые бинарные данные - пробуем как есть
			log.Printf("GetPublicKey: not base64, trying as raw bytes, first byte: %x", publicKey[0])
			keyBytes = []byte(publicKey)
		}

		// Проверяем, начинаются ли данные с 0x30 (ASN.1 SEQUENCE)
		if len(keyBytes) > 0 && keyBytes[0] == 0x30 {
			publicKey = crypto.PublicKeyToPEM(keyBytes)
			log.Printf("GetPublicKey: converted binary key to PEM for user %d", userID)
			// Обновляем ключ в БД для будущих запросов
			if err := db.UpdateUserPublicKey(userID, publicKey); err != nil {
				log.Printf("GetPublicKey: failed to update user public key in DB: %v", err)
				// Не прерываем выполнение, т.к. ключ уже сконвертирован
			}
		} else {
			// Не удалось определить формат
			log.Printf("GetPublicKey: unknown key format for user %d, first byte: %x", userID, keyBytes[0])
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Invalid key format"})
			return
		}
	}

	log.Printf("GetPublicKey: returning PEM for user %d", userID)

	// Возвращаем PEM строку
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"public_key": publicKey,
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// GetUsers обработчик для получения списка пользователей
func GetUsers(w http.ResponseWriter, r *http.Request) {
	user := getUserFromSession(r)
	if user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Unauthorized"})
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	users, err := db.GetAllUsers()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ErrorResponse{Error: "Failed to get users"})
		return
	}

	var response []models.UserResponse
	for _, u := range users {
		if u.ID != user.ID { // Не включаем текущего пользователя
			response = append(response, models.UserResponse{
				ID:       u.ID,
				Username: u.Username,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
