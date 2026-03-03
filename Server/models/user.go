package models

import "time"

// User представляет пользователя мессенджера
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	PublicKey    []byte    `json:"-"`
	PrivateKey   []byte    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Message представляет сообщение
type Message struct {
	ID             int64     `json:"id"`
	SenderID       int64     `json:"sender_id"`
	RecipientID    int64     `json:"recipient_id"`
	EncryptedContent []byte  `json:"encrypted_content"`
	Timestamp      time.Time `json:"timestamp"`
}

// Session представляет сессию пользователя
type Session struct {
	ID        string
	UserID    int64
	ExpiresAt time.Time
}

// API структуры для запросов/ответов
type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RegisterResponse struct {
	Token     string `json:"token"`
	PublicKey string `json:"public_key"`
	User      User   `json:"user"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token     string `json:"token"`
	PublicKey string `json:"public_key"`
	User      User   `json:"user"`
}

type MessageRequest struct {
	RecipientID     int64  `json:"recipient_id"`
	EncryptedContent string `json:"encrypted_content"`
}

type MessageResponse struct {
	ID             int64  `json:"id"`
	SenderID       int64  `json:"sender_id"`
	RecipientID    int64  `json:"recipient_id"`
	EncryptedContent string `json:"encrypted_content"`
	Timestamp      string `json:"timestamp"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type UserResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}
