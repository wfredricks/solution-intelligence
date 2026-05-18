# The Solution Intelligence Story

*Why this project exists, who it's for, what it produces, and the doctrine that shapes its design.*

**Status:** Left-bookend draft, 2026-05-18.
**License (intended):** Apache 2.0 (internal first, open-source eventually).
**First instantiations:** DLA Stores (C# → ServiceNow migration), chainblocks (prose-only smoke test).

---

## The problem

Every government and enterprise software engagement starts the same way: a customer hands over a heterogeneous bundle of artifacts — source code, design documents, RFPs, transaction logs, compliance specifications, SME interviews, runbooks — and asks "what is this, what does it do, what are we going to do about it?"

Today, the answer comes through **bespoke effort**:
- A senior engineer reads enough of the codebase to develop an opinion
- An architect reads enough of the design docs to find the seams
- A capture manager reads enough of the RFP to know what's binding
- An analyst reads enough of the logs to spot the anomalies
- Everyone produces slides; a roll-up document gets assembled; the engagement begins

This works once. It is wasteful by the third engagement, because **the same pattern of inputs → analysis → standard artifacts is being executed by hand, every time, with no carryover.**

We have done a version of this five or six times already in 2025–2026: AuditInsight (DLA P2P transactions), ALMSS (AFRL COBOL modernization), DLA Stores (incoming C# → ServiceNow), PIEE (DLA Java analysis), Eden Township (ordinance graph), and several smaller proofs. Each engagement reinvented its own ingestion pipeline, its own graph schema, its own analyst chain, its own deliverable format.

**The pattern is already there in our work.** What's missing is the framework that pulls it together so the *next* engagement is a one-day instantiation, not a one-month build.

That framework is Solution Intelligence.

---

## What Solution Intelligence is (one paragraph)

**Solution Intelligence (SI) is a project framework — a standardized, instantiable kit that ingests a heterogeneous bundle of project inputs (source code, design docs, requirements, RFPs, transaction data, configuration, SME notes — anything) and produces a queryable Solution Intelligence Graph (SI/G) plus a standard set of analytical artifacts.** Each SI instantiation runs in Docker, knows how to treat each kind of input correctly (code as ground truth, design docs as aspirational intent, RFPs as binding constraints, logs as evidence, SME notes as tribal knowledge), automates as much of the analysis as possible, and produces deep, actionable intelligence in the form of standard deliverables suitable for a customer engagement.

It is the **off-the-shelf factory** for the pattern we have been building one-off six times. After SI, a new engagement looks like: instantiate a Studio, drop the inputs in, run the analysis, hand over the deliverable.

---

## Who is this for?

- **Solutions architects and capture teams** at consulting / federal services firms who need to produce defensible analyses of unfamiliar customer systems on tight engagement timelines
- **Government modernization programs** (DoD, civilian agencies) facing legacy codebase analysis (COBOL, Java, C#, mainframe) where the input is heterogeneous and the deliverable must be auditable
- **Compliance and ATO teams** who need traceability from binding requirements (NIST controls, RFP clauses, contract language) all the way down to specific lines of code that demonstrably satisfy them
- **Internal product teams** who want to inspect their own systems through the same SIG lens, surfacing intent-vs-reality drift before customers do

If you have a bundle of project artifacts and a question — "what's in this?", "does it meet X?", "where's the risk?", "what would migration cost?", "what was the original intent?", "can we trust this audit trail?" — Solution Intelligence is the workbench that answers it.

---

## The components

Solution Intelligence has five named components. They are referred to by short IDs throughout the SI documentation.

### SI/S — Studio

The **developer workbench.** This is the operator's surface — what an engineer, analyst, or build-engineer uses to *make* the intelligence. Studio is responsible for:
- Receiving inputs (drag-and-drop files, directory ingestion, API uploads)
- Routing each input to the right parser based on its declared epistemic class (see "The doctrinal anchor" below)
- Running the Blackboard pipeline against ingested inputs
- Providing a developer UI to inspect Blackboard state, manually trigger analysts, re-ingest, and intervene
- Producing analytical artifacts (reports, dashboards, exports) into the Graph

Studio is the *box* you instantiate per project. Each Solution Intelligence engagement gets its own Studio container set.

### SI/BB — Blackboard

The **cognitive substrate inside Studio.** This is the classic blackboard architecture pattern (Hayes-Roth 1985, refined through decades of expert-systems and multi-agent work): a shared workspace where specialist knowledge sources post hypotheses, where a controller decides which contributions advance the analysis, and where the eventual answer emerges from coordinated specialist work.

SI/BB is where:
- Parsers post structural facts ("this file declares 3 classes")
- Analysts post derived findings ("class Foo has cyclic dependencies on Bar")
- Cross-cutting reasoners post integration claims ("this code section is the implementation of RFP clause §3.4.1")
- Conflicts get noticed and surfaced ("design doc says X; code does Y")
- Promotion rules decide what becomes durable in SI/G

The Blackboard is the working substrate. It is where the *interesting work happens*. SI/G is the durable record of what survives.

### SI/G — Graph

The **durable artifact.** This is the Solution Intelligence Graph (the "SIG" in our vocabulary): a queryable knowledge graph that encodes everything the Studio's Blackboard work has accumulated about the project. Typed nodes (CodeFile, IntendedBehavior, Constraint, Evidence, Pattern, SMEClaim, ...) and typed edges (`INTENDS_TO_IMPLEMENT`, `SATISFIES`, `DRIFTS_FROM`, `EVIDENCED_BY`, `TAGGED_AS`, `CITED_BY`, ...) with provenance every step.

SI/G is what survives the engagement. After Studio is torn down, after Window is no longer being viewed, the Graph remains as the auditable record of the project's intelligence. Adopters can re-query, extend with new inputs, or hand it to the next analyst.

### SI/W — Window

The **consumer-facing UI.** Distinct from Studio's developer UI: Window is what an analyst, reviewer, customer, or stakeholder uses to *see* the intelligence — read-mostly, polished, dashboard-shaped. Where Studio is the workshop (raw, operational, "here are the levers"), Window is the gallery (curated, navigable, "here is what we found").

Window connects to SI/G (queries the graph), is hosted alongside (or distinctly from) Studio, and renders the standard deliverable artifacts: inventory reports, dependency atlases, intent-vs-reality maps, constraint coverage matrices, risk surfaces, modernization roadmaps, pattern classifications, executive briefings.

### SI/I — Identity

The **authentication and authorization layer.** Solution Intelligence is multi-user from day one — real identities, real roles, real audit attribution. Identity is not bolted on later; it is a first-class component.

SI/I is responsible for:
- Authenticating operators, analysts, reviewers, and customers (bangauth by default for dev/internal use; OIDC adapter for enterprise and government deployments)
- Issuing session tokens consumed by both SI/S and SI/W
- Resolving per-project role assignments (who is Owner / Operator / Analyst / Reviewer / Customer on this project)
- Attribution: every operator action carries the acting user id, which is what chainblocks records (not "the system did X," but "alice@example.com did X")

**Default roles** (per-project; a person may have different roles on different projects):

| Role | What they can do in SI/S (Studio) | What they can do in SI/W (Window) |
|------|-----------------------------------|-----------------------------------|
| **Owner** | Everything (configure, ingest, run, override, export, delete) | Everything |
| **Operator** | Ingest, run analysts, view BB, accept findings, add tribal knowledge | View everything |
| **Analyst** | View BB (read-only), run analysts on existing inputs, add tribal knowledge | View everything |
| **Reviewer** | (no Studio access) | View everything; comment on findings |
| **Customer** | (no Studio access) | View curated deliverable subset; no raw BB |

SI/I ships as a small service (its own container) consulted by SI/S and SI/W on each request. Default backend is [bangauth](../bangauth/); production deployments swap in an OIDC adapter against the customer's IDP.

---

## How the components compose (one project)

A single Solution Intelligence engagement instantiates its **own container set** — strict isolation, no shared services across projects. One Docker host can run many SI projects side by side; each is a self-contained compose stack.

```
SI project (e.g. "dla-stores")  — its own Docker compose stack
├── SI/I — Identity service (bangauth or OIDC adapter)
├── SI/S — Studio container
│   ├── SI/BB — Blackboard substrate (running inside Studio)
│   ├── Developer UI (web; operator-facing; concurrent-operator support)
│   └── chainblocks ledger (audit trail of significant events, with user attribution)
├── SI/G — Graph (backed by PolyGraph or Neo4j; durable)
└── SI/W — Window (web; consumer-facing; role-scoped views)
```

One SI/S, one SI/G, one SI/W, one SI/I per project. Multiple operators connect concurrently to the same SI/S; their actions are attributed individually in the chainblocks ledger and in BB state. Each is a Docker service; the whole engagement is `docker compose up`.

---

## The doctrinal anchor — input classes and their epistemic status

This is the heart of Solution Intelligence and the most important architectural commitment.

**Different inputs have different epistemic status.** They cannot be treated as a flat bag of "documents." The framework must encode the distinctions and let analysts reason accordingly.

| Input class | Examples | Epistemic status | How SI treats it |
|-------------|----------|------------------|------------------|
| **Ground truth** | Source code (C#, COBOL, Java, SQL, ...), compiled binaries, database schemas, deployed configuration | Hard truth — describes what the system actually does | Parsed authoritatively; SI/G nodes derived from it are the factual claims about behavior. Conflicts with other inputs are resolved against ground truth unless explicitly noted otherwise. |
| **Aspirational intent** | Design documents, architecture diagrams, ADRs, vision white papers, slide decks | What was *intended* — may be wrong, outdated, or never fully implemented | Encoded as `IntendedBehavior` nodes; linked to ground-truth nodes via `INTENDS_TO_IMPLEMENT` edges; conflicts surface as `DRIFTS_FROM` edges. Critical not to treat as truth. |
| **Constraint / contract** | RFPs, Performance Work Statements (PWS), Statements of Work (SOW), SLAs, compliance specs (NIST, FAR, FedRAMP) | Binding obligations the system must demonstrably satisfy | Encoded as `Constraint` nodes; impact analysis surfaces what ground-truth code/configuration must satisfy them; uncovered constraints are flagged as risk. |
| **Evidence / history** | Application logs, transaction records, test outputs, incident reports, audit trails, observability data | What actually happened in operation | Encoded as `Evidence` nodes; supports "this constraint was met / violated on this date" claims; chainblocks ledgers may BE evidence in this sense. |
| **Tribal knowledge** | Interview notes, meeting transcripts, SME annotations, Slack-channel archeology | High value, low rigor, person-attributed | Encoded as `TribalKnowledge` nodes with confidence scores and source-person attribution; typically annotates other nodes rather than standing alone. |
| **Reference material** | Industry standards (NIST 800-53, FAR clauses), architectural patterns (EIP, POSA, WAF, FAR), prior-art codebases | External truth, slow-moving | Encoded as `ReferencePattern` nodes; classification edges from project artifacts to these establish "this code implements pattern X" or "this requirement maps to control Y". |

Every SI project starts by declaring **which input classes are present** and **which parsers handle each kind**. This is the "tuning" — the customer-specific mix.

A C# → ServiceNow migration is heavy on Ground Truth + Aspirational Intent + Constraint. A transaction-audit engagement is heavy on Evidence + Reference Material. A blank-sheet design exercise is heavy on Aspirational Intent + Constraint and *light* on Ground Truth (the code doesn't exist yet).

The framework supports all combinations. The doctrine is: **honor the epistemic status of every input; never silently flatten the distinction.**

---

## The standard deliverable suite

A Solution Intelligence project produces a defined set of artifacts. Not every project produces every artifact — the set is calibrated to which input classes were present and which questions the engagement is asking. But the *menu* is standard:

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

## The role of chainblocks

[chainblocks](../chainblocks/) is consumed by SI as a library. Its role is **auditing the significant events** that occur inside Studio and across SI/BB activity. Not every keystroke — the significant events:

- Each ingestion (which file, when, by what parser, what input class declared, with what hash)
- Each analyst run (which analyst, on what subgraph, producing what findings)
- Each promotion of a Blackboard hypothesis to the durable Graph
- Each classification decision (this code implements NIST IA-5(1))
- Each manual operator action via the Studio dev UI (kicking off re-analysis, marking a finding as accepted, overriding a classifier)
- Each export / deliverable generation

Every Studio carries a chainblocks ledger at `<project>/audit.ledger`. Three years after the engagement, an assessor can run `chainblocks-verify` and prove the analytical history is intact, then `read({ kind: 'si.classification.*' })` to see every classification ever made for a given component, with reasoning preserved exactly as it was at the time.

This is the fingerprint that distinguishes Solution Intelligence from "we ran some scripts and made some slides." Every claim in the deliverable traces back through an immutable chain to its source input.

---

## The doctrine

Solution Intelligence holds to a small set of design commitments. These are non-negotiable.

### 1. Honor the epistemic status of every input

Code is not design is not contract is not evidence is not tribal knowledge. The framework encodes the distinctions, parsers respect them, the Graph preserves them, and deliverables surface conflicts (intent vs reality, contract vs implementation) rather than smoothing them away.

### 2. One container set per project; no cross-pollution

DLA Stores' code, design, and RFP do not live in the same Graph as PIEE's — and they do not share a Studio process, an Identity service, a Window instance, or a Docker network. Each SI project is a self-contained compose stack. Templates and parsers are shared across the framework as code; *running data* is not. This is essential for client confidentiality, classification handling (some engagements are FOUO or higher), and clean teardown at engagement end.

### 3. The Graph is the durable artifact; everything else is rebuildable

Studio comes and goes per engagement. Window is a viewer. The Blackboard is the workshop. **The Graph is what the customer gets.** SI/G's schema is versioned; its serialization is portable; its provenance is preserved. Three years later it is still readable.

### 4. chainblocks audits the significant events, with user attribution

Tamper-evident audit is a property, not a feature. Every Studio writes its significant-event log to a chainblocks ledger, and **every entry carries the acting user's identity** (resolved through SI/I). The ledger records not just "X was done" but "X was done by user@example.com at time T with role R on project P." Verification of the analytical history is one command. The deliverable is defensible because the workflow is defensible — and because every action is attributable to a real person.

### 5. Automate as much as possible; intervene where judgment matters

A Solution Intelligence project should produce 80% of its deliverable without operator intervention. Parsers run automatically. Analysts chain automatically. Classifications propose automatically. The operator — through Studio's developer UI — reviews, accepts, overrides, and adds tribal knowledge for the cases where judgment matters. Automation never substitutes for judgment, but it eliminates the toil that would otherwise crowd judgment out.

### 6. Templates are libraries of practice; instances are configuration

A new engagement does not write code. It selects a template (cobol-modernization, csharp-to-servicenow, java-modernization, transaction-analysis, prose-doc), configures inputs, and runs. New parsers and analysts become new templates after they've proven themselves on a real engagement. The framework grows by accretion, not by per-engagement forking.

### 7. The Window respects its audience and the role of its viewer

Studio's developer UI is for operators: dense, raw, action-oriented. Window's consumer UI is for analysts and stakeholders: read-mostly, polished, narrative-shaped. They are not the same thing built in two skins. They are two different products built from the same Graph.

Window further respects the role of its viewer (resolved through SI/I): a Reviewer sees everything in the Graph; a Customer sees only the curated deliverable subset, not the raw BB state or operator interventions. Role-based view scoping is enforced at the API boundary, not just hidden in the UI.

### 8. Open-source-grade quality from day one

Solution Intelligence is internal first, but **designed for open-source release.** Every project, every parser, every analyst, every template is built to the bar set by the GitHub Published Projects playbook. JSDoc, test pyramid, governance trio, CI quality gates. If we cannot ship a component publicly, we should not ship it internally either.

### 9. Multi-user from day one; never an afterthought

Solution Intelligence is built for engagements with two-to-many participants. Single-user mode is a degenerate case (one Owner on a project), not the design center. Identity, authorization, concurrent operators, role-based view scoping, and per-user attribution in the audit trail are all v0.1 surface area. We do not ship "the auth pass" later. The day SI/S accepts its first ingestion, it does so on behalf of a named operator.

---

## What success looks like

Twelve months from now, the following statements should all be true:

- A new customer engagement can be instantiated as an SI project in **under a day**, not a month. The team selects a template, configures the inputs, and Studio is running.
- All six of the precedent projects (AuditInsight, ALMSS, DLA Stores, PIEE, Eden Township, chainblocks) are re-instantiated as SI projects on the framework. The one-off pipelines are retired.
- Three or more **new** engagements have been delivered using SI; the cost-per-engagement has dropped by 5×+.
- A government adopter has reviewed the audit trail of an SI deliverable via chainblocks-verify and accepted it as evidence.
- SI is npm/Docker-published as `@solution-intelligence/studio`, `@solution-intelligence/window`, etc., or — depending on the release decision — open-sourced as `wfredricks/solution-intelligence` on GitHub.
- The **Studio Blackboard substrate** — what we'll likely extract as `@blackboard/core` — has been proven by use and is ready to graduate to its own library, consumed by SI and by future projects.

---

## What we will not build

The non-goals list, with explicit "no":

- ❌ **A single shared Graph across all projects.** Cross-pollination of customer data is a hard line. Templates and parsers are shared; data isn't. (See doctrine §2.)
- ❌ **A SaaS / hosted multi-tenant Solution Intelligence service.** SI is multi-user *within an engagement* — several operators, analysts, reviewers, and customers collaborate on one project. SI is NOT multi-tenant *across engagements* on a shared backend; each engagement gets its own container set. No "solution-intelligence.io" public offering.
- ❌ **A general-purpose graph database.** SI/G is PolyGraph or Neo4j under the hood; SI does not invent its own. The graph engine is a substrate choice, not a product surface.
- ❌ **A general-purpose blackboard system marketed separately, today.** The Blackboard inside Studio will likely *become* a standalone project — but only after it has been proven by use in SI. We do not build it speculatively.
- ❌ **An LLM-only system.** Templates and analysts use LLMs where appropriate (tiered processing per the AuditInsight v2 lesson), but the framework is deterministic-first. Parsers are real parsers. Graphs are real graphs. LLMs solve disambiguation, not arithmetic.
- ❌ **Sharp interpretive judgment on behalf of the customer.** SI surfaces findings; it does not declare "this codebase is bad" or "this RFP is unwinnable." The operator and the customer interpret. We provide the substrate, the structure, and the standard artifacts.
- ❌ **Replication of capture-management workflow.** SI feeds capture and delivery; it does not replace the human capture team. We are the intelligence layer, not the BD organization.

---

## How Solution Intelligence relates to its sibling projects

| Project | Role relative to SI |
|---------|---------------------|
| **chainblocks** | A library. SI uses chainblocks ledgers for audit. The two are designed together but ship independently. |
| **PolyGraph** | A library. SI/G is typically backed by PolyGraph (default) or Neo4j (heavy codebase analysis). |
| **bangauth** | A library. If SI/W or SI/S need auth at deployment time, bangauth is the default. |
| **(future) Blackboard project** | Likely the harvested SI/BB once it has been proven through SI's use. Speculative until SI demands extraction. |
| **twin** | Independent project. The twin may consume SI Graphs as a knowledge source in the future, but SI does not depend on twin. |
| **AuditInsight, ALMSS, etc.** | Will eventually be re-instantiated as SI projects, replacing their one-off pipelines. |

---

## The build path

Solution Intelligence is being built to the bar set by the GitHub Published Projects playbook. Before v0.1.0 ships:

| Pillar | What lands |
|--------|-----------|
| Narrative | `README.md`, `STORY.md` (this file), `docs/WHY-SI.md`, `docs/DESIGN.md` |
| Reference | `docs/API.md` (HTTP + MCP for SI/S), JSDoc ≥90% on exports, `docs/USE-CASES.md`, `examples/` with template instantiations |
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
- The standard analyst suite for v0.1: Inventory, Dependency Atlas, Intent-vs-Reality, Constraint Coverage, Risk Surface, Pattern Classification (the others are v0.2+)

### Out of scope for v0.1

- The full multi-template library (COBOL, Java, transaction analysis come in v0.2)
- The fully-automated executive briefing generator (v0.2)
- Customer-supplied OIDC adapters beyond a generic stub (v0.2 — the first real customer's IDP is the calibration target)
- Cross-project user management (each project manages its own role assignments in v0.1; a separate "SI admin console" managing users across projects is a v0.2 candidate if demand emerges)
- Open-source release (v0.2 or later, after internal proving)
- Extraction of the Blackboard as a standalone project (v0.3, possibly later — speculative)

---

## The voice of this project

A few notes for anyone writing Solution Intelligence docs going forward:

- **Honor the epistemic distinctions.** Never speak of "documents" as a flat bag. Always say which class.
- **First-person plural ("we") when stating doctrine; second-person ("you") when explaining usage.** Never "the user" in product-voice contexts — prefer the role (Operator, Analyst, Reviewer, Customer) so the doc is precise about who is doing what.
- **Component IDs (SI/S, SI/BB, SI/G, SI/W, SI/I) are short stable references.** Use them in cross-doc citations.
- **The deliverable suite list is the menu, not the menu's items.** A given project produces a calibrated subset, not the whole list.
- **chainblocks is "the audit trail," not "the blockchain."** Tamper-evident, not tamper-proof. Cite the audit when it matters; do not promise more than the substrate delivers.
- **Audit attribution is always to a person, never to "the system."** Every action in SI is attributable to a named user; documentation should read accordingly ("the Operator triggers ingestion," not "the system ingests").

---

## Provenance

This story is the left-bookend of Solution Intelligence. It was written 2026-05-18 by Bhai (the personal twin) with Bill (the architect), the morning after the pattern was named for the first time. The naming came from Bill: Solution Intelligence as the overarching project, Studio as the workbench, Blackboard as the substrate inside, Graph as the durable artifact, Window as the consumer-facing UI. SI/I (Identity) was added the same morning when Bill stipulated that SI must be multi-user from day one; the 5-role model and bangauth-plus-OIDC default fell out of that conversation. The story is the first articulation of what those names mean and how they fit together.

Subsequent documents (`REQUIREMENTS.md`, `MODEL.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`) will refine this story into specifications. Code is built against the specifications. If the code drifts from this story, the story is updated (with a changelog entry) or the code is corrected — never both silently.

🖇️
