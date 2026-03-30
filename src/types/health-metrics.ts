/**
 * Types for session health metrics passed from the provider to the webview.
 */

/** Summary metrics displayed at the top of the health view. */
export interface HealthSummaryMetrics {
    /** Total number of evaluations in the current session/filter. */
    evalCount: number;
    /** Count of critical + warning observations. */
    corrections: number;
    /** Number of dynamic eval rules created during the session. */
    dynamicRulesCount: number;
    /** Average evaluation duration in milliseconds. */
    avgDurationMs: number;
}

/** Severity distribution for the donut chart. */
export interface SeverityDistribution {
    critical: number;
    warning: number;
    info: number;
}

/** A single point on the observation timeline. */
export interface TimelinePoint {
    /** ISO 8601 timestamp. */
    timestamp: string;
    /** Severity of the observation. */
    severity: 'critical' | 'warning' | 'info';
    /** Eval ID for tooltip. */
    evalId: string;
}

/** Complete health data payload sent to the webview via postMessage. */
export interface HealthViewData {
    type: 'healthUpdate';
    summary: HealthSummaryMetrics;
    severity: SeverityDistribution;
    /** Latency values (ms) for the sparkline, from the last N observations. */
    latencyTrend: number[];
    /** Timeline points for the observation timeline chart. */
    timeline: TimelinePoint[];
}

/** Segment descriptor for the donut chart renderer. */
export interface DonutSegment {
    label: string;
    value: number;
    color: string;
}

/** Configuration for sparkline rendering. */
export interface SparklineConfig {
    width?: number;
    height?: number;
    lineColor?: string;
    fillColor?: string;
    strokeWidth?: number;
}

/** Configuration for the timeline chart. */
export interface TimelineConfig {
    width?: number;
    height?: number;
    dotRadius?: number;
}
