# FEATURES.md — Solution Intelligence

*The bridge between use cases (`docs/USE-CASES.md`) and requirements (`REQUIREMENTS.md`). Each feature is a named bundle of capability that exists to satisfy one or more use cases, and is realized by one or more requirements.*

A feature is what we **build**; a requirement is what we **promise**; a use case is what a person **needs**.

---

## Feature → Requirement → Use Case Matrix

| Feature | REQs satisfied | UCs exercised |
|---------|----------------|---------------|
| **FT-SI-01: Project lifecycle (init / up / down / destroy)** | REQ-SI-001 to 006, 080, 082 | UC-1 |
| **FT-SI-02: Input ingestion + epistemic classification** | REQ-SI-010 to 015 | UC-2, UC-9 |
| **FT-SI-03: Parser registry + .sigdsl emission** | REQ-SI-020 to 023, 110 to 115 | UC-2, UC-5 |
| **FT-SI-04: Studio BB substrate (proposals + conflicts)** | REQ-SI-030 to 034 | UC-2, UC-3, UC-11 |
| **FT-SI-05: GraphLoader (sole writer to SI/G)** | REQ-SI-025, 030 to 034, 060 to 063 | UC-2, UC-3, UC-6 |
| **FT-SI-06: Analyst suite (Inventory / DepAtlas / Intent-vs-Reality / Constraint Coverage / Risk / Modernization)** | REQ-SI-040 to 045 | UC-3, UC-4, UC-5, UC-6, UC-7, UC-8, UC-10 |
| **FT-SI-07: GraphReader + standard deliverable suite** | REQ-SI-027, 050 to 053, 100 to 103 | UC-4, UC-5, UC-6, UC-7, UC-8, UC-10 |
| **FT-SI-08: SI/G (durable graph, portable export/import)** | REQ-SI-060 to 064 | UC-5, UC-10, UC-12 |
| **FT-SI-09: SI/W consumer window (role-scoped views)** | REQ-SI-066 to 068 | UC-3, UC-6, UC-7, UC-11, UC-12 |
| **FT-SI-10: Identity (SI/I) + 5-role permission matrix** | REQ-SI-070 to 077 | UC-1, UC-3, UC-7, UC-9, UC-11, UC-12 |
| **FT-SI-11: `si` CLI (full v0.1 surface)** | REQ-SI-080 to 084 | UC-1, UC-2, UC-3, UC-4, UC-9, UC-11, UC-12 |
| **FT-SI-12: chainblocks audit integration (17 block kinds, user-attributed)** | REQ-SI-090 to 093 | UC-1, UC-2, UC-3, UC-11, UC-12 |
| **FT-SI-13: Output bucket as git-initialized tree** | REQ-SI-100, 104 to 106 | UC-4, UC-5, UC-7, UC-10 |
| **FT-SI-14: DSL versioning + deterministic replay** | REQ-SI-110 to 115 | UC-2, UC-12 |
| **FT-SI-15: Compose stack + port allocation + network isolation** | REQ-SI-001 to 006, NF-010 to NF-012 | UC-1, UC-11 |
| **FT-SI-16: Project-wide quality bar (CI gates, docs, license, README)** | REQ-SI-NF-050 to NF-056 | (all UCs implicitly) |

Every numbered requirement in `REQUIREMENTS.md` maps to at least one feature; every feature traces to at least one use case.

---

## Feature Detail

### FT-SI-01: Project lifecycle

`si init`, `si up`, `si down`, `si destroy`, `si status` form the lifecycle skeleton. `si init` resolves a template manifest (§4 of MODEL.md), allocates host ports through `~/.si/ports.json`, writes the project tree under `projects/<project>/`, seals a chainblocks genesis block in `audit.ledger`, and grants the invoking user the Owner role. `si up` / `si down` are thin wrappers around `docker compose up` / `down` for the project's stack. `si destroy` archives the audit ledger to a configurable location, tears down containers, removes data volumes, and releases ports.

`si status` returns running state of each of the four services (Studio / Graph / Window / Identity), node/edge counts in SI/G, ledger seq count, and any open BB conflicts.

This is the only feature where a user interacts before authentication exists: `si init` is the moment that creates the first Owner. Every subsequent command requires `si login` first.

### FT-SI-02: Input ingestion + epistemic classification

`si ingest <project> --path <dir-or-file>` walks the input set, hashes each artifact, classifies it (parser-match or default-map), records it as an `InputArtifact` node with `epistemicClass`, and queues it for parser invocation. Unclassified inputs surface in the BB substrate for operator decision, never silently dropped.

