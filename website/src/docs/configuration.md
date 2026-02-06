---
layout: layouts/docs.njk
title: Configuration
eleventyNavigation:
  key: Configuration
  order: 4
---

# Configuration

All settings via VS Code settings (`Cmd+,` / `Ctrl+,`).

## Exclude Patterns

`commandtree.excludePatterns` - Glob patterns to exclude from discovery. Defaults include `**/node_modules/**`, `**/.git/**`, etc.

## Sort Order

`commandtree.sortOrder`:

| Value | Description |
|-------|-------------|
| `folder` | Sort by folder path (default) |
| `name` | Sort alphabetically |
| `type` | Sort by command type |

## Quick Launch

Pin commands by clicking the star icon. Stored in `.vscode/commandtree.json`:

```json
{
  "quick": ["npm:build", "npm:test"]
}
```

## Tagging

Tags are defined in `.vscode/commandtree.json`:

```json
{
  "tags": {
    "build": ["npm:build", "npm:compile"],
    "test": ["npm:test*"]
  }
}
```

Supports wildcards: `npm:test*`, `*deploy*`, `type:shell:*`.

## Filtering

| Command | Description |
|---------|-------------|
| `commandtree.filter` | Text filter input |
| `commandtree.filterByTag` | Tag filter picker |
| `commandtree.clearFilter` | Clear all filters |
| `commandtree.editTags` | Open commandtree.json |
