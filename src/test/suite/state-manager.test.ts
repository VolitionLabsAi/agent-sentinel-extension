import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../stores/state-manager';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-state-test-'));
}

function writeStateFile(filePath: string, sessions: Array<{ session_id: string; transcript_path: string; title?: string; started_at?: string }>): void {
    fs.writeFileSync(filePath, JSON.stringify({ sessions }), 'utf-8');
}

suite('StateManager', () => {
    let tmpDir: string;
    let manager: StateManager;

    setup(() => {
        tmpDir = makeTempDir();
        manager = new StateManager();
    });

    teardown(() => {
        manager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('addFolder and removeFolder', () => {
        const filePath = path.join(tmpDir, 'state.json');
        manager.addFolder('folder1', filePath);
        // Adding same folder again is a no-op
        manager.addFolder('folder1', filePath);
        manager.removeFolder('folder1');
        // Removing non-existent folder is safe
        manager.removeFolder('nonexistent');
    });

    test('load reads state file and returns session IDs', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        const ids = manager.getSessionIds();
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('sess-1'));
        assert.ok(ids.includes('sess-2'));
    });

    test('getTranscriptPath returns path for known session', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        assert.strictEqual(manager.getTranscriptPath('sess-1'), '/tmp/t1.jsonl');
    });

    test('getTranscriptPath returns undefined for unknown session', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, []);

        manager.addFolder('folder1', filePath);
        await manager.load();

        assert.strictEqual(manager.getTranscriptPath('nonexistent'), undefined);
    });

    test('getSession returns full session state', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl', title: 'My Session', started_at: '2026-03-25T10:00:00Z' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        const session = manager.getSession('sess-1');
        assert.ok(session);
        assert.strictEqual(session.session_id, 'sess-1');
        assert.strictEqual(session.title, 'My Session');
        assert.strictEqual(session.started_at, '2026-03-25T10:00:00Z');
    });

    test('getAllSessions returns all sessions', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        const all = manager.getAllSessions();
        assert.strictEqual(all.length, 2);
    });

    test('handles missing state file gracefully', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.json');
        manager.addFolder('folder1', filePath);
        // Should not throw
        await manager.load();
        assert.strictEqual(manager.getSessionIds().length, 0);
    });

    test('handles corrupt state file gracefully', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        fs.writeFileSync(filePath, 'NOT VALID JSON', 'utf-8');

        manager.addFolder('folder1', filePath);
        // Should not throw
        await manager.load();
        assert.strictEqual(manager.getSessionIds().length, 0);
    });

    test('handles state file without sessions array gracefully', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        fs.writeFileSync(filePath, JSON.stringify({ other: 'data' }), 'utf-8');

        manager.addFolder('folder1', filePath);
        await manager.load();
        assert.strictEqual(manager.getSessionIds().length, 0);
    });

    test('handles sessions with missing session_id', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        fs.writeFileSync(filePath, JSON.stringify({
            sessions: [
                { transcript_path: '/tmp/t1.jsonl' },  // no session_id
                { session_id: 'valid', transcript_path: '/tmp/t2.jsonl' },
            ],
        }), 'utf-8');

        manager.addFolder('folder1', filePath);
        await manager.load();

        const ids = manager.getSessionIds();
        assert.strictEqual(ids.length, 1);
        assert.strictEqual(ids[0], 'valid');
    });

    test('multi-folder: sessions from multiple folders merge', async () => {
        const filePath1 = path.join(tmpDir, 'state1.json');
        const filePath2 = path.join(tmpDir, 'state2.json');
        writeStateFile(filePath1, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);
        writeStateFile(filePath2, [
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        manager.addFolder('folder1', filePath1);
        manager.addFolder('folder2', filePath2);
        await manager.load();

        const ids = manager.getSessionIds();
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('sess-1'));
        assert.ok(ids.includes('sess-2'));
    });

    test('removeFolder removes that folder\'s sessions from merged set', async () => {
        const filePath1 = path.join(tmpDir, 'state1.json');
        const filePath2 = path.join(tmpDir, 'state2.json');
        writeStateFile(filePath1, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);
        writeStateFile(filePath2, [
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        manager.addFolder('folder1', filePath1);
        manager.addFolder('folder2', filePath2);
        await manager.load();

        assert.strictEqual(manager.getSessionIds().length, 2);

        manager.removeFolder('folder1');
        const ids = manager.getSessionIds();
        assert.strictEqual(ids.length, 1);
        assert.strictEqual(ids[0], 'sess-2');
    });

    test('update detects session additions', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        const changeEvents: string[][] = [];
        manager.onSessionsChanged((ids) => {
            changeEvents.push(ids);
        });

        // Update state file with new session
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        await manager.update();

        assert.strictEqual(changeEvents.length, 1);
        assert.strictEqual(changeEvents[0].length, 2);
    });

    test('update detects session removals', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
            { session_id: 'sess-2', transcript_path: '/tmp/t2.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        const changeEvents: string[][] = [];
        manager.onSessionsChanged((ids) => {
            changeEvents.push(ids);
        });

        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);

        await manager.update();

        assert.strictEqual(changeEvents.length, 1);
        assert.strictEqual(changeEvents[0].length, 1);
    });

    test('update does not fire event when sessions unchanged', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        let fired = false;
        manager.onSessionsChanged(() => {
            fired = true;
        });

        // Update without changing file content
        await manager.update();

        assert.strictEqual(fired, false, 'should not fire when sessions unchanged');
    });

    test('dispose clears all state', async () => {
        const filePath = path.join(tmpDir, 'state.json');
        writeStateFile(filePath, [
            { session_id: 'sess-1', transcript_path: '/tmp/t1.jsonl' },
        ]);

        manager.addFolder('folder1', filePath);
        await manager.load();

        manager.dispose();
        assert.strictEqual(manager.getSessionIds().length, 0);
        assert.strictEqual(manager.getAllSessions().length, 0);
    });
});
