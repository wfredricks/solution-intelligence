# Solution Intelligence — Pipeline & Lifecycle

*The runtime data flow for one SI project, end to end.*

**Status:** Left-bookend draft, 2026-05-18.
**Companion docs:** `../STORY.md` (vibe), `../REQUIREMENTS.md` (REQ-SI-*), `../MODEL.md` (schemas), `USE-CASES.md`, `FEATURES.md`.

This document is the **picture** of how an SI project moves data from raw customer inputs to a delivered, queryable knowledge artifact. It complements REQUIREMENTS.md (the specification) and MODEL.md (the data schemas) with a single end-to-end view of what actually happens at runtime.

---

## The pipeline (one project)

```
                                  ┌──────────────────────────────────────┐
                                  │              SI/I  IDENTITY          │
                                  │  authenticates every operator action │
                                  │  consulted by SI/S and SI/W          │
                                  └──────────────────────────────────────┘
                                                    │
   ┌────────────┐    ┌──────────────────────────────┴──────────────────────────────┐    ┌────────────┐
   │ ① INPUT    │    │                 SI/S  STUDIO                                │    │  ⑦ WINDOW   │
   │   BUCKET   ├───►│         (the BB substrate + developer UI)                   │    │   SI/W      │
   │            │    │                                                             │    │            │
   │ S3 with    │    │  ②           ③               ④             ⑤              │    │            │
   │ codebase + │    │  Parsers ──► GraphLoader ──► SI/G ──► GraphReader ──┐      │    │ Browse the │
   │ design     │    │  (Tree-      (sole writer    (durable   (sole       │      │    │ output     │
   │ docs +     │    │  sitter,     to SI/G;        typed       producer of│      │    │ bucket as  │
   │ RFPs +     │    │  ANTLR,      validates       knowledge   deliverables│     │    │ a curated  │
   │ logs +     │    │  PDF,        DSL against    graph)       per template)     │    │ UI; role-  │
   │ SME notes  │    │  markdown)   schema)         │              │       │      │    │ scoped     │
   │            │    │      │       ▲              │              │       │      │    │ views per  │
   │            │    │      │       │ promotes     │              │       │      │    │ SI/I role  │
   │            │    │      ▼       │              │              │       │      │    │            │
   │            │    │   .sigdsl ───┘  ┌────────┐  │  analysts    │       │      │    │            │
   │            │    │   stream        │  BB    │◄─┘  (read SI/G, │       │      │    │            │
   │            │    │   (JSONL,    ◄──┤substr- │     post to BB) │       │      │    │            │
   │            │    │    schema-      │  ate   │                 │       │      │    │            │
   │            │    │   validated)    └────────┘                 │       │      │    │            │
   │            │    │                                            │       │      │    │            │
   │            │    │     ┌────── chainblocks ledger ──────┐     │       │      │    │            │
   │            │    │     │   audits every transition       │     │       │      │    │            │
   │            │    │     │   above, with user attribution  │     │       │      │    │            │
   │            │    │     └─────────────────────────────────┘     │       │      │    │            │
   │            │    └─────────────────────────────────────────────┼───────┘      │    │            │
   │            │                                                  │              │    │            │
   └────────────┘                                                  ▼              │    │            │
                                                          ┌─────────────────┐     │    │            │
                                                          │ ⑥ OUTPUT BUCKET │◄────┘    │            │
                                                          │                 │          │            │
                                                          │  git tree:      ├──────────┤  reads     │
                                                          │   reports/      │          │  from      │
                                                          │   graph/        │          │  bucket    │
                                                          │   dsl/          │          │            │
                                                          │   derived/      │          │            │
                                                          │   audit/        │          │            │
                                                          │   README.md     │          │            │
                                                          └─────────────────┘          └────────────┘
```

---

## The seven steps

### ① Input bucket (S3)

The customer's raw data — codebase, design documents, RFPs, transaction logs, SME interviews, reference patterns. Lives in an S3 bucket the customer controls (or that Credence operates on the customer's behalf for an engagement). SI authenticates against the bucket with standard AWS credentials; access is scoped to a configured bucket + key prefix per project (REQ-SI-017).

