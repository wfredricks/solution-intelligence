# MODEL.md — Solution Intelligence Data Model

*The portable, versioned specification for every persistent structure inside a Solution Intelligence project. Companion to `STORY.md` (the why) and `REQUIREMENTS.md` (the what).*

---

## How to read this document

`STORY.md` is the prose; `REQUIREMENTS.md` is the contract; **`MODEL.md` is the wire format**.

If two Solution Intelligence implementations were written from scratch in different languages, they would still interoperate if and only if they both honored this document. Every schema declared here is intended to be portable, versioned, and forward-compatible within a major version.

Six interlocking models are specified:

1. **The DSL** (`.sigdsl`) — the typed intermediate stream between parsers and GraphLoader
2. **The Graph** (SI/G) — node and edge schemas the durable artifact contains
3. **Audit event payloads** — the 18 chainblocks block kinds SI emits, with payload shapes
4. **Template manifests** — the JSON declaration a project starts from
5. **Project compose model** — the on-disk layout and Docker compose stack
6. **Identity model** — user records, role grants, permission matrix, token shape

Plus two short sections on **forward compatibility** and **provenance**.

> **Stability promise (v0.1).** Within v0.x, additive changes (new optional fields, new node types, new edge types, new block kinds) are allowed and do not require a major version bump. Renames, removed fields, semantic changes to existing fields, and format breaks require a major version bump (v0 → v1) and a documented migration. See §7.

---

## 1 — The DSL (`.sigdsl`)

The Solution Intelligence DSL is the **typed intermediate** between parsers and GraphLoader. It is a first-class artifact: persisted at `dsl/<input-id>.sigdsl` in the output bucket, replayable, version-stable, parser-language-agnostic.

A parser does not write to the Graph. A parser emits `.sigdsl`. GraphLoader is the sole writer to SI/G; it consumes `.sigdsl` streams and produces graph state plus chainblocks audit events.

### 1.1 — File format

Line-oriented JSONL with a single header comment line on line 1:

```
// sigdsl/v1
{"op":"node","label":"Function","id":"fn:com.example.Foo.bar/2","props":{"name":"bar","arity":2,"language":"csharp"},"epistemicClass":"ground-truth","sourceRef":{"path":"src/Foo.cs","lineStart":42,"lineEnd":78}}
{"op":"edge","type":"CALLS","from":"fn:com.example.Foo.bar/2","to":"fn:com.example.Bar.baz/1","props":{"siteCount":3},"sourceRef":{"path":"src/Foo.cs","lineStart":51,"lineEnd":51}}
{"op":"conflict","between":["fn:com.example.Foo.bar/2","intended:Foo.bar/2"],"reason":"signature drift: intent declares 3 params, ground truth has 2","sourceRef":{"path":"docs/architecture.md","lineStart":120,"lineEnd":128}}
```

Header line is mandatory. GraphLoader rejects any file whose first non-empty line is not `// sigdsl/vN` for a supported N (per REQ-SI-113).

Each subsequent line is one JSON object. Empty lines and lines beginning with `//` after the header are ignored (comments). Trailing whitespace is ignored. Line ending is `\n`.

### 1.2 — NodeProposal schema