The doctrinal anchor (six epistemic classes — ground-truth, aspirational-intent, constraint, evidence, tribal-knowledge, reference-pattern, plus analyst-output) is enforced here: every InputArtifact gets exactly one class, and the class drives downstream promotion policy in FT-SI-05.

### FT-SI-03: Parser registry + .sigdsl emission

A parser is a process invoked with `(inputArtifact, config)` that writes a `.sigdsl` stream to stdout (or a declared path). The template manifest declares the parser registry. Each parser's responsibility ends at emitting valid `.sigdsl`; it never touches SI/G. Parsers may be Tree-sitter wrappers, ANTLR, custom Python/Node scripts, or LLM-driven extractors — invocation is uniform.

`.sigdsl` is the typed JSONL format declared in MODEL.md §1: header line, NodeProposal / EdgeProposal / Conflict records, validation rules. Schema versioning via `// sigdsl/v1` header guarantees forward compatibility within v0.x.

### FT-SI-04: Studio BB substrate

The Blackboard is the substrate **inside Studio**: an event-driven, sub-agent-friendly workshop where proposals are posted, conflicts surface, operators arbitrate, and promotions get queued. The BB substrate is in-Studio state (not a separate service); promoted state flows to SI/G via GraphLoader. Conflicts visible in Window for any role at or above Analyst.

The BB substrate is the harvestable kernel that future `@blackboard/core` will be extracted from — but only after it has been proven through use in SI (per STORY.md doctrine §"What we will not build" — no speculative library).

### FT-SI-05: GraphLoader

GraphLoader is the **sole writer to SI/G.** It consumes `.sigdsl` streams (from parsers) and BB substrate state (from analysts and operators), validates against MODEL.md §1.6 and §2.4 invariants, applies the promotion policy in §2.4 (auto-promote vs operator-review by class), and writes to the graph backend. Every promotion or rejection emits a `si.bb.proposal.posted` and (on acceptance) a `si.bb.proposal.promoted` chainblocks event with `actor.userId`.

The single-writer constraint is doctrinal: it is what makes the audit trail meaningful. If anything else wrote to SI/G, the chainblocks ledger would be a partial view.

### FT-SI-06: Analyst suite

The v0.1 analyst set:

| Analyst | Produces | Typical class consumed |
|---------|----------|------------------------|
| `Inventory` | `Inventory` nodes | ground-truth |
| `DependencyAtlas` | `Finding` nodes of kind `dependency-edge` | ground-truth |
| `IntentVsReality` | `DRIFTS_FROM` edges, `Finding` nodes | aspirational-intent ∩ ground-truth |
| `ConstraintCoverage` | `SATISFIES`/`MAY_VIOLATE` edges, `RiskItem` for uncovered constraints | constraint ∩ ground-truth |
| `RiskSurface` | `RiskItem` nodes | ground-truth ∪ evidence |
| `ModernizationRoadmap` | `Finding` nodes of kind `migration-phase` | meta-analyst (consumes other findings) |

Each analyst declares its `trigger` (`post-ingest`, `manual`, `scheduled`) and `promotionPolicy` (`auto` or `operator-review`) in the template manifest. Findings carry full provenance (which analyst, what version, what subgraph it consumed).

### FT-SI-07: GraphReader + standard deliverable suite

GraphReader is the **sole producer of deliverables** in the output bucket. Symmetric to GraphLoader: GraphLoader is the only writer to SI/G; GraphReader is the only producer of `outputs/`. Single bottlenecks for auditability.

The deliverable suite is templated: each report (Inventory, Dependency Atlas, Intent-vs-Reality, Constraint Coverage, Risk Surface, Tribal Annotation Layer, Modernization Roadmap, Executive Briefing, Pattern Classification, API Endpoint, Audit Trail) has a declared transformation from SI/G state to HTML + Markdown + PDF. Reports cite their source nodes and edges (clickable in HTML).

### FT-SI-08: SI/G (durable graph)

SI/G is backed by PolyGraph (default for v0.1) or Neo4j (optional, declared in template manifest). Both backends must satisfy MODEL.md §2 (labels, edge types, common props, invariants).

`si export-graph` produces a portable JSONL export: nodes file, edges file, schema declaration, version stamp. `si import-graph` consumes the same. The export is the **durable customer artifact**; even if Studio and Window are deprecated five years from now, the graph remains readable.

### FT-SI-09: SI/W consumer window

Window is the read-mostly consumer UI. Three view modes:

- **Reviewer view** — full graph access, audit-trail browse, comments on findings
- **Customer view** — curated deliverable subset; no raw BB state, no operator interventions
- **Operator view** — full read-write, including BB substrate (this is conceptually a Window-Studio hybrid; in v0.1 Operators use Studio for write access and Window for consumer-grade reading)

