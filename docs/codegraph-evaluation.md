# CodeGraph evaluation — StormLogic

Date: 2026-10-26 (CDT). CodeGraph v1.6.2 (`@colbymchenry/codegraph`, npm global). Nothing committed.

## Stack
React 19 + Vite 8 SPA (JS/JSX, 66 .js + 19 .jsx indexed), Netlify Functions (`netlify/functions/*.mjs`),
Leaflet, Playwright browser tests. No linter or typechecker is configured (no eslint/tsc in package.json),
so "lint/typecheck" was N/A; `npm run build` (vite) is the build check.

## Tests: before vs after
Every step of `npm test` (21 node unit/contract tests, vite build, 5 Playwright tests) run individually.

| | Baseline | After CodeGraph |
|---|---|---|
| Steps passed | 27 / 27 | 27 / 27 |
| Node unit tests (21) | 0.3–3.4 s each, ~12.6 s total | same (±0.04 s) |
| `vite build` | 0.72 s | 0.59 s |
| test:smoke | 8.88 s | 9.00 s |
| test:contrast | 74.95 s | 75.59 s |
| test:persistence | 5.66 s | 5.73 s |
| test:radar | 15.45 s | 15.71 s |
| test:saved-weather | 6.05 s | 6.18 s |
| Total wall time | ~130 s | ~131 s |

No regressions; differences are run-to-run noise. CodeGraph never touches `src/`, `package.json`,
or the bundle (`.codegraph/` is excluded from the app).

## Install metrics
| Item | Value |
|---|---|
| CLI install (`npm i -g`) | 2.7 s |
| Agent wiring (`codegraph install --target=claude,cursor,codex --location=local --yes`) | 0.17 s |
| Index (`codegraph init`) | 1.7 s wall (842 ms graph build) |
| Indexed | 88 files, 1,181 nodes, 3,027 edges |
| Index size | `.codegraph/` 3.7 MB (codegraph.db, self-gitignored) |

## Agent navigation: 5 questions
Baseline = `rg` + `sed` file reads. After = `codegraph` CLI (`callers`, `impact`, `affected`, `explore`).

| # | Question | Baseline ops / bytes | CodeGraph ops / bytes | Accuracy |
|---|---|---|---|---|
| 1 | How is "City, ST" search parsed, and what calls it? | 4 / 3,209 | 2 (`callers` ×2) / 636 — or 1 `explore` / 15.6 KB incl. full source | Same chain (LocationSearch → searchPlaces → parsePlaceQuery). CG also surfaced the test `scripts/place-search-test.mjs` |
| 2 | Where are NWS alerts fetched; what calls `fetchAlerts`? | 4 / 2,013 | 1 / 222 | Same (AlertsPanel.jsx). CG names the enclosing function. Baseline additionally found the `netlify/functions/alerts.mjs` proxy (a URL hop, not a code edge — CG can't see it) |
| 3 | Blast radius of changing `lib/storage.js` | 5 / 2,842 | 2 (`impact`, `affected`) / 269 | Same: only `App.jsx` (→ main.jsx). Neither approach shows the browser test `test:persistence` covers it (it's exercised via Playwright, not imports) |
| 4 | How does the forecast reach the UI (`fetchForecast` callers)? | 2 / 1,035 | 1 / 174 | Same; CG adds the enclosing function `load` (App.jsx:129) |
| 5 | Who uses the NWS warnings adapter? | 3 / 1,978 | 2 / 1,081 | Same app callers (App `refreshOfficialDesk`, RadarPanel constant); CG also listed the test file usages |
| | **Total** | **18 ops / 11,077 B** | **8 ops / 2,382 B** | No wrong answers either way |

Bonus: `git diff --name-only | codegraph affected --stdin -q --filter "scripts/*"` lists which test
scripts to run for a change (e.g. api.js → 6 scripts). The default filter finds nothing here because
tests are named `scripts/*-test.mjs`, so always pass `--filter "scripts/*"`.

Takeaway: on a small (~85 source files) repo, CodeGraph cut lookups ~55% and output ~80% for
"who calls / what breaks" questions. `explore` is the heaviest (13–16 KB per call, since it
inlines source) — good for "how does X work", overkill for a single caller lookup.
Grep still wins for string/URL wiring (e.g. `/api/alerts` → Netlify function).

## Files added (git status before → after)
Before: ` M docs/severe-desk-waved-roadmap.md`, `?? .obsidian/`. After adds these untracked items:

| Path | Purpose | Commit? |
|---|---|---|
| `.codegraph/` (codegraph.db + its own .gitignore) | index | No (self-ignored; only its .gitignore would show) |
| `.mcp.json` | Claude Code project MCP server | Optional (portable) |
| `.claude/settings.json` | Claude allow `mcp__codegraph__*` + `UserPromptSubmit` hook `codegraph prompt-hook` | Optional |
| `.claude/CLAUDE.md` | CodeGraph usage block | Optional |
| `.cursor/mcp.json` | Cursor MCP server (hard-codes `/Users/jared/Projects/storm-logic`) | No — machine-specific |
| `.codex/config.toml` | Codex MCP server (needs project trusted in Codex) | Optional |
| `AGENTS.md` | CodeGraph usage block (marker-fenced) | Optional |
| `docs/codegraph-evaluation.md` | this report | Your call |

Suggested `.gitignore` additions (not applied):
```
.codegraph/
.cursor/mcp.json
```
(If you'd rather keep all agent wiring personal, also add `.mcp.json`, `.claude/`, `.codex/`, `AGENTS.md`.)

## Global changes
- Global npm package `@colbymchenry/codegraph@1.6.2` (`codegraph` on PATH).
- `~/.codegraph/` created (telemetry queue/config). Telemetry was disabled via `CODEGRAPH_TELEMETRY=0`
  during our runs, but one `version` event was queued before that; run `codegraph telemetry off` to persist.
- No changes to `~/.claude.json`, `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.codex/config.toml`,
  `~/.codex/AGENTS.md`; no `~/.cursor/mcp.json` created (verified by grep for "codegraph").

## Uninstall
```
cd ~/Projects/storm-logic
codegraph uninit --force           # removes .codegraph/
codegraph uninstall --yes          # strips MCP config/instructions it wrote + removes CLI
# verify / remove leftovers by hand if any remain:
rm -f .mcp.json .cursor/mcp.json .codex/config.toml .claude/settings.json .claude/CLAUDE.md AGENTS.md
rm -rf ~/.codegraph
```
