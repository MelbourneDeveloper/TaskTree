# CommandTree Specification

## Table of Contents

- [Overview](#overview)
- [Command Discovery](#command-discovery)
  - [Shell Scripts](#shell-scripts)
  - [NPM Scripts](#npm-scripts)
  - [Makefile Targets](#makefile-targets)
  - [Launch Configurations](#launch-configurations)
  - [VS Code Tasks](#vs-code-tasks)
  - [Python Scripts](#python-scripts)
  - [.NET Projects](#net-projects)
- [Command Execution](#command-execution)
  - [Run in New Terminal](#run-in-new-terminal)
  - [Run in Current Terminal](#run-in-current-terminal)
  - [Debug](#debug)
    - [Setting Up Debugging](#setting-up-debugging)
    - [Language-Specific Debug Examples](#language-specific-debug-examples)
- [Quick Launch](#quick-launch)
- [Tagging](#tagging)
  - [Managing Tags](#managing-tags)
  - [Tag Filter](#tag-filter)
  - [Clear Filter](#clear-filter)
- [RAG Search](#rag-search)
- [Parameterized Commands](#parameterized-commands)
  - [Parameter Definition](#parameter-definition)
  - [Parameter Formats](#parameter-formats)
  - [Language-Specific Examples](#language-specific-examples)
    - [.NET Projects](#net-projects-1)
    - [Shell Scripts](#shell-scripts-1)
    - [Python Scripts](#python-scripts-1)
    - [NPM Scripts](#npm-scripts-1)
  - [VS Code Tasks](#vs-code-tasks-1)
- [Settings](#settings)
  - [Exclude Patterns](#exclude-patterns)
  - [Sort Order](#sort-order)
- [Database Schema](#database-schema)
  - [Commands Table Columns](#commands-table-columns)
  - [Tags Table Columns](#tags-table-columns)
- [AI Summaries and Semantic Search](#ai-summaries-and-semantic-search)
  - [Automatic Processing Flow](#automatic-processing-flow)
  - [Summary Generation](#summary-generation)
  - [Embedding Generation](#embedding-generation)
  - [Search Implementation](#search-implementation)
  - [Verification](#verification)
- [Command Skills](#command-skills) *(not yet implemented)*
  - [Skill File Format](#skill-file-format)
  - [Context Menu Integration](#context-menu-integration)
  - [Skill Execution](#skill-execution)

---

## Overview
**overview**

CommandTree scans a VS Code workspace and surfaces all runnable commands in a single tree view sidebar panel. It discovers shell scripts, npm scripts, Makefile targets, VS Code tasks, launch configurations, etc then presents them in a categorized, filterable tree.

**Tree Rendering Architecture:**

The tree view is generated **directly from the file system** by parsing package.json, Makefiles, shell scripts, etc. All core functionality (running commands, tagging, filtering by tag) works without a database.

The SQLite database **enriches** the tree with AI-generated summaries and embeddings:
- **Database empty**: Tree displays all commands normally, no summaries shown, semantic search unavailable
- **Database populated**: Summaries appear in tooltips + semantic search becomes available

The `commands` table is a **cache/enrichment layer**, not the source of truth for what commands exist.

## Command Discovery
**command-discovery**

CommandTree recursively scans the workspace for runnable commands grouped by type. Discovery respects exclude patterns configured in settings. It does this in the background on low priority.

### Shell Scripts
**command-discovery/shell-scripts**

Discovers `.sh` files throughout the workspace. Supports optional `@param` and `@description` comments for metadata.

### NPM Scripts
**command-discovery/npm-scripts**

Reads `scripts` from all `package.json` files, including nested projects and subfolders.

### Makefile Targets
**command-discovery/makefile-targets**

Parses `Makefile` and `makefile` for named targets.

### Launch Configurations
**command-discovery/launch-configurations**

Reads debug configurations from `.vscode/launch.json`.

### VS Code Tasks
**command-discovery/vscode-tasks**

Reads task definitions from `.vscode/tasks.json`, including support for `${input:*}` variable prompts.

### Python Scripts
**command-discovery/python-scripts**

Discovers files with a `.py` extension.

### .NET Projects
**command-discovery/dotnet-projects**

Discovers .NET projects (`.csproj`, `.fsproj`) and automatically creates tasks based on project type:

- **All projects**: `build`, `clean`
- **Test projects** (containing `Microsoft.NET.Test.Sdk` or test frameworks): `test` with optional filter parameter
- **Executable projects** (OutputType = Exe/WinExe): `run` with optional runtime arguments

**Parameter Support**:
- `dotnet run`: Accepts runtime arguments passed after `--` separator
- `dotnet test`: Accepts `--filter` expression for selective test execution

**Debugging**: Use VS Code's built-in .NET debugging by creating launch configurations in `.vscode/launch.json`. These are automatically discovered via Launch Configuration discovery.

## Command Execution
**command-execution**

Commands can be executed three ways via inline buttons or context menu.

### Run in New Terminal
**command-execution/new-terminal**

Opens a new VS Code terminal and runs the command. Triggered by the play button or `commandtree.run` command.

### Run in Current Terminal
**command-execution/current-terminal**

Sends the command to the currently active terminal. Triggered by the circle-play button or `commandtree.runInCurrentTerminal` command.

### Debug
**command-execution/debug**

Launches the command using the VS Code debugger. Triggered by the bug button or `commandtree.debug` command.

**Debugging Strategy**: CommandTree leverages VS Code's native debugging capabilities through launch configurations rather than implementing custom debug logic for each language.

#### Setting Up Debugging
**command-execution/debug-setup**

To debug projects discovered by CommandTree:

1. **Create Launch Configuration**: Add a `.vscode/launch.json` file to your workspace
2. **Auto-Discovery**: CommandTree automatically discovers and displays all launch configurations
3. **Click to Debug**: Click the debug button (🐛) next to any launch configuration to start debugging

#### Language-Specific Debug Examples
**command-execution/debug-examples**

**.NET Projects**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": ".NET Core Launch (console)",
      "type": "coreclr",
      "request": "launch",
      "preLaunchTask": "build",
      "program": "${workspaceFolder}/bin/Debug/net8.0/MyApp.dll",
      "args": [],
      "cwd": "${workspaceFolder}",
      "stopAtEntry": false
    }
  ]
}
```

**Node.js/TypeScript**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Node",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build"
    }
  ]
}
```

**Python**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Current File",
      "type": "python",
      "request": "launch",
      "program": "${file}",
      "console": "integratedTerminal"
    }
  ]
}
```

**Note**: VS Code's IntelliSense provides language-specific templates when creating launch.json files. Press `Ctrl+Space` (or `Cmd+Space` on Mac) to see available configuration types for installed debuggers.

## Quick Launch
**quick-launch**

Users can star commands to pin them in a "Quick Launch" panel at the top of the tree view. Starred command identifiers are persisted in the as `quick` tags in the db.

## Tagging
**tagging**

Tags are simple one-word identifiers (e.g., "build", "test", "deploy") that link to commands via a many-to-many relationship in the database.

**Command ID Format:**

Every command has a unique ID generated as: `{type}:{filePath}:{name}`

Examples:
- `npm:/Users/you/project/package.json:build`
- `shell:/Users/you/project/scripts/deploy.sh:deploy.sh`
- `make:/Users/you/project/Makefile:test`
- `launch:/Users/you/project/.vscode/launch.json:Launch Chrome`

**How it works:**
1. User right-clicks a command and selects "Add Tag"
2. Tag is created in `tags` table if it doesn't exist: `(tag_id UUID, tag_name, description)`
3. Junction record is created in `command_tags` table: `(command_id, tag_id, display_order)`
4. The `command_id` is the exact ID string from above (e.g., `npm:/path/to/package.json:build`)
5. To filter by tag: `SELECT c.* FROM commands c JOIN command_tags ct ON c.command_id = ct.command_id JOIN tags t ON ct.tag_id = t.tag_id WHERE t.tag_name = 'build'`
6. Display the matching commands in the tree view

**No pattern matching, no wildcards** - just exact `command_id` matching via straightforward database JOINs across the 3-table schema.

**Database Operations** (implemented in `src/semantic/db.ts`):
**database-schema/tag-operations**

- `addTagToCommand(params)` - Creates tag in `tags` table if needed, then adds junction record
- `removeTagFromCommand(params)` - Removes junction record from `command_tags`
- `getCommandIdsByTag(params)` - Returns all command IDs for a tag (ordered by `display_order`)
- `getTagsForCommand(params)` - Returns all tags assigned to a command
- `getAllTagNames(handle)` - Returns all distinct tag names from `tags` table
- `updateTagDisplayOrder(params)` - Updates display order in `command_tags` for drag-and-drop

### Managing Tags
**tagging/management**

- **Add tag to command**: Right-click a command > "Add Tag" > select existing or create new
- **Remove tag from command**: Right-click a command > "Remove Tag"

### Tag Filter
**tagging/filter**

Pick a tag from the toolbar picker (`commandtree.filterByTag`) to show only commands that have that tag assigned in the database.

### Clear Filter
**tagging/clearfilter**

Remove all active filters via toolbar button or `commandtree.clearFilter` command.

All tag assignments are stored in the SQLite database (`tags` master table + `command_tags` junction table).

## RAG search
**ragsearch**

This searches through the records with a vector proximity search based on the embeddings. There is no text filtering function.

## Parameterized Commands
**parameterized-commands**

Commands can accept user input at runtime through a flexible parameter system that adapts to different tool requirements.

### Parameter Definition
**parameterized-commands/definition**

Parameters are defined during discovery with metadata describing how they should be collected and formatted:

```typescript
{
    name: 'filter',           // Parameter identifier
    description: 'Test filter expression',  // User prompt
    default: '',              // Optional default value
    options: ['option1', 'option2'],  // Optional dropdown choices
    format: 'flag',           // How to format in command (see below)
    flag: '--filter'          // Flag name (when format is 'flag' or 'flag-equals')
}
```

### Parameter Formats
**parameterized-commands/formats**

The `format` field controls how parameter values are inserted into commands:

| Format | Example Input | Example Output | Use Case |
|--------|--------------|----------------|----------|
| `positional` (default) | `value` | `command "value"` | Shell scripts, Python positional args |
| `flag` | `value` | `command --flag "value"` | Named options (npm, dotnet test) |
| `flag-equals` | `value` | `command --flag=value` | Equals-style flags (some CLIs) |
| `dashdash-args` | `arg1 arg2` | `command -- arg1 arg2` | Runtime args (dotnet run, npm run) |

**Empty value behavior**: All formats skip adding anything to the command if the user provides an empty value, making all parameters effectively optional.

### Language-Specific Examples
**parameterized-commands/examples**

#### .NET Projects
```typescript
// dotnet run with runtime arguments
{
    name: 'args',
    format: 'dashdash-args',
    description: 'Runtime arguments (optional, space-separated)'
}
// Result: dotnet run -- arg1 arg2

// dotnet test with filter
{
    name: 'filter',
    format: 'flag',
    flag: '--filter',
    description: 'Test filter expression'
}
// Result: dotnet test --filter "FullyQualifiedName~MyTest"
```

#### Shell Scripts
```bash
#!/bin/bash
# @param environment Target environment (staging, production)
# @param verbose Enable verbose output (default: false)
```
```typescript
// Discovered as:
[
    { name: 'environment', format: 'positional' },
    { name: 'verbose', format: 'positional', default: 'false' }
]
// Result: ./script.sh "staging" "false"
```

#### Python Scripts
```python
# @param config Config file path
# @param debug Enable debug mode (default: False)
```
```typescript
// Discovered as:
[
    { name: 'config', format: 'positional' },
    { name: 'debug', format: 'positional', default: 'False' }
]
// Result: python script.py "config.json" "False"
```

#### NPM Scripts
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```
For runtime args, use `dashdash-args` format to pass arguments through to the underlying script:
```typescript
{ name: 'args', format: 'dashdash-args' }
// Result: npm run start -- --port=3000
```

### VS Code Tasks
**parameterized-commands/vscode-tasks**

VS Code tasks using `${input:*}` variables prompt automatically via the built-in input UI. These are handled natively by VS Code's task system.

## Settings
**settings**

All settings are configured via VS Code settings (`Cmd+,` / `Ctrl+,`).

### Exclude Patterns
**settings/exclude-patterns**

`commandtree.excludePatterns` - Glob patterns to exclude from command discovery. Default includes `**/node_modules/**`, `**/.vscode-test/**`, and others.

### Sort Order
**settings/sort-order**

`commandtree.sortOrder` - How commands are sorted within categories:

| Value | Description |
|-------|-------------|
| `folder` | Sort by folder path, then alphabetically (default) |
| `name` | Sort alphabetically by command name |
| `type` | Sort by command type, then alphabetically |

---


## Database Schema
**database-schema**

Three tables store AI enrichment data, tag definitions, and tag assignments

```sql
-- COMMANDS TABLE
-- Stores AI-generated summaries and embeddings for discovered commands
-- NOTE: This is NOT the source of truth - commands are discovered from filesystem
-- This table only adds AI features (summaries, semantic search) to the tree view
CREATE TABLE IF NOT EXISTS commands (
    command_id TEXT PRIMARY KEY,        -- Unique command identifier (e.g., "npm:/path/to/package.json:build")
    content_hash TEXT NOT NULL,         -- SHA-256 hash of command content for change detection
    summary TEXT NOT NULL,              -- AI-GENERATED SUMMARY: Plain-language description from GitHub Copilot (1-3 sentences)
                                        -- MUST be populated for EVERY command automatically in background
                                        -- Example: "Builds the TypeScript project and outputs to the dist directory"
    embedding BLOB,                     -- EMBEDDING VECTOR: 384 Float32 values (1536 bytes) generated from the summary
                                        -- MUST be populated by embedding the summary text using all-MiniLM-L6-v2
                                        -- Required for semantic search to work
    security_warning TEXT,              -- SECURITY WARNING: AI-detected security risk description (nullable)
                                        -- Populated via VS Code Language Model Tool API (structured output)
                                        -- When non-empty, tree view shows ⚠️ icon next to command
    last_updated TEXT NOT NULL          -- ISO 8601 timestamp of last summary/embedding generation
);

-- TAGS TABLE
-- Master list of available tags
CREATE TABLE IF NOT EXISTS tags (
    tag_id TEXT PRIMARY KEY,            -- UUID primary key
    tag_name TEXT NOT NULL UNIQUE,      -- Tag identifier (e.g., "quick", "deploy", "test")
    description TEXT                    -- Optional tag description
);

-- COMMAND_TAGS JUNCTION TABLE
-- Many-to-many relationship between commands and tags
-- STRICT REFERENTIAL INTEGRITY ENFORCED: Both FKs have CASCADE DELETE
-- When a command is deleted, all its tag assignments are automatically removed
-- When a tag is deleted, all command assignments are automatically removed
CREATE TABLE IF NOT EXISTS command_tags (
    command_id TEXT NOT NULL,           -- Foreign key to commands.command_id with CASCADE DELETE
    tag_id TEXT NOT NULL,               -- Foreign key to tags.tag_id with CASCADE DELETE
    display_order INTEGER NOT NULL DEFAULT 0,  -- Display order for drag-and-drop reordering
    PRIMARY KEY (command_id, tag_id),
    FOREIGN KEY (command_id) REFERENCES commands(command_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);
```

CRITICAL: No backwards compatibility. If the database structure is wrong, the extension blows it away and recreates it from scratch.

**Implementation**: SQLite via `node-sqlite3-wasm`
- **Location**: `{workspaceFolder}/.commandtree/commandtree.sqlite3`
- **Runtime**: Pure WASM, no native compilation (~1.3 MB)
- **CRITICAL**: `PRAGMA foreign_keys = ON;` MUST be executed on EVERY database connection
  - SQLite disables FK constraints by default - this is a SQLite design flaw
  - Implementation: `openDatabase()` in `db.ts` runs this pragma immediately after opening
  - Without this pragma, FK constraints are SILENTLY IGNORED and orphaned records can be created
- **Orphan Prevention**: `ensureCommandExists()` inserts placeholder command rows before adding tags
  - Called automatically by `addTagToCommand()` before creating junction records
  - Placeholder rows have empty summary/content_hash and NULL embedding
  - Ensures FK constraints are always satisfied - no orphaned tag assignments possible
- **API**: Synchronous, no async overhead for reads
- **Persistence**: Automatic file-based storage

### Commands Table Columns

- **`command_id`**: Unique command identifier with format `{type}:{filePath}:{name}` (PRIMARY KEY)
  - Examples: `npm:/path/to/package.json:build`, `shell:/path/to/script.sh:script.sh`
  - This ID is used for exact matching when filtering by tags (no wildcards, no patterns)
- **`content_hash`**: SHA-256 hash of command content for change detection (NOT NULL)
- **`summary`**: AI-generated plain-language description (1-3 sentences) (NOT NULL, REQUIRED)
  - **MUST be populated by GitHub Copilot** for every command
  - Example: "Builds the TypeScript project and outputs to the dist directory"
  - **If missing, the feature is BROKEN**
- **`embedding`**: 384 Float32 values (1536 bytes total)
  - **MUST be populated** by embedding the `summary` text using `all-MiniLM-L6-v2`
  - Stored as BLOB containing serialized Float32Array
  - **If missing or NULL, semantic search CANNOT work**
- **`security_warning`**: AI-detected security risk description (TEXT, nullable)
  - Populated via VS Code Language Model Tool API (structured output from Copilot)
  - When non-empty, tree view shows ⚠️ icon next to the command label
  - Hovering shows the full warning text in the tooltip
  - Example: "Deletes build output files including node_modules without confirmation"
- **`last_updated`**: ISO 8601 timestamp of last summary/embedding generation (NOT NULL)

### Tags Table Columns
**database-schema/tags-table**

Master list of available tags:

- **`tag_id`**: UUID primary key
- **`tag_name`**: Tag identifier (e.g., "quick", "deploy", "test") (NOT NULL, UNIQUE)
- **`description`**: Optional human-readable tag description (TEXT, nullable)

### Command Tags Junction Table Columns
**database-schema/command-tags-junction**

Many-to-many relationship between commands and tags with STRICT referential integrity:

- **`command_id`**: Foreign key referencing `commands.command_id` (NOT NULL)
  - Stores the exact command ID string (e.g., `npm:/path/to/package.json:build`)
  - **FK CONSTRAINT ENFORCED**: `FOREIGN KEY (command_id) REFERENCES commands(command_id) ON DELETE CASCADE`
  - Used for exact matching - no pattern matching involved
  - `ensureCommandExists()` creates placeholder command rows if needed before tagging
- **`tag_id`**: Foreign key referencing `tags.tag_id` (NOT NULL)
  - **FK CONSTRAINT ENFORCED**: `FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE`
- **`display_order`**: Integer for ordering commands within a tag (NOT NULL, default 0)
  - Used for drag-and-drop reordering in Quick Launch
- **Primary Key**: `(command_id, tag_id)` ensures each command-tag pair is unique
- **Cascade Delete**: When a command OR tag is deleted, junction records are automatically removed
- **Orphan Prevention**: Cannot insert junction records for non-existent commands or tags

--

## AI Summaries and Semantic Search
**ai-semantic-search**

CommandTree **enriches** the tree view with AI-generated summaries and enables semantic search. This is an **optional enhancement layer** - all core functionality (running commands, tagging, filtering) works without it.

**What happens when database is populated:**
- AI summaries appear in command tooltips
- Semantic search (magnifying glass icon) becomes available
- Background processing automatically keeps summaries up-to-date

**What happens when database is empty:**
- Tree view still displays all commands discovered from filesystem
- Commands can still be run, tagged, and filtered by tag
- Semantic search is unavailable (gracefully disabled)

This is a **fully automated background process** that requires no user intervention once enabled.

### Automatic Processing Flow
**ai-processing-flow**

**CRITICAL: This processing MUST happen automatically for EVERY discovered command:**

1. **Discovery**: Command is discovered (shell script, npm script, etc.)
2. **Summary Generation**: GitHub Copilot generates a plain-language summary (1-3 sentences) describing what the command does
3. **Summary Storage**: Summary is stored in the `commands` table (`summary` column) in SQLite
4. **Embedding Generation**: The summary text is embedded into a 384-dimensional vector using `all-MiniLM-L6-v2`
5. **Embedding Storage**: Vector is stored in the `commands` table (`embedding` BLOB column) in SQLite
6. **Hash Storage**: Content hash is stored for change detection to avoid re-processing unchanged commands

**Triggers**:
- Initial scan: Process all commands when extension activates
- File watch: Re-process when command files change (debounced 2000ms)
- Never block the UI: All processing runs asynchronously in background

**REQUIRED OUTCOME**: The database MUST contain BOTH summaries AND embeddings for all discovered commands. If either is missing, the feature is broken. If the tests don't prove this works e2e, the feature is NOT complete.

### Summary Generation
**ai-summary-generation**

- **LLM**: GitHub Copilot via `vscode.lm` API (stable since VS Code 1.90)
- **Input**: Command content (script code, npm script definition, etc.)
- **Output**: Structured result via Language Model Tool API (`summary` + `securityWarning`)
- **Tool Mode**: `LanguageModelChatToolMode.Required` — forces structured output, no text parsing
- **Storage**: `commands.summary` and `commands.security_warning` columns in SQLite
- **Display**: Summary in tooltip on hover. Security warnings shown as ⚠️ prefix on tree item label + warning section in tooltip
- **Requirement**: GitHub Copilot installed and authenticated
- **MUST HAPPEN**: For every discovered command, automatically in background

### Embedding Generation
**ai-embedding-generation**

⛔️ TEMPORARILY DISABLED UNTIL WE CAN GET A SMALL EMBEDDING MODEL WORKING

- **Model**: `all-MiniLM-L6-v2` via `@huggingface/transformers`
- **Input**: The AI-generated summary text (NOT the raw command code)
- **Output**: 384-dimensional Float32 vector
- **Storage**: `commands.embedding` BLOB column in SQLite (1536 bytes)
- **Size**: Model ~23 MB, downloaded to `{workspaceFolder}/.commandtree/models/`
- **Performance**: ~10ms per embedding
- **Runtime**: Pure JS/WASM, no native binaries
- **MUST HAPPEN**: For every command that has a summary, automatically in background

### Search Implementation
**ai-search-implementation**

Semantic search ranks and displays commands by vector proximity **using embeddings stored in the database**.

**PREREQUISITE**: The `commands` table MUST contain valid embedding vectors for all commands. If the table is empty or embeddings are missing, semantic search cannot work.

**Search Flow**:

1. User invokes semantic search through magnifying glass icon in the UI
2. User enters natural language query (e.g., "build the project")
3. Query embedded using `all-MiniLM-L6-v2` (~10ms)
4. **Load all embeddings from database**: Read `command_id` and `embedding` BLOB from `commands` table
5. **Calculate cosine similarity**: Compare query embedding against ALL stored command embeddings
6. Commands ranked by descending similarity score (0.0-1.0)
7. Match percentage displayed next to each command (e.g., "build (87%)")
8. Low-scoring commands filtered out using **permissive threshold** (err on side of showing more)
   - Default threshold: 0.3 (30% similarity)
   - Better to show irrelevant results than hide relevant ones

**Score Display**: Similarity scores must be preserved and displayed to user. Never discard scores after ranking.

**Note**: Tag filtering (`commandtree.filterByTag`) is separate and filters by tag membership.

### Verification
**ai-verification**

**To verify the AI features are working correctly, check the database:**

```bash
# Open the database
sqlite3 .commandtree/commandtree.sqlite3

# Check that summaries exist for all commands
SELECT command_id, summary FROM commands;

# Check that embeddings exist for all commands
SELECT command_id, length(embedding) as embedding_size FROM commands;
```

**Expected results**:
- **Summaries**: Every row MUST have a non-empty `summary` column (plain text, 1-3 sentences)
- **Embeddings**: Every row MUST have `embedding_size = 1536` bytes (384 floats × 4 bytes each)
- **Row count**: Should match the number of discovered commands in the tree view

**If summaries or embeddings are missing**:
- The background processing is NOT running
- GitHub Copilot may not be installed/authenticated
- The embedding model may not be downloaded
- **The feature is BROKEN and must be fixed**

---

## Command Skills

**command-skills**

> **STATUS: NOT YET IMPLEMENTED**

Command skills are markdown files stored in `.commandtree/skills/` that describe actions to perform on scripts. Each skill adds a context menu item to command items in the tree view. Selecting the menu item uses GitHub Copilot as an agent to perform the skill on the target script.

**Reference:** https://agentskills.io/what-are-skills

### Skill File Format

Each skill is a single markdown file in `{workspaceRoot}/.commandtree/skills/`. The file contains YAML front matter for metadata followed by markdown instructions.

```markdown
---
name: Clean Up Script
icon: sparkle
---

- Remove superfluous comments from script
- Remove duplication
- Clean up formatting
```

**Front matter fields:**

| Field  | Required | Description                                      |
|--------|----------|--------------------------------------------------|
| `name` | Yes      | Display text shown in the context menu            |
| `icon` | No       | VS Code ThemeIcon id (defaults to `wand`)         |

The markdown body is the instruction set sent to Copilot when the skill is executed.

### Context Menu Integration

- On activation (and on file changes in `.commandtree/skills/`), discover all `*.md` files in the skills folder
- Register a dynamic context menu item per skill on command tree items (`viewItem == task`)
- Each menu item shows the `name` from front matter and the chosen icon
- Skills appear in a dedicated `4_skills` menu group in the context menu

### Skill Execution

When the user selects a skill from the context menu:

1. Read the target command's script content (using `TaskItem.filePath`)
2. Read the skill markdown body (the instructions)
3. Select a Copilot model via `selectCopilotModel()`
4. Send a request to Copilot with the script content and skill instructions
5. Apply the result back to the script file (with user confirmation via a diff editor)
