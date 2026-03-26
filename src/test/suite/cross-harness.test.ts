import * as assert from 'assert';
import { HarnessAdapterRegistry } from '../../adapters/adapter-registry';
import { ClaudeCodeAdapter } from '../../adapters/claude-code-adapter';
import { GeminiCLIAdapter } from '../../adapters/gemini-cli-adapter';
import { CopilotAdapter } from '../../adapters/copilot-adapter';
import { CodexCLIAdapter } from '../../adapters/codex-cli-adapter';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from '../../adapters/types';
import type * as vscode from 'vscode';

// ─── Mock Adapter for Controlled Testing ─────────────────────────────

/**
 * A controllable mock adapter for testing registry behavior
 * with deterministic availability and tab detection.
 */
class MockHarnessAdapter implements HarnessAdapter {
    readonly extensionId: string;
    readonly capabilities: HarnessCapabilities;
    private available: boolean;
    private readonly tabViewType: string | undefined;
    openSessionCalled = false;
    lastSessionId: string | undefined;

    constructor(
        readonly name: string,
        opts: {
            available?: boolean;
            extensionId?: string;
            capabilities?: Partial<HarnessCapabilities>;
            tabViewType?: string;
        } = {},
    ) {
        this.available = opts.available ?? false;
        this.extensionId = opts.extensionId ?? `mock.${name.toLowerCase().replace(/\s+/g, '-')}`;
        this.tabViewType = opts.tabViewType;
        this.capabilities = {
            canOpenSessions: opts.capabilities?.canOpenSessions ?? true,
            canDetectTabs: opts.capabilities?.canDetectTabs ?? (!!opts.tabViewType),
            hasPreToolUseHook: opts.capabilities?.hasPreToolUseHook ?? false,
            hasStopHook: opts.capabilities?.hasStopHook ?? false,
            canInjectMessages: opts.capabilities?.canInjectMessages ?? false,
        };
    }

    get isAvailable(): boolean {
        return this.available;
    }

    get isInstalled(): boolean {
        return this.available;
    }

    setAvailable(val: boolean): void {
        this.available = val;
    }

    async openSession(sessionId: string): Promise<void> {
        if (!this.capabilities.canOpenSessions) {
            throw new Error(`${this.name} does not support opening sessions.`);
        }
        this.openSessionCalled = true;
        this.lastSessionId = sessionId;
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        return [];
    }

    isHarnessTab(tab: vscode.Tab): boolean {
        if (!this.tabViewType) { return false; }
        const input = tab.input;
        if (input && typeof input === 'object' && 'viewType' in input) {
            return (input as { viewType: string }).viewType.includes(this.tabViewType);
        }
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        return undefined;
    }
}

// ─── Per-Adapter Capability Verification ─────────────────────────────

suite('Cross-Harness: Claude Code Adapter capabilities', () => {
    let adapter: ClaudeCodeAdapter;

    setup(() => {
        adapter = new ClaudeCodeAdapter();
    });

    test('declares canOpenSessions', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, true);
    });

    test('declares canDetectTabs', () => {
        assert.strictEqual(adapter.capabilities.canDetectTabs, true);
    });

    test('declares hasPreToolUseHook', () => {
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab correctly identifies Claude Code tabs', () => {
        const claudeTab = {
            label: 'Claude',
            input: { viewType: 'claudeVSCodePanel.tab' },
        } as unknown as vscode.Tab;
        const otherTab = {
            label: 'Other',
            input: { viewType: 'markdown.preview' },
        } as unknown as vscode.Tab;

        assert.strictEqual(adapter.isHarnessTab(claudeTab), true);
        assert.strictEqual(adapter.isHarnessTab(otherTab), false);
    });

    test('detectActiveSessions returns array', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.ok(Array.isArray(sessions));
    });
});

