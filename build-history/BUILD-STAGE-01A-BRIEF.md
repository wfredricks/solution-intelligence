# BUILD-STAGE-01A — Sub-Agent Brief

*Stage 1a of the Solution Intelligence v0.1 build: the three FLAT, standalone-publishable repos.*

**Spawned:** 2026-05-20, after the original Stage 1 sub-agent failed silently mid-write on 2026-05-19 at ~17:55 EDT. The failure cause was surface-area-too-large (one sub-agent asked to produce all 8 repos = ~120-150 files in one turn). Stage 1 has been decomposed into Stage 1a (this brief, 3 repos) and Stage 1b (next brief, 5 repos).

---

## 🛑 Before you start

**READ THESE FIRST, FULLY, IN ORDER:**

1. `~/.openclaw/workspace/artifacts/solution-intelligence/STORY.md` — what SI is and why
2. `~/.openclaw/workspace/artifacts/solution-intelligence/REQUIREMENTS.md` — the 111 REQs you're building toward
3. `~/.openclaw/workspace/artifacts/solution-intelligence/docs/OVERVIEW.md` — the structured reference
4. `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-PLAN.md` — the 7-stage decomposition
5. `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-STAGE-01-SPEC.md` — the canonical specification for Stage 1 (Stage 1a is a subset)
6. `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-STAGE-01-CONFIG.md` — the standard templates for every Stage 1 repo

**REFERENCE PLAYBOOKS:**
- `~/.openclaw/workspace/knowledge/playbooks/sub-agent-build-cycle.md`
- `~/.openclaw/workspace/knowledge/playbooks/github-published-projects.md`

The six non-negotiable rules in BUILD-STAGE-01-SPEC.md §"🛑 The six non-negotiable rules" apply to you. Re-read them before producing any file.

---

## 🛑 Lessons from the 2026-05-19 failure

The previous Stage 1 sub-agent failed silently mid-write of `/tmp/si-stage1-build/generate.mjs`. The work in `/tmp/` evaporated when the container was reaped. No findings file existed to indicate the failure.

**Rules to prevent recurrence:**

1. **DO NOT work in `/tmp/`**. All artifacts live inside the target repo directories.
2. **WRITE `BUILD-STAGE-01A-FINDINGS.md` AT THE TARGET PATH `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-STAGE-01A-FINDINGS.md` AS YOUR FIRST FILE OPERATION**, before any other work. Initial content: "Stage 1a started at <timestamp>. In progress." Update it as you go. If you die mid-run, this file will exist to prove you ran at all.
3. **SURFACE FAILURES IMMEDIATELY**. Content filter blocks, tool timeouts, model refusals, anything that prevents you from doing the work — name them in the findings file in the same turn you encounter them. No silent retries.
4. **VERIFY BY RUNNING, NOT BY READING**. A stage is complete when `pnpm install`, `pnpm test`, `pnpm run lint`, and `pnpm run typecheck` all pass. Status reports that substitute for verification are the failure mode I am explicitly warning you about.

---

## Your mission (Stage 1a)

Produce **three** standalone-publishable repo foundations, flat under `artifacts/`. Each is a Git repository in its own right (independent history), with the standard Stage 1 governance + tooling + minimal placeholder source + smoke test + CI workflow.

### The three repos

| Repo name | Path | Purpose |
|-----------|------|---------|
| **`solution-intelligence-graph-adapter`** | `~/.openclaw/workspace/artifacts/solution-intelligence-graph-adapter/` | SI/G — PolyGraph adapter, GraphLoader, three-tier-schema enforcement, DSL validator, chainblocks audit integration. |
| **`solution-intelligence-parsers`** | `~/.openclaw/workspace/artifacts/solution-intelligence-parsers/` | Parser library (markdown-intent, csharp-treesitter stub, future PDF/log/SQL parsers). |
| **`solution-intelligence-analysts`** | `~/.openclaw/workspace/artifacts/solution-intelligence-analysts/` | Analyst library (Inventory, DependencyAtlas, IntentVsReality, ConstraintCoverage, RiskSurface). |

