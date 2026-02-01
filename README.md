# TaskTree

One sidebar. Every task in your workspace.

TaskTree scans your project and surfaces all runnable tasks in a single tree view: shell scripts, npm scripts, Makefile targets, VS Code tasks, and launch configurations. Filter by text or tag, run in terminal or debugger.

## What It Finds

- **Shell Scripts** - `.sh` files with optional `@param` and `@description` comments
- **NPM Scripts** - From all `package.json` files including nested projects
- **Makefile Targets** - From `Makefile` and `makefile`
- **Launch Configs** - Debug configurations from `.vscode/launch.json`
- **VS Code Tasks** - From `.vscode/tasks.json` with input variable support

## Running Tasks

Click a task or use the inline buttons:
- **Play** - Run in new terminal
- **Bug** - Launch with debugger
- **Circle Play** - Run in current terminal

Right-click for the full context menu.

## Quick Tasks

Star frequently-used tasks to pin them in the Quick Tasks panel at the top. No more hunting through the tree.

## Tagging

Create `.vscode/tasktree.json` to group related tasks:

```json
{
  "tags": {
    "build": ["npm:build", "npm:compile", "make:build"],
    "test": ["npm:test*", "Test:*"],
    "ci": ["npm:lint", "npm:test", "npm:build"]
  }
}
```

Patterns:
- `npm:build` - Exact match on type and label
- `npm:test*` - Wildcard matching
- `**/scripts/**` - Path matching
- `type:npm:*` - Match all tasks of a type

Filter by tag from the toolbar to see just what you need.

## Parameterized Tasks

Shell scripts with parameter comments prompt for input:

```bash
#!/bin/bash
# @description Deploy to environment
# @param environment Target environment (staging, production)

deploy_to "$1"
```

VS Code tasks using `${input:*}` variables work automatically.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tasktree.excludePatterns` | node_modules, .git, build dirs | Paths to skip during discovery |
| `tasktree.showEmptyCategories` | `false` | Show empty category nodes |
| `tasktree.sortOrder` | `folder` | Sort by `folder`, `name`, or `type` |

## Install

From source:
```bash
npm install
npm run package
code --install-extension tasktree-*.vsix
```

## License

MIT
