# Solution Intelligence — Build Plan (v0.1)

*The right-bookend planning document. Defines what comes after the Foundation Seed and how SI v0.1 actually gets built. Companion to `STORY.md`, `REQUIREMENTS.md`, `MODEL.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`, `docs/OVERVIEW.md`, and the `sig/` validation graph.*

**Status:** 2026-05-19, pre-build. The Foundation Seed (left bookend + SIG) is complete and self-consistent. The first build stage has not been spawned.

---

## What this document is

`BUILD-PLAN.md` is the *plan*. It defines:

1. The build's overall shape — what we are committing to produce in v0.1.
2. The decomposition into build stages — because SI is too big for a single sub-agent.
3. The order and dependencies between stages.
4. The non-negotiable rules every build stage inherits.
5. The exit gates — what "done" means for v0.1.
6. The right-bookend artifacts each stage produces.

Each individual build stage will have its own `BUILD-STAGE-NN-SPEC.md` and `BUILD-STAGE-NN-CONFIG.md` files when it is spawned. This plan is the parent.

---

## The non-negotiable rules

These apply to every build stage. They are the inheritance from the Foundation Seed and the lessons learned across prior projects.

### Rule 1: Do not modify the bookend

**Never modify any of:**
- `STORY.md`, `REQUIREMENTS.md`, `MODEL.md`
- `docs/PIPELINE.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`, `docs/OVERVIEW.md`
- Anything under `sig/`
- Anything in this `BUILD-PLAN.md` or its child `BUILD-STAGE-NN-*.md` files

If a build stage finds a defect in any of the above, it must:
1. **Stop.**
2. Append to `BUILD-FINDINGS.md` with file, line, defect, suggested fix, and whether it blocks.
3. Continue only with what can be built unambiguously.
4. Surface the finding in the stage's final report.

The bookend is the contract. Code conforms to it, not the other way around. Reasoning: in February 2026 a sub-agent silently edited a v0.3 spec to match the code it had built. The spec was lost for two weeks. We do not repeat this.

### Rule 2: Verify by running, not by reading

A build stage's "completion" is verified by running the produced artifacts, not by inspecting the produced files. Specifically:

- Tests pass on a clean checkout via `npm test` (or stage-equivalent).
- Coverage thresholds met (≥80% lines, branches, functions, statements per REQ-SI-NF-051).
- Lint and typecheck pass.
- JSDoc coverage ≥90% on exported symbols (REQ-SI-NF-052).
- For services: the container builds and starts, the health endpoint returns success, the documented endpoints respond to a smoke request.
- For the CLI: each declared subcommand returns a help text with exit code 0; smoke-test invocations succeed.
- For the SIG: the project's own bookend ingests cleanly with zero warnings *and* every artifact the stage produced is queryable via the SIG.

Status reports that substitute for actual work are a failure mode we have hit before. Verify by running.

### Rule 3: Surface failures immediately

If a build stage hits content-filter blocks, runtime errors, tool timeouts, model refusals, or any class of silent failure, it surfaces the failure to the orchestrator within the same turn. No silent retries. No "I'll just try again" without first telling the orchestrator what failed and what's being attempted next.

### Rule 4: Open-source-grade quality from day one

Every stage's output passes the `knowledge/playbooks/github-published-projects.md` bar:
- ESM-first TypeScript, `tsup` build, `vitest` test runner
- Governance trio: README, SECURITY, CONTRIBUTING
- CHANGELOG follows Keep-a-Changelog
- CI quality gates on every push (tests + coverage + lint + typecheck)
- License declared (Apache 2.0)
- `// Why:` comment standard on non-obvious code blocks

This is what makes the project credible whether shipped internally or open-sourced. The bar is set once; every stage inherits it.

### Rule 5: Substrate-independence in the schema

Every stage that produces nodes or edges in SI/G must honor the three-tier schema declared in `MODEL.md` §2.1:
- Tier 1 labels: bare lowercase (e.g. `constraint`).
- Tier 2 labels: `<domain>.<label>` (e.g. `ba.process`).
- Tier 3 labels: `cs_<era>.<label>` (e.g. `cs_2026.function`).

A stage that needs a new label proposes it in `BUILD-FINDINGS.md`; it does not silently introduce one.

### Rule 6: Person-attributed audit on every state change

Every action that mutates SI/G or the BB substrate must produce a chainblocks audit event with `actor.userId`. No anonymous actions. No "the system did X." Every action ends at a named person. This is doctrine commitment §4; it is enforced by tests, not by convention.

