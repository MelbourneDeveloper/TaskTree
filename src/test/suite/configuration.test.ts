/**
 * CONFIGURATION E2E TESTS
 *
 * These tests verify extension settings and file watcher functionality.
 *
 * ⛔️⛔️⛔️ E2E TEST RULES ⛔️⛔️⛔️
 *
 * LEGAL:
 * ✅ Reading VS Code configuration (vscode.workspace.getConfiguration)
 * ✅ Reading extension package.json for defaults
 * ✅ Writing to files (simulates user editing)
 * ✅ Waiting for file watcher with await sleep()
 * ✅ Observing state via getChildren() / getAllTasks() (read-only)
 *
 * ILLEGAL:
 * ❌ vscode.commands.executeCommand('tasktree.refresh') - refresh should be AUTOMATIC
 * ❌ provider.refresh() - internal method
 *
 * When files are modified, the file watcher should automatically trigger
 * task re-discovery. Tests verify this works correctly.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getExtensionPath,
    writeFile,
    deleteFile,
    getTaskTreeProvider
} from './helpers';

interface ConfigurationProperty {
    default: unknown;
    enum?: string[];
    enumDescriptions?: string[];
}

interface PackageJsonConfig {
    contributes: {
        configuration: {
            title: string;
            properties: {
                'tasktree.excludePatterns': ConfigurationProperty;
                'tasktree.sortOrder': ConfigurationProperty;
            };
        };
    };
}

interface TasksJson {
    tasks: Array<{
        label?: string;
        type: string;
        command?: string;
    }>;
}

interface LaunchJson {
    configurations: Array<{
        type: string;
        request: string;
        name: string;
    }>;
}

interface TagConfig {
    tags: Record<string, string[]>;
}

interface FixturePackageJson {
    scripts: Record<string, string>;
}

function readExtensionPackageJson(): PackageJsonConfig {
    return JSON.parse(fs.readFileSync(getExtensionPath('package.json'), 'utf8')) as PackageJsonConfig;
}

suite('Configuration and File Watchers E2E Tests', () => {
    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        // Wait for initial auto-load
        await sleep(3000);
    });

    suite('Extension Settings', () => {
        test('excludePatterns setting exists', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const excludePatterns = config.get<string[]>('excludePatterns');

            assert.ok(excludePatterns, 'excludePatterns should exist');
            assert.ok(Array.isArray(excludePatterns), 'excludePatterns should be an array');
        });

        test('excludePatterns has sensible defaults', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const defaultPatterns = packageJson.contributes.configuration.properties['tasktree.excludePatterns'].default as string[];

            assert.ok(defaultPatterns.includes('**/node_modules/**'), 'Should exclude node_modules');
            assert.ok(defaultPatterns.includes('**/bin/**'), 'Should exclude bin');
            assert.ok(defaultPatterns.includes('**/obj/**'), 'Should exclude obj');
            assert.ok(defaultPatterns.includes('**/.git/**'), 'Should exclude .git');
        });

        test('sortOrder setting exists', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const sortOrder = config.get<string>('sortOrder');

            assert.ok(sortOrder !== undefined && sortOrder !== '', 'sortOrder should exist');
        });

        test('sortOrder has valid enum values', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const enumValues = packageJson.contributes.configuration.properties['tasktree.sortOrder'].enum;

            assert.ok(enumValues, 'enum should exist');
            assert.ok(enumValues.includes('folder'), 'Should have folder option');
            assert.ok(enumValues.includes('name'), 'Should have name option');
            assert.ok(enumValues.includes('type'), 'Should have type option');
        });

        test('sortOrder defaults to folder', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const defaultValue = packageJson.contributes.configuration.properties['tasktree.sortOrder'].default;

            assert.strictEqual(defaultValue, 'folder', 'sortOrder should default to folder');
        });

        test('sortOrder has descriptive enum descriptions', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const enumDescriptions = packageJson.contributes.configuration.properties['tasktree.sortOrder'].enumDescriptions;

            assert.ok(enumDescriptions, 'enumDescriptions should exist');
            assert.ok(enumDescriptions.length === 3, 'Should have 3 descriptions');
            assert.ok(enumDescriptions[0]?.includes('folder') === true, 'First should describe folder');
            assert.ok(enumDescriptions[1]?.includes('name') === true, 'Second should describe name');
            assert.ok(enumDescriptions[2]?.includes('type') === true, 'Third should describe type');
        });
    });

    suite('Configuration Value Reading', () => {
        test('sortOrder config has valid value', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const sortOrder = config.get<string>('sortOrder');

            // Verify config is readable and has valid value
            assert.ok(['folder', 'name', 'type'].includes(sortOrder ?? ''), 'sortOrder should have valid value');
        });

        test('workspace settings are read correctly', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');

            // Read all settings
            const excludePatterns = config.get<string[]>('excludePatterns');
            const sortOrder = config.get<string>('sortOrder');

            assert.ok(excludePatterns !== undefined, 'excludePatterns should be readable');
            assert.ok(sortOrder !== undefined, 'sortOrder should be readable');
        });

        test('configuration has correct section title', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();

            assert.strictEqual(
                packageJson.contributes.configuration.title,
                'TaskTree',
                'Configuration title should be TaskTree'
            );
        });
    });

    suite('File Watcher - Package.json Auto-Discovery', () => {
        test('discovers new npm scripts after package.json creation via file watcher', async function() {
            this.timeout(20000);

            const newPackagePath = 'watcher-test/package.json';
            const provider = getTaskTreeProvider();

            try {
                // Get initial task count
                const initialTasks = provider.getAllTasks();
                const initialNpmCount = initialTasks.filter(t => t.type === 'npm').length;

                writeFile(newPackagePath, JSON.stringify({
                    name: 'watcher-test',
                    version: '1.0.0',
                    scripts: {
                        'watcher-build': 'echo "watcher build"'
                    }
                }, null, 2));

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new npm script was discovered
                const allTasks = provider.getAllTasks();
                const newNpmCount = allTasks.filter(t => t.type === 'npm').length;
                const watcherTask = allTasks.find(t => t.label === 'watcher-build' && t.type === 'npm');

                assert.strictEqual(
                    newNpmCount,
                    initialNpmCount + 1,
                    `File watcher should auto-discover new npm script. Expected ${initialNpmCount + 1}, got ${newNpmCount}`
                );
                assert.ok(watcherTask !== undefined, 'watcher-build task should be discovered');
            } finally {
                deleteFile(newPackagePath);
                const dir = getFixturePath('watcher-test');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
                await sleep(2000);
            }
        });

        test('discovers new npm script after package.json modification via file watcher', async function() {
            this.timeout(20000);

            const packageJsonPath = getFixturePath('package.json');
            const originalContent = fs.readFileSync(packageJsonPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Get initial count
                const initialTasks = provider.getAllTasks();
                const initialNpmCount = initialTasks.filter(t => t.type === 'npm').length;

                // Modify package.json to add new script
                const modified = JSON.parse(originalContent) as FixturePackageJson;
                modified.scripts['new-watcher-script'] = 'echo "new script"';
                fs.writeFileSync(packageJsonPath, JSON.stringify(modified, null, 2));

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new script was discovered
                const allTasks = provider.getAllTasks();
                const newNpmCount = allTasks.filter(t => t.type === 'npm').length;
                const newTask = allTasks.find(t => t.label === 'new-watcher-script' && t.type === 'npm');

                assert.strictEqual(
                    newNpmCount,
                    initialNpmCount + 1,
                    `File watcher should auto-discover new npm script after modification. Expected ${initialNpmCount + 1}, got ${newNpmCount}`
                );
                assert.ok(newTask !== undefined, 'new-watcher-script should be discovered');
            } finally {
                // Restore original
                fs.writeFileSync(packageJsonPath, originalContent);
                await sleep(3000);
            }
        });
    });

    suite('File Watcher - Makefile Auto-Discovery', () => {
        test('discovers new make target after Makefile creation via file watcher', async function() {
            this.timeout(20000);

            const newMakefilePath = 'watcher-make/Makefile';
            const provider = getTaskTreeProvider();

            try {
                // Get initial count
                const initialTasks = provider.getAllTasks();
                const initialMakeCount = initialTasks.filter(t => t.type === 'make').length;

                const dir = path.dirname(getFixturePath(newMakefilePath));
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(getFixturePath(newMakefilePath), 'watcher-target:\n\techo "watcher"');

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new make target was discovered
                const allTasks = provider.getAllTasks();
                const newMakeCount = allTasks.filter(t => t.type === 'make').length;
                const watcherTarget = allTasks.find(t => t.label === 'watcher-target' && t.type === 'make');

                assert.strictEqual(
                    newMakeCount,
                    initialMakeCount + 1,
                    `File watcher should auto-discover new make target. Expected ${initialMakeCount + 1}, got ${newMakeCount}`
                );
                assert.ok(watcherTarget !== undefined, 'watcher-target should be discovered');
            } finally {
                deleteFile(newMakefilePath);
                const dir = getFixturePath('watcher-make');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
                await sleep(2000);
            }
        });
    });

    suite('File Watcher - Shell Scripts Auto-Discovery', () => {
        test('detects shell script creation via file watcher', async function() {
            this.timeout(20000);

            const newScriptPath = 'scripts/watcher-script.sh';
            const provider = getTaskTreeProvider();

            try {
                // Get initial count
                const initialTasks = provider.getAllTasks();
                const initialShellCount = initialTasks.filter(t => t.type === 'shell').length;

                writeFile(newScriptPath, '#!/bin/bash\n# Watcher test script\necho "watcher"');

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new shell script was discovered
                const allTasks = provider.getAllTasks();
                const newShellCount = allTasks.filter(t => t.type === 'shell').length;

                assert.ok(fs.existsSync(getFixturePath(newScriptPath)), 'Script should be created');
                assert.strictEqual(
                    newShellCount,
                    initialShellCount + 1,
                    `File watcher should auto-discover new shell script. Expected ${initialShellCount + 1}, got ${newShellCount}`
                );
            } finally {
                deleteFile(newScriptPath);
                await sleep(2000);
            }
        });

        test('detects shell script deletion via file watcher', async function() {
            this.timeout(20000);

            const tempScriptPath = 'scripts/temp-delete.sh';
            const provider = getTaskTreeProvider();

            // Create script first
            writeFile(tempScriptPath, '#!/bin/bash\necho "temp"');
            await sleep(3000);

            // Verify it was discovered
            let tasks = provider.getAllTasks();
            const taskExists = tasks.some(t => t.filePath.includes('temp-delete.sh'));
            assert.ok(taskExists, 'Temp script should be discovered');

            const countBefore = tasks.length;

            // Delete the script
            deleteFile(tempScriptPath);

            // Wait for file watcher to auto-sync - NO refresh call!
            await sleep(3000);

            // Verify task was removed
            tasks = provider.getAllTasks();
            assert.ok(!fs.existsSync(getFixturePath(tempScriptPath)), 'Script should be deleted');
            assert.strictEqual(
                tasks.length,
                countBefore - 1,
                `File watcher should auto-remove deleted script. Expected ${countBefore - 1}, got ${tasks.length}`
            );
        });
    });

    suite('File Watcher - VS Code Config Auto-Discovery', () => {
        test('discovers new vscode task after tasks.json modification via file watcher', async function() {
            this.timeout(20000);

            const tasksJsonPath = getFixturePath('.vscode/tasks.json');
            const originalContent = fs.readFileSync(tasksJsonPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Get initial count
                const initialTasks = provider.getAllTasks();
                const initialVscodeCount = initialTasks.filter(t => t.type === 'vscode').length;

                // Parse and modify (remove comments first)
                const cleanJson = originalContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
                const tasks = JSON.parse(cleanJson) as TasksJson;
                tasks.tasks.push({
                    label: 'Watcher Test Task',
                    type: 'shell',
                    command: 'echo "watcher"'
                });

                fs.writeFileSync(tasksJsonPath, JSON.stringify(tasks, null, 4));

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new task was discovered
                const allTasks = provider.getAllTasks();
                const newVscodeCount = allTasks.filter(t => t.type === 'vscode').length;
                const watcherTask = allTasks.find(t => t.label === 'Watcher Test Task' && t.type === 'vscode');

                assert.strictEqual(
                    newVscodeCount,
                    initialVscodeCount + 1,
                    `File watcher should auto-discover new vscode task. Expected ${initialVscodeCount + 1}, got ${newVscodeCount}`
                );
                assert.ok(watcherTask !== undefined, 'Watcher Test Task should be discovered');
            } finally {
                fs.writeFileSync(tasksJsonPath, originalContent);
                await sleep(3000);
            }
        });

        test('discovers new launch config after launch.json modification via file watcher', async function() {
            this.timeout(20000);

            const launchJsonPath = getFixturePath('.vscode/launch.json');
            const originalContent = fs.readFileSync(launchJsonPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Get initial count
                const initialTasks = provider.getAllTasks();
                const initialLaunchCount = initialTasks.filter(t => t.type === 'launch').length;

                // Parse (remove comments first)
                const cleanJson = originalContent
                    .replace(/\/\/.*$/gm, '')
                    .replace(/\/\*[\s\S]*?\*\//g, '');
                const launch = JSON.parse(cleanJson) as LaunchJson;

                launch.configurations.push({
                    type: 'node',
                    request: 'launch',
                    name: 'Watcher Debug Config'
                });

                fs.writeFileSync(launchJsonPath, JSON.stringify(launch, null, 4));

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new launch config was discovered
                const allTasks = provider.getAllTasks();
                const newLaunchCount = allTasks.filter(t => t.type === 'launch').length;
                const watcherConfig = allTasks.find(t => t.label === 'Watcher Debug Config' && t.type === 'launch');

                assert.strictEqual(
                    newLaunchCount,
                    initialLaunchCount + 1,
                    `File watcher should auto-discover new launch config. Expected ${initialLaunchCount + 1}, got ${newLaunchCount}`
                );
                assert.ok(watcherConfig !== undefined, 'Watcher Debug Config should be discovered');
            } finally {
                fs.writeFileSync(launchJsonPath, originalContent);
                await sleep(3000);
            }
        });

        test('new tag appears in getAllTags after tasktree.json modification via file watcher', async function() {
            this.timeout(20000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                const config = JSON.parse(originalContent) as TagConfig;
                config.tags['watcher-tag'] = ['*watcher*'];

                fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

                // Wait for file watcher to auto-sync - NO refresh call!
                await sleep(4000);

                // Verify the new tag is available
                const allTags = provider.getAllTags();
                assert.ok(
                    allTags.includes('watcher-tag'),
                    `File watcher should auto-discover new tag. Tags: [${allTags.join(', ')}]`
                );
            } finally {
                fs.writeFileSync(tagConfigPath, originalContent);
                await sleep(3000);
            }
        });
    });

    suite('Tag Configuration', () => {
        test('tag config file has correct structure', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(
                fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')
            ) as TagConfig;

            assert.ok(typeof tagConfig.tags === 'object', 'Should have tags property as object');
        });

        test('tag patterns are arrays', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(
                fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')
            ) as TagConfig;

            for (const [tagName, patterns] of Object.entries(tagConfig.tags)) {
                assert.ok(Array.isArray(patterns), `Tag ${tagName} patterns should be an array`);
            }
        });

        test('provider returns tasks even without tasktree.json modifications', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Provider should function and return tasks
            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Should discover tasks');
        });
    });

    suite('Glob Pattern Matching', () => {
        test('exclude patterns use glob syntax', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const patterns = packageJson.contributes.configuration.properties['tasktree.excludePatterns'].default as string[];

            // All patterns should use glob syntax with **
            for (const pattern of patterns) {
                assert.ok(pattern.includes('**'), `Pattern ${pattern} should use ** glob`);
            }
        });

        test('exclude patterns support common directories', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const patterns = config.get<string[]>('excludePatterns') ?? [];

            // Should exclude common build/dependency directories
            const excludedDirs = ['node_modules', 'bin', 'obj', '.git'];

            for (const dir of excludedDirs) {
                const hasPattern = patterns.some(p => p.includes(dir));
                assert.ok(hasPattern, `Should exclude ${dir}`);
            }
        });
    });

    suite('Multiple Workspace Support', () => {
        test('works with single workspace folder', function() {
            this.timeout(10000);

            const folders = vscode.workspace.workspaceFolders;

            assert.ok(folders, 'Should have workspace folders');
            assert.ok(folders.length >= 1, 'Should have at least one workspace folder');
        });

        test('reads config from workspace root', function() {
            this.timeout(10000);

            const folders = vscode.workspace.workspaceFolders;
            assert.ok(folders && folders.length > 0, 'Should have workspace folder');

            const firstFolder = folders[0];
            if (!firstFolder) {
                throw new Error('First folder should exist');
            }

            const workspaceRoot = firstFolder.uri.fsPath;
            const vscodeDir = path.join(workspaceRoot, '.vscode');

            assert.ok(fs.existsSync(vscodeDir), '.vscode directory should exist');
        });
    });
});
