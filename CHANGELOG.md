# Changelog

## 0.5.0

### Added

- **GitHub Copilot AI Summaries** — discovered commands are automatically summarised in plain language by GitHub Copilot, displayed in tooltips on hover
- Security warnings: commands that perform dangerous operations (e.g. `rm -rf`, force-push) are flagged with a warning in the tree view
- `commandtree.enableAiSummaries` setting to toggle AI summaries (enabled by default)
- `commandtree.generateSummaries` command to manually trigger summary generation
- Content-hash change detection — summaries only regenerate when scripts change

### Fixed

- Terminal execution no longer throws when xterm viewport is uninitialised in headless environments

## 0.4.0

### Added

- SQLite storage for summaries and embeddings via `node-sqlite3-wasm`
- Automatic migration from legacy JSON store to SQLite on activation
- File watcher re-summarises scripts when they change, with user notification

### Fixed

- Corrected homepage link to commandtree.dev in package.json and README
- Fixed website deployment prefix issue for custom domain

## 0.3.0

### Added

- Demo GIF showcasing CommandTree in action on README and website
- Website demo section with window-chrome frame and caption below the hero
- Deployment script fix for release workflow

## 0.2.0

### Added

- See [Release 0.2.0](https://github.com/MelbourneDeveloper/CommandTree/releases/tag/v0.2.0)

## 0.1.0 - Initial Release

### Features

- Automatic discovery of shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, and Python scripts
- Unified tree view in the sidebar with collapsible categories
- Folder-based grouping with nested directory hierarchy
- Run commands in a new terminal or the current terminal
- Debug launch configurations directly from the tree
- Quick Launch panel for pinning frequently-used commands
- Tag system with pattern-based auto-tagging (by type, label, or exact ID)
- Text filter and tag filter with toolbar controls
- Configurable exclude patterns and sort order (folder, name, type)
- File watcher for automatic refresh on config and script changes
- Parameterized command support with input prompts
