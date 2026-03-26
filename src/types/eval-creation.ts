/**
 * Types for the eval creation flow.
 *
 * Covers the generated eval structure, webview ↔ extension host messaging,
 * and creation options.
 */

import type { EvalSeverity } from './eval-rule.js';

/**
 * A generated eval ready for review and persistence.
 */
export interface GeneratedEval {
    /** Full YAML string for the eval file */
    yaml: string;
    /** Generated eval ID, e.g. "GEN-USER-a1b2c3" */
    id: string;
    /** Severity level */
    severity: EvalSeverity;
    /** Domain prefix: "GEN", "SEC", or custom */
    domain: string;
    /** The rule text */
    rule: string;
    /** The rationale text */
    rationale: string;
    /** Suggested file path relative to workspace root */
    filePath: string;
}

/**
 * Options for generating an eval from a natural language description.
 */
export interface EvalCreationOptions {
    /** Natural language description of the behavior to monitor */
    description: string;
    /** Domain: "GEN", "SEC", or a custom string */
    domain: string;
    /** Desired severity level */
    severity: EvalSeverity;
}

// ── Webview ↔ Extension Host Messages ────────────────────

/** Messages sent FROM the webview TO the extension host. */
export type WebviewToHostMessage =
    | { type: 'generate'; description: string; domain: string; severity: EvalSeverity }
    | { type: 'save'; yaml: string; filePath: string }
    | { type: 'discard' }
    | { type: 'editYaml'; yaml: string };

/** Messages sent FROM the extension host TO the webview. */
export type HostToWebviewMessage =
    | { type: 'preview'; yaml: string; filePath: string; evalId: string }
    | { type: 'error'; message: string }
    | { type: 'saved'; filePath: string }
    | { type: 'loading' };
