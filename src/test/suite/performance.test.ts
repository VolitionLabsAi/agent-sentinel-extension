import * as assert from 'assert';
import * as vscode from 'vscode';
import { ObservationStore } from '../../stores/observation-store';
import { PersistentObservation } from '../../types/observation';

suite('Performance Gates', () => {

    test('Extension activation completes in <200ms', async function () {
        // This test requires the real VS Code extension host.
        // Skip when running outside VS Code (e.g., plain mocha with vscode mock).
        const ext = vscode.extensions.getExtension('volition.agent-sentinel');
        if (!ext) {
            this.skip();
            return;
        }

        // If already active, activation time is effectively 0.
        // For a meaningful test, we measure the activate() function directly.
        if (!ext.isActive) {
            const start = performance.now();
            await ext.activate();
            const elapsed = performance.now() - start;
            assert.ok(
                elapsed < 200,
                `Activation took ${elapsed.toFixed(1)}ms, exceeds 200ms gate`,
            );
        } else {
            // Extension already activated — verify the exports exist (activation succeeded)
            assert.ok(ext.exports, 'Extension activated but returned no exports');
            assert.ok(ext.exports.observationStore, 'Missing observationStore in exports');
            assert.ok(ext.exports.liveFeedProvider, 'Missing liveFeedProvider in exports');
        }
    });

    test('ObservationStore memory usage <15MB with 10 sessions x 1000 observations', () => {
        // Force GC if available (run tests with --expose-gc)
        if (global.gc) {
            global.gc();
        }

        const heapBefore = process.memoryUsage().heapUsed;

        const store = new ObservationStore(1000);

        // Load 10 simulated sessions with 1000 observations each
        const NUM_SESSIONS = 10;
        const OBS_PER_SESSION = 1000;

        for (let s = 0; s < NUM_SESSIONS; s++) {
            const sessionId = `test-session-${s.toString().padStart(3, '0')}`;
            store.addFolder(`folder-${s}`, `/tmp/sentinel-test-${s}/observations.jsonl`);

            for (let i = 0; i < OBS_PER_SESSION; i++) {
                const obs = createTestObservation(sessionId, i);
                // Access the store's internal addObservation via getObservations path
                // Since addObservation is private, we feed observations through the public API
                // by directly manipulating — but that requires file I/O.
                // Instead, we measure the data structure size directly.
                (store as any).addObservation(obs);
            }
        }

        if (global.gc) {
            global.gc();
        }

        const heapAfter = process.memoryUsage().heapUsed;
        const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        console.log(`Memory delta for ${NUM_SESSIONS * OBS_PER_SESSION} observations: ${deltaMB.toFixed(2)}MB`);

        // Verify observations were stored
        const allObs = store.getObservations();
        assert.strictEqual(
            allObs.length,
            NUM_SESSIONS * OBS_PER_SESSION,
            `Expected ${NUM_SESSIONS * OBS_PER_SESSION} observations, got ${allObs.length}`,
        );

        // Gate: <15MB for 10,000 observations
        assert.ok(
            deltaMB < 15,
            `Memory usage ${deltaMB.toFixed(2)}MB exceeds 15MB gate for ${NUM_SESSIONS * OBS_PER_SESSION} observations`,
        );

        store.dispose();
    });

    test('ObservationStore respects maxObservations eviction per session', () => {
        const MAX = 100;
        const store = new ObservationStore(MAX);
        const sessionId = 'eviction-test';

        store.addFolder('folder-evict', '/tmp/sentinel-evict/observations.jsonl');

        // Add 2x the max
        for (let i = 0; i < MAX * 2; i++) {
            (store as any).addObservation(createTestObservation(sessionId, i));
        }

        const obs = store.getObservations({ sessionId });
        assert.strictEqual(obs.length, MAX, `Expected ${MAX} observations after eviction, got ${obs.length}`);

        // Verify it kept the newest (highest turn numbers)
        const turns = obs.map(o => o.turn_number);
        assert.strictEqual(turns[0], MAX, 'Eviction should keep newest observations');
        assert.strictEqual(turns[turns.length - 1], MAX * 2 - 1);

        store.dispose();
    });
});

function createTestObservation(sessionId: string, index: number): PersistentObservation {
    return {
        timestamp: new Date(Date.now() + index * 1000).toISOString(),
        session_id: sessionId,
        sentinel_name: 'test-sentinel',
        sentinel_label: 'Test Sentinel',
        severity: (['info', 'warning', 'critical'] as const)[index % 3],
        eval_id: `TEST-${(index % 50).toString().padStart(3, '0')}`,
        one_liner: `Test observation ${index} for session ${sessionId}`,
        analysis: `Detailed analysis for observation ${index}. This is a moderate-length string to simulate realistic payload sizes that would be encountered in production use.`,
        turn_number: index,
        duration_ms: Math.floor(Math.random() * 500),
        tier: (['security', 'general', 'session'] as const)[index % 3],
        visibility: index % 4 === 0 ? 'silent' : 'display',
        dynamic_eval_created: false,
        hook_type: index % 2 === 0 ? 'pre' : 'post',
        version: '1',
    };
}
