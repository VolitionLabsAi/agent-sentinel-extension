import * as vscode from 'vscode';
import { HarnessAdapter } from './types.js';

/**
 * Claude Code harness adapter.
 *
 * Detects the claude-vscode extension and uses its `claude-vscode.editor.open`
 * command to open sentinel sidechain sessions in the editor.
 */
export class ClaudeCodeAdapter implements HarnessAdapter {
    readonly name = 'Claude Code';

    get isAvailable(): boolean {
        return vscode.extensions.getExtension('anthropic.claude-code') !== undefined;
    }

    async openSession(sessionId: string): Promise<void> {
        // Feature-detect the command before invoking
        const commands = await vscode.commands.getCommands(true);
        if (!commands.includes('claude-vscode.editor.open')) {
            throw new Error(
                'Claude Code extension is required to open sentinel chat. '
                + 'Install it from the VS Code marketplace.',
            );
        }

        await vscode.commands.executeCommand('claude-vscode.editor.open', sessionId);
    }
}
