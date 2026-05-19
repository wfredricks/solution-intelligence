# Solution Intelligence — Overview

*Structured reference for the Solution Intelligence framework. Companion to `STORY.md` (the why and the methodology) and the specification documents (`REQUIREMENTS.md`, `MODEL.md`). Read STORY first if you want to understand what Solution Intelligence is; read this if you want the concrete framework at a glance.*

---

## The four components

A Solution Intelligence project instantiates four named components. Each runs as its own Docker service inside the project's compose stack.

### SI/S — Studio

The **developer workbench, which is the Blackboard.** Studio = the BB substrate + a developer UI on top of it. Operationally there is no "Studio without BB" or "BB without Studio" — they are the same thing, viewed from two angles. Studio is what an engineer, analyst, or build-engineer uses to *make* the intelligence.

Studio is responsible for:

- Receiving inputs (S3 bucket ingestion, drag-and-drop files, directory ingestion, API uploads)
- Routing each input to the right parser based on its declared epistemic class
- Running the parser → DSL → GraphLoader pipeline; promotions land in SI/G
- Running the analyst chain (analysts read SI/G + post derived findings back to the BB substrate, which GraphLoader then promotes)
- Producing deliverable artifacts via GraphReader (reports, exports, generated code) into the output bucket
- Providing a developer UI to inspect BB substrate state, manually trigger analysts, re-ingest, override findings, and intervene
- Writing every significant event to a chainblocks ledger with user attribution

**Studio internals — the BB substrate doing the work.** This is the classic blackboard architecture pattern (Hayes-Roth 1985, refined through decades of expert-systems and multi-agent work): a shared workspace where specialist knowledge sources post hypotheses, where a controller decides which contributions advance the analysis, and where the eventual answer emerges from coordinated specialist work. The BB substrate inside Studio is where parsers post structural proposals as a typed `.sigdsl` stream, GraphLoader pulls validated proposals and promotes them to SI/G, analysts post derived findings, cross-cutting reasoners post integration claims, conflicts get noticed and surfaced, and promotion rules decide what becomes durable in SI/G.

Studio is the *box* you instantiate per project. Each Solution Intelligence engagement gets its own Studio container set. **The BB substrate may eventually be extracted as a standalone library** — in that case, what graduates is the substrate alone; Studio's developer UI stays with Studio.

### SI/G — Graph

The **durable artifact.** This is the Solution Intelligence Graph (the "SIG" in the project vocabulary): a queryable knowledge graph that encodes everything Studio's Blackboard work has accumulated. Typed nodes (CodeFile, IntendedBehavior, Constraint, Evidence, Pattern, SMEClaim, ...) and typed edges (`INTENDS_TO_IMPLEMENT`, `SATISFIES`, `DRIFTS_FROM`, `EVIDENCED_BY`, `TAGGED_AS`, `CITED_BY`, ...) with provenance every step. Full schema in `MODEL.md` §2.

SI/G is what survives the engagement. After Studio is torn down, after Window is no longer being viewed, the Graph remains as the auditable record of the project's intelligence. Adopters can re-query, extend with new inputs, or hand it to the next analyst.

Backed by PolyGraph (default for v0.1) or Neo4j (optional, declared in the template manifest).

### SI/W — Window

The **consumer-facing UI.** Distinct from Studio's developer UI: Window is what an analyst, reviewer, customer, or stakeholder uses to *see* the intelligence — read-mostly, polished, dashboard-shaped. Where Studio is the workshop (raw, operational, "here are the levers"), Window is the gallery (curated, navigable, "here is what we found").

Window queries SI/G and renders the standard deliverable artifacts (inventory reports, dependency atlases, intent-vs-reality maps, constraint coverage matrices, risk surfaces, modernization roadmaps, pattern classifications, executive briefings). Role-scoped view scoping is enforced at the API boundary, not just hidden in the UI.

### SI/I — Identity

The **authentication and authorization layer.** Solution Intelligence is multi-user from day one — real identities, real roles, real audit attribution. Identity is not bolted on later; it is a first-class component.

SI/I is responsible for:

