import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../stores/state-manager';
import { SessionCorrelator } from '../../correlation/session-correlator';
import { HarnessAdapterRegistry } from '../../adapters/adapter-registry';
import { ClaudeCodeAdapter } from '../../adapters/claude-code-adapter';

/**
 * SessionCorrelator depends heavily on VS Code APIs (tabGroups, window).
 * The methods that can be tested in the VS Code test host are:
 * - cacheSessionTab / getCurrentSession
 * - correlateActiveSession returns null when no harness tab is active
 *
 * The tab-based correlation (getActiveHarnessTab) requires a real harness
 * extension webview tab to be open, which is not feasible in unit tests.
 * Title matching and transcript activity correlation require real file I/O
 * but also depend on getActiveHarnessTab returning a tab.
 *
 * We test what we can and note what needs integration testing.
 */

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-correlator-test-'));
}

suite('SessionCorrelator', () => {
    let tmpDir: string;
    let stateManager: StateManager;
    let adapterRegistry: HarnessAdapterRegistry;
    let correlator: SessionCorrelator;

    setup(() => {
        tmpDir = makeTempDir();
        stateManager = new StateManager();
        adapterRegistry = new HarnessAdapterRegistry();
        adapterRegistry.register(new ClaudeCodeAdapter());
        correlator = new SessionCorrelator(stateManager, adapterRegistry);
    });

    teardown(() => {
        correlator.dispose();
        stateManager.dispose();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('getCurrentSession returns null initially', () => {
        assert.strictEqual(correlator.getCurrentSession(), null);
    });

    test('cacheSessionTab stores mapping', () => {
        // This caches a tab label -> session ID mapping
        // We can't directly verify the cache, but we can verify it doesn't throw
        correlator.cacheSessionTab('sess-123', 'Claude: My Session');
    });

    test('correlateActiveSession returns null when no harness tab is active', async () => {
        // In the test host, there are no harness webview tabs open
        const result = await correlator.correlateActiveSession();
        assert.strictEqual(result, null);
    });

    test('correlateActiveSession returns null when no sessions registered', async () => {
        const result = await correlator.correlateActiveSession();
        assert.strictEqual(result, null);
    });

    test('dispose is safe', () => {
        correlator.dispose();
        // Double dispose should be safe too
        correlator.dispose();
    });

    // Note: The following scenarios require integration testing with real harness tabs:
    // - Signal 1: Tab cache lookup (requires active harness tab matching cached label)
    // - Signal 2: Transcript activity correlation (requires active harness tab + recent file writes)
    // - Signal 3: Title matching (requires active harness tab + transcript JSONL with title entries)
    // - onActiveSessionChanged event firing (requires tab change events with harness tabs)
});
