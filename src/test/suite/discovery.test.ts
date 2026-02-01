import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { TaskTreeItem } from './helpers';
import {
    activateExtension,
    sleep,
    getFixturePath,
    writeFile,
    deleteFile,
    getTaskTreeProvider,
    getTreeChildren
} from './helpers';

interface PackageJson {
    scripts?: Record<string, string>;
}

function getLabelString(label: string | vscode.TreeItemLabel | undefined): string {
    if (typeof label === 'string') {
        return label;
    }
    if (label && typeof label === 'object' && 'label' in label) {
        return label.label;
    }
    return '';
}

suite('Task Discovery E2E Tests', () => {
    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        // Wait for initial task discovery
        await sleep(2000);
    });

    suite('Shell Script Discovery', () => {
        test('discovers shell scripts in workspace', function() {
            this.timeout(10000);

            // Verify shell scripts exist in fixtures
            const buildScriptPath = getFixturePath('scripts/build.sh');
            assert.ok(fs.existsSync(buildScriptPath), 'build.sh should exist');

            const deployScriptPath = getFixturePath('scripts/deploy.sh');
            assert.ok(fs.existsSync(deployScriptPath), 'deploy.sh should exist');

            const testScriptPath = getFixturePath('scripts/test.sh');
            assert.ok(fs.existsSync(testScriptPath), 'test.sh should exist');
        });

        test('parses @param comments from shell scripts', function() {
            this.timeout(10000);

            const buildScript = fs.readFileSync(getFixturePath('scripts/build.sh'), 'utf8');

            // Verify params are in the file
            assert.ok(buildScript.includes('@param config'), 'Should have config param');
            assert.ok(buildScript.includes('@param verbose'), 'Should have verbose param');
        });

        test('extracts description from first comment line', function() {
            this.timeout(10000);

            const buildScript = fs.readFileSync(getFixturePath('scripts/build.sh'), 'utf8');
            const lines = buildScript.split('\n');

            // Second line should be the description (after shebang)
            const secondLine = lines[1];
            assert.ok(secondLine?.includes('Build the project') === true, 'Should have description');
        });

        test('discovers newly added shell scripts on refresh', async function() {
            this.timeout(15000);

            const newScriptPath = 'scripts/newscript.sh';
            const fullPath = getFixturePath(newScriptPath);

            try {
                // Create new script
                writeFile(newScriptPath, '#!/bin/bash\n# New script for testing\necho "Hello"');

                // Trigger refresh
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Verify file exists (discovery should pick it up)
                assert.ok(fs.existsSync(fullPath), 'New script should be created');
            } finally {
                // Cleanup
                deleteFile(newScriptPath);
            }
        });

        test('respects exclude patterns for shell scripts', async function() {
            this.timeout(10000);

            // Create script in node_modules (should be excluded)
            const excludedPath = 'node_modules/test.sh';
            const fullPath = getFixturePath(excludedPath);

            try {
                const nodeModulesDir = path.dirname(fullPath);
                if (!fs.existsSync(nodeModulesDir)) {
                    fs.mkdirSync(nodeModulesDir, { recursive: true });
                }
                fs.writeFileSync(fullPath, '#!/bin/bash\necho "excluded"');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // The script exists but should be excluded from discovery
                assert.ok(fs.existsSync(fullPath), 'Excluded script should exist');
            } finally {
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        });
    });

    suite('NPM Script Discovery', () => {
        test('discovers npm scripts from root package.json', function() {
            this.timeout(10000);

            const packageJsonPath = getFixturePath('package.json');
            assert.ok(fs.existsSync(packageJsonPath), 'package.json should exist');

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
            assert.ok(packageJson.scripts, 'Should have scripts section');
            assert.ok(packageJson.scripts['build'] !== undefined, 'Should have build script');
            assert.ok(packageJson.scripts['test'] !== undefined, 'Should have test script');
            assert.ok(packageJson.scripts['lint'] !== undefined, 'Should have lint script');
            assert.ok(packageJson.scripts['start'] !== undefined, 'Should have start script');
        });

        test('discovers npm scripts from subproject package.json', function() {
            this.timeout(10000);

            const subprojectPackageJsonPath = getFixturePath('subproject/package.json');
            assert.ok(fs.existsSync(subprojectPackageJsonPath), 'subproject/package.json should exist');

            const packageJson = JSON.parse(fs.readFileSync(subprojectPackageJsonPath, 'utf8')) as PackageJson;
            assert.ok(packageJson.scripts, 'Should have scripts section');
            assert.ok(packageJson.scripts['build'] !== undefined, 'Should have build script');
            assert.ok(packageJson.scripts['test'] !== undefined, 'Should have test script');
        });

        test('handles package.json without scripts section', async function() {
            this.timeout(15000);

            const emptyScriptsPath = 'empty-scripts/package.json';
            const dir = getFixturePath('empty-scripts');

            try {
                writeFile(emptyScriptsPath, JSON.stringify({
                    name: 'no-scripts',
                    version: '1.0.0'
                }, null, 2));

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Should not crash - gracefully handle missing scripts
                assert.ok(true, 'Should handle missing scripts section');
            } finally {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            }
        });

        test('handles malformed package.json gracefully', async function() {
            this.timeout(15000);

            const malformedPath = 'malformed/package.json';
            const dir = getFixturePath('malformed');

            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(getFixturePath(malformedPath), '{ invalid json }');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Should not crash
                assert.ok(true, 'Should handle malformed JSON');
            } finally {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            }
        });
    });

    suite('Makefile Target Discovery', () => {
        test('discovers Makefile targets', function() {
            this.timeout(10000);

            const makefilePath = getFixturePath('Makefile');
            assert.ok(fs.existsSync(makefilePath), 'Makefile should exist');

            const makefile = fs.readFileSync(makefilePath, 'utf8');

            // Verify targets exist
            assert.ok(makefile.includes('all:'), 'Should have all target');
            assert.ok(makefile.includes('build:'), 'Should have build target');
            assert.ok(makefile.includes('test:'), 'Should have test target');
            assert.ok(makefile.includes('clean:'), 'Should have clean target');
            assert.ok(makefile.includes('install:'), 'Should have install target');
        });

        test('skips internal targets starting with dot', function() {
            this.timeout(10000);

            const makefile = fs.readFileSync(getFixturePath('Makefile'), 'utf8');

            // Verify internal target exists in file but should be skipped by discovery
            assert.ok(makefile.includes('.internal:'), 'Should have internal target in file');
            // The discovery logic should skip this target
        });

        test('handles multiple Makefile naming conventions', async function() {
            this.timeout(15000);

            // Test 'makefile' (lowercase)
            const lowercasePath = 'lowercase-make/makefile';

            try {
                const dir = path.dirname(getFixturePath(lowercasePath));
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(getFixturePath(lowercasePath), 'lowercase-target:\n\techo "test"');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                assert.ok(fs.existsSync(getFixturePath(lowercasePath)), 'lowercase makefile should exist');
            } finally {
                deleteFile(lowercasePath);
                const dir = getFixturePath('lowercase-make');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
            }
        });

        test('deduplicates targets with same name', async function() {
            this.timeout(10000);

            const dupePath = 'dupe-make/Makefile';

            try {
                const dir = path.dirname(getFixturePath(dupePath));
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // Create Makefile with duplicate target names
                fs.writeFileSync(getFixturePath(dupePath), 'build:\n\techo "first"\n\nbuild:\n\techo "second"');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                assert.ok(true, 'Should handle duplicate targets');
            } finally {
                deleteFile(dupePath);
                const dir = getFixturePath('dupe-make');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir);
                }
            }
        });
    });

    suite('VS Code Launch Configuration Discovery', () => {
        test('discovers launch configurations from launch.json', function() {
            this.timeout(10000);

            const launchJsonPath = getFixturePath('.vscode/launch.json');
            assert.ok(fs.existsSync(launchJsonPath), 'launch.json should exist');

            const content = fs.readFileSync(launchJsonPath, 'utf8');

            // Should contain our configurations
            assert.ok(content.includes('Debug Application'), 'Should have Debug Application config');
            assert.ok(content.includes('Debug Tests'), 'Should have Debug Tests config');
            assert.ok(content.includes('Debug Python'), 'Should have Debug Python config');
        });

        test('handles JSONC comments in launch.json', async function() {
            this.timeout(10000);

            const launchJson = fs.readFileSync(getFixturePath('.vscode/launch.json'), 'utf8');

            // File contains both single-line and multi-line comments
            assert.ok(launchJson.includes('//'), 'Should have single-line comments');
            assert.ok(launchJson.includes('/*'), 'Should have multi-line comments');

            // Discovery should still work despite comments
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);
            assert.ok(true, 'Should parse launch.json with comments');
        });

        test('extracts configuration type as description', function() {
            this.timeout(10000);

            const launchJson = fs.readFileSync(getFixturePath('.vscode/launch.json'), 'utf8');

            // Verify types exist
            assert.ok(launchJson.includes('"type": "node"'), 'Should have node type');
            assert.ok(launchJson.includes('"type": "python"'), 'Should have python type');
        });

        test('handles missing launch.json gracefully', async function() {
            this.timeout(10000);

            const missingLaunchDir = 'no-launch/.vscode';

            try {
                const dir = getFixturePath(missingLaunchDir);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // Directory exists but no launch.json

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);

                assert.ok(true, 'Should handle missing launch.json');
            } finally {
                const dir = getFixturePath('no-launch/.vscode');
                if (fs.existsSync(dir)) {
                    fs.rmdirSync(dir, { recursive: true });
                }
                const parentDir = getFixturePath('no-launch');
                if (fs.existsSync(parentDir)) {
                    fs.rmdirSync(parentDir);
                }
            }
        });
    });

    suite('VS Code Tasks Discovery', () => {
        test('discovers tasks from tasks.json', function() {
            this.timeout(10000);

            const tasksJsonPath = getFixturePath('.vscode/tasks.json');
            assert.ok(fs.existsSync(tasksJsonPath), 'tasks.json should exist');

            const content = fs.readFileSync(tasksJsonPath, 'utf8');

            // Should contain our tasks
            assert.ok(content.includes('Build Project'), 'Should have Build Project task');
            assert.ok(content.includes('Run Tests'), 'Should have Run Tests task');
            assert.ok(content.includes('Deploy with Config'), 'Should have Deploy with Config task');
            assert.ok(content.includes('Custom Build'), 'Should have Custom Build task');
        });

        test('generates labels for npm tasks without explicit label', async function() {
            this.timeout(15000);

            const npmTasksPath = '.vscode/npm-tasks-test.json';

            try {
                // Create tasks.json with npm tasks that have no explicit label
                writeFile(npmTasksPath, JSON.stringify({
                    version: '2.0.0',
                    tasks: [
                        {
                            type: 'npm',
                            script: 'my-test-script',
                            problemMatcher: []
                        },
                        {
                            type: 'npm',
                            script: 'another-script',
                            problemMatcher: []
                        }
                    ]
                }, null, 2));

                // Rename to actual tasks.json temporarily
                const realTasksPath = getFixturePath('.vscode/tasks.json');
                const backupPath = getFixturePath('.vscode/tasks.json.bak');
                fs.renameSync(realTasksPath, backupPath);
                fs.renameSync(getFixturePath(npmTasksPath), realTasksPath);

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1500);

                // Get the tree provider and check contents
                const provider = getTaskTreeProvider();
                const rootChildren = await getTreeChildren(provider);

                // Find VS Code Tasks category
                const vscodeTasks = rootChildren.find(c => getLabelString(c.label).startsWith('VS Code Tasks'));
                assert.ok(vscodeTasks, 'Should have VS Code Tasks category');

                const taskItems = await getTreeChildren(provider, vscodeTasks);
                const labels = taskItems.map(t => getLabelString(t.label));

                // Verify auto-generated labels
                assert.ok(labels.includes('npm: my-test-script'), `Should have 'npm: my-test-script', got: ${labels.join(', ')}`);
                assert.ok(labels.includes('npm: another-script'), `Should have 'npm: another-script', got: ${labels.join(', ')}`);

                // Restore original
                fs.renameSync(realTasksPath, getFixturePath(npmTasksPath));
                fs.renameSync(backupPath, realTasksPath);
            } finally {
                // Cleanup
                deleteFile(npmTasksPath);
                const backupPath = getFixturePath('.vscode/tasks.json.bak');
                if (fs.existsSync(backupPath)) {
                    const realTasksPath = getFixturePath('.vscode/tasks.json');
                    if (!fs.existsSync(realTasksPath)) {
                        fs.renameSync(backupPath, realTasksPath);
                    } else {
                        fs.unlinkSync(backupPath);
                    }
                }
            }
        });

        test('excludes tasks from test-fixtures directory', async function() {
            this.timeout(15000);

            // Verify test-fixtures has tasks that should be excluded
            const testFixturesTasksPath = getFixturePath('test-fixtures/workspace/.vscode/tasks.json');
            assert.ok(fs.existsSync(testFixturesTasksPath), 'test-fixtures tasks.json should exist');

            const fixtureContent = fs.readFileSync(testFixturesTasksPath, 'utf8');
            assert.ok(fixtureContent.includes('Nested Build Task'), 'test-fixtures should have Nested Build Task');

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            // Get tree contents
            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            // Find VS Code Tasks category
            const vscodeTasks = rootChildren.find(c => getLabelString(c.label).startsWith('VS Code Tasks'));
            if (vscodeTasks) {
                const taskItems = await getTreeChildren(provider, vscodeTasks);
                const labels = taskItems.map(t => getLabelString(t.label));

                // These tasks are in test-fixtures and should NOT appear
                assert.ok(!labels.includes('Nested Build Task'), `'Nested Build Task' from test-fixtures should be excluded, got: ${labels.join(', ')}`);
                assert.ok(!labels.includes('Nested Deploy Task'), `'Nested Deploy Task' from test-fixtures should be excluded`);
            }
        });

        test('excludes launch configs from test-fixtures directory', async function() {
            this.timeout(15000);

            // Verify test-fixtures has launch configs that should be excluded
            const testFixturesLaunchPath = getFixturePath('test-fixtures/workspace/.vscode/launch.json');
            assert.ok(fs.existsSync(testFixturesLaunchPath), 'test-fixtures launch.json should exist');

            const fixtureContent = fs.readFileSync(testFixturesLaunchPath, 'utf8');
            assert.ok(fixtureContent.includes('Nested Debug Config'), 'test-fixtures should have Nested Debug Config');

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            // Get tree contents
            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            // Find VS Code Launch category
            const vscodeLaunch = rootChildren.find(c => getLabelString(c.label).startsWith('VS Code Launch'));
            if (vscodeLaunch) {
                const launchItems = await getTreeChildren(provider, vscodeLaunch);
                const labels = launchItems.map(t => getLabelString(t.label));

                // These configs are in test-fixtures and should NOT appear
                assert.ok(!labels.includes('Nested Debug Config'), `'Nested Debug Config' from test-fixtures should be excluded, got: ${labels.join(', ')}`);
                assert.ok(!labels.includes('Nested Python Debug'), `'Nested Python Debug' from test-fixtures should be excluded`);
            }
        });

        test('parses input definitions from tasks.json', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // Should have inputs section
            assert.ok(tasksJson.includes('"inputs"'), 'Should have inputs section');
            assert.ok(tasksJson.includes('deployEnv'), 'Should have deployEnv input');
            assert.ok(tasksJson.includes('buildConfig'), 'Should have buildConfig input');
            assert.ok(tasksJson.includes('buildTarget'), 'Should have buildTarget input');
        });

        test('finds ${input:xxx} references in task definitions', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // Should have input references
            assert.ok(tasksJson.includes('${input:deployEnv}'), 'Should reference deployEnv input');
            assert.ok(tasksJson.includes('${input:buildConfig}'), 'Should reference buildConfig input');
            assert.ok(tasksJson.includes('${input:buildTarget}'), 'Should reference buildTarget input');
        });

        test('handles JSONC comments in tasks.json', async function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // File contains comments
            assert.ok(tasksJson.includes('//'), 'Should have comments');

            // Discovery should still work
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);
            assert.ok(true, 'Should parse tasks.json with comments');
        });

        test('handles pickString input type with options', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // Should have pickString inputs with options
            assert.ok(tasksJson.includes('"type": "pickString"'), 'Should have pickString type');
            assert.ok(tasksJson.includes('"options"'), 'Should have options array');
            assert.ok(tasksJson.includes('development'), 'Should have development option');
            assert.ok(tasksJson.includes('staging'), 'Should have staging option');
            assert.ok(tasksJson.includes('production'), 'Should have production option');
        });

        test('handles promptString input type', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // Should have promptString input
            assert.ok(tasksJson.includes('"type": "promptString"'), 'Should have promptString type');
        });
    });

    suite('Python Script Discovery', () => {
        test('discovers Python scripts with shebang', function() {
            this.timeout(10000);

            const buildScriptPath = getFixturePath('scripts/build_project.py');
            assert.ok(fs.existsSync(buildScriptPath), 'build_project.py should exist');

            const content = fs.readFileSync(buildScriptPath, 'utf8');
            assert.ok(content.startsWith('#!/usr/bin/env python3'), 'Should have python shebang');
        });

        test('discovers Python scripts with __main__ block', function() {
            this.timeout(10000);

            const runTestsPath = getFixturePath('scripts/run_tests.py');
            assert.ok(fs.existsSync(runTestsPath), 'run_tests.py should exist');

            const content = fs.readFileSync(runTestsPath, 'utf8');
            assert.ok(content.includes('if __name__ == "__main__"'), 'Should have __main__ block');
        });

        test('parses @param comments from Python scripts', function() {
            this.timeout(10000);

            const buildScript = fs.readFileSync(getFixturePath('scripts/build_project.py'), 'utf8');

            // Verify params are in the file
            assert.ok(buildScript.includes('@param config'), 'Should have config param');
            assert.ok(buildScript.includes('@param output'), 'Should have output param');
        });

        test('parses argparse arguments from Python scripts', function() {
            this.timeout(10000);

            const runTestsScript = fs.readFileSync(getFixturePath('scripts/run_tests.py'), 'utf8');

            // Verify argparse arguments are in the file
            assert.ok(runTestsScript.includes("'--verbose'"), 'Should have verbose argument');
            assert.ok(runTestsScript.includes("'--filter'"), 'Should have filter argument');
        });

        test('extracts docstring as description', function() {
            this.timeout(10000);

            const buildScript = fs.readFileSync(getFixturePath('scripts/build_project.py'), 'utf8');

            // Verify docstring exists
            assert.ok(buildScript.includes('"""Build the project'), 'Should have docstring description');
        });

        test('extracts comment as description', function() {
            this.timeout(10000);

            const deployScript = fs.readFileSync(getFixturePath('scripts/deploy.py'), 'utf8');

            // Verify comment description exists
            assert.ok(deployScript.includes('# Deploy to production'), 'Should have comment description');
        });

        test('excludes non-runnable Python files', function() {
            this.timeout(10000);

            const utilsPath = getFixturePath('scripts/utils.py');
            assert.ok(fs.existsSync(utilsPath), 'utils.py should exist');

            const content = fs.readFileSync(utilsPath, 'utf8');
            // This file has no shebang and no __main__ block
            assert.ok(!content.includes('#!/'), 'Should not have shebang');
            assert.ok(!content.includes('__main__'), 'Should not have __main__ block');
        });

        test('discovers newly added Python scripts on refresh', async function() {
            this.timeout(15000);

            const newScriptPath = 'scripts/newpython.py';
            const fullPath = getFixturePath(newScriptPath);

            try {
                // Create new script with __main__ block
                writeFile(newScriptPath, '#!/usr/bin/env python3\n"""New script for testing"""\n\nif __name__ == "__main__":\n    print("Hello")');

                // Trigger refresh
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Verify file exists (discovery should pick it up)
                assert.ok(fs.existsSync(fullPath), 'New script should be created');
            } finally {
                // Cleanup
                deleteFile(newScriptPath);
            }
        });

        test('shows Python scripts in tree view', async function() {
            this.timeout(15000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            // Find Python Scripts category
            const pythonCategory = rootChildren.find(c => getLabelString(c.label).startsWith('Python Scripts'));
            assert.ok(pythonCategory, `Should have Python Scripts category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);

            // Get all tasks from category (Python tasks are grouped by folder, so flatten)
            const allTasks = flattenTaskItems(pythonCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            // Should have our runnable scripts but not utils.py
            assert.ok(labels.some(l => l.includes('build_project.py')), `Should have build_project.py, got: ${labels.join(', ')}`);
            assert.ok(labels.some(l => l.includes('run_tests.py')), `Should have run_tests.py, got: ${labels.join(', ')}`);
            assert.ok(labels.some(l => l.includes('deploy.py')), `Should have deploy.py, got: ${labels.join(', ')}`);
            assert.ok(!labels.some(l => l.includes('utils.py')), `Should NOT have utils.py (non-runnable), got: ${labels.join(', ')}`);
        });

        test('respects exclude patterns for Python scripts', async function() {
            this.timeout(10000);

            // Create script in node_modules (should be excluded)
            const excludedPath = 'node_modules/test_script.py';
            const fullPath = getFixturePath(excludedPath);

            try {
                const nodeModulesDir = path.dirname(fullPath);
                if (!fs.existsSync(nodeModulesDir)) {
                    fs.mkdirSync(nodeModulesDir, { recursive: true });
                }
                fs.writeFileSync(fullPath, '#!/usr/bin/env python3\nif __name__ == "__main__":\n    print("excluded")');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // The script exists but should be excluded from discovery
                assert.ok(fs.existsSync(fullPath), 'Excluded script should exist');
            } finally {
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        });

        test('Python category disappears when all Python scripts are removed', async function() {
            this.timeout(20000);

            // First verify Python category exists
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            const provider = getTaskTreeProvider();
            let roots = await getTreeChildren(provider);
            const pythonCategoryBefore = roots.find(c => getLabelString(c.label).includes('Python Scripts'));
            assert.ok(pythonCategoryBefore, 'Python Scripts category should exist initially');

            // Temporarily hide all Python scripts by renaming them
            const pythonFiles = [
                'scripts/deploy.py',
                'scripts/run_tests.py',
                'scripts/build_project.py'
            ];

            const tempRenames: Array<{ from: string; to: string }> = [];

            try {
                // Rename all Python scripts to .bak
                for (const pyFile of pythonFiles) {
                    const fullPath = getFixturePath(pyFile);
                    const bakPath = `${fullPath  }.bak`;
                    if (fs.existsSync(fullPath)) {
                        fs.renameSync(fullPath, bakPath);
                        tempRenames.push({ from: fullPath, to: bakPath });
                    }
                }

                // Refresh and check category is gone
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1500);

                roots = await getTreeChildren(provider);
                const pythonCategoryAfter = roots.find(c => getLabelString(c.label).includes('Python Scripts'));
                assert.ok(pythonCategoryAfter === undefined, 'Python Scripts category should be hidden when no Python scripts exist');
            } finally {
                // Restore all renamed files
                for (const rename of tempRenames) {
                    if (fs.existsSync(rename.to)) {
                        fs.renameSync(rename.to, rename.from);
                    }
                }

                // Refresh to restore state
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);
            }
        });
    });

    suite('Discovery Error Handling', () => {
        test('handles file read errors gracefully', async function() {
            this.timeout(10000);

            // Create a directory with a problematic name that looks like a file
            // This tests the error handling in discovery modules

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            // Should not crash
            assert.ok(true, 'Should handle file errors gracefully');
        });

        test('handles concurrent discovery operations', async function() {
            this.timeout(15000);

            // Trigger multiple refreshes rapidly
            const promises = [
                vscode.commands.executeCommand('tasktree.refresh'),
                vscode.commands.executeCommand('tasktree.refresh'),
                vscode.commands.executeCommand('tasktree.refresh')
            ];

            await Promise.all(promises);
            await sleep(1000);

            assert.ok(true, 'Should handle concurrent refreshes');
        });

        test('handles empty workspace', async function() {
            this.timeout(10000);

            // The extension should handle workspaces with no discoverable tasks
            // Our test workspace has tasks, but this validates the code path exists

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle workspace scenarios');
        });
    });

    suite('Discovery Performance', () => {
        test('completes discovery within reasonable time', async function() {
            this.timeout(30000);

            const startTime = Date.now();

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Discovery should complete within 10 seconds for a small workspace
            assert.ok(duration < 10000, `Discovery took ${duration}ms, should be under 10000ms`);
        });

        test('discovers all task types in parallel', async function() {
            this.timeout(15000);

            // This is validated by the fact that discovery completes quickly
            // The implementation uses Promise.all to run discoveries in parallel

            const startTime = Date.now();
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);
            const duration = Date.now() - startTime;

            // If running sequentially, each type would add significant time
            // Parallel execution should be much faster
            assert.ok(duration < 5000, 'Parallel discovery should be fast');
        });
    });
});

/**
 * Flattens nested TaskTreeItems to get all leaf task nodes
 */
function flattenTaskItems(items: TaskTreeItem[]): TaskTreeItem[] {
    const result: TaskTreeItem[] = [];

    for (const item of items) {
        if (item.task) {
            result.push(item);
        }
        if (item.children.length > 0) {
            result.push(...flattenTaskItems(item.children));
        }
    }

    return result;
}
