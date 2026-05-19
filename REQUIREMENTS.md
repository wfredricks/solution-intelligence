# Solution Intelligence Requirements

*The build specification for Solution Intelligence v0.1.*

**Status:** Left-bookend draft, 2026-05-18.
**Companion docs:** `STORY.md` (vibe), `MODEL.md` (data shape), `docs/USE-CASES.md` (canonical scenarios), `docs/FEATURES.md` (derived features).

Every requirement has a stable ID of the form `REQ-SI-NNN` (functional) or `REQ-SI-NF-NNN` (non-functional). IDs are append-only — when a requirement is retired, it stays in this document with a `[RETIRED]` marker, and its ID is never reused.

Each requirement is covered by at least one test in `test/requirements/*.req.test.ts` with the requirement ID tagged in the test name or comment.

Requirements are organized **by component** (SI/S, SI/G, SI/W, SI/I) plus **cross-cutting** sections for things that span components. The BB (Blackboard) substrate lives inside SI/S; its requirements appear under "Studio BB substrate" rather than as a separate component.

---

## Functional Requirements

### Project lifecycle (cross-cutting)

**REQ-SI-001** — A new Solution Intelligence project can be instantiated by selecting a template (e.g. `csharp-to-servicenow`, `prose-doc`) and supplying a project name. The CLI command is `si init <template> <project-name>`.

**REQ-SI-002** — Project instantiation produces a self-contained Docker compose stack under `projects/<project-name>/` containing all five components (SI/S, SI/BB, SI/G, SI/W, SI/I) configured for the chosen template.

**REQ-SI-003** — A project can be started via `si up <project-name>` (which runs `docker compose up`) and stopped via `si down <project-name>` (which runs `docker compose down`).

**REQ-SI-004** — A project's identifier (name) is unique across one SI installation. Re-initializing an existing project fails with a typed error rather than silently overwriting.

**REQ-SI-005** — A project can be torn down completely via `si destroy <project-name>` (removes containers, volumes, and the project directory). Tear-down requires explicit confirmation; the project's `audit.ledger` (chainblocks) is preserved in a configurable location even after destruction.

**REQ-SI-006** — Each SI project is fully isolated from every other SI project: separate Docker network, separate containers, separate volumes, separate authorization scope. No project can read or write another project's data.

**REQ-SI-007** — Multiple SI projects can run concurrently on one host without port collisions; project instantiation allocates a non-overlapping port range per project (≥10 contiguous ports starting at a configurable base).

### Input ingestion (SI/S responsibility)

**REQ-SI-010** — Studio accepts inputs via four channels: (a) S3 bucket ingestion (`si ingest <project> --s3 <bucket-uri>`), (b) directory drop (`si ingest <project> <path>`), (c) HTTP upload API, (d) drag-and-drop through the developer UI.

**REQ-SI-011** — Every ingested input is tagged with one of the six declared epistemic classes: `ground-truth`, `aspirational`, `constraint`, `evidence`, `tribal`, `reference`. The class is supplied at ingestion time, either explicitly (CLI flag, UI selector, API parameter) or via template-declared default rules (e.g., `*.cs` defaults to `ground-truth`).

**REQ-SI-012** — Ingestion records the input's epistemic class, source path, content hash, ingestion timestamp, and acting user identity. The input class cannot be changed silently after ingestion; explicit reclassification produces a new audit event.

