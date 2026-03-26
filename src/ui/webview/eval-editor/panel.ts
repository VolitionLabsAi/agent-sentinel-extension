/**
 * WebviewPanel manager for eval YAML editing.
 *
 * Creates or reveals an editor panel for inspecting and editing eval rules.
 * Supports both read-only viewing of permanent evals and editing of local evals.
 *
 * Panel lifecycle:
 * - show() creates or reveals the panel with content
 * - User edits trigger real-time validation via postMessage
 * - Save writes content to disk via the extension host
 * - Duplicate creates an editable copy with a new ID
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { validateEvalYaml } from '../../../evals/eval-validator.js';
import { highlightYaml } from '../../../evals/yaml-highlighter.js';
import { buildEvalEditorHtml, EvalEditorTemplateOptions } from './template.js';

const VIEW_TYPE = 'sentinel.evalEditor';

export interface EvalEditorShowOptions {
    /** If true, the editor is read-only (view mode). */
    readOnly?: boolean;
}

/**
 * Manages the eval editor webview panel.
 *
 * Only one panel is active at a time. Calling show() with new content
 * replaces the existing panel's content.
 */
export class EvalEditorPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private currentFilePath: string | undefined;
    private currentReadOnly: boolean = false;
    private readonly disposables: vscode.Disposable[] = [];

    private readonly _onDidSave = new vscode.EventEmitter<{ filePath: string; content: string }>();
    /** Fires when the user saves content via the editor. */
    readonly onDidSave: vscode.Event<{ filePath: string; content: string }> = this._onDidSave.event;

    private readonly _onDidRequestDuplicate = new vscode.EventEmitter<{ content: string }>();
    /** Fires when the user clicks Duplicate in read-only mode. */
    readonly onDidRequestDuplicate: vscode.Event<{ content: string }> = this._onDidRequestDuplicate.event;

    constructor(private readonly extensionUri: vscode.Uri) {
        this.disposables.push(this._onDidSave, this._onDidRequestDuplicate);
    }

    /**
     * Show the eval editor panel with the given content.
     *
     * @param evalContent  Raw YAML content to display
     * @param filePath     File path for save operations
     * @param options      Editor options (readOnly, etc.)
     */
    show(evalContent: string, filePath: string, options: EvalEditorShowOptions = {}): void {
        const readOnly = options.readOnly ?? false;
        this.currentFilePath = filePath;
        this.currentReadOnly = readOnly;

        // Derive title from eval ID or filename
        const evalId = extractEvalId(evalContent);
        const prefix = readOnly ? 'View' : 'Edit';
        const title = evalId ? `${prefix}: ${evalId}` : `${prefix}: eval`;

        if (this.panel) {
            this.panel.title = title;
            this.panel.reveal(undefined, true);
            this.updateContent(evalContent, readOnly);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            title,
            { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri],
            },
        );

        this.updateContent(evalContent, readOnly);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            null,
            this.disposables,
        );

        this.panel.onDidDispose(
            () => this.onPanelDisposed(),
            null,
            this.disposables,
        );
    }

    /**
     * Dispose of the panel and all associated resources.
     */
    dispose(): void {
        this.panel?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    /** The file path currently being edited, if any. */
    get filePath(): string | undefined {
        return this.currentFilePath;
    }

    // ── Private ──────────────────────────────────────────

    private updateContent(rawYaml: string, readOnly: boolean): void {
        if (!this.panel) { return; }

        const nonce = crypto.randomBytes(16).toString('hex');
        const validation = validateEvalYaml(rawYaml);
        const highlightedYaml = highlightYaml(rawYaml);
        const lineNumbers = buildLineNumbers(rawYaml);
        const errorPanelHtml = buildErrorPanelHtml(validation.errors);

        const templateOptions: EvalEditorTemplateOptions = {
            highlightedYaml,
            rawYaml,
            nonce,
            readOnly,
            lineNumbers,
            errorPanelHtml,
            validationStatus: rawYaml.trim() === '' ? 'empty' : validation.valid ? 'valid' : 'invalid',
            errorCount: validation.errors.length,
        };

        this.panel.webview.html = buildEvalEditorHtml(templateOptions);
    }

    private async handleMessage(msg: { type: string; content?: string }): Promise<void> {
        switch (msg.type) {
            case 'validate':
                this.handleValidate(msg.content ?? '');
                break;
            case 'save':
                await this.handleSave(msg.content ?? '');
                break;
            case 'duplicate':
                this.handleDuplicate(msg.content ?? '');
                break;
        }
    }

    private handleValidate(content: string): void {
        if (!this.panel) { return; }

        const validation = validateEvalYaml(content);
        const highlightedHtml = highlightYaml(content);
        const lineNumbersHtml = buildLineNumbers(content);
        const errorPanelHtml = buildErrorPanelHtml(validation.errors);

        this.panel.webview.postMessage({
            type: 'validationResult',
            valid: validation.valid,
            errorCount: validation.errors.length,
            errorPanelHtml,
            highlightedHtml,
            lineNumbersHtml,
        });
    }

    private async handleSave(content: string): Promise<void> {
        if (!this.currentFilePath || this.currentReadOnly) { return; }

        const validation = validateEvalYaml(content);
        if (!validation.valid) {
            const proceed = await vscode.window.showWarningMessage(
                `Eval has ${validation.errors.length} validation error(s). Save anyway?`,
                { modal: true },
                'Save',
            );
            if (proceed !== 'Save') { return; }
        }

        try {
            await fs.writeFile(this.currentFilePath, content, 'utf-8');
            this._onDidSave.fire({ filePath: this.currentFilePath, content });

            if (this.panel) {
                this.panel.webview.postMessage({ type: 'saved' });
            }

            vscode.window.showInformationMessage(`Saved: ${this.currentFilePath}`);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to save eval: ${err}`);
        }
    }

    private handleDuplicate(content: string): void {
        this._onDidRequestDuplicate.fire({ content });
    }

    private onPanelDisposed(): void {
        this.panel = undefined;
        this.currentFilePath = undefined;
    }
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Extract the first eval ID from YAML content.
 */
function extractEvalId(yaml: string): string | undefined {
    const match = yaml.match(/^\s+-\s+id:\s*"?([^"\n]+)"?\s*$/m);
    return match?.[1]?.trim();
}

/**
 * Build line numbers HTML string.
 */
function buildLineNumbers(content: string): string {
    const count = content.split('\n').length;
    const lines: string[] = [];
    for (let i = 1; i <= count; i++) {
        lines.push(String(i));
    }
    return lines.join('\n');
}

/**
 * Build error panel HTML from validation errors.
 */
function buildErrorPanelHtml(errors: Array<{ line: number; message: string }>): string {
    if (errors.length === 0) { return ''; }

    const header = `<div class="error-panel-header">Errors (${errors.length})</div>`;
    const items = errors.map((err) =>
        `<div class="error-item" data-line="${err.line}" tabindex="0" role="button" aria-label="Error on line ${err.line}: ${escapeHtml(err.message)}">` +
        `<span class="error-line-num">Ln ${err.line}</span>` +
        `<span class="error-message">${escapeHtml(err.message)}</span>` +
        `</div>`
    ).join('');

    return header + items;
}

/**
 * Escape HTML special characters for safe embedding.
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
