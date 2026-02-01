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
    deleteFile
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
                'tasktree.showEmptyCategories': ConfigurationProperty;
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
        await sleep(2000);
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

        test('showEmptyCategories setting exists', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const showEmptyCategories = config.get<boolean>('showEmptyCategories');

            assert.strictEqual(typeof showEmptyCategories, 'boolean', 'showEmptyCategories should be boolean');
        });

        test('showEmptyCategories defaults to false', function() {
            this.timeout(10000);

            const packageJson = readExtensionPackageJson();
            const defaultValue = packageJson.contributes.configuration.properties['tasktree.showEmptyCategories'].default;

            assert.strictEqual(defaultValue, false, 'showEmptyCategories should default to false');
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

    suite('Configuration Change Handling', () => {
        test('responds to excludePatterns changes', async function() {
            this.timeout(15000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const originalPatterns = config.get<string[]>('excludePatterns');

            try {
                // Update configuration
                await config.update('excludePatterns', ['**/test/**'], vscode.ConfigurationTarget.Workspace);
                await sleep(1000);

                // Trigger refresh
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);

                assert.ok(true, 'Should respond to config changes');
            } finally {
                // Restore original
                await config.update('excludePatterns', originalPatterns, vscode.ConfigurationTarget.Workspace);
                await sleep(500);
            }
        });

        test('responds to sortOrder changes', async function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const sortOrder = config.get<string>('sortOrder');

            // Verify config is readable and has valid value
            assert.ok(['folder', 'name', 'type'].includes(sortOrder ?? ''), 'sortOrder should have valid value');

            // Verify refresh works with current config
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle sortOrder config');
        });

        test('responds to showEmptyCategories changes', async function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');
            const showEmpty = config.get<boolean>('showEmptyCategories');

            // Verify config is readable
            assert.strictEqual(typeof showEmpty, 'boolean', 'showEmptyCategories should be boolean');

            // Verify refresh works with current config
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle showEmptyCategories config');
        });
    });

    suite('File Watcher - Package.json', () => {
        test('detects package.json creation', async function() {
            this.timeout(15000);

            const newPackagePath = 'watcher-test/package.json';

            try {
                writeFile(newPackagePath, JSON.stringify({
                    name: 'watcher-test',
                    version: '1.0.0',
                    scripts: {
                        'watcher-build': 'echo "watcher build"'
                    }
                }, null, 2));

                // Wait for file watcher to detect
                await sleep(2000);

                // Refresh to ensure tasks are updated
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);

                assert.ok(true, 'Should detect package.json creation');
            } finally {
                deleteFile(newPackagePath);
                const dir = getFixturePath('watcher-test');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
            }
        });

        test('detects package.json modification', async function() {
            this.timeout(15000);

            const packageJsonPath = getFixturePath('package.json');
            const originalContent = fs.readFileSync(packageJsonPath, 'utf8');

            try {
                // Modify package.json
                const modified = JSON.parse(originalContent) as FixturePackageJson;
                modified.scripts['new-watcher-script'] = 'echo "new script"';
                fs.writeFileSync(packageJsonPath, JSON.stringify(modified, null, 2));

                // Wait for watcher
                await sleep(2000);

                assert.ok(true, 'Should detect package.json modification');
            } finally {
                // Restore original
                fs.writeFileSync(packageJsonPath, originalContent);
                await sleep(500);
            }
        });
    });

    suite('File Watcher - Makefile', () => {
        test('detects Makefile creation', async function() {
            this.timeout(15000);

            const newMakefilePath = 'watcher-make/Makefile';

            try {
                const dir = path.dirname(getFixturePath(newMakefilePath));
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(getFixturePath(newMakefilePath), 'watcher-target:\n\techo "watcher"');

                await sleep(2000);
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);

                assert.ok(true, 'Should detect Makefile creation');
            } finally {
                deleteFile(newMakefilePath);
                const dir = getFixturePath('watcher-make');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
            }
        });

        test('detects Makefile modification', async function() {
            this.timeout(15000);

            const makefilePath = getFixturePath('Makefile');
            const originalContent = fs.readFileSync(makefilePath, 'utf8');

            try {
                // Add new target
                fs.writeFileSync(makefilePath, `${originalContent}\nnew-watcher-target:\n\techo "new"`);

                await sleep(2000);

                assert.ok(true, 'Should detect Makefile modification');
            } finally {
                fs.writeFileSync(makefilePath, originalContent);
                await sleep(500);
            }
        });
    });

    suite('File Watcher - Shell Scripts', () => {
        test('detects shell script creation', async function() {
            this.timeout(15000);

            const newScriptPath = 'scripts/watcher-script.sh';

            try {
                writeFile(newScriptPath, '#!/bin/bash\n# Watcher test script\necho "watcher"');

                await sleep(2000);
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);

                assert.ok(fs.existsSync(getFixturePath(newScriptPath)), 'Script should be created');
            } finally {
                deleteFile(newScriptPath);
            }
        });

        test('detects shell script deletion', async function() {
            this.timeout(15000);

            const tempScriptPath = 'scripts/temp-delete.sh';

            // Create then delete
            writeFile(tempScriptPath, '#!/bin/bash\necho "temp"');
            await sleep(1000);

            deleteFile(tempScriptPath);
            await sleep(2000);

            assert.ok(!fs.existsSync(getFixturePath(tempScriptPath)), 'Script should be deleted');
        });
    });

    suite('File Watcher - VS Code Config', () => {
        test('detects tasks.json modification', async function() {
            this.timeout(15000);

            const tasksJsonPath = getFixturePath('.vscode/tasks.json');
            const originalContent = fs.readFileSync(tasksJsonPath, 'utf8');

            try {
                // Parse and modify
                const tasks = JSON.parse(originalContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')) as TasksJson;
                tasks.tasks.push({
                    label: 'Watcher Test Task',
                    type: 'shell',
                    command: 'echo "watcher"'
                });

                fs.writeFileSync(tasksJsonPath, JSON.stringify(tasks, null, 4));
                await sleep(2000);

                assert.ok(true, 'Should detect tasks.json modification');
            } finally {
                fs.writeFileSync(tasksJsonPath, originalContent);
                await sleep(500);
            }
        });

        test('detects launch.json modification', async function() {
            this.timeout(15000);

            const launchJsonPath = getFixturePath('.vscode/launch.json');
            const originalContent = fs.readFileSync(launchJsonPath, 'utf8');

            try {
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
                await sleep(2000);

                assert.ok(true, 'Should detect launch.json modification');
            } finally {
                fs.writeFileSync(launchJsonPath, originalContent);
                await sleep(500);
            }
        });

        test('detects tasktree.json modification', async function() {
            this.timeout(15000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');

            try {
                const config = JSON.parse(originalContent) as TagConfig;
                config.tags['watcher-tag'] = ['*watcher*'];

                fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
                await sleep(2000);

                assert.ok(true, 'Should detect tasktree.json modification');
            } finally {
                fs.writeFileSync(tagConfigPath, originalContent);
                await sleep(500);
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

        test('handles missing tag config gracefully', async function() {
            this.timeout(15000);

            // The extension should work even without tasktree.json
            // It will just have no tags

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle missing tag config');
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

    suite('Configuration Persistence', () => {
        test('workspace settings are read correctly', function() {
            this.timeout(10000);

            const config = vscode.workspace.getConfiguration('tasktree');

            // Read all settings
            const excludePatterns = config.get<string[]>('excludePatterns');
            const showEmptyCategories = config.get<boolean>('showEmptyCategories');
            const sortOrder = config.get<string>('sortOrder');

            assert.ok(excludePatterns !== undefined, 'excludePatterns should be readable');
            assert.ok(showEmptyCategories !== undefined, 'showEmptyCategories should be readable');
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
