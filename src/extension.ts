import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from './ui/status-bar.js';
import { ObservationStore } from './stores/observation-store.js';
import { LiveFeedProvider } from './ui/sidebar/live-feed-provider.js';
import { WorkspaceManager } from './watchers/workspace-manager.js';
import { WalkthroughManager } from './ui/walkthrough.js';

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Sentinel activated');

    const statusBar = new StatusBarManager(context);
    context.subscriptions.push(statusBar);

    // --- Observation Store & Live Feed ---

    // Resolve the observations JSONL path from the first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const observationsPath = workspaceFolder
        ? path.join(workspaceFolder.uri.fsPath, '.volition', 'sentinel', 'sentinel-observations.jsonl')
        : '';

    const observationStore = new ObservationStore(observationsPath);
    context.subscriptions.push(observationStore);

    const liveFeedProvider = new LiveFeedProvider(observationStore);
    context.subscriptions.push(liveFeedProvider);

    const treeView = vscode.window.createTreeView('sentinel.liveFeed', {
        treeDataProvider: liveFeedProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // --- File Watcher → Observation Store ---

    const workspaceManager = new WorkspaceManager();
    context.subscriptions.push(workspaceManager);

    // Wire observation file changes to the store's incremental update
    context.subscriptions.push(
        workspaceManager.onObservationsChanged(async () => {
            await observationStore.update();
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
    if (workspaceFolder) {
        const sentinelWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '.volition/sentinel/**'),
        );
        sentinelWatcher.onDidCreate(() => walkthroughManager.refreshAllContextKeys());
        sentinelWatcher.onDidChange(() => walkthroughManager.refreshAllContextKeys());
        sentinelWatcher.onDidDelete(() => walkthroughManager.refreshAllContextKeys());
        context.subscriptions.push(sentinelWatcher);
    }

    // Initial load (fire-and-forget; errors are logged inside the store)
    if (observationsPath) {
        observationStore.load().catch((err) => {
            console.warn('[Agent Sentinel] Initial observation load failed:', err);
        });
    }

    // Return API surface for volition-extension (and tests) to consume
    return {
        statusBar,
        observationStore,
        liveFeedProvider,
    };
}

export function deactivate() {}
