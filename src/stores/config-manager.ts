import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
    EvalRule,
    EvalDomain,
    EvalSeverity,
    HarnessConfig,
    SentinelConfigFile,
} from '../types/eval-rule.js';

/**
 * Per-folder config tracking state.
 */
interface FolderConfig {
    configPath: string;
    sentinelDir: string;
    config: SentinelConfigFile | undefined;
    rules: EvalRule[];
}

/**
 * Map a YAML domain string to the normalized EvalDomain.
 */
function normalizeDomain(raw: string): EvalDomain {
    const lower = raw.toLowerCase();
    if (lower === 'general') { return 'GEN'; }
    if (lower === 'security') { return 'SEC'; }
    return 'LOCAL';
}

/**
 * Parse the simple YAML eval file format used by sentinel.
 *
 * This is a purpose-built parser for the known eval YAML structure,
 * not a general YAML parser. The format is:
 *
 *   evals:
 *     - id: "GEN-001"
 *       version: 1
 *       domain: "general"
 *       severity: "warning"
 *       rule: |
 *         Multi-line text...
 *       rationale: |
 *         Multi-line text...
 *       examples:
 *         positive:
 *           - "..."
 *         negative:
 *           - "..."
 */
function parseEvalYaml(content: string): Array<{
    id: string;
    version: number;
    domain: string;
    severity: string;
    rule: string;
    rationale: string;
}> {
    const results: Array<{
        id: string;
        version: number;
        domain: string;
        severity: string;
        rule: string;
        rationale: string;
    }> = [];

    const lines = content.split('\n');
    let i = 0;

    // Find the 'evals:' key
    while (i < lines.length && !lines[i].match(/^evals:\s*$/)) {
        i++;
    }
    i++; // skip 'evals:' line

    while (i < lines.length) {
        // Look for '  - id:' to start a new eval entry
        const idMatch = lines[i].match(/^\s+-\s+id:\s*"?([^"]+)"?\s*$/);
        if (!idMatch) {
            i++;
            continue;
        }

        const entry: Record<string, string> = { id: idMatch[1] };
        i++;

        // Parse remaining scalar fields of this entry
        while (i < lines.length) {
            const line = lines[i];

            // Next entry or end of file
            if (line.match(/^\s+-\s+id:/)) { break; }

            // Scalar field: key: value or key: "value"
            const scalarMatch = line.match(/^\s{4,}(\w+):\s*"?([^"|]+)"?\s*$/);
            if (scalarMatch && !['positive', 'negative'].includes(scalarMatch[1])) {
                entry[scalarMatch[1]] = scalarMatch[2].trim();
                i++;
                continue;
            }

            // Block scalar field (key: |)
            const blockMatch = line.match(/^\s{4,}(\w+):\s*\|\s*$/);
            if (blockMatch) {
                const key = blockMatch[1];
                i++;
                const blockLines: string[] = [];
                // Collect indented lines that form the block
                while (i < lines.length) {
                    const blockLine = lines[i];
                    // Empty line within block is allowed
                    if (blockLine.trim() === '') {
                        blockLines.push('');
                        i++;
                        continue;
                    }
                    // Must be more indented than the key (6+ spaces typically)
                    if (blockLine.match(/^\s{6,}/)) {
                        blockLines.push(blockLine.trimStart());
                        i++;
                    } else {
                        break;
                    }
                }
                entry[key] = blockLines.join('\n').trim();
                continue;
            }

            // Skip examples section and other nested content
            if (line.match(/^\s{4,}(examples|positive|negative):/)) {
                i++;
                // Skip nested list items
                while (i < lines.length && (lines[i].match(/^\s{6,}/) || lines[i].trim() === '')) {
                    i++;
                }
                continue;
            }

            i++;
        }

        results.push({
            id: entry.id ?? '',
            version: parseInt(entry.version ?? '1', 10),
            domain: entry.domain ?? 'general',
            severity: entry.severity ?? 'info',
            rule: entry.rule ?? '',
            rationale: entry.rationale ?? '',
        });
    }

    return results;
}

/**
 * ConfigManager reads sentinel configuration and eval YAML files,
 * provides rule metadata, and manages enable/disable state.
 *
 * Follows the same per-folder pattern as ObservationStore and StateManager.
 */
