import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from './ui/status-bar.js';
import { ObservationStore } from './stores/observation-store.js';
import { LiveFeedProvider, ViewMode } from './ui/sidebar/live-feed-provider.js';
import { WorkspaceManager } from './watchers/workspace-manager.js';
import { WalkthroughManager } from './ui/walkthrough.js';
import { SentinelCLI } from './cli/sentinel-cli.js';
import { HealthAssessor } from './health/health-assessor.js';
import { SessionCorrelator } from './correlation/session-correlator.js';
import { StateManager } from './stores/state-manager.js';
import { ConfigManager } from './stores/config-manager.js';
import { SessionHealthProvider } from './ui/sidebar/session-health-provider.js';
import { EvalRulesProvider } from './ui/sidebar/eval-rules-provider.js';
import { EvalRuleTreeItem, DynamicEvalRuleTreeItem } from './ui/sidebar/eval-rule-tree-item.js';
import { setExtensionUri } from './ui/sidebar/observation-tree-item.js';
import { ObservationCardPanel } from './ui/webview/observation-card-panel.js';
import { promoteLocalEval } from './evals/eval-promotion.js';
import { HarnessAdapterRegistry } from './adapters/adapter-registry.js';
import { ClaudeCodeAdapter } from './adapters/claude-code-adapter.js';
import { GeminiCLIAdapter } from './adapters/gemini-cli-adapter.js';
import { CopilotAdapter } from './adapters/copilot-adapter.js';
import { CodexCLIAdapter } from './adapters/codex-cli-adapter.js';
import { openSentinelChat } from './commands/open-sentinel-chat.js';
import { EvalCreationPanel } from './ui/webview/eval-creation/panel.js';
import { EvalEditorPanel } from './ui/webview/eval-editor/panel.js';
import { SentinelConversationPanel } from './ui/webview/sentinel-panel/panel.js';
import { steerSentinel } from './commands/steer-sentinel.js';
import { AboutProvider } from './ui/sidebar/about-provider.js';
import { HarnessConfigResolver } from './ui/settings/harness-config.js';
import { generateEvalFromDescription } from './evals/eval-creator.js';
import { exportEval, importEvalPack } from './evals/eval-import-export.js';

/** Derive sentinel file paths for a workspace folder. */
function sentinelPaths(folder: vscode.WorkspaceFolder) {
    const sentinelDir = path.join(folder.uri.fsPath, '.volition', 'sentinel');
    return {
        sentinelDir,
        config: path.join(sentinelDir, 'sentinel.config.json'),
        observations: path.join(sentinelDir, 'sentinel-observations.jsonl'),
        state: path.join(sentinelDir, 'sentinel-state.json'),
        activeSession: path.join(sentinelDir, 'active-session.json'),
    };
}

