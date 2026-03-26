import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const CONTEXT_CONFIG_PRESENT = 'sentinel.configPresent';
const CONTEXT_RUNNING = 'sentinel.running';
const CONTEXT_FIRST_OBSERVATION = 'sentinel.firstObservation';
const GLOBAL_STATE_FIRST_INSTALL = 'sentinel.walkthroughShown';

export class WalkthroughManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private sentinelDir: string | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.sentinelDir = path.join(workspaceFolder.uri.fsPath, '.volition', 'sentinel');
        }

        // Initial context key evaluation
        this.refreshAllContextKeys();

        // Auto-open walkthrough on first install
        this.showWalkthroughOnFirstInstall();
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
        if (!this.sentinelDir) {
            await vscode.commands.executeCommand('setContext', CONTEXT_CONFIG_PRESENT, false);
            return;
        }
        const configPath = path.join(this.sentinelDir, 'sentinel.config.json');
        const exists = fs.existsSync(configPath);
        await vscode.commands.executeCommand('setContext', CONTEXT_CONFIG_PRESENT, exists);
    }

    private async updateRunning(): Promise<void> {
        if (!this.sentinelDir) {
            await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, false);
            return;
        }
        const statePath = path.join(this.sentinelDir, 'sentinel-state.json');
        try {
            const content = fs.readFileSync(statePath, 'utf-8');
            const state = JSON.parse(content);
            const hasActiveSessions =
                state.sessions && Array.isArray(state.sessions) && state.sessions.some((s: { status?: string }) => s.status === 'active');
            await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, hasActiveSessions);
        } catch {
            await vscode.commands.executeCommand('setContext', CONTEXT_RUNNING, false);
        }
    }

    private async updateFirstObservation(): Promise<void> {
        if (!this.sentinelDir) {
            await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, false);
            return;
        }
        const obsPath = path.join(this.sentinelDir, 'sentinel-observations.jsonl');
        try {
            const stat = fs.statSync(obsPath);
            await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, stat.size > 0);
        } catch {
            await vscode.commands.executeCommand('setContext', CONTEXT_FIRST_OBSERVATION, false);
        }
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
