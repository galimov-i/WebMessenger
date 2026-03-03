package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"messenger/models"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Разрешаем все источники для разработки
	},
}

// Client представляет подключенного клиента
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
	user *models.User
}

// Hub управляет всеми клиентами
type Hub struct {
	clients    map[int64]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
}

// Global hub
var globalHub = NewHub()

// RunHub запускает WebSocket хаб
func RunHub() {
	globalHub.Run()
}

// NewHub создает новый хаб
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[int64]*Client),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run запускает хаб
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client.user.ID] = client
			h.mutex.Unlock()
			log.Printf("Client connected: %s (%d)", client.user.Username, client.user.ID)

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client.user.ID]; ok {
				delete(h.clients, client.user.ID)
				close(client.send)
				log.Printf("Client disconnected: %s (%d)", client.user.Username, client.user.ID)
			}
			h.mutex.Unlock()

		case message := <-h.broadcast:
			h.mutex.RLock()
			for _, client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client.user.ID)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

// SendToUser отправляет сообщение конкретному пользователю
func (h *Hub) SendToUser(userID int64, message []byte) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	if client, ok := h.clients[userID]; ok {
		select {
		case client.send <- message:
		default:
			log.Printf("Failed to send message to user %d", userID)
		}
	}
}

// GetOnlineUsers возвращает список онлайн пользователей
func (h *Hub) GetOnlineUsers() []int64 {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	var users []int64
	for userID := range h.clients {
		users = append(users, userID)
	}
	return users
}

// WebSocket сообщения
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// WSChatMessage сообщение чата
type WSChatMessage struct {
	SenderID         int64  `json:"sender_id"`
	RecipientID      int64  `json:"recipient_id"`
	EncryptedContent string `json:"encrypted_content"`
	Timestamp        string `json:"timestamp"`
}

// HandleWebSocket обработчик WebSocket соединения
func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Пробуем получить токен из query-параметра или из заголовка
	token := r.URL.Query().Get("token")
	if token == "" {
		token = getSessionToken(r)
	}

	// Временно устанавливаем токен в заголовок для getUserFromSession
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}

	user := getUserFromSession(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Обновление соединения
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:  globalHub,
		conn: conn,
		send: make(chan []byte, 256),
		user: user,
	}

	// Регистрация клиента
	globalHub.register <- client

	// Запуск горутины для чтения
	go client.writePump()
	// Запуск горутины для записи
	go client.readPump()
}

// readPump читает сообщения от клиента
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Парсим сообщение
		var wsMsg WSMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			log.Printf("Failed to parse message: %v", err)
			continue
		}

		switch wsMsg.Type {
		case "chat":
			// Пересылаем сообщение получателю
			payload, _ := json.Marshal(wsMsg.Payload)
			var chatMsg WSChatMessage
			if err := json.Unmarshal(payload, &chatMsg); err != nil {
				continue
			}

			// Отправляем получателю полное сообщение
			c.hub.SendToUser(chatMsg.RecipientID, message)

			// Отправителю отправляем подтверждение БЕЗ зашифрованного контента
			// (сообщение было зашифровано ключом получателя, а не отправителя)
			ackMsg := WSMessage{
				Type: "chat_ack",
				Payload: map[string]interface{}{
					"message_id":   chatMsg.SenderID, // используем sender_id как идентификатор
					"timestamp":    chatMsg.Timestamp,
					"recipient_id": chatMsg.RecipientID,
				},
			}
			ackBytes, _ := json.Marshal(ackMsg)
			c.send <- ackBytes

		case "typing":
			// Уведомление о наборе текста
			payload, _ := json.Marshal(wsMsg.Payload)
			var typingMsg struct {
				RecipientID int64 `json:"recipient_id"`
				Typing      bool  `json:"typing"`
			}
			if err := json.Unmarshal(payload, &typingMsg); err == nil {
				c.hub.SendToUser(typingMsg.RecipientID, message)
			}

		case "online":
			// Пользователь онлайн
			onlineUsers := c.hub.GetOnlineUsers()
			response := WSMessage{
				Type:    "online",
				Payload: onlineUsers,
			}
			responseBytes, _ := json.Marshal(response)
			c.send <- responseBytes
		}
	}
}

// writePump пишет сообщения клиенту
func (c *Client) writePump() {
	defer c.conn.Close()

	for {
		message, ok := <-c.send
		if !ok {
			c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			break
		}

		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
		}
	}
}
