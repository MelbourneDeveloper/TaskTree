# VS Code Decoupling Plan for Semantic Providers

## Current State - Coupling Issues

### ❌ **HIGH PRIORITY: store.ts**
**Problem:** Uses `vscode.workspace.fs` and `vscode.Uri` for file operations
**Impact:** Cannot unit test without VS Code instance
**Files:** `src/semantic/store.ts` lines 54-57, 74-81, 129-139, 151-156, 162-173

**Functions affected:**
- `readSummaryStore()` - Uses `vscode.workspace.fs.readFile()`
- `writeSummaryStore()` - Uses `vscode.workspace.fs.writeFile()`
- `readLegacyJsonStore()` - Uses `vscode.workspace.fs.readFile()`
- `deleteLegacyJsonStore()` - Uses `vscode.workspace.fs.delete()`
- `legacyStoreExists()` - Uses `vscode.workspace.fs.stat()`

**Solution:**
1. Accept `FileSystemAdapter` parameter in all functions
2. Remove all `vscode` imports from `store.ts`
3. Create `VSCodeFileSystem` adapter in extension.ts for production use
4. Use `NodeFileSystem` adapter in unit tests

### ❌ **MEDIUM PRIORITY: index.ts**
**Problem:** Uses `vscode.workspace.getConfiguration()` and `vscode.Uri.file()`
**Impact:** Core orchestration logic coupled to VS Code
**Files:** `src/semantic/index.ts` lines 32-36, 86-89

**Functions affected:**
- `isAiEnabled()` - Reads VS Code configuration directly
- `readTaskContent()` - Creates `vscode.Uri` and calls VS Code file API

**Solution:**
1. Pass configuration value as parameter instead of reading directly
2. Accept file path string instead of creating Uri internally
3. Move VS Code-specific logic to `extension.ts`

### ✅ **OK BUT NEEDS ABSTRACTION: summariser.ts**
**Problem:** Uses `vscode.lm` API but cannot be unit tested
**Impact:** Cannot test summarisation logic in isolation
**Files:** `src/semantic/summariser.ts` lines 25-50, 66-78

**Solution:**
1. Create `LanguageModelAdapter` interface (already in `adapters.ts`)
2. Accept adapter as parameter instead of using `vscode.lm` directly
3. Create `CopilotLMAdapter` wrapper in production code
4. Create `MockLMAdapter` for unit tests

## Implementation Steps

### Step 1: Fix store.ts (HIGHEST IMPACT)

```typescript
// BEFORE (coupled):
export async function readSummaryStore(
    workspaceRoot: string
): Promise<Result<SummaryStoreData, string>> {
    const uri = vscode.Uri.file(storePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    // ...
}

// AFTER (decoupled):
export async function readSummaryStore(params: {
    readonly workspaceRoot: string;
    readonly fs: FileSystemAdapter;
}): Promise<Result<SummaryStoreData, string>> {
    const storePath = path.join(params.workspaceRoot, '.vscode', STORE_FILENAME);
    const result = await params.fs.readFile(storePath);
    if (!result.ok) { return ok({ records: {} }); }
    // ...
}
```

### Step 2: Fix index.ts

```typescript
// BEFORE (coupled):
export function isAiEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('commandtree')
        .get<boolean>('enableAiSummaries', false);
}

// AFTER (decoupled):
export function isAiEnabled(config: ConfigAdapter): boolean {
    return config.get('commandtree.enableAiSummaries', false);
}
```

### Step 3: Create VS Code Adapters in extension.ts

```typescript
// Production adapters that use VS Code APIs
function createVSCodeFileSystem(): FileSystemAdapter {
    return {
        async readFile(path: string) {
            const uri = vscode.Uri.file(path);
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                return ok(new TextDecoder().decode(bytes));
            } catch (e) {
                return err(e instanceof Error ? e.message : 'Read failed');
            }
        },
        // ... other methods
    };
}

function createVSCodeConfig(): ConfigAdapter {
    return {
        get<T>(key: string, defaultValue: T): T {
            return vscode.workspace.getConfiguration().get(key, defaultValue);
        }
    };
}
```

## Benefits

### ✅ **Unit Testing**
- Test semantic providers WITHOUT starting VS Code instance
- Test file operations with in-memory or temp file systems
- Test configuration scenarios by passing different config objects
- Test LLM integration with mock responses

### ✅ **Faster Tests**
- Unit tests run in milliseconds instead of seconds
- No need to launch VS Code test runner for business logic
- Can test edge cases easily (file not found, parse errors, etc.)

### ✅ **Better Architecture**
- Clear separation: business logic vs. VS Code integration
- Providers are pure functions that can be reused
- Easy to add new adapters (web version, CLI version, etc.)

### ✅ **Easier Debugging**
- Can run provider logic in isolation
- Can reproduce issues without full VS Code setup
- Can test with different file systems (mock, real, etc.)

## Current Test Coverage

### ✅ **Already Decoupled (Unit Testable)**
- `similarity.ts` - Pure math, no dependencies
- `db.ts` - Uses SQLite WASM, no VS Code
- `embedder.ts` - Uses HuggingFace, no VS Code

### ❌ **Blocked by VS Code Coupling (Cannot Unit Test)**
- `store.ts` - Cannot test without VS Code file system
- `index.ts` - Cannot test orchestration logic in isolation
- `summariser.ts` - Cannot mock Copilot responses

## Next Actions

1. **Create VS Code adapters** in `extension.ts`
2. **Refactor store.ts** to accept `FileSystemAdapter`
3. **Refactor index.ts** to accept config/file adapters
4. **Create unit tests** for store, index, summariser using adapters
5. **Update E2E tests** to pass VS Code adapters from extension.ts

## Files to Create

- ✅ `src/semantic/adapters.ts` - Interface definitions + Node.js implementation
- ⏳ `src/semantic/vscodeAdapters.ts` - VS Code implementations (production)
- ⏳ `src/test/unit/store.unit.test.ts` - Unit tests for store.ts
- ⏳ `src/test/unit/index.unit.test.ts` - Unit tests for index.ts orchestration

## Files to Modify

- ⏳ `src/semantic/store.ts` - Accept FileSystemAdapter parameter
- ⏳ `src/semantic/index.ts` - Accept adapters instead of using VS Code APIs directly
- ⏳ `src/semantic/summariser.ts` - Accept LanguageModelAdapter parameter
- ⏳ `src/extension.ts` - Create and pass VS Code adapters to semantic functions
