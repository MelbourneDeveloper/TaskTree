---
layout: layouts/blog.njk
title: Introducing CommandTree - Auto-Discover Every Command in VS Code
description: Meet CommandTree — the free VS Code extension that discovers every runnable command in your workspace and puts them in one beautiful tree view.
date: 2026-02-07
author: Christian Findlay
tags: posts
excerpt: Meet CommandTree - the VS Code extension that discovers every runnable command in your workspace and puts them in one beautiful tree view.
---

Every project accumulates scripts. Shell scripts in `scripts/`, npm scripts in `package.json`, Makefile targets, VS Code tasks, launch configurations, Python scripts. They scatter across your project like leaves in autumn.

**CommandTree gathers them all into one place.**

## The Problem

You're working on a project. You need to run the build script. Was it `npm run build`? Or was there a Makefile target? Maybe there's a shell script in `scripts/build.sh`? You open the terminal, type `ls scripts/`, check `package.json`, look at the Makefile...

This shouldn't be hard.

## The Solution

Install CommandTree and a new panel appears in your VS Code sidebar. Every runnable command in your workspace is right there, categorized and ready to go:

- Shell scripts (`.sh`, `.bash`, `.zsh`)
- NPM scripts from every `package.json`
- Makefile targets
- VS Code tasks from `tasks.json`
- Launch configurations from `launch.json`
- Python scripts

Click the play button. Done.

## AI-Powered Summaries

With [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) installed, CommandTree goes a step further: it describes each command in plain language. Hover over any command and the tooltip tells you exactly what it does. Scripts that perform dangerous operations are flagged with a security warning so you know before you run. Learn more in the [AI Summaries documentation](/docs/ai-summaries/).

## Quick Launch

Pin your favorites. Click the star icon on any command and it appears in the [Quick Launch](/docs/configuration/#quick-launch) panel at the top. Your most-used commands are always one click away.

## Tags and Filters

Group related commands with tags. Filter the tree by text or tag. Find exactly what you need, instantly. See [Configuration](/docs/configuration/#filtering) for all filtering options.

## Get Started

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nimblesite.commandtree) or from source:

```bash
npm install
npm run package
code --install-extension commandtree-*.vsix
```

Open any workspace and CommandTree does the rest.
