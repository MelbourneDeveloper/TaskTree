# CLAUDE.md - TaskTree Extension

## Too Many Cooks

You are working with many other agents. Make sure there is effective cooperation

- Register on TMC immediately
- Don't edit files that are locked; lock files when editing
- COMMUNICATE REGULARLY AND COORDINATE WITH OTHERS THROUGH MESSAGES

## Coding Rules

- **TypeScript strict mode** - No `any`, no implicit types, turn all lints up to error
- **Functional style** - Prefer pure functions, avoid classes where possible
- **No suppressing warnings** - Fix them properly
- **Ignoring lints = ⛔️ illegal** - Fix violations immediately
- **No throwing** - Only return `Result<T,E>`
- **Expressions over assignments** - Prefer const and immutable patterns
- **Named parameters** - Use object params for functions with 3+ args
- **Keep files under 450 LOC and functions under 20 LOC**
- **No commented-out code** - Delete it
- **No placeholders** - If incomplete, leave LOUD compilation error with TODO

## Testing

⚠️ NEVER KILL VSCODE PROCESSES

### Testing Process

- Write test that fails because of bug/missing feature
- Run tests to verify that test fails because of this reason
- Adjust test and repeat until you see failure for the reason above
- Add missing feature or fix bug
- Run tests to verify test passes. 
- Repeat and fix until test passes WITHOUT changing the test

- **E2E tests ONLY** - No unit tests, no mocks
- Tests run in actual VS Code window via `@vscode/test-electron`
- Test files in `src/test/suite/*.test.ts`
- Run tests: `npm test`
- NEVER remove assertions
- FAILING TEST = OK. TEST THAT DOESN'T ENFORCE BEHAVIOR = ILLEGAL

## Critical Docs

[VSCode Extension API](https://code.visualstudio.com/api/)
[SCode Extension Testing API](https://code.visualstudio.com/api/extension-guides/testing)

## Project Structure

```
TaskTree/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── TaskTreeProvider.ts   # TreeDataProvider implementation
│   ├── config/
│   │   └── TagConfig.ts      # Tag configuration from tasktree.json
│   ├── discovery/
│   │   ├── index.ts          # Discovery orchestration
│   │   ├── shell.ts          # Shell script discovery
│   │   ├── npm.ts            # NPM script discovery
│   │   ├── make.ts           # Makefile target discovery
│   │   ├── launch.ts         # launch.json discovery
│   │   └── tasks.ts          # tasks.json discovery
│   ├── models/
│   │   └── TaskItem.ts       # Task data model and TreeItem
│   ├── runners/
│   │   └── TaskRunner.ts     # Task execution logic
│   └── test/
│       └── suite/            # E2E test files
├── test-fixtures/            # Test workspace files
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── .vscode-test.mjs          # Test runner config
```

## Key Types

```typescript
interface TaskItem {
    id: string;
    label: string;
    type: 'shell' | 'npm' | 'make' | 'launch' | 'vscode';
    command: string;
    cwd: string;
    filePath: string;
    category: string;
    description?: string;
    params: TaskParam[];
    tags: string[];
}

interface TaskParam {
    name: string;
    description: string;
    default?: string;
    options?: string[];
}

Result<T,E>
```

## Commands

| Command ID | Description |
|------------|-------------|
| `tasktree.refresh` | Reload all tasks |
| `tasktree.run` | Run task in new terminal |
| `tasktree.runInCurrentTerminal` | Run in active terminal |
| `tasktree.debug` | Launch with debugger |
| `tasktree.filter` | Text filter input |
| `tasktree.filterByTag` | Tag filter picker |
| `tasktree.clearFilter` | Clear all filters |
| `tasktree.editTags` | Open tasktree.json |

## Build Commands

```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
npm run test         # Run E2E tests
npm run package      # Build VSIX
npm run build-and-install  # Full rebuild + install
```

## Adding New Task Types

1. Create discovery module in `src/discovery/`
2. Export discovery function: `discoverXxxTasks(root: string, excludes: string[]): Promise<TaskItem[]>`
3. Add to `discoverAllTasks()` in `src/discovery/index.ts`
4. Add category in `TaskTreeProvider.buildRootCategories()`
5. Handle execution in `TaskRunner.run()`
6. Add E2E tests in `src/test/suite/discovery.test.ts`

## VS Code API Patterns

```typescript
// Register command
context.subscriptions.push(
    vscode.commands.registerCommand('tasktree.xxx', handler)
);

// File watcher
const watcher = vscode.workspace.createFileSystemWatcher('**/pattern');
watcher.onDidChange(() => refresh());
context.subscriptions.push(watcher);

// Tree view
const treeView = vscode.window.createTreeView('tasktree', {
    treeDataProvider: provider,
    showCollapseAll: true
});

// Context for when clauses
vscode.commands.executeCommand('setContext', 'tasktree.hasFilter', true);
```

## Configuration

Settings defined in `package.json` under `contributes.configuration`:
- `tasktree.excludePatterns` - Glob patterns to exclude
- `tasktree.showEmptyCategories` - Show empty category nodes
- `tasktree.sortOrder` - Task sort order (folder/name/type)
