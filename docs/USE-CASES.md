# USE-CASES.md — Solution Intelligence

*Concrete scenarios that exercise the requirements in `REQUIREMENTS.md` against the data model in `MODEL.md`. Each use case names its actors, the situation, the need, what life looks like without SI, what life looks like with SI, and which requirements it exercises.*

The use cases below cover four layers of Solution Intelligence:

- **Lifecycle UCs** (UC-1 to UC-3) — instantiating, ingesting, and running a project
- **Deliverable UCs** (UC-4 to UC-10) — producing the standard deliverable suite
- **Multi-user / governance UCs** (UC-11, UC-12) — multi-operator collaboration and audit defensibility

---

## UC-1: A new engagement is instantiated as an SI project

### Actor & situation

The Capture team has just won a contract: modernize a 250,000-line C# codebase to ServiceNow. The first technical task is to stand up the analysis environment. The Solutions Architect — call her Maya — has 90 minutes between the kickoff call and a 3pm follow-up to have a Solution Intelligence project running with the customer's code ingested.

### Need

Maya needs to:

1. Create the project with a `csharp-to-servicenow` template
2. Authenticate herself as Owner
3. Bring the four-service compose stack up on her workstation (or the team's shared Docker host)
4. Be ready to ingest by the end of the 90 minutes

### Without SI

Maya copies a prior project's tooling directory, edits paths, rewires config files, installs missing dependencies one by one, debugs port collisions with another active project on the same host, and arrives at the follow-up either still configuring or running a Frankenstein stack that nobody else on the team can reproduce.

### With SI

```
$ si login                                                # bangauth or OIDC
$ si init --template csharp-to-servicenow --project dla-stores
✓ Resolved template csharp-to-servicenow@0.1.0
✓ Allocated host ports: studio=30001 window=30002 identity=30003
✓ Wrote projects/dla-stores/compose.yml
✓ Wrote projects/dla-stores/manifest.json
✓ Initialized chainblocks audit ledger (genesis block sealed)
✓ Granted Owner role to maya@example.com
$ si up dla-stores
✓ All four services healthy on http://localhost:30001 (Studio)
```

In under five minutes Maya has a self-contained compose stack: Studio, Graph, Window, Identity, each in its own container, with port allocations recorded in `~/.si/ports.json` so a second project on the same host gets a different range. The chainblocks ledger has its genesis block sealed; the `si.project.init` event records `actor: maya@example.com` and the template/version. She is the sole Owner; she can now `si grant` other operators.

### Requirements exercised

REQ-SI-001, REQ-SI-002, REQ-SI-070, REQ-SI-072, REQ-SI-073, REQ-SI-075, REQ-SI-080, REQ-SI-083, REQ-SI-084, REQ-SI-090, REQ-SI-091.

---

## UC-2: A codebase is ingested with mixed input classes

### Actor & situation

The same project — `dla-stores` — is live. The customer has handed over a tarball: 247,000 lines of C# code, 180 markdown design documents, three PWS PDFs, an SLA spec, and 14 architecture diagrams. These do not have the same epistemic status. The C# is ground truth. The markdown is aspirational intent. The PWS and SLA are constraint. The diagrams are partly intent, partly ground truth (some are auto-generated from code).

### Need

Maya needs to ingest all of these without flattening the distinction. She also needs the system to surface anything it couldn't classify, so she can decide.

### Without SI

Everything goes into one bucket. A search returns hits from code, design, and contract intermixed. Six weeks later, a question like "does this satisfy the SLA?" requires a junior analyst to re-read everything and remember which source said what.

### With SI

```
$ si ingest dla-stores --path ./customer-handoff/
✓ Ingested 9,481 InputArtifacts:
  • 8,124 ground-truth (C#)        → csharp-treesitter parser → 612,440 DSL records
  • 1,189 aspirational-intent (md) → markdown-intent parser   →  18,733 DSL records
  • 6     constraint (PDF)         → pdf-constraint parser    →     412 DSL records
  • 14    aspirational-intent      → drawio-arch parser       →     267 DSL records
  • 148   unclassified              → ⚠ surfaced in BB substrate for operator review
✓ Total DSL records: 631,852 (across 9,333 .sigdsl files in data/dsl/)
✓ GraphLoader promoted 612,403 ground-truth + 18,711 intent + 412 constraint + 267 arch nodes
⚠ 41 conflicts surfaced in BB substrate (signature drift, arch-vs-code mismatches)
⚠ 148 inputs await operator classification (mostly screenshots, .xlsx, .pst)
```

The intent nodes are linked to the ground-truth nodes they purport to describe via `INTENDS_TO_IMPLEMENT` edges; where they disagree, `DRIFTS_FROM` edges surface. The PWS constraints are loaded as `Constraint` nodes; analysts will later add `SATISFIES` and `MAY_VIOLATE` edges. Every node carries `epistemicClass`. Every node carries `provenance` back to its `InputArtifact` and the DSL line. The 148 unclassified items are in BB substrate awaiting operator decision, not silently flattened or silently dropped.

The chainblocks ledger has recorded 9,481 `si.input.ingested` events plus 9,333 `si.parser.completed` events, each with `actor: maya@example.com`.

### Requirements exercised

REQ-SI-010, REQ-SI-011, REQ-SI-012, REQ-SI-020, REQ-SI-021, REQ-SI-025, REQ-SI-030, REQ-SI-031, REQ-SI-040, REQ-SI-041, REQ-SI-090, REQ-SI-091, REQ-SI-110, REQ-SI-111, REQ-SI-115. Plus MODEL.md §1.5 (epistemic classes), §2.4 (invariants), §8 (provenance).

---

## UC-3: Analysts run; findings appear in the Window

### Actor & situation

The `dla-stores` project has ingestion behind it. Maya now runs the analyst suite. Some analysts are `post-ingest` (they fire automatically when GraphLoader finishes); others are `manual` (Maya kicks them off when she's ready).

### Need

She needs to:

1. Run the standard analyst set declared in the template
2. See findings as they appear in the Window (live-ish, role-scoped)
3. Override or accept individual findings (audit-recorded)
4. Spot which findings need her judgment vs which are auto-promoted

### Without SI

Analysts run ad-hoc, each writes its results to a different place (CSV, JSON, a slide deck). Findings are not provenanced back to source. An override leaves no trace; six months later nobody remembers why an apparent dead-code function was retained.

### With SI

```
$ si analyze dla-stores --analyst Inventory
✓ Inventory@0.1.0 completed in 14s. 247 findings produced. Auto-promoted.

$ si analyze dla-stores --analyst DependencyAtlas
✓ DependencyAtlas@0.2.0 completed in 2m11s. 1,408 findings produced. Auto-promoted.

$ si analyze dla-stores --analyst IntentVsReality
✓ IntentVsReality@0.1.0 completed in 47s. 86 findings produced.
  • 71 auto-promoted (high-confidence drift)
  • 15 awaiting Operator review in BB substrate
```

In Window, Maya sees the deliverables organized by audience:

- **Inventory** → counts, language breakdown, file-size histogram
- **Dependency Atlas** → interactive module graph, fan-in/fan-out hotspots
- **Intent-vs-Reality Map** → the 71 confirmed drifts plus the 15 awaiting her judgment

She clicks one of the 15 awaiting items. Window shows: the IntendedBehavior node (sourced from `docs/architecture.md` line 412), the ground-truth Function it claims to map to (sourced from `src/OrderProcessor.cs` line 88), the proposed `DRIFTS_FROM` edge, and the analyst's rationale. She marks it `accept-with-note`. A `si.finding.overridden` event hits the ledger with `actor: maya@example.com`, the override kind, her note, and a reference to the original finding.

A Reviewer who joins the project two weeks later sees Maya's override and her note — not just the auto-promoted findings — because the role permission matrix lets Reviewers see everything in the Graph and comment, but not promote or override.

### Requirements exercised

REQ-SI-050 to REQ-SI-053 (analyst suite), REQ-SI-060 to REQ-SI-063 (Graph), REQ-SI-066 to REQ-SI-068 (Window), REQ-SI-074 (5-role matrix), REQ-SI-091 (audit events), REQ-SI-100 to REQ-SI-103 (reports). Plus MODEL.md §6.3.

---

## UC-4: Producing the Inventory Report

### Actor & situation

The Capture team needs a one-pager for the next-day customer briefing: "What's in the codebase?" — broken down by language, module count, line count, complexity buckets.

### Need

An auto-generated Inventory artifact that surfaces in both Window (clickable, source-linked) and as a static deliverable (HTML / Markdown / PDF in the output bucket).

### Without SI

Someone runs `cloc`, exports CSV, pastes into a deck, hand-fixes formatting. Re-running next week to capture changes means re-doing the manual steps.

### With SI

```
$ si report dla-stores --kind inventory --format pdf
✓ GraphReader produced outputs/reports/inventory.html, .md, .pdf
✓ Committed to outputs/ git tree as commit f3e1c2a "report: inventory @ ledger seq 1408"
```

The Inventory artifact is auto-generated from `Inventory` nodes in SI/G. Every count cites the source `SourceFile` and `Function` nodes. Re-running tomorrow against an updated graph produces a byte-identical artifact modulo timestamps. The `si.export.created` event records the chainblocks ledger seq range covered.

### Requirements exercised

REQ-SI-050, REQ-SI-053, REQ-SI-100, REQ-SI-101, REQ-SI-102, REQ-SI-104, REQ-SI-105, REQ-SI-106.

---

## UC-5: Producing the Dependency Atlas

### Actor & situation

Architects need to plan the migration. They need a navigable module graph: who calls whom, fan-in / fan-out, hotspots, circular dependencies, isolated subgraphs.

### Need

A live, interactive view in Window plus a static SVG/PDF export. Citations from each edge back to the source code line that introduced it.

### Without SI

A static diagram in a Visio file, six months out of date, unmaintained.

### With SI

The `DependencyAtlas` analyst walks `CALLS`, `DEPENDS_ON`, `READS`, `WRITES`, `EXPOSES`, and `IMPLEMENTS` edges. Window renders an interactive graph (a force-directed layout for a small subgraph; a hierarchical layout for the full module tree). Clicking an edge shows the `sourceRef` from the originating DSL record: `src/OrderProcessor.cs:88-92`. Exports produce SVG + PDF + a JSON deliverable that downstream tools (or a future engagement's twin) can consume.

### Requirements exercised

REQ-SI-051, REQ-SI-060, REQ-SI-061, REQ-SI-066, REQ-SI-067, REQ-SI-100, REQ-SI-101.

---

## UC-6: Producing the Intent-vs-Reality Map

### Actor & situation

The customer's design doc is from 2019. The code has drifted. Leadership needs to know: where does the design lie? This is the artifact that distinguishes SI from a code-only analyzer.

### Need

A side-by-side view of `IntendedBehavior` nodes and the ground-truth nodes they purport to describe, with `DRIFTS_FROM` edges highlighted. Clickable from either side.

### Without SI

An architect reads both the docs and the code in parallel and types up a memo. Subjective, lossy, unverifiable.

### With SI

The `IntentVsReality` analyst walks every `IntendedBehavior` node, finds its `INTENDS_TO_IMPLEMENT` candidate(s), compares declared properties against ground-truth properties, and emits `DRIFTS_FROM` edges with rationale on the rationale prop. Window shows a two-column view: intent on the left (sourced from `docs/architecture.md`), reality on the right (sourced from `src/`). Conflicts are color-coded. Operator can promote, demote, or annotate any finding. Every action chainblocks-recorded.

The deliverable shows the customer: "your 2019 design document declares 47 behaviors; 31 are accurately implemented, 12 have drifted, 4 were never implemented."

### Requirements exercised

REQ-SI-052, REQ-SI-061, REQ-SI-072 (intent edges promotion policy via §2.4), REQ-SI-091. Plus MODEL.md §1.4 (Conflict marker), §2.2 (intent-to-reality edges).

---

## UC-7: Producing the Constraint Coverage Matrix

### Actor & situation

ATO time. The Information System Security Officer (ISSO) needs a defensible mapping from every NIST 800-53 control declared in the SSP to the code that satisfies it. Auditors are arriving in 30 days.

### Need

A matrix: rows = `Constraint` nodes (NIST controls); columns = ground-truth nodes (`Function`, `Endpoint`, `ConfigKey`). Cells = `SATISFIES` or `MAY_VIOLATE` edge, with `EVIDENCED_BY` linkage where evidence is available. Uncovered constraints flagged as risk.

### Without SI

A 400-row spreadsheet hand-built by a junior analyst over six weeks. Auditors find five rows where the cited code does not actually implement the control; trust is lost.

### With SI

The `ConstraintCoverage` analyst walks every `Constraint` node and proposes `SATISFIES` / `MAY_VIOLATE` edges, drawing on `MATCHES_PATTERN` edges to `ReferencePattern` nodes (NIST 800-53 control catalog), plus heuristic matching against `Function` / `Endpoint` names. Operator reviews the proposals in Window; promotes the strong ones, demotes the weak. `UNCOVERED_BY` self-loop markers surface as uncovered-constraint findings.

The deliverable: a matrix with full citations. Every cell traces to the originating proposal, to the chainblocks audit event recording its promotion, to the `actor.userId` who promoted it. Three years later, a successor ISSO can audit the audit and trust the result.

### Requirements exercised

REQ-SI-050, REQ-SI-052, REQ-SI-061, REQ-SI-100, REQ-SI-101. Plus MODEL.md §2.2 (contract edges), §3.2 (audit events), §6.3 (role permission matrix — Reviewer audits).

---

## UC-8: Producing the Risk & Anomaly Surface

### Actor & situation

The tech lead needs a "what should we worry about?" list before the next sprint planning: complexity hotspots, dead code, undocumented patterns, single-points-of-failure, missing-test surfaces.

### Need

A ranked list of `RiskItem` nodes drawn from graph analytics (high fan-in, high cyclomatic complexity, no incoming `OBSERVED_FOR` edges from evidence, no `ANNOTATES` from tribal knowledge).

### Without SI

A senior engineer's gut-feel list, captured in a whiteboard photo.

### With SI

The `RiskSurface` analyst combines graph centrality metrics (PageRank, betweenness) with property-driven heuristics (complexity, age of last modification, lack of test coverage from `Evidence` nodes) and proposes `RiskItem` nodes with `likelihood` and `impact` props. Operator reviews, promotes, or overrides. The Window renders a ranked surface with click-through to the underlying nodes.

### Requirements exercised

REQ-SI-051, REQ-SI-061, REQ-SI-066, REQ-SI-100.

---

## UC-9: Adding tribal knowledge mid-project

### Actor & situation

A retiring SME — call him Frank — sits with the analyst, Lela, for two hours. He tells her things about the codebase nobody wrote down: "this whole queue subsystem was a workaround for a 2014 vendor bug that's been fixed for years; you can probably delete it." Lela needs to capture this so it's not lost when Frank leaves Friday.

### Need

A way to attach Frank's claim to the specific `Function` and `Class` nodes it pertains to, attributed to Frank, with a confidence Lela judges.

### Without SI

A meeting note in OneDrive that nobody finds three months later when the queue subsystem is being modernized.

### With SI

```
$ si shell dla-stores
> annotate fn:com.example.queue.LegacyAdapter.dispatch/1 \
    --text "Workaround for 2014 vendor bug, fix shipped 2017. Likely unnecessary." \
    --attributed-to "Frank Doe <frank@example.com>" \
    --confidence 0.85
✓ Added TribalKnowledge node tk_01HX...; ANNOTATES edge to fn:com.example.queue.LegacyAdapter.dispatch/1
✓ Awaiting Operator promotion (template default for tribal-knowledge)
```

The annotation is a `TribalKnowledge` node with `epistemicClass: "tribal-knowledge"`, `attributedTo: "Frank Doe ..."`, `confidence: 0.85`. It's awaiting Maya's (Operator) promotion per the default policy. Once promoted, the next time anyone runs the Risk Surface analyst over the `LegacyAdapter.dispatch` function, the annotation surfaces alongside the risk finding. Six months later, when the migration plan touches that function, the migration template's `TribalCheck` step surfaces Frank's note in the Window.

Frank retires. His note doesn't.

### Requirements exercised

REQ-SI-053 (tribal nodes can be added by Analyst role), REQ-SI-073 (per-project roles), REQ-SI-074 (matrix), REQ-SI-091. Plus MODEL.md §2.4 (promotion policy for tribal-knowledge).

---

## UC-10: Producing the Modernization Roadmap (synthesis deliverable)

### Actor & situation

The customer wants a one-document answer: "How do we move from here to there?" Phased plan, effort estimates, risk-weighted ordering.

### Need

A synthesis report that draws on Inventory, Dependency Atlas, Intent-vs-Reality, Constraint Coverage, Risk Surface, and Tribal Annotations, organized into a phased migration plan.

### Without SI

A consultant writes a Word document over three weeks; the document does not trace its claims; it goes stale on contact with the codebase.

### With SI

The `ModernizationRoadmap` analyst is a meta-analyst: it consumes the outputs of the prior six analysts (their `Finding`, `RiskItem`, `Coverage` nodes) and proposes a phased plan as a sequence of `Finding` nodes of kind `migration-phase`. Each phase cites the underlying modules, risks, constraints, and tribal annotations.

The deliverable carries citations: every effort estimate traces to the `Inventory` count it derives from; every "we need to address this risk first" traces to the `RiskItem` node and its evidence; every "leave this for last" traces to a tribal annotation. The deliverable is *defensible*.

### Requirements exercised

REQ-SI-051, REQ-SI-052, REQ-SI-100, REQ-SI-101, REQ-SI-103. Plus MODEL.md §2.1 (analyst-output labels: Finding, RiskItem).

---

## UC-11: Two operators collaborate on one project

### Actor & situation

Maya is overloaded. She grants Operator role to Sam. The two of them now work the same `dla-stores` project: Maya focuses on the Intent-vs-Reality drift list, Sam works through the BB conflicts from ingestion.

### Need

- Concurrent access, no clobbering each other
- Per-user attribution on every action
- Visible "who did what" for handoffs
- Cleanly resumable if either steps away

### Without SI

A shared Google Doc + chat. Conflicts. Lost work. No traceability.

### With SI

```
$ si grant dla-stores sam@example.com Operator
✓ Granted Operator role to sam@example.com on dla-stores
✓ Audit event si.role.granted #1492 recorded actor=maya@example.com
```

Maya and Sam open Window in parallel. Each authenticates through SI/I (bangauth or OIDC). Each sees the BB substrate, with action items tagged by who's working what (lightweight presence via SI/I, optional v0.1 enhancement) or by who last modified.

Maya promotes a Drift finding. The chainblocks event records `actor: maya@example.com`. Two minutes later Sam resolves a conflict. Another event records `actor: sam@example.com`. The Window's audit-trail view shows the interleaved actions. If Maya leaves for the afternoon, Sam opens the BB substrate and sees exactly which items she was mid-review.

When the project ships, the Audit Trail deliverable shows, for every claim in the deliverable, which real person made which judgment.

### Requirements exercised

REQ-SI-070, REQ-SI-071, REQ-SI-072, REQ-SI-073, REQ-SI-074, REQ-SI-076, REQ-SI-077, REQ-SI-090, REQ-SI-091, REQ-SI-NF-040 (multi-user semantics, per §"Multi-user from day one"). Plus MODEL.md §6.

---

## UC-12: An external auditor verifies the analytical history

### Actor & situation

Three years after delivery, an Inspector General's office is auditing the agency's migration program. They specifically want to know: who made the call to retire the legacy queue subsystem? Was that decision defensible at the time, given what was known?

### Need

An after-the-fact audit of the entire analytical history that produced the migration recommendation. Cryptographic assurance that the audit trail itself has not been tampered with. Full traceability from each claim to the source input and the human who promoted it.

### Without SI

The lead architect retired. The Word document has no citations. The chat archive has been purged. Nobody can answer the question. The agency is exposed.

### With SI

```
$ chainblocks-verify projects/dla-stores/audit.ledger
✓ Ledger verified: 18,402 blocks. Chain intact. No tampering detected.

$ si shell dla-stores
> ledger query --kind si.finding.overridden --subject fn:com.example.queue.LegacyAdapter.dispatch/1
Block #14,891 (2026-05-22T14:47:12Z):
  actor: maya@example.com
  override: accept-with-note
  finding: f_01HXA..."Likely dead code; modernization candidate"
  note: "Frank Doe annotation (tk_01HX...) cited 2014 vendor bug; verified
         against runtime logs (Evidence ev_01HX...) showing 0 invocations
         in trailing 90 days. Promote to migration-phase-3."
  evidence: [tk_01HX..., ev_01HX...]
```

The audit trail shows the decision, the actor, the date, the cited tribal note, the cited evidence, and the resulting migration phase assignment. The chainblocks verification proves the entry has not been altered since 2026-05-22. The Inspector General has a defensible record.

This is what doctrine commitment #4 actually buys: not just "audit trail," but **defensible audit trail across the years.** The cost of building it in from day one is exactly: choosing chainblocks and SI/I from day one.

### Requirements exercised

REQ-SI-076, REQ-SI-090, REQ-SI-091, REQ-SI-092, REQ-SI-093, REQ-SI-NF-021 (audit integrity over time). Plus MODEL.md §3 (audit event payloads), §8 (provenance — the golden chain).

---

## Coverage summary

The 12 use cases above collectively exercise every numbered functional requirement in `REQUIREMENTS.md` at least once, and most exercise several. Non-functional requirements appear in UC-2 (performance budget), UC-3 (Studio responsiveness), UC-11 (multi-user semantics), and UC-12 (audit integrity over time).

| Layer | UCs |
|-------|-----|
| Lifecycle | UC-1, UC-2, UC-3 |
| Deliverable suite | UC-4 (Inventory), UC-5 (Dependency Atlas), UC-6 (Intent-vs-Reality), UC-7 (Constraint Coverage), UC-8 (Risk Surface), UC-9 (Tribal Knowledge), UC-10 (Modernization Roadmap) |
| Governance & multi-user | UC-11 (collaboration), UC-12 (auditor verification) |

The remaining standard deliverables — **Pattern Classification**, **Executive Briefing**, **MCP/HTTP API endpoint**, and **Audit Trail** — are exercised implicitly by UC-7 (pattern matching as part of constraint coverage), UC-10 (synthesis as a meta-deliverable), and UC-12 (the audit trail IS the deliverable being verified). A future iteration may add dedicated UCs for each as the framework matures.

---

*USE-CASES.md v0.1 — Solution Intelligence. Companion to STORY.md, REQUIREMENTS.md, and MODEL.md.*
