/**
 * APIModule - HTTP клиент для работы с API
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}
console.log('WebMessenger.API loading...');

WebMessenger.API = (() => {
    const API_BASE = '/api';
    let authToken = null;
    
    /**
     * Устанавливает токен авторизации
     */
    function setToken(token) {
        authToken = token;
        if (token) {
            sessionStorage.setItem('authToken', token);
        } else {
            sessionStorage.removeItem('authToken');
        }
    }
    
    /**
     * Получает токен из sessionStorage
     */
    function getToken() {
        if (!authToken) {
            authToken = sessionStorage.getItem('authToken');
        }
        return authToken;
    }
    
    /**
     * Выполняет HTTP запрос
     */
    async function request(endpoint, options = {}) {
        const url = API_BASE + endpoint;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            // Обработка ответа
            const contentType = response.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            }
            
            if (!response.ok) {
                // Обработка ошибок
                if (response.status === 401) {
                    // Токен истек или недействителен
                    logout();
                    throw new Error(data?.error || 'Сессия истекла');
                }
                throw new Error(data?.error || 'Ошибка запроса');
            }
            
            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }
    
    /**
     * Регистрация нового пользователя
     */
    async function register(username, password, publicKey) {
        const data = await request('/register', {
            method: 'POST',
            body: JSON.stringify({
                username, 
                password,
                public_key: publicKey
            })
        });
        
        if (data.token) {
            setToken(data.token);
        }
        
        return data;
    }
    
    /**
     * Вход пользователя
     */
    async function login(username, password, publicKey = null) {
        const data = await request('/login', {
            method: 'POST',
            body: JSON.stringify({
                username, 
                password,
                public_key: publicKey
            })
        });
        
        if (data.token) {
            setToken(data.token);
        }
        
        return data;
    }
    
    /**
     * Выход пользователя
     */
    async function logout() {
        try {
            await request('/logout', {
                method: 'POST'
            });
        } catch (e) {
            // Игнорируем ошибки при выходе
        }
        setToken(null);
        // Очищаем все данные
        localStorage.removeItem('serverPublicKey');
        localStorage.removeItem('publicKey');
        localStorage.removeItem('privateKey');
        sessionStorage.clear();
    }
    
    /**
     * Получение информации о текущем пользователе
     */
    async function getCurrentUser() {
        return await request('/me');
    }
    
    /**
     * Получение списка пользователей
     */
    async function getUsers() {
        return await request('/users');
    }
    
    /**
     * Получение публичного ключа пользователя
     */
    async function getPublicKey(userId) {
        return await request(`/keys/${userId}`);
    }
    
    /**
     * Получение сообщений
     * @param {number} userId - ID пользователя для фильтрации (опционально)
     */
    async function getMessages(userId) {
        const endpoint = userId ? `/messages?with=${userId}` : '/messages';
        return await request(endpoint);
    }
    
    /**
     * Отправка сообщения
     */
    async function sendMessage(recipientId, encryptedContent) {
        return await request('/messages', {
            method: 'POST',
            body: JSON.stringify({
                recipient_id: recipientId,
                encrypted_content: encryptedContent
            })
        });
    }
    
    /**
     * Проверка сессии
     */
    async function checkSession() {
        const token = getToken();
        if (!token) {
            return null;
        }
        
        try {
            const user = await getCurrentUser();
            return user;
        } catch (e) {
            setToken(null);
            return null;
        }
    }
    
    return {
        register,
        login,
        logout,
        getCurrentUser,
        getUsers,
        getPublicKey,
        getMessages,
        sendMessage,
        checkSession,
        setToken
    };
})();

