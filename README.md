# CommandTree

**One sidebar. Every command in your workspace.**

**[commandtree.dev](https://commandtree.dev/)**

<p align="center">
  <img src="website/src/assets/images/CommandTree.gif" alt="CommandTree in action" width="780">
</p>

CommandTree scans your project and surfaces all runnable commands in a single tree view: shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts. Filter by text or tag, run in terminal or debugger.

## AI Summaries (powered by GitHub Copilot)

When [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, CommandTree automatically generates plain-language summaries of every discovered command. Hover over any command to see what it does, without reading the script. Commands that perform dangerous operations (like `rm -rf` or force-push) are flagged with a security warning.

Summaries are stored locally and only regenerate when the underlying script changes.

## Features

- **AI Summaries** - GitHub Copilot describes each command in plain language, with security warnings for dangerous operations
- **Auto-discovery** - Shell scripts (`.sh`, `.bash`, `.zsh`), npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts
- **Quick Launch** - Pin frequently-used commands to a dedicated panel at the top
- **Tagging** - Right-click any command to add or remove tags
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

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `commandtree.enableAiSummaries` | Use GitHub Copilot to generate plain-language summaries | `true` |
| `commandtree.excludePatterns` | Glob patterns to exclude from discovery | `**/node_modules/**`, `**/.git/**`, etc. |
| `commandtree.sortOrder` | Sort commands by `folder`, `name`, or `type` | `folder` |

## License

[MIT](LICENSE)
