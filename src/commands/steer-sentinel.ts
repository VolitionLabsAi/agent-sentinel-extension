/**
 * Mid-Session Sentinel Steering — quick actions to direct sentinel behavior.
 *
 * Shows a QuickPick with common steering actions (watch, ignore, create eval, custom),
 * then collects the specific instruction and persists it to the steering JSONL file
 * for sentinel consumption on its next trigger.
 *
 * Steering history is maintained in-memory for display in the conversation panel,
 * and written to `.volition/sentinel/steering.jsonl` for the sentinel process.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StateManager } from '../stores/state-manager.js';
import { HarnessAdapterRegistry } from '../adapters/adapter-registry.js';
import { generateEvalFromDescription, saveEval } from '../evals/eval-creator.js';

/** A single steering instruction. */
export interface SteeringInstruction {
    /** The action type: watch, ignore, createEval, custom */
    action: 'watch' | 'ignore' | 'createEval' | 'custom';
    /** The user's specific instruction text */
    instruction: string;
    /** ISO timestamp when the instruction was created */
    timestamp: string;
    /** Session ID of the active sentinel session, if any */
    session_id?: string;
}

/** In-memory steering history. Accessible for display in the conversation panel. */
const steeringHistory: SteeringInstruction[] = [];

/**
 * Get the current steering instruction history.
 */
export function getSteeringHistory(): ReadonlyArray<SteeringInstruction> {
    return steeringHistory;
}

/**
 * Resolve the steering JSONL file path for the first workspace folder.
 * Returns undefined if no workspace folder is open.
 */
export function getSteeringFilePath(sessionId?: string): string | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return undefined;
    }
    if (sessionId) {
        return path.join(workspaceRoot, '.volition', 'sentinel', 'sessions', sessionId, 'steering.jsonl');
    }
    return path.join(workspaceRoot, '.volition', 'sentinel', 'steering.jsonl');
}

/**
 * Append a steering instruction to the JSONL file.
 * Creates the directory and file if they don't exist.
 * If the instruction has a session_id, writes to the session-specific steering file.
 */
