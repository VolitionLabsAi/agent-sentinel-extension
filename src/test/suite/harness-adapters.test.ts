import * as assert from 'assert';
import { HarnessAdapterRegistry } from '../../adapters/adapter-registry';
import { ClaudeCodeAdapter } from '../../adapters/claude-code-adapter';
import { GeminiCLIAdapter } from '../../adapters/gemini-cli-adapter';
import { CopilotAdapter } from '../../adapters/copilot-adapter';
import { CodexCLIAdapter } from '../../adapters/codex-cli-adapter';
import type * as vscode from 'vscode';

// ─── Gemini CLI Adapter ───────────────────────────────────────────────

suite('GeminiCLIAdapter', () => {
    let adapter: GeminiCLIAdapter;

    setup(() => {
        adapter = new GeminiCLIAdapter();
    });

    test('name is Gemini CLI', () => {
        assert.strictEqual(adapter.name, 'Gemini CLI');
    });

    test('extensionId is Google.gemini-cli-vscode-ide-companion', () => {
        assert.strictEqual(adapter.extensionId, 'Google.gemini-cli-vscode-ide-companion');
    });

    test('capabilities reflect full hook support but no VS Code UI integration', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
        assert.strictEqual(adapter.capabilities.canDetectTabs, false);
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
        assert.strictEqual(adapter.capabilities.hasStopHook, true);
        assert.strictEqual(adapter.capabilities.canInjectMessages, false);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab always returns false (CLI-only, no webview)', () => {
        const tab = {
            label: 'Gemini',
            input: { viewType: 'some.gemini.panel' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('getSessionIdFromTab returns undefined', () => {
        const tab = { label: 'test', input: {} } as unknown as vscode.Tab;
        assert.strictEqual(adapter.getSessionIdFromTab(tab), undefined);
    });

    test('openSession rejects with descriptive error', async () => {
        await assert.rejects(
            () => adapter.openSession('test-session-id'),
            /Gemini CLI does not support opening sessions from VS Code/,
        );
    });

    test('detectActiveSessions returns empty array', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

// ─── GitHub Copilot Adapter ───────────────────────────────────────────

suite('CopilotAdapter', () => {
    let adapter: CopilotAdapter;

    setup(() => {
        adapter = new CopilotAdapter();
    });

    test('name is GitHub Copilot', () => {
        assert.strictEqual(adapter.name, 'GitHub Copilot');
    });

    test('extensionId is github.copilot-chat', () => {
        assert.strictEqual(adapter.extensionId, 'github.copilot-chat');
    });

    test('capabilities reflect PreToolUse support and tab detection', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
        assert.strictEqual(adapter.capabilities.canDetectTabs, true);
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, true);
        assert.strictEqual(adapter.capabilities.hasStopHook, true);
        assert.strictEqual(adapter.capabilities.canInjectMessages, false);
    });

    test('isAvailable returns boolean (false in test host without Copilot)', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab returns false for non-chat tab', () => {
        const tab = {
            label: 'test.ts',
            input: { viewType: 'markdown.preview' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('isHarnessTab returns true for chat panel tab', () => {
        const tab = {
            label: 'Copilot Chat',
            input: { viewType: 'workbench.panel.chat.view' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), true);
    });

    test('isHarnessTab returns false when input is null', () => {
        const tab = { label: 'test', input: null } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('isHarnessTab returns false when input has no viewType', () => {
        const tab = { label: 'test', input: { uri: 'file:///test' } } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('getSessionIdFromTab returns undefined', () => {
        const tab = {
            label: 'Chat',
            input: { viewType: 'workbench.panel.chat' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.getSessionIdFromTab(tab), undefined);
    });

    test('openSession rejects with descriptive error', async () => {
        await assert.rejects(
            () => adapter.openSession('test-session-id'),
            /GitHub Copilot does not support opening sessions by ID/,
        );
    });

    test('detectActiveSessions returns empty array', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

// ─── Codex CLI Adapter ────────────────────────────────────────────────

suite('CodexCLIAdapter', () => {
    let adapter: CodexCLIAdapter;

    setup(() => {
        adapter = new CodexCLIAdapter();
    });

    test('name is Codex CLI', () => {
        assert.strictEqual(adapter.name, 'Codex CLI');
    });

    test('extensionId is openai.chatgpt', () => {
        assert.strictEqual(adapter.extensionId, 'openai.chatgpt');
    });

    test('capabilities reflect NO PreToolUse (key limitation)', () => {
        assert.strictEqual(adapter.capabilities.canOpenSessions, false);
        assert.strictEqual(adapter.capabilities.canDetectTabs, false);
        assert.strictEqual(adapter.capabilities.hasPreToolUseHook, false);  // KEY: no PreToolUse
        assert.strictEqual(adapter.capabilities.hasStopHook, true);
        assert.strictEqual(adapter.capabilities.canInjectMessages, false);
    });

    test('isAvailable returns boolean', () => {
        assert.strictEqual(typeof adapter.isAvailable, 'boolean');
    });

    test('isInstalled returns boolean', () => {
        assert.strictEqual(typeof adapter.isInstalled, 'boolean');
    });

    test('isHarnessTab always returns false (no documented viewType)', () => {
        const tab = {
            label: 'Codex',
            input: { viewType: 'some.codex.panel' },
        } as unknown as vscode.Tab;
        assert.strictEqual(adapter.isHarnessTab(tab), false);
    });

    test('getSessionIdFromTab returns undefined', () => {
        const tab = { label: 'test', input: {} } as unknown as vscode.Tab;
        assert.strictEqual(adapter.getSessionIdFromTab(tab), undefined);
    });

    test('openSession rejects with descriptive error', async () => {
        await assert.rejects(
            () => adapter.openSession('test-session-id'),
            /Codex CLI does not support opening sessions from VS Code/,
        );
    });

    test('detectActiveSessions returns empty array', async () => {
        const sessions = await adapter.detectActiveSessions();
        assert.deepStrictEqual(sessions, []);
    });
});

// ─── Multi-Adapter Registry Integration ───────────────────────────────

suite('HarnessAdapterRegistry — multi-adapter integration', () => {
    let registry: HarnessAdapterRegistry;

    setup(() => {
        registry = new HarnessAdapterRegistry();
        registry.register(new ClaudeCodeAdapter());
        registry.register(new GeminiCLIAdapter());
        registry.register(new CopilotAdapter());
        registry.register(new CodexCLIAdapter());
    });

    test('all four adapters are registered', () => {
        const all = registry.getAll();
        assert.strictEqual(all.length, 4);
    });

    test('each adapter is retrievable by name', () => {
        assert.ok(registry.getByName('Claude Code'));
        assert.ok(registry.getByName('Gemini CLI'));
        assert.ok(registry.getByName('GitHub Copilot'));
        assert.ok(registry.getByName('Codex CLI'));
    });

    test('getAdapterForTab returns Copilot for chat panel tab', () => {
        const tab = {
            label: 'Chat',
            input: { viewType: 'workbench.panel.chat.session' },
        } as unknown as vscode.Tab;
        const adapter = registry.getAdapterForTab(tab);
        assert.strictEqual(adapter?.name, 'GitHub Copilot');
    });

    test('getAdapterForTab returns Claude Code for Claude webview tab', () => {
        const tab = {
            label: 'Claude',
            input: { viewType: 'claudeVSCodePanel.tab' },
        } as unknown as vscode.Tab;
        const adapter = registry.getAdapterForTab(tab);
        assert.strictEqual(adapter?.name, 'Claude Code');
    });

    test('getAdapterForTab returns undefined for unrelated tab', () => {
        const tab = {
            label: 'README.md',
            input: { viewType: 'markdown.preview' },
        } as unknown as vscode.Tab;
        assert.strictEqual(registry.getAdapterForTab(tab), undefined);
    });

    test('isHarnessTab returns true for any registered harness tab', () => {
        const claudeTab = {
            label: 'Claude',
            input: { viewType: 'claudeVSCodePanel.tab' },
        } as unknown as vscode.Tab;
        const copilotTab = {
            label: 'Chat',
            input: { viewType: 'workbench.panel.chat.view' },
        } as unknown as vscode.Tab;

        assert.strictEqual(registry.isHarnessTab(claudeTab), true);
        assert.strictEqual(registry.isHarnessTab(copilotTab), true);
    });

    test('capability summary across adapters', () => {
        const all = registry.getAll();
        const withPreToolUse = all.filter(a => a.capabilities.hasPreToolUseHook);
        const withTabDetection = all.filter(a => a.capabilities.canDetectTabs);
        const withSessionOpen = all.filter(a => a.capabilities.canOpenSessions);

        // Claude Code, Gemini CLI, and Copilot have PreToolUse; Codex does not
        assert.strictEqual(withPreToolUse.length, 3);
        assert.ok(withPreToolUse.every(a => a.name !== 'Codex CLI'));

        // Claude Code and Copilot can detect tabs
        assert.strictEqual(withTabDetection.length, 2);

        // Only Claude Code can open sessions
        assert.strictEqual(withSessionOpen.length, 1);
        assert.strictEqual(withSessionOpen[0].name, 'Claude Code');
    });
});