---

## The overall shape of v0.1

What we are committing to produce, end to end, in v0.1:

A working `si init` → `si up` → `si ingest` → `si analyze` → `si report` → `si verify` → `si destroy` cycle, against the `prose-doc` smoke-test template, on a developer laptop running Docker. Specifically:

- **One template ready:** `prose-doc` (re-instantiates the chainblocks bookend bundle through SI; the smallest possible real engagement; proves the framework handles small/easy cases end to end).
- **One template stubbed:** `csharp-to-servicenow` (the DLA Stores engagement target; full implementation deferred to v0.2 but the template manifest and parser stubs exist).
- **Four services running** as a per-project Docker compose stack: SI/I (Identity, bangauth backend), SI/S (Studio with BB substrate + dev UI + GraphLoader + GraphReader), SI/G (PolyGraph), SI/W (Window with role-scoped views).
- **CLI with all 14 commands:** `init`, `up`, `down`, `destroy`, `ingest`, `inputs`, `analyze`, `report`, `export-graph`, `import-graph`, `grant`, `revoke`, `verify`, `status` + `login`.
- **Parser registry with two parsers:** `markdown-intent` (for the prose-doc template) and `csharp-treesitter` stub (declared but not feature-complete; produces an audit event noting deferred implementation).
- **Analyst suite stubbed:** `Inventory`, `DependencyAtlas`, `IntentVsReality`, `ConstraintCoverage`, `RiskSurface`. v0.1 implementations may be skeletal but each runs end to end on the prose-doc template and emits findings.
- **chainblocks audit integration:** Every significant event produces a block; `si verify` runs `chainblocks-verify` and exits 0/1/2 cleanly.
- **Output bucket as git-initialized tree:** `si report` produces the standard deliverable suite into `outputs/`, committed automatically.
- **Documentation, CI, governance trio, license:** All present and CI-gated.

**Out of scope for v0.1** (per `docs/OVERVIEW.md` §"Out of scope"):
- The full multi-template library (COBOL, Java, transaction analysis) — v0.2
- Fully-automated executive briefing generator — v0.2
- OIDC adapter beyond a generic stub — v0.2
- Open-source release — v0.2 (after internal proving)
- Extraction of the Blackboard as a standalone library — v0.3

---

## The build stages

SI v0.1 is too big for a single sub-agent. It is decomposed into seven stages, each with a clear input contract and a clear exit gate. Stages 1 through 5 are sequential (each depends on the prior); stages 6 and 7 are integration and polish over what 1-5 produced.

| Stage | What it builds | Depends on | Est size |
|------:|----------------|------------|---------:|
| 1 | **Foundations** — repo skeleton, tooling (tsup/vitest/eslint), CI config, governance trio, license, package layout for monorepo workspaces (`@solution-intelligence/cli`, `@solution-intelligence/studio`, `@solution-intelligence/window`, `@solution-intelligence/identity`, `@solution-intelligence/graph-adapter`). | Foundation Seed | M |
| 2 | **SI/I + the CLI auth flow** — bangauth-based Identity service, `si login`, token caching, role-grant model, `si grant`/`si revoke` commands wired end to end with chainblocks audit. | Stage 1 | L |
| 3 | **SI/G + GraphLoader + DSL** — PolyGraph adapter for SI/G, the three-tier schema enforcement, GraphLoader as sole writer, the `.sigdsl` JSONL format with header line and validation, deterministic replay test. | Stage 1 | L |
| 4 | **SI/S Studio + BB substrate + parser registry + first parser** — Studio service running, BB substrate as event-driven workshop, parser invocation pipeline, `markdown-intent` parser working end to end on the chainblocks bookend bundle. | Stage 3 | XL |
| 5 | **Analyst suite + GraphReader + output bucket** — five analysts (skeletal acceptable), GraphReader as sole producer of deliverables, git-initialized output tree, deliverable HTML/MD/PDF generation, `si report`. | Stage 4 | XL |
| 6 | **SI/W Window** — read-mostly consumer UI, three view modes (Reviewer/Customer/Operator), role-scoped views enforced at the API boundary (not just hidden in the UI), interactive deliverable views with click-through citations. | Stages 2+3+5 | L |
| 7 | **Integration, smoke tests, polish** — full lifecycle smoke test against the `prose-doc` template, all 14 CLI commands authenticate-and-act, full SIG re-ingest against the SI bookend AND the chainblocks-via-prose-doc output, BUILD-REPORT.md, CHANGELOG, README expansion. | All prior | M |