Ingestion modes (REQ-SI-018):
- **One-shot:** `si ingest <project> --s3 s3://bucket/prefix/` reads everything currently in the bucket prefix
- **Event-driven:** S3 event notifications trigger ingestion as new files appear (opt-in per project)

Every input is tagged at ingestion time with one of six declared epistemic classes (REQ-SI-011): `ground-truth`, `aspirational`, `constraint`, `evidence`, `tribal`, `reference`. The class is supplied explicitly or derived from template-declared default rules (e.g., `*.cs` defaults to `ground-truth`).

### ② Parsers — Tree-sitter, ANTLR, etc.

Pluggable components that read raw inputs and emit a typed `.sigdsl` JSONL stream. Each parser declares which file types it handles, which epistemic classes it accepts, and which node/edge types it can produce (REQ-SI-020, NF-042).

v0.1 ships with: `csharp` (Tree-sitter or Roslyn), `markdown` (REQ-/UC-/FT- extraction heuristics), `pdf`, `json`/`yaml`/`toml`, `plain-text` (fallback). Future parsers (COBOL via ANTLR, Java, SQL, etc.) ship in later versions (REQ-SI-022).

**Parsers do not write to SI/G.** Their only output is the DSL stream. This separation lets parsers be tested in isolation, replaced independently, and combined freely (REQ-SI-023).

### The DSL (`.sigdsl`) — the typed intermediate

Each line is one `NodeProposal` or one `EdgeProposal`. Example:

```jsonl
// sigdsl/v1
{"op":"node","label":"CodeFile","id":"file:src/Foo.cs","props":{"path":"src/Foo.cs","language":"csharp","loc":342},"epistemicClass":"ground-truth","sourceRef":{"path":"src/Foo.cs"}}
{"op":"node","label":"Class","id":"class:App.Domain.Foo","props":{"name":"Foo","namespace":"App.Domain"},"epistemicClass":"ground-truth","sourceRef":{"path":"src/Foo.cs","line":12}}
{"op":"edge","type":"DECLARED_IN","from":"class:App.Domain.Foo","to":"file:src/Foo.cs","props":{}}
{"op":"edge","type":"DEPENDS_ON","from":"class:App.Domain.Foo","to":"class:App.Domain.Bar","props":{"confidence":1.0,"via":"src/Foo.cs:42"}}
```

The DSL is:
- **Human-readable** — `cat`, `grep`, `jq` all work
- **Version-stable** — header comment declares schema version; format changes require major bump
- **Persisted** — every `.sigdsl` stream is saved to the output bucket at `dsl/<input-id>.sigdsl` (REQ-SI-114)
- **Replayable** — re-running GraphLoader against the saved DSL produces an identical SI/G (REQ-SI-114)
- **Schema-validated** — both parsers (on emit) and GraphLoader (on consume) validate against `docs/DSL-SCHEMA.md` (REQ-SI-112)

The full DSL schema is documented in `DSL-SCHEMA.md` (to be written alongside MODEL.md).

### ③ GraphLoader — the only writer to SI/G

The substrate's writer-side bottleneck. GraphLoader:
- Pulls validated DSL records from the BB substrate
- Validates each record against the DSL schema (rejects malformed records as findings, REQ-SI-026)
- Applies the promotion policy (REQ-SI-032): `ground-truth` proposals auto-promote; `aspirational`/`constraint`/`evidence`/`tribal`/`reference` require explicit promotion or analyst corroboration
- Writes promoted nodes and edges to SI/G with full provenance (REQ-SI-052: every promoted node carries a `TRACED_TO` edge back to the source input, with chainblocks ledger seq)
- Records every promotion (and every rejection) as a chainblocks audit event (REQ-SI-115)

GraphLoader is the **only** writer to SI/G (REQ-SI-025). No parser, analyst, or operator action mutates the graph except by going through GraphLoader. This is deliberate — it gives the audit trail a single authoritative source.

### ④ SI/G — the durable graph

The Solution Intelligence Graph. Backed by PolyGraph (default) or Neo4j (templates with heavy Cypher-shaped analysts). Typed nodes (CodeFile, Class, Function, IntendedBehavior, Constraint, Evidence, TribalKnowledge, ReferencePattern, ...) and typed edges (`DECLARED_IN`, `DEPENDS_ON`, `INTENDS_TO_IMPLEMENT`, `DRIFTS_FROM`, `SATISFIES`, `EVIDENCED_BY`, `TAGGED_AS`, ...).

