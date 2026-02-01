import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers Docker Compose services from docker-compose.yml files.
 */
export async function discoverDockerComposeServices(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const [yml, yaml, composeYml, composeYaml] = await Promise.all([
        vscode.workspace.findFiles('**/docker-compose.yml', exclude),
        vscode.workspace.findFiles('**/docker-compose.yaml', exclude),
        vscode.workspace.findFiles('**/compose.yml', exclude),
        vscode.workspace.findFiles('**/compose.yaml', exclude)
    ]);
    const allFiles = [...yml, ...yaml, ...composeYml, ...composeYaml];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const dockerDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const services = parseDockerComposeServices(content);

        // Add general compose commands
        const generalCommands = [
            { name: 'up', command: 'docker compose up', description: 'Start all services' },
            { name: 'up -d', command: 'docker compose up -d', description: 'Start in background' },
            { name: 'down', command: 'docker compose down', description: 'Stop all services' },
            { name: 'build', command: 'docker compose build', description: 'Build all services' },
            { name: 'logs', command: 'docker compose logs -f', description: 'View logs' },
            { name: 'ps', command: 'docker compose ps', description: 'List containers' }
        ];

        for (const cmd of generalCommands) {
            tasks.push({
                id: generateTaskId('docker', file.fsPath, cmd.name),
                label: cmd.name,
                type: 'docker',
                category,
                command: cmd.command,
                cwd: dockerDir,
                filePath: file.fsPath,
                tags: [],
                description: cmd.description
            });
        }

        // Add per-service commands
        for (const service of services) {
            const task: MutableTaskItem = {
                id: generateTaskId('docker', file.fsPath, `up-${service}`),
                label: `up ${service}`,
                type: 'docker',
                category,
                command: `docker compose up ${service}`,
                cwd: dockerDir,
                filePath: file.fsPath,
                tags: [],
                description: `Start ${service} service`
            };
            tasks.push(task);
        }
    }

    return tasks;
}

/**
 * Parses docker-compose.yml to extract service names.
 * Uses simple YAML parsing without a full parser.
 */
function parseDockerComposeServices(content: string): string[] {
    const services: string[] = [];
    const lines = content.split('\n');

    let inServices = false;
    let servicesIndent = 0;

    for (const line of lines) {
        // Skip empty lines and comments
        if (line.trim() === '' || line.trim().startsWith('#')) {
            continue;
        }

        const indent = line.search(/\S/);
        const trimmed = line.trim();

        // Check if we're entering the services: section
        if (trimmed === 'services:') {
            inServices = true;
            servicesIndent = indent;
            continue;
        }

        // Check if we've left the services section (another top-level key)
        if (inServices && indent <= servicesIndent && trimmed.endsWith(':') && !trimmed.includes(' ')) {
            inServices = false;
            continue;
        }

        if (!inServices) {
            continue;
        }

        // Check for service definition (key at one indent level below services)
        if (indent === servicesIndent + 2 || (servicesIndent === 0 && indent === 2)) {
            const serviceMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*):/.exec(trimmed);
            if (serviceMatch !== null) {
                const serviceName = serviceMatch[1];
                if (serviceName !== undefined && serviceName !== '' && !services.includes(serviceName)) {
                    services.push(serviceName);
                }
            }
        }
    }

    return services;
}
