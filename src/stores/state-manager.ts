import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { LocalEval } from '../types/eval-rule.js';

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
 * A sentinel session descriptor with enough info to identify and open it.
 */
export interface SentinelSessionInfo {
    /** The sentinel domain name, e.g. "GEN", "SEC" */
    name: string;
    /** The sentinel's own Claude Code session ID */
    sentinelSessionId: string;
    /** The parent (monitored) session ID */
    parentSessionId: string;
    /** When the sentinel started */
    startedAt?: string;
    /** When the sentinel last fired or checked */
    lastCheckedAt?: string;
}

/**
 * Shape of a sentinel entry within a session in sentinel-state.json.
 */
interface SentinelEntry {
    sentinel_session_id?: string;
    started_at?: string;
    extractions?: {
        local_evals?: RawLocalEval[];
    };
    [key: string]: unknown;
}

/**
 * Raw local eval as it appears in sentinel state JSON.
 */
interface RawLocalEval {
    id?: string;
    severity?: string;
    rule?: string;
    rationale?: string;
    created_at?: string;
}

/**
 * Top-level shape of sentinel-state.json.
 * The real format uses session IDs as keys in a sessions object.
 */
interface SentinelState {
    sessions: Record<string, {
        transcript_path?: string;
        title?: string;
        started_at?: string;
        sentinels?: Record<string, SentinelEntry>;
        [key: string]: unknown;
    }> | SessionState[];
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

    /** All known local evals, keyed by "id|created_at" for dedup. */
    private readonly localEvals: Map<string, LocalEval> = new Map();

    /** All known sentinel sessions, keyed by sentinel_session_id for dedup. */
    private readonly sentinelSessions: Map<string, SentinelSessionInfo> = new Map();

    private readonly _onSessionsChanged = new vscode.EventEmitter<string[]>();
    /** Fires when sessions are added or removed. Payload is the current session ID list. */
    readonly onSessionsChanged: vscode.Event<string[]> = this._onSessionsChanged.event;

    private readonly _onDynamicEvalCreated = new vscode.EventEmitter<LocalEval>();
    /** Fires when a new dynamic/local eval is detected from sentinel state. */
    readonly onDynamicEvalCreated: vscode.Event<LocalEval> = this._onDynamicEvalCreated.event;

    private readonly _onLocalEvalsChanged = new vscode.EventEmitter<void>();
    /** Fires when the local evals set changes (additions). */
    readonly onLocalEvalsChanged: vscode.Event<void> = this._onLocalEvalsChanged.event;

    constructor() {
        this.disposables.push(this._onSessionsChanged);
        this.disposables.push(this._onDynamicEvalCreated);
        this.disposables.push(this._onLocalEvalsChanged);
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

    /**
     * Returns all known local/dynamic evals from sentinel state.
     */
    getLocalEvals(): LocalEval[] {
        return [...this.localEvals.values()];
    }

    /**
     * Returns all active sentinel sessions across all tracked folders.
     * Each entry includes the sentinel domain name (GEN, SEC, etc.),
     * its own session ID, and the parent session it monitors.
     */
    getSentinelSessions(): SentinelSessionInfo[] {
        const STALENESS_MS = 24 * 60 * 60 * 1000; // 24 hours
        const now = Date.now();
        return [...this.sentinelSessions.values()].filter(s => {
            const lastActive = s.lastCheckedAt ?? s.startedAt;
            if (!lastActive) return false;
            return (now - new Date(lastActive).getTime()) < STALENESS_MS;
        });
    }

    private async readStateFile(folderKey: string, filePath: string): Promise<void> {
        const folderMap = this.folderSessions.get(folderKey);
        if (!folderMap) {
            return;
        }
        folderMap.clear();

        // Clear sentinel sessions for this folder before re-reading.
        // Remove entries whose parentSessionId belongs to this folder.
        for (const [key, info] of this.sentinelSessions) {
            if (folderMap.has(info.parentSessionId)) {
                this.sentinelSessions.delete(key);
            }
        }

        try {
            const raw = await fs.readFile(filePath, 'utf-8');
            const state = JSON.parse(raw) as SentinelState;

            if (Array.isArray(state.sessions)) {
                // Legacy array format
                for (const s of state.sessions) {
                    if (s.session_id) {
                        folderMap.set(s.session_id, s);
                    }
                }
            } else if (state.sessions && typeof state.sessions === 'object') {
                // Object format: session IDs are keys
                for (const [sessionId, sessionData] of Object.entries(state.sessions)) {
                    folderMap.set(sessionId, {
                        session_id: sessionId,
                        transcript_path: sessionData.transcript_path ?? '',
                        started_at: sessionData.started_at,
                        title: typeof sessionData.title === 'string' ? sessionData.title : undefined,
                    });

                    // Extract sentinel session info and local evals
                    if (sessionData.sentinels) {
                        this.extractSentinelSessions(sessionId, sessionData.sentinels);
                        this.extractLocalEvals(sessionId, sessionData.sentinels);
                    }
                }
            }
        } catch {
            // File may not exist yet or be malformed — not fatal
            console.warn(`[StateManager] Could not read state file: ${filePath}`);
        }
    }

    /**
     * Extract sentinel session descriptors from sentinel entries within a session.
     */
    private extractSentinelSessions(
        parentSessionId: string,
        sentinels: Record<string, SentinelEntry>,
    ): void {
        for (const [sentinelName, sentinel] of Object.entries(sentinels)) {
            if (!sentinel.sentinel_session_id) { continue; }

            this.sentinelSessions.set(sentinel.sentinel_session_id, {
                name: sentinelName,
                sentinelSessionId: sentinel.sentinel_session_id,
                parentSessionId,
                startedAt: sentinel.started_at,
                lastCheckedAt: (sentinel.last_checked_at as string) ?? (sentinel.last_fired_at as string) ?? sentinel.started_at,
            });
        }
    }

    /**
     * Extract local evals from sentinel entries within a session.
     * Detects NEW evals and fires events for them.
     */
    private extractLocalEvals(
        sessionId: string,
        sentinels: Record<string, SentinelEntry>,
    ): void {
        let anyNew = false;

        for (const [sentinelName, sentinel] of Object.entries(sentinels)) {
            const rawEvals = sentinel.extractions?.local_evals;
            if (!rawEvals || !Array.isArray(rawEvals)) { continue; }

            for (const raw of rawEvals) {
                if (!raw.id || !raw.created_at) { continue; }

                const dedupKey = `${raw.id}|${raw.created_at}`;
                if (this.localEvals.has(dedupKey)) { continue; }

                const localEval: LocalEval = {
                    id: raw.id,
                    severity: (raw.severity as LocalEval['severity']) ?? 'info',
                    rule: raw.rule ?? '',
                    rationale: raw.rationale ?? '',
                    created_at: raw.created_at,
                    session_id: sessionId,
                    sentinel_name: sentinelName,
                };

                this.localEvals.set(dedupKey, localEval);
                anyNew = true;
                this._onDynamicEvalCreated.fire(localEval);
            }
        }

        if (anyNew) {
            this._onLocalEvalsChanged.fire();
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
        this.localEvals.clear();
        this.sentinelSessions.clear();
    }
}
