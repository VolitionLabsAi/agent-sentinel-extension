import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ObservationStore } from '../../stores/observation-store';
import { StateManager } from '../../stores/state-manager';
import { ConfigManager } from '../../stores/config-manager';
import { ObservationsProvider } from '../../ui/sidebar/observations-provider';
import { PersistentObservation } from '../../types/observation';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-provider-test-'));
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

function writeConfig(configPath: string, config: Record<string, unknown>): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

suite('ObservationsProvider — window filter', () => {
    let tmpDir: string;
    let store: ObservationStore;
    let stateManager: StateManager;
    let configManager: ConfigManager;
    let provider: ObservationsProvider;
    let obsFilePath: string;
    let configPath: string;

    setup(() => {
        tmpDir = makeTempDir();
        obsFilePath = path.join(tmpDir, 'observations.jsonl');
        configPath = path.join(tmpDir, 'sentinel.config.json');
        store = new ObservationStore(1000);
        stateManager = new StateManager();
        configManager = new ConfigManager();
    });

    teardown(() => {
        provider?.dispose();
        store.dispose();
        stateManager.dispose();
        configManager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('all mode with 24h window filters out old observations', async () => {
        const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
        const recentTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

        writeObservations(obsFilePath, [
            makeObservation({ session_id: 'sess-old', timestamp: oldTime }),
            makeObservation({ session_id: 'sess-recent', timestamp: recentTime }),
        ]);

        writeConfig(configPath, {
            version: '1',
            observation_window_hours: 24,
            sentinels: [],
        });

        store.addFolder('folder1', obsFilePath);
        configManager.addFolder('folder1', configPath, tmpDir);
        await store.load();
        await configManager.load();

        provider = new ObservationsProvider(store, stateManager, configManager);
        provider.setViewMode('all');

        const children = provider.getChildren();

        // Only the recent observation's session should appear
        const sessionIds = children
            .filter((c): c is import('../../ui/sidebar/observation-tree-item').SessionGroupTreeItem =>
                (c as { sessionId?: string }).sessionId !== undefined,
            )
            .map((c) => (c as { sessionId: string }).sessionId);

        assert.ok(!sessionIds.includes('sess-old'), 'old session should be filtered out');
        assert.ok(sessionIds.includes('sess-recent'), 'recent session should be included');
    });

    test('all mode with window 0 shows all observations', async () => {
        const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
        const recentTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        writeObservations(obsFilePath, [
            makeObservation({ session_id: 'sess-old', timestamp: oldTime }),
            makeObservation({ session_id: 'sess-recent', timestamp: recentTime }),
        ]);

        writeConfig(configPath, {
            version: '1',
            observation_window_hours: 0,
            sentinels: [],
        });

        store.addFolder('folder1', obsFilePath);
        configManager.addFolder('folder1', configPath, tmpDir);
        await store.load();
        await configManager.load();

        provider = new ObservationsProvider(store, stateManager, configManager);
        provider.setViewMode('all');

        const children = provider.getChildren();

        const sessionIds = children
            .filter((c): c is import('../../ui/sidebar/observation-tree-item').SessionGroupTreeItem =>
                (c as { sessionId?: string }).sessionId !== undefined,
            )
            .map((c) => (c as { sessionId: string }).sessionId);

        assert.ok(sessionIds.includes('sess-old'), 'old session should show when window is 0 (all time)');
        assert.ok(sessionIds.includes('sess-recent'), 'recent session should show');
    });

    test('observation count changes when switching between 24h and 72h windows', async () => {
        const time48hAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const time2hAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        writeObservations(obsFilePath, [
            // This is 48h old — in 72h window but not 24h
            makeObservation({ session_id: 'sess-48h', timestamp: time48hAgo }),
            // This is 2h old — in both windows
            makeObservation({ session_id: 'sess-2h', timestamp: time2hAgo }),
        ]);

        // Start with 24h window
        writeConfig(configPath, {
            version: '1',
            observation_window_hours: 24,
            sentinels: [],
        });

        store.addFolder('folder1', obsFilePath);
        configManager.addFolder('folder1', configPath, tmpDir);
        await store.load();
        await configManager.load();

        provider = new ObservationsProvider(store, stateManager, configManager);
        provider.setViewMode('all');

        const children24h = provider.getChildren();
        const sessions24h = children24h.filter(
            (c) => (c as { sessionId?: string }).sessionId !== undefined,
        );
        assert.strictEqual(sessions24h.length, 1, '24h window should show only 1 session');

        // Simulate switching to 72h window by updating config
        await configManager.setObservationWindowHours(72);

        const children72h = provider.getChildren();
        const sessions72h = children72h.filter(
            (c) => (c as { sessionId?: string }).sessionId !== undefined,
        );
        assert.strictEqual(sessions72h.length, 2, '72h window should show 2 sessions');
    });
});
