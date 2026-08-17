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

```
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
```

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

### SafetyTagPill

- **Path:** `packages/ui/src/SafetyTagPill.tsx`
- **Used by:** ConfirmationModal, Overview tab, Large Files tab, Duplicates tab
- **Props:**
  - `tier: "safe" | "check" | "blocked" | "unsure"`
  - `label?: string`
  - `className?: string`
- **Classes:**
  ```tsx
  <span className="inline-flex items-center rounded-xs px-1.5 py-0.5 text-meta font-medium bg-tag-safe-bg text-tag-safe-text">
    Safe to Clean
  </span>
  ```
- **Tokens used:** `tag-safe-bg`, `tag-safe-text`, `tag-check-bg`, `tag-check-text`, `tag-danger-bg`, `tag-danger-text`, `tag-unsure-bg`, `tag-unsure-text`, `text-meta`, `radius-xs`
- **Notes:** Wrapped in `React.memo`. Strictly maps safety tiers to design system semantic tag tokens.

### ConfirmationModal

- **Path:** `packages/ui/src/ConfirmationModal.tsx`
- **Used by:** Overview tab, Cleanup actions across all tabs
- **Props:**
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
  - `title?: string`
  - `description?: string`
  - `items: ConfirmationModalItem[]`
  - `totalBytesFormatted: string`
  - `confirmLabel?: string`
  - `cancelLabel?: string`
  - `onConfirm: () => void`
  - `onCancel?: () => void`
  - `isLoading?: boolean`
- **Classes:**
  ```tsx
  <AlertDialog.Content className="fixed top-[50%] left-[50%] z-50 flex max-h-[85vh] w-[560px] translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border border-border bg-surface-overlay p-6 shadow-2xl focus:outline-hidden">
    <AlertDialog.Title className="text-title font-rounded text-text-primary">
      Move Files to Trash?
    </AlertDialog.Title>
    <AlertDialog.Description className="mt-1 text-row text-text-secondary">
      The following files will be moved to your operating system trash bin...
    </AlertDialog.Description>
  </AlertDialog.Content>
  ```
- **Tokens used:** `surface-overlay`, `surface-secondary`, `surface`, `border`, `btn-primary-bg`, `btn-primary-text`, `btn-secondary-border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-check-bg`, `tag-check-text`, `text-title`, `text-row`, `text-meta`, `radius-lg`, `radius-md`, `radius-sm`
- **Notes:** Accessible destructive dialog primitive built on Radix AlertDialog with full focus trapping, keyboard handling, ARIA roles, item list preview, and OS trash invariant guidance.

### DuplicateGroupCard

- **Path:** `apps/desktop/src/renderer/src/components/DuplicateGroupCard.tsx`
- **Used by:** Duplicates tab
- **Props:**
  - `group: DuplicateGroup`
  - `selectedFileIds: Set<number>`
  - `onToggleFileSelection: (fileId: number) => void`
  - `onSelectKeepFile: (groupId: number, keepFileId: number) => void`
  - `defaultExpanded?: boolean`
- **Classes:**
  ```tsx
  <div className="overflow-hidden rounded-md border border-border bg-surface [content-visibility:auto] [contain-intrinsic-size:0_80px] transition-colors duration-150 hover:border-border/80">
  ```
- **Tokens used:** `surface`, `surface-secondary`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-safe-text`, `tag-safe-bg`, `tag-check-bg`, `tag-check-text`, `radius-md`
- **Notes:** Expandable duplicate group card displaying member items, similarity badges, recommended keep selections, and individual item checkbox toggles. Wrapped in `React.memo` with custom `arePropsEqual` comparator and `content-visibility: auto` layout virtualization.

### DuplicatesTab

- **Path:** `apps/desktop/src/renderer/src/components/DuplicatesTab.tsx`
- **Used by:** App main view (`activeTab === "Duplicates"`)
- **Props:** None
- **Classes:**
  ```tsx
  <div className="flex h-full flex-col overflow-hidden bg-background">
  ```
- **Tokens used:** `background`, `surface`, `surface-secondary`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-danger-bg`, `tag-danger-text`, `btn-primary-bg`, `btn-primary-text`
- **Notes:** Full tab interface for browsing exact & near-duplicate groups, filtering by hash type, monitoring real-time detection progress streaming, managing file selection, and triggering batch deletion via `ConfirmationModal`. Wrapped in `React.memo`.

### OverviewTab

- **Path:** `apps/desktop/src/renderer/src/components/OverviewTab.tsx`
- **Used by:** App main view (`activeTab === "Overview"`)
- **Props:** None
- **Classes:**
  ```tsx
  <div className="flex h-full flex-col overflow-hidden bg-background">
  ```
- **Tokens used:** `background`, `surface`, `surface-secondary`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-safe-text`, `btn-primary-bg`, `btn-primary-text`, `storage-used`, `storage-free`
- **Notes:** Landing overview tab with disk breakdown banner, category stats grid, live scan feed preview, and trigger scan controls. Wrapped in `React.memo` with throttled stream buffering.

### UnusedFileCategoryCard

- **Path:** `apps/desktop/src/renderer/src/components/UnusedFileCategoryCard.tsx`
- **Used by:** Unused Files tab
- **Props:**
  - `group: UnusedFileGroup`
  - `selectedFileIds: Set<number>`
  - `onToggleFile: (fileId: number) => void`
  - `onToggleGroup: (fileIds: number[], select: boolean) => void`
  - `defaultExpanded?: boolean`
- **Classes:**
  ```tsx
  <div className="overflow-hidden rounded-md border border-border bg-surface [content-visibility:auto] transition-colors duration-150 hover:border-border/80">
  ```
- **Tokens used:** `surface`, `surface-secondary`, `background`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-unsure-bg`, `tag-unsure-text`, `btn-primary-bg`, `btn-primary-text`, `text-row`, `text-meta`, `radius-md`, `radius-sm`, `radius-xs`
- **Notes:** Collapsible category group card for unused files displaying category statistics, individual file items, last access/modified dates, fallback indicators for noatime mounts, and category-level selection toggles. Wrapped in `React.memo`.

### UnusedFilesTab

- **Path:** `apps/desktop/src/renderer/src/components/UnusedFilesTab.tsx`
- **Used by:** App main view (`activeTab === "Unused Files"`)
- **Props:** None
- **Classes:**
  ```tsx
  <div className="flex h-full flex-col overflow-hidden bg-background">
  ```
- **Tokens used:** `background`, `surface`, `surface-secondary`, `border`, `text-primary`, `text-secondary`, `text-tertiary`, `tag-danger-bg`, `tag-danger-text`, `btn-primary-bg`, `btn-primary-text`, `storage-free`, `text-title`, `text-row`, `text-meta`, `radius-md`, `radius-xs`
- **Notes:** Complete interface for browsing and filtering unused files by staleness threshold slider (30–730 days) and category chips. Supports multi-selection, select/deselect all, and batch safe removal through `ConfirmationModal`. Wrapped in `React.memo`.

