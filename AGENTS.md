**Read Before Anything Else**
Read in this exact order before any implementation:

1. context/project_overview.md
2. context/architecture.md
3. context/ui-tokens.md
4. context/ui-rules.md
5. context/ui-registry.md
6. context/code-standards.md
7. context/library-docs.md
8. context/build-plan.md
9. context/progress-tracker.md

**Rules That Never Change**

- **Never use hardcoded hex values or raw Tailwind color classes.**
- **Update** `progress-tracker.md` and `ui-registry.md` after every feature.
- **Before any third-party library:** load its installed skill first, then read `context/library-docs.md` for project-specific rules.
- **If the same problem persists after one corrective prompt:** stop and run `/recover`.

**Available Skills**

- **/architect:** Run before choosing approaches, designing a feature or page, or picking a tech stack. Produces a build spec in `docs/specs/` and owns spec files. See `.agents/skills/architect/SKILL.md`.
- **/audit:** Bootstrap project AI context and AGENTS.md files for a workspace or area. Writes tool-agnostic AGENTS.md and CLAUDE.md pointers. See `.agents/skills/audit/SKILL.md`.
- **/check:** Confirm a change before merge. Modes: `/check verify` (runs the app against the spec) and `/check review` (senior code review). Writes findings to `docs/reviews/`. See `.agents/skills/check/SKILL.md`.
- **/debug:** Reproduce, localize, fix root-cause bugs and hand a regression test to `/test`. See `.agents/skills/debug/SKILL.md`.
- **/develop:** Build a feature from an approved spec; gates to `/architect` if a load-bearing decision is owed. See `.agents/skills/develop/SKILL.md`.
- **/document:** Draft PR text, changelogs, release notes, or postmortems from the real diff. See `.agents/skills/document/SKILL.md`.
- **/scope:** Turn an idea into a living scope under `docs/scope/`. Seeds what to build; `/architect` designs; `/develop` implements. See `.agents/skills/scope/SKILL.md`.
- **/sync:** Run after a change to keep AGENTS.md, scope, and spec statuses current. Makes surgical edits only. See `.agents/skills/sync/SKILL.md`.
- **/test:** Generate test suites for recent changes; reads `test-preferences.json` and targets happy path, edges, and error states. See `.agents/skills/test/SKILL.md`.
- **/find-skills:** Help discover/install agent skills. See `/Users/bhaveshmore/.agents/skills/find-skills/SKILL.md`.
- **/graphify:** Generate knowledge graphs, clustered communities, and audit reports. See `/Users/bhaveshmore/.claude/skills/graphify/SKILL.md`.
- **/project-setup-info-local:** Project scaffolding and setup guidance. See the VS Code extension skill.
- **/get-search-view-results:** Retrieve current Search view results in VS Code.
- **/agent-customization:** Create/update agent customization files (`.instructions.md`, `.prompt.md`, `.agent.md`, `SKILL.md`, `copilot-instructions.md`, `AGENTS.md`).
- **/chronicle:** Analyze session history for standups, summaries, and reindexing.
- **Pylance skills:** `python-fact-grounded-coding`, `pylance-docs`, `pylance-refactoring`, `pylance-python-profiling` — use these for Python-specific tasks (see extension assets).
