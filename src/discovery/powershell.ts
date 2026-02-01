import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers PowerShell and Batch scripts (.ps1, .bat, .cmd files) in the workspace.
 */
export async function discoverPowerShellScripts(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const [ps1Files, batFiles, cmdFiles] = await Promise.all([
        vscode.workspace.findFiles('**/*.ps1', exclude),
        vscode.workspace.findFiles('**/*.bat', exclude),
        vscode.workspace.findFiles('**/*.cmd', exclude)
    ]);
    const allFiles = [...ps1Files, ...batFiles, ...cmdFiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const name = path.basename(file.fsPath);
        const ext = path.extname(file.fsPath).toLowerCase();
        const isPowerShell = ext === '.ps1';

        const params = isPowerShell ? parsePowerShellParams(content) : [];
        const description = isPowerShell
            ? parsePowerShellDescription(content)
            : parseBatchDescription(content);

        const task: MutableTaskItem = {
            id: generateTaskId('powershell', file.fsPath, name),
            label: name,
            type: 'powershell',
            category: simplifyPath(file.fsPath, workspaceRoot),
            command: isPowerShell ? `powershell -File "${file.fsPath}"` : `"${file.fsPath}"`,
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
    }

    return tasks;
}

/**
 * Parses PowerShell script comments for parameter hints.
 * Supports: # @param name Description
 * Also supports PowerShell param() blocks.
 */
function parsePowerShellParams(content: string): ParamDef[] {
    const params: ParamDef[] = [];

    // Parse @param comments
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

    // Parse param() block parameters
    const paramBlockRegex = /param\s*\(\s*([^)]+)\)/is;
    const blockMatch = paramBlockRegex.exec(content);
    if (blockMatch?.[1] !== undefined) {
        const paramBlock = blockMatch[1];
        // Match $ParamName patterns
        const varRegex = /\$(\w+)/g;
        while ((match = varRegex.exec(paramBlock)) !== null) {
            const varName = match[1];
            if (varName === undefined) {
                continue;
            }
            // Skip if already parsed from comments
            if (params.some(p => p.name.toLowerCase() === varName.toLowerCase())) {
                continue;
            }
            params.push({ name: varName });
        }
    }

    return params;
}

/**
 * Parses the first comment block as description for PowerShell.
 */
function parsePowerShellDescription(content: string): string | undefined {
    const lines = content.split('\n');

    // Look for <# ... #> block comment
    let inBlock = false;
    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('<#')) {
            inBlock = true;
            const afterStart = trimmed.slice(2).trim();
            if (afterStart !== '' && !afterStart.startsWith('.')) {
                return afterStart.replace(/#>.*$/, '').trim();
            }
            continue;
        }

        if (inBlock) {
            if (trimmed.includes('#>')) {
                const desc = trimmed.replace('#>', '').trim();
                return desc === '' ? undefined : desc;
            }
            // Skip .SYNOPSIS, .DESCRIPTION etc headers
            if (!trimmed.startsWith('.') && trimmed !== '') {
                return trimmed;
            }
            continue;
        }

        // Skip empty lines
        if (trimmed === '') {
            continue;
        }

        // Single line comment
        if (trimmed.startsWith('#')) {
            const desc = trimmed.replace(/^#\s*/, '').trim();
            if (!desc.startsWith('@') && !desc.startsWith('.') && desc !== '') {
                return desc;
            }
            continue;
        }

        // Not a comment - stop looking
        break;
    }

    return undefined;
}

/**
 * Parses the first REM or :: comment as description for batch files.
 */
function parseBatchDescription(content: string): string | undefined {
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines
        if (trimmed === '') {
            continue;
        }

        // Skip @echo off
        if (trimmed.toLowerCase().startsWith('@echo')) {
            continue;
        }

        // REM comment
        if (trimmed.toLowerCase().startsWith('rem ')) {
            const desc = trimmed.slice(4).trim();
            return desc === '' ? undefined : desc;
        }

        // :: comment
        if (trimmed.startsWith('::')) {
            const desc = trimmed.slice(2).trim();
            return desc === '' ? undefined : desc;
        }

        // Not a comment - stop looking
        break;
    }

    return undefined;
}
