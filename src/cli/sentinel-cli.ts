import * as cp from 'child_process';

/**
 * Result of a sentinel CLI invocation.
 */
export interface CLIResult {
    /** Exit code: 0=success, 1=warnings, 2=errors */
    exitCode: number;
    /** Parsed JSON output, or undefined if parsing failed. */
    json: unknown | undefined;
    /** Raw stdout text. */
    stdout: string;
    /** Raw stderr text. */
    stderr: string;
}

/** Timeout for CLI commands in milliseconds. */
const COMMAND_TIMEOUT_MS = 10_000;

/** Binary names to search for on PATH, in order of preference. */
const BINARY_NAMES = ['sentinel', 'vl'] as const;

/**
 * Thin wrapper around the sentinel / vl CLI binary.
 *
 * Spawns the binary with `--format json` and `--project-dir`,
 * parses structured JSON responses, and maps exit codes.
 */
export class SentinelCLI {
    private resolvedBinary: string | null | undefined; // undefined = not yet checked

    /**
     * Execute a sentinel CLI command.
     *
     * @param args   CLI arguments (e.g. `['doctor']`)
     * @param projectDir  Absolute path to the project directory
     * @returns CLIResult with exit code, parsed JSON, stdout and stderr
     * @throws Never — errors are captured in the result
     */
    async execSentinel(args: string[], projectDir: string): Promise<CLIResult> {
        const binary = await this.resolveBinary();
        if (!binary) {
            return {
                exitCode: -1,
                json: undefined,
                stdout: '',
                stderr: 'sentinel/vl binary not found on PATH',
            };
        }

        const fullArgs = [...args, '--format', 'json', '--project-dir', projectDir];

        return new Promise<CLIResult>((resolve) => {
            try {
                const child = cp.execFile(
                    binary,
                    fullArgs,
                    {
                        timeout: COMMAND_TIMEOUT_MS,
                        maxBuffer: 1024 * 1024,
                        env: { ...process.env },
                    },
                    (error, stdout, stderr) => {
                        const exitCode = error && 'code' in error
                            ? (typeof error.code === 'number' ? error.code : 2)
                            : 0;

                        let json: unknown | undefined;
                        try {
                            if (stdout.trim()) {
                                json = JSON.parse(stdout);
                            }
                        } catch {
                            // JSON parse failed — leave as undefined
                        }

                        resolve({ exitCode, json, stdout, stderr });
                    },
                );

                // Safety: if the child somehow doesn't call back, we still resolve
                child.on('error', (err) => {
                    resolve({
                        exitCode: -1,
                        json: undefined,
                        stdout: '',
                        stderr: err.message,
                    });
                });
            } catch (err) {
                resolve({
                    exitCode: -1,
                    json: undefined,
                    stdout: '',
                    stderr: err instanceof Error ? err.message : String(err),
                });
            }
        });
    }

    /**
     * Check whether the sentinel/vl binary is available on PATH.
     */
    async isBinaryAvailable(): Promise<boolean> {
        return (await this.resolveBinary()) !== null;
    }

    /**
     * Resolve the sentinel binary, caching the result.
     * Returns null if neither binary is found.
     */
    private async resolveBinary(): Promise<string | null> {
        if (this.resolvedBinary !== undefined) {
            return this.resolvedBinary;
        }

        for (const name of BINARY_NAMES) {
            if (await this.canExecute(name)) {
                this.resolvedBinary = name;
                return name;
            }
        }

        this.resolvedBinary = null;
        return null;
    }

    /**
     * Test whether a binary name can be executed (i.e. is on PATH).
     */
    private canExecute(binary: string): Promise<boolean> {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            cp.execFile(cmd, [binary], { timeout: 3000 }, (error) => {
                resolve(!error);
            });
        });
    }

    /**
     * Reset the cached binary resolution (useful when PATH might have changed).
     */
    resetBinaryCache(): void {
        this.resolvedBinary = undefined;
    }
}
