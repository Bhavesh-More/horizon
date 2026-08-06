# From Purge → AI-Powered Intelligent Storage Optimizer
### Baseline analysis + gap analysis + roadmap to win the track

**Track brief:** "Build an AI assistant that analyzes file usage, identifies duplicate and unused files, and predicts future storage needs. Provide intelligent cleanup and archiving recommendations."
**Reference design:** `jithin-sabu/purge-app` (macOS, Swift/SwiftUI)
**Timeline:** 2–4 weeks.

---

## 0. The single most important finding

**Purge contains zero actual AI.** It scans for AI *model files* (Ollama/LM Studio weights), which is easy to mistake for "the app uses AI." It doesn't. Every explanation and safety label comes from a static, hand-curated 212-entry JSON lookup table (`explanations.json`) written by the developer ahead of time. There is no forecasting, no duplicate detection, no LLM call anywhere in the codebase.

That's not a criticism of Purge — for its actual goal (a trustworthy, deterministic system cleaner) a static allowlist is the *correct* engineering choice, not a shortcut. But it means that for a track literally called **"AI-Powered Intelligent Storage Optimizer,"** the reference app you're copying the look of would itself score close to zero on the "AI" criterion. Copy its trust model and its restraint, not its lack of AI. This is your biggest opportunity: genuine ML forecasting + genuine LLM reasoning, wrapped in Purge's calm, credible UI, immediately separates you from both (a) generic "delete big files" submissions and (b) submissions that bolt a chatbot onto a file browser without any real prediction underneath it.

---

## 1. What Purge gives you as a foundation

| Track requirement | Purge's coverage | Verdict |
|---|---|---|
| Analyze file usage | Scans caches, dev artifacts, large personal files; reads size + last-modified metadata | **Reuse the scanning patterns**, extend to full-disk indexing |
| Identify duplicate files | **Not present at all** | **Build from scratch** — biggest greenfield feature |
| Identify unused files | Staleness filters (1 month–2 years) on dev projects and large files | **Reuse the concept**, needs real "last accessed" tracking, not just "last modified" |
| Predict future storage needs | **Not present at all** — no historical tracking, no forecasting | **Build from scratch** — this is the track's headline requirement and nobody gets it for free |
| Intelligent cleanup/archiving recommendations | Static per-item safety tag (Safe / Check First) + static canned explanation text | **Reuse the safety-first UX**, replace the static text with live LLM reasoning + add an "archive" action Purge doesn't have at all |
| Trustworthy deletion (implicit requirement — judges *will* worry about this) | Excellent: allowlist engine, trash-only deletion, reversibility, tested | **Copy this almost exactly** — it's free credibility |

**What to lift directly, near-verbatim in spirit:**
1. **The safety-tier UX** — two tiers only (Safe to Clean / Check First), no fake "confidence score" theater, unrecognized items don't get a scary red badge, they just don't show up as actionable.
2. **Trash-only deletion, never `os.remove`/`unlink`** — use `send2trash` (Python) so this holds cross-platform. This single decision is worth more trust points with judges than any amount of AI, because storage-cleanup demos live or die on "would I actually run this on my laptop."
3. **Streaming scan results** — items appear as they're found, not after one long blocking scan that leaves the UI frozen with a spinner. Implement this as an async generator on the backend pushed to the frontend over a WebSocket (or Server-Sent Events, which is simpler if you don't need bidirectional messages) — a large disk scan can easily take 10–30+ seconds, and a live-filling list is the difference between "this feels responsive" and "did it hang?" in a live demo.
4. **Plain-English explanations attached to every item** — Purge nails tone ("premiere pro and after effects store rendered previews here. safe to clean.") Your version should generate this dynamically per-file via LLM instead of a static table, but keep the exact same *voice*: calm, factual, no marketing.

---

## 2. Visual theme — exact values, ready to paste into Tailwind/CSS

Purge's theme is a **restrained neutral grayscale** with color reserved only for the four safety-tag states. It is *not* a bold/oversized-bento look (small type, small radii, no heavy shadows). Copying it faithfully means: keep it boring everywhere except the safety tags.

