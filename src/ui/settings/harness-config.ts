import * as vscode from 'vscode';
import { ConfigManager } from '../../stores/config-manager.js';
import { HarnessAdapterRegistry } from '../../adapters/adapter-registry.js';
import type { HarnessConfig } from '../../types/eval-rule.js';

/**
 * Which configuration tier a resolved value came from.
 */
export type ConfigTier = 'base' | 'harness-override' | 'vscode-setting';

/**
 * A resolved configuration value with provenance tracking.
 */
export interface ResolvedField<T> {
    value: T;
    tier: ConfigTier;
}

/**
 * Fully resolved configuration for a specific harness,
 * with provenance information for each field.
 */
export interface ResolvedConfig {
    model: ResolvedField<string>;
    evalSet: ResolvedField<string>;
}

/**
 * Information about a harness for UI display.
 */
export interface HarnessInfo {
    /** Internal name matching the adapter registry key */
    name: string;
    /** Setting-friendly identifier (lowercase, hyphenated) */
    settingId: string;
    /** Whether the harness extension is currently available */
    isAvailable: boolean;
    /** Whether the harness extension is installed */
    isInstalled: boolean;
}

/**
 * Maps adapter display names to setting-friendly identifiers.
 * These match the enum values in the sentinel.harness.default setting.
 */
const SETTING_ID_MAP: Record<string, string> = {
    'Claude Code': 'claude-code',
    'GitHub Copilot': 'copilot',
    'Codex CLI': 'codex',
    'Gemini CLI': 'gemini-cli',
};

/**
 * Reads the three-tier harness configuration and resolves
 * the effective config for a given harness.
 *
 * Tier resolution order (highest priority wins):
 *   1. VS Code settings (sentinel.harness.overrides)
 *   2. Per-harness overrides in sentinel.config.json (harnessOverrides)
 *   3. Base config from sentinel.config.json (defaults)
 */
export class HarnessConfigResolver {
    constructor(
        private readonly configManager: ConfigManager,
        private readonly adapterRegistry: HarnessAdapterRegistry,
    ) {}

    /**
     * Resolve the effective configuration for a harness,
     * with provenance tracking for each field.
     */
    resolveHarnessConfig(harnessName: string): ResolvedConfig {
        const settingId = SETTING_ID_MAP[harnessName] ?? harnessName.toLowerCase().replace(/\s+/g, '-');

        // Tier 3: Base config from sentinel.config.json defaults
        const baseConfig = this.configManager.getBaseDefaults();
        const baseModel = baseConfig.model ?? 'claude-sonnet-4-5';
        const baseEvalSet = baseConfig.evalSet ?? '';

        let model: ResolvedField<string> = { value: baseModel, tier: 'base' };
        let evalSet: ResolvedField<string> = { value: baseEvalSet, tier: 'base' };

        // Tier 2: Per-harness overrides from sentinel.config.json
        const harnessOverride = this.configManager.getHarnessConfig(harnessName);
        if (harnessOverride?.model) {
            model = { value: harnessOverride.model, tier: 'harness-override' };
        }
        if (harnessOverride?.evalSet) {
            evalSet = { value: harnessOverride.evalSet, tier: 'harness-override' };
        }

        // Tier 1: VS Code settings (highest priority)
        const vscodeOverrides = vscode.workspace
            .getConfiguration('sentinel')
            .get<Record<string, HarnessConfig>>('harness.overrides', {});

        const vscodeOverride = vscodeOverrides[settingId];
        if (vscodeOverride?.model) {
            model = { value: vscodeOverride.model, tier: 'vscode-setting' };
        }
        if (vscodeOverride?.evalSet) {
            evalSet = { value: vscodeOverride.evalSet, tier: 'vscode-setting' };
        }

        return { model, evalSet };
    }

    /**
     * List all known harnesses with their availability status.
     */
    getAvailableHarnesses(): HarnessInfo[] {
        return this.adapterRegistry.getAll().map((adapter) => ({
            name: adapter.name,
            settingId: SETTING_ID_MAP[adapter.name] ?? adapter.name.toLowerCase().replace(/\s+/g, '-'),
            isAvailable: adapter.isAvailable,
            isInstalled: adapter.isInstalled,
        }));
    }
}