**These three repos are siblings of the existing `polygraph`, `bangauth`, and `chainblocks` repos under `~/.openclaw/workspace/artifacts/`.** Confirm they don't already exist (`ls`) before creating; if any exist (e.g. partial work from the failed run), check git status inside and either resume or report.

### What goes in each repo

Per BUILD-STAGE-01-SPEC.md §"What to build, in order" and BUILD-STAGE-01-CONFIG.md (templates). Each repo must contain:

- `package.json` from the template in CONFIG §"Standard package.json template"
- `tsconfig.json` from CONFIG
- `tsup.config.ts` from CONFIG
- `vitest.config.ts` from CONFIG
- `.eslintrc.json` from CONFIG
- `.prettierrc.json` from CONFIG
- `.gitignore` from CONFIG
- `LICENSE` (Apache-2.0)
- `README.md` — short, mentions purpose + that this is part of SI v0.1
- `SECURITY.md` — standard template
- `CONTRIBUTING.md` — standard template
- `CHANGELOG.md` — Keep-a-Changelog header + `[Unreleased]` + `[0.0.1] — YYYY-MM-DD — Initial scaffold`
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `.github/workflows/ci.yml` from CONFIG
- `src/index.ts` — minimal exported placeholder symbol per repo (e.g. `export const GRAPH_ADAPTER_VERSION = '0.0.1';`)
- `src/__tests__/smoke.test.ts` — one passing assertion against the placeholder export

### Dependencies (per BUILD-STAGE-01-SPEC.md §"Inter-repo dependencies")

- `solution-intelligence-graph-adapter` depends on `polygraph` (already exists at `../polygraph/`): `"polygraph": "file:../polygraph"`
- `solution-intelligence-parsers` has no SI sibling deps (Stage 4 may add some)
- `solution-intelligence-analysts` has no SI sibling deps (Stage 5 may add some)

---

## What to do, in order

1. **Write the findings file first.** Initial state.
2. **Confirm the workspace path** is `/Users/williamfredricks/.openclaw/workspace/artifacts/` and that the three target directories don't exist yet (or are empty/safe).
3. **For each of the three repos**, in order (graph-adapter, parsers, analysts):
   - `mkdir` the repo path
   - `cd` into it and `git init && git checkout -b main`
   - Write every file listed above
   - Run `npm install` (or `pnpm install` if available)
   - Run `npm test` (smoke test must pass)
   - Run `npm run lint` (must pass; warnings OK)
   - Run `npm run typecheck` (must pass)
   - Run `npm run build` (must succeed; `dist/` produced)
   - `git add -A && git commit -m "Initial scaffold (Stage 1a)"` with a clean Stage 1a commit message
   - Update the findings file with the repo's status (PASS / FAIL with reason)
4. **After all three are done**, write a final summary section in the findings file: how many repos succeeded, time taken, any deviations from spec, anything blocking Stage 2.

---

## How to report back

**When you finish (success or failure)**, your final reply should include:

1. The three repo paths created
2. The git log first commit hash for each
3. The output of `npm test` from each (PASS confirmation + count)
4. The contents of `BUILD-STAGE-01A-FINDINGS.md`
5. Any open questions or surfaced defects

**Do not summarize verbally what's in files. Either show the file content or say "see findings file at <path>".**

---

## What is NOT in scope for Stage 1a

- Stage 1b (the 5 nested repos) — different brief, different sub-agent run
- Actual SI/G or parser or analyst code — Stage 1 produces FOUNDATIONS only
- Cross-repo orchestration scripts — those land in Stage 2+
- GitHub publishing — these stay local until later

---

## Time budget

Soft target: **45 minutes**. Hard cap: **60 minutes**. If you are past 45 minutes and have not yet completed all three repos, stop, update the findings file with what's done and what's not, and surface the blocker.

🖇️ Go.
