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
    info: {
        healthState: HealthState;
        sessionCount: number;
        lastObservationSeverity: string | undefined;
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