export async function writeSteeringInstruction(entry: SteeringInstruction): Promise<void> {
    const filePath = getSteeringFilePath(entry.session_id);
    if (!filePath) {
        return;
    }

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Get the active sentinel session ID from the state manager, if any.
 * Returns the most recent session.
 */
function getActiveSessionId(stateManager: StateManager): string | undefined {
    const sessions = stateManager.getSentinelSessions();
    if (sessions.length > 0) {
        return sessions[0].parentSessionId;
    }
    return undefined;
}

/**
 * Get all available session IDs from the state manager.
 */
function getAvailableSessionIds(stateManager: StateManager): string[] {
    const sessions = stateManager.getSentinelSessions();
    return sessions.map(s => s.parentSessionId).filter((id): id is string => !!id);
}

/**
 * Prompt the user to select a session from available sessions.
 * Returns the selected session ID or undefined if cancelled.
 */
async function pickSession(stateManager: StateManager): Promise<string | undefined> {
    const sessionIds = getAvailableSessionIds(stateManager);
    if (sessionIds.length === 0) {
        void vscode.window.showWarningMessage('No active sessions found.');
        return undefined;
    }

    const items = sessionIds.map(id => ({
        label: id,
        description: id === getActiveSessionId(stateManager) ? '(most recent)' : '',
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a session to steer',
        title: 'Select Session',
    });

    return picked?.label;
}

/**
 * Present a QuickPick of common sentinel steering actions,
 * collect the specific instruction, persist it, and store in history.
 */
export async function steerSentinel(
    stateManager: StateManager,
    adapterRegistry: HarnessAdapterRegistry,
): Promise<void> {
    // Default to the most recent session
    let sessionId = getActiveSessionId(stateManager);

    const actionItems = [
        {
            label: '$(eye) Watch for...',
            description: 'Tell sentinel to watch for a specific behavior',
            action: 'watch' as const,
            prompt: 'What behavior should sentinel watch for?',
            placeholder: 'e.g., Agent modifying files outside the project directory',
        },
        {
            label: '$(eye-closed) Ignore...',
            description: 'Tell sentinel to ignore a specific pattern',
            action: 'ignore' as const,
            prompt: 'What should sentinel ignore?',
            placeholder: 'e.g., Formatting-only changes to configuration files',
        },
        {
            label: '$(add) Create eval for...',
            description: 'Create a new eval rule for a behavior pattern',
            action: 'createEval' as const,
            prompt: 'Describe the behavior to create an eval for:',
            placeholder: 'e.g., Agent accessing environment variables without documentation',
        },
        {
            label: '$(pencil) Custom instruction...',
            description: 'Send a free-form instruction to sentinel',
            action: 'custom' as const,
            prompt: 'Enter your instruction for sentinel:',
            placeholder: 'e.g., Focus on security concerns for the next 10 minutes',
        },
        {
            label: '$(list-selection) Select session...',
            description: 'Choose a specific session to steer',
            action: 'selectSession' as const,
            prompt: '',
            placeholder: '',
        },
    ];

    const picked = await vscode.window.showQuickPick(actionItems, {
        placeHolder: 'How would you like to steer the sentinel?',
        title: 'Sentinel Steering',
    });

    if (!picked) {
        return; // User cancelled
    }

    // Handle "Select session..." — pick a session, then re-show the action picker
    if (picked.action === 'selectSession') {
        const chosenSession = await pickSession(stateManager);
        if (!chosenSession) {
            return;
        }
        sessionId = chosenSession;

        // Re-show the action picker (without the session option)
        const actionOnlyItems = actionItems.filter(i => i.action !== 'selectSession');
        const secondPick = await vscode.window.showQuickPick(actionOnlyItems, {
            placeHolder: `Steering session: ${sessionId}`,
            title: 'Sentinel Steering',
        });

        if (!secondPick) {
            return;
        }

        return handleAction(secondPick, sessionId, stateManager, adapterRegistry);
    }

    return handleAction(picked, sessionId, stateManager, adapterRegistry);
}

/**
 * Handle a selected steering action.
 */
async function handleAction(
    picked: {
        action: 'watch' | 'ignore' | 'createEval' | 'custom';
        prompt: string;
        placeholder: string;
    },
    sessionId: string | undefined,
    stateManager: StateManager,
    adapterRegistry: HarnessAdapterRegistry,
): Promise<void> {
    // For "Create eval for...", generate and save directly
    if (picked.action === 'createEval') {
        const description = await vscode.window.showInputBox({
            prompt: picked.prompt,
            placeHolder: picked.placeholder,
            title: 'Create Eval Rule',
        });

        if (!description) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            void vscode.window.showErrorMessage('No workspace folder open — cannot create eval.');
            return;
        }

        // Generate and save the eval
        const generated = generateEvalFromDescription({
            description,
            domain: 'GEN',
            severity: 'warning',
        });
        const savedPath = await saveEval(generated.yaml, generated.filePath, workspaceRoot);

        // Store steering record
        const entry: SteeringInstruction = {
            action: 'createEval',
            instruction: description,
            timestamp: new Date().toISOString(),
            session_id: sessionId,
        };
        steeringHistory.push(entry);
        await writeSteeringInstruction(entry);

        // If an adapter is available, it may relay the eval creation (future use)
        const adapter = adapterRegistry.getAvailable();
        if (adapter) {
            // Future: relay eval creation through adapter
        }

        void vscode.window.showInformationMessage(
            `Steering instruction sent \u2014 sentinel will apply on next evaluation`,
        );
        return;
    }

    // For "Custom instruction...", use an InputBox for free-form text
    const instruction = await vscode.window.showInputBox({
        prompt: picked.prompt,
        placeHolder: picked.placeholder,
        title: 'Sentinel Steering',
    });

    if (!instruction) {
        return; // User cancelled
    }

    const entry: SteeringInstruction = {
        action: picked.action,
        instruction,
        timestamp: new Date().toISOString(),
        session_id: sessionId,
    };

    steeringHistory.push(entry);
    await writeSteeringInstruction(entry);

    // If an adapter is available, it may relay the instruction (future use)
    const adapter = adapterRegistry.getAvailable();
    if (adapter) {
        // Future: relay steering instruction through adapter
    }

    // Show confirmation
    void vscode.window.showInformationMessage(
        `Steering instruction sent \u2014 sentinel will apply on next evaluation`,
    );
}