### CSS variables
```css
:root {
  /* Light */
  --bg-base: #F5F5F6;
  --bg-card: #FFFFFF;
  --bg-elevated: #ECEDEF;
  --bg-overlay: #FFFFFF;
  --border-subtle: #E2E3E6;

  --storage-used: #8A8C96;
  --storage-free: #D6D7DA;

  --text-primary: #1A1B1F;
  --text-secondary: #6B6D76;
  --text-tertiary: #9A9CA5;

  --btn-primary-bg: #1A1B1F;
  --btn-primary-text: #FFFFFF;
  --btn-secondary-border: #D6D7DA;

  --tag-safe-text: #1A7A43;   --tag-safe-bg: #E5F5EB;
  --tag-check-text: #9C6300;  --tag-check-bg: #FBEED8;
  --tag-danger-text: #C5392E; --tag-danger-bg: #FBE6E3;
  --tag-unsure-text: #5C5E66; --tag-unsure-bg: #EDEDEF;
}

[data-theme="dark"] {
  --bg-base: #15161A;
  --bg-card: #1C1D22;
  --bg-elevated: #23242B;
  --bg-overlay: #2A2B33;
  --border-subtle: #2E2F37;

  --storage-used: #CACCD6;
  --storage-free: #4C4E5A;

  --text-primary: #F2F2F3;
  --text-secondary: #9A9CA5;
  --text-tertiary: #6B6D76;

  --btn-primary-bg: #F2F2F3;
  --btn-primary-text: #15161A;
  --btn-secondary-border: #3A3B44;

  --tag-safe-text: #5FD98A;   --tag-safe-bg: #1B2E22;
  --tag-check-text: #F2B84B;  --tag-check-bg: #332910;
  --tag-danger-text: #F2685C; --tag-danger-bg: #321B19;
  --tag-unsure-text: #A7A9B2; --tag-unsure-bg: #26272D;
}
```

### Type scale
- Page title: `20px / semibold / rounded` — web equivalent: `font-family: ui-rounded, "SF Pro Rounded", "Nunito Sans", system-ui;`
- Row title: `13px / medium`
- Metadata / secondary text: `11px / regular`, `11px / medium` for emphasis
Deliberately small and dense — this is an information-dense utility app, not a marketing landing page. Don't inflate font sizes to look "designed"; the restraint *is* the design.

### Shape
- Corner radius: mostly **4–10px** (buttons/rows ≈4–7px, cards ≈8–10px), one outlier at 14px for a hero element. Avoid `rounded-2xl`/`rounded-3xl` Tailwind defaults — they'll read as generic SaaS, not as this app.
- No heavy drop shadows — surfaces are separated by the subtle border color and slight background-tone steps (`bg-base` → `bg-card` → `bg-elevated` → `bg-overlay`), not shadow depth.

### Icon language
Purge uses real per-app brand icons (via `simple-icons`) rather than generic file-type glyphs. For your version: use `simple-icons` (npm) the same way for recognized apps/tools, and fall back to category glyphs (video/audio/image/doc/archive) — exactly Purge's Large Files category-chip pattern — for everything else.

---

## 3. Recommended architecture

Here's the build that best fits the requirements themselves — real filesystem access, real forecasting, and a credible offline "AI assistant" story — within a 2–4 week window:

```
┌─────────────────────────────┐
│  React (Vite) frontend       │
│  Purge-themed UI (above)     │
└──────────────┬────────────────┘
               │ HTTP + WebSocket (local)
┌──────────────▼────────────────┐
│  FastAPI backend (local)       │
│  - filesystem scanner (async)  │
│  - hashing (dup detection)     │
│  - forecasting service         │
│  - Ollama client (LLM layer)   │
└──────────────┬────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
  SQLite            Ollama (local)
  (usage history,    (a small local model
   scan cache,        is enough — pick one
   forecasts)         for latency, not size)
```

