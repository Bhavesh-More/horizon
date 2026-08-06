# Project Overview — Horizon
### AI-Powered Intelligent Storage Optimizer
*(Working title: **Horizon** — evokes the forecasting angle that differentiates this from every other "storage cleaner." Swap freely for your preferred name; the doc uses it consistently below for readability.)*

---

## 1. About the project

Horizon is a local-first desktop application — a single Electron/TypeScript codebase (React renderer + a Node.js main process handling all filesystem, database, and AI work), packaged as a real installable `.dmg`/`.exe`/AppImage — that scans a user's disk, understands how their storage is actually being used, and combines two kinds of intelligence most "cleaner" apps don't have:

- **Genuine forecasting** — a real time-series model, built on historical disk-usage snapshots, that tells the user *when* they'll run out of space and *why*, per category, rather than just reporting today's snapshot.
- **Genuine AI reasoning** — an LLM (run locally via Ollama by default, or a cloud provider the user connects with their own API key) that turns raw scan results into specific, prioritized, plain-English cleanup and archiving recommendations, and can answer free-form questions about the user's own storage.

Visually and philosophically, Horizon borrows deliberately from `purge-app` (jithin-sabu): a calm, neutral, information-dense UI; a two-tier safety model instead of theatrical risk scores; trash-only, fully reversible deletion; and streaming scan results instead of a blocking progress bar. What Horizon adds on top is everything Purge doesn't attempt: duplicate detection (exact and near-duplicate), historical tracking, predictive modeling, dynamic AI-generated reasoning, and archiving as a first-class action alongside deletion.

---

## 2. The problem it solves

Modern laptops — especially budget and mid-range machines with 128–512 GB SSDs, which describes most student and early-career hardware — fill up quietly and unpredictably. Three separate, compounding problems make this worse than it needs to be:

1. **People can't see it coming.** Storage warnings arrive at 95% full, when the only options left are panic-deleting things or stalling a project mid-work. Nobody gets a warning at 60% telling them they're on a trajectory to be full in three weeks.
2. **People don't trust cleaner apps.** The "PC/Mac cleaner" category has a well-earned bad reputation — bundled adware, over-aggressive deletion, vague "junk files" claims with no explanation. This makes genuinely useful cleanup tools something people are afraid to run, not something they reach for proactively.
3. **The tedious part is invisible manual work.** Finding duplicate photos across three export folders, noticing a dozen years-old `node_modules` folders nobody will ever rebuild against, or realizing your Downloads folder is 40% installers you ran once — none of this is hard to *understand* once pointed out, but it's genuinely tedious to *find* by hand, and most people never do it until they're forced to.

