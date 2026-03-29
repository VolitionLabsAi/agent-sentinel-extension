import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SentinelCLI } from '../../cli/sentinel-cli';

/**
 * Tests for the SentinelCLI exec interface.
 *
 * The autoStart logic has been removed from the extension (it is now
 * handled by the trigger-side Go code reading sentinel.config.json).
 * These tests verify that the CLI execution interface works correctly.
 */

suite('SentinelCLI Execution', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-cli-test-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
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
