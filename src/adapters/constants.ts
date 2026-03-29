/**
 * Canonical mapping between adapter display names and setting-friendly identifiers.
 *
 * This is the single source of truth for harness name ↔ setting ID mapping.
 * All other maps (forward and reverse) should be derived from this.
 *
 * Keys: adapter display names (e.g., "Claude Code")
 * Values: setting-friendly identifiers (e.g., "claude-code")
 */
export const HARNESS_NAME_TO_SETTING_ID: Record<string, string> = {
    'Claude Code': 'claude-code',
    'GitHub Copilot': 'copilot',
    'Codex CLI': 'codex',
    'Gemini CLI': 'gemini-cli',
};

/**
 * Reverse mapping: setting ID → adapter display name.
 * Derived from HARNESS_NAME_TO_SETTING_ID to stay in sync automatically.
 */
export const SETTING_ID_TO_HARNESS_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(HARNESS_NAME_TO_SETTING_ID).map(([name, id]) => [id, name]),
);
