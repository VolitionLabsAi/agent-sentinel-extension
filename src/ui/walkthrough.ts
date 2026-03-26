import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

const CONTEXT_CONFIG_PRESENT = 'sentinel.configPresent';
const CONTEXT_RUNNING = 'sentinel.running';
const CONTEXT_FIRST_OBSERVATION = 'sentinel.firstObservation';
const GLOBAL_STATE_FIRST_INSTALL = 'sentinel.walkthroughShown';

export class WalkthroughManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        // Initial context key evaluation
        void this.refreshAllContextKeys();

        // Auto-open walkthrough on first install
        void this.showWalkthroughOnFirstInstall();
    }

    /**
     * Returns sentinel directories for all workspace folders.
     */
    private getSentinelDirs(): string[] {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return [];
        }
        return folders.map((f) => path.join(f.uri.fsPath, '.volition', 'sentinel'));
    }

    /**
     * Refresh all context keys — call this on activation and when file watchers fire.
     */
    async refreshAllContextKeys(): Promise<void> {
        await Promise.all([
            this.updateConfigPresent(),
            this.updateRunning(),
            this.updateFirstObservation(),
        ]);
    }

    private async updateConfigPresent(): Promise<void> {
        const dirs = this.getSentinelDirs();
        if (dirs.length === 0) {
            await vscode.commands.executeCommand('setContext', CONTEXT_CONFIG_PRESENT, false);
            return;
        }
        for (const dir of dirs) {
            const configPath = path.join(dir, 'sentinel.config.json');
            try {
                await fs.access(configPath);
                await vscode.commands.executeCommand('setContext', CONTEXT_CONFIG_PRESENT, true);
                return;
            } catch {
                // Not found in this folder, try next
            }
        }
        await vscode.commands.executeCommand('setContext', CONTEXT_CONFIG_PRESENT, false);
    }

    private async updateRunning(): Promise<void> {
        const dirs = this.getSentinelDirs();
        if (dirs.length === 0) {
            await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, false);
            return;
        }
        for (const dir of dirs) {
            const statePath = path.join(dir, 'sentinel-state.json');
            try {
                const content = await fs.readFile(statePath, 'utf-8');
                const state = JSON.parse(content);
                const hasActiveSessions =
                    state.sessions && Array.isArray(state.sessions) && state.sessions.some((s: { status?: string }) => s.status === 'active');
                if (hasActiveSessions) {
                    await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, true);
                    return;
                }
            } catch {
                // Not found or malformed in this folder, try next
            }
        }
        await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, false);
    }

    private async updateFirstObservation(): Promise<void> {
        const dirs = this.getSentinelDirs();
        if (dirs.length === 0) {
            await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, false);
            return;
        }
        for (const dir of dirs) {
            const obsPath = path.join(dir, 'sentinel-observations.jsonl');
            try {
                const stat = await fs.stat(obsPath);
                if (stat.size > 0) {
                    await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, true);
                    return;
                }
            } catch {
                // Not found in this folder, try next
            }
        }
        await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, false);
    }

    private async showWalkthroughOnFirstInstall(): Promise<void> {
        const alreadyShown = this.context.globalState.get<boolean>(GLOBAL_STATE_FIRST_INSTALL, false);
        if (!alreadyShown) {
            await this.context.globalState.update(GLOBAL_STATE_FIRST_INSTALL, true);
            // Small delay so the extension finishes activating before opening the walkthrough
            setTimeout(() => {
                vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    'volition.agent-sentinel#sentinel-setup',
                    false,
                );
            }, 1500);
        }
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
