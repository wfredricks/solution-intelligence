# BUILD-STAGE-01: Foundations — Sub-Agent Specification

*The sub-agent's instruction sheet for Stage 1 of the Solution Intelligence v0.1 build. Canonical answer to "what exactly should you produce?"*

**Status:** 2026-05-19 17:00 EDT, pre-spawn.
**Read first (in this order, fully):**
1. `~/.openclaw/workspace/artifacts/solution-intelligence/STORY.md`
2. `~/.openclaw/workspace/artifacts/solution-intelligence/REQUIREMENTS.md`
3. `~/.openclaw/workspace/artifacts/solution-intelligence/docs/OVERVIEW.md`
4. `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-PLAN.md`
5. `~/.openclaw/workspace/artifacts/solution-intelligence/BUILD-STAGE-01-CONFIG.md`

**Reference playbooks (read once, then comply):**
- `~/.openclaw/workspace/knowledge/playbooks/sub-agent-build-cycle.md`
- `~/.openclaw/workspace/knowledge/playbooks/github-published-projects.md`

**Reference paper (read once for context):**
- `~/.openclaw/workspace/knowledge/papers/FOUNDATION-SEED.md`

---

## 🛑 The six non-negotiable rules

Inherited from `BUILD-PLAN.md`. These apply to every Stage; Stage 1 is bound by all of them.

### Rule 1: Do not modify the bookend.

**Never modify any of:**
- `artifacts/solution-intelligence/STORY.md`, `REQUIREMENTS.md`, `MODEL.md`
- `artifacts/solution-intelligence/docs/*.md`
- Anything under `artifacts/solution-intelligence/sig/`
- `BUILD-PLAN.md`, this `BUILD-STAGE-01-SPEC.md`, or `BUILD-STAGE-01-CONFIG.md`

If you find a defect in any of the above:
1. **Stop.**
2. Create or append to `BUILD-STAGE-01-FINDINGS.md` at `~/.openclaw/workspace/artifacts/solution-intelligence/` with file, line, defect, suggested fix, whether it blocks.
3. Continue only with what you can build unambiguously.
4. Surface the finding in your final report.

The bookend is the contract. Code conforms to it.

### Rule 2: Verify by running, not by reading.

A stage's completion is verified by running the produced artifacts:
- `pnpm install` (or `npm install`) succeeds.
- `pnpm test` (or `npm test`) passes against the smoke test.
- `pnpm run lint` and `pnpm run typecheck` pass.
- The GitHub Actions workflow runs and passes (we will simulate this locally if needed).

Status reports that substitute for actual work are a known failure mode. Verify by running.

### Rule 3: Surface failures immediately.

If you hit content-filter blocks, runtime errors, tool timeouts, model refusals, or any silent-failure class: surface it to the orchestrator in the same turn. No silent retries. No "I'll just try again" without first naming what failed.

### Rule 4: Open-source-grade quality from day one.

Per `knowledge/playbooks/github-published-projects.md`:
- ESM-first TypeScript with strict mode.
- `tsup` build, `vitest` test runner, `eslint` lint, `prettier` formatter, `tsc --noEmit` typecheck.
- ≥80% test coverage thresholds on the smoke test (REQ-SI-NF-051).
- ≥90% JSDoc coverage on exported symbols (REQ-SI-NF-052).
- `// Why:` comment standard on non-obvious code.
- Governance trio: README, SECURITY, CONTRIBUTING.
- CHANGELOG follows Keep-a-Changelog format.
- CI quality gates on every push (tests + coverage + lint + typecheck).
- License declared: Apache 2.0.

### Rule 5: Substrate-independence in the schema.

Stage 1 produces *no* graph code, so this rule is dormant for Stage 1 — but you must not contradict the three-tier schema declared in `MODEL.md` §2.1 in any future-facing types, interfaces, or comments.

### Rule 6: Person-attributed audit on every state change.

Stage 1 produces *no* runtime that mutates state, so this rule is dormant for Stage 1 — but any scaffolding you write that anticipates audit (placeholder interfaces, audit-related types, etc.) must use `actor.userId`, not `actor.systemId` or anonymous variants.

---

## Mission

Produce the **poly-repo foundation** for Solution Intelligence v0.1. After Stage 1, the project consists of one independent Git repository per future workspace package, each with a clean tooling setup, governance documents, CI configuration, and minimal placeholder source code that proves the toolchain works.

