# UI Tokens — Horizon

Design tokens for Horizon. All colors, typography, spacing, and component values below are extracted from the delivered design reference (`purge-app`'s actual `AppColors.swift`/`AppStyle.swift` values, adapted to a light/dark CSS token system) — not approximated. **Use these exact values throughout the codebase — never hardcode a color, never use a raw Tailwind color class (`bg-gray-100`, `text-slate-600`, etc.) in a component.** If a component needs a value that isn't defined here, add the token here first, then use it — don't one-off it inline.

---

## How to Use

This project uses **Tailwind CSS v4**. All design tokens are defined using the `@theme` directive in `apps/desktop/src/renderer/globals.css`. No `tailwind.config.ts` is needed for colors or tokens.

Tailwind v4 automatically generates utility classes from `@theme` variables:

- `--color-background` → `bg-background`, `text-background`, `border-background`
- `--color-surface` → `bg-surface`, `text-surface`, `border-surface`
- `--color-accent` → `bg-accent`, `text-accent`, `border-accent`
- `--radius-md` → `rounded-md`
- `--text-title` → `text-title` (with its paired `--font-weight`/`--leading` companions applied via the same utility)

Dark mode is handled by **redefining the same variable names** under a `.dark` class scope, not by a separate token set — this is what makes `dark:` variants unnecessary in most components; the token value itself already changes. Toggling the `.dark` class on `<html>` (driven by the Settings → Appearance preference, including "System") is the only theme-switching mechanism needed.

---

## globals.css — complete token definition

```css
@import "tailwindcss";

@theme {
  /* ---------- Fonts ---------- */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-rounded: "SF Pro Rounded", "Nunito Sans", ui-rounded, system-ui, sans-serif;

  /* ---------- Page and surface backgrounds (light) ---------- */
  --color-background: #f5f5f6;
  --color-surface: #ffffff;
  --color-surface-secondary: #ecedef;
  --color-surface-overlay: #ffffff;

  /* ---------- Borders (light) ---------- */
  --color-border: #e2e3e6;

  /* ---------- Text (light) ---------- */
  --color-text-primary: #1a1b1f;
  --color-text-secondary: #6b6d76;
  --color-text-tertiary: #9a9ca5;

  /* ---------- Disk usage bar (light) ---------- */
  --color-storage-used: #8a8c96;
  --color-storage-free: #d6d7da;

  /* ---------- Buttons (light) ---------- */
  --color-btn-primary-bg: #1a1b1f;
  --color-btn-primary-text: #ffffff;
  --color-btn-secondary-border: #d6d7da;

  /* ---------- Safety-tag semantic colors (light) — the ONLY place color carries meaning ---------- */
  --color-tag-safe-text: #1a7a43;
  --color-tag-safe-bg: #e5f5eb;
  --color-tag-check-text: #9c6300;
  --color-tag-check-bg: #fbeed8;
  --color-tag-danger-text: #c5392e;
  --color-tag-danger-bg: #fbe6e3;
  --color-tag-unsure-text: #5c5e66;
  --color-tag-unsure-bg: #ededef;

  /* ---------- Type scale ---------- */
  --text-title: 20px;
  --text-title--font-weight: 600;   /* semibold */
  --text-title--line-height: 1.3;
  --text-row: 13px;
  --text-row--font-weight: 500;     /* medium */
  --text-row--line-height: 1.4;
  --text-meta: 11px;
  --text-meta--font-weight: 400;
  --text-meta--line-height: 1.4;
  --text-meta-emphasis: 11px;
  --text-meta-emphasis--font-weight: 500;
  --text-meta-emphasis--line-height: 1.4;

  /* ---------- Radius ---------- */
  --radius-xs: 4px;   /* small controls, checkboxes */
  --radius-sm: 6px;   /* buttons, list rows */
  --radius-md: 8px;   /* cards, panels */
  --radius-lg: 10px;  /* larger cards, modals */
  --radius-xl: 14px;  /* hero elements — used sparingly, one place per screen at most */

  /* ---------- Spacing scale (extracted, not a generic 4/8/16 guess) ---------- */
  --spacing-0: 0px;
  --spacing-1: 2px;
  --spacing-2: 4px;
  --spacing-3: 6px;
  --spacing-4: 8px;
  --spacing-5: 10px;
  --spacing-6: 12px;
  --spacing-7: 14px;
  --spacing-8: 16px;
  --spacing-9: 18px;
  --spacing-10: 20px;
  --spacing-11: 24px;
}

/* ---------- Dark mode overrides — same variable names, new values ---------- */
.dark {
  --color-background: #15161a;
  --color-surface: #1c1d22;
  --color-surface-secondary: #23242b;
  --color-surface-overlay: #2a2b33;

  --color-border: #2e2f37;

  --color-text-primary: #f2f2f3;
  --color-text-secondary: #9a9ca5;
  --color-text-tertiary: #6b6d76;

  --color-storage-used: #cacdd6;
  --color-storage-free: #4c4e5a;

  --color-btn-primary-bg: #f2f2f3;
  --color-btn-primary-text: #15161a;
  --color-btn-secondary-border: #3a3b44;

  --color-tag-safe-text: #5fd98a;
  --color-tag-safe-bg: #1b2e22;
  --color-tag-check-text: #f2b84b;
  --color-tag-check-bg: #332910;
  --color-tag-danger-text: #f2685c;
  --color-tag-danger-bg: #321b19;
  --color-tag-unsure-text: #a7a9b2;
  --color-tag-unsure-bg: #26272d;
}
```

---

## Color usage rules

| Token | Use for | Never use for |
|---|---|---|
| `background` | The outermost app/tab background | Cards, rows, or anything that should sit visually above the page |
| `surface` | Cards, modals, the sidebar, row backgrounds at rest | The page background itself |
| `surface-secondary` | The next tone step up from `surface` — hover states, nested panels within a card, the disabled/inactive fill for controls | A primary card background |
| `surface-overlay` | Popovers, dropdowns, the tray ("Horizon Mini") popover, tooltips | Anything that isn't floating above other content |
| `border` | All dividers, card outlines, input borders | Never use it as a background fill |
| `text-primary` | Titles, row labels, primary body text | Disabled text, placeholder text |
| `text-secondary` | Metadata, descriptions, supporting copy | Primary headings |
| `text-tertiary` | Timestamps, placeholder text, the least-important line in a row | Anything the user needs to read to understand the screen |
| `storage-used` / `storage-free` | The disk-usage bar only | Any other progress/percentage indicator — if a second one is ever needed, add a distinct token rather than reusing this one out of context |
| `tag-safe-*` / `tag-check-*` / `tag-danger-*` / `tag-unsure-*` | **Exclusively** the safety-tier pill (`SafetyTagPill` in `packages/ui`) and, where relevant, the Archive bundle status badge | Anything decorative. These four pairs are the *entire* color vocabulary this app uses to signal meaning — introducing a fifth ad hoc color to "highlight" something elsewhere breaks the two-tier restraint the whole visual language is built on (see `project_overview.md` §2) |

**The danger tag pair (`tag-danger-*`) exists in the token set but is not used by the current safety model** — `project_overview.md` §6 specifies two tiers only (Safe to Clean / Check First), deliberately with no fabricated "unsafe/dangerous" tier, matching Purge's restraint. It's kept as a token because the Archive tab's bundle-status badges and any future error/failure state (a failed compression, a broken restore) legitimately need a "this went wrong" color, and that state should reuse this token rather than inventing a new one. Do not repurpose it as a third safety tier for scan results.

---

## Typography usage rules

| Token | Use for |
|---|---|
| `text-title` (with `--font-rounded`) | Tab page titles only — e.g. "Duplicates", "Forecast". One per screen. |
| `text-row` | List row primary text — file names, recommendation card headlines, duplicate group labels |
| `text-meta` | Secondary row information — file size, path, date |
| `text-meta-emphasis` | The same tier as `text-meta` but calling attention to one value — e.g. the reclaimable-bytes figure within an otherwise `text-meta` line |

This is a deliberately small, dense type scale (20/13/11px) — the restraint is the design. Do not introduce a larger display size for marketing-style moments (empty states, onboarding) without adding it here first and confirming it fits the rest of the scale; the instinct to make onboarding screens "feel bigger" is exactly how a second, uncoordinated type scale creeps in.

`--font-sans` (Inter) is the default body font everywhere. `--font-rounded` is reserved for `text-title` only — it should not spread to buttons, badges, or body copy.

---

## Spacing & radius usage rules

- The spacing scale above (`--spacing-0` through `--spacing-11`) is the full set — it was extracted from the reference design's actual padding/stack-spacing values, not generated from a generic 4px/8px multiplier. Don't add an arbitrary spacing value (e.g. `p-[13px]`) when one of these already covers the case; if none genuinely fits, add a new token here rather than reaching for an arbitrary value in a component.
- Radius follows the reference design's restraint: small controls and rows use `--radius-xs`/`--radius-sm`, cards use `--radius-md`/`--radius-lg`, and `--radius-xl` is reserved for at most one hero element per screen (e.g. the Overview tab's forecast headline card). Avoid Tailwind's default `rounded-2xl`/`rounded-3xl` scale entirely — nothing in this design uses radii that large, and using them will visually read as generic SaaS rather than as this app.

