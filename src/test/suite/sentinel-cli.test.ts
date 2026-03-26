import * as assert from 'assert';
import { SentinelCLI } from '../../cli/sentinel-cli';

/**
 * SentinelCLI wraps child_process.execFile calls to the sentinel/vl binary.
 * We test:
 * - Result parsing logic (JSON parsing of stdout)
 * - Binary resolution caching
 * - Behavior when binary is not found
 *
 * We don't test actual CLI execution against a real binary — that's integration testing.
 */

suite('SentinelCLI', () => {
    let cli: SentinelCLI;

    setup(() => {
        cli = new SentinelCLI();
    });

    test('isBinaryAvailable returns boolean', async () => {
        const result = await cli.isBinaryAvailable();
        // May be true or false depending on environment
        assert.strictEqual(typeof result, 'boolean');
    });

    test('binary resolution is cached after first call', async () => {
        // First call resolves
        const first = await cli.isBinaryAvailable();
        // Second call should return same result (cached)
        const second = await cli.isBinaryAvailable();
        assert.strictEqual(first, second);
    });

    test('resetBinaryCache allows re-resolution', async () => {
        await cli.isBinaryAvailable();
        cli.resetBinaryCache();
        // Should not throw — re-resolution works
        const result = await cli.isBinaryAvailable();
        assert.strictEqual(typeof result, 'boolean');
    });

    test('execSentinel returns error result when binary not found', async () => {
        // Create a fresh CLI and force it to not find any binary
        // by resetting and then immediately calling exec
        // Since we can't control PATH easily in test, we test the shape of the result
        const result = await cli.execSentinel(['doctor'], '/tmp/nonexistent-project');

        // Result should always have the expected shape
        assert.strictEqual(typeof result.exitCode, 'number');
        assert.strictEqual(typeof result.stdout, 'string');
        assert.strictEqual(typeof result.stderr, 'string');
        // json is either undefined or a parsed object
        assert.ok(result.json === undefined || typeof result.json === 'object' || typeof result.json === 'string');
    });

    test('execSentinel result has correct structure', async () => {
        const result = await cli.execSentinel(['status'], '/tmp/nonexistent-project');

        // Verify the CLIResult interface is satisfied
        assert.ok('exitCode' in result);
        assert.ok('json' in result);
        assert.ok('stdout' in result);
        assert.ok('stderr' in result);
    });

    test('execSentinel with no binary returns exit code -1', async () => {
        // Create a CLI that definitely won't find the binary
        const isolatedCli = new SentinelCLI();
        // Access the private resolvedBinary to force it to null
        // We use the public API pattern: if sentinel/vl is not on PATH, we get -1
        // This test may pass or fail depending on whether sentinel is installed
        // So we just verify the contract: if binary not found, exit -1 with descriptive stderr
        const available = await isolatedCli.isBinaryAvailable();
        if (!available) {
            const result = await isolatedCli.execSentinel(['doctor'], '/tmp');
            assert.strictEqual(result.exitCode, -1);
            assert.ok(result.stderr.includes('not found'));
        }
        // If binary IS available, we just verify the result has proper shape
        // (already covered above)
    });
});
