# Solution Intelligence SIG — Schema

The Solution Intelligence SIG is a PolyGraph-backed knowledge graph derived from the seven bookend documents:

- `STORY.md`
- `REQUIREMENTS.md`
- `MODEL.md`
- `docs/PIPELINE.md`
- `docs/USE-CASES.md`
- `docs/FEATURES.md`
- `docs/OVERVIEW.md`

The SIG is a **derived artifact** — the markdown files are the source of truth; re-running ingestion produces the SIG fresh. The SIG itself is the *first concrete consumer* of the three-tier schema declared in `MODEL.md` §2.1, even though this SIG is about the bookend documents rather than about a customer solution.

**Why PolyGraph (not Neo4j):** SI's first instance dogfoods our own graph engine the same way the chainblocks SIG did. If a small bookend graph cannot be made nice, that's a finding we want to know about.

**Where it lives:** `artifacts/solution-intelligence/sig/data/` (LevelDB files via `LevelAdapter`). Gitignored. Regenerable from the markdown.

---

## How this schema relates to the three-tier framework

This SIG is *about the bookend documents*. It is not modeling a customer solution; it is modeling the design corpus that will eventually produce framework code. Its node labels are therefore *bookend concepts* — `Requirement`, `Feature`, `UseCase`, `DoctrinePrinciple`, `SchemaLabel`, and so on. The three-tier framework declared in `MODEL.md` §2.1 lives **inside** this SIG as a set of `SchemaLabel` nodes carrying a `tier` property; it is not the labeling scheme this SIG itself uses.

In other words: the SI framework's labels (`constraint`, `ba.process`, `cs_2026.endpoint`) become *data* in this SIG, not labels of this SIG. That keeps the two concerns cleanly separated.

---

## Node types

| Label | Description | Provenance source |
|-------|-------------|-------------------|
| `Project` | The Solution Intelligence project itself; root node | All files |
| `SourceDoc` | One of the seven bookend documents | (all bookend files) |
| `DoctrinePrinciple` | One of the doctrinal commitments | `STORY.md` §VI |
| `Component` | SI/S, SI/G, SI/W, SI/I | `STORY.md`, `OVERVIEW.md` |
| `EpistemicClass` | One of the six input classes (ground-truth, aspirational-intent, etc.) plus analyst-output | `STORY.md`, `OVERVIEW.md`, `MODEL.md` |
| `SchemaLabel` | A node label declared in the SI framework schema (Tier 1, Tier 2, or Tier 3) | `MODEL.md` §2.1 |
| `EdgeType` | An edge type declared in the SI framework schema | `MODEL.md` §2.2 |
| `SolutionDomain` | A Tier-2 solution domain (`ba`, plus future `mfg`/`clin`/`infra`/`research`) | `MODEL.md` §2.1 Tier-2 |
| `ParadigmNamespace` | A Tier-3 implementation paradigm (`cs_2026`, plus future eras) | `MODEL.md` §2.1 Tier-3 |
| `Requirement` | REQ-SI-NNN (or REQ-SI-NF-NNN) | `REQUIREMENTS.md` |
| `Feature` | FT-SI-NN | `docs/FEATURES.md` |
| `UseCase` | UC-N | `docs/USE-CASES.md` |
| `Deliverable` | One artifact from the standard deliverable suite | `STORY.md`, `OVERVIEW.md` |
| `PipelineStep` | One of the seven pipeline steps | `docs/PIPELINE.md` |
| `Role` | One of the five role labels (Owner, Operator, Analyst, Reviewer, Customer) | `STORY.md`, `MODEL.md` §6.3 |
| `AuditBlockKind` | One of the 17 declared chainblocks block kinds | `MODEL.md` §3.2 |
| `NonGoal` | One of the explicit "what we will not build" items | `STORY.md`, `OVERVIEW.md` |

### Multi-label conventions

Per PolyGraph's multi-label support, every node carries its primary type label AND a `Bookend` label, so any query like "show me everything in the bookend bundle" is `findNodes('Bookend')`.

Convention: `[<Type>, 'Bookend']` for every node except `Project` (which gets `['Project']` alone).

---

## Edge types

