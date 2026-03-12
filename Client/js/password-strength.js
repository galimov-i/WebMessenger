/**
 * PasswordStrength - оценка сложности пароля
 */
var WebMessenger = window.WebMessenger || {};
if (!window.WebMessenger) {
    window.WebMessenger = WebMessenger;
}

WebMessenger.PasswordStrength = (() => {
    /**
     * Оценивает сложность пароля по шкале от 0 до 4
     * 0 - очень слабый
     * 1 - слабый
     * 2 - средний
     * 3 - сильный
     * 4 - очень сильный
     */
    function evaluate(password) {
        if (!password || password.length === 0) {
            return { score: 0, label: 'нет', crackTime: 'мгновенно' };
        }

        let score = 0;

        // Длина
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        if (password.length >= 16) score += 1;

        // Разнообразие символов
        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        const hasDigit = /\d/.test(password);
        const hasSpecial = /[^a-zA-Z0-9]/.test(password);

        if (hasLower && hasUpper) score += 1;
        if (hasDigit) score += 1;
        if (hasSpecial) score += 1;

        // Штраф за повторяющиеся символы
        const repeated = (password.match(/(.)\1{2,}/g) || []).length;
        if (repeated > 0) score = Math.max(0, score - 1);

        // Штраф за простые последовательности (123, abc)
        const sequences = ['123', '234', '345', '456', '567', '678', '789',
                           'abc', 'bcd', 'cde', 'def', 'efg', 'fgh', 'ghi', 'hij', 'ijk', 'jkl', 'klm', 'lmn', 'mno', 'nop', 'opq', 'pqr', 'qrs', 'rst', 'stu', 'tuv', 'uvw', 'vwx', 'wxy', 'xyz',
                           'qwerty', 'asdfgh', 'zxcvbn'];
        let sequencePenalty = 0;
        for (const seq of sequences) {
            if (password.toLowerCase().includes(seq)) {
                sequencePenalty += 1;
                break;
            }
        }
        score = Math.max(0, score - sequencePenalty);

        // Ограничиваем score от 0 до 4
        score = Math.min(4, Math.max(0, score));

        // Метки
        const labels = ['очень слабый', 'слабый', 'средний', 'сильный', 'очень сильный'];
        const label = labels[score];

        // Оценочное время взлома (упрощённо)
        const crackTime = estimateCrackTime(password, score);

        return {
            score,
            label,
            crackTime,
            hasLower,
            hasUpper,
            hasDigit,
            hasSpecial,
            length: password.length
        };
    }

    /**
     * Оценочное время взлома пароля (для отображения)
     */
    function estimateCrackTime(password, score) {
        // Очень грубая оценка на основе энтропии
        const entropyPerChar = 4; // примерное значение
        const entropy = password.length * entropyPerChar;
        // Предполагаем 10^9 попыток в секунду (современный брутфорс)
        const seconds = Math.pow(2, entropy) / 1e9;

        if (seconds < 1) return 'мгновенно';
        if (seconds < 60) return 'несколько секунд';
        if (seconds < 3600) return 'минуты';
        if (seconds < 86400) return 'часы';
        if (seconds < 2592000) return 'дни';
        if (seconds < 31536000) return 'месяцы';
        return 'годы';
    }

    /**
     * Генерация рекомендаций по улучшению пароля
     */
    function getRecommendations(evaluation) {
        const recs = [];
        if (evaluation.length < 8) {
            recs.push('Увеличьте длину пароля до 8+ символов.');
        }
        if (!evaluation.hasLower) {
            recs.push('Добавьте строчные буквы (a-z).');
        }
        if (!evaluation.hasUpper) {
            recs.push('Добавьте заглавные буквы (A-Z).');
        }
        if (!evaluation.hasDigit) {
            recs.push('Добавьте цифры (0-9).');
        }
        if (!evaluation.hasSpecial) {
            recs.push('Добавьте специальные символы (!@#$%^&* и т.д.).');
        }
        if (recs.length === 0) {
            recs.push('Пароль достаточно сильный. Можете использовать его.');
        }
        return recs;
    }

    /**
     * Генерация случайного пароля заданной длины
     */
    function generatePassword(length = 12) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let password = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            password += charset[randomIndex];
        }
        return password;
    }

    return {
        evaluate,
        getRecommendations,
        generatePassword
    };
})();