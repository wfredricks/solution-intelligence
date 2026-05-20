# Solution Intelligence 🖇️

**A methodology, a runtime, and a substrate for understanding solutions you can't see all at once.**

Solution Intelligence (SI) is a framework for turning the messy reality of an existing system — code, documents, transactions, MoUs, policies, tribal knowledge — into a **Solution Intelligence Graph (SIG)** that auditable analysts can read and that survives the era it was built in. It is methodology-grade engineering for the AI-augmented systems-analysis era.

This repository holds the **left bookend** of the SI v0.1 build: the design corpus (STORY, REQUIREMENTS, MODEL, OVERVIEW, USE-CASES, FEATURES, PIPELINE), the bookend SIG that validates the design before code is written, and the planning + sub-agent specifications for the right bookend (the actual implementation in Stages 1-7).

> **Status:** Pre-implementation. The design corpus and the bookend SIG are stable. Stages 1a and 1b of the implementation have shipped as eight sibling repos in `wfredricks/` (three flat substrate libraries + five nested runtime repos, see below). Stages 2 through 7 are in progress.

---

## Read this first

Two short documents will tell you what SI is:

- **[STORY.md](./STORY.md)** — SI as story. Why this methodology exists, what kind of artifact a SIG is, and the doctrine commitments that govern any SI engagement.
- **[docs/OVERVIEW.md](./docs/OVERVIEW.md)** — SI as structured reference. The architecture, the four components (SI/S Studio, SI/G Graph, SI/W Window, SI/I Identity), the deliverable suite, the role permission matrix.

If you want the deep technical surface:

- **[REQUIREMENTS.md](./REQUIREMENTS.md)** — 111 requirements (REQ-SI-001 through REQ-SI-115, plus the REQ-SI-NF-001..054 non-functional set).
- **[MODEL.md](./MODEL.md)** — the data model. Tier-1 / Tier-2 / Tier-3 schema, edge types, the `.sigdsl` contract, audit block kinds.
- **[docs/USE-CASES.md](./docs/USE-CASES.md)** — 12 happy-path use cases + 6 alternative-flow use cases.
- **[docs/FEATURES.md](./docs/FEATURES.md)** — 16 features that satisfy the requirements.
- **[BUILD-PLAN.md](./BUILD-PLAN.md)** — the 7-stage decomposition for the v0.1 build.

---

## The Foundation Seed pattern

The methodology has its own self-application: a SI project begins by writing **seven design documents** (STORY, REQUIREMENTS, MODEL, PIPELINE, USE-CASES, FEATURES, OVERVIEW), then ingesting those seven documents into a **bookend SIG** that validates the design *before any code is written*. This bookend SIG is the project's first concrete consumer of its own three-tier schema.

This repo is the canonical example of the pattern. The bookend SIG at [`sig/`](./sig/) ingests the seven documents above and surfaced real, hidden defects in the design (cross-wired feature/requirement matrix entries, undeclared schema labels) that no prose review had caught.

