# TaskTree

One sidebar. Every task in your workspace.

TaskTree scans your project and surfaces all runnable tasks in a single tree view: shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts. Filter by text or tag, run in terminal or debugger.

## Getting Started

Install from source:

```bash
npm install
npm run package
code --install-extension tasktree-*.vsix
```

Open a workspace and the TaskTree panel appears in the sidebar. All discovered tasks are listed by category.

## Usage

- **Run a task** - Click it or use the play button
- **Debug** - Click the bug button (launch configs only)
- **Star a task** - Pin frequently-used tasks to Quick Tasks at the top
- **Filter** - Use the toolbar to filter by text or tag
- **Tag tasks** - Right-click > "Add Tag" to group related tasks

## Full Specification

See SPEC.md for complete details on task discovery, tagging, pattern syntax, parameterized tasks, settings, and data storage.

## License

MIT