- Authenticating operators, analysts, reviewers, and customers (bangauth by default for dev/internal use; OIDC adapter for enterprise and government deployments)
- Issuing session tokens consumed by both SI/S and SI/W
- Resolving per-project role assignments (who is Owner / Operator / Analyst / Reviewer / Customer on this project)
- Attribution: every operator action carries the acting user id, which is what chainblocks records — not "the system did X," but "alice@example.com did X"

Full identity data model in `MODEL.md` §6; canonical role permission matrix in `MODEL.md` §6.3.

---

## How the components compose (one project)

A single Solution Intelligence engagement instantiates its **own container set** — strict isolation, no shared services across projects. One Docker host can run many SI projects side by side; each is a self-contained compose stack.

```
SI project (e.g. "dla-stores")  — its own Docker compose stack
├── SI/I — Identity service (bangauth or OIDC adapter)
├── SI/S — Studio (BB substrate + developer UI)
│   ├── Parsers (Tree-sitter, ANTLR, PDF, markdown, ...)
│   ├── BB substrate (where parsers post .sigdsl, where analysts work)
│   ├── GraphLoader (the only writer to SI/G)
│   ├── Analysts (Inventory, Dependency Atlas, ...)
│   ├── GraphReader (produces deliverables into the output bucket)
│   ├── Developer UI (web; operator-facing; concurrent-operator support)
│   └── chainblocks ledger (audit trail of significant events, with user attribution)
├── SI/G — Graph (backed by PolyGraph or Neo4j; durable)
└── SI/W — Window (web; consumer-facing; role-scoped views)
```

Plus two external buckets that bracket the pipeline:

- **Input bucket** (S3) — customer's raw data (codebase, design docs, RFPs, evidence, ...)
- **Output bucket** (S3) — deliverable artifacts in git-folder structure (reports, graph export, derived code, DSL, audit ledger archive). SI/W reads from this bucket.

One SI/S, one SI/G, one SI/W, one SI/I per project. Multiple operators connect concurrently to the same SI/S; their actions are attributed individually in the chainblocks ledger and in BB substrate state. Each is a Docker service; the whole engagement is `docker compose up`. Full pipeline diagram and step-by-step walk-through in `docs/PIPELINE.md`.

---

## Default roles

Per-project; a person may have different roles on different projects. The full permission matrix is in `MODEL.md` §6.3. Summary:

| Role | What they can do in SI/S (Studio) | What they can do in SI/W (Window) |
|------|-----------------------------------|-----------------------------------|
| **Owner** | Everything (configure, ingest, run, override, export, delete) | Everything |
| **Operator** | Ingest, run analysts, view BB, accept findings, add tribal knowledge | View everything |
| **Analyst** | View BB (read-only), run analysts on existing inputs, add tribal knowledge | View everything |
| **Reviewer** | (no Studio access) | View everything; comment on findings |
| **Customer** | (no Studio access) | View curated deliverable subset; no raw BB |

---

## Input classes — the doctrinal anchor

Different inputs have different epistemic status. The framework encodes the distinctions and lets analysts reason accordingly. This is the heart of Solution Intelligence and its most important architectural commitment.

