import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { PersistentObservation } from '../types/observation';

export interface ObservationFilter {
    sessionId?: string;
    severity?: string;
    since?: string;
    evalId?: string;
}

export class ObservationStore implements vscode.Disposable {
    private observations: Map<string, PersistentObservation[]> = new Map();
    private byteOffset: number = 0;
    private readonly maxObservations: number;
    private readonly filePath: string;

    private readonly _onObservationReceived = new vscode.EventEmitter<PersistentObservation>();
    public readonly onObservationReceived: vscode.Event<PersistentObservation> = this._onObservationReceived.event;

    constructor(filePath: string, maxObservations: number = 1000) {
        this.filePath = filePath;
        this.maxObservations = maxObservations;
    }

    /**
     * Initial load: reads the entire JSONL file and populates the cache.
     */
    async load(): Promise<void> {
        this.observations.clear();
        this.byteOffset = 0;
        await this.readNewLines();
    }

    /**
     * Incremental update: called by file watcher on change.
     * Detects truncation and re-reads if needed.
     */
    async update(): Promise<void> {
        let stat: Awaited<ReturnType<typeof fs.stat>>;
        try {
            stat = await fs.stat(this.filePath);
        } catch {
            // File may have been deleted; nothing to do
            return;
        }

        if (stat.size < this.byteOffset) {
            // Truncation detected — full re-read
            await this.load();
            return;
        }

        if (stat.size === this.byteOffset) {
            // No new data
            return;
        }

        await this.readNewLines();
    }

    /**
     * Read new lines from the current byte offset to EOF.
     */
    private async readNewLines(): Promise<void> {
        let fileHandle: fs.FileHandle | undefined;
        try {
            fileHandle = await fs.open(this.filePath, 'r');
            const stat = await fileHandle.stat();
            const bytesToRead = stat.size - this.byteOffset;
            if (bytesToRead <= 0) {
                return;
            }

            const buffer = Buffer.alloc(bytesToRead);
            const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, this.byteOffset);
            this.byteOffset += bytesRead;

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
    }
}
