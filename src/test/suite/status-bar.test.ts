import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusBarManager, type HealthState, type ObservationSeverityLevel } from '../../ui/status-bar';

// Access the test helpers from our vscode mock
const vscodeMock = vscode as unknown as {
    _test: {
        configStore: Record<string, unknown>;
        MockStatusBarItem: new (alignment: number, priority: number) => {
            text: string;
            tooltip: unknown;
            color: unknown;
            backgroundColor: unknown;
            command: string | undefined;
            _visible: boolean;
            show(): void;
            hide(): void;
            dispose(): void;
        };
    };
};

/**
 * Minimal mock ExtensionContext — StatusBarManager only uses it for alignment.
 */
function createMockContext(): vscode.ExtensionContext {
    return {} as vscode.ExtensionContext;
}

/**
 * Access internal state for assertions.
 */
interface StatusBarManagerTestable {
    item: {
        text: string;
        tooltip: unknown;
        color: unknown;
        backgroundColor: unknown;
        command: string | undefined;
        _visible: boolean;
    };
    info: {
        initialized: boolean;
        highestSeverity: ObservationSeverityLevel;
        sessionCount: number;
        severityCounts: { info: number; warning: number; critical: number };
        sessionContext: string | undefined;
    };
}

suite('StatusBarManager', () => {
    let manager: StatusBarManager;

    setup(function () {
        // These tests require the vscode mock — StatusBarManager registers
        // commands that conflict with the already-activated extension in the
        // real VS Code host. Skip the entire suite in integration mode.
        if (!(vscode as any)._test) {
            this.skip();
            return;
        }

        // Reset config store when running with mock (unit tests).
        const testApi = (vscode as any)._test;
        if (testApi?.configStore) {
            const store = testApi.configStore;
            for (const key of Object.keys(store)) {
                delete store[key];
            }
        }
        manager = new StatusBarManager(createMockContext());
    });

    teardown(() => {
        manager?.dispose();
    });

    // ── Not-initialized state ────────────────────────────────

    test('not-initialized state shows shield icon with disabled color', () => {
        manager.setHealthState('not-initialized');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(shield)'), `Expected shield icon, got: ${internal.item.text}`);
        assert.ok(internal.item.color instanceof vscode.ThemeColor);
    });

    test('setHealthState idle marks as initialized with eye icon', () => {
        manager.setHealthState('idle');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.info.initialized, 'Should be initialized');
        assert.ok(internal.item.text.includes('$(eye)'), `Expected eye icon, got: ${internal.item.text}`);
    });

    test('setHealthState running marks as initialized', () => {
        manager.setHealthState('running');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.info.initialized, 'Should be initialized');
        assert.ok(internal.item.text.includes('$(eye)'), `Expected eye icon, got: ${internal.item.text}`);
    });

    // ── Severity-driven icons and colors ─────────────────────

    test('severity none shows eye icon with green color', () => {
        manager.setInitialized(true);
        manager.setHighestSeverity('none');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(eye)'), `Expected eye icon, got: ${internal.item.text}`);
        assert.ok(internal.item.color instanceof vscode.ThemeColor);
    });

    test('severity info shows eye icon with green color', () => {
        manager.setInitialized(true);
        manager.setHighestSeverity('info');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(eye)'), `Expected eye icon, got: ${internal.item.text}`);
        assert.ok(internal.item.color instanceof vscode.ThemeColor);
    });

    test('severity warning shows warning icon with warning background', () => {
        manager.setInitialized(true);
        manager.setHighestSeverity('warning');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(warning)'), `Expected warning icon, got: ${internal.item.text}`);
        assert.ok(internal.item.backgroundColor instanceof vscode.ThemeColor);
    });

    test('severity critical shows error icon with error background', () => {
        manager.setInitialized(true);
        manager.setHighestSeverity('critical');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(error)'), `Expected error icon, got: ${internal.item.text}`);
        assert.ok(internal.item.backgroundColor instanceof vscode.ThemeColor);
    });

    // ── All health states produce valid renders ──────────────

    test('every HealthState renders without errors', () => {
        const states: HealthState[] = ['not-initialized', 'idle', 'running', 'degraded', 'error'];
        for (const state of states) {
            // Should not throw
            manager.setHealthState(state);
            const internal = manager as unknown as StatusBarManagerTestable;
            assert.ok(internal.item.text.includes('Sentinel'), `State ${state} missing Sentinel text`);
        }
    });

    // ── Session context and update ───────────────────────────

    test('setSessionContext includes context in text', () => {
        manager.setSessionContext('my-session');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('my-session'), `Expected session context, got: ${internal.item.text}`);
    });

    test('setSessionCount updates info', () => {
        manager.setSessionCount(3);
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.info.sessionCount, 3);
    });

    test('setSeverityCounts updates info', () => {
        manager.setSeverityCounts({ info: 5, warning: 2, critical: 1 });
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.deepStrictEqual(internal.info.severityCounts, { info: 5, warning: 2, critical: 1 });
    });

    test('update() sets multiple fields at once', () => {
        manager.update({
            initialized: true,
            highestSeverity: 'warning',
            sessionCount: 5,
            sessionContext: 'batch-session',
        });
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.info.initialized, true);
        assert.strictEqual(internal.info.highestSeverity, 'warning');
        assert.strictEqual(internal.info.sessionCount, 5);
        assert.ok(internal.item.text.includes('batch-session'));
    });

    // ── Tooltip content ──────────────────────────────────────

    test('tooltip includes severity info and session count when initialized', () => {
        manager.setInitialized(true);
        manager.setSessionCount(2);
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('No observations'), 'Tooltip should include severity label');
        assert.ok(tooltip.value.includes('2'), 'Tooltip should include session count');
    });

    test('tooltip includes not-initialized status when not initialized', () => {
        manager.setHealthState('not-initialized');
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('Not Initialized'), 'Tooltip should include not initialized status');
    });

    test('tooltip includes severity counts when set', () => {
        manager.setInitialized(true);
        manager.setSeverityCounts({ info: 3, warning: 1, critical: 0 });
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('1 warning'), 'Tooltip should include warning count');
        assert.ok(tooltip.value.includes('3 info'), 'Tooltip should include info count');
    });

    test('tooltip includes click hint for view mode', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('click to change view mode'), 'Tooltip should include view mode hint');
    });

    // ── Dispose ──────────────────────────────────────────────

    test('dispose does not throw', () => {
        // Should complete without error
        manager.dispose();
        // Create a new one for teardown
        manager = new StatusBarManager(createMockContext());
    });
});
