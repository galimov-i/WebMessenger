/**
 * Unit tests for WebMessenger.API
 */
describe('WebMessenger.API', () => {
    let originalFetch;
    let mockFetch;
    let mockSessionStorage;

    beforeAll(() => {
        // Mock fetch
        originalFetch = global.fetch;
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock sessionStorage
        mockSessionStorage = (() => {
            let store = {};
            return {
                getItem: jest.fn(key => store[key] || null),
                setItem: jest.fn((key, value) => { store[key] = value; }),
                removeItem: jest.fn(key => { delete store[key]; }),
                clear: jest.fn(() => { store = {}; }),
            };
        })();
        Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    beforeEach(() => {
        mockFetch.mockClear();
        mockSessionStorage.getItem.mockClear();
        mockSessionStorage.setItem.mockClear();
        mockSessionStorage.removeItem.mockClear();
        mockSessionStorage.clear();
        // Reset WebMessenger.API internal token
        if (window.WebMessenger && window.WebMessenger.API) {
            window.WebMessenger.API.setToken(null);
        }
    });

    describe('request', () => {
        it('should add Authorization header if token exists', async () => {
            // Set token
            mockSessionStorage.getItem.mockReturnValue('fake-token');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([['content-type', 'application/json']]),
                json: async () => ({ success: true }),
            });

            await window.WebMessenger.API.request('/test');

            expect(mockFetch).toHaveBeenCalledWith('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer fake-token',
                },
            });
        });

        it('should throw error on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                headers: new Map([['content-type', 'application/json']]),
                json: async () => ({ error: 'Internal error' }),
            });

            await expect(window.WebMessenger.API.request('/test')).rejects.toThrow('Ошибка запроса');
        });

        it('should handle 401 unauthorized and call logout', async () => {
            mockSessionStorage.getItem.mockReturnValue('expired-token');
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                headers: new Map([['content-type', 'application/json']]),
                json: async () => ({ error: 'Unauthorized' }),
            });

            // Mock logout
            const logoutSpy = jest.spyOn(window.WebMessenger.API, 'logout').mockImplementation(() => {});

            await expect(window.WebMessenger.API.request('/test')).rejects.toThrow('Сессия истекла');
            expect(logoutSpy).toHaveBeenCalled();
            logoutSpy.mockRestore();
        });
    });

    describe('register', () => {
        it('should send correct payload and set token on success', async () => {
            const mockResponse = { token: 'new-token', user: { id: 1, username: 'test' } };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([['content-type', 'application/json']]),
                json: async () => mockResponse,
            });

            const result = await window.WebMessenger.API.register('test', 'password', 'public-key');

            expect(mockFetch).toHaveBeenCalledWith('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: 'test',
                    password: 'password',
                    public_key: 'public-key',
                }),
            });
            expect(result).toEqual(mockResponse);
            expect(mockSessionStorage.setItem).toHaveBeenCalledWith('authToken', 'new-token');
        });
    });

    describe('login', () => {
        it('should send credentials and store token', async () => {
            const mockResponse = { token: 'login-token', user: { id: 1, username: 'test' } };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map([['content-type', 'application/json']]),
                json: async () => mockResponse,
            });

            const result = await window.WebMessenger.API.login('test', 'password');

            expect(mockFetch).toHaveBeenCalledWith('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: 'test',
                    password: 'password',
                    public_key: null,
                }),
            });
            expect(result).toEqual(mockResponse);
            expect(mockSessionStorage.setItem).toHaveBeenCalledWith('authToken', 'login-token');
        });
    });

    describe('logout', () => {
        it('should clear token and storage', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
            });

            await window.WebMessenger.API.logout();

            expect(mockFetch).toHaveBeenCalledWith('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('authToken');
            expect(mockSessionStorage.clear).toHaveBeenCalled();
        });
    });
});