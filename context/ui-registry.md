# UI Registry

**Living document. Updated after every component is built. Read this before building any new component — match existing patterns exactly before inventing new ones.**

---

## How to Use

Before building any component:

1. **Check if a similar component already exists here.**
2. **If yes** — match its exact classes.
3. **If no** — build it following `ui-rules.md` and `ui-tokens.md`, then add it here.

**After building any component** — update this file with the component name, file path, and exact classes used.

---

## Entry format

Every component added to this registry follows this template exactly, so entries stay scannable and diffable. Copy this block verbatim when adding a new entry:

````
### ComponentName
- **Path:** `packages/ui/src/ComponentName.tsx`
- **Used by:** (tabs/components that consume this — update as new consumers are added)
- **Props:** `PropName: type` — one line each, only the ones a consumer needs to know
- **Classes:**
  ```tsx
  <div className="bg-surface border border-border rounded-md p-6">
  ```
- **Tokens used:** (list the `ui-tokens.md` tokens this component touches — makes a future token rename's blast radius greppable)
- **Notes:** (anything a future builder needs to know before reusing or extending this — e.g. "does not support a loading state yet")
````

Keep the `Classes` block to the actual, real `className` strings from the component's source — not a paraphrase. This file is only useful if copying from it produces pixel-identical output to the real component.

---

## Components

### Button

- **Path:** `packages/ui/src/Button.tsx`
- **Used by:** App shell buttons
- **Props:** `ButtonHTMLAttributes<HTMLButtonElement>` — native button props forwarded through the shared primitive
- **Classes:**
  ```tsx
  className={`rounded-sm bg-btn-primary-bg px-3 py-2 text-row text-btn-primary-text ${className}`}
  ```
- **Tokens used:** `btn-primary-bg`, `btn-primary-text`, `text-row`, `radius-sm`, `spacing-2`, `spacing-3`
- **Notes:** Shared primary button primitive for the Phase 0 shell; keep it token-only and avoid adding raw color classes.

### ScanResultRow

- **Path:** `packages/ui/src/ScanResultRow.tsx`
- **Used by:** Overview tab, Large Files tab, Unused Files tab, Duplicates tab
- **Props:**
  - `path: string`
  - `sizeBytes: number`
  - `category: string`
  - `extension?: string`
  - `modifiedAt?: string`
- **Classes:**
  ```tsx
  <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 transition-colors hover:bg-surface-secondary">
    <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xs bg-surface-secondary text-text-secondary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-row font-medium text-text-primary">
          {fileName}
        </p>
        <p className="truncate text-meta text-text-tertiary">{path}</p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-3">
      <span className="rounded-xs bg-surface-secondary px-1.5 py-0.5 text-meta uppercase text-text-secondary">
        {extension}
      </span>
      <span className="text-meta-emphasis text-text-primary font-semibold">
        {formatBytes(sizeBytes)}
      </span>
    </div>
  </div>
  ```
- **Tokens used:** `surface`, `surface-secondary`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `text-row`, `text-meta`, `text-meta-emphasis`, `radius-xs`
- **Notes:** Wrapped in `React.memo` for performance when rendering in long scan lists.
