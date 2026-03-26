import * as assert from 'assert';
import { Debouncer } from '../../utils/debouncer';

suite('Debouncer', () => {
    test('calls callback after delay', (done) => {
        let called = false;
        const debouncer = new Debouncer(() => {
            called = true;
        }, 50);

        debouncer.trigger();

        // Should not be called immediately
        assert.strictEqual(called, false);

        setTimeout(() => {
            assert.strictEqual(called, true);
            debouncer.dispose();
            done();
        }, 100);
    });

    test('coalesces rapid calls into single callback', (done) => {
        let callCount = 0;
        const debouncer = new Debouncer(() => {
            callCount++;
        }, 50);

        // Trigger rapidly 5 times
        debouncer.trigger();
        debouncer.trigger();
        debouncer.trigger();
        debouncer.trigger();
        debouncer.trigger();

        setTimeout(() => {
            assert.strictEqual(callCount, 1, 'should only call once after rapid triggers');
            debouncer.dispose();
            done();
        }, 150);
    });

    test('resets timer on each trigger', (done) => {
        let called = false;
        const debouncer = new Debouncer(() => {
            called = true;
        }, 80);

        debouncer.trigger();

        // Trigger again after 50ms, resetting the 80ms timer
        setTimeout(() => {
            debouncer.trigger();
        }, 50);

        // At 100ms from start (50ms after second trigger), should NOT have fired yet
        setTimeout(() => {
            assert.strictEqual(called, false, 'should not have fired yet after timer reset');
        }, 100);

        // At 180ms from start (130ms after second trigger), should have fired
        setTimeout(() => {
            assert.strictEqual(called, true, 'should have fired after full delay from last trigger');
            debouncer.dispose();
            done();
        }, 200);
    });

    test('dispose cancels pending timer', (done) => {
        let called = false;
        const debouncer = new Debouncer(() => {
            called = true;
        }, 50);

        debouncer.trigger();
        debouncer.dispose();

        setTimeout(() => {
            assert.strictEqual(called, false, 'callback should not fire after dispose');
            done();
        }, 100);
    });

    test('dispose is safe to call multiple times', () => {
        const debouncer = new Debouncer(() => {}, 50);
        debouncer.dispose();
        debouncer.dispose(); // Should not throw
    });

    test('dispose without any trigger is safe', () => {
        const debouncer = new Debouncer(() => {}, 50);
        debouncer.dispose(); // Should not throw
    });
});