**This stage produces no product code.** It produces the *substrate* on which Stages 2-7 will build product code. The exit-gate test is "does the toolchain work end to end?", not "does anything do anything useful yet?"

---

## Architecture decision: Poly-repo

Per Bill's decision 2026-05-19 16:25 EDT: SI v0.1 is poly-repo, not monorepo. Each of the following will be its own independent Git repository:

| Repo name | Purpose | Stage that fills it |
|-----------|---------|---------------------|
| `solution-intelligence-cli` | The `si` CLI (`init`, `up`, `down`, `ingest`, `analyze`, `report`, `verify`, `grant`, etc.) | Stages 2, 3, 4, 5, 6, 7 |
| `solution-intelligence-identity` | SI/I — bangauth-based Identity service, OIDC adapter stub | Stage 2 |
| `solution-intelligence-graph-adapter` | SI/G — PolyGraph adapter, GraphLoader, DSL validator | Stage 3 |
| `solution-intelligence-studio` | SI/S — BB substrate, dev UI, parser registry, analyst host | Stage 4 |
| `solution-intelligence-window` | SI/W — consumer UI, role-scoped views | Stage 6 |
| `solution-intelligence-parsers` | Parser library (markdown-intent, csharp-treesitter stub) | Stage 4 |
| `solution-intelligence-analysts` | Analyst library (Inventory, DependencyAtlas, IntentVsReality, ConstraintCoverage, RiskSurface) | Stage 5 |
| `solution-intelligence-templates` | Template manifests (`prose-doc` ready, `csharp-to-servicenow` stubbed) | Stages 4 + 5 |

**Stage 1 creates the eight repos with their foundations only.** Stages 2-7 add product code to each as needed.

Each repo lives at `~/.openclaw/workspace/artifacts/<repo-name>/` and has its own independent Git history. They are *not* nested under `artifacts/solution-intelligence/`; that directory remains the SI bookend (STORY, REQUIREMENTS, MODEL, etc.) and is not itself a workspace package.

### Inter-repo dependencies

Stage 1 will declare the dependency edges in each repo's `package.json` even though the dependencies don't yet have published versions:

```
solution-intelligence-cli
   ├─ depends on → solution-intelligence-identity
   ├─ depends on → solution-intelligence-graph-adapter
   ├─ depends on → solution-intelligence-studio
   └─ depends on → solution-intelligence-templates

solution-intelligence-studio
   ├─ depends on → solution-intelligence-graph-adapter
   ├─ depends on → solution-intelligence-parsers
   └─ depends on → solution-intelligence-analysts

solution-intelligence-window
   └─ depends on → solution-intelligence-graph-adapter (read-only)

solution-intelligence-graph-adapter
   └─ depends on → polygraph (existing repo at ~/.openclaw/workspace/artifacts/polygraph)

solution-intelligence-identity
   └─ depends on → bangauth (existing repo at ~/.openclaw/workspace/artifacts/bangauth)
```

For local development, use **`file:` references** in `package.json` pointing at the sibling repo on disk (the same pattern `chainblocks/sig` uses to depend on `polygraph`). When a repo is published, the `file:` reference is swapped for a real semver constraint. **Stage 1 uses `file:` references throughout.**

---

## What to build, in order

### Step 1: Create the eight repo skeletons.

For each of the eight repos listed in "Architecture decision: Poly-repo" above:

1. Create `~/.openclaw/workspace/artifacts/<repo-name>/`.
2. Run `git init` inside it.
3. Set the repo's default branch to `main`.
4. Add the standard governance files (see Step 2).
5. Add the standard tooling configuration (see Step 3).
6. Add a minimal placeholder source file (see Step 4).
7. Add a minimal smoke test (see Step 5).
8. Add CI configuration (see Step 6).
9. Create the initial commit on `main` with a clean, descriptive message:
   `"feat: initial scaffold for <repo-name>"`.

### Step 2: Standard governance files (every repo).

Each repo gets:

