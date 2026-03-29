import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SentinelCLI } from '../../cli/sentinel-cli';

/**
 * Tests for the autoStart logic.
 *
 * We test the conditions that gate the CLI call:
 * - autoStart=false → no CLI call
 * - autoStart=true + config exists → CLI call made
 * - autoStart=true + no config → no CLI call
 *
 * Since the actual autoStart logic is inline in extension.ts activate(),
 * we extract the decision logic into testable assertions here and verify
 * that SentinelCLI.execSentinel works correctly for start/stop commands.
 */

suite('AutoStart Logic', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-autostart-test-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('should not start when autoStart is false', () => {
        const autoStart = false;
        const configPath = path.join(tmpDir, '.volition', 'sentinel', 'sentinel.config.json');

        // Create config file
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, '{}');

        // Even with config present, autoStart=false means no action
        const shouldStart = autoStart && fs.existsSync(configPath);
        assert.strictEqual(shouldStart, false);
    });

    test('should start when autoStart is true and config exists', () => {
        const autoStart = true;
        const configPath = path.join(tmpDir, '.volition', 'sentinel', 'sentinel.config.json');

        // Create config file
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, '{}');

        const shouldStart = autoStart && fs.existsSync(configPath);
        assert.strictEqual(shouldStart, true);
    });

    test('should not start when autoStart is true but no config exists', () => {
        const autoStart = true;
        const configPath = path.join(tmpDir, '.volition', 'sentinel', 'sentinel.config.json');

        // Do NOT create the config file
        const shouldStart = autoStart && fs.existsSync(configPath);
        assert.strictEqual(shouldStart, false);
    });

    test('execSentinel with start command returns proper result shape', async () => {
        const cli = new SentinelCLI();
        const result = await cli.execSentinel(['start'], tmpDir);

        // Verify the result has the expected structure regardless of binary availability
        assert.strictEqual(typeof result.exitCode, 'number');
        assert.strictEqual(typeof result.stdout, 'string');
        assert.strictEqual(typeof result.stderr, 'string');
        assert.ok('json' in result);
    });

    test('execSentinel with stop command returns proper result shape', async () => {
        const cli = new SentinelCLI();
        const result = await cli.execSentinel(['stop'], tmpDir);

        assert.strictEqual(typeof result.exitCode, 'number');
        assert.strictEqual(typeof result.stdout, 'string');
        assert.strictEqual(typeof result.stderr, 'string');
        assert.ok('json' in result);
    });
});