Every node carries:
- `epistemicClass` — which of the six input classes it came from
- `provenance` edge (`TRACED_TO`) — back to source input with file path + line range + chainblocks seq

Queryable via Cypher (Neo4j) or PolyGraph TraversalBuilder (PolyGraph) or a portable HTTP query API (REQ-SI-053). Exportable to a portable JSONL format (REQ-SI-054).

### The analyst loop (between ④ and ⑤)

Analysts are pluggable components that read SI/G and post derived findings back to the BB substrate. The findings then flow through GraphLoader and either auto-promote to SI/G (corroborating ground truth) or surface as operator-decision items.

v0.1 analysts (REQ-SI-041):
- **Inventory** — counts of files, modules, languages, sizes, complexity
- **Dependency Atlas** — module-level dependency graph, fan-in/fan-out, hot spots
- **Intent-vs-Reality** — design claims (aspirational) vs code reality (ground truth), surfacing `DRIFTS_FROM` edges
- **Constraint Coverage** — RFP/PWS requirements (constraint) traced to satisfying code (ground truth) via `SATISFIES` edges; uncovered constraints flagged
- **Risk Surface** — complexity hotspots, dead code, undocumented patterns, single-points-of-failure
- **Pattern Classification** — NIST 800-53 / EIP / POSA / WAF / FAR pattern tagging via `TAGGED_AS` edges

Analysts can be chained (REQ-SI-044): one analyst's output can feed another. An operator with sufficient role can override an analyst's finding via the developer UI (`accepted`, `rejected`, `needs-review`, `OperatorAnnotation`); overrides are audit events (REQ-SI-045).

### ⑤ GraphReader — the only producer of deliverables

The substrate's reader-side bottleneck. GraphReader:
- Reads SI/G via the portable query API
- Produces the standard deliverable suite per the project's template (REQ-SI-103)
- Writes outputs to the configured destination (local directory or S3 bucket, REQ-SI-104)
- Records the output generation as a chainblocks audit event

GraphReader is the **only** producer of deliverables (REQ-SI-027). Reports, graph exports, generated code (e.g., ServiceNow migration scripts for a `csharp-to-servicenow` project), executive briefings — all go through GraphReader.

### ⑥ Output bucket — git-folder structure

Deliverables land in a git-initialized folder tree (REQ-SI-105, REQ-SI-106):

```
<output>/
├── reports/      ← HTML/MD/PDF deliverables (Inventory, Dep Atlas, Intent-vs-Reality, ...)
├── graph/        ← SI/G portable export (JSONL nodes + JSONL edges + schema)
├── dsl/          ← The .sigdsl streams from each parser invocation (replayable input)
├── derived/      ← Generated code, migration scripts, transforms
├── audit/        ← chainblocks ledger archive + chainblocks-verify output
└── README.md     ← Index for the consumer
```

The customer can clone this tree, push to a Git remote, or hand it off as-is. Each `si report` invocation commits a new version with a descriptive message and the chainblocks seq range it covered.

### ⑦ Window — the consumer UI

SI/W reads from the output bucket (and optionally from SI/G for live drill-down). It renders the deliverable suite as a curated, navigable UI for analysts, reviewers, and customers.

Window respects the viewer's role (resolved through SI/I, REQ-SI-062):
- **Owner / Operator / Analyst** — see everything
- **Reviewer** — sees everything, can comment on findings
- **Customer** — sees the curated deliverable subset only (no raw BB substrate state, no operator overrides, no analyst rejection history)

Role enforcement is at the API boundary, not just hidden in the UI (REQ-SI-063, REQ-SI-NF-024).

---

## The chainblocks ledger — the spine of the pipeline

Every significant transition in the pipeline above appends a block to the project's chainblocks ledger (REQ-SI-090, REQ-SI-091). Each block carries:
- The kind of event (one of 17 declared event kinds per REQ-SI-091)
- The acting user's identity (resolved through SI/I)
- The structured payload (what was ingested / promoted / overridden / exported)

