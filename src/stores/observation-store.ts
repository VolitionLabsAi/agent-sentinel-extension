import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { PersistentObservation } from '../types/observation';

export interface ObservationFilter {
    sessionId?: string;
    severity?: string;
    since?: string;
    evalId?: string;
}

/**
 * Per-folder tracking state for incremental reads.
 */
interface FolderState {
    filePath: string;
    byteOffset: number;
}

/**
 * Per-session history tracking — how many total observations exist vs. what's in memory.
 */
interface SessionHistoryState {
    /** Total observations ever seen for this session (including evicted). */
    totalCount: number;
}

/**
 * Cached result from a historical disk read — expires after a short TTL.
 */
interface HistoryCache {
    observations: PersistentObservation[];
    timestamp: number;
}

/** How long (ms) to cache historical disk reads to avoid re-reading on rapid scrolling. */
const HISTORY_CACHE_TTL_MS = 5000;

export class ObservationStore implements vscode.Disposable {
    private observations: Map<string, PersistentObservation[]> = new Map();
    private readonly folders: Map<string, FolderState> = new Map();
    private readonly maxObservations: number;

    /** Tracks total observation count per session so we know when disk has more. */
    private readonly sessionHistory: Map<string, SessionHistoryState> = new Map();

    /** Brief cache for disk reads keyed by `${sessionId}:${beforeIndex}:${limit}`. */
    private readonly historyCache: Map<string, HistoryCache> = new Map();

    private readonly _onObservationReceived = new vscode.EventEmitter<PersistentObservation>();
    public readonly onObservationReceived: vscode.Event<PersistentObservation> = this._onObservationReceived.event;

    constructor(maxObservations: number = 1000) {
        this.maxObservations = maxObservations;
    }

    /**
     * Register a workspace folder's observations file for tracking.
     */
    addFolder(folderKey: string, observationsPath: string): void {
        if (!this.folders.has(folderKey)) {
            this.folders.set(folderKey, { filePath: observationsPath, byteOffset: 0 });
        }
    }

    /**
     * Remove a workspace folder from tracking.
     */
    removeFolder(folderKey: string): void {
        this.folders.delete(folderKey);
    }

    /**
     * Resolve the folder key from a URI (the folder whose sentinel file changed).
     */
    private folderKeyFromUri(uri: vscode.Uri): string | undefined {
        for (const [key, state] of this.folders) {
            if (uri.fsPath === state.filePath) {
                return key;
            }
        }
        return undefined;
    }

    /**
     * Initial load: reads all registered folders' JSONL files.
     */
    async load(): Promise<void> {
        this.observations.clear();
        this.sessionHistory.clear();
        this.historyCache.clear();
        for (const state of this.folders.values()) {
            state.byteOffset = 0;
        }
        for (const [, state] of this.folders) {
            await this.readNewLines(state);
        }
    }

    /**
     * Incremental update for a specific folder, identified by the changed file URI.
     * Falls back to updating all folders if URI doesn't match a known folder.
     */
    async update(uri?: vscode.Uri): Promise<void> {
        if (uri) {
            const key = this.folderKeyFromUri(uri);
            if (key) {
                const state = this.folders.get(key)!;
                await this.updateFolder(state);
                return;
            }
        }
        // Fallback: update all folders
        for (const state of this.folders.values()) {
            await this.updateFolder(state);
        }
    }

    private async updateFolder(folderState: FolderState): Promise<void> {
        let stat: Awaited<ReturnType<typeof fs.stat>>;
        try {
            stat = await fs.stat(folderState.filePath);
        } catch {
            // File may have been deleted; nothing to do
            return;
        }

        if (stat.size < folderState.byteOffset) {
            // Truncation detected — full re-read for this folder
            folderState.byteOffset = 0;
            this.sessionHistory.clear();
            this.historyCache.clear();
            await this.readNewLines(folderState);
            return;
        }

        if (stat.size === folderState.byteOffset) {
            // No new data
            return;
        }

        await this.readNewLines(folderState);
    }

