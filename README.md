# TaskTree

Organizes all workspace tasks into a filterable tree view in VS Code.

## Install

```bash
cd TaskTree
npm run build-and-install
```

## Usage

1. Open Explorer sidebar (Cmd+Shift+E)
2. Look for **TaskTree** panel at the bottom
3. Double-click any task to run it

## Tree Structure

```
TaskTree
├── Shell Scripts (3)
│   ├── Samples/
│   │   └── start.sh
│   └── ICD10CM/.../
│       ├── run.sh
│       └── import.sh
├── NPM Scripts (12)
│   ├── Website/
│   │   ├── dev
│   │   └── build
│   └── Lql/LqlExtension/
│       ├── compile
│       └── watch
├── Make Targets (0)
├── VS Code Launch (3)
│   ├── Dashboard (Fresh)
│   └── ICD-10 CLI
└── VS Code Tasks (27)
    ├── Build: Solution
    └── Test: All
```

## Toolbar Buttons

| Icon | Action |
|------|--------|
| 🔍 | **Filter** - Type to search tasks by name/path |
| 🏷️ | **Tag Filter** - Filter by tag |
| ✖️ | **Clear** - Remove all filters (only shows when filtering) |
| 🔄 | **Refresh** - Rescan workspace for tasks |

## Tagging

Create `.vscode/tasktree.json` to tag tasks:

```json
{
  "tags": {
    "build": ["Build:*", "npm:compile", "make:build"],
    "test": ["Test:*", "npm:test"],
    "docker": ["**/Dependencies/**"],
    "icd10": ["ICD10CM/**", "ICD-10*"]
  }
}
```

**Pattern matching:**
- `*` matches within a segment
- `**` matches anything
- Matches against: label, file path, category, `type:label`

Tags appear as badges next to task names.

## Parameter Handling

Tasks with parameters prompt automatically:

**Shell scripts** - Add comments:
```bash
#!/bin/bash
# @param port The port to run on (default: 5558)
PORT="${1:-5558}"
```

**VS Code tasks** - Uses `${input:*}` definitions from tasks.json

## Settings

In VS Code settings (`Cmd+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `tasktree.excludePatterns` | `["**/node_modules/**", "**/bin/**", "**/obj/**", "**/.git/**"]` | Globs to exclude |
| `tasktree.showEmptyCategories` | `false` | Show categories with no tasks |
| `tasktree.sortOrder` | `folder` | Sort order: `folder` (by path then name), `name` (alphabetically), `type` (by type then name) |

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Compile TypeScript |
| `npm run watch` | Watch mode |
| `npm run clean` | Delete node_modules, out, *.vsix |
| `npm run package` | Build .vsix |
| `npm run uninstall` | Uninstall from VS Code |
| `npm run install-ext` | Install .vsix to VS Code |
| `npm run build-and-install` | Full rebuild + reinstall |

## Development

1. Open `TaskTree/` folder in VS Code
2. Press **F5** to launch Extension Development Host
3. Make changes, reload window (Cmd+R) to test
