---
layout: layouts/docs.njk
title: Run & Debug Commands in VS Code - CommandTree Docs
description: Execute discovered commands three ways in VS Code — new terminal, current terminal, or debugger. Supports parameterized scripts with input prompts.
eleventyNavigation:
  key: Command Execution
  order: 4
---

# Command Execution

CommandTree lets you execute any discovered command three ways — in a new terminal, the current terminal, or the VS Code debugger — via inline buttons or context menu.

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

## Frequently Asked Questions

### Which commands can be debugged?

Only VS Code launch configurations (from `.vscode/launch.json`) can be launched with the debugger. All other command types run in a terminal. See [Command Discovery](/docs/discovery/) for the full list of supported types.

### What happens with parameterized shell scripts?

Shell scripts that include `@param` comments prompt you for input before execution. CommandTree shows an input box for each parameter. See [Command Discovery](/docs/discovery/#shell-scripts) for the `@param` syntax.

### Can I run a command in my existing terminal instead of opening a new one?

Yes. Use the circle-play button or the "Run in Current Terminal" context menu option. This sends the command to your active terminal session, preserving your current working directory and environment.

### How do I pin frequently used commands?

Click the star icon on any command to add it to [Quick Launch](/docs/configuration/#quick-launch). Pinned commands appear in a dedicated panel at the top of the tree for one-click access.
