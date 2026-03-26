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

/** Derive sentinel file paths for a workspace folder. */
function sentinelPaths(folder: vscode.WorkspaceFolder) {
    const sentinelDir = path.join(folder.uri.fsPath, '.volition', 'sentinel');
    return {
        observations: path.join(sentinelDir, 'sentinel-observations.jsonl'),
        state: path.join(sentinelDir, 'sentinel-state.json'),
    };
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Sentinel activated');

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

    // --- Placeholder commands (declared in package.json, implemented in a future release) ---

    const placeholderCommands = [
        { id: 'sentinel.start', label: 'Start Monitoring' },
        { id: 'sentinel.stop', label: 'Stop Monitoring' },
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

    // --- Settings ---

    const sentinelConfig = vscode.workspace.getConfiguration('sentinel');
    const autoStart = sentinelConfig.get<boolean>('autoStart', false);
    const maxInMemory = sentinelConfig.get<number>('observations.maxInMemory', 1000);
    console.log(`[Agent Sentinel] autoStart: ${autoStart}`);

    // --- Observation Store & Live Feed ---

    const observationStore = new ObservationStore(maxInMemory);
    context.subscriptions.push(observationStore);

    const stateManager = new StateManager();
    context.subscriptions.push(stateManager);

    // Register all current workspace folders
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const key = folder.uri.toString();
            const paths = sentinelPaths(folder);
            observationStore.addFolder(key, paths.observations);
            stateManager.addFolder(key, paths.state);
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
                // Load the new folder's data
                observationStore.update().catch(() => { /* non-fatal */ });
                stateManager.update().catch(() => { /* non-fatal */ });
            }
            for (const removed of e.removed) {
                const key = removed.uri.toString();
                observationStore.removeFolder(key);
                stateManager.removeFolder(key);
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

    // --- Session Correlator ---

    const sessionCorrelator = new SessionCorrelator(stateManager);
    context.subscriptions.push(sessionCorrelator);

    // --- P1-08: Multi-Session View Modes ---

    // Read persisted view mode from settings (default matches package.json: 'all')
    const initialMode = vscode.workspace
        .getConfiguration('sentinel')
        .get<ViewMode>('viewMode', 'all');
    liveFeedProvider.setViewMode(initialMode);

    /** Helper to update session context in the status bar based on current mode. */
    function updateSessionContext(): void {
        const mode = liveFeedProvider.getViewMode();
        switch (mode) {
            case 'all':
                statusBar.setSessionContext('All');
                break;
            case 'active': {
                const result = sessionCorrelator.getCurrentSession();
                const shortId = result ? result.sessionId.slice(0, 8) : undefined;
                statusBar.setSessionContext(shortId ? `Active: ${shortId}` : 'Active');
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
            if (liveFeedProvider.getViewMode() === 'active') {
                liveFeedProvider.setSessionFilter(result?.sessionId);
            }
            updateSessionContext();
        }),
    );

    // Apply initial active session filter if in 'active' mode
    if (initialMode === 'active') {
        sessionCorrelator.correlateActiveSession().then((result) => {
            if (liveFeedProvider.getViewMode() === 'active') {
                liveFeedProvider.setSessionFilter(result?.sessionId);
            }
            updateSessionContext();
        }).catch(() => { /* non-fatal */ });
    } else {
        updateSessionContext();
    }

    // Register sentinel.setViewMode command — quick pick for mode selection
    const setViewModeCmd = vscode.commands.registerCommand('sentinel.setViewMode', async () => {
        const picked = await vscode.window.showQuickPick(
            [
                { label: '$(globe) All Sessions', description: 'Show observations from all sessions', mode: 'all' as ViewMode },
                { label: '$(eye) Active Session', description: 'Auto-filter to focused Claude Code tab', mode: 'active' as ViewMode },
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
            } else if (mode === 'active') {
                const result = await sessionCorrelator.correlateActiveSession();
                liveFeedProvider.setSessionFilter(result?.sessionId);
            }
        }

        // Persist the chosen mode
        await vscode.workspace.getConfiguration('sentinel').update('viewMode', mode, vscode.ConfigurationTarget.Global);
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

        const items = sessionIds.map((id) => {
            const session = stateManager.getSession(id);
            return {
                label: session?.title ?? id.slice(0, 12),
                description: id,
                sessionId: id,
            };
        });

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a session to pin',
        });

        if (picked) {
            liveFeedProvider.setViewMode('pinned');
            liveFeedProvider.setSessionFilter(picked.sessionId);
            await vscode.workspace.getConfiguration('sentinel').update('viewMode', 'pinned', vscode.ConfigurationTarget.Global);
            updateSessionContext();
        }
    });
    context.subscriptions.push(focusSessionCmd);

    // --- P1-14: Clickable Observation Navigation ---

    const navigateCmd = vscode.commands.registerCommand('sentinel.navigateToSession', async (sessionId: string) => {
        if (!sessionId) {
            return;
        }

        // Feature-detect: check if claude-vscode.editor.open is available
        const allCommands = await vscode.commands.getCommands(true);
        if (allCommands.includes('claude-vscode.editor.open')) {
            await vscode.commands.executeCommand('claude-vscode.editor.open', sessionId);
        } else {
            void vscode.window.showInformationMessage(
                `Claude Code extension not available — cannot navigate to session ${sessionId.slice(0, 8)}.`,
            );
        }
    });
    context.subscriptions.push(navigateCmd);

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

    // Also refresh on config/state changes via a general workspace file watcher
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const sentinelWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, '.volition/sentinel/**'),
            );
            sentinelWatcher.onDidCreate(() => walkthroughManager.refreshAllContextKeys());
            sentinelWatcher.onDidChange(() => walkthroughManager.refreshAllContextKeys());
            sentinelWatcher.onDidDelete(() => walkthroughManager.refreshAllContextKeys());
            context.subscriptions.push(sentinelWatcher);
        }
    }

    // Wire config file changes to trigger a health re-check
    context.subscriptions.push(
        workspaceManager.onConfigChanged(async () => {
            await healthAssessor.runCheckForAllFolders();
        }),
    );

    // Initial load (fire-and-forget; errors are logged inside the stores)
    observationStore.load().catch((err) => {
        console.warn('[Agent Sentinel] Initial observation load failed:', err);
    });

    stateManager.load().catch((err) => {
        console.warn('[Agent Sentinel] Initial state load failed:', err);
    });

    // Run initial health check and start periodic checks
    healthAssessor.runCheckForAllFolders().catch((err) => {
        console.warn('[Agent Sentinel] Initial health check failed:', err);
    });
    healthAssessor.startPeriodicCheck();

    // Return API surface for volition-extension (and tests) to consume
    return {
        statusBar,
        observationStore,
        liveFeedProvider,
        sessionCorrelator,
        stateManager,
        healthAssessor,
    };
}

export function deactivate() {}
