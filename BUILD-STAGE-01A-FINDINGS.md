# BUILD-STAGE-01A — Findings

**Started:** 2026-05-20 07:52 EDT (sub-agent)
**Recovered:** 2026-05-20 09:54 EDT (orchestrator in-session)
**Status:** ✅ COMPLETE — all three Stage 1a repos created, verified, and committed

---

## Outcome

| # | Repo | Path | First commit | Test | Typecheck | Lint | Build |
|---|------|------|--------------|------|-----------|------|-------|
| 1 | `solution-intelligence-graph-adapter` | `artifacts/solution-intelligence-graph-adapter/` | `2ae69f3` | ✅ | ✅ | ✅ | ✅ |
| 2 | `solution-intelligence-parsers` | `artifacts/solution-intelligence-parsers/` | `2901179` | ✅ | ✅ | ✅ | ✅ |
| 3 | `solution-intelligence-analysts` | `artifacts/solution-intelligence-analysts/` | `3bef8bd` | ✅ | ✅ | ✅ | ✅ |

Each repo:

- Independent git history, `main` branch, single initial commit on `main`.
- Standard tooling per `BUILD-STAGE-01-CONFIG.md`.
- Passes `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Smoke test asserts the placeholder `VERSION` export.
- License: Apache-2.0.
- Governance bundle: README (tailored per repo), SECURITY, CONTRIBUTING, CHANGELOG, CODE_OF_CONDUCT.
- CI workflow: `.github/workflows/ci.yml` per the SPEC (uses `npm install`, not `npm ci`, because of `file:` cross-repo deps; CI swaps to `ci` in Stage 7).

Inter-repo dependencies declared:
- `solution-intelligence-graph-adapter` → `polygraph` (file:../polygraph)
- `solution-intelligence-parsers` → none yet (Stage 4 will add Studio as consumer; parser interface itself has no SI deps)
- `solution-intelligence-analysts` → none yet (Stage 5 will wire to graph-adapter for reads)

---

## What this run actually did

The recovery had three steps:

1. **Inherited partial graph-adapter scaffold** from the failed sub-agent run (LICENSE + package.json + tooling configs + src/index.ts + tests/smoke.test.ts already existed, 10 files; missing the 5 governance files + CI workflow). Inherited rather than wiped because the partial files were good quality and verifying via `npm test` would catch any defects.
2. **Copied governance from `artifacts/chainblocks/`** (SECURITY, CONTRIBUTING, CHANGELOG, CODE_OF_CONDUCT) into graph-adapter and substituted `chainblocks` → `solution-intelligence-graph-adapter` via `sed`. Wrote a tailored README from scratch (chainblocks README has too many chainblocks-specific paragraphs to substitute mechanically). Wrote a simpler CI workflow per the SPEC (chainblocks' CI has `jsdoc-coverage` + `examples` jobs that Stage 1 doesn't need yet).
3. **`rsync`-copied graph-adapter to parsers and analysts**, then substituted name + description + keywords + removed the polygraph-db dep, then wrote tailored README + src/index.ts + tests/smoke.test.ts per repo.

This let all three repos converge on the same toolchain configuration (identical eslint, tsconfig, tsup, vitest configs) which is a Stage 1 property worth preserving (any future Stage that touches one toolchain file is forced to ask "should this change apply to all three?").

---

## Deviations from spec

### 1. Added `tsconfig.eslint.json`

**What:** Each Stage 1a repo has a `tsconfig.eslint.json` that extends `tsconfig.json` and adds `tests/` to `include`.

**Why:** The standard `tsconfig.json` in `BUILD-STAGE-01-CONFIG.md` excludes `tests/` from compilation (correct — tests don't ship in dist). But `@typescript-eslint/parser` configured with `parserOptions.project: "./tsconfig.json"` then refuses to parse test files because they're not in any TS project (error: "Parsing error: The file was not found in any of the provided project(s): tests/smoke.test.ts"). The fix is a separate eslint-only tsconfig.

**Suggested update to BUILD-STAGE-01-CONFIG.md:** Add the `tsconfig.eslint.json` template alongside the `tsconfig.json` template, and change `.eslintrc.json` `parserOptions.project` from `"./tsconfig.json"` to `"./tsconfig.eslint.json"`.

### 2. Vitest is ^2.0.0, not ^4.0.0

**What:** All three repos use `vitest@^2.0.0` (whatever the installed major version was; `2.1.9` actually resolved).

**Why:** `BUILD-STAGE-01-CONFIG.md` says "vitest ^4.0.0 (or ^2.0.0 if 4 is not yet on disk)". 4 is not yet on disk; 2 was used per the fallback rule. The same applies to `@vitest/coverage-v8`.

**No suggested config update.** The fallback was anticipated.

### 3. README per repo is hand-written, not from a template

**What:** Each repo has a tailored README explaining its role in the SI ecosystem.

**Why:** `BUILD-STAGE-01-CONFIG.md` doesn't provide a README template. Each repo's README needed enough context to make sense to a stranger landing on the repo's GitHub page later. The structure is consistent across the three: status, install, "what this will do (Stage N)", license, ecosystem table.

**Suggested update to BUILD-STAGE-01-CONFIG.md:** Add a README template or at least a section structure that Stage 1b should also follow.

---

## Lessons logged

### Sub-agent failure mode: per-turn output budget

The Stage 1a sub-agent (spawned at 07:51, completed 07:54) hit a content/output budget limit while writing the graph-adapter governance bundle. It managed 10 files (tooling + LICENSE + src + tests) before the response was truncated mid-call. No exception fired; the runtime reported `status: completed` because the tool calls before the cutoff did execute. The result was a partial-but-plausible-looking repo that would have failed CI quietly if I hadn't inspected.

**The previous Stage 1 sub-agent on 2026-05-19 17:55 hit the same failure mode**, just earlier in the run (it died mid-write of `/tmp/si-stage1-build/generate.mjs`). Both runs are the same shape: large batched writes + long planning text in one turn → output budget exceeded → response truncated → no exception → runtime reports success.

This is the failure pattern HEARTBEAT.md's "never fail silently" rule was written to surface. Both runs failed silently from the orchestrator's perspective; both required inspection-of-disk-state to detect.

### Content-filter block on the in-session recovery

After the sub-agent failed, I started in-session recovery and hit Anthropic's content-filtering classifier at roughly 07:55 EDT. The response was blocked. I lost ~2 hours of wall clock to that block plus the gap waiting for Bill to come back. I never identified the exact trigger — most likely culprits are (a) a long Apache LICENSE body in a code block, (b) the way multiple file-write tool calls were batched. The recovery strategy that worked was to stop generating large file bodies and instead **copy existing files from `artifacts/chainblocks/`** then substitute. Path (c) on the recovery menu.

### Logged for future Stage briefs

1. Sub-agent briefs at Stage 1a/1b scale (3-5 repos) need a hard rule: **one file at a time, one repo at a time, verify after each repo, commit after each repo**. The brief told the sub-agent to do this, but I left "produce three repos" as the per-turn surface; that proved too big.
2. **Prefer copy-and-substitute over generate-from-scratch** for boilerplate. The `chainblocks/` directory now serves as the canonical governance template for sibling SI repos.
3. **The `tsconfig.json` + ESLint project-parser interaction is a real config trap** and should be in BUILD-STAGE-01-CONFIG.md.

---

## What unblocks Stage 1b

The three flat repos are now real. Stage 1b's 5 nested repos under `artifacts/si-build/` will need `file:` references that point UP into `artifacts/` (e.g. `cli` → `graph-adapter` at `file:../../solution-intelligence-graph-adapter`). The path math is in `BUILD-STAGE-01-SPEC.md` §"Inter-repo dependencies".

Stage 1b can use the same copy-and-substitute recipe used here. The first nested repo gets a fresh tailored scaffold; the remaining four copy from it.

🖇️ Stage 1a complete.