Three years after the engagement, an assessor can:
1. Run `chainblocks-verify` against the ledger archive in the output bucket → confirms the chain is intact
2. Read the ledger for any event kind (`si.classification.assigned`, `si.bb.conflict.resolved`, etc.) → see every decision in order, with reasoning
3. Trace any finding in any report back to the underlying ledger entry, then back to the input DSL, then back to the source file

This is the **defensibility** SI delivers. Every claim in the deliverable traces back through an immutable chain to its source input. No silent edits, no "we ran some scripts."

---

## CLI lifecycle

A single SI engagement runs through these CLI commands:

```
si init <template> <project>             ← create container set; init SI/G + audit ledger; create Owner
                                            (REQ-SI-001..007, 075)

si login                                  ← authenticate operator against SI/I
                                            (REQ-SI-083, 084)

si grant <project> <user> <role>          ← assign roles (Owner only)
                                            (REQ-SI-073)

si ingest <project> --s3 <bucket>         ← parsers run; .sigdsl streams land on BB substrate;
                                            GraphLoader promotes; SI/G populated
                                            (REQ-SI-010..018)

si analyze <project> [--analyst <name>]   ← analyst chain runs; findings post to BB substrate;
                                            GraphLoader promotes accepted findings to SI/G
                                            (REQ-SI-040..045)

si status <project>                       ← report container state, graph size, ledger entries,
                                            open BB conflicts
                                            (REQ-SI-082)

si report <project> [--output <s3>]       ← GraphReader produces deliverables;
                                            writes git-folder tree to output destination
                                            (REQ-SI-100..106)

si verify <project>                       ← chainblocks-verify against the audit ledger
                                            (REQ-SI-081, 093)

si export-graph <project> <dir>           ← portable SI/G export (JSONL)
                                            (REQ-SI-054)

si destroy <project>                      ← tear down containers; archive ledger + final graph export
                                            (REQ-SI-005)
```

Every command authenticates against SI/I (REQ-SI-083) and produces appropriate chainblocks audit events with user attribution.

---

## The role-based view of the pipeline

The pipeline is the same for everyone, but **what each role sees** of it differs:

| Role | Sees | Cannot see |
|------|------|------------|
| **Owner** | Everything; can configure, override, destroy | (nothing hidden) |
| **Operator** | Everything in Studio; can ingest, run analysts, accept findings, add tribal knowledge | (parity with Owner except destroy) |
| **Analyst** | BB substrate (read-only), SI/G, Window deliverables | Cannot ingest new inputs; cannot destroy |
| **Reviewer** | Window deliverables; can comment | No Studio access at all |
| **Customer** | Window deliverables (curated subset only) | No BB state, no operator overrides, no rejected findings |

Role-based view scoping is enforced at the API boundary (REQ-SI-063, REQ-SI-NF-024): a Customer cannot retrieve raw BB state by direct API call. The UI doesn't just hide it; the server won't return it.

---

## What this pipeline is NOT

Some non-obvious clarifications:

- **Not a one-shot batch processor.** Ingestion can be event-driven (REQ-SI-018); new inputs flow in over the life of an engagement. Re-running GraphLoader against an unchanged DSL produces no new graph state (REQ-SI-014, idempotent).
- **Not a single-language pipeline.** Parsers are language-pluggable; a project can have C# + COBOL + PDF design docs + SQL schemas all flowing into the same SI/G.
- **Not a closed system.** The output bucket is git-folder-shaped specifically so the customer can take the deliverables and use them in their existing workflows.
- **Not "the system did X."** Every action across the pipeline is attributed to a real person (REQ-SI-076). The audit trail reads in human terms.
- **Not LLM-only.** Parsers are real parsers (Tree-sitter, ANTLR, Roslyn). LLMs solve disambiguation inside analysts where judgment matters; they do not parse code or write to the graph.

---

## Provenance

This pipeline diagram was rendered 2026-05-18 at Bill's request after he sketched the seven-step flow on the way through SI's left-bookend authoring. The DSL-as-first-class-artifact and S3-buckets-at-both-ends decisions came out of the same conversation; both were elevated from "implied" in REQUIREMENTS.md to "explicit" here.

The pipeline is the picture; the requirements are the specification; the model is the data shape; the use cases are the stories. Together they bookend the build.

🖇️
