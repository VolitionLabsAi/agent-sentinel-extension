/**
 * Types for sentinel eval rules and configuration.
 */

/** Severity levels matching the observation severity type. */
export type EvalSeverity = 'critical' | 'warning' | 'info';

/** Known eval domains. */
export type EvalDomain = 'GEN' | 'SEC' | 'LOCAL';

/**
 * A single eval rule as parsed from a YAML eval file.
 */
export interface EvalRule {
    /** Eval identifier, e.g. "GEN-001", "SEC-002" */
    id: string;
    /** Schema version of the rule */
    version: number;
    /** Domain string from the YAML, e.g. "general", "security" */
    domainRaw: string;
    /** Normalized domain for grouping: GEN, SEC, or LOCAL */
    domain: EvalDomain;
    /** Rule severity */
    severity: EvalSeverity;
    /** Full rule text describing what to detect */
    rule: string;
    /** Rationale explaining why this rule exists */
    rationale: string;
    /** Whether the rule is currently enabled in config */
    enabled: boolean;
}

/**
 * A sentinel entry in sentinel.config.json.
 */
export interface SentinelConfig {
    name: string;
    label: string;
    enabled: boolean;
    evalSet: string;
    evalVersion: string;
    frequency: string;
    model: string;
    visibility: string;
}

/**
 * A dynamically-created eval rule extracted from sentinel state.
 * These are "learned" rules that a sentinel creates during a session.
 */
export interface LocalEval {
    /** Eval identifier, e.g. "LOCAL-001" */
    id: string;
    /** Severity level */
    severity: EvalSeverity;
    /** The rule text */
    rule: string;
    /** Why the sentinel created this rule */
    rationale: string;
    /** ISO timestamp when the eval was created */
    created_at: string;
    /** Session ID where this eval was created */
    session_id: string;
    /** Which sentinel (domain) created it, e.g. "GEN", "SEC" */
    sentinel_name: string;
}

/**
 * Per-harness configuration overrides.
 * These override the base sentinel config for a specific harness.
 */
export interface HarnessConfig {
    /** Override the LLM model used for sentinel evaluation */
    model?: string;
    /** Override the eval set file path */
    evalSet?: string;
}

/**
 * Top-level shape of sentinel.config.json.
 */
export interface SentinelConfigFile {
    version: string;
    /** Number of hours to look back when filtering observations in "All" mode. Defaults to 24. */
    observation_window_hours?: number;
    /** How to determine the severity icon for session groups: 'recent' or 'highest'. Defaults to 'recent'. */
    session_severity_mode?: 'recent' | 'highest';
    /** How to compute the status bar severity: 'recent' (most recent observation) or 'highest' (max severity in window). Defaults to 'recent'. */
    status_bar_severity_mode?: 'recent' | 'highest';
    /** How to display observations in the Observations panel: 'grouped' (by session) or 'flat' (live-feed). Defaults to 'grouped'. */
    observations_view_mode?: 'grouped' | 'flat';
    defaults: {
        execution: string;
        model: string;
        visibility: string;
    };
    display: {
        brand: string;
        observation: string;
        registration: string;
    };
    sentinels: SentinelConfig[];
    /** Per-rule overrides: eval ID -> { enabled: boolean } */
    ruleOverrides?: Record<string, { enabled: boolean }>;
    /** Per-harness sentinel configuration overrides */
    harnessOverrides?: Record<string, HarnessConfig>;
}