Sizing notation: S ≈ 1-2 hours, M ≈ 3-5 hours, L ≈ 6-10 hours, XL ≈ 12-20 hours of sub-agent runtime against a focused brief.

Realistic total: **roughly 60-90 hours of sub-agent runtime across 7 stages.** Distributed over 2-3 weeks of clock time with appropriate orchestrator review between stages, this is achievable. Compressed into days, it is not — and the failure modes when sub-agents are rushed are exactly the silent-failure modes we have learned to detect.

### What goes wrong if we try to spawn this as one sub-agent

The chainblocks v0.1 build was a single sub-agent that produced a library with 11 source files, 153 tests, and full CI in ~90 minutes. The SI v0.1 build is approximately 10-20x larger by surface area. A single sub-agent against SI v0.1 would:

- Lose coherence mid-build (context exhaustion).
- Silently skip or stub features without surfacing the skip.
- Produce a "complete" status report that doesn't match the disk state (we hit this on `chainblocks_v01_complete`).
- Fail to honor the bookend in subtle ways the orchestrator cannot catch without re-reading thousands of lines of generated code.

Decomposition into stages preserves the property we want: each stage is *roughly chainblocks-sized*, has a clear input contract, and produces verifiable output. The orchestrator reviews between stages. Re-spawns are cheap.

---

## Per-stage exit gates

Each stage must satisfy its exit gate before the next stage can begin. The gates are objective and verifiable.

### Stage 1 exit gate (Foundations)

- `pnpm install` (or `npm install`) succeeds against the workspace root.
- `npm test` passes against a smoke test that asserts the package layout matches the manifest (no real product code yet).
- `npm run lint` and `npm run typecheck` pass.
- `.github/workflows/ci.yml` runs and passes on first GitHub push.
- `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md` all present.
- Workspace packages are declared and importable from each other.

### Stage 2 exit gate (Identity + auth)

- `si login` succeeds against a local bangauth instance.
- Token caching to `~/.si/credentials` works; subsequent CLI commands pass the token.
- `si grant <project> <user> <role>` and `si revoke` produce `si.role.granted` / `si.role.revoked` chainblocks events with `actor.userId`.
- The 5-role permission matrix from `MODEL.md` §6.3 is enforced at the SI/I `/resolve` endpoint and verified by tests.
- Auth-failure logging satisfies REQ-SI-077 (sufficient debug detail, no secret leaks).

### Stage 3 exit gate (Graph + GraphLoader + DSL)

- A `.sigdsl` file with the header line and a mix of NodeProposal / EdgeProposal / Conflict records validates against the schema (`docs/DSL-SCHEMA.md` + companion `.schema.json`).
- GraphLoader rejects invalid DSL with a specific line-number error.
- GraphLoader writes to PolyGraph; every promotion produces an `si.bb.proposal.promoted` block with `actor.userId`.
- The three-tier schema is enforceable: a Tier-1 `constraint` node, a Tier-2 `ba.process` node, and a Tier-3 `cs_2026.function` node all promote cleanly with appropriate edges between them.
- Deterministic replay test: re-running GraphLoader against the saved DSL produces a byte-identical graph state.
- `si export-graph` and `si import-graph` round-trip cleanly.

### Stage 4 exit gate (Studio + BB substrate + first parser)

- Studio container starts and exposes its dev UI at the allocated host port.
- BB substrate is durable across Studio restart (REQ-SI-034).
- Two operators connected concurrently see consistent BB state within the latency budget (REQ-SI-NF-060).
- `markdown-intent` parser successfully ingests the chainblocks bookend bundle (5 markdown files), emits a valid `.sigdsl` stream, and produces a populated SI/G with the appropriate Tier-1, Tier-2, and Tier-3 nodes.
- Conflicts and rejected proposals surface in BB substrate state and are visible in the dev UI.

### Stage 5 exit gate (Analysts + GraphReader + output)

- All five v0.1 analysts run against the populated graph from Stage 4 and produce findings without crashing.
- GraphReader produces the standard deliverable suite into `outputs/` as a git-initialized tree.
- Re-running `si report` against an unchanged graph produces byte-identical output (modulo timestamps).
- The output tree has a commit per `si report` invocation with the chainblocks ledger seq range covered.

### Stage 6 exit gate (Window)

