/**
 * Type definitions for test files to avoid `any` type issues.
 */

export interface PackageJsonCommand {
    command: string;
    title: string;
    icon?: string;
}

export interface PackageJsonView {
    id: string;
    name: string;
    icon?: string;
    contextualTitle?: string;
}

export interface PackageJsonMenuItem {
    command: string;
    when?: string;
    group?: string;
}

export interface PackageJsonMenus {
    'view/title'?: PackageJsonMenuItem[];
    'view/item/context'?: PackageJsonMenuItem[];
}

export interface ConfigurationProperty {
    type: string;
    default?: unknown;
    description?: string;
    items?: { type: string };
    enum?: string[];
    enumDescriptions?: string[];
}

export interface PackageJsonConfiguration {
    title: string;
    properties: Record<string, ConfigurationProperty>;
}

export interface PackageJsonContributes {
    commands?: PackageJsonCommand[];
    views?: {
        explorer?: PackageJsonView[];
    };
    menus?: PackageJsonMenus;
    configuration?: PackageJsonConfiguration;
}

export interface PackageJson {
    name: string;
    displayName: string;
    description?: string;
    version: string;
    publisher?: string;
    main: string;
    engines: {
        vscode: string;
    };
    activationEvents?: string[];
    contributes: PackageJsonContributes;
}

export interface TestPackageJson {
    scripts?: Record<string, string>;
}

export interface TasksJson {
    version: string;
    tasks?: Array<{
        label?: string;
        type?: string;
        command?: string;
    }>;
    inputs?: Array<{
        id: string;
        type: string;
        description?: string;
    }>;
}

export interface LaunchJson {
    version: string;
    configurations?: Array<{
        name: string;
        type: string;
        request: string;
    }>;
}

export interface CommandTreeJson {
    tags?: Record<string, string[]>;
    version?: string;
}

export function parsePackageJson(content: string): PackageJson {
    return JSON.parse(content) as PackageJson;
}

export function parseTestPackageJson(content: string): TestPackageJson {
    return JSON.parse(content) as TestPackageJson;
}

export function parseTasksJson(content: string): TasksJson {
    return JSON.parse(content) as TasksJson;
}

export function parseLaunchJson(content: string): LaunchJson {
    return JSON.parse(content) as LaunchJson;
}

export function parseCommandTreeJson(content: string): CommandTreeJson {
    return JSON.parse(content) as CommandTreeJson;
}

/**
 * Safely access exclude patterns defaults from configuration properties
 */
export function getExcludePatternsDefault(props: Record<string, ConfigurationProperty>): string[] {
    const prop = props['commandtree.excludePatterns'];
    return Array.isArray(prop?.default) ? prop.default as string[] : [];
}

/**
 * Safely access sortOrder defaults from configuration properties
 */
export function getSortOrderDefault(props: Record<string, ConfigurationProperty>): string {
    const prop = props['commandtree.sortOrder'];
    return typeof prop?.default === 'string' ? prop.default : '';
}

/**
 * Safely access sortOrder enum values from configuration properties
 */
export function getSortOrderEnum(props: Record<string, ConfigurationProperty>): string[] {
    const prop = props['commandtree.sortOrder'];
    return Array.isArray(prop?.enum) ? prop.enum : [];
}

/**
 * Safely access sortOrder enum descriptions from configuration properties
 */
export function getSortOrderEnumDescriptions(props: Record<string, ConfigurationProperty>): string[] {
    const prop = props['commandtree.sortOrder'];
    return Array.isArray(prop?.enumDescriptions) ? prop.enumDescriptions : [];
}

