import * as vscode from 'vscode';
import { Debouncer } from '../utils/debouncer.js';

/**
 * Manages file system watchers for sentinel files within a single workspace folder.
 *
 * Watches:
 *  - .volition/sentinel/sentinel-state.json   (150ms debounce)
 *  - .volition/sentinel/sentinel-observations.jsonl (50ms debounce)
 *  - .volition/sentinel/sentinel.config.json   (no debounce)
 */
export class FileWatcherManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    private readonly _onStateChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onObservationsChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onConfigChanged = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onActiveSessionChanged = new vscode.EventEmitter<vscode.Uri>();

    /** Fires when sentinel-state.json changes (debounced 150ms). */
    readonly onStateChanged = this._onStateChanged.event;
    /** Fires when sentinel-observations.jsonl changes (debounced 50ms). */
    readonly onObservationsChanged = this._onObservationsChanged.event;
    /** Fires when sentinel.config.json changes (immediate). */
    readonly onConfigChanged = this._onConfigChanged.event;
    /** Fires when active-session.json changes (immediate). */
    readonly onActiveSessionChanged = this._onActiveSessionChanged.event;

    constructor(readonly folder: vscode.WorkspaceFolder) {
        this.disposables.push(this._onStateChanged, this._onObservationsChanged, this._onConfigChanged, this._onActiveSessionChanged);

        this.createDebouncedWatcher(
            folder,
            '.volition/sentinel/sentinel-state.json',
            150,
            this._onStateChanged,
        );

        this.createDebouncedWatcher(
            folder,
            '.volition/sentinel/sentinel-observations.jsonl',
            50,
            this._onObservationsChanged,
        );

        // Config watcher — no debounce, fire immediately
        this.createWatcher(
            folder,
            '.volition/sentinel/sentinel.config.json',
            (uri) => this._onConfigChanged.fire(uri),
        );

        // Active session watcher — no debounce, fire immediately
        this.createWatcher(
            folder,
            '.volition/sentinel/active-session.json',
            (uri) => this._onActiveSessionChanged.fire(uri),
        );
    }

    /**
     * Create a file system watcher that fires immediately via the provided handler.
     */
    private createWatcher(
        folder: vscode.WorkspaceFolder,
        relativePath: string,
        handler: (uri: vscode.Uri) => void,
    ): void {
        const pattern = new vscode.RelativePattern(folder, relativePath);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate(handler, undefined, this.disposables);
        watcher.onDidChange(handler, undefined, this.disposables);
        // Treat deletion as a change so consumers can react to missing files
        watcher.onDidDelete(handler, undefined, this.disposables);

        this.disposables.push(watcher);
    }

    /**
     * Create a debounced file system watcher. Rapid changes within `delayMs`
     * are coalesced into a single event emission.
     */
    private createDebouncedWatcher(
        folder: vscode.WorkspaceFolder,
        relativePath: string,
        delayMs: number,
        emitter: vscode.EventEmitter<vscode.Uri>,
    ): void {
        const pattern = new vscode.RelativePattern(folder, relativePath);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Store the most recent URI so the debounced callback can emit it
        let latestUri: vscode.Uri | undefined;

        const debouncer = new Debouncer(() => {
            if (latestUri) {
                emitter.fire(latestUri);
            }
        }, delayMs);

        const handler = (uri: vscode.Uri): void => {
            latestUri = uri;
            debouncer.trigger();
        };

        watcher.onDidCreate(handler, undefined, this.disposables);
        watcher.onDidChange(handler, undefined, this.disposables);
        watcher.onDidDelete(handler, undefined, this.disposables);

        this.disposables.push(debouncer, watcher);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }
}
