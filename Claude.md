# CLAUDE.md - CommandTree Extension

## Too Many Cooks

You are working with many other agents. Make sure there is effective cooperation
- Register on TMC immediately
- Don't edit files that are locked; lock files when editing
- COMMUNICATE REGULARLY AND COORDINATE WITH OTHERS THROUGH MESSAGES

## Coding Rules

- **Zero duplication - TOP PRIORITY** - Always search for existing code before adding. Move; don't copy files. Add assertions to tests rather than duplicating tests. AIM FOR LESS CODE!
- **Functional style** - Prefer pure functions, avoid classes where possible
- **No suppressing warnings** - Fix them properly
- **No REGEX** It is absolutely ⛔️ illegal
- **Don't run long runnings tasks** like docker builds, tests. Ask the user to do it!!
- **Expressions over assignments** - Prefer const and immutable patterns
- **Named parameters** - Use object params for functions with 3+ args
- **Keep files under 450 LOC and functions under 20 LOC**
- **No commented-out code** - Delete it
- **No placeholders** - If incomplete, leave LOUD compilation error with TODO

### Typescript
- **TypeScript strict mode** - No `any`, no implicit types, turn all lints up to error
- **Ignoring lints = ⛔️ illegal** - Fix violations immediately
- **No throwing** - Only return `Result<T,E>`

### CSS
- **Minimize duplication** - fewer classes is better
- **Don't include section in class name** - name them after what they are - not the section they sit in

## Testing

⚠️ NEVER KILL VSCODE PROCESSES

#### Rules
- **Prefer e2e tests over unit tests** - only unit tests for isolating bugs
- DO NOT USE GIT
- Separate e2e tests from unit tests by file. They should not be in the same file together.
- Prefer adding assertions to existing tests rather than adding new tests
- Test files in `src/test/suite/*.test.ts`
- Run tests: `npm test`
- NEVER remove assertions
- FAILING TEST = ✅ OK. TEST THAT DOESN'T ENFORCE BEHAVIOR = ⛔️ ILLEGAL
- Unit test = No VSCODE instance needed = isolation only test

### Automated (E2E) Testing

**AUTOMATED TESTING IS BLACK BOX TESTING ONLY**
Only test the UI **THROUGH the UI**. Do not run command etc. to coerce the state. You are testing the UI, not the code.

- Tests run in actual VS Code window via `@vscode/test-electron`
- Automated tests must not modify internal state or call functions that do. They must only use the extension through the UI. 
 * - ❌ Calling internal methods like provider.updateTasks()
 * - ❌ Calling provider.refresh() directly
 * - ❌ Manipulating internal state directly
 * - ❌ Using any method not exposed via VS Code commands
 * - ❌ Using commands that should just happen as part of normal use. e.g.: `await vscode.commands.executeCommand('commandtree.refresh');`
 * - ❌ `executeCommand('commandtree.addToQuick', item)` - TAP the item via the DOM!!!

### Test First Process
- Write test that fails because of bug/missing feature
- Run tests to verify that test fails because of this reason
- Adjust test and repeat until you see failure for the reason above
- Add missing feature or fix bug
- Run tests to verify test passes.
- Repeat and fix until test passes WITHOUT changing the test

**Every test MUST:**
1. Assert on the ACTUAL OBSERVABLE BEHAVIOR (UI state, view contents, return values)
2. Fail if the feature is broken
3. Test the full flow, not just side effects like config files

### ⛔️ FAKE TESTS ARE ILLEGAL

**A "fake test" is any test that passes without actually verifying behavior. These are STRICTLY FORBIDDEN:**

```typescript
// ❌ ILLEGAL - asserts true unconditionally
assert.ok(true, 'Should work');

// ❌ ILLEGAL - no assertion on actual behavior
try { await doSomething(); } catch { }
assert.ok(true, 'Did not crash');

// ❌ ILLEGAL - only checks config file, not actual UI/view behavior
writeConfig({ quick: ['task1'] });
const config = readConfig();
assert.ok(config.quick.includes('task1')); // This doesn't test the FEATURE

// ❌ ILLEGAL - empty catch with success assertion
try { await command(); } catch { /* swallow */ }
assert.ok(true, 'Command ran');
```

## Critical Docs

[VSCode Extension API](https://code.visualstudio.com/api/)
[SCode Extension Testing API](https://code.visualstudio.com/api/extension-guides/testing)

## Project Structure

```
CommandTree/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── CommandTreeProvider.ts   # TreeDataProvider implementation
│   ├── config/
│   │   └── TagConfig.ts      # Tag configuration from commandtree.json
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

## Commands

| Command ID | Description |
|------------|-------------|
| `commandtree.refresh` | Reload all tasks |
| `commandtree.run` | Run task in new terminal |
| `commandtree.runInCurrentTerminal` | Run in active terminal |
| `commandtree.debug` | Launch with debugger |
| `commandtree.filter` | Text filter input |
| `commandtree.filterByTag` | Tag filter picker |
| `commandtree.clearFilter` | Clear all filters |
| `commandtree.editTags` | Open commandtree.json |

## Build Commands

See [text](package.json)

## Adding New Task Types

1. Create discovery module in `src/discovery/`
2. Export discovery function: `discoverXxxTasks(root: string, excludes: string[]): Promise<TaskItem[]>`
3. Add to `discoverAllTasks()` in `src/discovery/index.ts`
4. Add category in `CommandTreeProvider.buildRootCategories()`
5. Handle execution in `TaskRunner.run()`
6. Add E2E tests in `src/test/suite/discovery.test.ts`

## VS Code API Patterns

```typescript
// Register command
context.subscriptions.push(
    vscode.commands.registerCommand('commandtree.xxx', handler)
);

// File watcher
const watcher = vscode.workspace.createFileSystemWatcher('**/pattern');
watcher.onDidChange(() => refresh());
context.subscriptions.push(watcher);

// Tree view
const treeView = vscode.window.createTreeView('commandtree', {
    treeDataProvider: provider,
    showCollapseAll: true
});

// Context for when clauses
vscode.commands.executeCommand('setContext', 'commandtree.hasFilter', true);
```

## Configuration

Settings defined in `package.json` under `contributes.configuration`:
- `commandtree.excludePatterns` - Glob patterns to exclude
- `commandtree.showEmptyCategories` - Show empty category nodes
- `commandtree.sortOrder` - Task sort order (folder/name/type)
