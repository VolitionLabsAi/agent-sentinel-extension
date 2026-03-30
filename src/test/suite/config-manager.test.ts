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
