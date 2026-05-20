# BUILD-STAGE-01B-BRIEF.md — Scaffold the 5 nested SI runtime repos

*Created 2026-05-20 18:08 EDT for sub-agent execution. Stage 1a is done; this is the parallel pass for the 5 nested runtime repos.*

---

## Objective

Scaffold **5 nested runtime repos** under `artifacts/si-runtime/`, push to GitHub under `wfredricks/`, tag `v0.1.0-pre`, all CI green.

| # | Directory | npm name | GitHub repo | Shape |
|---|---|---|---|---|
| 1 | `artifacts/si-runtime/cli` | `@solution-intelligence/cli` | `wfredricks/solution-intelligence-cli` | **CLI** (has `bin`) |
| 2 | `artifacts/si-runtime/identity` | `@solution-intelligence/identity` | `wfredricks/solution-intelligence-identity` | Library |
| 3 | `artifacts/si-runtime/studio` | `@solution-intelligence/studio` | `wfredricks/solution-intelligence-studio` | Library |
| 4 | `artifacts/si-runtime/window` | `@solution-intelligence/window` | `wfredricks/solution-intelligence-window` | Library |
| 5 | `artifacts/si-runtime/templates` | *(not on npm)* | `wfredricks/solution-intelligence-templates` | **Content repo** (different shape) |

## Method: chainblocks-as-template — but use Stage 1a as the template