```jsonc
{
  "op": "node",
  "label": "Function",                     // node label (see §2.1 for the v0.1 set)
  "id": "fn:com.example.Foo.bar/2",        // stable, project-scoped id
  "props": { ... },                         // free-form, validated per label
  "epistemicClass": "ground-truth",        // one of the six classes (see §1.5)
  "sourceRef": {                            // mandatory: where this proposal came from
    "path": "src/Foo.cs",
    "lineStart": 42,
    "lineEnd": 78,
    "blobSha256": "..."                     // optional but recommended
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `op` | Y | Always `"node"` |
| `label` | Y | Must be one of the labels declared in §2.1 |
| `id` | Y | Stable string id. Format is parser-defined but conventionally `<prefix>:<qualified-name>` |
| `props` | Y | Object. May be empty `{}`. Per-label schemas in §2.1 |
| `epistemicClass` | Y | One of: `ground-truth`, `aspirational-intent`, `constraint`, `evidence`, `tribal-knowledge`, `reference-pattern`, `analyst-output` |
| `sourceRef` | Y | Origin of the proposal. `path` is required; line range optional but encouraged |

### 1.3 — EdgeProposal schema

```jsonc
{
  "op": "edge",
  "type": "CALLS",                          // edge type (see §2.2 for the v0.1 set)
  "from": "fn:com.example.Foo.bar/2",       // existing node id
  "to": "fn:com.example.Bar.baz/1",         // existing node id
  "props": { ... },                          // free-form, validated per type
  "sourceRef": {
    "path": "src/Foo.cs",
    "lineStart": 51,
    "lineEnd": 51
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `op` | Y | Always `"edge"` |
| `type` | Y | Must be one of the edge types declared in §2.2 |
| `from`, `to` | Y | Both must reference node ids that exist (declared earlier in this DSL or already present in SI/G) |
| `props` | Y | Object. May be empty `{}` |
| `sourceRef` | Y | Same shape as NodeProposal.sourceRef |

**v0.1 invariant: no forward references.** An EdgeProposal's `from` and `to` must reference NodeProposals declared earlier in the same `.sigdsl` file, or nodes already promoted into SI/G by a prior input. GraphLoader rejects forward-ref edges with a clear error referencing the DSL line number.

### 1.4 — Conflict marker

A parser may emit conflict markers when it detects a contradiction within or across inputs without resolving it. The conflict surfaces in BB substrate for operator review and may be resolved into an `INTENDS_TO_IMPLEMENT`-with-`DRIFTS_FROM` pattern, an override, or a tribal-knowledge annotation.

```jsonc
{
  "op": "conflict",
  "between": ["fn:com.example.Foo.bar/2", "intended:Foo.bar/2"],
  "reason": "signature drift: intent declares 3 params, ground truth has 2",
  "sourceRef": { "path": "docs/architecture.md", "lineStart": 120, "lineEnd": 128 }
}
```

GraphLoader records conflict markers as BB-substrate state and emits a `si.bb.conflict.surfaced` audit event (see §3).

### 1.5 — The six epistemic classes

Every NodeProposal carries an `epistemicClass`. The class is the doctrinal anchor (STORY.md §"The doctrinal anchor"); it drives GraphLoader's promotion policy (§2.4) and analyst reasoning.

| Class | Examples | Default promotion policy |
|-------|----------|--------------------------|
| `ground-truth` | Functions, classes, schemas, configs derived from code/binaries | Auto-promote |
| `aspirational-intent` | IntendedBehavior, ArchDecision derived from design docs / ADRs | Promote; do not overwrite ground truth |
| `constraint` | Requirements, SLAs, compliance controls derived from RFP/PWS/SOW | Auto-promote |
| `evidence` | LogEvent, IncidentRecord, TestResult derived from runtime data | Auto-promote |
| `tribal-knowledge` | Annotations from interviews, transcripts, SME notes | Requires Operator promotion (default); template may opt to auto-promote with confidence ≥ threshold |
| `reference-pattern` | NIST controls, EIP patterns, POSA patterns from reference corpora | Auto-promote |

The seventh class `analyst-output` is reserved for nodes created by analysts (not parsers); analysts emit their findings as nodes with `epistemicClass: "analyst-output"` and may be subject to a separate promotion policy.

### 1.6 — Validation rules

A `.sigdsl` file is **valid** if and only if:

1. Line 1 is `// sigdsl/vN` for a supported N.
2. Every subsequent non-comment line parses as a single JSON object.
3. Every object has a recognized `op` (`node`, `edge`, or `conflict`).
4. Every NodeProposal has all required fields (§1.2) and a recognized `label` (§2.1) and `epistemicClass`.
5. Every EdgeProposal has all required fields (§1.3), a recognized `type` (§2.2), and `from`/`to` referencing previously-declared or already-existing node ids.
6. Every NodeProposal `id` is unique within the file (a single file does not re-declare the same node twice; cross-file id collision is handled by GraphLoader's merge policy).
7. Every `sourceRef.path` is a relative path under the input root (no absolute paths, no `..` escape).

GraphLoader produces a per-input validation report; invalid lines are recorded with their line number and rejection reason in a `si.parser.failed` or `si.bb.proposal.posted` (with `rejected: true`) audit event.

### 1.7 — Persistence

For each ingested input, the parser writes its `.sigdsl` stream to:

```
projects/<project>/data/dsl/<input-id>.sigdsl
```

On `si report`, the DSL streams are copied (or symlinked) to the output bucket at `dsl/<input-id>.sigdsl` (REQ-SI-114). Re-running GraphLoader against the DSL alone (no re-parsing) produces an identical SI/G — this is the **deterministic replay guarantee**.

---

## 2 — The Graph (SI/G)

SI/G is the durable, queryable artifact of a Solution Intelligence project. It is backed by PolyGraph (default for v0.1) or Neo4j (optional, declared in template manifest). Both backends must satisfy the schema declared here.

### 2.1 — Node labels (v0.1 set)

Labels are organized in three tiers per STORY §V (substrate-independence) and the doctrinal commitment in STORY §VI. Every node carries the common props in §2.3 plus per-label props.

**Naming convention.** Tier-1 labels are bare lowercase, with `snake_case` for multi-word names (e.g. `constraint`, `intended_behavior`). Tier-2 labels are `<domain>.<label>` (e.g. `ba.form`, `ba.business_rule`). Tier-3 labels are `cs_<era>.<label>` (e.g. `cs_2026.function`, `cs_2026.source_file`). All names are case-sensitive; lowercase-only is the rule to avoid case-mismatch errors across backends.

#### Tier 1 — Solution-universal vocabulary (timeless)

Applies to any kind of solution in any era. Adding a Tier-1 label is a major event (see §7).

**Input-side**

| Label | Description | Required props |
|-------|-------------|----------------|
| `input_artifact` | A single ingested input (file, document, S3 object) | `path`, `mime_type`, `blob_sha256`, `bytes`, `input_class` |

**Aspirational-intent**

| Label | Description | Required props |
|-------|-------------|----------------|
| `intended_behavior` | A described intent extracted from a design doc | `name`, `description` |
| `arch_decision` | A documented architectural decision (ADR or equivalent) | `title`, `decision`, `rationale` |

**Constraint**

| Label | Description | Required props |
|-------|-------------|----------------|
| `constraint` | A binding obligation from RFP/PWS/SOW/SLA/control catalog | `name`, `text`, `binding_document` |

**Evidence**

| Label | Description | Required props |
|-------|-------------|----------------|
| `evidence` | An observation from runtime: log line, incident, test result, audit trail | `kind`, `observed_at` |

**Tribal-knowledge**

| Label | Description | Required props |
|-------|-------------|----------------|
| `tribal_knowledge` | An SME-sourced annotation | `text`, `attributed_to`, `confidence` |

**Reference-pattern**

| Label | Description | Required props |
|-------|-------------|----------------|
| `reference_pattern` | An external pattern, control, or standard | `corpus`, `name` |

**Analyst-output**

| Label | Description | Required props |
|-------|-------------|----------------|
| `finding` | An analyst-produced finding | `analyst_name`, `severity`, `summary` |
| `inventory` | A counted catalog of artifacts | `analyst_name`, `category`, `count` |
| `coverage` | A coverage measurement | `analyst_name`, `subject`, `metric`, `value` |
| `risk_item` | An identified risk | `analyst_name`, `description`, `likelihood`, `impact` |

#### Tier 2 — Solution-domain vocabulary (timeless within a domain)

Each engagement declares its solution domain as one of its first acts; the declaration selects which Tier-2 vocabulary applies. v0.1 ships one named domain.

**Domain `ba` — Business Automation**

The domain of solutions whose substance is forms, processes, organizations, approvals, agreements, business rules, transactions, accounts, and policies. Covers procurement, claims processing, audit, case management, regulatory compliance workflows, and most enterprise-line-of-business systems. A 1935 procurement office, a 1985 COBOL transaction system, a 2026 ServiceNow workflow, and a 2055 agent-driven workflow are all instances of the same kind of solution; the Tier-2 labels below describe what stays stable across all of them.

| Label | Description | Required props |
|-------|-------------|----------------|
| `ba.form` | A structured collection of fields submitted to a process | `name`, `purpose` |
| `ba.process` | A defined sequence of activities producing an outcome | `name`, `outcome` |
| `ba.workflow` | A specific routed instance of a process | `name`, `process_id` |
| `ba.role` | A named position or responsibility a person or system holds | `name`, `responsibilities` |
| `ba.organization` | A party (agency, division, vendor, customer) | `name`, `kind` |
| `ba.approval` | A required affirmative decision by a role | `name`, `required_role`, `subject` |
| `ba.document` | A structured or unstructured document the solution references | `name`, `kind` |
| `ba.agreement` | A formal commitment between parties (MoU, contract, SLA, SOW) | `name`, `parties`, `effective_range` |
| `ba.business_rule` | A declarative rule constraining behavior | `name`, `expression`, `rationale` |
| `ba.transaction` | A single discrete unit of business activity | `kind`, `occurred_at` |
| `ba.account` | An identified party-on-record (customer, vendor, employee, asset) | `name`, `kind`, `external_id` |
| `ba.counterparty` | A party on the other side of a transaction or agreement | `name`, `kind` |
| `ba.ledger` | An accumulating record of transactions of a kind | `name`, `kind` |
| `ba.policy` | A binding statement of organizational practice | `name`, `text`, `scope` |

Future Tier-2 domains anticipated but not built in v0.1: `mfg` (manufacturing and control systems), `clin` (clinical and healthcare), `infra` (infrastructure and engineering), `research` (research and experimentation). New domains are additive and do not require a major bump (see §7).

#### Tier 3 — Implementation-paradigm vocabulary (era-namespaced)

Names what the current substrate happens to call its units of behavior and structure. Era-namespaced so successor paradigms land as new namespaces beside the old, not as overwrites.

**Paradigm `cs_2026` — Current computing substrate**

The set of implementation units characteristic of the 2026 paradigm: object-oriented or procedural source code in text files, relational schemas, HTTP/gRPC endpoints, key-value configuration.

| Label | Description | Required props |
|-------|-------------|----------------|
| `cs_2026.source_file` | A single source file | `path`, `language`, `blob_sha256` |
| `cs_2026.function` | A function/method/procedure | `name`, `arity`, `language` |
| `cs_2026.class` | A class/type/struct/record | `name`, `language` |
| `cs_2026.interface` | An interface/protocol/trait | `name`, `language` |
| `cs_2026.variable` | A module-scoped or class-scoped variable | `name`, `scope` |
| `cs_2026.schema` | A database schema | `name`, `dialect` |
| `cs_2026.table` | A database table | `name` |
| `cs_2026.column` | A column on a table | `name`, `data_type` |
| `cs_2026.endpoint` | An HTTP/gRPC/messaging endpoint | `route`, `method` |
| `cs_2026.config_key` | A deployed configuration key/value | `name`, `value` |

When the implementation substrate turns over, a new `cs_<era>.*` paradigm namespace lands beside `cs_2026.*`. Both layers persist; both bind to the same Tier-1 and Tier-2 nodes via the edges in §2.2. Templates may also extend with their own labels (declared in the template manifest, §4); template-extended labels live under the template namespace, `tmpl.<template_name>.<label>`.

#### How the three tiers compose

A typical solution-to-implementation chain in the graph:

```
cs_2026.endpoint "POST /approvals"
   --IMPLEMENTS_INTENT_OF-->
ba.approval "Director approval of POs over $10K"
   --PART_OF_PROCESS-->
ba.process "Purchase Order Lifecycle"
   --GOVERNED_BY-->
constraint "FAR 13.106-1(c) — micro-purchase threshold"
```

When the codebase is rewritten in whatever lands in 2045, the `cs_2026.endpoint` does not move. A new `cs_2045.<something>` joins the graph beside it, bound to the same `ba.approval` by the same edge type. The Tier-1 `constraint` and the Tier-2 `ba.approval` and `ba.process` are the stable spine; the paradigm layers accumulate beneath.

### 2.2 — Edge types (v0.1 set)

Edges are grouped by purpose. Every edge carries the common props in §2.3 plus per-type props.

Edge types are uppercase with underscores (`SNAKE_CASE`) and are not namespaced — they read as verbs across all three node tiers without ambiguity.

**Structural (within Tier-3 implementation paradigm)**

These describe relationships among paradigm units. The label set below is named for `cs_2026.*` nodes; analogous edges within a future `cs_<era>.*` paradigm are declared by that paradigm namespace and may differ.

| Type | Direction | Description |
|------|-----------|-------------|
| `DECLARES` | container → contained | A file/module declares a function; a class declares a method |
| `EXTENDS` | subtype → supertype | Class inheritance, interface extension |
| `IMPLEMENTS` | class → interface | Interface implementation |
| `CALLS` | caller → callee | Function call (may carry `site_count`) |
| `READS` / `WRITES` | function ↔ variable/column/config_key | Data access |
| `DEPENDS_ON` | module → module | Import / link-time dependency |
| `EXPOSES` | module → endpoint | Module exposes a route |
| `BELONGS_TO` | column → table; table → schema | Containment in data model |
| `REFERENCES` | column → column | Foreign key |

**Tier-3 → Tier-2 (paradigm-to-domain)**

These edges are how the implementation substrate binds to the substrate-independent domain spine. They are the edges that survive paradigm transitions — a new `cs_<era>.*` layer lands and connects to the same Tier-2 nodes via these same edge types.

| Type | Direction | Description |
|------|-----------|-------------|
| `IMPLEMENTS_INTENT_OF` | Tier-3 node → Tier-2 node | This implementation unit realizes a domain element (e.g. `cs_2026.endpoint` IMPLEMENTS_INTENT_OF `ba.approval`) |
| `REALIZES_FORM` | Tier-3 node → `ba.form` | This implementation renders or processes this business form |
| `EXECUTES_PROCESS` | Tier-3 node → `ba.process` | This implementation carries out this business process |
| `ENFORCES_RULE` | Tier-3 node → `ba.business_rule` | This implementation enforces this business rule |
| `RECORDS_TRANSACTION` | Tier-3 node → `ba.transaction` | This implementation creates or persists this kind of transaction |

**Intra-Tier-2 (within solution-domain)**

Domain-internal relationships. The set below is the v0.1 `ba` set; other Tier-2 domains declare their own.

| Type | Direction | Description |
|------|-----------|-------------|
| `PART_OF_PROCESS` | `ba.approval`/`ba.form`/`ba.workflow` → `ba.process` | This element is a step or component of this process |
| `ASSIGNED_TO_ROLE` | `ba.approval`/`ba.workflow` → `ba.role` | This element requires action by this role |
| `HELD_BY_ORG` | `ba.role` → `ba.organization` | This role exists within this organization |
| `BINDS` | `ba.agreement` → `ba.organization`/`ba.role` | This agreement binds this party |
| `RECORDED_IN` | `ba.transaction` → `ba.ledger` | This transaction is recorded in this ledger |
| `INVOLVES` | `ba.transaction` → `ba.account`/`ba.counterparty` | This transaction involves this party |

**Intent-to-reality (Tier-2 or Tier-3 → Tier-1)**

These bind any node (Tier-2 or Tier-3) to the timeless intent and decision spine.

| Type | Direction | Description |
|------|-----------|-------------|
| `INTENDS_TO_IMPLEMENT` | `intended_behavior` → Tier-2 or Tier-3 node | "This intent maps to this element" |
| `DRIFTS_FROM` | Tier-2 or Tier-3 node → `intended_behavior` | "This element drifts from the stated intent" |
| `DECIDED_BY` | any node → `arch_decision` | "This was the consequence of this decision" |

**Contract (any node → Tier-1 constraint)**

| Type | Direction | Description |
|------|-----------|-------------|
| `GOVERNED_BY` | Tier-2 node → `constraint` | A domain element is bound by this constraint (e.g. `ba.process` GOVERNED_BY `constraint`) |
| `SATISFIES` | Tier-2 or Tier-3 node → `constraint` | "This element satisfies this constraint" |
| `MAY_VIOLATE` | Tier-2 or Tier-3 node → `constraint` | "This element is at risk of violating this constraint" |
| `UNCOVERED_BY` | `constraint` → (no target) | Self-loop marker: this constraint has no satisfying artifact |

**Evidence (Tier-1 evidence → anywhere)**

| Type | Direction | Description |
|------|-----------|-------------|
| `OBSERVED_FOR` | `evidence` → Tier-2 or Tier-3 node | "This evidence pertains to this element" |
| `DEMONSTRATES` | `evidence` → `constraint` | "This evidence demonstrates this constraint was met (or violated)" |

**Tribal**

| Type | Direction | Description |
|------|-----------|-------------|
| `ANNOTATES` | `tribal_knowledge` → any node | SME annotation attached to another node |

**Reference/classification**

| Type | Direction | Description |
|------|-----------|-------------|
| `MATCHES_PATTERN` | any node → `reference_pattern` | "This element matches this pattern" |
| `MAPS_TO_CONTROL` | `constraint` → `reference_pattern` | "This requirement maps to this control" |

**Analyst-output**

| Type | Direction | Description |
|------|-----------|-------------|
| `FINDING_ABOUT` | `finding` → any node | The subject of a finding |
| `EVIDENCED_BY` | `finding` → `evidence`/`input_artifact`/source-node | The supporting evidence for a finding |
| `INVENTORIES` | `inventory` → category-of-nodes | Inventory groups |
| `MEASURES` | `coverage` → subject | Coverage subject linkage |

**Provenance & lifecycle**

| Type | Direction | Description |
|------|-----------|-------------|
| `DERIVED_FROM` | any node → `input_artifact` | "This node was derived from this input" |
| `EMITTED_BY` | any node → parser-name | "This node was emitted by this parser run" |
| `SUPERSEDED_BY` | old node → new node | Versioning: a re-parsed input may supersede a prior node |

### 2.3 — Common properties

Every node carries:

| Prop | Description |
|------|-------------|
| `id` | Stable string id (parser-defined namespacing) |
| `epistemicClass` | One of the seven classes (six input classes plus `analyst-output`) |
| `createdAt` | ISO-8601 timestamp |
| `createdBy` | User id of the operator whose action caused creation (per REQ-SI-076) |
| `createdFromBlock` | chainblocks ledger seq number of the block that recorded creation |
| `provenance` | Object: `{ "parser": "...", "inputId": "...", "dslLine": N }` (see §8) |

Every edge carries:

| Prop | Description |
|------|-------------|
| `epistemicClass` | Inherits from the more-specific endpoint by default; explicit overrides allowed |
| `createdAt` | ISO-8601 timestamp |
| `createdBy` | User id |
| `createdFromBlock` | chainblocks ledger seq number |
| `provenance` | Object: same shape as node provenance |

### 2.4 — Invariants

GraphLoader enforces these on every promotion. Violations are recorded as `si.bb.proposal.posted` with `rejected: true` and surfaced in BB substrate.

1. **Every node has `epistemicClass`.** No floating nodes.
2. **Every node has `provenance`.** No node may exist without a derived-from chain back to an `InputArtifact` or analyst run.
3. **No forward-ref edges.** An EdgeProposal's `from` and `to` must already exist (declared earlier in the same DSL file or already promoted).
4. **Single-writer.** Only GraphLoader writes to SI/G. Analysts post their findings via the BB substrate; GraphLoader promotes them.
5. **Promotion policy.** `ground-truth`, `constraint`, `evidence`, `reference-pattern` auto-promote. `aspirational-intent` promotes but never overwrites a conflicting ground-truth node — conflicts surface as `DRIFTS_FROM` edges. `tribal-knowledge` requires Operator promotion by default (template may opt for confidence-threshold auto-promote). `analyst-output` promotes per the analyst's declared policy in the template.
6. **Audit completeness.** Every promotion, rejection, or override produces a chainblocks audit event with the actor's id (REQ-SI-091).
7. **Id stability.** Once promoted, a node's `id` is immutable. A re-parse that would have produced the same node updates props in place; a re-parse that produces a different node uses `SUPERSEDED_BY` rather than mutating the old node's id.

---

## 3 — Audit Event Payloads

SI emits 18 declared chainblocks block kinds. Each carries a structured payload. All blocks follow the chainblocks canonical block format (see chainblocks' own `MODEL.md`); the SI-specific contribution is the per-kind payload schema below.

### 3.1 — Common payload fields

Every SI audit-event payload contains:

| Field | Required | Notes |
|-------|----------|-------|
| `actor` | Y | `{ "userId": "alice@example.com", "tokenJti": "..." }` — the real person whose action produced this event |
| `projectId` | Y | The SI project id |
| `correlation` | N | Optional `{ "requestId": "...", "parentBlock": N }` for tracing related events |

### 3.2 — The 18 block kinds

| Kind | Payload (in addition to common) |
|------|----------------------------------|
| `si.project.init` | `{ template: "<template-name>", templateVersion: "<sem-ver>", siVersion: "<sem-ver>" }` |
| `si.project.destroyed` | `{ archiveLocation: "<path-or-s3-uri>" }` |
| `si.input.ingested` | `{ inputId: "...", path: "...", mimeType: "...", bytes: N, blobSha256: "...", inputClass: "ground-truth\|aspirational-intent\|..." }` |
| `si.input.reclassified` | `{ inputId: "...", fromClass: "...", toClass: "...", reason: "..." }` |
| `si.parser.invoked` | `{ parser: "...", inputId: "...", parserVersion: "..." }` |
| `si.parser.completed` | `{ parser: "...", inputId: "...", dslPath: "...", recordCount: N, conflictCount: N }` |
| `si.parser.failed` | `{ parser: "...", inputId: "...", errorClass: "...", errorMessage: "...", partialDslPath?: "..." }` |
| `si.bb.proposal.posted` | `{ proposalKind: "node\|edge\|conflict", dslPath: "...", dslLine: N, accepted: bool, rejected: bool, rejectionReason?: "..." }` |
| `si.bb.proposal.promoted` | `{ proposalKind: "node\|edge", graphId: "...", dslPath: "...", dslLine: N }` |
| `si.bb.conflict.surfaced` | `{ between: ["...", "..."], reason: "...", dslPath: "...", dslLine: N }` |
| `si.bb.conflict.resolved` | `{ conflictId: "...", resolution: "promote-a\|promote-b\|drifts-from\|annotate\|override", notes?: "..." }` |
| `si.analyst.invoked` | `{ analyst: "...", analystVersion: "...", scope: { ... } }` |
| `si.analyst.completed` | `{ analyst: "...", findingCount: N, findingsBlockRange: [startSeq, endSeq] }` |
| `si.finding.overridden` | `{ findingId: "...", overrideKind: "dismiss\|reclassify\|accept-with-note", notes: "..." }` |
| `si.role.granted` | `{ targetUserId: "...", role: "Owner\|Operator\|Analyst\|Reviewer\|Customer" }` |
| `si.role.revoked` | `{ targetUserId: "...", role: "..." }` |
| `si.export.created` | `{ outputPath: "...", reportSet: ["...", "..."], graphSnapshotSha256: "...", ledgerSeqRange: [startSeq, endSeq] }` |
| `si.import.applied` | `{ sourcePath: "...", graphSnapshotSha256: "...", mergePolicy: "replace\|merge", conflictCount: N }` |

### 3.3 — Payload conventions

- Every `dslPath` is a relative path under the project's `data/dsl/` directory.
- Every `outputPath` is either a local path under the project's `outputs/` directory or an `s3://bucket/prefix/...` URI.
- Every timestamp in a payload is ISO-8601 in UTC. (Local-time payloads are explicitly disallowed.)
- Every byte count is an integer. Hash digests are lowercase hex SHA-256.

---

## 4 — Template Manifest

A template is a versioned bundle of configuration that calibrates SI to a project kind: which parsers run, which analysts run, which reports are produced, what the default input-class assignment is, what the default container set looks like.

### 4.1 — Manifest schema

```jsonc
{
  "name": "csharp-to-servicenow",          // template id
  "version": "0.1.0",                       // sem-ver
  "siVersion": ">=0.1.0",                   // SI version compatibility range
  "description": "...",                     // free-form, shown to operators

  "graphBackend": "polygraph",              // "polygraph" | "neo4j"

  "parsers": [                              // ordered; first match wins on classification
    {
      "name": "csharp-treesitter",
      "version": "0.1.0",
      "matches": { "ext": [".cs"], "mimeType": ["text/x-csharp"] },
      "inputClass": "ground-truth",
      "config": { ... }
    }
  ],

  "inputClassDefaults": [                   // fallback classification when no parser matches
    { "match": { "ext": [".md"] }, "inputClass": "aspirational-intent" }
  ],

  "analysts": [
    {
      "name": "Inventory",
      "version": "0.1.0",
      "trigger": "post-ingest",             // "post-ingest" | "manual" | "scheduled"
      "config": { ... }
    }
  ],

  "reports": [
    { "name": "inventory.html", "analyst": "Inventory", "format": "html" }
  ],

  "outputBucket": {                          // default output destination; user may override
    "kind": "local",                         // "local" | "s3"
    "path": "./outputs"                       // or "s3://bucket/prefix/"
  },

  "containerSet": {
    "studio": { "image": "si-studio:0.1.0", "ports": [{ "container": 3000 }] },
    "graph":  { "image": "polygraph:latest", "ports": [{ "container": 7687 }] },
    "window": { "image": "si-window:0.1.0", "ports": [{ "container": 3001 }] },
    "identity": { "image": "bangauth:latest", "ports": [{ "container": 4000 }] }
  },

  "identity": {
    "backend": "bangauth",                   // "bangauth" | "oidc"
    "oidc": null                              // populated when backend === "oidc"
  }
}
```

### 4.2 — Validation

The manifest is validated on `si init` against `docs/TEMPLATE-SCHEMA.json`. Validation failures abort `si init` with a clear error referencing the offending field path.

### 4.3 — Parser manifests

A parser's `config` block is opaque to SI and validated only by the parser itself. SI guarantees that the config block is passed verbatim to the parser at invocation time.

### 4.4 — Analyst manifests

An analyst's `config` block is similarly opaque. Additionally, an analyst declares its **promotion policy** for the `analyst-output` nodes it produces:

```jsonc
{
  "name": "DependencyAtlas",
  "promotionPolicy": "auto"                   // "auto" | "operator-review"
}
```

---

## 5 — Project Compose Model

Each SI project lives on disk as a self-contained tree. One Docker host can run many SI projects side by side; each is a single `docker compose up`.

### 5.1 — Directory layout

```
projects/<project>/
├── compose.yml                 — Docker compose stack
├── .env                         — environment + secrets (gitignored)
├── manifest.json                — resolved template manifest (template + overrides)
├── config/
│   ├── parsers/<parser>.json    — per-parser config
│   └── analysts/<analyst>.json  — per-analyst config
├── data/
│   ├── inputs/                  — ingested input artifacts (or sym-mounted from S3)
│   ├── dsl/                     — parser-emitted .sigdsl streams
│   └── graph/                   — graph backend's persistent volume (mounted)
├── audit.ledger                 — chainblocks audit ledger (append-only)
└── outputs/                     — GraphReader output (git-initialized; REQ-SI-106)
```

### 5.2 — Docker compose stack

The resolved `compose.yml` declares four services: `studio`, `graph`, `window`, `identity`. Each is a separate container; the project gets its own bridge network so containers are isolated from other SI projects on the same host.

```yaml
version: "3.9"
networks:
  si-<project>:
    driver: bridge
services:
  identity:
    image: bangauth:latest
    networks: [si-<project>]
    ports:
      - "${IDENTITY_HOST_PORT}:4000"
    volumes:
      - ./data/identity:/data
  studio:
    image: si-studio:0.1.0
    depends_on: [identity, graph]
    networks: [si-<project>]
    ports:
      - "${STUDIO_HOST_PORT}:3000"
    volumes:
      - ./config:/etc/si/config:ro
      - ./data:/var/si/data
      - ./audit.ledger:/var/si/audit.ledger
    environment:
      - SI_PROJECT=<project>
      - SI_IDENTITY_URL=http://identity:4000
      - SI_GRAPH_URL=bolt://graph:7687
  graph:
    image: polygraph:latest
    networks: [si-<project>]
    volumes:
      - ./data/graph:/data
  window:
    image: si-window:0.1.0
    depends_on: [identity, graph]
    networks: [si-<project>]
    ports:
      - "${WINDOW_HOST_PORT}:3001"
    environment:
      - SI_IDENTITY_URL=http://identity:4000
      - SI_GRAPH_URL=bolt://graph:7687
```

### 5.3 — Port allocation

The CLI maintains `~/.si/ports.json` to allocate non-conflicting host ports across projects:

```jsonc
{
  "dla-stores": { "studio": 30001, "window": 30002, "identity": 30003 },
  "piee-cor":   { "studio": 30011, "window": 30012, "identity": 30013 }
}
```

`si init` requests three ports starting from `30000`; `si destroy` releases them.

### 5.4 — Volume conventions

| Volume | Mounted at | Purpose |
|--------|------------|---------|
| `./config` | `/etc/si/config:ro` | Read-only template-derived config |
| `./data` | `/var/si/data` | Writable runtime data (inputs, dsl, graph) |
| `./audit.ledger` | `/var/si/audit.ledger` | The chainblocks ledger file (bind-mounted) |
| `./outputs` | `/var/si/outputs` | GraphReader output |

### 5.5 — Network isolation

Each project's compose stack uses a dedicated bridge network named `si-<project>`. No cross-project networking is configured. Operators wishing to share data between projects do so explicitly via `si export-graph` + `si import-graph` (which emit `si.export.created` and `si.import.applied` audit events).

---

## 6 — Identity Model

SI/I is the authoritative source for "who is acting on this project, and what may they do." It is a per-project service; identities are global (a user has one id across projects) but role grants are per-project.

### 6.1 — User record schema

```jsonc
{
  "userId": "alice@example.com",            // canonical id; opaque to SI
  "displayName": "Alice Example",
  "email": "alice@example.com",
  "createdAt": "2026-05-19T12:00:00Z",
  "lastSeenAt": "2026-05-19T14:32:11Z",
  "status": "active"                         // "active" | "disabled"
}
```

The user record is held by the identity backend (bangauth or OIDC IDP). SI/I caches it on first authenticated request.

### 6.2 — Role grant record schema

Role grants are **append-only**. A revocation is a new record, not a mutation.

```jsonc
{
  "grantId": "g_01HX...",
  "projectId": "dla-stores",
  "userId": "alice@example.com",
  "role": "Operator",                        // see §6.3
  "grantedBy": "owner@example.com",          // userId of the granting Owner
  "grantedAt": "2026-05-19T12:00:00Z",
  "revoked": false,
  "revokedBy": null,
  "revokedAt": null,
  "auditBlock": 47                            // chainblocks seq of the si.role.granted event
}
```

A user's **effective roles** on a project are the set of `role` values from non-revoked grants. Multiple grants are additive (a user may be both Operator and Analyst, though in practice Operator subsumes Analyst).

### 6.3 — Role permission matrix

This matrix is the **canonical declaration for REQ-SI-074.** The five roles are fixed in v0.1; custom roles are out of scope.

Legend: ✓ = allowed, — = denied.

| Action | Owner | Operator | Analyst | Reviewer | Customer |
|--------|:-----:|:--------:|:-------:|:--------:|:--------:|
| `si init` (create project) | ✓ | — | — | — | — |
| `si destroy` (delete project) | ✓ | — | — | — | — |
| `si grant` / `si revoke` (manage roles) | ✓ | — | — | — | — |
| Configure template / parsers / analysts | ✓ | — | — | — | — |
| `si ingest` (add input) | ✓ | ✓ | — | — | — |
| Reclassify an input | ✓ | ✓ | — | — | — |
| Run a parser | ✓ | ✓ | — | — | — |
| Run an analyst | ✓ | ✓ | ✓* | — | — |
| View BB substrate (proposals, conflicts) | ✓ | ✓ | ✓ | — | — |
| Promote a BB proposal | ✓ | ✓ | — | — | — |
| Resolve a BB conflict | ✓ | ✓ | — | — | — |
| Override / dismiss a finding | ✓ | ✓ | — | — | — |
| Add tribal knowledge node | ✓ | ✓ | ✓ | — | — |
| `si report` (regenerate deliverables) | ✓ | ✓ | — | — | — |
| `si export-graph` | ✓ | ✓ | — | — | — |
| `si import-graph` | ✓ | — | — | — | — |
| View SI/W full deliverable set | ✓ | ✓ | ✓ | ✓ | — |
| Comment on findings in SI/W | ✓ | ✓ | ✓ | ✓ | — |
| View SI/W curated customer subset | ✓ | ✓ | ✓ | ✓ | ✓ |
| View audit ledger | ✓ | ✓ | ✓ | ✓ | — |
| Run `si verify` | ✓ | ✓ | ✓ | ✓ | — |
| View graph backend directly (raw query) | ✓ | — | — | — | — |
| Access raw inputs (download) | ✓ | ✓ | — | — | — |

*Analyst-run analysts are limited to those declared `analystRunnable: true` in the template; defaults to false.

### 6.4 — Token model

A successful authentication produces a token consumed by SI/S and SI/W on every subsequent request.

**Default (bangauth):** opaque bearer token, server-side session table, 8h TTL.

**OIDC:** JWT signed by the configured IDP; SI/I verifies signature, expiry, and audience claim. JWTs carry the `sub` claim mapped to `userId`. 8h default TTL (configurable via template).

Tokens are passed in the `Authorization: Bearer <token>` header to SI/S and SI/W. SI/I exposes a `POST /resolve` endpoint that, given a token, returns `{ userId, displayName, effectiveRoles: ["Operator", ...] }` for a given `projectId`. SI/S and SI/W call this once per request and cache the result for the request lifetime.

Tokens are **never written to logs, audit events, or graph nodes.** Only the `userId` propagates.

### 6.5 — Session lifecycle

1. `si login` → bangauth email-and-code exchange, or OIDC code flow → token issued.
2. CLI caches token at `~/.si/credentials` (mode 0600).
3. CLI passes token to SI/I on every project-affecting request.
4. SI/I resolves user + roles, returns to caller.
5. Caller proceeds (or refuses with a clear authz error) and emits the chainblocks audit event with `actor.userId`.

---

## 7 — Forward Compatibility

### 7.1 — What v0.x allows (additive only)

The following changes within a v0.x line are **non-breaking**:

- New Tier-2 node labels within an existing solution domain (e.g. adding `ba.<new_label>` to the business automation domain)
- New Tier-2 solution domains (e.g. introducing `mfg.*`, `clin.*`, `infra.*`, `research.*`)
- New Tier-3 implementation-paradigm namespaces (e.g. introducing `cs_2045.*` beside the existing `cs_2026.*`)
- New Tier-3 node labels within an existing paradigm namespace
- New edge types (§2.2)
- New chainblocks audit-event kinds (§3.2)
- New optional fields on any schema (DSL records, audit payloads, template manifest, identity records)
- New CLI subcommands
- New roles **only** as additive grants in templates (the 5-role default is fixed in v0.1; custom roles are explicitly deferred to a future major version)

Consumers reading older streams against newer SI must ignore unknown labels/types/kinds/fields without erroring.

### 7.2 — What requires a major bump

The following changes require **v0 → v1**:

- Renames or removals of any node label at any tier, edge type, audit-event kind, or required field
- **Any change to the Tier-1 solution-universal vocabulary** — the timeless spine is the load-bearing layer the substrate-independence claim depends on; additions, renames, removals, and semantic changes all require a major bump and a documented migration. (Compare: additions within an existing Tier-2 domain or Tier-3 paradigm are routine.)
- Semantic changes to existing fields (e.g., changing `input_class` allowed values)
- Format breaks (e.g., changing DSL from JSONL to a different serialization)
- Promotion-policy semantic changes (e.g., changing `tribal_knowledge` from operator-review-default to auto-promote-default)
- Permission-matrix changes that remove an existing role's permissions
- Container-set or compose-stack restructuring that breaks the four-service layout

A major bump ships with a migration tool (`si migrate`) that produces a v1-compliant export from a v0 project.

### 7.3 — Version declaration

Every SI artifact declares its schema version:

- `.sigdsl` files declare via the header comment (`// sigdsl/v1`)
- Template manifests declare via `version` (template) and `siVersion` (compatibility range)
- chainblocks audit events declare via the chainblocks block format
- The graph backend records `siSchemaVersion` and a `domainNamespaces` list (e.g. `["ba"]`) and a `paradigmNamespaces` list (e.g. `["cs_2026"]`) as properties on a singleton `_Meta` node at first write; each subsequent ingestion may add to these lists

---

## 8 — Provenance

Every node and edge in SI/G is provenanced. The `provenance` property carries:

```jsonc
{
  "parser": "csharp-treesitter@0.1.0",     // for ground-truth-class nodes
  "analyst": "Inventory@0.1.0",             // for analyst-output nodes
  "inputId": "input_01HX...",               // the InputArtifact id this derives from
  "dslPath": "data/dsl/input_01HX....sigdsl",
  "dslLine": 142,
  "createdFromBlock": 87                     // chainblocks seq
}
```

The combination `(dslPath, dslLine, createdFromBlock)` is the **golden chain**: any node or edge in SI/G can be walked back to the exact DSL record that proposed it, to the exact audit event that recorded its promotion, to the parser version that produced it, to the input artifact it derived from.

This is the bridge between intent and implementation that STORY.md promises. The graph does not just hold facts; it holds the provenance of every fact, and the audit ledger holds the timeline of every fact's life.

---

## Provenance of this document

`MODEL.md` is the result of distilling the §"Component models" sketches in `STORY.md`, the schema obligations in `REQUIREMENTS.md`, the pipeline architecture in `docs/PIPELINE.md`, and the bookend-bundle precedent set by `artifacts/chainblocks/MODEL.md`.

The role permission matrix in §6.3 is the canonical declaration for **REQ-SI-074**. The 18 chainblocks block kinds in §3.2 are the canonical declaration for **REQ-SI-091**. The DSL schema in §1 is the canonical declaration for **REQ-SI-110 through REQ-SI-115**. The promotion policy in §2.4 is the canonical declaration for the doctrinal anchor in STORY.md §"The doctrinal anchor."

Where this document and STORY.md disagree, STORY.md governs intent and MODEL.md governs format; the contradiction is a defect and should be filed.

Where this document and REQUIREMENTS.md disagree on a numbered requirement, REQUIREMENTS.md governs and MODEL.md is the defect.

Where this document and the running code disagree, the running code is the defect — until the spec is changed deliberately and a chainblocks audit event records the change.

---

*MODEL.md v0.1 — Solution Intelligence. Companion to STORY.md and REQUIREMENTS.md.*
