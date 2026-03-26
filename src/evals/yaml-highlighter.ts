/**
 * Lightweight YAML syntax highlighter for eval editor webview.
 *
 * Regex-based tokenizer — no external dependencies. Produces HTML
 * with span-wrapped tokens using CSS classes for styling.
 *
 * Token classes:
 * - .yaml-key       Keys (text before colon at start of line)
 * - .yaml-value     String values after the colon
 * - .yaml-comment   Comments (# to end of line)
 * - .yaml-scalar    Block scalar indicators (| or >)
 * - .yaml-number    Numeric values
 * - .yaml-boolean   true/false/yes/no
 * - .yaml-string    Quoted strings
 * - .yaml-list      List item markers (-)
 */

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Highlight a single YAML line, returning HTML with span-wrapped tokens.
 */
function highlightLine(line: string): string {
    // Empty line
    if (line.trim() === '') {
        return escapeHtml(line);
    }

    // Full-line comment
    if (line.match(/^\s*#/)) {
        return `<span class="yaml-comment">${escapeHtml(line)}</span>`;
    }

    // Detect leading whitespace
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const rest = line.slice(indent.length);

    // List item: "- key: value" or "- value"
    const listItemMatch = rest.match(/^(-\s+)(.*)/);
    if (listItemMatch) {
        const marker = listItemMatch[1];
        const after = listItemMatch[2];
        return escapeHtml(indent) +
            `<span class="yaml-list">${escapeHtml(marker)}</span>` +
            highlightKeyValue(after);
    }

    return escapeHtml(indent) + highlightKeyValue(rest);
}

/**
 * Highlight a key: value segment (no leading indent or list marker).
 */
function highlightKeyValue(text: string): string {
    // Check for inline comment: only after a value, preceded by space
    let commentPart = '';
    let mainPart = text;
    const commentIdx = findInlineComment(text);
    if (commentIdx >= 0) {
        mainPart = text.slice(0, commentIdx);
        commentPart = `<span class="yaml-comment">${escapeHtml(text.slice(commentIdx))}</span>`;
    }

    // Key: value pattern
    const kvMatch = mainPart.match(/^(\w[\w.-]*)(:)(\s*)(.*)/);
    if (kvMatch) {
        const key = kvMatch[1];
        const colon = kvMatch[2];
        const space = kvMatch[3];
        const value = kvMatch[4];

        let valueHtml: string;
        if (value === '' || value === undefined) {
            valueHtml = '';
        } else if (value === '|' || value === '>') {
            valueHtml = `<span class="yaml-scalar">${escapeHtml(value)}</span>`;
        } else {
            valueHtml = highlightValue(value);
        }

        return `<span class="yaml-key">${escapeHtml(key)}</span>` +
            escapeHtml(colon + space) +
            valueHtml +
            commentPart;
    }

    // Not a key-value line — treat as a plain value (block scalar continuation, etc.)
    return highlightValue(mainPart) + commentPart;
}

/**
 * Highlight a value segment.
 */
function highlightValue(value: string): string {
    const trimmed = value.trim();

    // Quoted string
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return `<span class="yaml-string">${escapeHtml(value)}</span>`;
    }

    // Boolean
    if (/^(true|false|yes|no)$/i.test(trimmed)) {
        return `<span class="yaml-boolean">${escapeHtml(value)}</span>`;
    }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return `<span class="yaml-number">${escapeHtml(value)}</span>`;
    }

    // Block scalar indicator
    if (trimmed === '|' || trimmed === '>') {
        return `<span class="yaml-scalar">${escapeHtml(value)}</span>`;
    }

    // General value
    return `<span class="yaml-value">${escapeHtml(value)}</span>`;
}

/**
 * Find the index of an inline comment (# preceded by whitespace, not inside quotes).
 * Returns -1 if no inline comment found.
 */
function findInlineComment(text: string): number {
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
        } else if (ch === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
        } else if (ch === '#' && !inSingleQuote && !inDoubleQuote) {
            // Must be preceded by whitespace (or be at start)
            if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t') {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Highlight a complete YAML document.
 *
 * @param yaml  Raw YAML string
 * @returns HTML string with span-wrapped tokens for syntax highlighting
 */
export function highlightYaml(yaml: string): string {
    return yaml.split('\n').map(highlightLine).join('\n');
}
