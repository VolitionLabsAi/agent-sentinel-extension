import * as assert from 'assert';
import { parseDurationToHours } from '../../utils/duration-parser';

suite('parseDurationToHours', () => {
    test('parses minutes', () => {
        assert.strictEqual(parseDurationToHours('30m'), 0.5);
        assert.strictEqual(parseDurationToHours('60m'), 1);
        assert.strictEqual(parseDurationToHours('45m'), 0.75);
    });

    test('parses hours', () => {
        assert.strictEqual(parseDurationToHours('12h'), 12);
        assert.strictEqual(parseDurationToHours('1h'), 1);
        assert.strictEqual(parseDurationToHours('24h'), 24);
    });

    test('parses days', () => {
        assert.strictEqual(parseDurationToHours('3d'), 72);
        assert.strictEqual(parseDurationToHours('7d'), 168);
        assert.strictEqual(parseDurationToHours('1d'), 24);
    });

    test('parses weeks', () => {
        assert.strictEqual(parseDurationToHours('2w'), 336);
        assert.strictEqual(parseDurationToHours('1w'), 168);
    });

    test('parses months', () => {
        assert.strictEqual(parseDurationToHours('1mo'), 720);
        assert.strictEqual(parseDurationToHours('2mo'), 1440);
    });

    test('parses plain numbers as hours', () => {
        assert.strictEqual(parseDurationToHours('24'), 24);
        assert.strictEqual(parseDurationToHours('0'), 0);
        assert.strictEqual(parseDurationToHours('72'), 72);
    });

    test('handles whitespace', () => {
        assert.strictEqual(parseDurationToHours('  12h  '), 12);
        assert.strictEqual(parseDurationToHours(' 24 '), 24);
    });

    test('is case insensitive', () => {
        assert.strictEqual(parseDurationToHours('12H'), 12);
        assert.strictEqual(parseDurationToHours('3D'), 72);
        assert.strictEqual(parseDurationToHours('1MO'), 720);
    });

    test('returns null for invalid input', () => {
        assert.strictEqual(parseDurationToHours(''), null);
        assert.strictEqual(parseDurationToHours('abc'), null);
        assert.strictEqual(parseDurationToHours('12x'), null);
        assert.strictEqual(parseDurationToHours('-5h'), null);
    });

    test('returns null for negative plain numbers', () => {
        assert.strictEqual(parseDurationToHours('-1'), null);
    });
});
