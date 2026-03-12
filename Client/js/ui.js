/**
 * UIModule - управление DOM и UI
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}
console.log('WebMessenger.UI loading...');

WebMessenger.UI = (() => {
    // Элементы
    let authScreen, mainScreen, loginForm, registerForm, authTabs, authError;
    let usersList, chatContainer, chatPlaceholder, messagesContainer, messageInput, chatWithUser;
    let currentUser, currentChatUser;
    // Элементы звонка
    let incomingCallModal, incomingCallName, acceptCallBtn, rejectCallBtn;
    let activeCallScreen, activeCallPeerName, activeCallStatus, muteCallBtn, hangupCallBtn, speakerCallBtn;
    
    /**
     * Инициализация UI элементов
     */
    function init() {
        console.log('UI.init() started');
        authScreen = document.getElementById('auth-screen');
        mainScreen = document.getElementById('main-screen');
        loginForm = document.getElementById('login-form');
        registerForm = document.getElementById('register-form');
        authTabs = document.querySelectorAll('.auth-tab');
        authError = document.getElementById('auth-error');
        usersList = document.getElementById('users-list');
        chatContainer = document.getElementById('chat-container');
        chatPlaceholder = document.getElementById('chat-placeholder');
        messagesContainer = document.getElementById('messages');
        messageInput = document.getElementById('message-input');
        chatWithUser = document.getElementById('chat-with-user');
        currentUser = document.getElementById('current-user');
        
        // Элементы звонка
        incomingCallModal = document.getElementById('incoming-call-modal');
        incomingCallName = document.getElementById('incoming-caller-name');
        acceptCallBtn = document.getElementById('accept-call-btn');
        rejectCallBtn = document.getElementById('reject-call-btn');
        activeCallScreen = document.getElementById('active-call-screen');
        activeCallPeerName = document.getElementById('call-peer-name');
        activeCallStatus = document.getElementById('call-status');
        muteCallBtn = document.getElementById('mute-call-btn');
        hangupCallBtn = document.getElementById('hangup-call-btn');
        speakerCallBtn = document.getElementById('speaker-call-btn');
        
        // Настройка обработчиков
        setupAuthTabs();
        setupMessageForm();
        setupMobileNav();
        setupCallHandlers();
    }
    
    /**
     * Настройка мобильной навигации
     */
    function setupMobileNav() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const backToUsersBtn = document.getElementById('back-to-users-btn');
        const showUsersBtn = document.getElementById('show-users-btn');
        
        if (!usersSidebar) return;
        
        // Кнопка "назад к списку" в шапке
        if (backToUsersBtn) {
            backToUsersBtn.addEventListener('click', () => {
                usersSidebar.classList.add('open');
                if (chatContainer) {
                    chatContainer.classList.remove('active');
                }
            });
        }
        
        // Кнопка "показать пользователей" в чате
        if (showUsersBtn) {
            showUsersBtn.addEventListener('click', () => {
                usersSidebar.classList.add('open');
                if (chatContainer) {
                    chatContainer.classList.remove('active');
                }
            });
        }
        
        // Закрытие списка при клике вне его (для мобильных)
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            
            if (usersSidebar.classList.contains('open') && 
                !usersSidebar.contains(e.target) &&
                !e.target.closest('#show-users-btn') &&
                !e.target.closest('#back-to-users-btn')) {
                usersSidebar.classList.remove('open');
            }
        });
        
        // Сброс состояния при ресайзе окна
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth > 768) {
                    usersSidebar.classList.remove('open');
                    if (chatContainer) {
                        chatContainer.classList.add('active');
                    }
                }
            }, 150);
        });
        
        // Поддержка swipe для мобильных
        let touchStartX = 0;
        let touchEndX = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (window.innerWidth > 768) return;
            
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;
            
            // Свайп вправо - показать список пользователей
            if (diff < -swipeThreshold && currentChatUser) {
                usersSidebar.classList.add('open');
            }
            
            // Свайп влево - показать чат (если выбран пользователь)
            if (diff > swipeThreshold && currentChatUser) {
                usersSidebar.classList.remove('open');
            }
        }
    }

    /**
     * Настройка обработчиков звонка
     */
    function setupCallHandlers() {
        if (!acceptCallBtn || !rejectCallBtn || !hangupCallBtn) return;
        
        acceptCallBtn.addEventListener('click', () => {
            const callerId = parseInt(incomingCallModal.dataset.callerId);
            const offer = JSON.parse(incomingCallModal.dataset.offer || '{}');
            if (callerId && offer) {
                if (WebMessenger.Call && WebMessenger.Call.acceptCall) {
                    WebMessenger.Call.acceptCall(callerId, offer);
                }
                hideIncomingCallModal();
            }
        });
        
        rejectCallBtn.addEventListener('click', () => {
            const callerId = parseInt(incomingCallModal.dataset.callerId);
            if (callerId && WebMessenger.Call && WebMessenger.Call.rejectCall) {
                WebMessenger.Call.rejectCall(callerId);
            }
            hideIncomingCallModal();
        });
        
        hangupCallBtn.addEventListener('click', () => {
            if (WebMessenger.Call && WebMessenger.Call.endCall) {
                WebMessenger.Call.endCall();
            }
        });
        
        muteCallBtn.addEventListener('click', () => {
            // TODO: реализовать отключение микрофона
            console.log('Mute toggle not implemented');
        });
        
        speakerCallBtn.addEventListener('click', () => {
            // TODO: переключение динамика
            console.log('Speaker toggle not implemented');
        });
    }

    /**
     * Показать модальное окно входящего звонка
     * @param {number} callerId - ID звонящего
     * @param {string} callerName - Имя звонящего
     * @param {object} offer - WebRTC offer
     */
    function showIncomingCallModal(callerId, callerName, offer) {
        if (!incomingCallModal) return;
        incomingCallModal.dataset.callerId = callerId;
        incomingCallModal.dataset.offer = JSON.stringify(offer);
        incomingCallName.textContent = callerName;
        incomingCallModal.classList.add('visible');
    }

    /**
     * Скрыть модальное окно входящего звонка
     */
    function hideIncomingCallModal() {
        if (!incomingCallModal) return;
        incomingCallModal.classList.remove('visible');
        delete incomingCallModal.dataset.callerId;
        delete incomingCallModal.dataset.offer;
    }

    /**
     * Показать экран активного звонка
     * @param {number} peerId - ID собеседника
     * @param {string} peerName - Имя собеседника
     * @param {boolean} isOutgoing - Исходящий ли звонок
     */
    function showActiveCallScreen(peerId, peerName, isOutgoing) {
        if (!activeCallScreen) return;
        activeCallScreen.dataset.peerId = peerId;
        activeCallScreen.dataset.peerName = peerName;
        activeCallPeerName.textContent = peerName;
        activeCallStatus.textContent = isOutgoing ? 'Звонок...' : 'В разговоре';
        activeCallScreen.classList.add('visible');
    }

    /**
     * Скрыть экран активного звонка
     */
    function hideActiveCallScreen() {
        if (!activeCallScreen) return;
        activeCallScreen.classList.remove('visible');
        delete activeCallScreen.dataset.peerId;
        delete activeCallScreen.dataset.peerName;
    }

    /**
     * Обновить состояние звонка на экране
     * @param {string} status - Текст статуса
     * @param {boolean} isConnected - Флаг подключения
     */
    function updateCallState(status, isConnected) {
        if (!activeCallScreen || !activeCallStatus) return;
        activeCallStatus.textContent = status;
        if (isConnected) {
            activeCallStatus.classList.add('connected');
        } else {
            activeCallStatus.classList.remove('connected');
        }
    }
    
    /**
     * Настройка переключения табов авторизации
     */
    function setupAuthTabs() {
        console.log('setupAuthTabs, authTabs:', authTabs.length);
        authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // Обновление активного класса
                authTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Показ/скрытие форм
                if (tabName === 'login') {
                    loginForm.classList.remove('hidden');
                    registerForm.classList.add('hidden');
                } else {
                    loginForm.classList.add('hidden');
                    registerForm.classList.remove('hidden');
                }
                
                hideError();
            });
        });
    }
    
    /**
     * Настройка формы отправки сообщения
     */
    function setupMessageForm() {
        const form = document.getElementById('message-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const message = messageInput.value.trim();
                if (!message || !currentChatUser) return;
                
                // Очистка инпута
                messageInput.value = '';
                
                // Отправка через app
                if (window.WebMessenger && window.WebMessenger.App && window.WebMessenger.App.sendMessage) {
                    await window.WebMessenger.App.sendMessage(currentChatUser.id, message);
                }
            });
        }
    }
    
    /**
     * Показ экрана авторизации
     */
    function showAuthScreen() {
        authScreen.classList.remove('hidden');
        mainScreen.classList.add('hidden');
    }
    
    /**
     * Показ главного экрана
     */
    function showMainScreen() {
        authScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        // Открываем сайдбар на мобильных устройствах при первом показе
        console.log('showMainScreen: window.innerWidth =', window.innerWidth);
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.users-sidebar');
            console.log('sidebar element:', sidebar);
            if (sidebar) {
                sidebar.classList.add('open');
                console.log('sidebar open class added');
            }
        }
    }
    
    /**
     * Установка имени текущего пользователя
     */
    function setCurrentUser(username) {
        currentUser.textContent = username;
    }
    
    /**
     * Показ ошибки авторизации
     */
    function showError(message) {
        authError.textContent = message;
        authError.classList.remove('hidden');
    }
    
    /**
     * Скрытие ошибки авторизации
     */
    function hideError() {
        authError.classList.add('hidden');
    }
    
    let allUsers = []; // Храним всех пользователей для поиска
    
    /**
     * Рендер списка пользователей
     */
    function renderUsersList(users, onlineUsers = []) {
        allUsers = users || [];
        usersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<p class="users-list-empty">Нет пользователей</p>';
            return;
        }
        
        renderFilteredUsers(users, onlineUsers);
        
        // Настройка поиска
        setupSearch();
    }
    
    /**
     * Рендер отфильтрованных пользователей
     */
    function renderFilteredUsers(users, onlineUsers = []) {
        usersList.innerHTML = '';
        
        if (users.length === 0) {
            usersList.innerHTML = '<p class="users-list-empty">Пользователи не найдены</p>';
            return;
        }
        
        users.forEach(user => {
            const isOnline = onlineUsers.includes(user.id);
            const item = document.createElement('div');
            item.className = 'user-item';
            item.dataset.userId = user.id;
            item.dataset.username = user.username.toLowerCase();
            
            const initial = user.username.charAt(0).toUpperCase();

            item.innerHTML = `
                <div class="user-avatar">${escapeHtml(initial)}</div>
                <div class="user-info">
                    <div class="user-name">${escapeHtml(user.username)}</div>
                </div>
                <div class="user-actions">
                    <button class="user-call-btn" title="Позвонить" data-user-id="${user.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                    </button>
                </div>
                <div class="user-status-indicator ${isOnline ? 'online' : ''}"></div>
            `;
            
            item.addEventListener('click', (e) => {
                // Если клик по кнопке звонка, не выбираем пользователя
                if (e.target.closest('.user-call-btn')) {
                    e.stopPropagation();
                    return;
                }
                selectUser(user);
            });
            
            usersList.appendChild(item);
            
            // Обработчик кнопки звонка
            const callBtn = item.querySelector('.user-call-btn');
            if (callBtn) {
                callBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (WebMessenger.Call && WebMessenger.Call.startCall) {
                        WebMessenger.Call.startCall(user.id, user.username);
                    }
                });
            }
        });
    }
    
    /**
     * Настройка поиска пользователей
     */
    function setupSearch() {
        const searchInput = document.getElementById('user-search');
        if (!searchInput) return;
        
        // Очищаем старые обработчики
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            if (query === '') {
                renderFilteredUsers(allUsers, window.WebMessenger?.App?.onlineUsers || []);
                return;
            }
            
            const filtered = allUsers.filter(user => 
                user.username.toLowerCase().includes(query)
            );
            
            renderFilteredUsers(filtered, window.WebMessenger?.App?.onlineUsers || []);
        });
    }
    
    /**
     * Выбор пользователя для чата
     */
    async function selectUser(user) {
        currentChatUser = user;
        
        // Обновление UI
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.dataset.userId) === user.id) {
                item.classList.add('active');
            }
        });
        
        // Закрываем сайдбар на мобильных
        const usersSidebar = document.querySelector('.users-sidebar');
        if (usersSidebar && window.innerWidth <= 768) {
            usersSidebar.classList.remove('open');
        }
        
        // Показ контейнера чата
        chatPlaceholder.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Для мобильных - добавляем класс active для корректного отображения
        if (window.innerWidth <= 768) {
            chatContainer.classList.add('active');
        }
        
        // Заголовок
        chatWithUser.textContent = user.username;
        
        // Загрузка сообщений
        if (window.WebMessenger && window.WebMessenger.App && window.WebMessenger.App.loadMessages) {
            await window.WebMessenger.App.loadMessages(currentChatUser.id);
        }
    }
    
    /**
     * Рендер сообщений
     */
    async function renderMessages(messages, currentUserId, currentUserPrivateKey) {
        messagesContainer.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            messagesContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Нет сообщений</p>';
            return;
        }
        
        // Получаем закрытый ключ
        const privateKey = localStorage.getItem('privateKey');
        // Кэш отправленных сообщений
        const sentCache = JSON.parse(localStorage.getItem('sentMessageCache') || '{}');

        for (const msg of messages) {
            const isSent = msg.sender_id === currentUserId;
            const messageEl = document.createElement('div');
            messageEl.className = `message ${isSent ? 'sent' : 'received'}`;

            let content = msg.encrypted_content;

            // Для отправленных сообщений сначала проверяем кэш
            if (isSent && sentCache[msg.encrypted_content]) {
                content = sentCache[msg.encrypted_content];
            } else if (privateKey) {
                // Пробуем расшифровать любое сообщение (включая свои)
                try {
                    content = await WebMessenger.Crypto.decrypt(msg.encrypted_content, privateKey);
                } catch (e) {
                    console.error('Failed to decrypt message:', e);
                    content = '[Не удалось расшифровать]';
                }
            }
            
            const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            messageEl.innerHTML = `
                ${escapeHtml(content)}
                <div class="message-time">${time}</div>
            `;
            
            messagesContainer.appendChild(messageEl);
        }
        
        // Прокрутка вниз
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    /**
     * Добавление нового сообщения
     */
    function addMessage(message, isSent) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const time = new Date(message.timestamp || Date.now()).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageEl.innerHTML = `
            ${escapeHtml(message.content || message.encrypted_content)}
            <div class="message-time">${time}</div>
        `;
        
        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    /**
     * Экранирование HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Очистка чата
     */
    function clearChat() {
        messagesContainer.innerHTML = '';
        chatContainer.classList.add('hidden');
        chatPlaceholder.classList.remove('hidden');
        currentChatUser = null;
    }
    
    /**
     * Обновление статуса пользователя
     */
    function updateUserStatus(isOnline) {
        const statusEl = document.getElementById('user-status');
        if (statusEl) {
            statusEl.textContent = isOnline ? 'онлайн' : 'оффлайн';
            statusEl.className = `user-status ${isOnline ? 'online' : 'offline'}`;
        }
    }
    
    return {
        init,
        showAuthScreen,
        showMainScreen,
        setCurrentUser,
        showError,
        hideError,
        renderUsersList,
        selectUser,
        renderMessages,
        addMessage,
        clearChat,
        updateUserStatus,
        // Call UI functions
        showIncomingCallModal,
        hideIncomingCallModal,
        showActiveCallScreen,
        hideActiveCallScreen,
        updateCallState
    };
})();

