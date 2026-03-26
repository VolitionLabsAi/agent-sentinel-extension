import * as assert from 'assert';
import { HarnessAdapterRegistry } from '../../adapters/adapter-registry';
import { ClaudeCodeAdapter } from '../../adapters/claude-code-adapter';
import { HarnessAdapter, HarnessCapabilities, SessionInfo } from '../../adapters/types';
import type * as vscode from 'vscode';

/**
 * Minimal mock adapter for testing registry behavior independently
 * of any real VS Code extension.
 */
class MockAdapter implements HarnessAdapter {
    readonly extensionId: string;
    readonly capabilities: HarnessCapabilities = {
        canOpenSessions: true,
        canDetectTabs: true,
        hasPreToolUseHook: false,
        hasStopHook: false,
        canInjectMessages: false,
    };

    constructor(
        readonly name: string,
        private available: boolean,
        extensionId?: string,
    ) {
        this.extensionId = extensionId ?? `mock.${name.toLowerCase().replace(/\s+/g, '-')}`;
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

    async openSession(_sessionId: string): Promise<void> {
        // no-op for testing
    }

    async detectActiveSessions(): Promise<SessionInfo[]> {
        return [];
    }

    isHarnessTab(_tab: vscode.Tab): boolean {
        return false;
    }

    getSessionIdFromTab(_tab: vscode.Tab): string | undefined {
        return undefined;
    }
}

suite('HarnessAdapterRegistry', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
    });

    test('getAvailable returns undefined when empty', () => {
        assert.strictEqual(registry.getAvailable(), undefined);
    });

    test('register and getByName', () => {
        const adapter = new MockAdapter('Test Harness', true);
        registry.register(adapter);
        assert.strictEqual(registry.getByName('Test Harness'), adapter);
    });

    test('getByName returns undefined for unregistered name', () => {
        assert.strictEqual(registry.getByName('Nonexistent'), undefined);
    });

    test('getAvailable returns first available adapter', () => {
        const unavailable = new MockAdapter('Unavailable', false);
        const available = new MockAdapter('Available', true);
        registry.register(unavailable);
        registry.register(available);
        assert.strictEqual(registry.getAvailable(), available);
    });

    test('getAvailable returns undefined when none available', () => {
        registry.register(new MockAdapter('A', false));
        registry.register(new MockAdapter('B', false));
        assert.strictEqual(registry.getAvailable(), undefined);
    });

    test('getAll returns all registered adapters', () => {
        const a = new MockAdapter('A', true);
        const b = new MockAdapter('B', false);
        registry.register(a);
        registry.register(b);
        const all = registry.getAll();
        assert.strictEqual(all.length, 2);
        assert.ok(all.includes(a));
        assert.ok(all.includes(b));
    });

    test('register replaces adapter with same name', () => {
        const first = new MockAdapter('Same', true);
        const second = new MockAdapter('Same', false);
        registry.register(first);
        registry.register(second);
        assert.strictEqual(registry.getByName('Same'), second);
        assert.strictEqual(registry.getAll().length, 1);
    });

    test('isHarnessTab returns false when no adapters registered', () => {
        // Create a minimal mock tab
        const tab = { label: 'test', input: {} } as unknown as vscode.Tab;
        assert.strictEqual(registry.isHarnessTab(tab), false);
    });

    test('getAdapterForTab returns undefined when no adapter claims tab', () => {
        registry.register(new MockAdapter('Test', true));
        const tab = { label: 'test', input: {} } as unknown as vscode.Tab;
        assert.strictEqual(registry.getAdapterForTab(tab), undefined);
    });
});

suite('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    setup(() => {
        adapter = new ClaudeCodeAdapter();
    });

    test('name is Claude Code', () => {
        assert.strictEqual(adapter.name, 'Claude Code');
    });

    test('extensionId is anthropic.claude-code', () => {
        assert.strictEqual(adapter.extensionId, 'anthropic.claude-code');
    });

    test('capabilities are set correctly', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, true);
        assert.strictEqual(adapter.capabilities.canDetectTabs, true);
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
        assert.strictEqual(adapter.capabilities.hasStopHook, true);
        assert.strictEqual(adapter.capabilities.canInjectMessages, false);
    });

    test('isAvailable returns boolean (false in test host without Claude Code)', () => {
        // In the test host, Claude Code is not installed
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab returns false for non-webview tab', () => {
        const tab = { label: 'test.ts', input: { uri: {} } } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('isHarnessTab returns false for unrelated webview tab', () => {
        const tab = {
            label: 'Preview',
            input: { viewType: 'markdown.preview' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('isHarnessTab returns true for Claude Code webview tab', () => {
        const tab = {
            label: 'Claude',
            input: { viewType: 'claudeVSCodePanel.tab' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), true);
    });

    test('getSessionIdFromTab returns undefined (not yet supported)', () => {
        const tab = {
            label: 'Claude',
            input: { viewType: 'claudeVSCodePanel.tab' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.getSessionIdFromTab(tab), undefined);
    });

    test('isHarnessTab returns false when input is null', () => {
        const tab = { label: 'test', input: null } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('isHarnessTab returns false when input has no viewType', () => {
        const tab = { label: 'test', input: { uri: 'file:///test' } } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });
});
