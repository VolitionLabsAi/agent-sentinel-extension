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
 * StateManager reads and parses .volition/sentinel/sentinel-state.json,
 * tracks the session list, and emits events when sessions change.
 */
export class StateManager implements vscode.Disposable {
    private sessions: Map<string, SessionState> = new Map();
    private readonly disposables: vscode.Disposable[] = [];

    private readonly _onSessionsChanged = new vscode.EventEmitter<string[]>();
    /** Fires when sessions are added or removed. Payload is the current session ID list. */
    readonly onSessionsChanged: vscode.Event<string[]> = this._onSessionsChanged.event;

    constructor(private readonly stateFilePath: string) {
        this.disposables.push(this._onSessionsChanged);
    }

    /**
     * Initial load of the state file.
     */
    async load(): Promise<void> {
        await this.readStateFile();
    }

    /**
     * Incremental update — called by file watcher on change.
     */
    async update(): Promise<void> {
        const previousIds = new Set(this.sessions.keys());
        await this.readStateFile();
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

    private async readStateFile(): Promise<void> {
        try {
            const raw = await fs.readFile(this.stateFilePath, 'utf-8');
            const state = JSON.parse(raw) as SentinelState;

            this.sessions.clear();
            if (Array.isArray(state.sessions)) {
                for (const s of state.sessions) {
                    if (s.session_id) {
                        this.sessions.set(s.session_id, s);
                    }
                }
            }
        } catch {
            // File may not exist yet or be malformed — not fatal
            console.warn(`[StateManager] Could not read state file: ${this.stateFilePath}`);
        }
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.sessions.clear();
    }
}
