import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusBarManager, type HealthState } from '../../ui/status-bar';

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
    visibilityMode: string;
    info: {
        healthState: HealthState;
        sessionCount: number;
        lastObservationSeverity: string | undefined;
        sessionContext: string | undefined;
    };
    cycleVisibility(): void;
    applyEnabledSetting(): void;
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

    // ── Health state icon and color mapping ───────────────────

    test('not-initialized state shows shield icon', () => {
        manager.setHealthState('not-initialized');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(shield)'), `Expected shield icon, got: ${internal.item.text}`);
    });

    test('idle state shows shield icon with blue color', () => {
        manager.setHealthState('idle');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(shield)'), `Expected shield icon, got: ${internal.item.text}`);
        // Foreground should be charts.blue ThemeColor
        assert.ok(internal.item.color instanceof vscode.ThemeColor);
    });

    test('running state shows eye icon with green color', () => {
        manager.setHealthState('running');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(eye)'), `Expected eye icon, got: ${internal.item.text}`);
        assert.ok(internal.item.color instanceof vscode.ThemeColor);
    });

    test('degraded state shows warning icon with warning background', () => {
        manager.setHealthState('degraded');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.ok(internal.item.text.includes('$(warning)'), `Expected warning icon, got: ${internal.item.text}`);
        // Background should be warningBackground ThemeColor
        assert.ok(internal.item.backgroundColor instanceof vscode.ThemeColor);
    });

    test('error state shows error icon with error background', () => {
        manager.setHealthState('error');
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

    // ── Visibility cycling ───────────────────────────────────

    test('initial visibility mode is auto', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.visibilityMode, 'auto');
    });

    test('cycleVisibility cycles auto -> show -> hide -> auto', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.visibilityMode, 'auto');

        internal.cycleVisibility();
        assert.strictEqual(internal.visibilityMode, 'show');

        internal.cycleVisibility();
        assert.strictEqual(internal.visibilityMode, 'hide');

        internal.cycleVisibility();
        assert.strictEqual(internal.visibilityMode, 'auto');
    });

    test('hide mode hides the status bar item', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        // Cycle to hide (auto -> show -> hide)
        internal.cycleVisibility();
        internal.cycleVisibility();
        assert.strictEqual(internal.visibilityMode, 'hide');
        assert.strictEqual(internal.item._visible, false);
    });

    test('show mode shows the status bar item regardless of setting', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        // Disable via config (only when mock is available)
        const testApi = (vscode as any)._test;
        if (testApi?.configStore) {
            testApi.configStore['sentinel.statusBar.enabled'] = false;
        }

        // Cycle to show
        internal.cycleVisibility();
        assert.strictEqual(internal.visibilityMode, 'show');
        assert.strictEqual(internal.item._visible, true);
    });

    // ── sentinel.statusBar.enabled setting ───────────────────

    test('auto mode with enabled=true shows the item', () => {
        const testApi = (vscode as any)._test;
        if (testApi?.configStore) {
            testApi.configStore['sentinel.statusBar.enabled'] = true;
        }
        const internal = manager as unknown as StatusBarManagerTestable;
        internal.applyEnabledSetting();
        assert.strictEqual(internal.item._visible, true);
    });

    test('auto mode with enabled=false hides the item', () => {
        const testApi = (vscode as any)._test;
        if (testApi?.configStore) {
            testApi.configStore['sentinel.statusBar.enabled'] = false;
        } else {
            // In integration tests without mock, skip this assertion
            return;
        }
        const internal = manager as unknown as StatusBarManagerTestable;
        internal.applyEnabledSetting();
        assert.strictEqual(internal.item._visible, false);
    });

    test('auto mode defaults to visible when setting is unset', () => {
        // Default behavior: enabled defaults to true
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.visibilityMode, 'auto');
        internal.applyEnabledSetting();
        assert.strictEqual(internal.item._visible, true);
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

    test('setLastObservationSeverity updates info', () => {
        manager.setLastObservationSeverity('warning');
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.info.lastObservationSeverity, 'warning');
    });

    test('update() sets multiple fields at once', () => {
        manager.update({
            healthState: 'running',
            sessionCount: 5,
            sessionContext: 'batch-session',
        });
        const internal = manager as unknown as StatusBarManagerTestable;
        assert.strictEqual(internal.info.healthState, 'running');
        assert.strictEqual(internal.info.sessionCount, 5);
        assert.ok(internal.item.text.includes('batch-session'));
    });

    // ── Tooltip content ──────────────────────────────────────

    test('tooltip includes health label and session count', () => {
        manager.setHealthState('idle');
        manager.setSessionCount(2);
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('Idle'), 'Tooltip should include health label');
        assert.ok(tooltip.value.includes('2'), 'Tooltip should include session count');
    });

    test('tooltip includes observation severity when set', () => {
        manager.setLastObservationSeverity('critical');
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('critical'), 'Tooltip should include severity');
    });

    test('tooltip includes visibility mode', () => {
        const internal = manager as unknown as StatusBarManagerTestable;
        const tooltip = internal.item.tooltip as vscode.MarkdownString;
        assert.ok(tooltip.value.includes('auto'), 'Tooltip should include visibility mode');
    });

    // ── Dispose ──────────────────────────────────────────────

    test('dispose does not throw', () => {
        // Should complete without error
        manager.dispose();
        // Create a new one for teardown
        manager = new StatusBarManager(createMockContext());
    });
});
