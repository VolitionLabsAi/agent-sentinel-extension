import * as vscode from 'vscode';
import { StatusBarManager } from './ui/status-bar.js';

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Sentinel activated');

    const statusBar = new StatusBarManager(context);
    context.subscriptions.push(statusBar);

    // Return API surface for volition-extension (and tests) to consume
    return {
        statusBar,
    };
}

export function deactivate() {}
