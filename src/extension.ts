import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {
    console.log('Agent Sentinel activated');

    // Return empty API stub for volition-extension to consume
    return {};
}

export function deactivate() {}