Horizon addresses all three at once: it predicts the problem before it becomes urgent (solves #1), it earns trust through a transparent, reversible, explained-in-plain-English safety model (solves #2), and it does the tedious finding-and-grouping work automatically, with AI reasoning attached to *why* something is worth acting on (solves #3).

---

## 3. Tabs

Horizon uses a persistent left sidebar (matching Purge's navigation shape) with the following primary sections:

| # | Tab | Purpose |
|---|---|---|
| 1 | **Overview** | Landing screen. Disk summary, forecast headline, category breakdown, one-click "Clean Safe Items," recent activity snippet. |
| 2 | **Duplicates** | Exact and near-duplicate file groups, browsable, with keep/remove selection per group. |
| 3 | **Unused Files** | Files untouched beyond a configurable staleness threshold, filterable by category and location. |
| 4 | **Large Files** | Purge-style large-file browser: size/date/category filters, Quick Look preview, reveal-in-Finder/Explorer. |
| 5 | **Forecast** | Dedicated deep-dive: historical usage trend chart, projected "full by" date per category, interactive what-if simulator. |
| 6 | **Assistant** | AI-generated recommendation cards (auto-produced per scan) plus a free-form chat interface grounded in the user's own scan and history data. |
| 7 | **Archive** | List of archived bundles (compressed, moved out of the active filesystem), with restore and permanent-delete actions. |
| 8 | **Activity** | Chronological audit log of every scan, clean, archive, and restore action — the accountability layer. |
| 9 | **Settings** | Appearance, scan scope, staleness thresholds, scheduling, notifications, and the AI Provider / API key panel (see §10). |

A secondary, lightweight entry point mirrors Purge's menu-bar companion:

| Surface | Purpose |
|---|---|
| **Tray / menu-bar popover ("Horizon Mini")** | Always-available quick view: reclaimable space, forecast headline ("~18 days to full"), a "Clean Safe Items Now" button, and a link that opens the full app to a specific tab. |

---

## 4. Navigation

- **Structure:** flat, single-level sidebar navigation — no nested sub-pages behind the 9 tabs above. Drill-ins (e.g., expanding a duplicate group, opening a recommendation's supporting detail) happen as in-place expansion or a modal/side-panel, never as a new navigable route. This keeps the mental model as simple as Purge's, even though Horizon has more surface area than Purge does.
- **Persistent context:** the sidebar and a top bar (showing the current tab's primary action — Scan, Filter, Search — plus global disk-summary chip) are visible on every tab; only the central content area changes.
- **Keyboard shortcuts:** `⌘1`–`⌘9` (or `Ctrl+1`–`9` on Windows/Linux) jump directly between the nine tabs, directly extending the `⌘1`–`⌘3` pattern Purge already establishes. `⌘K` opens a command palette for power users (jump to tab, trigger a scan, search files by name across all indexed results) — optional/stretch, not required for MVP.
- **Cross-tab deep links:** several flows (see §5) intentionally jump the user from one tab to another with a pre-applied filter already active — e.g., accepting a Forecast-tab "what-if" suggestion lands the user on Duplicates/Unused/Large Files with exactly the relevant items pre-selected, rather than making them re-find what was already identified.
- **Onboarding is not a tab.** First run is a full-screen modal wizard that sits *above* navigation and blocks it until setup (permissions, scan scope, AI provider) is complete — mirroring Purge's `FirstRunGate` pattern of distinguishing a fresh install from a later update.
- **Global disk-summary chip:** a persistent, non-clickable-away indicator (used / free / reclaimable) stays visible in the top bar regardless of tab, so the headline number is never more than a glance away — this is the single piece of information Horizon assumes the user checks most often.

---

## 5. Core user flows

### 5.1 First-run onboarding
`Launch app` → `Welcome screen (what Horizon does, in 3 lines)` → `Permission request` (Full Disk Access on macOS / folder access grants elsewhere, explained plainly: *why* it's needed, not just an OS dialog with no context) → `AI Provider setup` (default: Local Ollama, pre-selected, no key required; optional: "Use my own API key" → BYOK flow, see §10) → `Scan scope selection` (default checked: Documents, Desktop, Downloads, Pictures, Movies, Music; optional: add custom folders) → `Initial scan runs`, streaming into a lightweight progress view → `Results summary` ("Found 4.2 GB reclaimable across 1,204 files") → lands on **Overview**.

### 5.2 Primary scan & review flow (Overview)
**Overview** shows the disk-summary bar, the forecast headline pulled from the latest model run, a category-breakdown treemap, and a "Run Scan" action. Triggering a scan streams results in the background (WebSocket/SSE) while categorized counts tick up live on Overview; when complete, category cards ("12 duplicate groups · 2.1 GB", "38 unused files · 6 months+", "6 files over 500 MB") each link directly into their respective tab, already filtered to that scan's results.

### 5.3 Duplicates flow
**Duplicates** lists groups (exact-hash groups first, then near-duplicate/perceptual/embedding groups, visually distinguished) → user expands a group → sees each member's path, size, dates, and — for images — thumbnails → a default "keep newest, flag rest" selection is pre-applied but fully editable → `Move Selected to Trash` → confirmation modal states exactly what will be trashed and how to undo it → on confirm, files move to OS trash (never permanent delete), the group either shrinks or clears, and an entry is written to **Activity**.

### 5.4 Unused Files flow
**Unused Files** → staleness threshold slider (e.g., "not opened in 6+ months") → results grouped by folder/category → multi-select → two available actions: `Move to Trash` (same as above) or `Archive` (see 5.6). This is the primary place the forecast's "what-if" suggestions land users when they accept a recommendation.

### 5.5 Large Files flow
Directly modeled on Purge's Large Files tab: size filter (5 MB–1 GB+), last-used filter, category chips (video/audio/image/doc/archive/other), sort by size/date/name, Quick Look preview, Reveal in Finder/Explorer, multi-select → Trash or Archive.

### 5.6 Archiving flow
Triggered from Unused Files, Large Files, or a Forecast recommendation → if no archive location is set yet, a one-time picker asks where archives should live (defaults to a `Horizon Archives` folder under the user's home directory, external drive optional) → files are compressed into a single dated bundle (`.zip`/`.tar.zst`) → **only after the archive write is confirmed successful** are the originals moved to trash → a new entry appears in **Archive** with contents, size, and date. This ordering (archive-then-trash, never trash-then-archive) is a deliberate safety guarantee: a failed compression never results in lost data.

### 5.7 Restore-from-archive flow
**Archive** → select a bundle → `View Contents` (list without extracting) or `Restore` → restore extracts back to the original path by default, or to a user-chosen location if the original path no longer exists → an Activity entry records the restore.

### 5.8 Forecast flow
**Forecast** → historical usage line (actual) plus projected line (model output) → per-category trend breakdown (which categories are growing fastest) → a "what-if" simulator: toggling a category off the projection shows how much runway that would buy → `Apply this plan` jumps the user to the relevant tab(s) with the implicated items pre-selected, connecting the abstract prediction directly to a concrete action.

### 5.9 AI Assistant flow
**Assistant** → auto-generated recommendation cards refresh after each scan, each with a specific claim ("This 2.3 GB `node_modules` folder hasn't been touched in 14 months and its project has no matching lockfile change since — safe to archive") and a one-click `Review` (jumps to the relevant tab, pre-filtered) or `Dismiss` action → below the cards, a chat input lets the user ask free-form questions ("what's eating my Downloads folder?", "how much would I free up if I cleared all caches?"), answered by the LLM grounded in the user's actual indexed scan/history data via retrieval into the prompt context, never invented.

### 5.10 Activity / audit flow
**Activity** → reverse-chronological log of every scan, clean, archive, and restore, each showing bytes affected and a timestamp → recently trashed items show an `Undo` affordance pointing back to the OS trash for as long as the OS hasn't emptied it.

### 5.11 Settings flow
**Settings** is sectioned internally (not separate top-level tabs, to keep the sidebar at 9 items): Appearance, Scan Scope & Exclusions, Staleness Thresholds, Scheduling (auto-scan frequency), Notifications, and **AI Provider & API Key** (detailed in §10).

### 5.12 Tray quick-action flow
Click tray icon → **Horizon Mini** popover → glance at reclaimable space and forecast headline → `Clean Safe Files Now` triggers the same safe-cleanup action as Overview, no window needed → `Open Horizon` brings the full window forward to Overview.

---

## 6. All specific functionalities

**Scanning & indexing**
- Async, cancellable, streaming filesystem scan across a configurable scope (default: common user folders; custom folders addable/removable).
- Per-file metadata capture: size, extension/category, created/modified/accessed timestamps.
- Incremental re-scan (only re-index changed paths) after the first full scan, to keep repeat scans fast.

**Duplicate detection**
- Exact duplicates via chunked SHA-256 hashing, above a configurable minimum file size (avoids wasting time hashing thousands of tiny files).
- Near-duplicate images via perceptual hashing (catches re-saved/re-compressed/resized copies that exact hashing misses).
- Near-duplicate documents/text via embedding similarity.
- Per-group "recommended keep" heuristic (newest, or largest/highest-resolution for images), always user-overridable.

**Unused file detection**
- Real last-*accessed* time where the OS reliably provides it, with an explicit, visible fallback to last-modified where it doesn't (documented per-OS caveat, not silently substituted).
- Configurable staleness thresholds, independently settable for different scan categories.

**Large file management**
- Size/date/category filtering, sorting, Quick Look-style preview, reveal-in-file-manager.

**Forecasting**
- Daily background usage snapshots (total/used/free + per-category breakdown) written to local history.
- A bootstrap history built from existing file creation-date distribution on first run, so the trend line has something meaningful to show before real day-over-day data accumulates.
- An explainable time-series model (trend/exponential smoothing) producing a projected "full by" date and per-category growth rates.
- An interactive what-if simulator that recomputes the projection against a hypothetical cleanup.

**AI recommendations & assistant**
- Structured, schema-validated LLM output (with a retry/repair pass on malformed responses) turned into prioritized recommendation cards, each tied to specific real files/groups — never generic advice.
- Free-form chat grounded in the user's own indexed data, not open-ended web knowledge.
- Provider-agnostic: local Ollama by default, or a cloud provider via the user's own key (§10).

**Archiving**
- Compress-then-verify-then-remove-original ordering, so a failed archive never causes data loss.
- Archive browsing, content preview without extraction, restore-to-original-or-chosen-location.

**Safety & deletion**
- Trash-only deletion everywhere (`send2trash` or platform equivalent) — no code path in the app performs a permanent delete on user files.
- Explicit confirmation before any batch action, listing exactly what will be affected.
- Two-tier safety labeling on recognized system/cache items (Safe to Clean / Check First), matching Purge's restraint — no fabricated "risk score."

**History & undo**
- Full audit log of every action taken by the app.
- Undo affordance for recently trashed items (pointing to OS trash) while it's still recoverable there.

**Scheduling & notifications**
- Optional recurring background scans (daily/weekly), with a local notification summarizing new findings — not silent, not auto-cleaning without the user having opted into that explicitly.

**Settings & customization**
- Light/Dark/System appearance, using the exact Purge-derived palette.
- Scan scope inclusion/exclusion list.
- Per-category staleness thresholds.
- AI Provider & API Key management (§10).

---

## 7. Features in scope

Committed for the 2–4 week build (this is the union of the MVP and "strong differentiator" tiers from the roadmap doc, restated as a scope commitment rather than a wishlist):

- Full async, streaming filesystem scanner across a configurable scope.
- Exact duplicate detection (hash-based).
- Near-duplicate detection for images at minimum (perceptual hashing); document/embedding-based near-duplicates if time allows within the window.
- Unused-file detection with real access-time tracking (with documented OS fallback behavior).
- Large Files browser with filtering, preview, and reveal-in-file-manager.
- Real historical tracking (daily snapshots) and a genuine, explainable forecasting model with a visible trend chart and projected "full by" date.
- Dynamic, per-scan LLM-generated recommendations (not a static string table).
- A grounded chat assistant answering questions against the user's own scan/history data.
- Archiving as a distinct, first-class action from deletion, with compress-then-verify-then-remove-original safety ordering.
- Trash-only deletion with full confirmation and an audit log.
- BYOK AI provider support (local Ollama default + at least one cloud option) — see §10.
- The full Purge-derived visual theme, applied consistently across all 9 tabs plus the tray popover.

---

## 8. Features out of scope

Explicitly excluded from this build, to keep the 2–4 week scope realistic and the demo focused:

- **Mobile companion app.** Desktop-only for this track; a filesystem-scanning tool is inherently a desktop-class problem.
- **Multi-device sync / cloud account system.** Horizon is local-first by design; adding an account/sync layer would contradict the privacy story that's a core differentiator.
- **Cloud storage provider scanning** (Google Drive, Dropbox, OneDrive contents). Local disk only — a genuinely different scanning/API problem, not an extension of this one.
- **Team/multi-user features.** Single-user, single-machine tool.
- **Fully automatic, unattended deletion.** Every deletion or archive action requires explicit user confirmation; there is no "set it and forget it, trust the AI completely" mode, by design — this would directly undermine the trust story borrowed from Purge.
- **Billing/subscription infrastructure.** Not needed — BYOK means the user pays their own AI provider directly if they choose a paid one; there's no metering or billing surface for us to build.
- **Deep content-based semantic search** ("find me all files about topic X") beyond what's needed for near-duplicate detection. A genuinely different feature, not required by the track brief.
- **Windows/Linux platform-specific polish beyond functional parity.** Build and demo primarily against the OS the judging happens on; other platforms should work but aren't the polish priority.
- **Telemetry or usage analytics collection.** Consistent with the local-first/privacy positioning — nothing is collected about how the app is used.

---

## 9. Data architecture

Horizon has **no backend server at all, local or otherwise** — there's a single process (Electron's Node.js main process) doing all filesystem, database, and AI-provider work, talking to the renderer over in-process IPC and, optionally, to the user's chosen AI provider directly. There is nothing "ours" in the middle to design a multi-tenant schema for; everything below is a single local SQLite file.

**Storage location:** one SQLite database per install (e.g. `~/Library/Application Support/Horizon/horizon.db` on macOS, OS-equivalent elsewhere).

**Core tables:**

| Table | Purpose |
|---|---|
| `scan_runs` | One row per scan: scope, timing, status, totals. |
| `file_index` | One row per indexed file: path, size, category, timestamps, content hash (large files only), perceptual hash (images only). |
| `duplicate_groups` / `duplicate_group_members` | Grouped duplicate results, exact or near-duplicate, with per-member similarity score. |
| `usage_snapshots` | Daily disk-usage snapshot (total/used/free + per-category breakdown JSON) — the raw material forecasting is built on. |
| `forecasts` | Model output per run: projected full-by date, per-category trend, model type/confidence. |
| `recommendations` | LLM-generated recommendation cards: text, priority, related file IDs, accepted/dismissed status. |
| `cleanup_actions` | Audit log: what was trashed/archived/restored, when, how many bytes. |
| `archives` | Archive bundle metadata: location, contents summary, size, status (active/restored/deleted). |
| `settings` | Simple key-value app preferences (appearance, thresholds, scope, schedule). |
| `ai_provider_config` | Provider name, selected model, **not** the key itself — see §10 for why the key never touches this table. |

**Data flow:**
`Scanner` streams rows into `file_index` during a scan → a `Deduplication service` reads `file_index`, computes/compares hashes, writes `duplicate_groups` → a scheduled background job writes a daily row to `usage_snapshots` → a `Forecasting service` reads `usage_snapshots` history, fits the model, writes `forecasts` → a `Recommendation service` reads the latest scan + duplicate groups + forecast, builds a grounded prompt, calls the configured LLM, validates the structured response, writes `recommendations` → the renderer reads all of the above through typed Electron IPC calls into the main process → any cleanup/archive/restore action a user confirms writes to `cleanup_actions` (and `archives` if relevant).

**Privacy boundary:** everything above lives in that one local file, on the user's own disk, and is never transmitted anywhere. The only network traffic Horizon can ever generate is an optional AI provider call — and even then, only directly from the user's machine to the provider they chose, using their own credentials, with no relay through any infrastructure of ours (because there isn't any). This is the direct, structural payoff of the BYOK decision in §10: the data-architecture privacy story and the AI-provider trust story are the same story.

---

## 10. AI provider access: bring your own key (BYOK)

Rather than Horizon shipping with an embedded/shared API key that we provide and pay for, **the user connects their own AI provider credentials**, or uses the bundled local model with no key at all. This is a deliberate architectural decision, not a cost-cutting afterthought:

**How it works:**
- **Default: Local Ollama, zero configuration.** On first run, Horizon detects (or offers to help install) a local Ollama runtime with a small model (e.g. `llama3.2:3b`) pulled automatically. No key, no account, no network call ever required for the AI features to function.
- **Optional: bring your own cloud key.** In Settings → AI Provider, the user can instead connect a cloud provider (OpenAI, Anthropic, Groq, or a generic OpenAI-compatible endpoint via OpenRouter) by pasting their own API key — useful on a demo machine too weak to run a local model comfortably, or for users who want a stronger model than what fits on their hardware.
- **Key storage:** the key is encrypted using Electron's built-in `safeStorage` API, which wraps the operating system's own secure credential store (macOS Keychain / Windows DPAPI / Secret Service on Linux) with no extra dependency needed, **never** stored in plaintext in the SQLite database and never transmitted to any server of ours — because, again, there is no server of ours in this architecture at all. The `ai_provider_config` table only ever holds the provider name and model choice; the encrypted secret blob lives in its own small file outside the database, decrypted only in-memory when a call is made.
- **Validation:** on save, a single lightweight test call confirms the key works before it's relied on, with a clear inline error if it doesn't (invalid key, quota exceeded, network unreachable), rather than a recommendation panel silently failing later.
- **Graceful degradation:** if no provider is configured yet — Ollama not installed and no cloud key set — the recommendation and chat features show a clear setup prompt rather than a broken/empty panel; every non-AI feature (scanning, duplicates, unused files, large files, forecasting, archiving, trash-only deletion) works fully without any AI provider at all, since forecasting is a local statistical model, not an LLM call.

**Why this matters, specifically for this build:**
- **No shared secret to leak.** A hackathon codebase is usually public; an embedded API key in a public repo is a real, common failure mode. BYOK removes that risk entirely.
- **No cost liability that outlives the hackathon.** Nobody has to keep paying for judges' (or later users') API usage after submission.
- **No shared rate limit.** Multiple judges/testers running the app simultaneously never contend over one team-owned key.
- **A stronger, coherent privacy pitch.** "Your files never leave your machine, and neither does your AI usage — you're talking directly to whichever provider you chose, with your own key" is a single, consistent sentence that covers both the filesystem side and the AI side of the app.

---

## 11. Targeted users

1. **Students on storage-constrained laptops.** 128–512 GB SSDs, juggling coursework, project repos, downloaded PDFs/datasets, and media — the group most likely to hit "storage full" mid-semester with no warning. Primary persona for this build.
2. **Developers with accumulated project artifacts.** Dozens of old `node_modules`, `venv`, build caches, and Docker layers scattered across repos they haven't opened in months — directly extends Purge's Dev Mode audience into a "when will this become a problem again" framing.
3. **Content creators / photographers / videographers.** Large media libraries with duplicate exports, near-identical burst-mode photos, and multiple render-cache copies — the group near-duplicate detection specifically serves.
4. **Non-technical, cleanup-anxious users.** People who know their disk is full but are afraid to delete anything because they don't understand what's safe — the group the explanation-first, trash-only, two-tier safety UX exists for.
5. **Privacy-conscious users.** People who want AI-assisted help but are unwilling to send their file listings or usage patterns to a third-party cloud service by default — directly served by the local-first architecture and BYOK model.

---

## 12. Success criteria

**Functional correctness**
- Zero false permanent deletions across testing — every delete path verified to go through trash, with no exceptions.
- Duplicate detection produces no more than a small, disclosed false-positive rate on near-duplicate grouping (a wrong "these are duplicates" grouping is far worse than a missed one, since it risks user trust).
- Forecast projections are directionally correct and, critically, **explainable** — a judge asking "how did you calculate this" gets a real, specific answer (the model, the data it trained on, its assumptions), not a hand-wave.

**AI quality**
- Recommendation text is demonstrably specific to the actual scan it was generated from (references real file names/paths/sizes), not generic boilerplate that would look identical for any user's disk.
- The chat assistant answers are grounded in the user's own indexed data and visibly wrong/uncertain rather than confidently invented when data is insufficient.

**Safety and trust**
- Every destructive action is reversible at the moment it happens (trash) or made reversible by construction (archive-before-remove ordering).
- The two-tier safety labeling and plain-English explanations read the way Purge's do: calm, factual, no manufactured urgency.

**Track-brief alignment**
- All four stated requirements — analyze file usage, identify duplicate and unused files, predict future storage needs, provide intelligent cleanup/archiving recommendations — are each demonstrably and specifically satisfied, not implied or partially covered.
- The demo can clearly answer "why is this AI-powered and not just a file scanner with an LLM sticker on it" with the forecasting model and grounded recommendations as concrete evidence.

**Experience**
- A judge can install and run the packaged app on their own machine without installing Node, Python, or any dependency manually — everything needed is bundled into the installer.
- Time from opening the app to seeing a meaningful, specific result (first scan summary) is short enough to hold demo attention — first-run scan-to-insight should feel immediate, not like a wait.

**Differentiation**
- Side-by-side against Purge specifically: duplicate detection, forecasting, dynamic AI reasoning, and archiving are all present in Horizon and absent in Purge — the comparison should be immediate and undeniable to anyone who's seen both.
