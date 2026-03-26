import * as assert from 'assert';
import { HealthAssessor } from '../../health/health-assessor';
import { SentinelCLI, type CLIResult } from '../../cli/sentinel-cli';
import { StatusBarManager, type HealthState } from '../../ui/status-bar';

/**
 * Mock SentinelCLI that returns configurable results without spawning processes.
 */
class MockSentinelCLI {
    private _binaryAvailable = true;
    private _result: CLIResult = { exitCode: 0, json: undefined, stdout: '', stderr: '' };

    setBinaryAvailable(available: boolean): void {
        this._binaryAvailable = available;
    }

    setResult(result: CLIResult): void {
        this._result = result;
    }

    async isBinaryAvailable(): Promise<boolean> {
        return this._binaryAvailable;
    }

    async execSentinel(_args: string[], _projectDir: string): Promise<CLIResult> {
        return this._result;
    }

    resetBinaryCache(): void {
        // no-op for mock
    }
}

/**
 * Mock StatusBarManager that records the last health state set.
 */
class MockStatusBarManager {
    lastHealthState: HealthState | undefined;

    setHealthState(state: HealthState): void {
        this.lastHealthState = state;
    }

    dispose(): void {
        // no-op
    }
}

suite('HealthAssessor', () => {
    let mockCLI: MockSentinelCLI;
    let mockStatusBar: MockStatusBarManager;
    let assessor: HealthAssessor;

    setup(() => {
        mockCLI = new MockSentinelCLI();
        mockStatusBar = new MockStatusBarManager();
        // HealthAssessor constructor expects SentinelCLI and StatusBarManager.
        // Our mocks satisfy the duck-typed interface via structural typing.
        assessor = new HealthAssessor(
            mockCLI as unknown as SentinelCLI,
            mockStatusBar as unknown as StatusBarManager,
        );
    });

    teardown(() => {
        assessor.dispose();
    });

    // ── Exit code mapping ────────────────────────────────────

    test('exit code 0 maps to idle (running/healthy)', async () => {
        mockCLI.setResult({ exitCode: 0, json: undefined, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'idle');
        assert.strictEqual(mockStatusBar.lastHealthState, 'idle');
    });

    test('exit code 1 maps to degraded', async () => {
        mockCLI.setResult({ exitCode: 1, json: undefined, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'degraded');
        assert.strictEqual(mockStatusBar.lastHealthState, 'degraded');
    });

    test('exit code 2 maps to error', async () => {
        mockCLI.setResult({ exitCode: 2, json: undefined, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'error');
        assert.strictEqual(mockStatusBar.lastHealthState, 'error');
    });

    test('unknown exit code maps to error', async () => {
        mockCLI.setResult({ exitCode: 99, json: undefined, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'error');
    });

    // ── JSON status field overrides exit code ────────────────

    test('JSON status "ok" maps to idle regardless of exit code', async () => {
        mockCLI.setResult({ exitCode: 2, json: { status: 'ok' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'idle');
    });

    test('JSON status "healthy" maps to idle', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'healthy' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'idle');
    });

    test('JSON status "running" maps to running', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'running' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'running');
    });

    test('JSON status "degraded" maps to degraded', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'degraded' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'degraded');
    });

    test('JSON status "warning" maps to degraded', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'warning' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'degraded');
    });

    test('JSON status "error" maps to error', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'error' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'error');
    });

    test('JSON status "not-initialized" maps to not-initialized', async () => {
        mockCLI.setResult({ exitCode: 0, json: { status: 'not-initialized' }, stdout: '', stderr: '' });
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'not-initialized');
    });

    // ── Missing binary ───────────────────────────────────────

    test('missing binary returns not-initialized', async () => {
        mockCLI.setBinaryAvailable(false);
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'not-initialized');
        assert.strictEqual(mockStatusBar.lastHealthState, 'not-initialized');
    });

    // ── CLI error handling ───────────────────────────────────

    test('CLI exception results in error state', async () => {
        // Replace execSentinel to throw
        mockCLI.execSentinel = async () => { throw new Error('binary crashed'); };
        mockCLI.setBinaryAvailable(true);
        const state = await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(state, 'error');
    });

    // ── Health changed event ─────────────────────────────────

    test('fires onHealthChanged when state changes', async () => {
        const events: Array<{ state: HealthState; message?: string }> = [];
        assessor.onHealthChanged((e) => events.push(e));

        mockCLI.setResult({ exitCode: 0, json: undefined, stdout: '', stderr: '' });
        await assessor.runCheck('/tmp/test-project');

        // Initial state is not-initialized, moving to idle should fire
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].state, 'idle');
    });

    test('does not fire onHealthChanged when state is unchanged', async () => {
        const events: Array<{ state: HealthState }> = [];
        assessor.onHealthChanged((e) => events.push(e));

        mockCLI.setResult({ exitCode: 0, json: undefined, stdout: '', stderr: '' });
        await assessor.runCheck('/tmp/test-project');
        await assessor.runCheck('/tmp/test-project'); // same state

        assert.strictEqual(events.length, 1); // only first transition fires
    });

    // ── getState ─────────────────────────────────────────────

    test('getState returns current state', async () => {
        assert.strictEqual(assessor.getState(), 'not-initialized');
        mockCLI.setResult({ exitCode: 0, json: undefined, stdout: '', stderr: '' });
        await assessor.runCheck('/tmp/test-project');
        assert.strictEqual(assessor.getState(), 'idle');
    });

    // ── Periodic check ───────────────────────────────────────

    test('startPeriodicCheck sets up interval', () => {
        // Just verify it doesn't throw and can be stopped
        assessor.startPeriodicCheck();
        assessor.stopPeriodicCheck();
    });

    test('stopPeriodicCheck is safe to call when no interval is active', () => {
        // Should not throw
        assessor.stopPeriodicCheck();
    });

    // ── Message extraction ───────────────────────────────────

    test('extracts message from JSON response', async () => {
        const events: Array<{ state: HealthState; message?: string }> = [];
        assessor.onHealthChanged((e) => events.push(e));

        mockCLI.setResult({
            exitCode: 1,
            json: { status: 'degraded', message: 'Config file missing' },
            stdout: '',
            stderr: '',
        });
        await assessor.runCheck('/tmp/test-project');

        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].message, 'Config file missing');
    });

    test('extracts message from failing checks', async () => {
        const events: Array<{ state: HealthState; message?: string }> = [];
        assessor.onHealthChanged((e) => events.push(e));

        mockCLI.setResult({
            exitCode: 1,
            json: {
                status: 'degraded',
                checks: [
                    { name: 'config', status: 'fail', message: 'not found' },
                    { name: 'binary', status: 'ok' },
                ],
            },
            stdout: '',
            stderr: '',
        });
        await assessor.runCheck('/tmp/test-project');

        assert.strictEqual(events.length, 1);
        assert.ok(events[0].message?.includes('config'));
    });
});