Role-based view scoping is enforced at the API boundary, not just hidden in the UI (REQ-SI-077 + MODEL.md §6.3). A Customer cannot URL-hack their way to BB substrate state; the API would refuse.

### FT-SI-10: Identity (SI/I) + 5-role permission matrix

SI/I is the per-project identity service. Two adapters in v0.1: bangauth (passwordless email/code, default for dev/internal use) and OIDC (Auth0, Okta, Azure AD — declared in template manifest for enterprise/government deployments).

The 5-role permission matrix (Owner / Operator / Analyst / Reviewer / Customer) in MODEL.md §6.3 is the canonical declaration for REQ-SI-074. Per-project role grants; a user may be Owner on `dla-stores` and Reviewer on `piee-cor`. Grants and revocations are append-only records (revocation = new record marking `revoked: true`) and produce `si.role.granted` / `si.role.revoked` chainblocks events.

Every authenticated request resolves `(userId, effectiveRoles)` through SI/I and propagates `userId` into the chainblocks audit event for any action taken.

### FT-SI-11: `si` CLI

14 commands at v0.1: `init`, `up`, `down`, `destroy`, `ingest`, `inputs`, `analyze`, `report`, `export-graph`, `import-graph`, `grant`, `revoke`, `verify`, `status` — plus `login` and `shell` as cross-cutting auth + interactive query.

The CLI is the **primary surface for v0.1**; Studio and Window are the web UIs. Templates may add custom CLI subcommands but the 14 above are guaranteed.

`si verify <project>` runs `chainblocks-verify` against the project ledger and exits 0/1/2 (clean / tampered / operational error).

### FT-SI-12: chainblocks audit integration

SI consumes chainblocks as a library. The 17 declared block kinds in MODEL.md §3.2 cover the project lifecycle, ingestion, parsing, BB activity, analyst runs, finding overrides, role grants/revocations, and exports/imports.

Every block carries `actor.userId` (REQ-SI-076), making the audit trail person-attributed, not "the system did X." This is what makes the audit defensible across years (UC-12).

Audit completeness is invariant 6 in MODEL.md §2.4: every state-changing action emits a block. Audit verifiability is the contract: a successful `chainblocks-verify` is the gate on "is this deliverable defensible?"

### FT-SI-13: Output bucket as git-initialized tree

The output destination (local directory or S3 bucket — both supported) is a **git-initialized folder tree**. The structure (REQ-SI-105) is:

```
<output>/
├── reports/      — HTML/MD/PDF deliverables
├── graph/        — SI/G portable export
├── dsl/          — .sigdsl streams (replayable)
├── derived/      — generated code, migration scripts
├── audit/        — chainblocks ledger archive
└── README.md     — deliverable index
```

Each `si report` invocation produces a new commit on `main` with a descriptive message and the chainblocks seq range covered. The customer can clone the output tree, push it to their own Git remote, or hand it off as-is. The output tree carries everything needed to re-instantiate the project: the graph export, the DSL streams, the audit ledger.

### FT-SI-14: DSL versioning + deterministic replay

`.sigdsl` files declare their schema version via the header comment (`// sigdsl/v1`). GraphLoader rejects unsupported versions with a clear error. The schema is JSON-Schema-declared at `docs/DSL-SCHEMA.md` + companion `.schema.json`.

The **deterministic replay guarantee** (REQ-SI-114): re-running GraphLoader against the DSL streams alone (no re-parsing) produces an identical SI/G. This means the DSL streams in the output bucket are a complete record of "what the parsers saw"; the graph is reconstructable from them even if the parsers, the input artifacts, or Studio itself are gone.

### FT-SI-15: Compose stack + port allocation + network isolation

Each SI project is a self-contained `docker compose up` stack with four services: Studio, Graph, Window, Identity. Networks are isolated per project (bridge network named `si-<project>`); no cross-project networking is configured.

Host ports are allocated through `~/.si/ports.json` (MODEL.md §5.3): `si init` requests three ports starting from `30000`; `si destroy` releases them. Multiple SI projects can run on the same Docker host without collision.

Volume conventions in §5.4 keep config read-only, data writable, audit ledger bind-mounted, output bucket writable.

### FT-SI-16: Project-wide quality bar

SI ships to the bar declared in `knowledge/playbooks/github-published-projects.md`:

