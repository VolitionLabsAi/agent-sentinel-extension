import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../stores/state-manager';
import { SessionCorrelator } from '../../correlation/session-correlator';

/**
 * SessionCorrelator depends heavily on VS Code APIs (tabGroups, window).
 * The methods that can be tested in the VS Code test host are:
 * - cacheSessionTab / getCurrentSession
 * - correlateActiveSession returns null when no Claude tab is active
 *
 * The tab-based correlation (getActiveClaudeTab) requires a real Claude Code
 * extension webview tab to be open, which is not feasible in unit tests.
 * Title matching and transcript activity correlation require real file I/O
 * but also depend on getActiveClaudeTab returning a tab.
 *
 * We test what we can and note what needs integration testing.
 */

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-correlator-test-'));
}

function writeStateFile(filePath: string, sessions: Array<{ session_id: string; transcript_path: string }>): void {
    fs.writeFileSync(filePath, JSON.stringify({ sessions }), 'utf-8');
}

suite('SessionCorrelator', () => {
    let tmpDir: string;
    let stateManager: StateManager;
    let correlator: SessionCorrelator;

    setup(() => {
        tmpDir = makeTempDir();
        stateManager = new StateManager();
        correlator = new SessionCorrelator(stateManager);
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

    test('correlateActiveSession returns null when no Claude tab is active', async () => {
        // In the test host, there are no Claude Code webview tabs open
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

    // Note: The following scenarios require integration testing with real Claude Code tabs:
    // - Signal 1: Tab cache lookup (requires active Claude tab matching cached label)
    // - Signal 2: Transcript activity correlation (requires active Claude tab + recent file writes)
    // - Signal 3: Title matching (requires active Claude tab + transcript JSONL with title entries)
    // - onActiveSessionChanged event firing (requires tab change events with Claude tabs)
});
