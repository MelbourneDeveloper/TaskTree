# CommandTree

**One sidebar. Every command in your workspace.**

<p align="center">
  <img src="website/src/assets/images/CommandTree.gif" alt="CommandTree in action" width="780">
</p>

CommandTree scans your project and surfaces all runnable commands in a single tree view: shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts. Filter by text or tag, run in terminal or debugger.

## Features

- **Auto-discovery** - Shell scripts (`.sh`, `.bash`, `.zsh`), npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts
- **Quick Launch** - Pin frequently-used commands to a dedicated panel at the top
- **Tagging** - Auto-tag commands by type, label, or exact ID using pattern rules in `.vscode/commandtree.json`
- **Filtering** - Filter the tree by text search or by tag
- **Run anywhere** - Execute in a new terminal, the current terminal, or launch with the debugger
- **Folder grouping** - Commands grouped by directory with collapsible nested hierarchy
- **Parameterized commands** - Prompt for arguments before execution
- **File watching** - Automatic refresh when scripts or config files change

## Supported Command Types

| Type | Source |
|------|--------|
| Shell Scripts | `.sh`, `.bash`, `.zsh` files |
| NPM Scripts | `package.json` scripts |
| Makefile Targets | `Makefile` / `makefile` targets |
| VS Code Tasks | `.vscode/tasks.json` |
| Launch Configs | `.vscode/launch.json` |
| Python Scripts | `.py` files |

## Getting Started

Install from the VS Code Marketplace, or from source:

```bash
npm install
npm run package
code --install-extension commandtree-*.vsix
```

Open a workspace and the CommandTree panel appears in the sidebar. All discovered commands are listed by category.

## Usage

- **Run a command** - Click the play button or right-click > "Run Command"
- **Run in current terminal** - Right-click > "Run in Current Terminal"
- **Debug** - Launch configurations run with the VS Code debugger
- **Star a command** - Click the star icon to pin it to Quick Launch
- **Filter** - Use the toolbar icons to filter by text or tag
- **Tag commands** - Right-click > "Add Tag" to group related commands
- **Edit tags** - Configure auto-tagging patterns in `.vscode/commandtree.json`

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `commandtree.excludePatterns` | Glob patterns to exclude from discovery | `**/node_modules/**`, `**/.git/**`, etc. |
| `commandtree.sortOrder` | Sort commands by `folder`, `name`, or `type` | `folder` |

## Tag Configuration

Create `.vscode/commandtree.json` to define tag patterns:

```json
{
    "tags": {
        "build": [{ "type": "npm", "label": "build" }],
        "test": [{ "label": "test" }],
        "scripts": [{ "type": "shell" }],
        "quick": ["npm:/project/package.json:build"]
    }
}
```

Patterns match by `type`, `label`, exact `id`, or any combination.

## License

[MIT](LICENSE)
