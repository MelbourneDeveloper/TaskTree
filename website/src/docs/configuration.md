---
layout: layouts/docs.njk
title: Settings, Tags & Filters - CommandTree Configuration
description: Configure CommandTree with exclude patterns, sort order, Quick Launch pins, custom tags, and text or tag-based filtering for your VS Code workspace.
eleventyNavigation:
  key: Configuration
  order: 5
---

# Configuration

CommandTree is configured through VS Code settings (`Cmd+,` / `Ctrl+,`). You can control which files are discovered, how commands are sorted, and use Quick Launch, tagging, and filtering to organise your workspace.

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `commandtree.enableAiSummaries` | Use GitHub Copilot to generate plain-language summaries | `true` |
| `commandtree.excludePatterns` | Glob patterns to exclude from discovery | `**/node_modules/**`, `**/.git/**`, etc. |
| `commandtree.sortOrder` | Sort commands by `folder`, `name`, or `type` | `folder` |

## Quick Launch

Pin commands by clicking the star icon. Pinned commands appear in a dedicated panel at the top of the tree.

## Tagging

Right-click any command and choose **Add Tag** to assign a tag. Tags are stored locally in the workspace database and can be used to filter the tree. Remove tags the same way via **Remove Tag**.

## Filtering

| Command | Description |
|---------|-------------|
| `commandtree.filter` | Text filter input |
| `commandtree.filterByTag` | Tag filter picker |
| `commandtree.clearFilter` | Clear all filters |

## Frequently Asked Questions

### Where are Quick Launch pins stored?

Quick Launch pins are stored in `.vscode/commandtree.json` in your workspace root. This file can be committed to version control so your team shares the same pinned commands.

### Can I tag multiple commands at once?

Tags are assigned one command at a time via right-click. Tags are stored in the local workspace database and persist across sessions. Use [tag filtering](/docs/configuration/#filtering) to quickly find all commands with a specific tag.

### How do I filter by both text and tag?

Use `commandtree.filter` for text search and `commandtree.filterByTag` for tag-based filtering. Filters can be combined. Use `commandtree.clearFilter` to reset all filters.

### What exclude patterns are set by default?

CommandTree excludes `**/node_modules/**`, `**/.git/**`, and other common non-source directories by default. Add custom patterns in the `commandtree.excludePatterns` setting to exclude project-specific directories. See [Command Discovery](/docs/discovery/) for what gets scanned.
