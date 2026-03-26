/**
 * HTML template for the eval editor webview panel.
 *
 * Produces a complete HTML document with Content Security Policy,
 * nonce-based script allowance, and message handlers for communication
 * with the extension host (save, duplicate, validation).
 */

import { EVAL_EDITOR_STYLES } from './styles.js';

export interface EvalEditorTemplateOptions {
    /** Pre-highlighted YAML HTML (used for initial render). */
    highlightedYaml: string;
    /** Raw YAML content for the textarea. */
    rawYaml: string;
    /** Cryptographic nonce for CSP script allowance. */
    nonce: string;
    /** Whether the editor is read-only. */
    readOnly: boolean;
    /** Pre-rendered line numbers HTML. */
    lineNumbers: string;
    /** Pre-rendered error panel HTML (empty string if no errors). */
    errorPanelHtml: string;
    /** Validation status: 'valid', 'invalid', or 'empty'. */
    validationStatus: 'valid' | 'invalid' | 'empty';
    /** Number of validation errors. */
    errorCount: number;
}

/**
 * Escape a string for safe embedding in an HTML attribute.
 */
function escapeAttr(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Build the full HTML document for the eval editor webview.
 */
export function buildEvalEditorHtml(options: EvalEditorTemplateOptions): string {
    const {
        highlightedYaml,
        rawYaml,
        nonce,
        readOnly,
        lineNumbers,
        errorPanelHtml,
        validationStatus,
        errorCount,
    } = options;

    const readOnlyAttr = readOnly ? 'readonly' : '';
    const statusClass = validationStatus === 'empty' ? '' : validationStatus;
    const statusText = validationStatus === 'valid'
        ? 'Valid'
        : validationStatus === 'invalid'
            ? `${errorCount} error${errorCount !== 1 ? 's' : ''}`
            : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Eval Editor</title>
    <style nonce="${nonce}">${EVAL_EDITOR_STYLES}</style>
</head>
<body>
    <div class="toolbar" role="toolbar" aria-label="Editor toolbar">
        ${readOnly ? '<span class="read-only-badge">Read Only</span>' : ''}
        <span class="validation-status ${statusClass}"
              id="validation-status"
              aria-live="polite">${statusText}</span>
        <span class="toolbar-spacer"></span>
        ${readOnly
            ? '<button class="toolbar-button secondary" id="btn-duplicate" title="Create editable copy with new ID">Duplicate</button>'
            : '<button class="toolbar-button" id="btn-save" title="Save (Cmd/Ctrl+S)">Save</button>'
        }
    </div>

    <div class="editor-container">
        <div class="editor-wrapper" id="editor-wrapper">
            <div class="line-numbers" id="line-numbers" aria-hidden="true">${lineNumbers}</div>
            <div class="editor-highlight" id="editor-highlight" aria-hidden="true">${highlightedYaml}</div>
            <textarea
                class="editor-textarea"
                id="editor-textarea"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                aria-label="YAML editor"
                ${readOnlyAttr}
            >${escapeAttr(rawYaml)}</textarea>
        </div>
    </div>

    <div class="error-panel" id="error-panel" role="log" aria-label="Validation errors">
        ${errorPanelHtml}
    </div>

    <script nonce="${nonce}">
        (function () {
            const vscode = acquireVsCodeApi();
            const textarea = document.getElementById('editor-textarea');
            const highlight = document.getElementById('editor-highlight');
            const lineNumbersEl = document.getElementById('line-numbers');
            const errorPanel = document.getElementById('error-panel');
            const validationStatusEl = document.getElementById('validation-status');
            const wrapper = document.getElementById('editor-wrapper');
            const isReadOnly = ${readOnly ? 'true' : 'false'};

            let debounceTimer = null;

            // Sync scroll between textarea and overlay
            if (textarea && wrapper) {
                textarea.addEventListener('scroll', function () {
                    if (highlight) {
                        highlight.style.transform = 'translateY(' + (-textarea.scrollTop) + 'px)';
                    }
                    if (lineNumbersEl) {
                        lineNumbersEl.style.transform = 'translateY(' + (-textarea.scrollTop) + 'px)';
                    }
                });
            }

            // Real-time validation on input
            if (textarea && !isReadOnly) {
                textarea.addEventListener('input', function () {
                    if (debounceTimer) {
                        clearTimeout(debounceTimer);
                    }
                    debounceTimer = setTimeout(function () {
                        vscode.postMessage({
                            type: 'validate',
                            content: textarea.value,
                        });
                    }, 300);
                });
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', function (e) {
                // Cmd/Ctrl+S — save
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    if (!isReadOnly && textarea) {
                        vscode.postMessage({
                            type: 'save',
                            content: textarea.value,
                        });
                    }
                }
            });

            // Save button
            var saveBtn = document.getElementById('btn-save');
            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    if (textarea) {
                        vscode.postMessage({
                            type: 'save',
                            content: textarea.value,
                        });
                    }
                });
            }

            // Duplicate button
            var dupBtn = document.getElementById('btn-duplicate');
            if (dupBtn) {
                dupBtn.addEventListener('click', function () {
                    if (textarea) {
                        vscode.postMessage({
                            type: 'duplicate',
                            content: textarea.value,
                        });
                    }
                });
            }

            // Error item click — jump to line
            if (errorPanel) {
                errorPanel.addEventListener('click', function (e) {
                    var target = e.target;
                    while (target && target !== errorPanel) {
                        if (target.dataset && target.dataset.line) {
                            var lineNum = parseInt(target.dataset.line, 10);
                            jumpToLine(lineNum);
                            return;
                        }
                        target = target.parentElement;
                    }
                });
                // Keyboard activation for error items (Enter/Space)
                errorPanel.addEventListener('keydown', function (e) {
                    if (e.key !== 'Enter' && e.key !== ' ') { return; }
                    var target = e.target;
                    while (target && target !== errorPanel) {
                        if (target.dataset && target.dataset.line) {
                            e.preventDefault();
                            var lineNum = parseInt(target.dataset.line, 10);
                            jumpToLine(lineNum);
                            return;
                        }
                        target = target.parentElement;
                    }
                });
            }

            function jumpToLine(lineNum) {
                if (!textarea) { return; }
                var lines = textarea.value.split('\\n');
                var pos = 0;
                for (var i = 0; i < lineNum - 1 && i < lines.length; i++) {
                    pos += lines[i].length + 1;
                }
                textarea.focus();
                textarea.setSelectionRange(pos, pos + (lines[lineNum - 1] || '').length);
            }

            // Handle messages from extension host
            window.addEventListener('message', function (event) {
                var message = event.data;

                if (message.type === 'validationResult') {
                    // Update error panel
                    if (errorPanel) {
                        errorPanel.innerHTML = message.errorPanelHtml || '';
                    }
                    // Update validation status
                    if (validationStatusEl) {
                        validationStatusEl.className = 'validation-status ' + (message.valid ? 'valid' : 'invalid');
                        validationStatusEl.textContent = message.valid
                            ? 'Valid'
                            : message.errorCount + ' error' + (message.errorCount !== 1 ? 's' : '');
                    }
                    // Update highlight overlay
                    if (highlight && message.highlightedHtml) {
                        highlight.innerHTML = message.highlightedHtml;
                    }
                    // Update line numbers
                    if (lineNumbersEl && message.lineNumbersHtml) {
                        lineNumbersEl.innerHTML = message.lineNumbersHtml;
                    }
                }

                if (message.type === 'saved') {
                    // Brief visual feedback could be added here
                }
            });
        })();
    </script>
</body>
</html>`;
}
