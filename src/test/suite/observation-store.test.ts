import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ObservationStore } from '../../stores/observation-store';
import { PersistentObservation } from '../../types/observation';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
}

function makeObservation(overrides: Partial<PersistentObservation> = {}): PersistentObservation {
    return {
        timestamp: new Date().toISOString(),
        session_id: 'test-session-1',
        sentinel_name: 'test-sentinel',
        sentinel_label: 'Test',
        severity: 'info',
        eval_id: 'GEN-001',
        one_liner: 'Test observation',
        analysis: '',
        turn_number: 1,
        duration_ms: 100,
        tier: 'general',
        visibility: 'display',
        dynamic_eval_created: false,
        hook_type: 'post',
        version: '1',
        ...overrides,
    };
}

function writeObservations(filePath: string, observations: PersistentObservation[]): void {
    const lines = observations.map(o => JSON.stringify(o)).join('\n') + '\n';
    fs.writeFileSync(filePath, lines, 'utf-8');
}

suite('ObservationStore', () => {
    let tmpDir: string;
    let store: ObservationStore;

    setup(() => {
        tmpDir = makeTempDir();
        store = new ObservationStore(1000);
    });

    teardown(() => {
        store.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('addFolder and removeFolder', () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        store.addFolder('folder1', filePath);
        // Adding same folder again is a no-op
        store.addFolder('folder1', filePath);
        store.removeFolder('folder1');
        // Removing non-existent folder is safe
        store.removeFolder('nonexistent');
    });

    test('load reads JSONL file and parses observations', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', eval_id: 'SEC-001' });
        const obs2 = makeObservation({ session_id: 'sess-1', eval_id: 'GEN-002' });
        writeObservations(filePath, [obs1, obs2]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].eval_id, 'SEC-001');
        assert.strictEqual(results[1].eval_id, 'GEN-002');
    });

    test('skips malformed JSON lines without crashing', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const validObs = makeObservation({ session_id: 'sess-1' });
        const content = JSON.stringify(validObs) + '\n' +
            'NOT VALID JSON\n' +
            '{broken json\n' +
            JSON.stringify(makeObservation({ session_id: 'sess-1', eval_id: 'VALID-002' })) + '\n';
        fs.writeFileSync(filePath, content, 'utf-8');

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 2, 'should have parsed 2 valid observations');
    });

    test('skips empty lines', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs = makeObservation({ session_id: 'sess-1' });
        const content = '\n\n' + JSON.stringify(obs) + '\n\n\n';
        fs.writeFileSync(filePath, content, 'utf-8');

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 1);
    });

    test('incremental update reads only new lines', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', eval_id: 'FIRST' });
        writeObservations(filePath, [obs1]);

        store.addFolder('folder1', filePath);
        await store.load();

        // Append a new observation
        const obs2 = makeObservation({ session_id: 'sess-1', eval_id: 'SECOND' });
        fs.appendFileSync(filePath, JSON.stringify(obs2) + '\n');

        await store.update();

        const results = store.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].eval_id, 'FIRST');
        assert.strictEqual(results[1].eval_id, 'SECOND');
    });

    test('detects file truncation and re-reads from beginning', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', eval_id: 'ORIGINAL' });
        const obs2 = makeObservation({ session_id: 'sess-1', eval_id: 'ORIGINAL-2' });
        writeObservations(filePath, [obs1, obs2]);

        store.addFolder('folder1', filePath);
        await store.load();

        // Truncate and write shorter content
        const newObs = makeObservation({ session_id: 'sess-1', eval_id: 'AFTER-TRUNCATE' });
        fs.writeFileSync(filePath, JSON.stringify(newObs) + '\n', 'utf-8');

        await store.update();

        const results = store.getObservations({ sessionId: 'sess-1' });
        // After truncation re-read, should contain original + new (addObservation appends)
        // The store doesn't clear on truncation - it re-reads from offset 0
        // This means old observations persist in memory plus new ones get added
        assert.ok(results.length >= 1, 'should have observations after truncation');
        const hasNewObs = results.some(o => o.eval_id === 'AFTER-TRUNCATE');
        assert.ok(hasNewObs, 'should include observation written after truncation');
    });

    test('respects maxObservations cap per session', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const smallStore = new ObservationStore(3); // Low cap

        const observations: PersistentObservation[] = [];
        for (let i = 0; i < 5; i++) {
            observations.push(makeObservation({
                session_id: 'sess-1',
                eval_id: `OBS-${i}`,
                turn_number: i,
            }));
        }
        writeObservations(filePath, observations);

        smallStore.addFolder('folder1', filePath);
        await smallStore.load();

        const results = smallStore.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 3, 'should cap at maxObservations');
        // Should keep the most recent (last 3)
        assert.strictEqual(results[0].eval_id, 'OBS-2');
        assert.strictEqual(results[1].eval_id, 'OBS-3');
        assert.strictEqual(results[2].eval_id, 'OBS-4');

        smallStore.dispose();
    });

    test('getObservations returns all observations when no filter', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1' });
        const obs2 = makeObservation({ session_id: 'sess-2' });
        writeObservations(filePath, [obs1, obs2]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations();
        assert.strictEqual(results.length, 2);
    });

    test('getObservations filters by sessionId', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1' });
        const obs2 = makeObservation({ session_id: 'sess-2' });
        const obs3 = makeObservation({ session_id: 'sess-1' });
        writeObservations(filePath, [obs1, obs2, obs3]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ sessionId: 'sess-1' });
        assert.strictEqual(results.length, 2);
    });

    test('getObservations filters by severity', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', severity: 'info' });
        const obs2 = makeObservation({ session_id: 'sess-1', severity: 'warning' });
        const obs3 = makeObservation({ session_id: 'sess-1', severity: 'critical' });
        writeObservations(filePath, [obs1, obs2, obs3]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ severity: 'warning' });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].severity, 'warning');
    });

    test('getObservations filters by evalId', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', eval_id: 'SEC-001' });
        const obs2 = makeObservation({ session_id: 'sess-1', eval_id: 'GEN-002' });
        writeObservations(filePath, [obs1, obs2]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ evalId: 'SEC-001' });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].eval_id, 'SEC-001');
    });

    test('getObservations filters by since timestamp', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const oldTime = '2024-01-01T00:00:00.000Z';
        const newTime = '2026-03-25T00:00:00.000Z';
        const obs1 = makeObservation({ session_id: 'sess-1', timestamp: oldTime });
        const obs2 = makeObservation({ session_id: 'sess-1', timestamp: newTime });
        writeObservations(filePath, [obs1, obs2]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ since: '2025-01-01T00:00:00.000Z' });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].timestamp, newTime);
    });

    test('getObservations combines multiple filters', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        const obs1 = makeObservation({ session_id: 'sess-1', severity: 'warning', eval_id: 'SEC-001' });
        const obs2 = makeObservation({ session_id: 'sess-1', severity: 'info', eval_id: 'SEC-001' });
        const obs3 = makeObservation({ session_id: 'sess-1', severity: 'warning', eval_id: 'GEN-002' });
        writeObservations(filePath, [obs1, obs2, obs3]);

        store.addFolder('folder1', filePath);
        await store.load();

        const results = store.getObservations({ severity: 'warning', evalId: 'SEC-001' });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].severity, 'warning');
        assert.strictEqual(results[0].eval_id, 'SEC-001');
    });

    test('multi-folder: observations from multiple folders merge', async () => {
        const filePath1 = path.join(tmpDir, 'obs1.jsonl');
        const filePath2 = path.join(tmpDir, 'obs2.jsonl');
        writeObservations(filePath1, [makeObservation({ session_id: 'sess-1' })]);
        writeObservations(filePath2, [makeObservation({ session_id: 'sess-2' })]);

        store.addFolder('folder1', filePath1);
        store.addFolder('folder2', filePath2);
        await store.load();

        const all = store.getObservations();
        assert.strictEqual(all.length, 2);
    });

    test('clearSession removes all observations for a session', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        writeObservations(filePath, [
            makeObservation({ session_id: 'sess-1' }),
            makeObservation({ session_id: 'sess-1' }),
            makeObservation({ session_id: 'sess-2' }),
        ]);

        store.addFolder('folder1', filePath);
        await store.load();

        store.clearSession('sess-1');
        assert.strictEqual(store.getObservations({ sessionId: 'sess-1' }).length, 0);
        assert.strictEqual(store.getObservations({ sessionId: 'sess-2' }).length, 1);
    });

    test('handles missing file gracefully on load', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.jsonl');
        store.addFolder('folder1', filePath);
        // Should not throw
        await store.load();
        assert.strictEqual(store.getObservations().length, 0);
    });

    test('handles missing file gracefully on update', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.jsonl');
        store.addFolder('folder1', filePath);
        // Should not throw
        await store.update();
        assert.strictEqual(store.getObservations().length, 0);
    });

    test('fires onObservationReceived event for each valid observation', async () => {
        const filePath = path.join(tmpDir, 'obs.jsonl');
        writeObservations(filePath, [
            makeObservation({ session_id: 'sess-1', eval_id: 'A' }),
            makeObservation({ session_id: 'sess-1', eval_id: 'B' }),
        ]);

        const received: PersistentObservation[] = [];
        store.onObservationReceived((obs) => {
            received.push(obs);
        });

        store.addFolder('folder1', filePath);
        await store.load();

        assert.strictEqual(received.length, 2);
        assert.strictEqual(received[0].eval_id, 'A');
        assert.strictEqual(received[1].eval_id, 'B');
    });

    test('getObservations returns empty for unknown session', () => {
        const results = store.getObservations({ sessionId: 'nonexistent' });
        assert.strictEqual(results.length, 0);
    });
});
