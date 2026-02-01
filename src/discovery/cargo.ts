import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Standard Cargo commands that are always available.
 */
const STANDARD_CARGO_COMMANDS = [
    { name: 'build', description: 'Compile the current package' },
    { name: 'run', description: 'Run the main binary' },
    { name: 'test', description: 'Run tests' },
    { name: 'check', description: 'Check code without building' },
    { name: 'clean', description: 'Remove build artifacts' },
    { name: 'clippy', description: 'Run Clippy lints' },
    { name: 'fmt', description: 'Format code with rustfmt' },
    { name: 'doc', description: 'Build documentation' }
];

/**
 * Discovers Cargo tasks from Cargo.toml files.
 * Only returns tasks if Rust source files (.rs) exist in the workspace.
 */
export async function discoverCargoTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;

    // Check if any Rust source files exist before processing
    const rustFiles = await vscode.workspace.findFiles('**/*.rs', exclude);
    if (rustFiles.length === 0) {
        return []; // No Rust source code, skip Cargo tasks
    }

    const files = await vscode.workspace.findFiles('**/Cargo.toml', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const cargoDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);

        // Add standard Cargo commands
        for (const cmd of STANDARD_CARGO_COMMANDS) {
            tasks.push({
                id: generateTaskId('cargo', file.fsPath, cmd.name),
                label: cmd.name,
                type: 'cargo',
                category,
                command: `cargo ${cmd.name}`,
                cwd: cargoDir,
                filePath: file.fsPath,
                tags: [],
                description: cmd.description
            });
        }

        // Parse for binary targets
        const binaries = parseCargoBinaries(content);
        for (const bin of binaries) {
            if (!tasks.some(t => t.label === `run --bin ${bin}`)) {
                tasks.push({
                    id: generateTaskId('cargo', file.fsPath, `run-${bin}`),
                    label: `run --bin ${bin}`,
                    type: 'cargo',
                    category,
                    command: `cargo run --bin ${bin}`,
                    cwd: cargoDir,
                    filePath: file.fsPath,
                    tags: [],
                    description: `Run ${bin} binary`
                });
            }
        }

        // Parse for examples
        const examples = parseCargoExamples(content);
        for (const example of examples) {
            tasks.push({
                id: generateTaskId('cargo', file.fsPath, `example-${example}`),
                label: `run --example ${example}`,
                type: 'cargo',
                category,
                command: `cargo run --example ${example}`,
                cwd: cargoDir,
                filePath: file.fsPath,
                tags: [],
                description: `Run ${example} example`
            });
        }
    }

    return tasks;
}

/**
 * Parses Cargo.toml for binary targets.
 */
function parseCargoBinaries(content: string): string[] {
    const binaries: string[] = [];

    // Match [[bin]] sections with name = "..."
    const binRegex = /\[\[bin\]\][^\[]*name\s*=\s*["'](\w+)["']/g;
    let match;
    while ((match = binRegex.exec(content)) !== null) {
        const name = match[1];
        if (name !== undefined && name !== '' && !binaries.includes(name)) {
            binaries.push(name);
        }
    }

    return binaries;
}

/**
 * Parses Cargo.toml for example targets.
 */
function parseCargoExamples(content: string): string[] {
    const examples: string[] = [];

    // Match [[example]] sections with name = "..."
    const exampleRegex = /\[\[example\]\][^\[]*name\s*=\s*["'](\w+)["']/g;
    let match;
    while ((match = exampleRegex.exec(content)) !== null) {
        const name = match[1];
        if (name !== undefined && name !== '' && !examples.includes(name)) {
            examples.push(name);
        }
    }

    return examples;
}