export function activate(context: vscode.ExtensionContext) {
    console.log('[Agent Sentinel] Activation started');

    // Late-bound reference so sentinel.start command can use the correlator
    let sessionCorrelatorRef: import('./correlation/session-correlator.js').SessionCorrelator | undefined;

    // Set extension URI for file-based severity icons
    setExtensionUri(context.extensionUri);

    const statusBar = new StatusBarManager(context);
    context.subscriptions.push(statusBar);

    // --- CLI & Health Assessment ---

    const cli = new SentinelCLI();
    const healthAssessor = new HealthAssessor(cli, statusBar);
    context.subscriptions.push(healthAssessor);

    // Register the runHealthCheck command
    const runHealthCheckCmd = vscode.commands.registerCommand(
        'sentinel.runHealthCheck',
        () => healthAssessor.runCheckForAllFolders(),
    );
    context.subscriptions.push(runHealthCheckCmd);

    // Open sentinel.config.json for the first workspace folder
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.openSettings', async () => {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                void vscode.window.showErrorMessage('Sentinel: No workspace folder open.');
                return;
            }
            const configPath = sentinelPaths(folder).config;
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
                await vscode.window.showTextDocument(doc);
            } catch {
                void vscode.window.showWarningMessage('Sentinel: No sentinel config found. Run "Sentinel: Initialize Configuration" first.');
            }
        }),
    );

    // --- sentinel.start / sentinel.stop commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.start', async () => {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                void vscode.window.showErrorMessage('Sentinel: No workspace folder open.');
                return;
            }
            const configPath = sentinelPaths(folder).config;
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
            } catch {
                void vscode.window.showWarningMessage('Sentinel: No sentinel config found in this workspace. Run "Sentinel: Initialize Configuration" first.');
                return;
            }
            const sessionId = sessionCorrelatorRef?.getCurrentSession()?.sessionId;
            const startArgs = sessionId
                ? ['start', '--session-id', sessionId]
                : ['start'];
            const result = await cli.execSentinel(startArgs, folder.uri.fsPath);
            if (result.exitCode === 0) {
                void vscode.window.showInformationMessage('Sentinel monitoring started.');
            } else {
                void vscode.window.showErrorMessage(`Sentinel start failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.stop', async () => {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                void vscode.window.showErrorMessage('Sentinel: No workspace folder open.');
                return;
            }
            const result = await cli.execSentinel(['stop'], folder.uri.fsPath);
            if (result.exitCode === 0) {
                void vscode.window.showInformationMessage('Sentinel monitoring stopped.');
            } else {
                void vscode.window.showErrorMessage(`Sentinel stop failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
            }
        }),
    );

    // --- Placeholder commands (declared in package.json, implemented in a future release) ---

    const placeholderCommands = [
        { id: 'sentinel.status', label: 'Show Status' },
        { id: 'sentinel.openLiveFeed', label: 'Open Live Feed' },
        { id: 'sentinel.init', label: 'Initialize Configuration' },
    ];

    for (const { id, label } of placeholderCommands) {
        context.subscriptions.push(
            vscode.commands.registerCommand(id, () => {
                void vscode.window.showInformationMessage(
                    `Sentinel: ${label} — coming in a future release.`,
                );
            }),
        );
    }

    // --- Observation Store & Live Feed ---

    const maxInMemory = 1000;
    const observationStore = new ObservationStore(maxInMemory);
    context.subscriptions.push(observationStore);

    const stateManager = new StateManager();
    context.subscriptions.push(stateManager);

    const configManager = new ConfigManager();
    context.subscriptions.push(configManager);

    // Register all current workspace folders
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const key = folder.uri.toString();
            const paths = sentinelPaths(folder);
            observationStore.addFolder(key, paths.observations);
            stateManager.addFolder(key, paths.state);
            configManager.addFolder(key, paths.config, paths.sentinelDir);
        }
    }

    // Handle dynamic workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((e) => {
            for (const added of e.added) {
                const key = added.uri.toString();
                const paths = sentinelPaths(added);
                observationStore.addFolder(key, paths.observations);
                stateManager.addFolder(key, paths.state);
                configManager.addFolder(key, paths.config, paths.sentinelDir);
                // Load the new folder's data
                observationStore.update().catch(() => { /* non-fatal */ });
                stateManager.update().catch(() => { /* non-fatal */ });
                configManager.update().catch(() => { /* non-fatal */ });
            }
            for (const removed of e.removed) {
                const key = removed.uri.toString();
                observationStore.removeFolder(key);
                stateManager.removeFolder(key);
                configManager.removeFolder(key);
            }
        }),
    );

    const liveFeedProvider = new LiveFeedProvider(observationStore);
    context.subscriptions.push(liveFeedProvider);

    const treeView = vscode.window.createTreeView('sentinel.liveFeed', {
        treeDataProvider: liveFeedProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // --- Session Health Webview ---

    const sessionHealthProvider = new SessionHealthProvider(observationStore, stateManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SessionHealthProvider.viewType, sessionHealthProvider),
    );

    // --- Eval Rules Tree View ---

    const evalRulesProvider = new EvalRulesProvider(configManager, observationStore, stateManager);
    const evalRulesTree = vscode.window.createTreeView('sentinel.evalRules', {
        treeDataProvider: evalRulesProvider,
    });
    context.subscriptions.push(evalRulesTree);

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.toggleEvalRule', async (ruleItem: EvalRuleTreeItem) => {
            if (ruleItem?.rule) {
                await configManager.setEvalEnabled(ruleItem.rule.id, !ruleItem.rule.enabled);
                evalRulesProvider.refresh();
            }
        }),
    );

    // --- Dynamic Eval Notifications ---

    context.subscriptions.push(
        stateManager.onDynamicEvalCreated((localEval) => {
            void vscode.window.showInformationMessage(
                `Sentinel learned new eval: ${localEval.id} (${localEval.severity})`,
                'Inspect',
            ).then((action) => {
                if (action === 'Inspect') {
                    // Focus the eval rules view so the user can see the new dynamic eval
                    void vscode.commands.executeCommand('sentinel.evalRules.focus');
                }
            });
        }),
    );

    // Register sentinel.inspectDynamicEval command — opens rule text in untitled document
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.inspectDynamicEval', async (item: DynamicEvalRuleTreeItem) => {
            if (!item?.localEval) { return; }
            const content = [
                `# ${item.localEval.id} (dynamic eval)`,
                '',
                `Severity: ${item.localEval.severity}`,
                `Sentinel: ${item.localEval.sentinel_name}`,
                `Session: ${item.localEval.session_id}`,
                `Created: ${item.localEval.created_at}`,
                '',
                '## Rule',
                '',
                item.localEval.rule,
                '',
                '## Rationale',
                '',
                item.localEval.rationale,
            ].join('\n');

            const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
            await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
        }),
    );

    // --- Dynamic Eval Promotion ---

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.promoteEval', async (item: DynamicEvalRuleTreeItem) => {
            if (!item?.localEval) { return; }

            const confirm = await vscode.window.showInformationMessage(
                `This will make ${item.localEval.id} a permanent rule. Continue?`,
                { modal: true },
                'Continue',
            );

            if (confirm !== 'Continue') { return; }

            // Determine workspace root from the first workspace folder
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                void vscode.window.showErrorMessage('No workspace folder open — cannot promote eval.');
                return;
            }

            try {
                const filePath = await promoteLocalEval(item.localEval, workspaceRoot);
                const openAction = await vscode.window.showInformationMessage(
                    `Eval ${item.localEval.id} promoted to ${filePath}`,
                    'Open File',
                );

                if (openAction === 'Open File') {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                    await vscode.window.showTextDocument(doc, { preserveFocus: true });
                }

                evalRulesProvider.refresh();
            } catch (err) {
                void vscode.window.showErrorMessage(`Failed to promote eval: ${err}`);
            }
        }),
    );

    // --- Harness Adapter Registry ---

    const adapterRegistry = new HarnessAdapterRegistry();
    const geminiAdapter = new GeminiCLIAdapter();
    const codexAdapter = new CodexCLIAdapter();
    adapterRegistry.register(new ClaudeCodeAdapter());
    adapterRegistry.register(geminiAdapter);
    adapterRegistry.register(new CopilotAdapter());
    adapterRegistry.register(codexAdapter);

    Promise.all([
        geminiAdapter.detectAvailability(),
        codexAdapter.detectAvailability(),
    ]).catch((err) => {
        console.warn('[Agent Sentinel] CLI adapter availability detection failed:', err);
    });

    // --- P4-6: Harness Configuration ---

    const harnessConfigResolver = new HarnessConfigResolver(configManager, adapterRegistry);

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.selectHarness', async () => {
            const harnesses = harnessConfigResolver.getAvailableHarnesses();

            const items: Array<vscode.QuickPickItem & { settingId: string }> = [
                {
                    label: '$(search) Auto-detect',
                    description: 'Automatically detect the active harness',
                    settingId: 'auto',
                },
                ...harnesses.map((h) => ({
                    label: h.isAvailable ? `$(check) ${h.name}` : `$(circle-slash) ${h.name}`,
                    description: h.isAvailable
                        ? 'Available'
                        : h.isInstalled
                            ? 'Installed (not active)'
                            : 'Not installed',
                    settingId: h.settingId,
                })),
            ];

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select the default harness for sentinel monitoring',
            });

            if (picked) {
                // Write the harness preference to sentinel.config.json
                await configManager.setHarnessConfig('_default', { model: picked.settingId });
                void vscode.window.showInformationMessage(
                    `Sentinel harness set to: ${picked.settingId === 'auto' ? 'Auto-detect' : picked.label.replace(/\$\([^)]+\)\s*/, '')}`,
                );
            }
        }),
    );

    // --- P3-1: Open Sentinel Chat ---

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.openSentinelChat', () => {
            return openSentinelChat(stateManager, adapterRegistry, configManager);
        }),
    );

    // --- P3-2: Rapid Eval Creation ---

    const evalCreationPanel = new EvalCreationPanel(context.extensionUri);
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.createEval', () => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                void vscode.window.showErrorMessage('No workspace folder open — cannot create eval.');
                return;
            }
            evalCreationPanel.show(workspaceRoot);
        }),
    );

    // --- P3-3: Eval Editor ---

    const evalEditorPanel = new EvalEditorPanel(context.extensionUri);
    context.subscriptions.push(evalEditorPanel);

    // Wire save → refresh config and eval rules
    context.subscriptions.push(
        evalEditorPanel.onDidSave(async () => {
            await configManager.load();
            evalRulesProvider.refresh();
        }),
    );

    // Wire duplicate → create copy with new ID and reopen
    context.subscriptions.push(
        evalEditorPanel.onDidRequestDuplicate(({ content }) => {
            // Generate a new ID by replacing the existing ID in the YAML
            const idMatch = content.match(/^\s+-\s+id:\s*"?([^"\n]+)"?\s*$/m);
            const oldId = idMatch?.[1]?.trim();
            const domainPrefix = oldId?.split('-')[0] ?? 'GEN';

            const result = generateEvalFromDescription({
                description: 'Duplicated eval — edit the rule text',
                domain: domainPrefix,
                severity: 'warning',
            });

            // Replace the old ID with the new one in the content
            let newContent = content;
            if (oldId) {
                newContent = content.replace(oldId, result.id);
            }

            evalEditorPanel.show(newContent, result.filePath);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.editEval', async (arg?: EvalRuleTreeItem | DynamicEvalRuleTreeItem | string) => {
            let filePath: string | undefined;

            if (typeof arg === 'string') {
                filePath = arg;
            } else if (arg instanceof DynamicEvalRuleTreeItem && arg.localEval) {
                // Dynamic evals are read-only (rendered from state, not files)
                const yaml = [
                    'evals:',
                    `  - id: "${arg.localEval.id}"`,
                    '    version: 1',
                    '    domain: "local"',
                    `    severity: "${arg.localEval.severity}"`,
                    '    rule: |',
                    ...arg.localEval.rule.split('\n').map(l => `      ${l}`),
                    '    rationale: |',
                    ...arg.localEval.rationale.split('\n').map(l => `      ${l}`),
                    '',
                ].join('\n');
                evalEditorPanel.show(yaml, '', { readOnly: true });
                return;
            } else if (arg instanceof EvalRuleTreeItem && arg.rule) {
                // Search eval YAML files in the workspace for the rule ID
                const evalFiles = await vscode.workspace.findFiles(
                    '.volition/sentinel/**/*.yaml',
                    undefined,
                    50,
                );
                for (const uri of evalFiles) {
                    try {
                        const content = await vscode.workspace.fs.readFile(uri);
                        const text = Buffer.from(content).toString('utf-8');
                        if (text.includes(arg.rule.id)) {
                            filePath = uri.fsPath;
                            break;
                        }
                    } catch {
                        // skip files we can't read
                    }
                }
            }

            if (!filePath) {
                void vscode.window.showErrorMessage('Could not locate eval file to edit.');
                return;
            }

            try {
                const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const text = Buffer.from(content).toString('utf-8');
                evalEditorPanel.show(text, filePath);
            } catch (err) {
                void vscode.window.showErrorMessage(`Failed to open eval file: ${err}`);
            }
        }),
    );

    // --- P6-2: Eval Import/Export ---

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.exportEval', async (arg?: EvalRuleTreeItem) => {
            let rule: import('./types/eval-rule.js').EvalRule | undefined;

            if (arg instanceof EvalRuleTreeItem && arg.rule) {
                rule = arg.rule;
            } else {
                // Let user pick from available rules
                const allRules = configManager.getEvalRules();
                if (allRules.length === 0) {
                    void vscode.window.showInformationMessage('No eval rules available to export.');
                    return;
                }

                const items = allRules.map((r) => ({
                    label: r.id,
                    description: `${r.severity} — ${r.domainRaw}`,
                    detail: r.rule.slice(0, 80),
                    rule: r,
                }));

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select an eval rule to export',
                });

                if (!picked) { return; }
                rule = picked.rule;
            }

            if (!rule) { return; }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${rule.id.toLowerCase()}.yaml`),
                filters: { 'YAML Files': ['yaml', 'yml'] },
                title: 'Export Eval Rule',
            });

            if (!uri) { return; }

            try {
                await exportEval(rule, uri.fsPath);
                void vscode.window.showInformationMessage(`Eval ${rule.id} exported to ${uri.fsPath}`);
            } catch (err) {
                void vscode.window.showErrorMessage(`Failed to export eval: ${err}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.importEval', async () => {
            const hint = await vscode.window.showInformationMessage(
                'Import a YAML eval pack. Expected format: `evals:` array with id, version, domain, severity, rule, and rationale fields.',
                { modal: false },
                'Browse...', 'View Example',
            );
            if (!hint) { return; }
            if (hint === 'View Example') {
                const exampleDir = path.join(context.extensionPath, 'eval-packs');
                const examples = await vscode.workspace.fs.readDirectory(vscode.Uri.file(exampleDir));
                if (examples.length > 0) {
                    const doc = await vscode.workspace.openTextDocument(path.join(exampleDir, examples[0][0]));
                    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
                }
                return;
            }

            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'YAML Files': ['yaml', 'yml'] },
                title: 'Import Eval Pack (YAML with evals: array)',
            });

            if (!uris || uris.length === 0) { return; }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                void vscode.window.showErrorMessage('No workspace folder open — cannot import eval.');
                return;
            }

            const targetDir = path.join(workspaceRoot, '.volition', 'sentinel', 'evals');
            const filePath = uris[0].fsPath;

            // Try as pack first (multi-eval), fall back to single
            const results = await importEvalPack(filePath, targetDir);

            const succeeded = results.filter((r) => r.success);
            const conflicts = results.filter((r) => r.conflict);
            const failures = results.filter((r) => !r.success && !r.conflict);

            const messages: string[] = [];
            if (succeeded.length > 0) {
                messages.push(`Imported ${succeeded.length} eval(s): ${succeeded.map((r) => r.evalId).join(', ')}`);
            }
            if (conflicts.length > 0) {
                messages.push(`Skipped ${conflicts.length} (ID conflict): ${conflicts.map((r) => r.evalId).join(', ')}`);
            }
            if (failures.length > 0) {
                messages.push(`Failed ${failures.length}: ${failures.map((r) => r.error).join('; ')}`);
            }

            const summary = messages.join('\n');

            if (failures.length > 0 || conflicts.length > 0) {
                void vscode.window.showWarningMessage(summary);
            } else {
                void vscode.window.showInformationMessage(summary);
            }

            // Refresh config and eval rules
            if (succeeded.length > 0) {
                await configManager.load();
                evalRulesProvider.refresh();
            }
        }),
    );

    // --- P3-4: Sentinel Conversation Panel ---

    const sentinelConversationPanel = new SentinelConversationPanel(
        observationStore,
        stateManager,
        configManager,
        adapterRegistry,
    );
    context.subscriptions.push(sentinelConversationPanel);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SentinelConversationPanel.viewType,
            sentinelConversationPanel,
        ),
    );

    // --- About Footer Webview ---

    const aboutProvider = new AboutProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AboutProvider.viewType, aboutProvider),
    );

    // --- P3-5: Mid-Session Sentinel Steering ---

    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.steerSentinel', () => {
            return steerSentinel(stateManager, adapterRegistry);
        }),
    );

    // --- Observation Card Panel ---

    const cardPanel = new ObservationCardPanel(context.extensionUri);
    context.subscriptions.push(cardPanel);
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.viewObservationCard', (observation) => {
            cardPanel.show(observation);
        }),
    );

    // --- Session Correlator ---

    const sessionCorrelator = new SessionCorrelator(stateManager, adapterRegistry);
    sessionCorrelatorRef = sessionCorrelator;
    context.subscriptions.push(sessionCorrelator);

    // Set active-session.json path from the first workspace folder
    if (vscode.workspace.workspaceFolders?.[0]) {
        const activeSessionPath = sentinelPaths(vscode.workspace.workspaceFolders[0]).activeSession;
        sessionCorrelator.setActiveSessionFilePath(activeSessionPath);
    }

    // --- P1-08: Multi-Session View Modes ---

    // Default view mode is 'all'; view mode is ephemeral (not persisted to settings)
    const initialMode: ViewMode = 'all';
    liveFeedProvider.setViewMode(initialMode);

    /** Helper to update session context in the status bar based on current mode. */
    function updateSessionContext(): void {
        const mode = liveFeedProvider.getViewMode();
        switch (mode) {
            case 'all':
                statusBar.setSessionContext('All');
                break;
            case 'recent': {
                const result = sessionCorrelator.getCurrentSession();
                const shortId = result ? result.sessionId.slice(0, 8) : undefined;
                statusBar.setSessionContext(shortId ? `Recent: ${shortId}` : 'Recent');
                break;
            }
            case 'pinned': {
                const filter = liveFeedProvider.getSessionFilter();
                const shortId = filter ? filter.slice(0, 8) : undefined;
                statusBar.setSessionContext(shortId ? `Pinned: ${shortId}` : 'Pinned');
                break;
            }
        }
    }

    // Subscribe to active session changes → update filter when in 'active' mode
    context.subscriptions.push(
        sessionCorrelator.onActiveSessionChanged((result) => {
            if (liveFeedProvider.getViewMode() === 'recent') {
                liveFeedProvider.setSessionFilter(result?.sessionId);
                sessionHealthProvider.setSessionFilter(result?.sessionId);
            }
            updateSessionContext();
        }),
    );

    updateSessionContext();

    // Register sentinel.setViewMode command — quick pick for mode selection
    const setViewModeCmd = vscode.commands.registerCommand('sentinel.setViewMode', async () => {
        const picked = await vscode.window.showQuickPick(
            [
                { label: '$(globe) All Sessions', description: 'Show observations from all sessions', mode: 'all' as ViewMode },
                { label: '$(eye) Recent Session', description: 'Auto-filter to the most recent session from hooks', mode: 'recent' as ViewMode },
                { label: '$(pin) Pinned Session', description: 'Pin a specific session', mode: 'pinned' as ViewMode },
            ],
            { placeHolder: 'Select view mode for the Live Feed' },
        );

        if (!picked) {
            return;
        }

        const mode = picked.mode;

        if (mode === 'pinned') {
            // Let user pick which session to pin via sentinel.focusSession
            await vscode.commands.executeCommand('sentinel.focusSession');
            // If focusSession set a filter, switch to pinned mode
            if (liveFeedProvider.getSessionFilter()) {
                liveFeedProvider.setViewMode('pinned');
            }
        } else {
            liveFeedProvider.setViewMode(mode);
            if (mode === 'all') {
                liveFeedProvider.setSessionFilter(undefined);
                sessionHealthProvider.setSessionFilter(undefined);
            } else if (mode === 'recent') {
                const result = await sessionCorrelator.correlateActiveSession();
                liveFeedProvider.setSessionFilter(result?.sessionId);
                sessionHealthProvider.setSessionFilter(result?.sessionId);
            }
        }

        updateSessionContext();
    });
    context.subscriptions.push(setViewModeCmd);

    // Register sentinel.focusSession — let user pick a session to pin
    const focusSessionCmd = vscode.commands.registerCommand('sentinel.focusSession', async () => {
        const sessionIds = stateManager.getSessionIds();
        if (sessionIds.length === 0) {
            void vscode.window.showInformationMessage('No active sessions found.');
            return;
        }

        // Resolve titles: prefer state title, fall back to transcript title extraction
        const items = await Promise.all(sessionIds.map(async (id) => {
            const session = stateManager.getSession(id);
            let title = session?.title;
            if (!title && session?.transcript_path) {
                title = await sessionCorrelator.extractSessionTitle(session.transcript_path) ?? undefined;
            }
            return {
                label: title ?? 'Untitled',
                description: id,
                sessionId: id,
            };
        }));

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a session to pin',
        });

        if (picked) {
            liveFeedProvider.setViewMode('pinned');
            liveFeedProvider.setSessionFilter(picked.sessionId);
            sessionHealthProvider.setSessionFilter(picked.sessionId);
            updateSessionContext();
        }
    });
    context.subscriptions.push(focusSessionCmd);

    // --- P1-14: Clickable Observation Navigation ---

    const navigateCmd = vscode.commands.registerCommand('sentinel.navigateToSession', async (sessionId: string) => {
        if (!sessionId) {
            return;
        }

        const adapter = adapterRegistry.getAvailable();
        if (adapter && adapter.capabilities.canOpenSessions) {
            try {
                await adapter.openSession(sessionId);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                void vscode.window.showInformationMessage(
                    `Failed to navigate to session: ${message}`,
                );
            }
        } else {
            void vscode.window.showInformationMessage(
                `No harness extension available — cannot navigate to session ${sessionId.slice(0, 8)}.`,
            );
        }
    });
    context.subscriptions.push(navigateCmd);

    // --- P2-6: Historical Observation Browsing ---

    const loadMoreCmd = vscode.commands.registerCommand('sentinel.loadMoreHistory', async (sessionId: string) => {
        if (sessionId) {
            await liveFeedProvider.loadMoreHistory(sessionId);
        }
    });
    context.subscriptions.push(loadMoreCmd);

    // --- File Watcher → Observation Store & Health ---

    const workspaceManager = new WorkspaceManager();
    context.subscriptions.push(workspaceManager);

    // Wire observation file changes to the store's incremental update
    context.subscriptions.push(
        workspaceManager.onObservationsChanged(async (uri) => {
            await observationStore.update(uri);
        }),
    );

    // Wire state file changes to the state manager's incremental update
    context.subscriptions.push(
        workspaceManager.onStateChanged(async (uri) => {
            await stateManager.update(uri);
        }),
    );

    // --- Guided Setup Walkthrough ---

    const walkthroughManager = new WalkthroughManager(context);
    context.subscriptions.push(walkthroughManager);

    // Refresh walkthrough context keys when file watchers fire
    context.subscriptions.push(
        workspaceManager.onObservationsChanged(async () => {
            await walkthroughManager.refreshAllContextKeys();
        }),
    );

    // Refresh walkthrough context keys on config/state changes via WorkspaceManager events
    context.subscriptions.push(
        workspaceManager.onConfigChanged(() => walkthroughManager.refreshAllContextKeys()),
        workspaceManager.onStateChanged(() => walkthroughManager.refreshAllContextKeys()),
    );

    // Wire config file changes to ConfigManager and health re-check
    context.subscriptions.push(
        workspaceManager.onConfigChanged(async (uri) => {
            await configManager.update(uri);
            await healthAssessor.runCheckForAllFolders();
        }),
    );

    // Wire active-session.json changes to session correlator and view filtering
    context.subscriptions.push(
        workspaceManager.onActiveSessionChanged(async () => {
            await sessionCorrelator.onActiveSessionFileChanged();
            // If in "recent" view mode, update filters from the correlator's current result
            if (liveFeedProvider.getViewMode() === 'recent') {
                const result = sessionCorrelator.getCurrentSession();
                liveFeedProvider.setSessionFilter(result?.sessionId);
                sessionHealthProvider.setSessionFilter(result?.sessionId);
                updateSessionContext();
            }
        }),
    );

    // Initial load (fire-and-forget; errors are logged inside the stores)
    observationStore.load().catch((err) => {
        console.warn('[Agent Sentinel] Initial observation load failed:', err);
    });

    stateManager.load().catch((err) => {
        console.warn('[Agent Sentinel] Initial state load failed:', err);
    });

    configManager.load().catch((err) => {
        console.warn('[Agent Sentinel] Initial config load failed:', err);
    });

    healthAssessor.runCheckForAllFolders().catch((err) => {
        console.warn('[Agent Sentinel] Initial health check failed:', err);
    });
    healthAssessor.startPeriodicCheck();

    console.log('[Agent Sentinel] Activation complete');

    // Return API surface for volition-extension (and tests) to consume
    return {
        statusBar,
        observationStore,
        liveFeedProvider,
        sessionCorrelator,
        stateManager,
        healthAssessor,
        configManager,
        sessionHealthProvider,
        evalRulesProvider,
        adapterRegistry,
        harnessConfigResolver,
        sentinelConversationPanel,
    };
}

export function deactivate() {}