- **`LICENSE`** — Apache License 2.0, full text, copyright holder "William Fredricks".
- **`README.md`** — One paragraph describing the repo's purpose (per the table above), a "Status" line marking it as `v0.1.0-pre`, a placeholder Quick Start section, a link to `~/.openclaw/workspace/artifacts/solution-intelligence/STORY.md` as the canonical project narrative.
- **`CONTRIBUTING.md`** — Standard structure: development setup, testing, commit conventions (use Conventional Commits), PR process. Reference `knowledge/playbooks/github-published-projects.md` as the project-wide bar.
- **`SECURITY.md`** — Standard structure: supported versions (only `0.1.x` for now), how to report a vulnerability (placeholder email `security@<repo-name>.example` for now; we'll fill in real channel before public release).
- **`CODE_OF_CONDUCT.md`** — Contributor Covenant v2.1, standard.
- **`CHANGELOG.md`** — Keep-a-Changelog format. Start with an `[Unreleased]` section and a `## [0.1.0-pre] — 2026-05-19` section noting "Initial scaffold; no product code yet."
- **`.gitignore`** — Standard Node.js gitignore (node_modules, dist, coverage, .DS_Store, .env*, *.log).

### Step 3: Standard tooling configuration (every repo).

Each repo gets:

- **`package.json`** — Module name `@solution-intelligence/<short-name>` (e.g. `@solution-intelligence/cli`, `@solution-intelligence/identity`), version `0.1.0-pre`, type `module`, license `Apache-2.0`, repository field pointing at `https://github.com/wfredricks/<repo-name>` (placeholder URL OK), declared inter-repo dependencies as `file:` references where applicable.
- **`tsconfig.json`** — Strict TypeScript, ES2022 target, ESNext modules, bundler module resolution, declaration output enabled, source maps enabled.
- **`tsup.config.ts`** — Builds to `dist/`, ESM-only output, declarations on, source maps on, target ES2022, entry point at `src/index.ts`.
- **`vitest.config.ts`** — Node environment, coverage provider v8, coverage thresholds 80% lines/branches/functions/statements, test reporter verbose, `tests/` and `src/**/*.test.ts` patterns included.
- **`.eslintrc.json`** — TypeScript-ESLint recommended, no-unused-vars warn (with `_` prefix exception), prefer-const error, no-explicit-any warn.
- **`.prettierrc.json`** — 2-space indent, single quotes, semicolons, trailing commas (all), 100-column print width.
- **`scripts/`** in `package.json`: `build`, `test`, `test:watch`, `lint`, `lint:fix`, `format`, `typecheck`, `clean`, `prepublishOnly` (runs `build`).

### Step 4: Minimal placeholder source.

Each repo has `src/index.ts` containing **only** an exported version string and a `// Why:` comment:

```typescript
// Why: This is the v0.1.0-pre scaffold for @solution-intelligence/<short-name>.
//      Product code will be added in build Stage <N>. Until then, this module
//      exports only its version so the toolchain can be verified end to end.

/**
 * Package version.
 *
 * Why: Provides a single import-able symbol so Stage 1's smoke test has
 * something real to assert against. Will be replaced with real exports
 * in Stage <N>.
 *
 * @requirement REQ-SI-NF-052 (JSDoc on exported symbols)
 */
export const VERSION = '0.1.0-pre';
```

Replace `<short-name>` and `<N>` per repo:
- `cli` → Stages 2, 3, 4, 5, 6, 7
- `identity` → Stage 2
- `graph-adapter` → Stage 3
- `studio` → Stage 4
- `window` → Stage 6
- `parsers` → Stage 4
- `analysts` → Stage 5
- `templates` → Stages 4, 5

### Step 5: Smoke test.

Each repo has `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';

describe('@solution-intelligence/<short-name> scaffold', () => {
  it('exposes a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^0\.1\.0-pre$/);
  });
});
```

This smoke test alone is enough to pass the coverage threshold for the scaffold's single exported symbol.

### Step 6: CI configuration.

Each repo has `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

The workflow runs lint, typecheck, test, and build on every push and PR against `main`. The `file:` dependencies will resolve correctly in CI because all eight repos are in the same workspace directory on the runner once we configure that for the eventual real CI (Stage 7 polish item). For now, configure as above; the local `npm install` works against the on-disk siblings via the `file:` references.

---

## Verification checklist

The sub-agent reports against this at the end:

For each of the eight repos:

- [ ] Repository exists at `~/.openclaw/workspace/artifacts/<repo-name>/` with its own `.git/`.
- [ ] `git log` shows exactly one commit on `main` (the initial scaffold).
- [ ] `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.gitignore` all present.
- [ ] `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.eslintrc.json`, `.prettierrc.json` all present and parseable.
- [ ] `src/index.ts` exports `VERSION` with `// Why:` comment and JSDoc.
- [ ] `tests/smoke.test.ts` exists and asserts against `VERSION`.
- [ ] `.github/workflows/ci.yml` exists and is YAML-valid.
- [ ] `npm install` succeeds in the repo with no errors.
- [ ] `npm test` passes (1 test, 1 assertion, coverage threshold met).
- [ ] `npm run lint` passes (zero errors, warnings OK).
- [ ] `npm run typecheck` passes (zero errors).
- [ ] `npm run build` produces `dist/index.js`, `dist/index.d.ts`, and source maps.

Inter-repo dependency wiring (for repos that have them):

- [ ] `solution-intelligence-cli` has `file:../solution-intelligence-identity`, `file:../solution-intelligence-graph-adapter`, `file:../solution-intelligence-studio`, `file:../solution-intelligence-templates` in its dependencies.
- [ ] `solution-intelligence-studio` has `file:../solution-intelligence-graph-adapter`, `file:../solution-intelligence-parsers`, `file:../solution-intelligence-analysts` in its dependencies.
- [ ] `solution-intelligence-window` has `file:../solution-intelligence-graph-adapter` in its dependencies.
- [ ] `solution-intelligence-graph-adapter` has `file:../polygraph` in its dependencies.
- [ ] `solution-intelligence-identity` has `file:../bangauth` in its dependencies.
- [ ] Running `npm install` in each consumer repo successfully resolves the `file:` reference to the sibling.

End-to-end:

- [ ] All eight repos pass their `npm test` from a clean checkout (delete `node_modules`, re-run `npm install`, re-run `npm test`).
- [ ] No repo references the others by path outside of `package.json`'s `file:` declaration.
- [ ] No repo modifies any file under `~/.openclaw/workspace/artifacts/solution-intelligence/` (the SI bookend).

---

## Out of scope for Stage 1

Stage 1 does NOT produce:

- Any product code (CLI commands, services, parsers, analysts, etc.).
- Any Docker images or Compose configuration.
- Any chainblocks integration.
- Any HTTP server, GraphQL endpoint, or other runtime surface.
- Any tests beyond the single smoke test per repo.

Those land in Stages 2-7. Stage 1's job is the *substrate* on which they can be built.

---

## How long should this take?

Reference: chainblocks v0.1 was scaffolded as part of a larger sub-agent run in ~30 minutes by a focused sub-agent. SI Stage 1 is wider (8 repos vs 1) but each repo's scaffold is *smaller* than chainblocks' final state. Net estimate:

- **Best case:** 90 minutes (12 minutes per repo on average; the first repo takes longest, subsequent ones reuse the pattern).
- **Realistic:** 2-3 hours including the cross-repo `file:` dependency verification.
- **Hard ceiling:** 4 hours. If you hit 4 hours and aren't done, stop and surface to the orchestrator.

The sub-agent runs against a focused brief. Surface every hour with a one-paragraph progress update.

---

## How the sub-agent reports back

At completion, produce `BUILD-STAGE-01-REPORT.md` at `~/.openclaw/workspace/artifacts/solution-intelligence/` with:

1. **Verification checklist** — every box checked, with one-line evidence per box (e.g., "✅ `npm test` passes in solution-intelligence-cli — 1 test, 100% coverage").
2. **What was built** — list of the eight repos with their absolute paths and final commit SHAs.
3. **Total time** — wall-clock duration from spawn to completion.
4. **Surprises** — anything the spec did not anticipate that you encountered. (No "everything went smoothly" claims; if the build went smoothly, say what specifically was easy and why. The orchestrator wants honest signal, not reassurance.)
5. **Findings** — if you encountered any defect in the bookend or this spec, point at `BUILD-STAGE-01-FINDINGS.md` for the details. If you encountered none, say "No spec defects encountered."
6. **Ready for Stage 2** — explicit statement that Stage 2 can begin against this scaffold.

---

## Final reminder

You are spawning the substrate for a methodology project that has been deliberately specified over two days. The bookend documents are the contract. The toolchain is what makes them buildable. You produce the toolchain. You do not interpret the bookend. You do not improve on the bookend. You do not modify the bookend. If you see something in the bookend that looks wrong, file a finding and keep going around it.

This stage is unglamorous. It is also load-bearing for everything that comes after. Done well, no future stage will think about it again. Done poorly, every future stage will fight it.

Make it boring. Make it correct. Make it small.

---

*BUILD-STAGE-01-SPEC.md v0.1 — Solution Intelligence. Sub-agent specification for Stage 1 of the v0.1 build.*
