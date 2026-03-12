/**
 * CallManager - модуль для управления голосовыми звонками через WebRTC
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}
console.log('WebMessenger.Call loading...');

WebMessenger.Call = (() => {
    let peerConnection = null;
    let localStream = null;
    let remoteStream = null;
    let currentCall = {
        targetUserId: null,
        targetUserName: null,
        callId: null,
        isInitiator: false,
        status: 'idle' // idle, calling, ringing, connected, ended
    };
    let ws = null; // WebSocket соединение (будет передано из app.js)

    // Конфигурация STUN серверов
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    /**
     * Инициализация модуля
     * @param {WebSocket} webSocket - активное WebSocket соединение
     */
    function init(webSocket) {
        ws = webSocket;
        console.log('CallManager initialized with WebSocket');
    }

    /**
     * Начать звонок пользователю
     * @param {number} targetUserId - ID пользователя
     * @param {string} targetUserName - Имя пользователя (опционально)
     */
    async function startCall(targetUserId, targetUserName) {
        if (currentCall.status !== 'idle') {
            console.warn('Уже есть активный звонок');
            return;
        }
        console.log(`Starting call to user ${targetUserId} (${targetUserName})`);
        currentCall.targetUserId = targetUserId;
        currentCall.targetUserName = targetUserName;
        currentCall.isInitiator = true;
        currentCall.status = 'calling';

        try {
            // Получение аудиопотока с микрофона
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            // Создание RTCPeerConnection
            createPeerConnection();
            // Добавление локального потока
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            // Создание offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            // Отправка offer через WebSocket
            sendCallMessage('call_offer', targetUserId, { sdp: offer });
            // Обновление UI
            updateCallUI('calling');
            // Показать экран активного звонка
            if (window.WebMessenger && window.WebMessenger.UI && window.WebMessenger.UI.showActiveCallScreen) {
                window.WebMessenger.UI.showActiveCallScreen(targetUserId, targetUserName || 'Пользователь', true);
            }
        } catch (error) {
            console.error('Failed to start call:', error);
            endCall();
        }
    }

    /**
     * Принять входящий звонок
     * @param {number} callerUserId - ID звонящего
     * @param {object} offer - SDP offer
     */
    async function acceptCall(callerUserId, offer) {
        if (currentCall.status !== 'idle') {
            console.warn('Не могу принять звонок, уже есть активный');
            return;
        }
        console.log(`Accepting call from user ${callerUserId}`);
        currentCall.targetUserId = callerUserId;
        currentCall.isInitiator = false;
        currentCall.status = 'ringing';

        try {
            // Получение аудиопотока
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            createPeerConnection();
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            // Установка удаленного описания (offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            // Создание answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            // Отправка answer
            sendCallMessage('call_answer', callerUserId, { sdp: answer });
            currentCall.status = 'connected';
            updateCallUI('connected');
        } catch (error) {
            console.error('Failed to accept call:', error);
            endCall();
        }
    }

    /**
     * Завершить текущий звонок
     */
    function endCall() {
        console.log('Ending call');
        if (currentCall.targetUserId && currentCall.status !== 'ended') {
            sendCallMessage('call_end', currentCall.targetUserId, {});
        }
        cleanup();
        updateCallUI('ended');
        // Через секунду сбросить состояние
        setTimeout(() => {
            currentCall.status = 'idle';
            currentCall.targetUserId = null;
            updateCallUI('idle');
        }, 1000);
    }

    /**
     * Отклонить входящий звонок
     */
    function rejectCall(callerUserId) {
        console.log('Rejecting call from', callerUserId);
        sendCallMessage('call_end', callerUserId, {});
        cleanup();
        updateCallUI('idle');
    }

    /**
     * Создание RTCPeerConnection
     */
    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(rtcConfig);

        // Обработчик ICE кандидатов
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                sendCallMessage('call_candidate', currentCall.targetUserId, { candidate: event.candidate });
            }
        };

        // Получение удаленного потока
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            // Воспроизведение удаленного аудио
            const remoteAudio = document.getElementById('remote-audio');
            if (remoteAudio) {
                remoteAudio.srcObject = remoteStream;
                remoteAudio.play().catch(e => console.error('Audio play error:', e));
            }
        };

        // Обработчик изменения состояния соединения
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
                endCall();
            }
        };
    }

    /**
     * Отправка сообщения звонка через WebSocket
     */
    function sendCallMessage(type, targetUserId, payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        const message = {
            type: type,
            payload: {
                target_user_id: targetUserId,
                ...payload
            }
        };
        ws.send(JSON.stringify(message));
        console.log('Sent call message:', type, targetUserId);
    }

    /**
     * Обработка входящего сообщения звонка
     */
    function handleCallMessage(data) {
        const { type, payload } = data;
        console.log('Received call message:', type, payload);

        switch (type) {
            case 'call_offer':
                // Входящий звонок
                if (currentCall.status !== 'idle') {
                    // Занято, отправляем call_end
                    sendCallMessage('call_end', payload.target_user_id, {});
                    break;
                }
                // Показать UI входящего звонка
                showIncomingCallUI(payload.target_user_id, payload.sdp);
                break;

            case 'call_answer':
                // Ответ на наш offer
                if (peerConnection && currentCall.status === 'calling') {
                    peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    currentCall.status = 'connected';
                    updateCallUI('connected');
                }
                break;

            case 'call_candidate':
                // ICE кандидат
                if (peerConnection && payload.candidate) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
                break;

            case 'call_end':
                // Звонок завершен
                console.log('Call ended by remote party');
                endCall();
                break;
        }
    }

    /**
     * Очистка ресурсов
     */
    function cleanup() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        remoteStream = null;
    }

    /**
     * Обновление UI звонка
     */
    function updateCallUI(state) {
        // Вызовем глобальный обработчик UI
        if (window.WebMessenger && window.WebMessenger.UI && window.WebMessenger.UI.updateCallState) {
            const statusMap = {
                'idle': 'Звонок завершен',
                'calling': 'Звонок...',
                'ringing': 'Входящий звонок',
                'connected': 'В разговоре',
                'ended': 'Завершение'
            };
            const statusText = statusMap[state] || state;
            const isConnected = state === 'connected';
            window.WebMessenger.UI.updateCallState(statusText, isConnected);
        }
        // Показать/скрыть экран звонка
        if (state === 'calling' || state === 'ringing' || state === 'connected') {
            if (window.WebMessenger && window.WebMessenger.UI && window.WebMessenger.UI.showActiveCallScreen) {
                window.WebMessenger.UI.showActiveCallScreen(
                    currentCall.targetUserId,
                    currentCall.targetUserName || 'Пользователь',
                    currentCall.isInitiator
                );
            }
        } else if (state === 'idle' || state === 'ended') {
            if (window.WebMessenger && window.WebMessenger.UI && window.WebMessenger.UI.hideActiveCallScreen) {
                window.WebMessenger.UI.hideActiveCallScreen();
            }
        }
        console.log('Call UI state:', state);
    }

    /**
     * Показать UI входящего звонка
     */
    function showIncomingCallUI(callerUserId, sdp) {
        // Получить имя звонящего из списка пользователей
        let callerName = 'Пользователь';
        if (window.WebMessenger && window.WebMessenger.App && window.WebMessenger.App.users) {
            const users = window.WebMessenger.App.users;
            const caller = users.find(u => u.id === callerUserId);
            if (caller) callerName = caller.username;
        }
        // Сохранить имя в currentCall
        currentCall.targetUserName = callerName;
        
        if (window.WebMessenger && window.WebMessenger.UI && window.WebMessenger.UI.showIncomingCallModal) {
            window.WebMessenger.UI.showIncomingCallModal(callerUserId, callerName, sdp);
        } else {
            console.log('Incoming call from', callerUserId, 'offer:', sdp);
            // Для теста автоматически принимаем
            if (confirm(`Входящий звонок от ${callerName}. Принять?`)) {
                acceptCall(callerUserId, sdp);
            } else {
                rejectCall(callerUserId);
            }
        }
    }

    // Экспорт публичных методов
    return {
        init,
        startCall,
        acceptCall,
        endCall,
        rejectCall,
        handleCallMessage,
        getCallStatus: () => currentCall.status,
        getTargetUserId: () => currentCall.targetUserId
    };
})();