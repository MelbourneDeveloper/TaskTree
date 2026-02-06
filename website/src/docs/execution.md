---
layout: layouts/docs.njk
title: Command Execution
eleventyNavigation:
  key: Command Execution
  order: 3
---

# Command Execution

Commands can be executed three ways via inline buttons or context menu.

## Run in New Terminal

Opens a new VS Code terminal and runs the command. Triggered by the play button or `commandtree.run`.

## Run in Current Terminal

Sends the command to the active terminal. Triggered by the circle-play button or `commandtree.runInCurrentTerminal`.

## Debug

Launches with the VS Code debugger. Only for launch configurations. Triggered by the bug button or `commandtree.debug`.

## Parameterized Commands

Shell scripts with `@param` comments prompt for input before execution. VS Code commands with `${input:*}` variables prompt automatically.

## Commands

| Command | Description |
|---------|-------------|
| `commandtree.run` | Run command in new terminal |
| `commandtree.runInCurrentTerminal` | Run in active terminal |
| `commandtree.debug` | Launch with debugger |
| `commandtree.refresh` | Reload all commands |
