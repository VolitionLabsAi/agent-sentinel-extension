import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from './ui/status-bar.js';
import { ObservationStore } from './stores/observation-store.js';
import { LiveFeedProvider } from './ui/sidebar/live-feed-provider.js';
import { WorkspaceManager } from './watchers/workspace-manager.js';
import { WalkthroughManager } from './ui/walkthrough.js';
import { SentinelCLI } from './cli/sentinel-cli.js';
import { HealthAssessor } from './health/health-assessor.js';

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

    // --- File Watcher → Observation Store & Health ---

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

    // Wire config file changes to trigger a health re-check
    context.subscriptions.push(
        workspaceManager.onConfigChanged(async () => {
            await healthAssessor.runCheckForAllFolders();
        }),
    );

    // Initial load (fire-and-forget; errors are logged inside the store)
    if (observationsPath) {
        observationStore.load().catch((err) => {
            console.warn('[Agent Sentinel] Initial observation load failed:', err);
        });
    }

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
        healthAssessor,
    };
}

export function deactivate() {}