- Window container starts and serves the consumer UI at the allocated host port.
- The three view modes (Owner/Operator/Analyst, Reviewer, Customer) render the appropriate role-scoped subsets.
- API-level enforcement: a Customer-token request to a `/bb/*` route returns 403; the test for UC-16 passes.
- All seven deliverable types are renderable in Window (even if some are placeholder content for v0.1).

### Stage 7 exit gate (Integration + polish)

- Full lifecycle smoke test passes end to end: `si init` → `si grant` → `si ingest` → `si analyze` → `si report` → `si verify` → `si destroy` on the `prose-doc` template against the chainblocks bookend.
- `si verify` exits 0 against the project's audit ledger.
- The SI bookend SIG re-ingests cleanly with zero warnings.
- `BUILD-REPORT.md` produced; manual-test checklist completed; CHANGELOG updated.
- First GitHub push: CI green.

---

## Right-bookend artifacts (what each stage produces)

By analogy with the chainblocks right bookend, each stage produces:

- `BUILD-STAGE-NN-SPEC.md` (input contract — written before the stage starts)
- `BUILD-STAGE-NN-CONFIG.md` (tooling configuration, version locks, sub-agent instructions)
- The code itself, in the appropriate workspace package
- Updates to relevant `CHANGELOG.md` entries
- `BUILD-STAGE-NN-REPORT.md` (what was produced; what was verified; manual-test results)
- `BUILD-STAGE-NN-FINDINGS.md` (any spec defects encountered; recommended fixes)

Stage 7 also produces:
- A consolidated `BUILD-REPORT.md` for the whole v0.1 release
- The expanded `README.md` (replacing the placeholder)
- The first `CHANGELOG.md` entry under `## [0.1.0]`

After stage 7 completes its exit gate, v0.1.0 is tagged. The right bookend is complete.

---

## Open questions for tomorrow morning

Decisions to make before Stage 1 spawns:

1. **Monorepo or polyrepo?** Stage 1 currently assumes a monorepo with workspace packages. Alternative: each component as its own repo. The monorepo is easier for v0.1 (cross-package refactors don't require coordination); the polyrepo is closer to the eventual published shape. Lean: monorepo for v0.1, split if it bothers us.

2. **PolyGraph or Neo4j default?** `MODEL.md` §2 says PolyGraph for v0.1 with Neo4j as optional. Stage 3 needs to commit to one. Lean: PolyGraph default; Neo4j adapter as a smaller follow-on if the first real engagement demands it.

3. **Which template first — `prose-doc` or `csharp-to-servicenow`?** The build plan above prefers `prose-doc` as the smoke-test target because it can ingest the chainblocks bookend (a corpus we already understand). `csharp-to-servicenow` is the real-customer target but requires a Roslyn-backed parser which is itself a project. Lean: `prose-doc` for v0.1; stub `csharp-to-servicenow` template manifest; full implementation in v0.2.

4. **Sub-agent runtime hosting.** chainblocks ran on the Mac mini directly. Stages 4-6 will exceed practical Mac-mini runtimes; consider Graviton or another build host. Lean: stages 1-3 on Mac mini; reassess for stages 4-7.

5. **Spawn cadence.** Stage 1 next morning. Subsequent stages after orchestrator review (likely 1-3 days apart). Total clock-time: 2-3 weeks.

These do not need to be resolved before Stage 1 starts — only Q1 (monorepo) and Q3 (template choice) affect Stage 1 directly.

---

## Provenance

This build plan was drafted on 2026-05-19 immediately after the Solution Intelligence Foundation Seed was completed and SIG-validated. It is informed by:

- The chainblocks v0.1 build experience (one sub-agent, ~90 minutes runtime, produced a working library with CI green on first push — but is roughly 1/15th the surface area of SI v0.1).
- The lessons logged in `knowledge/playbooks/sub-agent-build-cycle.md`.
- The Foundation Seed pattern itself, distilled in `knowledge/papers/FOUNDATION-SEED.md` on the same day.

This is a *plan*, not a sub-agent brief. The plan describes the staging and the rules; each stage gets its own brief at spawn time, with the specific files-to-touch, the exit gate from the prior stage as input, and the exit gate this stage must satisfy as output.

Stage 1 spawn is targeted for the morning of 2026-05-20.

---

*BUILD-PLAN.md v0.1 — Solution Intelligence. The right-bookend planning document. Companion to the seven Foundation Seed documents and the SIG.*
