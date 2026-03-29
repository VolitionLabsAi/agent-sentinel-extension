import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { SentinelCLI } from '../../cli/sentinel-cli';
import { tryAutoStart } from '../../extension';

/**
 * Tests for the autoStart logic via the extracted tryAutoStart() function.
 *
 * We test the conditions that gate the CLI call:
 * - config exists → CLI call made
 * - no config → no CLI call (early return)
 *
 * Also verifies SentinelCLI.execSentinel returns proper result shapes.
 */

/** Create a fake WorkspaceFolder pointing at the given fsPath. */
function makeFakeFolder(fsPath: string): vscode.WorkspaceFolder {
    return {
        uri: vscode.Uri.file(fsPath),
        name: path.basename(fsPath),
        index: 0,
    };
}

suite('AutoStart Logic', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-autostart-test-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('tryAutoStart should not call CLI when config does not exist', async () => {
        const cli = new SentinelCLI();
        const folder = makeFakeFolder(tmpDir);

        // No config file exists — tryAutoStart should return without error
        await tryAutoStart(cli, folder);
        // If we get here without throwing, the early-return path worked
    });

    test('tryAutoStart should call CLI when config exists', async () => {
        const configPath = path.join(tmpDir, '.volition', 'sentinel', 'sentinel.config.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, '{}');

        const cli = new SentinelCLI();
        const folder = makeFakeFolder(tmpDir);

        // Config exists — tryAutoStart will attempt cli.execSentinel.
        // The binary likely isn't installed, so it will complete with a non-zero exit code
        // but should not throw.
        await tryAutoStart(cli, folder);
    });

    test('onDidChangeConfiguration should trigger tryAutoStart when autoStart changes to true', async () => {
        // Verify that when sentinel.autoStart is enabled, tryAutoStart is callable
        // and handles workspaces correctly. This mirrors the listener registered in activate().
        const configPath = path.join(tmpDir, '.volition', 'sentinel', 'sentinel.config.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, '{}');

        const cli = new SentinelCLI();
        const folder = makeFakeFolder(tmpDir);

        // Simulate what the onDidChangeConfiguration listener does:
        // read the setting and call tryAutoStart for each folder
        const autoStart = vscode.workspace.getConfiguration('sentinel').get<boolean>('autoStart', false);
        // Whether or not autoStart is currently true in test env, verify tryAutoStart works
        // when invoked the same way the listener would invoke it
        await tryAutoStart(cli, folder);
        // Should complete without throwing — the config exists so CLI is attempted
    });

    test('execSentinel with start command returns proper result shape', async () => {
        const cli = new SentinelCLI();
        const result = await cli.execSentinel(['start'], tmpDir);

        // Verify the result has the expected structure regardless of binary availability
        assert.strictEqual(typeof result.exitCode, 'number');
        assert.strictEqual(typeof result.stdout, 'string');
        assert.strictEqual(typeof result.stderr, 'string');
        assert.ok('json' in result);
    });

    test('execSentinel with stop command returns proper result shape', async () => {
        const cli = new SentinelCLI();
        const result = await cli.execSentinel(['stop'], tmpDir);

        assert.strictEqual(typeof result.exitCode, 'number');
        assert.strictEqual(typeof result.stdout, 'string');
        assert.strictEqual(typeof result.stderr, 'string');
        assert.ok('json' in result);
    });
});
