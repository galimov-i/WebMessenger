/**
 * CryptoModule - работа с криптографией через Web Crypto API
 * Использует RSA-OAEP 2048 бит для асимметричного шифрования
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}
console.log('WebMessenger.Crypto loading...');

WebMessenger.Crypto = (() => {
    let keyPair = null;
    
    /**
     * Генерирует пару ключей RSA-OAEP 2048 бит
     */
    async function generateKeyPair() {
        keyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );
        return keyPair;
    }
    
    /**
     * Импортирует открытый ключ из PEM формата
     * @param {string} pem - PEM строка открытого ключа
     * @returns {CryptoKey}
     */
    async function importPublicKey(pem) {
        console.log('importPublicKey input PEM:', pem);
        
        // Удаляем заголовки и преобразуем base64 в бинарный формат
        const pemHeader = '-----BEGIN PUBLIC KEY-----';
        const pemFooter = '-----END PUBLIC KEY-----';
        let pemContents = pem
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .trim()  // Удаляем пробелы по краям
            .replace(/\s/g, '');  // Удаляем все пробелы и переносы
        
        console.log('Base64 content length:', pemContents.length);
        console.log('Base64 content (first 50):', pemContents.substring(0, 50));
        
        try {
            const binaryString = atob(pemContents);
            console.log('Binary string length:', binaryString.length);
            
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            console.log('Uint8Array length:', bytes.length);
            console.log('First 20 bytes (hex):', Array.from(bytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Проверяем, что это за формат
            // PKCS#8/SubjectPublicKeyInfo начинается с: 30 82 (SEQUENCE + length)
            // PKCS#1/RSAPublicKey начинается с: 30 82 (SEQUENCE + length)  
            // Оба начинаются с 0x30, так что проверим второй байт
            if (bytes[0] !== 0x30) {
                console.error('Invalid format: first byte is', bytes[0], 'expected 0x30');
                throw new Error('Invalid key format');
            }
            
            const key = await crypto.subtle.importKey(
                'spki',
                bytes,
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256"
                },
                false,
                ['encrypt']
            );
            console.log('Key imported successfully');
            return key;
        } catch (e) {
            console.error('importKey failed:', e);
            
            // Пробуем с 'pkcs1' если не получилось
            console.log('Trying pkcs1 format...');
            try {
                const binaryString = atob(pemContents);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const key = await crypto.subtle.importKey(
                    'rsapublickey',  // Пробуем PKCS#1
                    bytes,
                    {
                        name: "RSA-OAEP",
                        hash: "SHA-256"
                    },
                    false,
                    ['encrypt']
                );
                console.log('Key imported with pkcs1');
                return key;
            } catch (e2) {
                console.error('pkcs1 also failed:', e2);
                throw e;
            }
        }
    }
    
    /**
     * Импортирует закрытый ключ из PEM формата (для расшифровки своих сообщений)
     * @param {string} pem - PEM строка закрытого ключа
     * @returns {CryptoKey}
     */
    async function importPrivateKey(pem) {
        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        const pemContents = pem
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        
        const binaryString = atob(pemContents);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return await crypto.subtle.importKey(
            'pkcs8',
            bytes,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            false,
            ['decrypt']
        );
    }
    
    /**
     * Конвертирует PKCS#1 ключ в PKCS#8 (SubjectPublicKeyInfo)
     */
    function convertPKCS1ToPKCS8(pkcs1Bytes) {
        // PKCS#1 RSAPublicKey: SEQUENCE { modulus INTEGER, publicExponent INTEGER }
        // PKCS#8 SubjectPublicKeyInfo: SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
        
        // OID для RSA: 1.2.840.113549.1.1.1
        const rsaOID = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
        const nullBytes = [0x05, 0x00];
        
        // AlgorithmIdentifier = SEQUENCE { OID, NULL }
        const algIdLength = 2 + rsaOID.length + 2 + nullBytes.length; // SEQUENCE + OID + NULL
        const algIdHeader = [0x30, algIdLength, 0x30, rsaOID.length + 2];
        
        // Полная длина BIT STRING = 1 (число бит) + длина ключа
        const totalKeyLength = 1 + pkcs1Bytes.length;
        
        // Вычисляем общую длину
        // SEQUENCE (2 байта на длину) + algId + BIT STRING (2 байта на длину) + данные
        const totalLength = 2 + (2 + rsaOID.length + 2 + nullBytes.length) + 2 + totalKeyLength;
        
        // Создаём массив
        const pkcs8 = new Uint8Array(2 + totalLength);
        
        // SEQUENCE header
        pkcs8[0] = 0x30;
        pkcs8[1] = totalLength;
        
        let offset = 2;
        
        // AlgorithmIdentifier SEQUENCE
        pkcs8[offset++] = 0x30;
        pkcs8[offset++] = rsaOID.length + 2 + nullBytes.length;
        
        // OID
        pkcs8[offset++] = 0x06;
        pkcs8[offset++] = rsaOID.length;
        rsaOID.forEach(b => pkcs8[offset++] = b);
        
        // NULL
        pkcs8[offset++] = 0x05;
        pkcs8[offset++] = 0x00;
        
        // BIT STRING
        pkcs8[offset++] = 0x03;
        pkcs8[offset++] = totalKeyLength;
        pkcs8[offset++] = 0x00; // число неиспользуемых бит
        
        // Копируем ключ
        pkcs1Bytes.forEach(b => pkcs8[offset++] = b);
        
        return pkcs8.buffer;
    }
    
    /**
     * Экспортирует открытый ключ в PEM формат (PKCS#8/SubjectPublicKeyInfo)
     * @param {CryptoKey} publicKey
     * @returns {string}
     */
    async function exportPublicKey(publicKey) {
        // Экспортируем в 'spki' формат (уже PKCS#8/SubjectPublicKeyInfo)
        let exported = await crypto.subtle.exportKey('spki', publicKey);
        const bytes = new Uint8Array(exported);
        
        console.log('exportPublicKey: bytes length:', bytes.length);
        console.log('exportPublicKey: first 10 bytes:', Array.from(bytes.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Web Crypto API 'spki' экспортирует уже в формате SubjectPublicKeyInfo (PKCS#8)
        // Просто кодируем в base64 и добавляем заголовки
        const base64 = arrayBufferToBase64(exported);
        return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    }
    
    /**
     * Экспортирует закрытый ключ в PEM формат
     * @param {CryptoKey} privateKey
     * @returns {string}
     */
    async function exportPrivateKey(privateKey) {
        const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
        const base64 = arrayBufferToBase64(exported);
        return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
    }
    
    /**
     * Шифрует сообщение открытым ключом
     * @param {string} message - текст сообщения
     * @param {string} publicKeyPEM - PEM формат открытого ключа
     * @returns {string} - base64 закодированное зашифрованное сообщение
     */
    async function encrypt(message, publicKeyPEM) {
        if (!publicKeyPEM) {
            throw new Error('Missing public key');
        }
        
        console.log('encrypt: starting with PEM length:', publicKeyPEM.length);
        
        let publicKey;
        try {
            publicKey = await importPublicKey(publicKeyPEM);
        } catch (e) {
            console.error('encrypt: importPublicKey failed:', e);
            
            // Пробуем альтернативный формат - если это PKCS#1 (RSA PUBLIC KEY)
            console.log('Trying alternative format...');
            const pemHeader = '-----BEGIN RSA PUBLIC KEY-----';
            const pemFooter = '-----END RSA PUBLIC KEY-----';
            if (publicKeyPEM.includes(pemHeader)) {
                const altPEM = publicKeyPEM.replace('-----BEGIN PUBLIC KEY-----', pemHeader)
                                          .replace('-----END PUBLIC KEY-----', pemFooter);
                publicKey = await importPublicKey(altPEM);
            } else {
                throw e;
            }
        }
        
        const encoder = new TextEncoder();
        const encodedMessage = encoder.encode(message);
        
        // RSA-OAEP имеет ограничение на размер данных (меньше чем размер ключа)
        // Для длинных сообщений используем гибридное шифрование
        // Но для простоты мессенджера ограничим размер сообщения
        const maxLength = 190; // 2048 бит / 8 - 66 байт (OAEP padding)
        
        if (encodedMessage.length > maxLength) {
            throw new Error('Сообщение слишком длинное. Максимум ' + maxLength + ' символов.');
        }
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            publicKey,
            encodedMessage
        );
        
        return arrayBufferToBase64(encrypted);
    }
    
    /**
     * Расшифровывает сообщение закрытым ключом
     * @param {string} encryptedBase64 - base64 закодированное зашифрованное сообщение
     * @param {string} privateKeyPEM - PEM формат закрытого ключа
     * @returns {string} - расшифрованное сообщение
     */
    async function decrypt(encryptedBase64, privateKeyPEM) {
        if (!privateKeyPEM || !encryptedBase64) {
            throw new Error('Missing private key or encrypted content');
        }
        
        const privateKey = await importPrivateKey(privateKeyPEM);
        const encrypted = base64ToArrayBuffer(encryptedBase64);
        
        const decrypted = await crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            privateKey,
            encrypted
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }
    
    /**
     * Преобразует ArrayBuffer в base64 строку
     */
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    /**
     * Преобразует base64 строку в Uint8Array
     */
    function base64ToArrayBuffer(base64) {
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            console.error('base64ToArrayBuffer: invalid base64:', base64.substring(0, 50));
            throw new Error('Invalid base64 content');
        }
    }
        
    /**
     * Инициализация модуля
     */
    async function init() {
        // Проверка поддержки Web Crypto API
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API не поддерживается в этом браузере');
        }
        
        // Загрузка ключей из localStorage
        const savedPublicKey = localStorage.getItem('publicKey');
        const savedPrivateKey = localStorage.getItem('privateKey');
        
        if (savedPublicKey && savedPrivateKey) {
            try {
                const publicKey = await importPublicKey(savedPublicKey);
                const privateKey = await importPrivateKey(savedPrivateKey);
                keyPair = { publicKey, privateKey };
            } catch (e) {
                console.error('Failed to load keys from storage:', e);
                localStorage.removeItem('publicKey');
                localStorage.removeItem('privateKey');
            }
        }
    }
    
    /**
     * Сохраняет ключи в localStorage
     */
    async function saveKeys(publicKeyPEM, privateKeyPEM) {
        localStorage.setItem('publicKey', publicKeyPEM);
        localStorage.setItem('privateKey', privateKeyPEM);
    }
    
    /**
     * Очищает сохраненные ключи
     */
    function clearKeys() {
        localStorage.removeItem('publicKey');
        localStorage.removeItem('privateKey');
        keyPair = null;
    }
    
    return {
        init,
        encrypt,
        decrypt,
        generateKeyPair,
        importPublicKey,
        exportPublicKey,
        exportPrivateKey,
        saveKeys,
        clearKeys,
        arrayBufferToBase64,
        base64ToArrayBuffer
    };
})();

