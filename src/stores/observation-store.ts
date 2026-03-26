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

export class ObservationStore implements vscode.Disposable {
    private observations: Map<string, PersistentObservation[]> = new Map();
    private readonly folders: Map<string, FolderState> = new Map();
    private readonly maxObservations: number;

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
     * Remove all observations for a given session.
     */
    clearSession(sessionId: string): void {
        this.observations.delete(sessionId);
    }

    dispose(): void {
        this._onObservationReceived.dispose();
        this.observations.clear();
        this.folders.clear();
    }
}
