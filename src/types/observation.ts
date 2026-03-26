/**
 * PersistentObservation matches the Go struct from agent-sentinel.
 * This is the canonical TypeScript representation of a sentinel observation
 * as persisted to the JSONL log.
 */
export interface PersistentObservation {
    /** ISO 8601 timestamp of when the observation was created */
    timestamp: string;

    /** Unique identifier for the agent session being monitored */
    session_id: string;

    /** Name of the sentinel instance */
    sentinel_name: string;

    /** Human-readable label for the sentinel */
    sentinel_label: string;

    /** Severity level: "critical" | "warning" | "info" */
    severity: 'critical' | 'warning' | 'info';

    /** Eval rule identifier (e.g., "SEC-001", "GEN-003") */
    eval_id: string;

    /** Brief one-line summary of the observation */
    one_liner: string;

    /** Detailed analysis text (may be empty for info-level) */
    analysis: string;

    /** The conversation turn number that triggered this observation */
    turn_number: number;

    /** Time in milliseconds the evaluation took */
    duration_ms: number;

    /** Evaluation tier: "security" | "general" | "session" */
    tier: string;

    /** Visibility directive: "display" | "silent" */
    visibility: 'display' | 'silent';

    /** Whether this observation created a new dynamic eval rule */
    dynamic_eval_created: boolean;

    /** The hook type that triggered evaluation: "pre" | "post" */
    hook_type: string;

    /** Schema version for forward compatibility */
    version: string;
}