| Input class | Examples | Epistemic status | How SI treats it |
|-------------|----------|------------------|------------------|
| **Ground truth** | Source code (C#, COBOL, Java, SQL, ...), compiled binaries, database schemas, deployed configuration | Hard truth — describes what the system actually does | Parsed authoritatively; SI/G nodes derived from it are the factual claims about behavior. Conflicts with other inputs are resolved against ground truth unless explicitly noted otherwise. |
| **Aspirational intent** | Design documents, architecture diagrams, ADRs, vision white papers, slide decks | What was *intended* — may be wrong, outdated, or never fully implemented | Encoded as `IntendedBehavior` nodes; linked to ground-truth nodes via `INTENDS_TO_IMPLEMENT` edges; conflicts surface as `DRIFTS_FROM` edges. Critical not to treat as truth. |
| **Constraint / contract** | RFPs, Performance Work Statements (PWS), Statements of Work (SOW), SLAs, compliance specs (NIST, FAR, FedRAMP) | Binding obligations the system must demonstrably satisfy | Encoded as `Constraint` nodes; impact analysis surfaces what ground-truth code/configuration must satisfy them; uncovered constraints are flagged as risk. |
| **Evidence / history** | Application logs, transaction records, test outputs, incident reports, audit trails, observability data | What actually happened in operation | Encoded as `Evidence` nodes; supports "this constraint was met / violated on this date" claims. |
| **Tribal knowledge** | Interview notes, meeting transcripts, SME annotations, Slack-channel archeology | High value, low rigor, person-attributed | Encoded as `TribalKnowledge` nodes with confidence scores and source-person attribution; typically annotates other nodes rather than standing alone. |
| **Reference material** | Industry standards (NIST 800-53, FAR clauses), architectural patterns (EIP, POSA, WAF), prior-art codebases | External truth, slow-moving | Encoded as `ReferencePattern` nodes; classification edges from project artifacts to these establish "this code implements pattern X" or "this requirement maps to control Y". |

Every SI project starts by declaring **which input classes are present** and **which parsers handle each kind**. This is the "tuning" — the customer-specific mix.

---

## The standard deliverable suite

A Solution Intelligence project produces a defined set of artifacts. Not every project produces every artifact — the set is calibrated to which input classes were present and which questions the engagement is asking. The *menu* is standard:

| Artifact | What it answers | Primary input classes | Audience |
|----------|----------------|-----------------------|----------|
| **Inventory Report** | What's in here? (files, modules, languages, sizes, complexity) | Ground truth | Tech leads, capture team |
| **Dependency Atlas** | What depends on what? (module graph, fan-in/fan-out, hot spots) | Ground truth | Architects, migration planners |
| **Intent-vs-Reality Map** | Where does the design lie? (design claims vs code reality) | Ground truth + aspirational | Architects, sponsors |
| **Constraint Coverage Matrix** | What contracts are demonstrably met? (RFP/SLA → code traceability) | Constraint + ground truth | Compliance, contracts |
| **Risk & Anomaly Surface** | What should we worry about? (complexity hotspots, dead code, undocumented patterns, single-points-of-failure) | Ground truth + evidence | Tech leads, PMs |
| **Modernization Roadmap** | How do we move from here to there? (phased migration path with effort estimates) | Ground truth + constraint | Sponsors, capture team |
| **Pattern Classification** | What patterns is this code an instance of? (NIST/EIP/POSA/FAR tagging on relevant artifacts) | Ground truth + reference | ATO/FedRAMP teams |
| **Tribal Knowledge Annotation Layer** | What do the people who know say? (SME claims attached to specific artifacts, with confidence) | Tribal | Future maintainers |
| **Executive Briefing** | The two-slide / one-pager version | (synthesis of above) | Leadership, customer |
| **MCP / HTTP API Endpoint** | Live programmatic access | (queries against SI/G) | Downstream tools, agents, future engagements |
| **Audit Trail** | What did the analysis itself do, in what order, with what reasoning? | (Studio's chainblocks ledger) | Customer review, compliance |

The suite is the deliverable. The Graph is the substrate. Window is how a stakeholder reads them. Studio is where they were made.

---

## Sibling projects

| Project | Role relative to SI |
|---------|---------------------|
| **chainblocks** | A library. SI uses chainblocks ledgers for audit. The two are designed together but ship independently. |
| **PolyGraph** | A library. SI/G is typically backed by PolyGraph (default) or Neo4j (heavy codebase analysis). |
| **bangauth** | A library. If SI/W or SI/S need auth at deployment time, bangauth is the default. |
| **(future) Blackboard project** | Likely the harvested SI/BB once it has been proven through SI's use. Speculative until SI demands extraction. |
| **twin** | Independent project. The twin may consume SI Graphs as a knowledge source in the future, but SI does not depend on twin. |
| **AuditInsight, ALMSS, etc.** | Will eventually be re-instantiated as SI projects, replacing their one-off pipelines. |

---

## Non-goals — what we will not build

- **A single shared Graph across all projects.** Cross-pollination of customer data is a hard line. Templates and parsers are shared; data isn't.
- **A SaaS / hosted multi-tenant Solution Intelligence service.** SI is multi-user *within* an engagement; it is NOT multi-tenant *across* engagements on a shared backend. No "solution-intelligence.io" public offering.
- **A general-purpose graph database.** SI/G is PolyGraph or Neo4j under the hood; SI does not invent its own.
- **A general-purpose blackboard system marketed separately, today.** The Blackboard inside Studio will likely become a standalone project — but only after it has been proven by use in SI.
- **An LLM-only system.** Templates and analysts use LLMs where appropriate (tiered processing per the AuditInsight v2 lesson), but the framework is deterministic-first. LLMs solve disambiguation, not arithmetic.
- **Sharp interpretive judgment on behalf of the customer.** SI surfaces findings; it does not declare "this codebase is bad" or "this RFP is unwinnable." The operator and the customer interpret.
- **Replication of capture-management workflow.** SI feeds capture and delivery; it does not replace the human capture team.

---

## Build path

Solution Intelligence is being built to the bar set by the GitHub Published Projects playbook. Before v0.1.0 ships:

| Pillar | What lands |
|--------|-----------|
| Narrative | `README.md`, `STORY.md`, `docs/OVERVIEW.md` (this file) |
| Reference | `REQUIREMENTS.md`, `MODEL.md`, `docs/PIPELINE.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`, JSDoc ≥90% on exports, `examples/` |
| Governance | `LICENSE` (Apache 2.0), `CONTRIBUTING.md`, `SECURITY.md` (project-isolation threat model), `CODE_OF_CONDUCT.md`, `CHANGELOG.md` |
| Automation | `.github/workflows/ci.yml`, template-instantiation smoke tests, the SIG ingestion clean-run gate |

### v0.1 scope (the minimum viable framework)

- **One template** ready: `csharp-to-servicenow` (driven by the DLA Stores engagement)
- **One smoke-test template**: `prose-doc` (re-instantiates the chainblocks bookend bundle through SI; proves the framework handles small/easy cases)
- **Per-project container set** — each SI project is its own compose stack with no shared services
- **SI/I (Identity)** running as its own service with bangauth as the default backend and an OIDC adapter stub for enterprise/gov deployments
- **5-role authorization model** (Owner / Operator / Analyst / Reviewer / Customer) enforced at the SI/S and SI/W API boundaries
- **SI/S (Studio)** runnable as a Docker service with the developer UI and concurrent-operator support
- **SI/G (Graph)** persistent (PolyGraph default; Neo4j optional)
- **SI/W (Window)** present as a minimal but functional consumer UI with role-scoped views
- **chainblocks** wired in for significant-event auditing, with every entry carrying the acting user's identity
- **CLI** (`si init`, `si ingest`, `si analyze`, `si report`, `si verify`) — operator commands authenticate against SI/I before acting
- The standard analyst suite for v0.1: Inventory, Dependency Atlas, Intent-vs-Reality, Constraint Coverage, Risk Surface, Pattern Classification

### Out of scope for v0.1

- The full multi-template library (COBOL, Java, transaction analysis come in v0.2)
- The fully-automated executive briefing generator (v0.2)
- Customer-supplied OIDC adapters beyond a generic stub (v0.2 — the first real customer's IDP is the calibration target)
- Cross-project user management (each project manages its own role assignments in v0.1; a separate "SI admin console" managing users across projects is a v0.2 candidate if demand emerges)
- Open-source release (v0.2 or later, after internal proving)
- Extraction of the Blackboard as a standalone project (v0.3, possibly later — speculative)

---

## Voice notes for project documentation

- **Honor the epistemic distinctions.** Never speak of "documents" as a flat bag. Always say which class.
- **First-person plural ("we") when stating doctrine; second-person ("you") when explaining usage.** Never "the user" in product-voice contexts — prefer the role (Operator, Analyst, Reviewer, Customer) so the doc is precise about who is doing what.
- **Component IDs (SI/S, SI/G, SI/W, SI/I) are short stable references.** Use them in cross-doc citations. "BB" or "the BB substrate" refers to the substrate inside Studio; it is not a top-level component.
- **The deliverable suite list is the menu, not the menu's items.** A given project produces a calibrated subset, not the whole list.
- **chainblocks is "the audit trail," not "the blockchain."** Tamper-evident, not tamper-proof. Cite the audit when it matters; do not promise more than the substrate delivers.
- **Audit attribution is always to a person, never to "the system."** Every action in SI is attributable to a named user; documentation should read accordingly ("the Operator triggers ingestion," not "the system ingests").

---

*OVERVIEW.md v0.1 — Solution Intelligence. Structured reference; see STORY.md for the why.*
