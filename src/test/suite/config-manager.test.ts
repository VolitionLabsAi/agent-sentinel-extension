import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../stores/config-manager';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-config-test-'));
}

suite('ConfigManager — observation_window_hours', () => {
    let tmpDir: string;
    let manager: ConfigManager;

    setup(() => {
        tmpDir = makeTempDir();
        manager = new ConfigManager();
    });

    teardown(() => {
        manager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('defaults to 24 hours when no config file exists', () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        manager.addFolder('folder1', configPath, tmpDir);
        // No file written — config will be undefined
        assert.strictEqual(manager.getObservationWindowMs(), 24 * 60 * 60 * 1000);
    });

    test('defaults to 24 hours when config has no observation_window_hours', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 24 * 60 * 60 * 1000);
    });

    test('respects observation_window_hours from config', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observation_window_hours: 6,
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 6 * 60 * 60 * 1000);
    });

    test('treats observation_window_hours 0 as all time (no filter)', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observation_window_hours: 0,
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 0);
    });

    test('clamps small positive observation_window_hours to minimum of 1', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observation_window_hours: 0.3,
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 1 * 60 * 60 * 1000);
    });

    test('updates observation window when config file changes', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observation_window_hours: 12,
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 12 * 60 * 60 * 1000);

        // Simulate config update
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observation_window_hours: 48,
            sentinels: [],
        }));
        await manager.load();
        assert.strictEqual(manager.getObservationWindowMs(), 48 * 60 * 60 * 1000);
    });
});

suite('ConfigManager — session_severity_mode', () => {
    let tmpDir: string;
    let manager: ConfigManager;

    setup(() => {
        tmpDir = makeTempDir();
        manager = new ConfigManager();
    });

    teardown(() => {
        manager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('defaults to "recent" when no config file exists', () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        manager.addFolder('folder1', configPath, tmpDir);
        assert.strictEqual(manager.getSessionSeverityMode(), 'recent');
    });

    test('defaults to "recent" when config has no session_severity_mode', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getSessionSeverityMode(), 'recent');
    });

    test('returns "highest" when config sets session_severity_mode to "highest"', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            session_severity_mode: 'highest',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getSessionSeverityMode(), 'highest');
    });

    test('returns "recent" when config explicitly sets session_severity_mode to "recent"', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            session_severity_mode: 'recent',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getSessionSeverityMode(), 'recent');
    });

    test('updates session_severity_mode when config file changes', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            session_severity_mode: 'recent',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getSessionSeverityMode(), 'recent');

        // Simulate config update
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            session_severity_mode: 'highest',
            sentinels: [],
        }));
        await manager.load();
        assert.strictEqual(manager.getSessionSeverityMode(), 'highest');
    });
});

suite('ConfigManager — observations_view_mode', () => {
    let tmpDir: string;
    let manager: ConfigManager;

    setup(() => {
        tmpDir = makeTempDir();
        manager = new ConfigManager();
    });

    teardown(() => {
        manager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('defaults to "grouped" when no config file exists', () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        manager.addFolder('folder1', configPath, tmpDir);
        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');
    });

    test('defaults to "grouped" when config has no observations_view_mode', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');
    });

    test('returns "flat" when config sets observations_view_mode to "flat"', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observations_view_mode: 'flat',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationsViewMode(), 'flat');
    });

    test('returns "grouped" when config explicitly sets observations_view_mode to "grouped"', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observations_view_mode: 'grouped',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');
    });

    test('setObservationsViewMode writes to disk and updates in-memory state', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();

        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');

        await manager.setObservationsViewMode('flat');
        assert.strictEqual(manager.getObservationsViewMode(), 'flat');

        // Verify the value was written to disk
        const written = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        assert.strictEqual(written['observations_view_mode'], 'flat');
    });

    test('setObservationsViewMode can toggle back to grouped', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observations_view_mode: 'flat',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();

        assert.strictEqual(manager.getObservationsViewMode(), 'flat');

        await manager.setObservationsViewMode('grouped');
        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');

        const written = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        assert.strictEqual(written['observations_view_mode'], 'grouped');
    });

    test('updates observations_view_mode when config file is reloaded', async () => {
        const configPath = path.join(tmpDir, 'sentinel.config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observations_view_mode: 'grouped',
            sentinels: [],
        }));
        manager.addFolder('folder1', configPath, tmpDir);
        await manager.load();
        assert.strictEqual(manager.getObservationsViewMode(), 'grouped');

        // Simulate external config update
        fs.writeFileSync(configPath, JSON.stringify({
            version: '1',
            observations_view_mode: 'flat',
            sentinels: [],
        }));
        await manager.load();
        assert.strictEqual(manager.getObservationsViewMode(), 'flat');
    });
});
