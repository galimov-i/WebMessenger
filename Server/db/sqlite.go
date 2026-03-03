package db

import (
	"database/sql"
	"log"
	"time"

	"messenger/models"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

// Init инициализирует базу данных
func Init(dbPath string) error {
	var err error
	DB, err = sql.Open("sqlite", dbPath+"?_foreign_keys=on")
	if err != nil {
		return err
	}

	// Создание таблиц
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		public_key TEXT,
		private_key TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sender_id INTEGER NOT NULL,
		recipient_id INTEGER NOT NULL,
		encrypted_content BLOB NOT NULL,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (sender_id) REFERENCES users(id),
		FOREIGN KEY (recipient_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		expires_at DATETIME NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
	CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
	`

	_, err = DB.Exec(schema)
	return err
}

// Close закрывает соединение с БД
func Close() {
	if DB != nil {
		DB.Close()
	}
}

// CreateUser создаёт нового пользователя (publicKey и privateKey - PEM строки)
func CreateUser(username, passwordHash string, publicKey, privateKey string) (int64, error) {
	result, err := DB.Exec(
		"INSERT INTO users (username, password_hash, public_key, private_key) VALUES (?, ?, ?, ?)",
		username, passwordHash, publicKey, privateKey,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// GetUserByUsername возвращает пользователя по имени
func GetUserByUsername(username string) (*models.User, error) {
	user := &models.User{}
	err := DB.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetUserByID возвращает пользователя по ID
func GetUserByID(id int64) (*models.User, error) {
	user := &models.User{}
	err := DB.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetUserPublicKey возвращает PEM публичного ключа пользователя
func GetUserPublicKey(userID int64) (string, error) {
	var publicKey string
	err := DB.QueryRow("SELECT public_key FROM users WHERE id = ?", userID).Scan(&publicKey)
	return publicKey, err
}

// UpdateUserPublicKey обновляет публичный ключ пользователя
func UpdateUserPublicKey(userID int64, publicKey string) error {
	_, err := DB.Exec("UPDATE users SET public_key = ? WHERE id = ?", publicKey, userID)
	return err
}

// CreateSession создаёт новую сессию
func CreateSession(sessionID string, userID int64, expiresAt time.Time) error {
	_, err := DB.Exec(
		"INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		sessionID, userID, expiresAt,
	)
	return err
}

// GetSession возвращает сессию по ID
func GetSession(sessionID string) (*models.Session, error) {
	session := &models.Session{}
	err := DB.QueryRow(
		"SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > datetime('now')",
		sessionID,
	).Scan(&session.ID, &session.UserID, &session.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return session, nil
}

// DeleteSession удаляет сессию
func DeleteSession(sessionID string) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

// DeleteExpiredSessions удаляет просроченные сессии
func DeleteExpiredSessions() error {
	_, err := DB.Exec("DELETE FROM sessions WHERE expires_at <= datetime('now')")
	return err
}

// SaveMessage сохраняет сообщение
func SaveMessage(senderID, recipientID int64, encryptedContent []byte) (int64, error) {
	result, err := DB.Exec(
		"INSERT INTO messages (sender_id, recipient_id, encrypted_content) VALUES (?, ?, ?)",
		senderID, recipientID, encryptedContent,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// GetMessages возвращает сообщения между двумя пользователями
func GetMessages(userID1, userID2 int64) ([]models.Message, error) {
	rows, err := DB.Query(`
		SELECT id, sender_id, recipient_id, encrypted_content, timestamp 
		FROM messages 
		WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
		ORDER BY timestamp ASC
	`, userID1, userID2, userID2, userID1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.SenderID, &msg.RecipientID, &msg.EncryptedContent, &msg.Timestamp); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

// GetAllUsers возвращает всех пользователей
func GetAllUsers() ([]models.User, error) {
	rows, err := DB.Query("SELECT id, username, created_at FROM users ORDER BY username")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Username, &user.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

// GetMessagesForUser возвращает все сообщения для пользователя
func GetMessagesForUser(userID int64) ([]models.Message, error) {
	rows, err := DB.Query(`
		SELECT id, sender_id, recipient_id, encrypted_content, timestamp 
		FROM messages 
		WHERE sender_id = ? OR recipient_id = ?
		ORDER BY timestamp DESC
	`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.SenderID, &msg.RecipientID, &msg.EncryptedContent, &msg.Timestamp); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

// Cleanup стартирует периодическую очистку БД
func Cleanup() {
	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		for range ticker.C {
			if err := DeleteExpiredSessions(); err != nil {
				log.Printf("Error cleaning up sessions: %v", err)
			}
		}
	}()
}
