---
layout: layouts/docs.njk
title: Getting Started with CommandTree - VS Code Command Runner
description: Install CommandTree for VS Code and discover shell scripts, npm scripts, Makefiles, and 18+ command types automatically in one sidebar.
eleventyNavigation:
  key: Getting Started
  order: 1
---

# Getting Started

CommandTree is a free VS Code extension that scans your workspace and surfaces all runnable commands — shell scripts, npm scripts, Makefiles, and 15 other types — in a single tree view sidebar panel.

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

Discovery respects [exclude patterns](/docs/configuration/) in settings and runs in the background. If [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, each discovered command is automatically described in plain language — hover over any command to see what it does. Learn more about [how discovery works](/docs/discovery/) and [AI summaries](/docs/ai-summaries/).

## Frequently Asked Questions

### What command types does CommandTree discover?

CommandTree discovers 19 command types: shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, Python scripts, PowerShell scripts, Gradle tasks, Cargo tasks, Maven goals, Ant targets, Just recipes, Taskfile tasks, Deno tasks, Rake tasks, Composer scripts, Docker Compose services, .NET projects, and Markdown files.

### Does CommandTree require GitHub Copilot?

No. GitHub Copilot is optional. Without it, CommandTree discovers and runs all commands normally. With Copilot installed, CommandTree adds plain-language summaries and security warnings to each command tooltip.

### Does CommandTree work in monorepos?

Yes. CommandTree recursively scans all subdirectories and discovers commands from nested `package.json` files, Makefiles, and other sources throughout the workspace.

### How do I run a discovered command?

Click the play button next to any command to [run it in a new terminal](/docs/execution/). You can also run in the current terminal or launch with the VS Code debugger.
