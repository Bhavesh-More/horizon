# UI Rules — Horizon

Implementation rules for turning `ui-tokens.md` into actual screens. `ui-tokens.md` says _what value_ to use for a color/space/radius; this file says _how components are structured, sized, and laid out_ around those values. Read both before building a new tab or component — a screen that uses the right tokens but the wrong layout rules still won't look or feel like this app.

---

## 1. Fonts

- **Body/UI font: Inter**, loaded as a **self-hosted/bundled font file** — not a Google Fonts `<link>` or `@import` at runtime. This is a desktop Electron app with no guaranteed network access on launch (and no network access at all is a stated goal, per `project_overview.md` §10's privacy story); a font that depends on a runtime fetch to Google's CDN is a real "text renders in Times New Roman for a second, or forever if offline" bug, not a hypothetical one.
  - Install via `yarn add @fontsource/inter` (self-hosted, ships the actual font files into the bundle) rather than a CDN `<link>`.
  - Import once, in `apps/desktop/src/renderer/main.tsx`:
    ```ts
    import "@fontsource/inter/400.css";
    import "@fontsource/inter/500.css";
    import "@fontsource/inter/600.css";
    ```
    Only pull the weights the type scale actually uses (400, 500, 600 — see `ui-tokens.md`'s type scale) — don't bulk-import every weight Inter ships.
- **Title font: the `--font-rounded` stack** (`"SF Pro Rounded", "Nunito Sans", ui-rounded, system-ui, sans-serif`) is a **system-font-first stack, not a webfont**. `ui-rounded` is a real CSS generic keyword (Safari/WebKit resolves it to SF Pro Rounded on macOS); everywhere else it falls through to `Nunito Sans` if bundled, or plain `system-ui` if not. Do not bundle a separate rounded webfont just to guarantee pixel-identical rendering across OSes — the whole point of `text-title` being used sparingly (one per screen, per `ui-tokens.md`) is that a little cross-platform variance there is an acceptable, low-stakes tradeoff for not adding another bundled font.
- **No other font families anywhere.** Two font stacks total (`--font-sans`, `--font-rounded`) is the entire typography system. A component that needs to "feel different" reaches for the existing type scale (size/weight/color), not a third font.
- **No runtime `@import url(...)` for fonts in CSS, ever** — this is the CSS equivalent of the Google Fonts `<link>` problem above and has the same offline-launch failure mode.

---

## 2. Window & app shell layout

Reference values below come directly from the delivered design's actual layout constants (not estimated):

| Property                         | Value                            | Notes                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App window width                 | `980px`, fixed                   | The window does not resize horizontally — width is locked, matching the reference design's `.windowResizability(.contentSize)` behavior. Electron equivalent: set `resizable: false` on the horizontal axis, or fix `width`/`minWidth`/`maxWidth` to the same value in `BrowserWindow` options. |
| App window default height        | `700px`                          | Initial height on first launch.                                                                                                                                                                                                                                                                 |
| App window minimum height        | `600px`                          | The window may grow taller (content-driven) but never shorter than this — below it, the sidebar/content layout breaks.                                                                                                                                                                          |
| Sidebar width                    | `240px`, fixed                   | Does not resize, collapse, or reflow at any window height. There is no "narrow sidebar with icons only" mode — Horizon's window doesn't get narrow enough to need one, since the whole window width is fixed.                                                                                   |
| Sidebar horizontal inset         | `8px`                            | Padding between the sidebar's edge and its nav items.                                                                                                                                                                                                                                           |
| Sidebar nav row inner padding    | `8px`                            | Padding inside each nav row (icon + label).                                                                                                                                                                                                                                                     |
| Sidebar nav row selection radius | `8px` (`--radius-md`)            | The rounded highlight behind the active tab.                                                                                                                                                                                                                                                    |
| Sidebar top content inset        | `42px`                           | Space reserved above the first nav item to clear the native window traffic-light controls (macOS) — the sidebar content starts below this, not flush with the window top.                                                                                                                       |
| Content/sidebar divider          | `1px` hairline, `--color-border` | A literal 1px-wide element, not a CSS `border` shorthand with a larger implied hit area — keep it visually hairline-thin.                                                                                                                                                                       |

**Why fixed-width, not responsive:** this app is not a responsive web layout — it is a fixed-chrome desktop utility, the same category as the reference design. A fixed window width removes an entire class of "does this look right at every size" work that a 2–4 week build doesn't have time for, and it matches the calm, non-adaptive feel the rest of the design language already commits to (dense fixed type scale, restrained color use). Do not add responsive breakpoints, fluid grid columns, or `@container` queries to the app shell — there is exactly one layout, at exactly one width.

---

## 3. Sidebar & navigation layout

- The sidebar is a **single vertical list of the 9 tabs**, in the fixed order defined in `project_overview.md` §3 — Overview, Duplicates, Unused Files, Large Files, Forecast, Assistant, Archive, Activity, Settings. Do not reorder, group into collapsible sections, or add a scrollable overflow — 9 items fit in `700px` of default height without scrolling; if a future tab is ever added, that's the trigger to revisit this rule, not to work around it silently.
- Each nav row: icon (from `lucide-react`) + label (`--text-row`), full sidebar width minus the horizontal inset, `--radius-md` selection highlight on the active row using `--color-surface-secondary` as the fill.
- The global disk-summary chip (used/free/reclaimable, per `project_overview.md` §4) lives in the **top bar**, not the sidebar — it must be visible regardless of which tab is active, and the sidebar's job is navigation only, not status display.
- Keyboard shortcuts `⌘1`–`⌘9` map to sidebar position 1–9 in order. Register these once, centrally (a single keybinding map), not per-tab — a new tab added later should only require one line in that central map, not a new local keydown listener.

---

## 4. Content area layout

- **Single-column content per tab**, no nested split panes within a tab (the sidebar/content split is the _only_ split view in the whole app). A tab that seems to need a master-detail layout (e.g. "duplicate group list + expanded group detail") uses **in-place expansion or a modal**, not a second resizable pane — this matches the flat, non-nested navigation model in `project_overview.md` §4.
- Every tab's content area follows the same vertical structure, top to bottom:
  1. **Top bar** (persistent across tabs): tab-appropriate primary action (Scan / Filter / Search) + the global disk-summary chip.
  2. **Tab-specific header region** (optional): filters, staleness slider, category chips — whatever the tab needs, using `--spacing-8`/`--spacing-10` vertical rhythm between header and list.
  3. **Main list/content region**: uses `ScanResultRow`/card components from `packages/ui`, per the component-value reference in `ui-tokens.md`.
- **Cards and rows are full-bleed to the content column's padding, never full-bleed to the window edge.** The content column itself carries the outer padding (`--spacing-11` / 24px is the reference outer margin); individual rows/cards don't each manage their own edge spacing.
- **List rows are the unit of repetition, not cards-in-a-grid**, for anything file-based (Duplicates, Unused Files, Large Files, Activity). A card-grid layout is visually heavier than this design's information-dense, scannable-list approach — reserve card treatment for the Overview tab's summary tiles and the Assistant tab's recommendation cards, where each item is a distinct, self-contained unit rather than one row among many similar ones.

---

## 5. Spacing & rhythm rules

- Use the `--spacing-*` scale from `ui-tokens.md` exclusively — no arbitrary Tailwind spacing values (`p-[13px]`, `gap-[7px]`) anywhere in the renderer.
- **Vertical rhythm between major regions** (top bar → header → list) uses `--spacing-8` (8px) minimum, `--spacing-10` (20px) for a section that should read as visually separate (e.g. between the Overview tab's disk-summary section and its category breakdown).
- **Within a list row**, internal padding is `--spacing-6` (12px) vertical, `--spacing-8` (16px) horizontal — matching the reference design's actual most-common padding value (16px was the single most frequent padding constant found across its views).
- **Between a label and its associated control** (e.g. a filter's label and its dropdown), use `--spacing-4` (8px) — the reference design's second-most-common spacing value, reserved for tight, clearly-paired elements.
- Never stack more than two spacing tokens to approximate a third value (`--spacing-4` + `--spacing-4` instead of just using `--spacing-8` directly, or worse, `p-2 pt-2` instead of one `p-4`). If a layout needs a gap the scale doesn't have, that's a signal to add a token to `ui-tokens.md`, not to compose existing ones into an implicit new one.

---

## 6. Modals, popovers, and overlays

- **Confirmation modals** (trashing, archiving) are centered, fixed-size, non-resizable, and block interaction with the rest of the window (a scrim over the content area, not the sidebar per Purge's own convention of keeping navigation available) — but for Horizon, given the fixed single-window layout, a full-window scrim including the sidebar is acceptable and simpler; don't over-engineer a partial scrim for a case with no real user benefit.
- Modal width is content-driven but capped — never wider than roughly 70% of the fixed `980px` window width, so it always reads as an overlay, not a second screen.
- **The tray popover ("Horizon Mini")** is a separate, small, fixed-size window (Electron `BrowserWindow` with `frame: false`, positioned relative to the tray icon) — it is not the main window resized down, and it does not share layout code with the main app shell beyond shared tokens and shared `packages/ui` primitives.
- Tooltips and dropdowns (Radix primitives) use `--color-surface-overlay` and `--radius-md`, per the component-value reference table in `ui-tokens.md` — never a plain browser-default tooltip.

---

## 7. Icons

- **UI icons:** `lucide-react`, stroke-based, rendered at a consistent `16px` or `20px` size depending on context (sidebar nav icons: `20px`; inline row icons: `16px`) — never mix icon sizes within the same list.
- **Brand/app icons** (recognized apps in scan results, per `project_overview.md` §6): `simple-icons`, rendered at the same size class as the row's other icon content so recognized and unrecognized items sit at a consistent visual weight.
- Icons inherit color from `currentColor` wherever possible (i.e., they pick up `--color-text-primary`/`--color-text-secondary` automatically) rather than being hardcoded to a fixed hex — this is what makes icons correctly flip color between light and dark mode without special-casing.

---

## 8. What this app deliberately does not do

- No responsive breakpoints or fluid layout — one fixed window width, always (§2).
- No card-grid layouts for file lists — rows, not tiles (§4).
- No third font family beyond `--font-sans` and `--font-rounded` (§1).
- No runtime webfont loading over the network (§1).
- No drop shadows as the primary surface-separation technique — surfaces separate via `--color-border` and background-tone steps (`background` → `surface` → `surface-secondary` → `surface-overlay`), consistent with `ui-tokens.md`'s color usage rules. A component reaching for `shadow-lg` to make a card "pop" is working against the rest of the design language, not with it.
- No fifth semantic color introduced ad hoc for emphasis — see `ui-tokens.md`'s note on the four safety-tag pairs being the entire color vocabulary.
