---
layout: layouts/docs.njk
title: AI-Powered Command Summaries - CommandTree Docs
description: GitHub Copilot generates plain-language summaries and security warnings for every command CommandTree discovers. Hover to see what any script does.
eleventyNavigation:
  key: AI Summaries
  order: 3
---

# AI Summaries

CommandTree uses GitHub Copilot to automatically generate a one-sentence, plain-language summary for every discovered command. When [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, hover over any command in the tree to see exactly what it does — and get warnings about dangerous operations.

## How It Works

After CommandTree discovers your commands, it sends each script's content to GitHub Copilot and asks for a one-to-two sentence description. These summaries appear in the tooltip when you hover over a command.

Summaries are stored in a local SQLite database at `.commandtree/commandtree.sqlite3` in your workspace root. They persist across sessions and only regenerate when the underlying script changes (detected via content hashing).

## Security Warnings

Copilot also analyses each command for potentially dangerous operations like `rm -rf`, `git push --force`, or credential handling. When a risk is detected, the command's label is prefixed with a warning indicator and the tooltip includes a security warning section.

## Requirements

- [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension installed and signed in
- The `commandtree.enableAiSummaries` setting enabled (on by default)

If Copilot is not available, CommandTree works exactly as before — all core features (discovery, running, tagging, filtering) are fully independent of AI summaries.

## Triggering Summaries

Summaries generate automatically on activation and when files change. To manually regenerate, run the **CommandTree: Generate AI Summaries** command from the command palette.

## Frequently Asked Questions

### What does an AI summary look like?

Each summary is a one-to-two sentence plain-language description of what the command does. For example, a shell script that runs database migrations might show: "Runs pending database migrations and seeds the development database." Hover over any command in the tree to see its summary.

### Are summaries stored locally?

Yes. All summaries are stored in a SQLite database at `.commandtree/commandtree.sqlite3` in your workspace root. No data is sent to external servers beyond the GitHub Copilot API that runs locally in VS Code.

### How are security warnings triggered?

Copilot analyses each command for potentially dangerous operations such as `rm -rf`, `git push --force`, file permission changes, or credential handling. When a risk is detected, the command label shows a warning indicator and the tooltip explains the specific risk.

### Can I disable AI summaries?

Yes. Set `commandtree.enableAiSummaries` to `false` in your [VS Code settings](/docs/configuration/). All other features — [discovery](/docs/discovery/), [execution](/docs/execution/), tagging, and filtering — work independently of AI summaries.
