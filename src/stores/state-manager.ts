import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/**
 * Shape of a single session entry in sentinel-state.json.
 */
export interface SessionState {
    session_id: string;
    transcript_path: string;
    title?: string;
    started_at?: string;
}

/**
 * Top-level shape of sentinel-state.json.
 */
interface SentinelState {
    sessions: SessionState[];
}

/**
 * StateManager reads and parses .volition/sentinel/sentinel-state.json
 * from all workspace folders, merges sessions, and emits events when sessions change.
 */
export class StateManager implements vscode.Disposable {
    private sessions: Map<string, SessionState> = new Map();
    /** Per-folder session sets for targeted updates. */
    private readonly folderSessions: Map<string, Map<string, SessionState>> = new Map();
    /** Folder key -> state file path. */
    private readonly folderPaths: Map<string, string> = new Map();
    private readonly disposables: vscode.Disposable[] = [];

    private readonly _onSessionsChanged = new vscode.EventEmitter<string[]>();
    /** Fires when sessions are added or removed. Payload is the current session ID list. */
    readonly onSessionsChanged: vscode.Event<string[]> = this._onSessionsChanged.event;

    constructor() {
        this.disposables.push(this._onSessionsChanged);
    }

    /**
     * Register a workspace folder's state file for tracking.
     */
    addFolder(folderKey: string, stateFilePath: string): void {
        if (!this.folderPaths.has(folderKey)) {
            this.folderPaths.set(folderKey, stateFilePath);
            this.folderSessions.set(folderKey, new Map());
        }
    }

    /**
     * Remove a workspace folder from tracking.
     */
    removeFolder(folderKey: string): void {
        this.folderPaths.delete(folderKey);
        this.folderSessions.delete(folderKey);
        this.rebuildMergedSessions();
    }

    /**
     * Resolve the folder key from a URI (the folder whose state file changed).
     */
    private folderKeyFromUri(uri: vscode.Uri): string | undefined {
        for (const [key, filePath] of this.folderPaths) {
            if (uri.fsPath === filePath) {
                return key;
            }
        }
        return undefined;
    }

    /**
     * Initial load of all registered folders' state files.
     */
    async load(): Promise<void> {
        for (const [key, filePath] of this.folderPaths) {
            await this.readStateFile(key, filePath);
        }
        this.rebuildMergedSessions();
    }

    /**
     * Incremental update — called by file watcher on change.
     * If a URI is provided, only the matching folder is re-read.
     */
    async update(uri?: vscode.Uri): Promise<void> {
        const previousIds = new Set(this.sessions.keys());

        if (uri) {
            const key = this.folderKeyFromUri(uri);
            if (key) {
                const filePath = this.folderPaths.get(key)!;
                await this.readStateFile(key, filePath);
            }
        } else {
            // Re-read all folders
            for (const [key, filePath] of this.folderPaths) {
                await this.readStateFile(key, filePath);
            }
        }

        this.rebuildMergedSessions();

        const currentIds = new Set(this.sessions.keys());

        // Detect additions or removals
        let changed = previousIds.size !== currentIds.size;
        if (!changed) {
            for (const id of currentIds) {
                if (!previousIds.has(id)) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this._onSessionsChanged.fire([...currentIds]);
        }
    }

    /**
     * Returns all known session IDs.
     */
    getSessionIds(): string[] {
        return [...this.sessions.keys()];
    }

    /**
     * Returns the transcript JSONL path for a given session, or undefined.
     */
    getTranscriptPath(sessionId: string): string | undefined {
        return this.sessions.get(sessionId)?.transcript_path;
    }

    /**
     * Returns full session state for a given session, or undefined.
     */
    getSession(sessionId: string): SessionState | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Returns all session states.
     */
    getAllSessions(): SessionState[] {
        return [...this.sessions.values()];
    }

    private async readStateFile(folderKey: string, filePath: string): Promise<void> {
        const folderMap = this.folderSessions.get(folderKey);
        if (!folderMap) {
            return;
        }
        folderMap.clear();

        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const state = JSON.parse(raw) as SentinelState;

            if (Array.isArray(state.sessions)) {
                for (const s of state.sessions) {
                    if (s.session_id) {
                        folderMap.set(s.session_id, s);
                    }
                }
            }
        } catch {
            // File may not exist yet or be malformed — not fatal
            console.warn(`[StateManager] Could not read state file: ${filePath}`);
        }
    }

    /**
     * Rebuild the merged sessions map from all folder session maps.
     */
    private rebuildMergedSessions(): void {
        this.sessions.clear();
        for (const folderMap of this.folderSessions.values()) {
            for (const [id, session] of folderMap) {
                this.sessions.set(id, session);
            }
        }
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.sessions.clear();
        this.folderSessions.clear();
        this.folderPaths.clear();
    }
}