**Why this shape, specifically:**
- **Python (FastAPI) over Node/other backends.** The deciding factor is the ecosystem, not familiarity: Python has mature, low-effort libraries for every AI piece you need — `scikit-learn`/`statsmodels` for forecasting, `imagehash` for near-duplicate images, `sentence-transformers` for document-similarity embeddings, and first-class Ollama clients. Doing the same in Node means more glue code and fewer battle-tested libraries for exactly the parts that differentiate this entry.
- **Skip a task-queue broker (Celery/RQ/etc.).** This is a single-user local tool, not a multi-tenant server — a background scan is one Python `asyncio` task, not a distributed job. Adding Redis + a worker process here is pure deployment friction for a judge trying to run your app, with no benefit; `asyncio.create_task` / FastAPI `BackgroundTasks` covers it entirely.
- **SQLite, not a client-server database.** No server to install, ships as a single file alongside the app, and — importantly — you actually *need* a real embedded time-series store here, because forecasting requires history. (Purge gets away with no database at all because it never predicts anything; you can't skip this step.)
- **Electron wrapping the React app, not a plain browser tab.** This isn't a style preference — a browser sandbox physically cannot scan the full filesystem (the File System Access API only sees folders the user explicitly grants, one at a time). Electron can spawn the FastAPI backend as a local subprocess and gives you a real installable app with a menu-bar/tray icon, matching Purge's menu-bar companion. If time runs short late in the build, the fallback is "FastAPI serves the built React app locally, open it in a browser" — functionally fine for a demo, just less polished as a shippable artifact.
- **Ollama, not a hosted API.** Two real advantages for this specific app: zero per-call cost while you iterate on prompts during the hackathon, and a genuine demo talking point — "your file contents and usage patterns never leave your machine" is a meaningfully strong pitch for a tool whose entire job is looking at what's on your disk.

---

## 4. Feature roadmap — prioritized

### MVP (must ship, weeks 1–2) — table stakes to even be a valid entry
- [ ] Async filesystem scanner (Documents/Desktop/Downloads/etc., streamed results, cancellable) — directly modeled on Purge's `AsyncStream` scanners.
- [ ] **Exact duplicate detection** — SHA-256 hash files above a size threshold, group by hash, show reclaimable space per group. (Purge has none of this — this alone beats it on requirement #2.)
- [ ] **Unused-file detection using real last-accessed time**, not just modified time (`os.stat().st_atime` on Linux/macOS; Windows needs `GetFileTime` via `pywin32` or acceptable fallback to modified-time with a caveat noted in the UI).
- [ ] Trash-only deletion via `send2trash`, with a visible "nothing is permanently deleted" guarantee in the UI copy — copy Purge's confidence here.
- [ ] Purge-themed UI shell: sidebar, safety-tag pills, streaming result list, disk usage bar.

### Strong differentiators (weeks 2–3) — this is what wins the track
- [ ] **Real forecasting, not a fake number.** Background sampler snapshots total/used/free disk space + per-category breakdown daily into SQLite. Bootstrap a history on first run by bucketing existing files by creation date so you don't need to wait weeks for real data to accumulate before the demo. Fit a simple, explainable model — linear regression or exponential smoothing (`statsmodels`) on the growth trend per category (Downloads, Caches, Dev artifacts, Media) — and surface "at this rate, you'll run out of space in ~N days" with a visible trend chart. Judges will ask "how does the prediction work" — you want a real, explainable answer, not a hand-wave. This is worth more than any UI polish.
- [ ] **LLM-generated recommendations, dynamically, per scan** — not a static string table like Purge's. Feed the model structured scan results (category, size, staleness, duplicate-group size) and have it produce prioritized, plain-English cleanup/archive suggestions with reasoning. Use a retry/repair loop around the model call (validate the output against a Pydantic schema, re-prompt on failure) so a malformed response never breaks the UI mid-demo. This is the "AI assistant" the brief actually asks for.
- [ ] **Archiving, not just deleting** — Purge only deletes. Add a genuine archive path: compress cold/unused-but-maybe-important files into a dated `.zip`/`.tar.zst` in a chosen location (or a cloud target if you want to stretch), remove the original only after successful archive-write confirmation. This directly answers "archiving recommendations" from the brief, which Purge doesn't attempt at all.
- [ ] Near-duplicate detection as a semantic layer on top of exact duplicates: perceptual hashing (`imagehash`) for near-identical photos/screenshots, and embedding similarity (a small local embedding model, or reuse your Ollama setup) for near-duplicate documents. This is the clearest "actually AI, not just automation" moment in the whole app — exact-hash duplicates are a solved problem since 2005, near-duplicates are the differentiator.

### Stretch (week 4, only if ahead of schedule)
- [ ] Conversational assistant panel — "ask your storage assistant" chat, backed by the same Ollama setup, that can answer "what's taking up the most space in Downloads" or "what changed since last week" against the SQLite history.
- [ ] Scheduled/background monitoring with a local notification, mirroring Purge's scheduled cleaning but framed as "storage forecast updated: 12 days until you should clean up."
- [ ] A "what-if" simulator — let the user toggle categories to clean and see the forecast line move, turning the prediction from a static number into something interactive.

---

## 5. Demo/judging narrative

Lead with the gap, not the UI. A strong 90-second demo arc:
1. **Show the forecast chart first** — "at current growth, you're out of space in 18 days" — this is the hook, because almost no competing storage-cleaner submission will have real prediction.
2. **Show a duplicate group being found and explained** — near-duplicate photos, with the reasoning ("these 4 screenshots are 97% visually similar, keeping the newest").
3. **Show the LLM recommendation panel** generating a *specific, non-generic* explanation for a real file on the judge's own scan — this proves it's not a canned string table.
4. **Close on the safety story** — trash-only, reversible, nothing auto-deleted without confirmation. This is where you explicitly borrow Purge's credibility: judges who've seen bad "cleaner" apps before will visibly relax when they see this.

Avoid opening with "we built a file scanner" — every team in this track has a file scanner. Open with the prediction, since that's the one requirement almost nobody else will have actually built.

---

## 6. Open decisions worth nailing down before week 1 ends

- **Cross-platform demo requirement?** If judges will only see one machine live, build/test on that OS first (`st_atime` reliability and trash behavior both vary by OS — macOS/Linux are easy with `send2trash`; Windows "last accessed time" needs an explicit fallback path).
- **Team size** — solo vs. team changes how much of the "strong differentiators" tier is realistic in 2–4 weeks; near-duplicate detection is the first thing to cut if you're solo and behind schedule.
- **Do you have (or can you fabricate) a realistic multi-week usage-history dataset to demo the forecast against**, or should the bootstrap-from-file-creation-dates approach above be the primary path? This affects how convincing the "predicts future storage needs" demo looks.
