import * as vscode from 'vscode';
import { FileWatcherManager } from './file-watcher-manager.js';

/**
 * Manages per-workspace-folder FileWatcherManager instances and provides
 * aggregated events across all workspace folders. Automatically handles
 * workspace folder add/remove.
 */
export class WorkspaceManager implements vscode.Disposable {
    private readonly managers = new Map<string, FileWatcherManager>();
    private readonly disposables: vscode.Disposable[] = [];

    private readonly _onStateChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onObservationsChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onConfigChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onActiveSessionChanged = new vscode.EventEmitter<vscode.Uri>();

    /** Aggregated: fires when any folder's sentinel-state.json changes. */
    readonly onStateChanged = this._onStateChanged.event;
    /** Aggregated: fires when any folder's sentinel-observations.jsonl changes. */
    readonly onObservationsChanged = this._onObservationsChanged.event;
    /** Aggregated: fires when any folder's sentinel.config.json changes. */
    readonly onConfigChanged = this._onConfigChanged.event;
    /** Aggregated: fires when any folder's active-session.json changes. */
    readonly onActiveSessionChanged = this._onActiveSessionChanged.event;

    constructor() {
        this.disposables.push(this._onStateChanged, this._onObservationsChanged, this._onConfigChanged, this._onActiveSessionChanged);

        // Watch for workspace folder changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders((e) => {
                for (const added of e.added) {
                    this.addFolder(added);
                }
                for (const removed of e.removed) {
                    this.removeFolder(removed);
                }
            }),
        );

        // Initialize watchers for current workspace folders
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                this.addFolder(folder);
            }
        }
    }

    private addFolder(folder: vscode.WorkspaceFolder): void {
        const key = folder.uri.toString();
        if (this.managers.has(key)) {
            return;
        }

        const manager = new FileWatcherManager(folder);

        // Forward events from the per-folder manager to aggregated emitters
        this.disposables.push(
            manager.onStateChanged((uri) => this._onStateChanged.fire(uri)),
            manager.onObservationsChanged((uri) => this._onObservationsChanged.fire(uri)),
            manager.onConfigChanged((uri) => this._onConfigChanged.fire(uri)),
            manager.onActiveSessionChanged((uri) => this._onActiveSessionChanged.fire(uri)),
        );

        this.managers.set(key, manager);
    }

    private removeFolder(folder: vscode.WorkspaceFolder): void {
        const key = folder.uri.toString();
        const manager = this.managers.get(key);
        if (manager) {
            manager.dispose();
            this.managers.delete(key);
        }
    }

    dispose(): void {
        for (const manager of this.managers.values()) {
            manager.dispose();
        }
        this.managers.clear();

        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