- ESM-first TypeScript, `tsup` build, `vitest` test runner
- ≥80% test coverage (branches / lines / functions / statements)
- ≥90% JSDoc on exported symbols (per `// Why:` comment standard)
- Governance trio: README, SECURITY, CONTRIBUTING
- CHANGELOG follows Keep-a-Changelog format
- CI quality gates on every push (tests + coverage + lint + typecheck)
- License declared (Apache 2.0 default for OSS-bound projects)

This is what makes the project credible whether shipped as `@solution-intelligence/*` internally, or open-sourced as `wfredricks/solution-intelligence` on GitHub.

---

## Out-of-Scope Features (deferred to post-v0.1)

These are explicitly **not** built in v0.1; they appear on the future roadmap.

- ❌ **A SaaS / hosted multi-tenant SI service.** SI is multi-user *within* an engagement, not multi-tenant *across* engagements.
- ❌ **A custom graph database.** SI/G is PolyGraph or Neo4j; we don't invent our own.
- ❌ **Custom roles beyond the 5-role default.** Templates declare roles; v0.1 supports the fixed five.
- ❌ **A standalone Blackboard library (`@blackboard/core`).** May be extracted post-v0.1 once SI's BB substrate has been proven by use.
- ❌ **MCP / HTTP API endpoint as a polished feature.** Listed in the standard deliverable suite for v0.2+; v0.1 supports raw queries against the graph backend.
- ❌ **A Window mobile/native client.** Web-only at v0.1.
- ❌ **Live cross-project graph correlation.** Each project's SI/G is isolated; cross-project insight requires explicit `si export-graph` + downstream tooling.
- ❌ **An LLM-only analyst.** Analysts may use LLMs for disambiguation, but the framework is deterministic-first (the AuditInsight v2 lesson).

---

## Feature Sizing

Rough effort estimate for v0.1 implementation (sub-agent or human-driven). Sizes are **relative**, not absolute hours.

| Feature | Size | Notes |
|---------|------|-------|
| FT-SI-01 (lifecycle) | M | CLI scaffolding, compose generation, port allocation |
| FT-SI-02 (ingestion + classification) | M | Walking, hashing, default-map, BB-queue for unclassified |
| FT-SI-03 (parser registry + DSL emission) | L | First-class parser interface; v0.1 ships Tree-sitter wrapper + 2-3 stub parsers |
| FT-SI-04 (BB substrate) | L | Event-driven workshop; presence-light v0.1 |
| FT-SI-05 (GraphLoader) | L | Single-writer; promotion policy; invariant enforcement |
| FT-SI-06 (analyst suite, all 6) | XL | Six analysts; meta-analyst (Roadmap) is the largest |
| FT-SI-07 (GraphReader + deliverables) | L | HTML templating, source-citation rendering |
| FT-SI-08 (SI/G) | M | PolyGraph adapter primarily; Neo4j adapter as optional |
| FT-SI-09 (Window) | L | Web UI, role-scoped view scoping at API boundary |
| FT-SI-10 (Identity) | M | bangauth integration first; OIDC adapter is M extra |
| FT-SI-11 (CLI) | M | 14 commands, login + shell |
| FT-SI-12 (chainblocks audit) | S | Library consumption; payload schemas already declared |
| FT-SI-13 (output bucket as git tree) | S | Per-report commit; standard structure |
| FT-SI-14 (DSL versioning) | S | Header check, schema validation |
| FT-SI-15 (compose + ports + network) | S | One-time scaffolding |
| FT-SI-16 (quality bar) | M | Set up once; enforced by CI thereafter |

Total: roughly XL × 1 + L × 5 + M × 7 + S × 4. Substantial but bounded; consistent with the 90-day v0.1 budget called out in STORY.md §"What success looks like."

---

## Provenance

This feature inventory was derived by:

1. Reading every numbered requirement in `REQUIREMENTS.md`
2. Reading every use case in `docs/USE-CASES.md`
3. Reading the doctrinal commitments in `STORY.md`
4. Reading the wire-format obligations in `MODEL.md`
5. Grouping coherent capability bundles, naming each as FT-SI-NN

Every requirement maps to at least one feature; every feature traces to at least one use case; every feature has a corresponding section in MODEL.md or REQUIREMENTS.md that defines its contract. This is the bridge document — it does not introduce new obligations, only organizes the existing ones.

Where this document and REQUIREMENTS.md disagree, REQUIREMENTS.md governs. Where this document and STORY.md disagree on intent, STORY.md governs. Where this document and the running code disagree, the running code is the defect — until the spec is changed deliberately.

---

*FEATURES.md v0.1 — Solution Intelligence. Companion to STORY.md, REQUIREMENTS.md, MODEL.md, and docs/USE-CASES.md.*
