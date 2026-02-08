---
layout: layouts/docs.njk
title: Auto-Discovery of 18+ Command Types - CommandTree Docs
description: How CommandTree auto-discovers shell scripts, npm, Make, Gradle, Cargo, Maven, Docker Compose, .NET, and 18+ command types in your VS Code workspace.
eleventyNavigation:
  key: Command Discovery
  order: 2
---

# Command Discovery

CommandTree auto-discovers 18+ command types — including shell scripts, npm scripts, Makefiles, Gradle, Cargo, Maven, Docker Compose, and .NET projects — by recursively scanning your workspace. Discovery respects [exclude patterns](/docs/configuration/) and runs in the background.

## Shell Scripts

Discovers `.sh`, `.bash`, and `.zsh` files. Supports `@param` and `@description` comments:

```bash
#!/bin/bash
# @description Deploy to environment
# @param environment Target environment (staging, production)
deploy_to "$1"
```

## NPM Scripts

Reads `scripts` from all `package.json` files, including nested projects. Perfect for monorepos.

## Makefile Targets

Parses `Makefile` and `makefile` for named targets.

## Launch Configurations

Reads debug configurations from `.vscode/launch.json`. Launchable with the VS Code debugger.

## VS Code Tasks

Reads command definitions from `.vscode/tasks.json`, including `${input:*}` variable prompts.

## Python Scripts

Discovers `.py` files and runs them in a terminal.

## PowerShell Scripts

Discovers `.ps1` files and runs them in a terminal.

## Gradle Tasks

Reads tasks from `build.gradle` and `build.gradle.kts` files.

## Cargo Tasks

Reads targets from `Cargo.toml` (Rust projects).

## Maven Goals

Parses `pom.xml` for available Maven goals.

## Ant Targets

Parses `build.xml` for named Ant targets.

## Just Recipes

Reads recipes from `justfile` files.

## Taskfile Tasks

Reads tasks from `Taskfile.yml` / `Taskfile.yaml` files.

## Deno Tasks

Reads tasks from `deno.json` and `deno.jsonc` files.

## Rake Tasks

Discovers tasks from `Rakefile` files (Ruby).

## Composer Scripts

Reads scripts from `composer.json` (PHP).

## Docker Compose

Discovers services from `docker-compose.yml` / `docker-compose.yaml` files.

## .NET Projects

Discovers `.csproj` and `.fsproj` project files for build/run/test commands.

## Markdown Files

Discovers `.md` files in the workspace.

## AI Summaries

When GitHub Copilot is available, each discovered command is automatically summarised in plain language. See [AI Summaries](/docs/ai-summaries/) for details.

## File Watching

The tree automatically refreshes when scripts or config files change. If [AI summaries](/docs/ai-summaries/) are enabled, changed scripts are re-summarised automatically.

## Frequently Asked Questions

### How does CommandTree find my commands?

CommandTree recursively scans your workspace from the root directory, looking for known file types and configuration files. It reads file contents to extract named targets, scripts, and tasks. Discovery runs in the background and does not block the VS Code UI.

### Can I exclude files or directories from discovery?

Yes. Use the `commandtree.excludePatterns` setting to add glob patterns. By default, `node_modules`, `.git`, and other common directories are excluded. See [Configuration](/docs/configuration/) for details.

### Does discovery work in monorepos with multiple package.json files?

Yes. CommandTree discovers npm scripts from every `package.json` in the workspace, including deeply nested projects. Each script shows its source file path so you know which package it belongs to.

### How do I run a discovered command?

Click the play button next to any command, or right-click for options. See [Command Execution](/docs/execution/) for the three execution methods available.