**REQ-SI-013** — Studio routes each input to the appropriate parser based on the combination of (file extension, declared input class, template's parser registry). Unrecognized file types are accepted as `unknown` and surfaced to the operator for explicit handling.

**REQ-SI-014** — Ingestion is incremental: re-ingesting a previously-ingested file detects unchanged content (via hash) and is a no-op, OR detects changed content and creates a new version with a `SUPERSEDES` edge to the prior version.

**REQ-SI-015** — Ingestion failures (parser crash, corrupt file, etc.) do not abort the batch; failures are recorded as findings on the BB and the rest of the batch proceeds.

**REQ-SI-016** — The full set of inputs ingested into a project is queryable via `si inputs <project>` (CLI), HTTP API, and the Studio UI.

**REQ-SI-017** — S3 bucket ingestion supports authentication via standard AWS credentials (env, profile, role) and is scoped to a configured bucket + key prefix per project. SI never reads outside the configured scope.

**REQ-SI-018** — S3 ingestion can be either one-shot (`si ingest --s3 <uri>`) or event-driven (S3 event notifications via a webhook endpoint exposed by SI/S). Event-driven ingestion is opt-in per project.

### Parser registry (cross-cutting)

**REQ-SI-020** — A parser is a pluggable component declaring: which file extensions/MIME types it handles, which epistemic classes it accepts, what node types it emits, what edge types it emits.

**REQ-SI-021** — Parsers register themselves at SI startup via a declared registry (`parsers/<name>/manifest.json`). The framework discovers and loads them; no hard-coded parser list.

**REQ-SI-022** — v0.1 ships with the following parsers: `csharp` (C# source via Roslyn or equivalent), `markdown` (prose docs, with REQ-/UC-/FT- extraction heuristics), `pdf` (text extraction for RFP/PWS handling), `json/yaml/toml` (config files), `plain-text` (fallback for `unknown` files). Other parsers (COBOL, Java, SQL, etc.) ship in later versions.

**REQ-SI-023** — A parser's output is a typed **DSL stream** (`.sigdsl`, JSONL format) conforming to the DSL schema (see REQ-SI-110..115). Each DSL record is either a `NodeProposal` or an `EdgeProposal`. Parsers do NOT write directly to SI/G; only GraphLoader writes to SI/G (REQ-SI-025).

**REQ-SI-024** — Every parser invocation produces an audit event with: parser name, parser version, input id, input hash, output summary (node/edge counts), duration, success/failure status. Audit events go to the project's chainblocks ledger.

**REQ-SI-025** — GraphLoader is the **sole writer** to SI/G. Parsers, analysts, and operator actions all funnel through GraphLoader for any state change to SI/G. This is a deliberate bottleneck for auditability.

**REQ-SI-026** — GraphLoader validates every incoming DSL record against the DSL schema before promoting. Records that fail validation are surfaced as findings on the BB substrate and recorded in the audit ledger; they do not enter SI/G.

**REQ-SI-027** — GraphReader is the **sole producer** of deliverables. Reports, graph exports, generated code (e.g., ServiceNow migration scripts) all go through GraphReader. This is the symmetric bottleneck on the read side.

### Studio BB substrate (inside SI/S)

The BB (Blackboard) is the substrate inside Studio where parsers post DSL records, analysts post findings, and promotion decisions occur. It is not a separate top-level component; these requirements describe Studio's internal working surface.

**REQ-SI-030** — The BB substrate is where DSL records from parsers land, where analysts post derived findings, where conflicts surface, and where promotion decisions occur. GraphLoader pulls validated proposals from the BB and writes them to SI/G.

**REQ-SI-031** — BB substrate state is queryable while ingestion and analysis are in progress: an operator (via the Studio dev UI) can see what's pending, what's been promoted, what conflicts have surfaced, and what's blocked.

**REQ-SI-032** — The BB substrate enforces a promotion policy per node type: a NodeProposal is promoted to SI/G when (a) promotion criteria are met (configurable per template), or (b) an operator explicitly accepts it via the dev UI. Default policy: parser-produced nodes from `ground-truth` inputs are auto-promoted; nodes from `aspirational`, `constraint`, `evidence`, `tribal`, `reference` inputs require explicit promotion OR analyst-derived corroboration.

**REQ-SI-033** — Conflicts (e.g. an `aspirational` claim contradicted by a `ground-truth` observation) are surfaced as `Conflict` nodes on the BB substrate. Conflicts must be resolved before either side promotes. Resolution is an operator action (with audit attribution) producing a `RESOLVED_BY` edge.

**REQ-SI-034** — BB substrate state is durable: a Studio restart resumes from substrate state on disk; in-flight ingestions or analyst runs that were interrupted are recoverable or restartable.

**REQ-SI-035** — Multiple operators can interact with the BB substrate concurrently. Operator actions are serialized internally (no race conditions on promotion decisions, conflict resolutions, or status changes) and each action is attributed in the audit ledger.

### Analyst suite (SI/S responsibility; v0.1 set)

**REQ-SI-040** — Analysts are pluggable components that read the BB + SI/G and post findings (new nodes, new edges, annotations on existing nodes, or `Conflict` notifications). Analysts run on-demand (`si analyze <project> --analyst <name>`) or on a schedule (template-declared cadence).

**REQ-SI-041** — v0.1 ships with the following analysts: `inventory`, `dependency-atlas`, `intent-vs-reality`, `constraint-coverage`, `risk-surface`, `pattern-classification`. Each analyst is documented in `docs/USE-CASES.md` and produces a specific output node-type or edge-type.

**REQ-SI-042** — Every analyst invocation produces an audit event with: analyst name, analyst version, scope (which subgraph/inputs it operated on), output summary, duration, success/failure. Audit events go to the project's chainblocks ledger.

**REQ-SI-043** — Analysts are idempotent on identical inputs: re-running an analyst against an unchanged subgraph produces no new findings (or produces equivalent findings that the framework deduplicates).

**REQ-SI-044** — Analysts can be chained: an analyst output can serve as input to another analyst. The framework manages the dependency order.

**REQ-SI-045** — An operator (with sufficient role) can override an analyst's finding via the dev UI: mark as `accepted`, `rejected`, `needs-review`, or attach an `OperatorAnnotation` with reasoning. Overrides are audit events.

### Graph (SI/G) — durable artifact

**REQ-SI-050** — The Graph is backed by PolyGraph by default; templates may declare a Neo4j backend for projects with heavy Cypher-shaped analysts (e.g., large codebase analysis). The graph backend choice is per-template, not per-installation.

**REQ-SI-051** — The Graph supports labeled nodes (per `MODEL.md`'s node-type taxonomy) and typed edges (per `MODEL.md`'s edge-type taxonomy). Every node carries an `epistemicClass` property derived from the input it came from.

**REQ-SI-052** — Every promoted node carries a `provenance` edge (`TRACED_TO`) back to the input it derived from, with file path, line range (when applicable), and the chainblocks ledger seq number of the ingestion event.

**REQ-SI-053** — The Graph is queryable via three surfaces: (a) Cypher (when Neo4j-backed), (b) the PolyGraph TraversalBuilder API (when PolyGraph-backed), (c) a portable HTTP query API that abstracts over the backend.

**REQ-SI-054** — The Graph can be exported in a portable format (JSONL of nodes + JSONL of edges + schema manifest) for archival, sharing, or migration. Export is one operation: `si export-graph <project> <output-dir>`.

**REQ-SI-055** — The Graph can be re-loaded from a portable export into a fresh SI installation: `si import-graph <project> <export-dir>`. Re-loading preserves all node ids and edge ids (no remapping).

**REQ-SI-056** — Graph schema is versioned. Each project records the SI version and schema version at instantiation. Loading an export from a different schema version triggers either a documented migration path or a refusal with a clear error.

### Window (SI/W) — consumer UI

**REQ-SI-060** — Window is a web application connecting to SI/G (read-only). It does not modify the graph or the BB; all mutations go through SI/S.

**REQ-SI-061** — Window renders the standard deliverable suite: Inventory Report, Dependency Atlas, Intent-vs-Reality Map, Constraint Coverage Matrix, Risk Surface, Pattern Classification. Each is a dedicated view with navigation, search, and drill-down.

**REQ-SI-062** — Window respects the viewer's role (resolved through SI/I): Owner and Operator see everything; Analyst sees everything; Reviewer sees everything with commenting; Customer sees a curated subset (the standard deliverables, no raw BB state, no operator interventions, no analyst-rejection history).

**REQ-SI-063** — Role-based view scoping is enforced at the API boundary, not just hidden in the UI. A Customer cannot retrieve raw BB state by direct API call.

**REQ-SI-064** — Reviewers can attach comments to specific findings or graph nodes. Comments are audit events; they appear to all viewers but cannot modify graph state.

**REQ-SI-065** — Window includes an exportable Executive Briefing view: a 1-pager summary suitable for printing or screenshot, drawing from the standard deliverables. Optional per project.

**REQ-SI-066** — Window provides interactive deliverable views for the graph-shaped artifacts in the standard deliverable suite: Dependency Atlas (navigable module graph with fan-in/fan-out, hot-spot highlighting, search), Intent-vs-Reality Map (side-by-side intent and ground-truth with drift highlighting), Constraint Coverage Matrix (row-per-constraint, column-per-implementation-unit, cell drill-down), Risk & Anomaly Surface (ranked list with severity, likelihood, impact filters). Each view supports click-through to the underlying graph nodes and from there to the source artifacts they were derived from (per REQ-SI-052 / `TRACED_TO` provenance edges).

**REQ-SI-067** — Window's interactive graph-shaped views are exportable as static artifacts (SVG, PNG, PDF) preserving citation links where the export format supports them (PDF, interactive HTML). Static exports are reproducible from the same SI/G state per REQ-SI-102.

**REQ-SI-068** — Window surfaces newly-promoted nodes, edges, and findings within a small bounded latency of their GraphLoader promotion. Target: p95 under 5 seconds for a typical project graph (≤100,000 nodes, ≤500,000 edges). Operators working in Studio and reviewers reading in Window see the same model state, with the Window's view eventually consistent within this latency budget.

### Identity (SI/I) — auth and authz

**REQ-SI-070** — SI/I is a standalone service running in its own container per project. It is consulted by SI/S and SI/W on each authenticated request.

**REQ-SI-071** — Default authentication backend is bangauth (passwordless via email/access-code). Templates may declare an OIDC adapter instead, configured against an external IDP (Auth0, Okta, Azure AD, etc.).

**REQ-SI-072** — SI/I issues session tokens (opaque or JWT, configurable) consumed by SI/S and SI/W. Tokens carry the user id; role lookups happen via SI/I on each request.

**REQ-SI-073** — Role assignments are per-project. A user can have different roles on different projects (Owner on DLA Stores, Reviewer on PIEE, no access to ALMSS). Role assignment is managed via `si grant <project> <user> <role>` and `si revoke <project> <user> <role>`, recorded as audit events.

**REQ-SI-074** — The 5-role default model is enforced: Owner, Operator, Analyst, Reviewer, Customer. Each role has a documented permission matrix (see `STORY.md` §"SI/I — Identity"). Custom roles are out of scope for v0.1.

**REQ-SI-075** — Project instantiation creates exactly one Owner (the user who ran `si init`); subsequent role assignments require Owner role.

**REQ-SI-076** — Every authenticated request resolves the acting user id and the user's role on the relevant project. The id is propagated into the action's audit event in chainblocks.

**REQ-SI-077** — Authentication failures and authorization failures are logged with sufficient detail to debug (user id, target action, project, role required, role held) but without leaking secrets or session tokens.

### CLI (cross-cutting)

**REQ-SI-080** — The `si` CLI provides the following commands at v0.1: `init`, `up`, `down`, `destroy`, `ingest`, `inputs`, `analyze`, `report`, `export-graph`, `import-graph`, `grant`, `revoke`, `verify`, `status`.

**REQ-SI-081** — `si verify <project>` runs `chainblocks-verify` against the project's audit ledger and reports the chain status. Exit code 0 on clean, 1 on tampered, 2 on operational error.

**REQ-SI-082** — `si status <project>` reports the running state of the project's containers, the size of the Graph (nodes/edges by label), the number of audit-ledger entries, and any open BB conflicts.

**REQ-SI-083** — CLI commands that affect a project require authentication: the CLI consults a configured identity (via `si login`) and passes the resulting token to the project's SI/I for authorization.

**REQ-SI-084** — `si login` performs a bangauth-style email/code exchange (or an OIDC code flow when configured), caches the resulting token in `~/.si/credentials`, and returns the user's identity.

### Audit (chainblocks integration)

**REQ-SI-090** — Each SI project writes its significant events to a chainblocks ledger at `projects/<project>/audit.ledger`. The ledger is created by `si init` (chainblocks genesis block) and survives `si destroy` (preserved in a configurable archive location).

**REQ-SI-091** — The following events are appended to the audit ledger, each with the acting user's identity: `si.project.init`, `si.input.ingested`, `si.input.reclassified`, `si.parser.invoked`, `si.parser.completed`, `si.parser.failed`, `si.bb.proposal.posted`, `si.bb.proposal.promoted`, `si.bb.conflict.surfaced`, `si.bb.conflict.resolved`, `si.analyst.invoked`, `si.analyst.completed`, `si.finding.overridden`, `si.role.granted`, `si.role.revoked`, `si.export.created`, `si.import.applied`, `si.project.destroyed`.

**REQ-SI-092** — Audit ledger entries use chainblocks' canonical block format per `MODEL.md` (chainblocks). The payload schema for each `kind` is documented in SI's own `MODEL.md`.

**REQ-SI-093** — `chainblocks-verify projects/<project>/audit.ledger` produces a green check on an intact ledger. Tampering with any block produces a red X with the exact failing seq.

### Reports + output bucket (GraphReader → deliverables)

**REQ-SI-100** — `si report <project>` invokes GraphReader to generate the standard deliverable suite (the artifacts the project is configured to produce). Output formats: HTML (the default; viewable in SI/W and exportable), Markdown, PDF (via pandoc or equivalent).

**REQ-SI-101** — Each report cites its source nodes/edges in SI/G; a reader of the HTML report can click a finding and see the underlying graph elements. Citations include chainblocks ledger seq numbers for full provenance.

**REQ-SI-102** — Reports are reproducible: re-generating against the same SI/G state produces byte-identical output (modulo timestamps which are explicitly identified).

**REQ-SI-103** — Templates declare which reports are appropriate. A `prose-doc` template produces a different set (essentially: Inventory + a coverage-style report) than a `csharp-to-servicenow` template (full suite).

**REQ-SI-104** — GraphReader writes deliverables to a configured output destination: either local directory or an S3 bucket. The output structure is a **git-initialized folder tree** the customer can clone, push to a Git remote, or hand off as-is.

**REQ-SI-105** — The standard output tree layout is:
```
<output>/
├── reports/      — HTML/MD/PDF deliverables
├── graph/        — SI/G portable export (JSONL nodes + JSONL edges + schema)
├── dsl/          — the .sigdsl streams produced by parsers (replayable input)
├── derived/      — generated code, migration scripts, transforms
├── audit/        — chainblocks ledger archive + verification artifacts
└── README.md     — deliverable index for the consumer
```

**REQ-SI-106** — The output tree is git-initialized at write time (or refreshed if it already exists). Each `si report` invocation produces a new commit on the output tree's main branch with a descriptive message and the chainblocks ledger seq range it covered.

### DSL (Solution Intelligence Graph Language)

The `.sigdsl` format is the **typed intermediate** between parsers and GraphLoader. It is a first-class artifact: persisted in the output bucket, replayable, version-stable, parser-language-agnostic.

**REQ-SI-110** — The DSL is line-oriented JSONL. Each line is a single JSON object representing one `NodeProposal` or one `EdgeProposal`.

**REQ-SI-111** — Every DSL record carries: `op` ("node" | "edge"), `label` or `type` (the proposed node label or edge type), `id` (stable string identifier scoped to the project), `props` (object), `epistemicClass` (one of the six declared classes), and `sourceRef` (path + optional line range).

**REQ-SI-112** — The DSL schema is declared as a JSON Schema document at `docs/DSL-SCHEMA.md` + a machine-readable `.schema.json` companion. Parsers and GraphLoader both validate against it.

**REQ-SI-113** — The DSL schema is versioned. Each `.sigdsl` file declares the schema version it conforms to in a header comment line (`// sigdsl/v1`). GraphLoader rejects unsupported versions with a clear error.

**REQ-SI-114** — The DSL is preserved in the output bucket at `dsl/<input-id>.sigdsl` for each ingested input. Re-running the project from this DSL alone produces an identical SI/G (deterministic replay).

**REQ-SI-115** — GraphLoader records a chainblocks audit event for every DSL record it processes (promoted or rejected). The audit event references the DSL file + line number for traceability.

---

## Non-functional Requirements

### Performance

**REQ-SI-NF-001** — Ingestion of a typical mid-sized codebase (~50,000 LoC across ~500 files) completes in under 10 minutes on consumer hardware. This is a budget, not a guarantee for all template/parser combinations; templates document their own ingestion-budget if different.

**REQ-SI-NF-002** — Graph queries from SI/W (the standard deliverable views) return in under 2 seconds p95 on a typical project graph (≤100,000 nodes, ≤500,000 edges).

**REQ-SI-NF-003** — The Studio dev UI is responsive: BB state queries and operator actions complete in under 500ms p95.

### Reliability

**REQ-SI-NF-010** — Studio crash during ingestion or analyst execution does not corrupt the BB or the Graph. On restart, in-flight operations are either resumable or cleanly abandoned (with audit notice).

**REQ-SI-NF-011** — The Graph is checkpointed independently of the BB; loss of BB state does not lose promoted Graph content.

**REQ-SI-NF-012** — A `chainblocks-verify` failure on the project's audit ledger is surfaced as a critical health issue in `si status` and the Studio dev UI.

### Security

**REQ-SI-NF-020** — No SI component performs network I/O to external endpoints other than (a) the configured OIDC IDP (if used), (b) explicitly-configured outbound integrations (LLM proxy, webhook destinations). All other network I/O is blocked at the container level.

**REQ-SI-NF-021** — Secrets (IDP client secrets, LLM API keys, etc.) are loaded from environment variables or mounted secret volumes; never committed to source, never logged.

**REQ-SI-NF-022** — Input file contents are not logged or emitted in error messages. Ingestion error messages reference inputs by id and class, not by content.

**REQ-SI-NF-023** — Per-project isolation is enforced at the container/network layer, not just the application layer. One project's containers cannot reach another project's containers without explicit network configuration.

**REQ-SI-NF-024** — Customer-role views in SI/W must not leak BB state, operator overrides, rejected findings, or analyst failure events through any API endpoint, response field, or error message.

### Compatibility

**REQ-SI-NF-030** — Solution Intelligence requires Docker Engine 24.x+ and Docker Compose v2 on the host. No other host-level dependencies (no host-installed Node, no host-installed Python).

**REQ-SI-NF-031** — Components are container-native: each (SI/S, SI/G, SI/W, SI/I) is a self-contained Docker image. Inter-component communication uses HTTP over a private Docker network per project.

**REQ-SI-NF-032** — The CLI is distributable as either an npm package (`@solution-intelligence/cli`) or a self-contained binary. CLI itself requires only Node.js 20.x+ (LTS) on the operator's host.

**REQ-SI-NF-033** — The Graph export format (JSONL nodes + JSONL edges + schema manifest) is stable across patch and minor versions. Schema-breaking changes require a major version bump and a documented migration path.

### Documentation

**REQ-SI-NF-040** — Every public API endpoint (SI/S HTTP, SI/W HTTP, SI/I HTTP) is documented with request schema, response schema, status codes, and authentication requirements.

**REQ-SI-NF-041** — Every CLI command is documented with usage, flags, examples, and exit codes.

**REQ-SI-NF-042** — Every parser declares (in its manifest) the node types and edge types it emits, the file types it handles, and the epistemic classes it accepts. The manifests are aggregated into a "parser catalog" doc.

**REQ-SI-NF-043** — Every analyst declares (in its manifest) the node types and edge types it reads, the findings it can produce, and its dependencies on other analysts. The manifests are aggregated into an "analyst catalog" doc.

**REQ-SI-NF-044** — Every template declares (in its manifest) the parsers, analysts, reports, default input-class routing rules, and graph backend it uses. The manifests are aggregated into a "template catalog" doc.

### Quality gates (CI)

**REQ-SI-NF-050** — Tests, typecheck, lint, and coverage all pass on every PR before merge. No exceptions.

**REQ-SI-NF-051** — Code coverage is ≥80% (lines, branches, functions, statements) for each component (SI/S, SI/G client, SI/W, SI/I, CLI).

**REQ-SI-NF-052** — JSDoc coverage is ≥90% on exported symbols for each library component, enforced by a CI check.

**REQ-SI-NF-053** — A "template instantiation smoke test" runs in CI: instantiate the `prose-doc` template against the chainblocks bookend bundle (which is in this repo as fixtures), run ingestion + analysis + report, verify the resulting Graph matches expected node/edge counts (within a tolerance).

**REQ-SI-NF-054** — Every commit to main is followed by a successful re-run of the SI's own SIG ingestion (against the SI bookend docs themselves, in `sig/`). Zero IMPLEMENTS gaps; project-wide NF orphans documented.

### Multi-user semantics

**REQ-SI-NF-060** — Two operators acting concurrently on the same project see consistent BB state: when Operator A promotes node X and Operator B queries the BB, B sees X promoted (within a configurable consistency window, default 500ms).

**REQ-SI-NF-061** — Conflicting concurrent operator actions (e.g. both promoting different versions of a node) are serialized; the second action either succeeds against the now-updated state or fails with a clear conflict error.

**REQ-SI-NF-062** — Concurrent ingestion of overlapping inputs (two operators dropping the same file) is detected via content hash and produces one ingestion event, not two.

**REQ-SI-NF-063** — The audit ledger preserves a total order of all events across all operators; chainblocks' single-writer constraint is satisfied by a project-internal serialization point.

---

## Retired Requirements

(None at v0.1.)

---

## Cross-Reference Index

| Component | Functional REQs | Count |
|-----------|----------------|------:|
| Project lifecycle (cross-cutting) | REQ-SI-001 through 007 | 7 |
| Input ingestion (SI/S, incl. S3) | REQ-SI-010 through 018 | 9 |
| Parser registry + GraphLoader/Reader | REQ-SI-020 through 027 | 8 |
| Studio BB substrate | REQ-SI-030 through 035 | 6 |
| Analyst suite | REQ-SI-040 through 045 | 6 |
| Graph (SI/G) | REQ-SI-050 through 056 | 7 |
| Window (SI/W) | REQ-SI-060 through 068 | 9 |
| Identity (SI/I) | REQ-SI-070 through 077 | 8 |
| CLI | REQ-SI-080 through 084 | 5 |
| Audit (chainblocks) | REQ-SI-090 through 093 | 4 |
| Reports + output bucket | REQ-SI-100 through 106 | 7 |
| DSL (Solution Intelligence Graph Language) | REQ-SI-110 through 115 | 6 |
| **Functional subtotal** | | **79** |

| Category | Non-functional REQs | Count |
|----------|---------------------|------:|
| Performance | REQ-SI-NF-001 through 003 | 3 |
| Reliability | REQ-SI-NF-010 through 012 | 3 |
| Security | REQ-SI-NF-020 through 024 | 5 |
| Compatibility | REQ-SI-NF-030 through 033 | 4 |
| Documentation | REQ-SI-NF-040 through 044 | 5 |
| Quality gates | REQ-SI-NF-050 through 054 | 5 |
| Multi-user semantics | REQ-SI-NF-060 through 063 | 4 |
| **Non-functional subtotal** | | **29** |

**Total at v0.1:** 82 functional + 29 non-functional = **111 requirements.**

*Counts validated against the actual REQ-SI-* and REQ-SI-NF-* definitions above by the SI SIG ingestion at `sig/queries/` (to be built alongside MODEL.md and USE-CASES.md).*

🖇️
