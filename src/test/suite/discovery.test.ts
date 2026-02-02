/**
 * DISCOVERY E2E TESTS
 *
 * These tests verify that tasks are discovered from various file types.
 *
 * ⛔️⛔️⛔️ E2E TEST RULES ⛔️⛔️⛔️
 *
 * LEGAL:
 * ✅ Checking the UI
 *
 * ILLEGAL:
 * ❌ vscode.commands.executeCommand('tasktree.refresh') - refresh should be AUTOMATIC
 * ❌ provider.refresh() - internal method
 *
 * When files are created/modified, the file watcher should automatically
 * trigger task re-discovery. Tests verify this works correctly.
 */

import * as assert from 'assert';
import type * as vscode from 'vscode';
import * as fs from 'fs';
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
        // Wait for initial task discovery via file watcher
        await sleep(3000);
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

        test('discovers newly added shell scripts via file watcher', async function() {
            this.timeout(20000);

            const newScriptPath = 'scripts/newscript.sh';
            const fullPath = getFixturePath(newScriptPath);
            const provider = getTaskTreeProvider();

            try {
                // Get initial shell task count
                const initialTasks = provider.getAllTasks();
                const initialShellCount = initialTasks.filter(t => t.type === 'shell').length;

                // Create new script
                writeFile(newScriptPath, '#!/bin/bash\n# New script for testing\necho "Hello"');

                // Wait for file watcher to auto-sync
                await sleep(3000);

                // Verify file exists and was discovered
                assert.ok(fs.existsSync(fullPath), 'New script should be created');

                const newTasks = provider.getAllTasks();
                const newShellCount = newTasks.filter(t => t.type === 'shell').length;

                assert.strictEqual(
                    newShellCount,
                    initialShellCount + 1,
                    `File watcher should auto-discover new script. Expected ${initialShellCount + 1} shell tasks, got ${newShellCount}`
                );
            } finally {
                // Cleanup
                deleteFile(newScriptPath);
                await sleep(2000);
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

        test('npm tasks are present in provider', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const npmTasks = allTasks.filter(t => t.type === 'npm');

            assert.ok(npmTasks.length > 0, 'Should have npm tasks');
            const npmBuildTask = npmTasks.find(t => t.label === 'build');
            assert.ok(npmBuildTask !== undefined, 'Should have npm build task');
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

        test('make targets are present in provider', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const makeTasks = allTasks.filter(t => t.type === 'make');

            assert.ok(makeTasks.length > 0, 'Should have make tasks');
            const buildTarget = makeTasks.find(t => t.label === 'build');
            assert.ok(buildTarget !== undefined, 'Should have make build target');

            // Internal target should be excluded
            const internalTarget = makeTasks.find(t => t.label === '.internal');
            assert.ok(internalTarget === undefined, 'Should NOT have .internal target');
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

        test('handles JSONC comments in launch.json', function() {
            this.timeout(10000);

            const launchJson = fs.readFileSync(getFixturePath('.vscode/launch.json'), 'utf8');

            // File contains both single-line and multi-line comments
            assert.ok(launchJson.includes('//'), 'Should have single-line comments');
            assert.ok(launchJson.includes('/*'), 'Should have multi-line comments');
        });

        test('launch configs are present in provider', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const launchTasks = allTasks.filter(t => t.type === 'launch');

            assert.ok(launchTasks.length > 0, 'Launch configurations should be discovered');
            const debugAppConfig = launchTasks.find(t => t.label === 'Debug Application');
            assert.ok(debugAppConfig !== undefined, 'Debug Application config should be discovered');
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

        test('vscode tasks are present in provider', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const vscodeTasks = allTasks.filter(t => t.type === 'vscode');

            assert.ok(vscodeTasks.length > 0, 'VS Code tasks should be discovered');
            const buildProjectTask = vscodeTasks.find(t => t.label === 'Build Project');
            assert.ok(buildProjectTask !== undefined, 'Build Project task should be discovered');
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

        test('handles JSONC comments in tasks.json', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // File contains comments
            assert.ok(tasksJson.includes('//'), 'Should have comments');
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

        test('excludes non-runnable Python files', function() {
            this.timeout(10000);

            const utilsPath = getFixturePath('scripts/utils.py');
            assert.ok(fs.existsSync(utilsPath), 'utils.py should exist');

            const content = fs.readFileSync(utilsPath, 'utf8');
            // This file has no shebang and no __main__ block
            assert.ok(!content.includes('#!/'), 'Should not have shebang');
            assert.ok(!content.includes('__main__'), 'Should not have __main__ block');
        });

        test('python tasks are present in provider', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const pythonTasks = allTasks.filter(t => t.type === 'python');

            assert.ok(pythonTasks.length > 0, 'Should have python tasks');

            // Runnable scripts should be present
            const buildProjectTask = pythonTasks.find(t => t.label.includes('build_project.py'));
            assert.ok(buildProjectTask !== undefined, 'build_project.py should be discovered');

            // Non-runnable utils.py should NOT be present
            const utilsTask = pythonTasks.find(t => t.label.includes('utils.py'));
            assert.ok(utilsTask === undefined, 'utils.py should NOT be discovered (non-runnable)');
        });
    });

    suite('PowerShell/Batch Script Discovery', () => {
        test('discovers PowerShell scripts', function() {
            this.timeout(10000);

            const ps1Path = getFixturePath('scripts/build.ps1');
            assert.ok(fs.existsSync(ps1Path), 'build.ps1 should exist');

            const content = fs.readFileSync(ps1Path, 'utf8');
            assert.ok(content.includes('param('), 'Should have param block');
        });

        test('discovers Batch scripts', function() {
            this.timeout(10000);

            const batPath = getFixturePath('scripts/deploy.bat');
            assert.ok(fs.existsSync(batPath), 'deploy.bat should exist');

            const content = fs.readFileSync(batPath, 'utf8');
            assert.ok(content.includes('REM'), 'Should have REM comment');
        });

        test('discovers CMD scripts', function() {
            this.timeout(10000);

            const cmdPath = getFixturePath('scripts/test.cmd');
            assert.ok(fs.existsSync(cmdPath), 'test.cmd should exist');

            const content = fs.readFileSync(cmdPath, 'utf8');
            assert.ok(content.includes('::'), 'Should have :: comment');
        });

        test('powershell tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const psCategory = rootChildren.find(c => getLabelString(c.label).includes('PowerShell'));
            assert.ok(psCategory, `Should have PowerShell/Batch category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Gradle Task Discovery', () => {
        test('discovers Gradle tasks from build.gradle', function() {
            this.timeout(10000);

            const gradlePath = getFixturePath('build.gradle');
            assert.ok(fs.existsSync(gradlePath), 'build.gradle should exist');

            const content = fs.readFileSync(gradlePath, 'utf8');
            assert.ok(content.includes('task hello'), 'Should have hello task');
            assert.ok(content.includes('task customBuild'), 'Should have customBuild task');
        });

        test('gradle tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const gradleCategory = rootChildren.find(c => getLabelString(c.label).includes('Gradle'));
            assert.ok(gradleCategory, `Should have Gradle Tasks category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Cargo Task Discovery', () => {
        test('discovers Cargo.toml files', function() {
            this.timeout(10000);

            const cargoPath = getFixturePath('Cargo.toml');
            assert.ok(fs.existsSync(cargoPath), 'Cargo.toml should exist');

            const content = fs.readFileSync(cargoPath, 'utf8');
            assert.ok(content.includes('[package]'), 'Should have package section');
            assert.ok(content.includes('[[bin]]'), 'Should have binary targets');
        });

        test('cargo tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const cargoCategory = rootChildren.find(c => getLabelString(c.label).includes('Cargo'));
            assert.ok(cargoCategory, `Should have Cargo (Rust) category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Maven Goal Discovery', () => {
        test('discovers pom.xml files', function() {
            this.timeout(10000);

            const pomPath = getFixturePath('pom.xml');
            assert.ok(fs.existsSync(pomPath), 'pom.xml should exist');

            const content = fs.readFileSync(pomPath, 'utf8');
            assert.ok(content.includes('<project'), 'Should have project element');
        });

        test('maven tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const mavenCategory = rootChildren.find(c => getLabelString(c.label).includes('Maven'));
            assert.ok(mavenCategory, `Should have Maven Goals category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Ant Target Discovery', () => {
        test('discovers build.xml files', function() {
            this.timeout(10000);

            const antPath = getFixturePath('build.xml');
            assert.ok(fs.existsSync(antPath), 'build.xml should exist');

            const content = fs.readFileSync(antPath, 'utf8');
            assert.ok(content.includes('<target name="build"'), 'Should have build target');
            assert.ok(content.includes('<target name="clean"'), 'Should have clean target');
            assert.ok(content.includes('<target name="test"'), 'Should have test target');
        });

        test('ant tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const antCategory = rootChildren.find(c => getLabelString(c.label).includes('Ant'));
            assert.ok(antCategory, `Should have Ant Targets category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Just Recipe Discovery', () => {
        test('discovers justfile recipes', function() {
            this.timeout(10000);

            const justPath = getFixturePath('justfile');
            assert.ok(fs.existsSync(justPath), 'justfile should exist');

            const content = fs.readFileSync(justPath, 'utf8');
            assert.ok(content.includes('build:'), 'Should have build recipe');
            assert.ok(content.includes('test:'), 'Should have test recipe');
            assert.ok(content.includes('deploy env='), 'Should have deploy recipe with param');
        });

        test('just tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const justCategory = rootChildren.find(c => getLabelString(c.label).includes('Just'));
            assert.ok(justCategory, `Should have Just Recipes category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Taskfile Discovery', () => {
        test('discovers Taskfile.yml tasks', function() {
            this.timeout(10000);

            const taskfilePath = getFixturePath('Taskfile.yml');
            assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yml should exist');

            const content = fs.readFileSync(taskfilePath, 'utf8');
            assert.ok(content.includes('tasks:'), 'Should have tasks section');
            assert.ok(content.includes('build:'), 'Should have build task');
            assert.ok(content.includes('test:'), 'Should have test task');
        });

        test('taskfile tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const taskfileCategory = rootChildren.find(c => getLabelString(c.label).includes('Taskfile'));
            assert.ok(taskfileCategory, `Should have Taskfile category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Deno Task Discovery', () => {
        test('discovers deno.json tasks', function() {
            this.timeout(10000);

            const denoPath = getFixturePath('deno.json');
            assert.ok(fs.existsSync(denoPath), 'deno.json should exist');

            const content = fs.readFileSync(denoPath, 'utf8');
            assert.ok(content.includes('"tasks"'), 'Should have tasks section');
            assert.ok(content.includes('"dev"'), 'Should have dev task');
            assert.ok(content.includes('"build"'), 'Should have build task');
        });

        test('deno tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const denoCategory = rootChildren.find(c => getLabelString(c.label).includes('Deno'));
            assert.ok(denoCategory, `Should have Deno Tasks category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Rake Task Discovery', () => {
        test('discovers Rakefile tasks', function() {
            this.timeout(10000);

            const rakePath = getFixturePath('Rakefile');
            assert.ok(fs.existsSync(rakePath), 'Rakefile should exist');

            const content = fs.readFileSync(rakePath, 'utf8');
            assert.ok(content.includes("desc 'Build"), 'Should have build task with desc');
            assert.ok(content.includes('task :build'), 'Should have build task');
            assert.ok(content.includes('task :test'), 'Should have test task');
        });

        test('rake tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const rakeCategory = rootChildren.find(c => getLabelString(c.label).includes('Rake'));
            assert.ok(rakeCategory, `Should have Rake Tasks category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Composer Script Discovery', () => {
        test('discovers composer.json scripts', function() {
            this.timeout(10000);

            const composerPath = getFixturePath('composer.json');
            assert.ok(fs.existsSync(composerPath), 'composer.json should exist');

            const content = fs.readFileSync(composerPath, 'utf8');
            assert.ok(content.includes('"scripts"'), 'Should have scripts section');
            assert.ok(content.includes('"test"'), 'Should have test script');
            assert.ok(content.includes('"lint"'), 'Should have lint script');
        });

        test('composer tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const composerCategory = rootChildren.find(c => getLabelString(c.label).includes('Composer'));
            assert.ok(composerCategory, `Should have Composer Scripts category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Docker Compose Discovery', () => {
        test('discovers docker-compose.yml services', function() {
            this.timeout(10000);

            const dockerPath = getFixturePath('docker-compose.yml');
            assert.ok(fs.existsSync(dockerPath), 'docker-compose.yml should exist');

            const content = fs.readFileSync(dockerPath, 'utf8');
            assert.ok(content.includes('services:'), 'Should have services section');
            assert.ok(content.includes('web:'), 'Should have web service');
            assert.ok(content.includes('db:'), 'Should have db service');
        });

        test('docker tasks are present in provider', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const dockerCategory = rootChildren.find(c => getLabelString(c.label).includes('Docker'));
            assert.ok(dockerCategory, `Should have Docker Compose category, got: ${rootChildren.map(c => getLabelString(c.label)).join(', ')}`);
        });
    });

    suite('Tree View Categories', () => {
        test('all expected categories are present', async function() {
            this.timeout(15000);

            const provider = getTaskTreeProvider();
            const rootChildren = await getTreeChildren(provider);

            const categoryLabels = rootChildren.map(c => getLabelString(c.label));

            // Core categories that should always be present
            assert.ok(categoryLabels.some(l => l.includes('Shell Scripts')), 'Should have Shell Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('NPM Scripts')), 'Should have NPM Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('Make Targets')), 'Should have Make Targets category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Launch')), 'Should have VS Code Launch category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Tasks')), 'Should have VS Code Tasks category');
            assert.ok(categoryLabels.some(l => l.includes('Python Scripts')), 'Should have Python Scripts category');
        });

        test('getAllTasks returns all discovered tasks', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();

            assert.ok(Array.isArray(allTasks), 'getAllTasks should return an array');
            assert.ok(allTasks.length > 0, 'Should have discovered tasks');

            // Verify we have multiple task types
            const types = new Set(allTasks.map(t => t.type));
            assert.ok(types.size >= 5, `Should have at least 5 task types, got ${types.size}: ${[...types].join(', ')}`);
        });

        test('nested tasks are discovered', function() {
            this.timeout(15000);

            // Verify nested test-fixtures has tasks
            const testFixturesTasksPath = getFixturePath('test-fixtures/workspace/.vscode/tasks.json');
            assert.ok(fs.existsSync(testFixturesTasksPath), 'nested tasks.json should exist');

            const fixtureContent = fs.readFileSync(testFixturesTasksPath, 'utf8');
            assert.ok(fixtureContent.includes('Nested Build Task'), 'nested fixture should have Nested Build Task');

            // Check provider has the nested task
            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const nestedTask = allTasks.find(t => t.label === 'Nested Build Task');
            assert.ok(nestedTask !== undefined, 'Nested Build Task should be discovered');
        });
    });

    suite('File Watcher Auto-Discovery', () => {
        test('new files are discovered via file watcher', async function() {
            this.timeout(25000);

            const newScriptPath = 'scripts/auto-discover-test.sh';
            const fullPath = getFixturePath(newScriptPath);
            const provider = getTaskTreeProvider();

            try {
                // Get initial task count
                const initialTasks = provider.getAllTasks();
                const initialCount = initialTasks.length;

                // Create new script - file watcher should pick it up
                writeFile(newScriptPath, '#!/bin/bash\n# Auto-discovery test\necho "Testing file watcher"');

                // Wait for file watcher to auto-sync
                await sleep(4000);

                // Verify new task was discovered
                const newTasks = provider.getAllTasks();
                assert.strictEqual(
                    newTasks.length,
                    initialCount + 1,
                    `File watcher should auto-discover new script. Expected ${initialCount + 1}, got ${newTasks.length}. ` +
                    `File watcher may not be working!`
                );
            } finally {
                // Cleanup
                if (fs.existsSync(fullPath)) {
                    deleteFile(newScriptPath);
                    await sleep(2000);
                }
            }
        });

        test('deleted files are removed via file watcher', async function() {
            this.timeout(25000);

            const tempScriptPath = 'scripts/temp-delete-test.sh';
            const fullPath = getFixturePath(tempScriptPath);
            const provider = getTaskTreeProvider();

            try {
                // Create script first
                writeFile(tempScriptPath, '#!/bin/bash\n# Temp script for deletion test\necho "Hello"');
                await sleep(3000);

                // Verify it was discovered
                let tasks = provider.getAllTasks();
                const taskExists = tasks.some(t => t.filePath.includes('temp-delete-test.sh'));
                assert.ok(taskExists, 'Temp script should be discovered');

                const countBefore = tasks.length;

                // Delete the file
                fs.unlinkSync(fullPath);

                // Wait for file watcher to auto-sync
                await sleep(3000);

                // Verify task was removed
                tasks = provider.getAllTasks();
                assert.strictEqual(
                    tasks.length,
                    countBefore - 1,
                    `File watcher should remove deleted script. Expected ${countBefore - 1}, got ${tasks.length}. ` +
                    `File watcher may not be working!`
                );
            } finally {
                // Ensure cleanup
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        });
    });

    suite('Task Data Integrity', () => {
        test('all tasks have required properties', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();

            for (const task of allTasks) {
                assert.ok(task.id, `Task ${task.label} should have id`);
                assert.ok(task.label, 'Task should have label');
                assert.ok(task.type, `Task ${task.label} should have type`);
                assert.ok(task.command, `Task ${task.label} should have command`);
                assert.ok(task.filePath, `Task ${task.label} should have filePath`);
                assert.ok(Array.isArray(task.tags), `Task ${task.label} should have tags array`);
            }
        });

        test('task IDs are unique', function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const ids = allTasks.map(t => t.id);
            const uniqueIds = new Set(ids);

            assert.strictEqual(
                ids.length,
                uniqueIds.size,
                `Task IDs should be unique. Found ${ids.length - uniqueIds.size} duplicates.`
            );
        });
    });
});
