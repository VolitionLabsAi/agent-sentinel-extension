import * as vscode from 'vscode';
import { StateManager, SentinelSessionInfo } from '../stores/state-manager.js';
import { ConfigManager } from '../stores/config-manager.js';
import { HarnessAdapterRegistry } from '../adapters/adapter-registry.js';
import { HarnessAdapter } from '../adapters/types.js';
import { SETTING_ID_TO_HARNESS_NAME } from '../adapters/constants.js';

/**
 * Opens a sentinel's sidechain session as an editor tab in VS Code.
 *
 * If multiple sentinels are active (e.g. GEN, SEC), presents a QuickPick
 * for the user to choose. If only one sentinel exists, opens it directly.
 *
 * Harness selection strategy:
 * 1. If sentinel config specifies `harnessOverrides` with a single harness, use it.
 * 2. If multiple harnesses are available, present a QuickPick to the user.
 * 3. Falls back to the first available adapter in the registry.
 */
export async function openSentinelChat(
    stateManager: StateManager,
    adapterRegistry: HarnessAdapterRegistry,
    configManager?: ConfigManager,
): Promise<void> {
    // Resolve the harness adapter — config-aware with fallback
    const adapter = await resolveAdapter(adapterRegistry, configManager);
    if (!adapter) {
        void vscode.window.showErrorMessage(
            'No AI coding assistant harness that can open sessions is available. '
            + 'Install Claude Code to open sentinel chat sessions directly.',
        );
        return;
    }

    // Get all sentinel sessions from state
    const sentinelSessions = stateManager.getSentinelSessions();

    if (sentinelSessions.length === 0) {
        void vscode.window.showInformationMessage(
            'No active sentinel session. Start monitoring with \'vl sentinel start\'.',
        );
        return;
    }

    let selected: SentinelSessionInfo;

    if (sentinelSessions.length === 1) {
        // Only one sentinel — open directly
        selected = sentinelSessions[0];
    } else {
        // Multiple sentinels — let the user choose
        const items = sentinelSessions.map(s => ({
            label: s.name,
            description: `Session: ${s.sentinelSessionId.slice(0, 8)}...`,
            detail: s.startedAt
                ? `Started: ${new Date(s.startedAt).toLocaleString()}`
                : undefined,
            session: s,
        }));

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a sentinel to open',
            title: 'Open Sentinel Chat',
        });

        if (!pick) {
            return; // User cancelled
        }

        selected = pick.session;
    }

    try {
        await adapter.openSession(selected.sentinelSessionId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
            `Failed to open sentinel chat: ${message}`,
        );
    }
}

/**
 * Resolve which harness adapter to use for opening a sentinel chat.
 *
 * Only adapters with `capabilities.canOpenSessions === true` are considered,
 * since this command needs to open a session by ID.
 *
 * Priority:
 * 1. If config has `harnessOverrides` with exactly one harness name that matches
 *    an available adapter with canOpenSessions, use that adapter directly.
 * 2. If multiple session-capable adapters are available, show a QuickPick for user choice.
 * 3. If only one session-capable adapter is available, use it.
 * 4. If none are available, return undefined.
 */
async function resolveAdapter(
    registry: HarnessAdapterRegistry,
    configManager?: ConfigManager,
): Promise<HarnessAdapter | undefined> {
    // Check if config specifies a preferred harness
    if (configManager) {
        const preferredName = getConfiguredHarnessName(configManager);
        if (preferredName) {
            const adapter = registry.getByName(preferredName);
            if (adapter?.isAvailable && adapter.capabilities.canOpenSessions) {
                return adapter;
            }
            // Configured harness not available or can't open sessions — fall through
        }
    }

    // Collect all available adapters that can open sessions
    const available = registry.getAll().filter(
        a => a.isAvailable && a.capabilities.canOpenSessions,
    );

    if (available.length === 0) {
        return undefined;
    }

    if (available.length === 1) {
        return available[0];
    }

    // Multiple available — let the user choose
    const items = available.map(a => ({
        label: a.name,
        description: 'Can open sessions directly',
        adapter: a,
    }));

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Multiple AI harnesses detected — select one',
        title: 'Select Harness',
    });

    return pick?.adapter;
}

/**
 * Read the configured harness preference from VS Code settings.
 * Returns the adapter display name if a specific harness is configured,
 * undefined if set to 'auto' or not set.
 *
 * Uses the `sentinel.harness.default` setting (set via sentinel.selectHarness command).
 * The _configManager parameter is accepted for future use when sentinel.config.json
 * gains a harness preference field.
 */
function getConfiguredHarnessName(_configManager: ConfigManager): string | undefined {
    const sentinelConfig = vscode.workspace.getConfiguration('sentinel');
    const harnessSetting = sentinelConfig.get<string>('harness.default', 'auto');

    if (!harnessSetting || harnessSetting === 'auto') {
        return undefined;
    }

    return SETTING_ID_TO_HARNESS_NAME[harnessSetting] ?? undefined;
}