    /**
     * Read new lines from the current byte offset to EOF for a specific folder.
     */
    private async readNewLines(folderState: FolderState): Promise<void> {
        let fileHandle: fs.FileHandle | undefined;
        try {
            fileHandle = await fs.open(folderState.filePath, 'r');
            const stat = await fileHandle.stat();
            const bytesToRead = stat.size - folderState.byteOffset;
            if (bytesToRead <= 0) {
                return;
            }

            const buffer = Buffer.alloc(bytesToRead);
            const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, folderState.byteOffset);
            folderState.byteOffset += bytesRead;

            const chunk = buffer.toString('utf-8', 0, bytesRead);
            const lines = chunk.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length === 0) {
                    continue;
                }
                try {
                    const obs = JSON.parse(trimmed) as PersistentObservation;
                    this.addObservation(obs);
                    this._onObservationReceived.fire(obs);
                } catch {
                    console.warn(`[ObservationStore] Skipping malformed line: ${trimmed.substring(0, 100)}`);
                }
            }
        } catch (err) {
            // File doesn't exist yet or other read error — not fatal
            console.warn(`[ObservationStore] Error reading file: ${err}`);
        } finally {
            await fileHandle?.close();
        }
    }

    /**
     * Add an observation to the bounded per-session cache.
     */
    private addObservation(obs: PersistentObservation): void {
        const sessionId = obs.session_id;
        let sessionObs = this.observations.get(sessionId);
        if (!sessionObs) {
            sessionObs = [];
            this.observations.set(sessionId, sessionObs);
        }
        sessionObs.push(obs);

        // Track total count (including observations that will be evicted)
        let histState = this.sessionHistory.get(sessionId);
        if (!histState) {
            histState = { totalCount: 0 };
            this.sessionHistory.set(sessionId, histState);
        }
        histState.totalCount++;

        // Evict oldest if over the limit for this session
        if (sessionObs.length > this.maxObservations) {
            sessionObs.splice(0, sessionObs.length - this.maxObservations);
        }
    }

    /**
     * Query observations with optional filters.
     */
    getObservations(filter?: ObservationFilter): PersistentObservation[] {
        let results: PersistentObservation[];

        if (filter?.sessionId) {
            results = [...(this.observations.get(filter.sessionId) ?? [])];
        } else {
            results = [];
            for (const sessionObs of this.observations.values()) {
                results.push(...sessionObs);
            }
        }

        if (filter?.severity) {
            results = results.filter(o => o.severity === filter.severity);
        }

        if (filter?.evalId) {
            results = results.filter(o => o.eval_id === filter.evalId);
        }

        if (filter?.since) {
            const sinceTime = new Date(filter.since).getTime();
            results = results.filter(o => new Date(o.timestamp).getTime() >= sinceTime);
        }

        return results;
    }

    /**
     * Returns true if there are observations on disk beyond what's in memory for this session.
     */
    hasMoreHistory(sessionId: string): boolean {
        const inMemory = this.observations.get(sessionId)?.length ?? 0;
        const total = this.sessionHistory.get(sessionId)?.totalCount ?? 0;
        return total > inMemory;
    }

    /**
     * Load historical observations from disk for a session, beyond the in-memory cache.
     *
     * @param sessionId - The session to load history for
     * @param beforeIndex - Load observations older than this index in the full session history
     *                      (0-based from oldest). Pass the current oldest in-memory index.
     * @param limit - Maximum number of observations to return
     * @returns Observations in reverse chronological order (newest of the historical batch first)
     */
    async getHistoricalObservations(
        sessionId: string,
        beforeIndex: number,
        limit: number = 100,
    ): Promise<PersistentObservation[]> {
        // Check brief cache first
        const cacheKey = `${sessionId}:${beforeIndex}:${limit}`;
        const cached = this.historyCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < HISTORY_CACHE_TTL_MS) {
            return cached.observations;
        }

        // Read all observations for this session from all JSONL files on disk
        const allFromDisk = await this.readAllFromDisk(sessionId);

        // allFromDisk is in chronological order (oldest first, as written to JSONL).
        // We want observations with index < beforeIndex, newest first.
        const endIndex = Math.min(beforeIndex, allFromDisk.length);
        const startIndex = Math.max(0, endIndex - limit);
        const slice = allFromDisk.slice(startIndex, endIndex);
        slice.reverse(); // newest of the batch first

        // Cache the result
        this.historyCache.set(cacheKey, { observations: slice, timestamp: Date.now() });

        return slice;
    }

    /**
     * Get the index of the oldest observation currently in memory for a session.
     * This is the boundary where historical disk reads should start.
     *
     * Returns the total count minus the in-memory count — i.e., how many
     * observations were evicted and only exist on disk.
     */
    getOldestInMemoryIndex(sessionId: string): number {
        const total = this.sessionHistory.get(sessionId)?.totalCount ?? 0;
        const inMemory = this.observations.get(sessionId)?.length ?? 0;
        return total - inMemory;
    }

    /**
     * Read ALL observations for a given session from disk across all tracked folders.
     * Returns in chronological order (oldest first).
     */
    private async readAllFromDisk(sessionId: string): Promise<PersistentObservation[]> {
        const results: PersistentObservation[] = [];

        for (const state of this.folders.values()) {
            let fileHandle: fs.FileHandle | undefined;
            try {
                fileHandle = await fs.open(state.filePath, 'r');
                const stat = await fileHandle.stat();
                if (stat.size === 0) {
                    continue;
                }

                // Read in chunks to keep memory bounded
                const CHUNK_SIZE = 256 * 1024; // 256KB
                let offset = 0;
                let remainder = '';

                while (offset < stat.size) {
                    const bytesToRead = Math.min(CHUNK_SIZE, stat.size - offset);
                    const buffer = Buffer.alloc(bytesToRead);
                    const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, offset);
                    offset += bytesRead;

                    const chunk = remainder + buffer.toString('utf-8', 0, bytesRead);
                    const lines = chunk.split('\n');

                    // Last element may be incomplete if we're mid-file
                    remainder = offset < stat.size ? (lines.pop() ?? '') : '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.length === 0) {
                            continue;
                        }
                        try {
                            const obs = JSON.parse(trimmed) as PersistentObservation;
                            if (obs.session_id === sessionId) {
                                results.push(obs);
                            }
                        } catch {
                            // Skip malformed lines
                        }
                    }
                }

                // Handle any trailing remainder
                if (remainder.trim().length > 0) {
                    try {
                        const obs = JSON.parse(remainder.trim()) as PersistentObservation;
                        if (obs.session_id === sessionId) {
                            results.push(obs);
                        }
                    } catch {
                        // Skip malformed trailing data
                    }
                }
            } catch {
                // File doesn't exist or read error — skip this folder
            } finally {
                await fileHandle?.close();
            }
        }

        return results;
    }

    /**
     * Remove all observations for a given session.
     */
    clearSession(sessionId: string): void {
        this.observations.delete(sessionId);
        this.sessionHistory.delete(sessionId);
        // Invalidate any cached history for this session
        for (const key of this.historyCache.keys()) {
            if (key.startsWith(`${sessionId}:`)) {
                this.historyCache.delete(key);
            }
        }
    }

    dispose(): void {
        this._onObservationReceived.dispose();
        this.observations.clear();
        this.folders.clear();
        this.sessionHistory.clear();
        this.historyCache.clear();
    }
}
