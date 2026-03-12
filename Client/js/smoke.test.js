/**
 * Smoke test to ensure Jest works.
 */
describe('Smoke test', () => {
    test('true is true', () => {
        expect(true).toBe(true);
    });

    test('addition works', () => {
        expect(1 + 1).toBe(2);
    });
});