suite('Cross-Harness: Gemini CLI Adapter capabilities', () => {
    let adapter: GeminiCLIAdapter;

    setup(() => {
        adapter = new GeminiCLIAdapter();
    });

    test('declares canOpenSessions false (CLI-only)', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
    });

    test('declares canDetectTabs false (runs in terminal)', () => {
        assert.strictEqual(adapter.capabilities.canDetectTabs, false);
    });

    test('declares hasPreToolUseHook (BeforeTool)', () => {
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab always false for CLI-based harness', () => {
        const anyTab = {
            label: 'Gemini',
            input: { viewType: 'gemini.anything' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(anyTab), false);
    });

    test('openSession throws with terminal instructions', async () => {
        await assert.rejects(
            () => adapter.openSession('test-id'),
            /gemini --resume/,
        );
    });

    test('detectActiveSessions returns empty when harness not installed', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

suite('Cross-Harness: GitHub Copilot Adapter capabilities', () => {
    let adapter: CopilotAdapter;

    setup(() => {
        adapter = new CopilotAdapter();
    });

    test('declares canOpenSessions false (no session-by-ID API)', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
    });

    test('declares canDetectTabs true (VS Code chat panel)', () => {
        assert.strictEqual(adapter.capabilities.canDetectTabs, true);
    });

    test('declares hasPreToolUseHook (VS Code agent hooks)', () => {
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab returns true for chat panel viewType', () => {
        const chatTab = {
            label: 'Copilot Chat',
            input: { viewType: 'workbench.panel.chat.view' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(chatTab), true);
    });

    test('isHarnessTab returns false for unrelated viewType', () => {
        const otherTab = {
            label: 'Editor',
            input: { viewType: 'editor.text' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(otherTab), false);
    });

    test('openSession throws with chat view instructions', async () => {
        await assert.rejects(
            () => adapter.openSession('test-id'),
            /Chat view sidebar/,
        );
    });

    test('detectActiveSessions returns empty when harness not installed', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

suite('Cross-Harness: Codex CLI Adapter capabilities', () => {
    let adapter: CodexCLIAdapter;

    setup(() => {
        adapter = new CodexCLIAdapter();
    });

    test('declares canOpenSessions false', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
    });

    test('declares canDetectTabs false', () => {
        assert.strictEqual(adapter.capabilities.canDetectTabs, false);
    });

    test('declares hasPreToolUseHook FALSE (key limitation)', () => {
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, false);
    });

    test('declares hasStopHook true (experimental)', () => {
        assert.strictEqual(adapter.capabilities.hasStopHook, true);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab always false (no documented viewType)', () => {
        const anyTab = {
            label: 'Codex',
            input: { viewType: 'codex.panel' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(anyTab), false);
    });

    test('openSession throws with terminal instructions', async () => {
        await assert.rejects(
            () => adapter.openSession('test-id'),
            /codex resume/,
        );
    });

    test('detectActiveSessions returns empty when harness not installed', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

// ─── Registry Cross-Adapter Behavior ─────────────────────────────────

suite('Cross-Harness: Registry adapter lookup by name', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
        registry.register(new ClaudeCodeAdapter());
        registry.register(new GeminiCLIAdapter());
        registry.register(new CopilotAdapter());
        registry.register(new CodexCLIAdapter());
    });

    test('returns correct adapter for each harness name', () => {
        const names = ['Claude Code', 'Gemini CLI', 'GitHub Copilot', 'Codex CLI'];
        for (const name of names) {
            const adapter = registry.getByName(name);
            assert.ok(adapter, `Adapter '${name}' should be registered`);
            assert.strictEqual(adapter.name, name);
        }
    });

    test('returns undefined for unknown harness name', () => {
        assert.strictEqual(registry.getByName('Unknown Harness'), undefined);
    });
});

suite('Cross-Harness: Registry isHarnessTab delegation', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
        registry.register(new MockHarnessAdapter('Alpha', {
            available: true,
            tabViewType: 'alpha.panel',
        }));
        registry.register(new MockHarnessAdapter('Beta', {
            available: true,
            tabViewType: 'beta.panel',
        }));
    });

    test('delegates to Alpha for alpha viewType', () => {
        const tab = {
            label: 'Alpha',
            input: { viewType: 'alpha.panel.123' },
        } as unknown as vscode.Tab;
        assert.strictEqual(registry.isHarnessTab(tab), true);
    });

    test('delegates to Beta for beta viewType', () => {
        const tab = {
            label: 'Beta',
            input: { viewType: 'beta.panel.456' },
        } as unknown as vscode.Tab;
        assert.strictEqual(registry.isHarnessTab(tab), true);
    });

    test('returns false for tab claimed by no adapter', () => {
        const tab = {
            label: 'Other',
            input: { viewType: 'gamma.panel' },
        } as unknown as vscode.Tab;
        assert.strictEqual(registry.isHarnessTab(tab), false);
    });

    test('getAdapterForTab returns correct adapter', () => {
        const tab = {
            label: 'Alpha',
            input: { viewType: 'alpha.panel.session' },
        } as unknown as vscode.Tab;
        const adapter = registry.getAdapterForTab(tab);
        assert.strictEqual(adapter?.name, 'Alpha');
    });
});

suite('Cross-Harness: Multiple adapters registered simultaneously', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
    });

    test('all four real adapters coexist', () => {
        registry.register(new ClaudeCodeAdapter());
        registry.register(new GeminiCLIAdapter());
        registry.register(new CopilotAdapter());
        registry.register(new CodexCLIAdapter());

        assert.strictEqual(registry.getAll().length, 4);
    });

    test('re-registering same name replaces adapter', () => {
        const first = new MockHarnessAdapter('Test', { available: true });
        const second = new MockHarnessAdapter('Test', { available: false });

        registry.register(first);
        registry.register(second);

        assert.strictEqual(registry.getAll().length, 1);
        assert.strictEqual(registry.getByName('Test'), second);
    });

    test('adapters with different names do not interfere', () => {
        const a = new MockHarnessAdapter('Alpha', { available: true });
        const b = new MockHarnessAdapter('Beta', { available: true });

        registry.register(a);
        registry.register(b);

        assert.strictEqual(registry.getByName('Alpha'), a);
        assert.strictEqual(registry.getByName('Beta'), b);
    });
});

