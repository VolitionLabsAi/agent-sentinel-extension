import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/suite/**/*.test.js',
    extensionDevelopmentPath: '.',
    workspaceFolder: './src/test/fixtures/test-workspace',
    version: 'stable',
    mocha: {
        ui: 'tdd',
        timeout: 30000,
    },
    launchArgs: [
        '--disable-extensions',
    ],
});