---

## Component value reference

| Component | Background | Border | Radius | Text |
|---|---|---|---|---|
| Primary button | `btn-primary-bg` | none | `radius-sm` | `btn-primary-text` |
| Secondary button | `surface` | `btn-secondary-border` | `radius-sm` | `text-primary` |
| Card / panel | `surface` | `border` | `radius-md` | `text-primary` (title), `text-secondary` (body) |
| List row (at rest) | `surface` | `border` (bottom only, typically) | `radius-xs` | `text-row` / `text-meta` |
| List row (hover) | `surface-secondary` | same as rest | same as rest | same as rest |
| Modal / confirmation dialog | `surface-overlay` | `border` | `radius-lg` | `text-primary` |
| Tray popover ("Horizon Mini") | `surface-overlay` | `border` | `radius-lg` | `text-primary` / `text-secondary` |
| Safety tag pill | `tag-{tier}-bg` | none | `radius-xs` | `tag-{tier}-text` |
| Disk usage bar (track / fill) | `storage-free` (track) | none | `radius-xs` | `storage-used` (fill) |

Every row above maps directly to a component in `packages/ui` (`Button`, `Card`, `ScanResultRow`, `Modal`, `SafetyTagPill`, `DiskUsageBar`) per `architecture.md` §2/§3 — a new component reusing one of these patterns should compose the existing primitive, not rebuild the token mapping locally.
