import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: ['out/test/e2e/**/*.test.js', 'out/test/providers/**/*.test.js'],
    version: 'stable',
    workspaceFolder: './test-fixtures/workspace',
    extensionDevelopmentPath: './',
    mocha: {
        ui: 'tdd',
        timeout: 60000,
        color: true,
        slow: 10000
    },
    launchArgs: [
        '--disable-extensions',
        '--disable-gpu'
    ],
    coverage: {
        include: ['out/**/*.js'],
        exclude: ['out/test/**/*.js'],
        reporter: ['text', 'lcov', 'html'],
        output: './coverage'
    }
});
