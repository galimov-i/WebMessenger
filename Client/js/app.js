/**
 * WebMessenger.App - главный модуль приложения
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}
console.log('WebMessenger.App loading...');

WebMessenger.App = (() => {
    let currentUser = null;
    let privateKey = null;
    let ws = null;
    let users = [];
    let onlineUsers = [];
    
    /**
     * Инициализация приложения
     */
    async function init() {
        console.log('App.init() started');
        try {
            // Инициализация модулей
            try {
                await WebMessenger.Crypto.init();
            } catch (e) {
                console.error('Crypto init error:', e);
            }
            WebMessenger.UI.init();
            
            // Проверка сессии
            currentUser = await WebMessenger.API.checkSession();
            
            console.log('Init: currentUser from checkSession:', currentUser);
            
            if (currentUser) {
                // Загрузка закрытого ключа
                const savedPrivateKey = localStorage.getItem('privateKey');
                if (savedPrivateKey) {
                    privateKey = savedPrivateKey;
                }
                
                // Используем username из ответа
                const username = currentUser.username || currentUser.user?.username || 'Пользователь';
                currentUser = { id: currentUser.id || currentUser.user?.id, username: username };
                
                showMainScreen();
            } else {
                WebMessenger.UI.showAuthScreen();
            }
            
            // Настройка обработчиков форм
            setupForms();
            
        } catch (error) {
            console.error('Init error:', error);
            WebMessenger.UI.showAuthScreen();
        }
    }
    
    /**
     * Настройка обработчиков форм
     */
    function setupForms() {
        // Форма входа
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            
            try {
                WebMessenger.UI.hideError();
                
                // Загружаем сохранённые ключи
                const storedPublicKey = localStorage.getItem('publicKey');
                const storedPrivateKey = localStorage.getItem('privateKey');
                
                // Входим с публичным ключом (если есть)
                const data = await WebMessenger.API.login(username, password, storedPublicKey);
                
                console.log('Login: data.user:', data.user);
                currentUser = data.user;
                privateKey = storedPrivateKey;
                
                showMainScreen();
                loginForm.reset();
                
            } catch (error) {
                WebMessenger.UI.showError(error.message);
            }
        });
        
        // Форма регистрации
        const registerForm = document.getElementById('register-form');
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value;
            const passwordConfirm = document.getElementById('register-password-confirm').value;
            
            // Проверка пароля
            if (password !== passwordConfirm) {
                WebMessenger.UI.showError('Пароли не совпадают');
                return;
            }
            
            if (password.length < 4) {
                WebMessenger.UI.showError('Пароль должен быть не менее 4 символов');
                return;
            }
            
            try {
                WebMessenger.UI.hideError();
                
                // Генерируем ключи ДО регистрации
                const keyPair = await WebMessenger.Crypto.generateKeyPair();
                const publicKeyPEM = await WebMessenger.Crypto.exportPublicKey(keyPair.publicKey);
                const privateKeyPEM = await WebMessenger.Crypto.exportPrivateKey(keyPair.privateKey);
                
                // Регистрируемся с публичным ключом
                const data = await WebMessenger.API.register(username, password, publicKeyPEM);
                
                console.log('Register: data.user:', data.user);
                
                // Сохраняем ключи локально
                await WebMessenger.Crypto.saveKeys(publicKeyPEM, privateKeyPEM);
                
                currentUser = data.user;
                privateKey = privateKeyPEM;
                
                showMainScreen();
                registerForm.reset();
                
            } catch (error) {
                WebMessenger.UI.showError(error.message);
            }
        });
        
        // Кнопка выхода
        const logoutBtn = document.getElementById('logout-btn');
        logoutBtn.addEventListener('click', async () => {
            await logout();
        });
    }
    
    /**
     * Показ главного экрана
     */
    async function showMainScreen() {
        console.log('showMainScreen: currentUser =', currentUser);
        
        WebMessenger.UI.showMainScreen();
        
        // Получаем username - поддерживаем разные форматы ответа
        const username = currentUser?.username || currentUser?.user?.username;
        console.log('showMainScreen: username =', username);
        WebMessenger.UI.setCurrentUser(username || 'Пользователь');
        
        // Загрузка списка пользователей
        await loadUsers();
        
        // Подключение WebSocket
        connectWebSocket();
    }
    
    /**
     * Загрузка списка пользователей
     */
    async function loadUsers() {
        try {
            users = await WebMessenger.API.getUsers();
            WebMessenger.UI.renderUsersList(users, onlineUsers);
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }
    
    /**
     * Загрузка сообщений с пользователем
     */
    async function loadMessages(userId) {
        // Устанавливаем текущий чат
        window.WebMessenger.App.currentChatUserId = userId;
        
        try {
            const messages = await WebMessenger.API.getMessages(userId);
            WebMessenger.UI.renderMessages(messages, currentUser.id, privateKey);
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }
    
    /**
     * Отправка сообщения
     */
    async function sendMessage(recipientId, content) {
        console.log('=== sendMessage called ===');
        console.log('recipientId:', recipientId, 'content:', content);
        console.log('currentUser:', currentUser);
        console.log('ws:', ws);
        
        try {
            console.log('Sending message to recipient:', recipientId, 'content:', content);
            
            // Получаем публичный ключ получателя
            console.log('Fetching public key for recipient:', recipientId);
            const response = await WebMessenger.API.getPublicKey(recipientId);
            console.log('Public key response:', response);
            
            // Debug: проверим формат ключа
            if (response && response.public_key) {
                const keyLines = response.public_key.split('\n');
                console.log('Key header:', keyLines[0]);
                console.log('Key footer:', keyLines[keyLines.length - 1]);
                console.log('Key base64 length:', keyLines.slice(1, -1).join('').length);
            }
            
            if (!response || !response.public_key) {
                throw new Error('Не удалось получить ключ получателя');
            }
            
            // Шифруем сообщение
            console.log('Encrypting message...');
            const encrypted = await WebMessenger.Crypto.encrypt(content, response.public_key);
            console.log('Encrypted length:', encrypted.length);
            
            // Отправляем на сервер
            console.log('Sending to server...');
            const result = await WebMessenger.API.sendMessage(recipientId, encrypted);
            console.log('Server result:', result);
            
            // Добавляем сообщение в UI (локально)
            WebMessenger.UI.addMessage({
                content: content,
                timestamp: result.timestamp || new Date().toISOString()
            }, true);
            
            // Отправляем через WebSocket если подключен
            if (ws && ws.readyState === WebSocket.OPEN) {
                const wsMsg = {
                    type: 'chat',
                    payload: {
                        sender_id: currentUser.id,
                        recipient_id: recipientId,
                        encrypted_content: encrypted,
                        timestamp: result.timestamp || new Date().toISOString()
                    }
                };
                ws.send(JSON.stringify(wsMsg));
            }
            
        } catch (error) {
            console.error('Failed to send message:', error);
            let errorMsg = error.message || error.toString() || 'Неизвестная ошибка';
            if (!errorMsg || errorMsg.trim() === '') {
                errorMsg = 'Проверьте консоль (F12) для деталей';
            }
            WebMessenger.UI.showError('Не удалось отправить: ' + errorMsg);
        }
    }
    
    /**
     * Подключение к WebSocket
     */
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = sessionStorage.getItem('authToken');
        // Токен передаётся в первом сообщении после подключения (безопасно, не в URL)
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        console.log('WebSocket URL:', wsUrl);
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            // Отправляем токен в первом сообщении для аутентификации
            ws.send(JSON.stringify({ type: 'auth', token: token }));
            // Уведомляем о онлайн статусе
            ws.send(JSON.stringify({ type: 'online' }));
        };
        
        ws.onmessage = (event) => {
            console.log('WS message:', event.data);
            try {
                const data = JSON.parse(event.data);
                handleWSMessage(data);
            } catch (e) {
                console.error('Failed to parse WS message:', e);
            }
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Переподключение через 5 секунд
            setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    /**
     * Обработка WebSocket сообщений
     */
    async function handleWSMessage(data) {
        switch (data.type) {
            case 'online':
                // Список онлайн пользователей
                onlineUsers = data.payload;
                window.WebMessenger.App.onlineUsers = onlineUsers;
                WebMessenger.UI.renderUsersList(users, onlineUsers);
                break;
                
            case 'chat_ack':
                // Подтверждение отправки - сообщение уже добавлено через API
                console.log('Message sent confirmation:', data.payload);
                break;
                
            case 'chat':
                // Новое сообщение
                const msg = data.payload;
                if (msg.recipient_id === currentUser.id || msg.sender_id === currentUser.id) {
                    // Пробуем расшифровать сообщение
                    let content = msg.encrypted_content;
                    // Расшифровываем если:
                    // 1. Сообщение от другого пользователя (зашифровано моим публичным ключом)
                    // 2. Сообщение себе (тоже зашифровано моим публичным ключом)
                    if (privateKey) {
                        try {
                            content = await WebMessenger.Crypto.decrypt(msg.encrypted_content, privateKey);
                        } catch (e) {
                            console.error('Failed to decrypt message:', e);
                            content = '[Не удалось расшифровать]';
                        }
                    }
                    
                    // Если это текущий чат, добавляем сообщение
                    if (window.WebMessenger.App.currentChatUserId === msg.sender_id || 
                        window.WebMessenger.App.currentChatUserId === msg.recipient_id) {
                        WebMessenger.UI.addMessage({
                            content: content,
                            timestamp: msg.timestamp
                        }, msg.sender_id === currentUser.id);
                    }
                }
                break;
                
            case 'typing':
                // Индикатор набора текста
                if (window.WebMessenger.App && window.WebMessenger.App.currentChatUserId === data.payload.user_id) {
                    // Показать индикатор
                }
                break;
        }
    }
    
    /**
     * Выход
     */
    async function logout() {
        await WebMessenger.API.logout();
        
        // Закрытие WebSocket
        if (ws) {
            ws.close();
            ws = null;
        }
        
        // Очистка данных
        currentUser = null;
        privateKey = null;
        users = [];
        onlineUsers = [];
        
        // Очистка storage
        sessionStorage.clear();
        
        // Показ экрана авторизации
        WebMessenger.UI.clearChat();
        WebMessenger.UI.showAuthScreen();
    }
    
    // Экспорт для доступа из UI
    window.WebMessenger = window.WebMessenger || {};
    window.WebMessenger.App = {
        sendMessage,
        loadMessages,
        currentChatUserId: null,
        onlineUsers: []
    };
    
    // Запуск при загрузке
    document.addEventListener('DOMContentLoaded', init);
    
    return {
        init,
        sendMessage,
        loadMessages
    };
})();