export class ConfigManager implements vscode.Disposable {
    private readonly folders: Map<string, FolderConfig> = new Map();
    private mergedRules: EvalRule[] = [];
    private readonly disposables: vscode.Disposable[] = [];
    private _isWriting = false;

    private readonly _onConfigChanged = new vscode.EventEmitter<void>();
    /** Fires when config or rules change (reload, enable/disable toggle). */
    readonly onConfigChanged: vscode.Event<void> = this._onConfigChanged.event;

    constructor() {
        this.disposables.push(this._onConfigChanged);
    }

    /**
     * Register a workspace folder for config tracking.
     */
    addFolder(folderKey: string, configPath: string, sentinelDir: string): void {
        if (!this.folders.has(folderKey)) {
            this.folders.set(folderKey, {
                configPath,
                sentinelDir,
                config: undefined,
                rules: [],
            });
        }
    }

    /**
     * Remove a workspace folder from tracking.
     */
    removeFolder(folderKey: string): void {
        this.folders.delete(folderKey);
        this.rebuildMergedRules();
    }

    /**
     * Initial load of all registered folders' configs and eval files.
     */
    async load(): Promise<void> {
        for (const [, folder] of this.folders) {
            await this.readConfig(folder);
            await this.readEvalFiles(folder);
        }
        this.rebuildMergedRules();
    }

    /**
     * Incremental update triggered by file watcher.
     */
    async update(uri?: vscode.Uri): Promise<void> {
        if (this._isWriting) { return; }
        if (uri) {
            for (const folder of this.folders.values()) {
                if (uri.fsPath === folder.configPath) {
                    await this.readConfig(folder);
                    await this.readEvalFiles(folder);
                    this.rebuildMergedRules();
                    this._onConfigChanged.fire();
                    return;
                }
            }
        }
        // Fallback: reload everything
        await this.load();
        this._onConfigChanged.fire();
    }

    /**
     * Returns all eval rules across all workspace folders.
     */
    getEvalRules(): EvalRule[] {
        return this.mergedRules;
    }

    /**
     * Toggle a rule's enabled state by writing to sentinel.config.json.
     *
     * Writes a `ruleOverrides` map in the config file. The sentinel CLI
     * reads this to skip disabled rules.
     */
    async setEvalEnabled(evalId: string, enabled: boolean): Promise<void> {
        // Find which folder owns this rule
        for (const folder of this.folders.values()) {
            const rule = folder.rules.find((r) => r.id === evalId);
            if (!rule || !folder.config) { continue; }

            // Update local state
            rule.enabled = enabled;

            // Update the config's ruleOverrides
            if (!folder.config.ruleOverrides) {
                folder.config.ruleOverrides = {};
            }

            if (enabled) {
                // Remove the override — default is enabled
                delete folder.config.ruleOverrides[evalId];
                // Clean up empty overrides object
                if (Object.keys(folder.config.ruleOverrides).length === 0) {
                    delete folder.config.ruleOverrides;
                }
            } else {
                folder.config.ruleOverrides[evalId] = { enabled: false };
            }

            // Write back to disk
            try {
                this._isWriting = true;
                const json = JSON.stringify(folder.config, null, 2) + '\n';
                await fs.writeFile(folder.configPath, json, 'utf-8');
                setTimeout(() => { this._isWriting = false; }, 200);
            } catch (err) {
                this._isWriting = false;
                console.error(`[ConfigManager] Failed to write config: ${err}`);
                vscode.window.showErrorMessage(`Failed to update sentinel config: ${err}`);
            }

            this.rebuildMergedRules();
            this._onConfigChanged.fire();
            return;
        }
    }

    /**
     * Read and parse sentinel.config.json for a folder.
     */
    private async readConfig(folder: FolderConfig): Promise<void> {
        try {
            const raw = await fs.readFile(folder.configPath, 'utf-8');
            folder.config = JSON.parse(raw) as SentinelConfigFile;
        } catch {
            folder.config = undefined;
        }
    }

