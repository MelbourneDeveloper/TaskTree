---
layout: layouts/blog.njk
title: AI Summaries on Hover - Know What Every Command Does Before You Run It
description: CommandTree now shows AI-generated summaries when you hover over any command. Powered by GitHub Copilot, every tooltip tells you exactly what a script does.
date: 2026-02-08
author: Christian Findlay
tags: posts
excerpt: Hover over any command in CommandTree and see a plain-language summary of what it does, powered by GitHub Copilot. Security warnings included.
---

<div class="blog-hero-banner">
  <img src="/assets/images/ai-summary-banner.png" alt="CommandTree AI summary tooltip showing a plain-language description of a build command" class="blog-hero-screenshot">
</div>

You found the script. But what does it actually *do*?

Shell scripts rarely explain themselves. Makefile targets are cryptic. Even npm scripts chain together enough flags and pipes that you have to read the source to know what happens when you hit run.

**CommandTree 0.5.0 fixes that.** Hover over any command and a tooltip tells you exactly what it does, in plain language.

## How It Works

When [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, CommandTree reads the content of every discovered command and asks Copilot for a one-to-two sentence summary. These summaries appear instantly when you hover:

> *Compiles the TypeScript extension, packages it as a .vsix file, and installs it into VS Code in one step.*

No reading source code. No guessing. Just hover and know.

## Security Warnings

Copilot also flags dangerous operations. If a script runs `rm -rf`, force-pushes to a remote, or handles credentials, the tooltip includes a security warning and the command label shows a warning indicator. You know the risk before you run.

## Stored Locally, Updated Automatically

Summaries are cached in a local SQLite database at `.commandtree/commandtree.sqlite3` in your workspace. They persist across sessions and only regenerate when the underlying script content changes, so there is no repeated API overhead.

## Works Without Copilot

Every core feature of CommandTree, including discovery, execution, tagging, and filtering, works without Copilot. AI summaries are a bonus layer. If Copilot is unavailable, the extension behaves exactly as before.

## Get Started

Update to CommandTree 0.5.0 from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nimblesite.commandtree), make sure [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is installed, and hover over any command in the tree. For full details, see the [AI Summaries documentation](/docs/ai-summaries/).