| Type | From → To | Semantics |
|------|-----------|-----------|
| `BELONGS_TO` | any → `Project` | All nodes ultimately belong to the SI project |
| `TRACED_TO` | any → `SourceDoc` | Every node carries provenance to a source doc + line range |
| `HOLDS_PRINCIPLE` | `Project` → `DoctrinePrinciple` | The project commits to this principle |
| `IMPLEMENTS` | `Feature` → `Requirement` | A feature satisfies a requirement |
| `EXERCISES` | `UseCase` → `Requirement` | A use case validates a requirement at runtime |
| `INVOLVES` | `UseCase` → `Feature` | A use case relies on a feature |
| `PRODUCES` | `UseCase` → `Deliverable` | A use case produces a deliverable artifact |
| `GUIDED_BY` | `Feature`/`Requirement` → `DoctrinePrinciple` | A feature or requirement is shaped by a principle |
| `STAGED_BY` | `PipelineStep` → `Component` | A pipeline step runs in a component |
| `BELONGS_TO_DOMAIN` | `SchemaLabel` → `SolutionDomain` | A Tier-2 label belongs to a domain |
| `BELONGS_TO_PARADIGM` | `SchemaLabel` → `ParadigmNamespace` | A Tier-3 label belongs to a paradigm |
| `HAS_TIER` | `SchemaLabel` → tier (as prop) | (Represented as a `tier` property on `SchemaLabel`, not a relationship) |
| `EXCLUDES` | `Project` → `NonGoal` | The project declares the non-goal |
| `ALLOWS_ROLE` | `Feature` → `Role` | A feature is gated by a role (e.g. only Owner may grant) |
| `EMITS_BLOCK` | `Feature` → `AuditBlockKind` | A feature emits a chainblocks audit event of this kind |
| `OF_CLASS` | `SchemaLabel` → `EpistemicClass` | A schema label's natural epistemic class (e.g. `cs_2026.function` is ground-truth) |

### Edge properties

Every edge carries:

- `via`: file path + line range where the edge is sourced (e.g. `"docs/FEATURES.md:13-29"`)
- `confidence`: `"explicit"` (extracted from a cross-reference table) or `"inferred"` (derived by ingestion logic with rationale)

---

## Node properties

### Common to all node types

- `id`: stable string id (e.g. `"REQ-SI-016"`, `"FT-SI-07"`, `"UC-3"`, `"principle:cultivate-the-model"`, `"label:ba.process"`)
- `name`: human-readable label
- `summary`: one-sentence description
- `bodyMarkdown`: the relevant markdown excerpt (verbatim from source)
- `sourceFile`: e.g. `"REQUIREMENTS.md"`
- `sourceLineStart` / `sourceLineEnd`: line range in source

### Requirement-specific

- `category`: `"functional"` or `"non-functional"`
- `categoryGroup`: e.g. `"Project lifecycle"`, `"Identity"`, `"DSL"`, `"Performance"`, `"Security"`, etc.

### Feature-specific

- `requirementsCount`: count of REQs the feature satisfies (per the matrix)
- `useCasesCount`: count of UCs the feature is exercised by

### UseCase-specific

- `withoutSummary`: what the "Without SI" answer is
- `withSummary`: what the "With SI" answer is

### SchemaLabel-specific

- `tier`: `1`, `2`, or `3`
- `qualifiedName`: e.g. `"constraint"`, `"ba.process"`, `"cs_2026.function"`
- `domain`: for Tier-2, the domain prefix (`"ba"`); null for Tier-1 and Tier-3
- `paradigm`: for Tier-3, the paradigm prefix (`"cs_2026"`); null for Tier-1 and Tier-2

---

## What the SIG enables

Three classes of question the SIG can answer that the prose cannot:

**1. Coverage.** Which requirements are not exercised by any use case? Which features satisfy no requirement? Which doctrinal principles are not cited as guiding any feature? Which schema labels appear in `MODEL.md` but have no role in any use case?

**2. Drift.** Where does the same concept appear with different names across documents? Where does the count claimed in one document disagree with the count derivable from another? (E.g. STORY says "twelve doctrinal commitments"; the SIG counts them.)

**3. Traceability.** Given an arbitrary claim in any one document, walk back to the originating commitment. Given a single REQ, find the doctrine it serves, the feature that implements it, the UC that exercises it, the schema labels it depends on.

These are the same three classes of question the eventual SI framework will answer for *customer* solutions. The bookend SIG is the smallest possible smoke test of the methodology, applied to its own design corpus.

---

*SCHEMA.md v0.1 — Solution Intelligence SIG. Companion to `scripts/ingest.ts` and `FINDINGS.md`.*