Stage 1a's `solution-intelligence-graph-adapter` is the canonical template for the 4 library repos. Copy its file set and `sed`-substitute names. **Don't generate governance from scratch** (Anthropic's content filter will block long boilerplate; this is documented in the chainblocks-build-2 and Stage 1a recovery histories).

Template source: `/Users/williamfredricks/.openclaw/workspace/artifacts/solution-intelligence-graph-adapter/`

Files to copy verbatim (no edits except where noted):

- `LICENSE` — copy as-is
- `SECURITY.md` — `sed` replace `graph-adapter` → `<repo-name>` and `Graph Adapter` → `<Title>`
- `CONTRIBUTING.md` — same `sed` pattern
- `CODE_OF_CONDUCT.md` — copy as-is
- `CHANGELOG.md` — start fresh per repo, with only the `## [0.1.0-pre] — 2026-05-20` section
- `.gitignore` — copy as-is
- `.eslintrc.json` — copy as-is
- `.prettierrc.json` — copy as-is
- `tsconfig.json` — copy as-is
- `tsconfig.eslint.json` — copy as-is
- `tsup.config.ts` — copy as-is (libraries only; `cli` may need a `bin` entry — see below)
- `vitest.config.ts` — copy as-is
- `.github/workflows/ci.yml` — copy as-is

Per-repo tailored files:

- `package.json` — copy and edit: name, description, repository.url, homepage, bugs.url, keywords. Strip `dependencies.polygraph-db` unless the repo actually needs it (none of the 5 do at scaffold stage). Keep `devDependencies` and `scripts` identical.
- `README.md` — write fresh per repo (~50 lines). Sections: title + tagline, eventual role, status (Stage 1b scaffold, v0.1.0-pre, no functional code yet), what to expect (build verified, smoke test passes, CI green), pointers to bookend repo and BUILD-PLAN.md, install (when ready), contributing.
- `src/index.ts` — `export const VERSION = '0.1.0-pre';` with JSDoc identical to the Stage 1a template above (cite `@requirement REQ-SI-NF-052`).
- `tests/smoke.test.ts` — copy the Stage 1a smoke test, substitute the package name in the `describe()` string.

## Repo 1 (special): `cli` needs a bin stub

The Stage 1a template is library-shaped. For `cli` add:

- `package.json`:
  - `"bin": { "si": "dist/cli.js" }`
  - Description: "The Solution Intelligence command-line interface — `si init`, `si add`, `si destroy`. Stage 1b scaffold."
- `src/cli.ts` — a runnable entrypoint:
  ```ts
  #!/usr/bin/env node
  // Why: v0.1.0-pre scaffold for the `si` CLI. The real command tree
  // arrives in Stage 2 (lifecycle, port allocation per REQ-SI-007).
  // This stub exists so the bin wiring is verifiable end-to-end now.
  import { VERSION } from './index.js';
  const arg = process.argv[2];
  if (arg === '--version' || arg === '-v') {
    console.log(VERSION);
    process.exit(0);
  }
  console.log(`si v${VERSION} — Solution Intelligence CLI (scaffold)`);
  console.log('Stage 2 will add: init, add, destroy.');
  process.exit(0);
  ```
- `tsup.config.ts` — extend to build both `src/index.ts` AND `src/cli.ts`. Look at `polygraph-viz/tsup.config.ts` if you need a reference; basic shape:
  ```ts
  import { defineConfig } from 'tsup';
  export default defineConfig({
    entry: ['src/index.ts', 'src/cli.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
  });
  ```
- `tests/smoke.test.ts` — extend the standard smoke test with a `node dist/cli.js --version` execSync assertion:
  ```ts
  import { execSync } from 'node:child_process';
  import { existsSync } from 'node:fs';
  it('cli binary prints version', () => {
    // Only runs after `npm run build` materializes dist/cli.js
    if (!existsSync('dist/cli.js')) return;
    const out = execSync('node dist/cli.js --version').toString().trim();
    expect(out).toBe(VERSION);
  });
  ```
  The `if (!existsSync) return` keeps `npm test` green before `npm run build` (test-only CI step). The CI runs `npm install && npm run build && npm test`, so by test time `dist/cli.js` exists.
- **CI tweak for `cli` only**: update `.github/workflows/ci.yml` to run `npm run build` before `npm test`. Look at the existing ci.yml shape; add the `- run: npm run build` step between install and test.

## Repo 5 (special): `templates` is a content repo

Different shape. NOT an npm package. Build for `templates`:

- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.gitignore` — same governance pattern
- `README.md` — fresh, describes the templates protocol (project skeletons that `si init` clones from). State explicitly: no template content shipped at v0.1.0-pre; content lands in Stage 4.
- `templates/.gitkeep` — placeholder for the eventual template directories
- `package.json` — minimal, NOT `"private": true` because we want it to be a real git repo, but no `"main"`, no `"bin"`, no `"dependencies"`. Include:
  ```json
  {
    "name": "@solution-intelligence/templates",
    "version": "0.1.0-pre",
    "description": "Project skeletons cloned by `si init`. Stage 1b scaffold; content arrives in Stage 4.",
    "private": true,
    "repository": { "type": "git", "url": "https://github.com/wfredricks/solution-intelligence-templates.git" },
    "license": "Apache-2.0",
    "scripts": {
      "test": "echo 'templates is a content repo; no tests at v0.1.0-pre' && exit 0"
    }
  }
  ```
- **NO** `src/`, `tests/`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.eslintrc.json`, `.prettierrc.json` — none apply.
- `.github/workflows/ci.yml` — simplified: just check out the repo and run `npm test` (which is the echo above). Single Node version. No matrix.

## Per-repo README content guidance

Each repo's README opens with the bookend's tagline pattern. Look at `artifacts/solution-intelligence-graph-adapter/README.md` for the exact shape. Headers should be:

1. Title + npm name + version badge (use shields.io URL pattern from graph-adapter README)
2. One-paragraph tagline
3. **Status: Stage 1b scaffold** — explain: this is v0.1.0-pre, no functional code, the real implementation lands in Stage N (see table below). Build + CI green; smoke test passes.
4. Eventual role (1-2 paragraphs per the role table in this brief)
5. Install (`npm install @solution-intelligence/<name>` — show command but note "not yet published to npm; clone the repo or use a git dep")
6. Development (`npm install && npm run build && npm test`)
7. Where this fits in the SI architecture (link to `wfredricks/solution-intelligence` bookend README)
8. Contributing (link to CONTRIBUTING.md)
9. License (Apache-2.0)

For `templates`, sections 3, 5, 6 differ (no build/test, no npm install command).

## Workflow — DO THIS ORDER

For each of the 5 repos (do them one at a time to stay under the chainblocks-size output budget):

1. **Create directory**: `mkdir -p artifacts/si-runtime/<name>`
2. **Copy template**: `cp -r artifacts/solution-intelligence-graph-adapter/<file>` for each non-tailored file
3. **Substitute names** in copied files via `sed -i ''` (macOS):
   ```bash
   for f in SECURITY.md CONTRIBUTING.md README.md package.json; do
     sed -i '' -e 's|graph-adapter|<name>|g' -e 's|Graph Adapter|<Title>|g' \
       -e 's|solution-intelligence-graph-adapter|solution-intelligence-<name>|g' \
       artifacts/si-runtime/<name>/$f
   done
   ```
4. **Write tailored files** per the spec above: package.json (clean rewrite), README.md (fresh content), src/index.ts, tests/smoke.test.ts.
5. **Run gates**:
   - `cd artifacts/si-runtime/<name> && npm install` (will resolve devDependencies)
   - `npm run typecheck` (must be clean)
   - `npm run build` (must produce `dist/`)
   - `npm test` (smoke must pass)
   - `npm run lint` (must be clean)
6. **Git init + push**:
   - `git init && git add -A`
   - Commit message: `"Stage 1b scaffold for @solution-intelligence/<name>"` + body explaining shape
   - `gh repo create wfredricks/solution-intelligence-<name> --public --description "<description from package.json>" --source . --push`
   - Wait for CI to be green: `gh run watch` or poll `gh run list --limit 1`
   - Tag: `git tag -a v0.1.0-pre -m "v0.1.0-pre — Stage 1b scaffold"`
   - Push tag: `git push origin v0.1.0-pre`
   - Create release: `gh release create v0.1.0-pre --title "v0.1.0-pre — Stage 1b scaffold" --notes "Scaffold-only release. No functional code; real implementation arrives in Stage N (see BUILD-PLAN.md in the bookend repo). Build verified, CI green, smoke test passes."`

7. **Verify** all 4 gates:
   - Local: `npm install && npm run build && npm test` green ✅
   - CI: GitHub Actions green on main ✅
   - Public: repo visible at `https://github.com/wfredricks/solution-intelligence-<name>` ✅
   - Release: `v0.1.0-pre` tag + release published ✅

8. **Commit message body convention** for each repo:
   ```
   Stage 1b scaffold for @solution-intelligence/<name>

   Per BUILD-PLAN.md, Stage 1b ships 5 nested runtime repos:
   cli, identity, studio, window, templates. This is <name>.

   Shape: <library | CLI | content repo>
   Eventual role: <one line>

   No functional code at v0.1.0-pre. The real <component> implementation
   lands in Stage <N>. Build verified, smoke test passes, CI green.
   ```

## Final step (after all 5 repos): update the bookend

Edit `artifacts/solution-intelligence/README.md` — add a section listing all 5 Stage 1b repos under a "Constellation" or "Sibling repositories" heading (look for the existing list of Stage 1a repos and extend it).

Commit + push the bookend:
```bash
cd artifacts/solution-intelligence
git add README.md
git commit -m "README: list Stage 1b runtime repos (5 nested)"
git push origin main
```

## Write a FINDINGS file

At the end, write `artifacts/solution-intelligence/build-history/BUILD-STAGE-01B-FINDINGS.md` with:

- TL;DR table of all 5 repos with commit SHAs, release tag, CI status
- Anything that didn't work (recovery notes; what to add to the Stage 1c brief if anything)
- Total elapsed wall-clock time
- Per-repo time breakdown
- Anything Bill should know

## Hard constraints (read carefully)

- **Do NOT generate LICENSE, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md from scratch.** Copy from Stage 1a. Generating boilerplate trips Anthropic's content classifier and produces silent failures. This is the #1 learned lesson from this morning.
- **Do NOT batch all 5 repos in one parallel pass.** Do them one at a time. After each repo's gates are green and the release is published, move to the next. This stays under the per-turn output budget.
- **Do NOT use `/tmp/`** for working files. Everything in the workspace tree.
- **Do NOT skip the CI green verification.** A repo is not done until `gh run list` shows the most recent run as `completed success`. Wait for it.
- **If gh CLI errors with `403`** (rate limit) or anything else, pause and report — don't retry blindly.
- **If npm install fails on a specific repo**, check whether `polygraph-db` got pulled in by mistake (it shouldn't be in deps for any Stage 1b repo). Remove it from package.json and retry.
- **If a content filter blocks output mid-stream**, surface it explicitly — don't silently retry.
- **The npm scope `@solution-intelligence` is unclaimed.** Do not attempt `npm publish` during Stage 1b. Publishing waits for a later stage when there's actual functionality. The scoped name in package.json is forward-looking.

## Time budget

Target: 30-40 minutes wall-clock for all 5 repos + bookend update + FINDINGS. If you exceed 60 minutes total, stop and report.

## Output expected at the end

1. 5 new public GitHub repos in `wfredricks/`, all with `v0.1.0-pre` tag + release, all CI green.
2. Updated bookend README with the 5 new repos listed.
3. `build-history/BUILD-STAGE-01B-FINDINGS.md` written.
4. A final 8-line status summary to Bill.

Good luck. The chainblocks-as-template recipe is the load-bearing pattern here. Copy don't generate.