Read more in [`knowledge/papers/FOUNDATION-SEED.md`](https://github.com/wfredricks/solution-intelligence/blob/main/docs/STORY.md) (cross-referenced in STORY §V).

---

## The Solution Intelligence Graph (SIG)

A SIG is a graph-shaped, audit-attached, substrate-independent description of a solution. Its schema lives in three tiers:

| Tier | Scope | Examples |
|------|-------|----------|
| **Tier 1** | Solution-universal (timeless across all solutions) | `constraint`, `intended_behavior`, `evidence`, `finding`, `risk_item` |
| **Tier 2** | Solution-domain (timeless within a domain) | `ba.process`, `ba.role`, `sw.function`, `sw.repo`, `sw.feature` |
| **Tier 3** | Implementation-paradigm (era-bound, namespaced) | `cs_2026.source_file`, `cs_2026.endpoint`, `cs_2026.class` |

A SIG built today should still be useful in the 2050s: the implementation paradigm turns over every 15-20 years; the solution-universal and solution-domain layers don't. See MODEL.md §2.1.

---

## v0.1 architecture at a glance

```
   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
   │   SI/I        │    │   SI/S        │    │   SI/G        │    │   SI/W        │
   │  Identity     │    │  Studio       │    │  Graph        │    │  Window       │
   │  (bangauth)   │◄──►│  (BB +        │◄──►│  (PolyGraph)  │◄──►│  (consumer    │
   │               │    │   parsers +   │    │               │    │   UI, role-   │
   │ 5-role matrix │    │   analysts)   │    │ 3-tier schema │    │  scoped)      │
   └───────────────┘    └───────────────┘    └───────────────┘    └───────────────┘
                              ▲                      ▲
                              │                      │
                              └──────┐         ┌─────┘
                                     ▼         ▼
                                ┌─────────────────────┐
                                │   chainblocks       │
                                │  audit ledger       │
                                │ (every state change │
                                │  ends at a userId)  │
                                └─────────────────────┘
```

Four services per project, isolated by Docker compose stack. Every state-changing operation produces a chainblocks audit block attributed to a logged-in operator.

---

## Sibling repositories

The Stage 1a + 1b output — eight repositories in the `wfredricks/` namespace — are listed below. Stage 1a (three flat sibling repos) shipped the standalone-publishable libraries that SI builds atop. Stage 1b (five nested runtime repos, living under `artifacts/si-runtime/` in the bookend's workspace) scaffolds the SI-internal runtime surface.

### Stage 1a — substrate libraries (flat siblings)

| Repo | Purpose | Stage filled |
|------|---------|--------------|
| **[`solution-intelligence-graph-adapter`](https://github.com/wfredricks/solution-intelligence-graph-adapter)** | SI/G — PolyGraph adapter, GraphLoader (sole writer), three-tier-schema enforcement, DSL validator, chainblocks audit integration. | Stage 3 |
| **[`solution-intelligence-parsers`](https://github.com/wfredricks/solution-intelligence-parsers)** | Parser library: `markdown-intent`, `csharp-treesitter` stub, future PDF / log / SQL parsers. Defines the portable Parser interface. | Stage 4 |
| **[`solution-intelligence-analysts`](https://github.com/wfredricks/solution-intelligence-analysts)** | Analyst library: Inventory, DependencyAtlas, IntentVsReality, ConstraintCoverage, RiskSurface. Defines the portable Analyst interface. | Stage 5 |

### Stage 1b — runtime surface (nested under `artifacts/si-runtime/`)

All five live in the same `wfredricks/` namespace and were tagged `v0.1.0-pre` on 2026-05-20:

| Repo | Purpose | Stage filled |
|------|---------|--------------|
| **[`solution-intelligence-cli`](https://github.com/wfredricks/solution-intelligence-cli)** | SI/CLI — operator entrypoint: `si init`, `si add`, `si destroy`. Port allocation per REQ-SI-007, four-service Docker stack provisioning. | Stage 2 |
| **[`solution-intelligence-identity`](https://github.com/wfredricks/solution-intelligence-identity)** | SI/I — bangauth wrapper enforcing SI's 5-role permission matrix (operator, analyst, reviewer, consumer, admin). | Stage 6 |
| **[`solution-intelligence-studio`](https://github.com/wfredricks/solution-intelligence-studio)** | SI/S — Studio: Blackboard substrate, parser host, analyst host, deliverable generator host. | Stage 5 |
| **[`solution-intelligence-window`](https://github.com/wfredricks/solution-intelligence-window)** | SI/W — Window: consumer-facing, role-scoped, read-only views over a SIG. | Stage 6 |
| **[`solution-intelligence-templates`](https://github.com/wfredricks/solution-intelligence-templates)** | Project skeletons cloned by `si init`. Content repo, not an npm package. | Stage 4 |

---

## Substrate ecosystem

SI builds atop these other public libraries:

- **[PolyGraph](https://github.com/wfredricks/polygraph)** — embeddable graph database (the SI/G backend)
- **[PolyGraph-Viz](https://github.com/wfredricks/polygraph-viz)** — D3-powered browser visualizer for any PolyGraph database
- **[chainblocks](https://github.com/wfredricks/chainblocks)** — immutable hash-chained audit ledger
- **[BangAuth](https://github.com/wfredricks/bangauth)** — embeddable identity provider (the SI/I backend)

All four are Apache-2.0 and ship as TypeScript/ESM packages.

---

## How the SIG sees itself

Solution Intelligence eats its own dog food: the project's own implementation lives inside a *build SIG* (at [`sig-build/`](./sig-build/)) that uses the three-tier schema applied to SI itself as a software solution.

When fully loaded, the build SIG models:

- Every requirement as a Tier-1 `intended_behavior` node
- Every feature as a Tier-2 `sw.feature` node, with `IMPLEMENTS` edges to REQs
- Every use case as a Tier-2 `sw.use_case` node, with `EXERCISES` edges to REQs
- Every repo as a Tier-2 `sw.repo` node, with `DEPENDS_ON` edges between them
- Every build stage as a Tier-2 `sw.stage` node, with `PRODUCES` and `STAGE_BUILDS` edges
- Feature-to-feature `DEPENDS_ON` edges that produce a clean 9-wave topological build order

Read it interactively with `polygraph-viz` pointed at the build SIG's data directory.

---

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Provenance

This repository was assembled 2026-05-18 through 2026-05-20 as the canonical example of the Foundation Seed pattern. The full build narrative lives in [`build-history/`](./build-history/).

🖇️ Solution Intelligence is part of a constellation of libraries that work better together than apart, the same way paperclips link.
