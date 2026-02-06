import { defineConfig } from '@vscode/test-cli';
import { cpSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Copy fixtures to a temp directory so tests run in full isolation
const testWorkspace = mkdtempSync(join(tmpdir(), 'commandtree-test-'));
cpSync('./src/test/fixtures/workspace', testWorkspace, { recursive: true });

export default defineConfig({
    files: ['out/test/e2e/**/*.test.js', 'out/test/providers/**/*.test.js'],
    version: 'stable',
    workspaceFolder: testWorkspace,
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
