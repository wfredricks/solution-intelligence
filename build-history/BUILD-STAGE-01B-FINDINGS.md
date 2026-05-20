# BUILD-STAGE-01B-FINDINGS.md — Scaffold the 5 nested SI runtime repos

*Completed 2026-05-20 18:20 EDT by sub-agent. All five repos shipped under `wfredricks/`, tagged `v0.1.0-pre`, CI green. Bookend README updated. Total wall-clock: ~13 min.*

---

## TL;DR

All five Stage 1b runtime repos shipped successfully. Five public repos in `wfredricks/`, each tagged `v0.1.0-pre` with a GitHub release, all CI runs green on Node 20.x + 22.x (templates: 20.x only by design). The bookend README has a new "Stage 1b — runtime surface" table listing them.

| # | Repo | npm name | Commit SHA (HEAD) | Tag | CI |
|---|---|---|---|---|---|
| 1 | [solution-intelligence-cli](https://github.com/wfredricks/solution-intelligence-cli) | `@solution-intelligence/cli` | `70265e8` | v0.1.0-pre | ✅ green |
| 2 | [solution-intelligence-identity](https://github.com/wfredricks/solution-intelligence-identity) | `@solution-intelligence/identity` | `01ceccc` | v0.1.0-pre | ✅ green |
| 3 | [solution-intelligence-studio](https://github.com/wfredricks/solution-intelligence-studio) | `@solution-intelligence/studio` | `eb121b0` | v0.1.0-pre | ✅ green |
| 4 | [solution-intelligence-window](https://github.com/wfredricks/solution-intelligence-window) | `@solution-intelligence/window` | `67b1b69` | v0.1.0-pre | ✅ green |
| 5 | [solution-intelligence-templates](https://github.com/wfredricks/solution-intelligence-templates) | `@solution-intelligence/templates` *(private)* | `2c5b614` | v0.1.0-pre | ✅ green |

Bookend update commit: `ddabd5c` on `wfredricks/solution-intelligence` `main`.

## Per-repo time breakdown

Times are wall-clock from "start mkdir" to "release published", measured from `npm install` finish through `gh release create`:

| Repo | Wall-clock | Notes |
|---|---|---|
| cli | ~5 min | First repo; included one CI failure + fix iteration (see below) |
| identity | ~2 min | Recipe was now proven; clean run |
| studio | ~2 min | Clean run |
| window | ~2 min | Clean run |
| templates | ~1 min | Simpler shape (no build, no test, no tsup); single-job CI |
| Bookend update + FINDINGS | ~1 min | |
| **Total** | **~13 min** | Well under the 30–40 min target |

## What didn't work the first time (recovery notes for Stage 1c)

### 1. Coverage threshold breaks the moment any source file isn't excluded

**What happened:** The first push of `cli` failed CI at the Test step on both Node 20.x and 22.x:

```
ERROR: Coverage for lines (0%) does not meet global threshold (80%)
ERROR: Coverage for functions (0%) does not meet global threshold (80%)
ERROR: Coverage for statements (0%) does not meet global threshold (80%)
ERROR: Coverage for branches (0%) does not meet global threshold (80%)
```

**Why:** The Stage 1a `vitest.config.ts` template enforces 80% coverage across `src/**/*.ts` minus `['src/**/*.test.ts', 'src/index.ts']`. Stage 1a's repos all have *only* `src/index.ts`, so the coverage set is empty and the gate passes vacuously. The `cli` repo introduces a second source file — `src/cli.ts` — which IS included in coverage. The smoke test exercises it through `execSync('node dist/cli.js --version')`, which v8's in-process instrumentation can't see. Coverage drops to 0% and the gate fails.

**Fix:** Added `'src/cli.ts'` to the coverage `exclude` list in the `cli` repo's `vitest.config.ts`, with a comment explaining why (thin bin shim, exercised as a subprocess). Followup commit `70265e8`; second CI run green.

**Lesson for the brief / Stage 1c:** Any repo whose `src/` will contain files that *can't* be reached by in-process unit tests needs to either (a) exclude those files from coverage at scaffold time, or (b) bring the coverage thresholds down to 0 at scaffold time and ratchet them up when real code lands. The brief doesn't currently flag this. The Stage 1a vitest template only works for repos whose only source file is `index.ts`.

**Recommended brief addition:** For any future scaffold that adds source files beyond `index.ts`, mirror the cli treatment — exclude the new files from coverage with a `Why:` comment. Or: switch to a "thresholds: 0" default at scaffold time and raise them per-repo when real code arrives.

### 2. CHANGELOG hygiene differs from Stage 1a

Stage 1a's CHANGELOGs still contain stale `## [0.1.0]` sections inherited from the chainblocks template — they describe `solution-intelligence-graph-adapter` as "an embeddable hash-chained append-only ledger library", which is nonsense for that repo. The brief explicitly told me to "start fresh per repo, with only the `## [0.1.0-pre] — 2026-05-20` section", so all five Stage 1b CHANGELOGs are clean. **Bill may want to backport this hygiene to the three Stage 1a repos in a small drive-by PR.** It's user-visible on the GitHub repo home page.

### 3. Node 20 deprecation warning (informational)

Every CI run emits a yellow annotation from GitHub:

> Node.js 20 actions are deprecated. The following actions are running on Node.js 20 and may not work as expected: actions/checkout@v4, actions/setup-node@v4. … Actions will be forced to run with Node.js 24 by default starting June 2nd, 2026.

This is GitHub-Actions-internal (the *actions themselves* run on Node 20 inside the runner; our matrix of `'20.x' | '22.x'` is unrelated). All runs are green. **Action for Stage 7:** bump CI matrix to `'22.x' | '24.x'` and confirm the actions are still fine. Not blocking; flagged so it doesn't surprise anyone in mid-June.

### 4. The brief said "no `polygraph-db` in deps" — confirmed correct

None of the five Stage 1b repos needed `polygraph-db`. All `package.json`s ship with only `devDependencies` (the standard tsup/vitest/eslint/prettier/typescript set). `npm install` ran clean on every repo — no `file:../polygraph` resolution attempts, no failures.

## What was tailored per the brief

- **cli** has the special two-entry `tsup.config.ts` (builds both `src/index.ts` and `src/cli.ts`), a `"bin": { "si": "dist/cli.js" }`, and a CI workflow with `build` *before* `test:coverage` so the bin smoke check can exec the built artifact. Verified locally: `node dist/cli.js --version` → `0.1.0-pre`; `node dist/cli.js` → "si v0.1.0-pre — Solution Intelligence CLI (scaffold) / Stage 2 will add: init, add, destroy."
- **templates** is a content repo: `"private": true`, no `src/`, no `tests/`, no `tsconfig.json`, no `tsup.config.ts`, no `vitest.config.ts`, no eslint/prettier. `package.json` has only a no-op `test` script. CI is a single-job workflow (Node 20.x only, runs `npm test`).
- **All four library repos** (cli, identity, studio, window) share the same Stage 1a-derived toolchain: TypeScript 5.6, tsup 8, vitest 2, eslint 8, prettier 3, ESM-only output, Node ≥20.

## Files in each repo (library shape)

```
.eslintrc.json        (copied verbatim from Stage 1a)
.gitignore            (copied verbatim)
.prettierrc.json      (copied verbatim)
.github/workflows/ci.yml  (verbatim for identity/studio/window; tweaked for cli)
CHANGELOG.md          (fresh per repo, single [0.1.0-pre] section)
CODE_OF_CONDUCT.md    (copied verbatim)
CONTRIBUTING.md       (sed-substituted name)
LICENSE               (copied verbatim — Apache-2.0)
README.md             (fresh per repo, ~80 lines, role-specific)
SECURITY.md           (sed-substituted name)
package.json          (fresh per repo)
src/index.ts          (VERSION export + JSDoc citing REQ-SI-NF-052)
tests/smoke.test.ts   (asserts VERSION === '0.1.0-pre')
tsconfig.eslint.json  (copied verbatim)
tsconfig.json         (copied verbatim)
tsup.config.ts        (verbatim for identity/studio/window; two-entry for cli)
vitest.config.ts      (verbatim for identity/studio/window; src/cli.ts excluded for cli)
```

## Things Bill should know

1. **`@solution-intelligence` is still unclaimed on npm.** The brief was explicit about this — I did not attempt `npm publish` for any repo. The scoped names in `package.json` are forward-looking. When you're ready, claim the scope before Stage 7's `npm ci` switchover.

2. **Three Stage 1a repos have nonsense CHANGELOGs** (see #2 above). Probably worth a 5-minute cleanup PR before anyone external lands on those pages.

3. **The CLI bin works.** `npm run build && node dist/cli.js --version` printed `0.1.0-pre` locally. Once `@solution-intelligence/cli` is npm-installed globally, `si --version` will work.

4. **`vitest.config.ts` 80% coverage is a footgun for scaffolds.** Every new file added to `src/` either needs unit tests (real work) or an explicit exclude (one-line config change). Consider relaxing to `thresholds: 0` at scaffold time and ratcheting per-repo as real code lands. Documented in the recovery notes above.

5. **All ten repos in the SI namespace now exist:** 1 bookend (`solution-intelligence`) + 3 Stage 1a + 5 Stage 1b + the existing PolyGraph siblings. The bookend README's "Sibling repositories" section is the single source of truth — I split it into two clearly-labeled tables (Stage 1a, Stage 1b) and bumped the top-of-file status line.

6. **CI green doesn't mean coverage tested anything yet.** All five repos have 0% real coverage because their source is just a `VERSION` export. The 80% gate passes vacuously (Stage 1a pattern) because every reachable source file is excluded. When Stage 2/3/5/6 land, the first task in each repo is to re-enable coverage on the new files and write tests to clear the bar. Don't let the green checkmarks lull you into thinking the gate is doing work.

## Receipts

- All 5 GitHub repos visible at `https://github.com/wfredricks/solution-intelligence-{cli,identity,studio,window,templates}`
- All 5 releases at `https://github.com/wfredricks/solution-intelligence-{...}/releases/tag/v0.1.0-pre`
- All local trees in `artifacts/si-runtime/{cli,identity,studio,window,templates}`
- Bookend update at `https://github.com/wfredricks/solution-intelligence/commit/ddabd5c`

## Time budget

Target was 30–40 min; hard cap was 60 min. Actual: **~13 min** wall-clock from "start" to "FINDINGS written" (excluding this final write). The brief's "do them one at a time" discipline plus the proven recipe after cli's one CI iteration kept things tight.