    /**
     * Read eval YAML files referenced by the config's sentinel entries.
     */
    private async readEvalFiles(folder: FolderConfig): Promise<void> {
        folder.rules = [];

        if (!folder.config?.sentinels) { return; }

        for (const sentinel of folder.config.sentinels) {
            if (!sentinel.evalSet) { continue; }

            const evalPath = path.join(folder.sentinelDir, sentinel.evalSet);
            try {
                const content = await fs.readFile(evalPath, 'utf-8');
                const parsed = parseEvalYaml(content);

                for (const entry of parsed) {
                    const domain = normalizeDomain(entry.domain);
                    const isEnabled = this.isRuleEnabled(folder, entry.id, sentinel.enabled);

                    folder.rules.push({
                        id: entry.id,
                        version: entry.version,
                        domainRaw: entry.domain,
                        domain,
                        severity: entry.severity as EvalSeverity,
                        rule: entry.rule,
                        rationale: entry.rationale,
                        enabled: isEnabled,
                    });
                }
            } catch (err) {
                console.warn(`[ConfigManager] Could not read eval file ${evalPath}: ${err}`);
            }
        }
    }

    /**
     * Determine if a rule is enabled, checking ruleOverrides first,
     * then the sentinel-level enabled flag.
     */
    private isRuleEnabled(folder: FolderConfig, evalId: string, sentinelEnabled: boolean): boolean {
        const override = folder.config?.ruleOverrides?.[evalId];
        if (override !== undefined) {
            return override.enabled;
        }
        return sentinelEnabled;
    }

    /**
     * Rebuild the merged rules list from all folders.
     */
    private rebuildMergedRules(): void {
        this.mergedRules = [];
        for (const folder of this.folders.values()) {
            this.mergedRules.push(...folder.rules);
        }
    }

    /**
     * Returns the base defaults from the first workspace folder's config.
     * Used as tier-3 (lowest priority) in harness config resolution.
     */
    getBaseDefaults(): { model: string; evalSet: string } {
        for (const folder of this.folders.values()) {
            if (folder.config?.defaults) {
                return {
                    model: folder.config.defaults.model ?? '',
                    evalSet: '',
                };
            }
        }
        return { model: '', evalSet: '' };
    }

    /**
     * Read per-harness overrides from sentinel.config.json (tier-2).
     * Returns undefined if no overrides exist for this harness.
     */
    getHarnessConfig(harnessName: string): HarnessConfig | undefined {
        for (const folder of this.folders.values()) {
            if (folder.config?.harnessOverrides) {
                return folder.config.harnessOverrides[harnessName];
            }
        }
        return undefined;
    }

    /**
     * Write per-harness overrides to sentinel.config.json.
     * Merges with any existing overrides for the harness.
     */
    async setHarnessConfig(harnessName: string, config: Partial<HarnessConfig>): Promise<void> {
        // Write to the first folder that has a config
        for (const folder of this.folders.values()) {
            if (!folder.config) { continue; }

            if (!folder.config.harnessOverrides) {
                folder.config.harnessOverrides = {};
            }

            const existing = folder.config.harnessOverrides[harnessName] ?? {};
            folder.config.harnessOverrides[harnessName] = { ...existing, ...config };

            // Clean up undefined/empty values
            const merged = folder.config.harnessOverrides[harnessName];
            if (merged) {
                for (const [key, value] of Object.entries(merged)) {
                    if (value === undefined || value === '') {
                        delete (merged as Record<string, unknown>)[key];
                    }
                }
                if (Object.keys(merged).length === 0) {
                    delete folder.config.harnessOverrides[harnessName];
                }
            }

            // Clean up empty harnessOverrides
            if (Object.keys(folder.config.harnessOverrides).length === 0) {
                delete folder.config.harnessOverrides;
            }

            try {
                this._isWriting = true;
                const json = JSON.stringify(folder.config, null, 2) + '\n';
                await fs.writeFile(folder.configPath, json, 'utf-8');
                setTimeout(() => { this._isWriting = false; }, 200);
            } catch (err) {
                this._isWriting = false;
                console.error(`[ConfigManager] Failed to write harness config: ${err}`);
                vscode.window.showErrorMessage(`Failed to update harness config: ${err}`);
            }

            this._onConfigChanged.fire();
            return;
        }
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.folders.clear();
        this.mergedRules = [];
    }
}
