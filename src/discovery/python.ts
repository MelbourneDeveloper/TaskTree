import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';

/**
 * Discovers Python scripts (.py files) in the workspace.
 */
export async function discoverPythonScripts(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*.py', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        try {
            const content = await readFile(file);

            // Skip non-runnable Python files (no main block or shebang)
            if (!isRunnablePythonScript(content)) {
                continue;
            }

            const name = path.basename(file.fsPath);
            const params = parsePythonParams(content);
            const description = parsePythonDescription(content);

            const task: MutableTaskItem = {
                id: generateTaskId('python', file.fsPath, name),
                label: name,
                type: 'python',
                category: simplifyPath(file.fsPath, workspaceRoot),
                command: file.fsPath,
                cwd: path.dirname(file.fsPath),
                filePath: file.fsPath,
                tags: []
            };
            if (params.length > 0) {
                task.params = params;
            }
            if (description !== undefined && description !== '') {
                task.description = description;
            }
            tasks.push(task);
        } catch {
            // Skip files we can't read
        }
    }

    return tasks;
}

/**
 * Checks if a Python file is runnable (has shebang or __main__ block).
 */
function isRunnablePythonScript(content: string): boolean {
    // Has shebang
    if (content.startsWith('#!') && content.includes('python')) {
        return true;
    }

    // Has if __name__ == "__main__" or if __name__ == '__main__'
    if (/if\s+__name__\s*==\s*['"]__main__['"]/.test(content)) {
        return true;
    }

    return false;
}

/**
 * Parses Python docstrings/comments for parameter hints.
 * Supports: # @param name Description
 * Also supports argparse-style: parser.add_argument('--name', help='Description')
 */
function parsePythonParams(content: string): ParamDef[] {
    const params: ParamDef[] = [];

    // Parse @param comments (same as shell)
    const paramRegex = /^#\s*@param\s+(\w+)\s+(.*)$/gm;
    let match;
    while ((match = paramRegex.exec(content)) !== null) {
        const paramName = match[1];
        const descText = match[2];
        if (paramName === undefined || descText === undefined) {
            continue;
        }

        const defaultRegex = /\(default:\s*([^)]+)\)/i;
        const defaultMatch = defaultRegex.exec(descText);
        const defaultVal = defaultMatch?.[1]?.trim();
        const param: ParamDef = {
            name: paramName,
            description: descText.replace(/\(default:[^)]+\)/i, '').trim(),
            ...(defaultVal !== undefined && defaultVal !== '' ? { default: defaultVal } : {})
        };
        params.push(param);
    }

    // Parse argparse arguments
    const argparseRegex = /add_argument\s*\(\s*['"]--?(\w+)['"]\s*(?:,\s*[^)]*help\s*=\s*['"]([^'"]+)['"])?/g;
    while ((match = argparseRegex.exec(content)) !== null) {
        const argName = match[1];
        const helpText = match[2];
        if (argName === undefined) {
            continue;
        }

        // Avoid duplicates
        if (params.some(p => p.name === argName)) {
            continue;
        }

        const param: ParamDef = {
            name: argName,
            ...(helpText !== undefined && helpText !== '' ? { description: helpText } : {})
        };
        params.push(param);
    }

    return params;
}

/**
 * Parses the module docstring or first comment line as description.
 */
function parsePythonDescription(content: string): string | undefined {
    const lines = content.split('\n');

    // Look for module docstring (triple quotes at start)
    let inDocstring = false;
    let docstringQuote = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) {
            continue;
        }
        const trimmed = line.trim();

        // Skip shebang and encoding declarations
        if (trimmed.startsWith('#!') || trimmed.startsWith('# -*-') || trimmed.startsWith('# coding')) {
            continue;
        }

        // Skip empty lines at the start
        if (trimmed === '') {
            continue;
        }

        // Check for docstring start
        if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
            docstringQuote = trimmed.substring(0, 3);

            // Single line docstring
            if (trimmed.length > 6 && trimmed.endsWith(docstringQuote)) {
                return trimmed.slice(3, -3).trim();
            }

            // Multi-line docstring - get first line
            inDocstring = true;
            const firstLine = trimmed.slice(3).trim();
            if (firstLine !== '') {
                return firstLine;
            }
            continue;
        }

        // Inside docstring - get first non-empty line
        if (inDocstring) {
            if (trimmed.includes(docstringQuote)) {
                // End of docstring
                const desc = trimmed.replace(docstringQuote, '').trim();
                return desc === '' ? undefined : desc;
            }
            if (trimmed !== '') {
                return trimmed;
            }
            continue;
        }

        // Regular comment
        if (trimmed.startsWith('#')) {
            const desc = trimmed.replace(/^#\s*/, '').trim();
            if (!desc.startsWith('@') && desc !== '') {
                return desc;
            }
        }

        // Not a comment or docstring - stop looking
        break;
    }

    return undefined;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}
