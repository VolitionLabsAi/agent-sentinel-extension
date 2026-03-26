/**
 * HTML template for the eval creation webview.
 *
 * Two-step flow:
 *   1. Input — description, domain, severity
 *   2. Preview — generated YAML with Edit/Save/Discard
 *
 * Communicates with the extension host via postMessage.
 */

import { EVAL_CREATION_STYLES } from './styles.js';

/**
 * Build the full HTML document for the eval creation webview.
 *
 * @param nonce - Cryptographic nonce for CSP script allowance
 * @returns Complete HTML string for WebviewPanel.webview.html
 */
export function buildEvalCreationHtml(nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Create Eval Rule</title>
    <style nonce="${nonce}">${EVAL_CREATION_STYLES}</style>
</head>
<body>
    <div class="container">
        <h1>Create Eval Rule</h1>

        <!-- Step indicator -->
        <div class="step-indicator" role="navigation" aria-label="Creation steps">
            <span class="step active" id="step-1-indicator">1. Describe</span>
            <span class="step-arrow" aria-hidden="true">&#x2192;</span>
            <span class="step" id="step-2-indicator">2. Review</span>
        </div>

        <!-- Step 1: Input -->
        <div id="step-input" role="form" aria-label="Eval rule description">
            <div class="form-group">
                <label for="description">What behavior should sentinel monitor?</label>
                <div class="hint">Describe the agent behavior you want to detect, in natural language.</div>
                <textarea id="description" placeholder="e.g., The agent modifies configuration files without showing the user what changed"
                          aria-required="true"></textarea>
            </div>

            <div class="selectors-row">
                <div class="form-group">
                    <label for="domain">Domain</label>
                    <select id="domain">
                        <option value="GEN" selected>General (GEN)</option>
                        <option value="SEC">Security (SEC)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="severity">Severity</label>
                    <select id="severity">
                        <option value="info">Info</option>
                        <option value="warning" selected>Warning</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>

            <div class="button-row">
                <button class="primary" id="btn-generate" disabled>Generate Eval</button>
            </div>
        </div>

        <!-- Step 2: Preview -->
        <div id="step-preview" style="display: none;" role="region" aria-label="Generated eval preview">
            <div class="yaml-preview" id="yaml-display" role="document" aria-label="Generated YAML"
                 tabindex="0"></div>
            <div class="file-path" id="file-path-display"></div>

            <!-- Edit mode (hidden by default) -->
            <textarea class="yaml-edit" id="yaml-editor" style="display: none;"
                      aria-label="Edit YAML"></textarea>

            <div class="button-row">
                <button class="primary" id="btn-save">Save</button>
                <button class="secondary" id="btn-edit">Edit</button>
                <button class="secondary" id="btn-back">Back</button>
                <button class="secondary" id="btn-discard">Discard</button>
            </div>
        </div>

        <!-- Status messages -->
        <div id="status" class="status" role="status" aria-live="polite"></div>
    </div>

    <script nonce="${nonce}">
        (function () {
            const vscode = acquireVsCodeApi();

            // DOM references
            const descriptionEl = document.getElementById('description');
            const domainEl = document.getElementById('domain');
            const severityEl = document.getElementById('severity');
            const btnGenerate = document.getElementById('btn-generate');
            const btnSave = document.getElementById('btn-save');
            const btnEdit = document.getElementById('btn-edit');
            const btnBack = document.getElementById('btn-back');
            const btnDiscard = document.getElementById('btn-discard');
            const stepInput = document.getElementById('step-input');
            const stepPreview = document.getElementById('step-preview');
            const yamlDisplay = document.getElementById('yaml-display');
            const yamlEditor = document.getElementById('yaml-editor');
            const filePathDisplay = document.getElementById('file-path-display');
            const statusEl = document.getElementById('status');
            const step1Indicator = document.getElementById('step-1-indicator');
            const step2Indicator = document.getElementById('step-2-indicator');

            // State
            let currentYaml = '';
            let currentFilePath = '';
            let isEditing = false;

            // ── YAML syntax highlighting ─────────────────────────

            function highlightYaml(yaml) {
                return yaml
                    .split('\\n')
                    .map(function (line) {
                        // Comments
                        if (line.trim().startsWith('#')) {
                            return '<span class="yaml-comment">' + escapeHtml(line) + '</span>';
                        }

                        // Block scalar indicators (|, >)
                        var blockMatch = line.match(/^(\\s*\\S+:\\s*)(\\|[+-]?|>[+-]?)\\s*$/);
                        if (blockMatch) {
                            return highlightKeyPart(blockMatch[1])
                                + '<span class="yaml-block-indicator">' + escapeHtml(blockMatch[2]) + '</span>';
                        }

                        // Key: value lines
                        var kvMatch = line.match(/^(\\s*-?\\s*)([\\w][\\w.-]*)(:)(\\s*)(.*)/);
                        if (kvMatch) {
                            var indent = escapeHtml(kvMatch[1]);
                            var key = '<span class="yaml-key">' + escapeHtml(kvMatch[2]) + '</span>';
                            var colon = '<span class="yaml-key">:</span>';
                            var space = escapeHtml(kvMatch[4]);
                            var value = highlightValue(kvMatch[5]);
                            return indent + key + colon + space + value;
                        }

                        // Block scalar content (indented lines under |)
                        if (line.match(/^\\s{4,}/)) {
                            return '<span class="yaml-literal">' + escapeHtml(line) + '</span>';
                        }

                        return escapeHtml(line);
                    })
                    .join('\\n');
            }

            function highlightKeyPart(part) {
                var m = part.match(/^(\\s*-?\\s*)([\\w][\\w.-]*)(:)(\\s*)/);
                if (m) {
                    return escapeHtml(m[1])
                        + '<span class="yaml-key">' + escapeHtml(m[2]) + '</span>'
                        + '<span class="yaml-key">:</span>'
                        + escapeHtml(m[4]);
                }
                return escapeHtml(part);
            }

            function highlightValue(val) {
                val = val.trim();
                if (!val) return '';

                // Quoted strings
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    return '<span class="yaml-string">' + escapeHtml(val) + '</span>';
                }

                // Numbers
                if (/^\\d+(\\.\\d+)?$/.test(val)) {
                    return '<span class="yaml-number">' + escapeHtml(val) + '</span>';
                }

                return escapeHtml(val);
            }

            function escapeHtml(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            // ── Step transitions ─────────────────────────────────

            function showStep(step) {
                if (step === 'input') {
                    stepInput.style.display = '';
                    stepPreview.style.display = 'none';
                    step1Indicator.classList.add('active');
                    step2Indicator.classList.remove('active');
                } else {
                    stepInput.style.display = 'none';
                    stepPreview.style.display = '';
                    step1Indicator.classList.remove('active');
                    step2Indicator.classList.add('active');
                }
                isEditing = false;
                yamlDisplay.style.display = '';
                yamlEditor.style.display = 'none';
                btnEdit.textContent = 'Edit';
            }

            function setStatus(text, type) {
                statusEl.textContent = text;
                statusEl.className = 'status' + (type ? ' ' + type : '');
            }

            // ── Enable/disable generate button ───────────────────

            descriptionEl.addEventListener('input', function () {
                btnGenerate.disabled = descriptionEl.value.trim().length === 0;
            });

            // ── Generate ─────────────────────────────────────────

            btnGenerate.addEventListener('click', function () {
                var desc = descriptionEl.value.trim();
                if (!desc) return;

                setStatus('Generating...', 'loading');
                btnGenerate.disabled = true;

                vscode.postMessage({
                    type: 'generate',
                    description: desc,
                    domain: domainEl.value,
                    severity: severityEl.value,
                });
            });

            // ── Save ─────────────────────────────────────────────

            btnSave.addEventListener('click', function () {
                var yaml = isEditing ? yamlEditor.value : currentYaml;
                vscode.postMessage({
                    type: 'save',
                    yaml: yaml,
                    filePath: currentFilePath,
                });
                setStatus('Saving...', 'loading');
            });

            // ── Edit toggle ──────────────────────────────────────

            btnEdit.addEventListener('click', function () {
                if (isEditing) {
                    // Switch back to preview
                    currentYaml = yamlEditor.value;
                    yamlDisplay.innerHTML = highlightYaml(currentYaml);
                    yamlDisplay.style.display = '';
                    yamlEditor.style.display = 'none';
                    btnEdit.textContent = 'Edit';
                    isEditing = false;
                } else {
                    // Switch to edit mode
                    yamlEditor.value = currentYaml;
                    yamlDisplay.style.display = 'none';
                    yamlEditor.style.display = '';
                    yamlEditor.focus();
                    btnEdit.textContent = 'Preview';
                    isEditing = true;
                }
            });

            // ── Back ─────────────────────────────────────────────

            btnBack.addEventListener('click', function () {
                showStep('input');
                setStatus('', '');
                btnGenerate.disabled = descriptionEl.value.trim().length === 0;
            });

            // ── Discard ──────────────────────────────────────────

            btnDiscard.addEventListener('click', function () {
                vscode.postMessage({ type: 'discard' });
            });

            // ── Messages from extension host ─────────────────────

            window.addEventListener('message', function (event) {
                var msg = event.data;

                if (msg.type === 'preview') {
                    currentYaml = msg.yaml;
                    currentFilePath = msg.filePath;
                    yamlDisplay.innerHTML = highlightYaml(msg.yaml);
                    filePathDisplay.textContent = msg.filePath;
                    showStep('preview');
                    setStatus('', '');
                }

                if (msg.type === 'error') {
                    setStatus(msg.message, 'error');
                    btnGenerate.disabled = descriptionEl.value.trim().length === 0;
                }

                if (msg.type === 'saved') {
                    setStatus('Saved to ' + msg.filePath, 'success');
                }

                if (msg.type === 'loading') {
                    setStatus('Generating...', 'loading');
                }
            });
        })();
    </script>
</body>
</html>`;
}
