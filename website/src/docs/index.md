---
layout: layouts/docs.njk
title: Getting Started
eleventyNavigation:
  key: Getting Started
  order: 1
---

# Getting Started

CommandTree scans your VS Code workspace and surfaces all runnable commands in a single tree view sidebar panel.

## Installation

Install from the VS Code Marketplace:

1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on macOS)
3. Search for **CommandTree**
4. Click **Install**

Or from the command line:

```bash
code --install-extension nimblesite.commandtree
```

## Building from Source

```bash
git clone https://github.com/melbournedeveloper/CommandTree.git
cd CommandTree
npm install
npm run package
code --install-extension commandtree-*.vsix
```

## What Gets Discovered

| Type | Source |
|------|--------|
| Shell Scripts | `.sh`, `.bash`, `.zsh` files |
| NPM Scripts | `package.json` scripts |
| Makefile Targets | `Makefile` / `makefile` targets |
| VS Code Tasks | `.vscode/tasks.json` |
| Launch Configs | `.vscode/launch.json` |
| Python Scripts | `.py` files |
| PowerShell Scripts | `.ps1` files |
| Gradle Tasks | `build.gradle` / `build.gradle.kts` |
| Cargo Tasks | `Cargo.toml` |
| Maven Goals | `pom.xml` |
| Ant Targets | `build.xml` |
| Just Recipes | `justfile` |
| Taskfile Tasks | `Taskfile.yml` |
| Deno Tasks | `deno.json` / `deno.jsonc` |
| Rake Tasks | `Rakefile` |
| Composer Scripts | `composer.json` |
| Docker Compose | `docker-compose.yml` |
| .NET Projects | `.csproj` / `.fsproj` |
| Markdown Files | `.md` files |

Discovery respects exclude patterns in settings and runs in the background. If [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, each discovered command is automatically described in plain language — hover over any command to see what it does.