suite('Cross-Harness: Auto-detection with multiple available adapters', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
    });

    test('getAvailable returns first available when multiple exist', () => {
        const unavailable = new MockHarnessAdapter('First', { available: false });
        const available1 = new MockHarnessAdapter('Second', { available: true });
        const available2 = new MockHarnessAdapter('Third', { available: true });

        registry.register(unavailable);
        registry.register(available1);
        registry.register(available2);

        const result = registry.getAvailable();
        assert.strictEqual(result?.name, 'Second');
    });

    test('getAvailable returns undefined when none available', () => {
        registry.register(new MockHarnessAdapter('A', { available: false }));
        registry.register(new MockHarnessAdapter('B', { available: false }));

        assert.strictEqual(registry.getAvailable(), undefined);
    });

    test('getAvailable skips unavailable to find available', () => {
        registry.register(new MockHarnessAdapter('Unavail1', { available: false }));
        registry.register(new MockHarnessAdapter('Unavail2', { available: false }));
        registry.register(new MockHarnessAdapter('Avail', { available: true }));

        assert.strictEqual(registry.getAvailable()?.name, 'Avail');
    });

    test('availability can change dynamically', () => {
        const adapter = new MockHarnessAdapter('Dynamic', { available: false });
        registry.register(adapter);

        assert.strictEqual(registry.getAvailable(), undefined);

        adapter.setAvailable(true);
        assert.strictEqual(registry.getAvailable()?.name, 'Dynamic');
    });
});

suite('Cross-Harness: openSession graceful handling', () => {
    test('adapter without canOpenSessions throws on openSession', async () => {
        const adapter = new MockHarnessAdapter('NoOpen', {
            available: true,
            capabilities: { canOpenSessions: false },
        });

        await assert.rejects(
            () => adapter.openSession('test-id'),
            /does not support opening sessions/,
        );
    });

    test('adapter with canOpenSessions succeeds', async () => {
        const adapter = new MockHarnessAdapter('CanOpen', {
            available: true,
            capabilities: { canOpenSessions: true },
        });

        await adapter.openSession('session-123');
        assert.strictEqual(adapter.openSessionCalled, true);
        assert.strictEqual(adapter.lastSessionId, 'session-123');
    });
});
