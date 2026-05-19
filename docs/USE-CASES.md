# USE-CASES.md — Solution Intelligence

*Concrete scenarios that exercise the requirements in `REQUIREMENTS.md` against the data model in `MODEL.md`. Each use case names its actors, the situation, the need, what life looks like without SI, what life looks like with SI, and which requirements it exercises.*

The use cases below cover five layers of Solution Intelligence:

- **Lifecycle UCs** (UC-1 to UC-3) — instantiating, ingesting, and running a project
- **Deliverable UCs** (UC-4 to UC-10) — producing the standard deliverable suite
- **Multi-user / governance UCs** (UC-11, UC-12) — multi-operator collaboration and audit defensibility
- **Alternative-flow UCs** (UC-13 to UC-18) — failure modes, concurrent-operator races, portability, security-scoped views, tamper detection, and full lifecycle teardown; each exercises requirements the happy-path UCs leave unexercised

The alternative-flow group was added 2026-05-19 after the SI bookend SIG quantified the coverage gap (62 of 111 REQs unexercised by happy-path UCs). The six new UCs collectively close roughly two-thirds of that gap; the remaining unexercised REQs are mostly non-functional declarations about the build (documentation requirements, CI gates, packaging) that are not UC-shaped and are covered by `FT-SI-16` in `docs/FEATURES.md`.

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

REQ-SI-010, REQ-SI-011, REQ-SI-012, REQ-SI-016, REQ-SI-017, REQ-SI-018, REQ-SI-020, REQ-SI-021, REQ-SI-022, REQ-SI-023, REQ-SI-025, REQ-SI-030, REQ-SI-031, REQ-SI-040, REQ-SI-041, REQ-SI-090, REQ-SI-091, REQ-SI-110, REQ-SI-111, REQ-SI-112, REQ-SI-113, REQ-SI-114, REQ-SI-115, REQ-SI-NF-001. Plus MODEL.md §1.5 (epistemic classes), §2.4 (invariants), §8 (provenance).

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

REQ-SI-040, REQ-SI-041, REQ-SI-042, REQ-SI-044, REQ-SI-045 (analyst suite, audit, chaining, override), REQ-SI-050, REQ-SI-051, REQ-SI-052, REQ-SI-053 (Graph backend), REQ-SI-060, REQ-SI-061, REQ-SI-066, REQ-SI-068 (Window), REQ-SI-074 (5-role matrix), REQ-SI-091 (audit events), REQ-SI-100, REQ-SI-101, REQ-SI-102, REQ-SI-103 (reports), REQ-SI-NF-002, REQ-SI-NF-003 (Window/Studio responsiveness). Plus MODEL.md §6.3.

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

REQ-SI-051, REQ-SI-052, REQ-SI-065 (Executive Briefing view), REQ-SI-100, REQ-SI-101, REQ-SI-103. Plus MODEL.md §2.1 (analyst-output labels: Finding, RiskItem).

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

## UC-13: A parser crashes mid-ingest, and operators recover

### Actor & situation

Maya is ingesting a 12,000-file legacy COBOL codebase into `aircraft-supply`. Ingestion has been running for forty minutes. The `cobol-treesitter` parser hits a file with a corrupt COPY directive and crashes — the process dies, partial output is left in the BB substrate, the rest of the batch is waiting.

Maya does not want to lose forty minutes of work. She also does not want the partial output silently promoted into SI/G; the failed file might be referenced by others that did parse cleanly, and acting on incomplete graph state is exactly the dishonest kind of work the methodology refuses.

### Need

1. The crash must not abort the batch — the other 11,999 files keep ingesting.
2. The crash must be visible — surfaced in the BB substrate and the Window, not buried in logs.
3. The partial output must not promote to SI/G — GraphLoader rejects records from a failed parser run.
4. The audit trail must record what happened — which parser, which input, what error, when, by whom.
5. After Maya inspects the bad input and either fixes it or marks it as known-broken, the batch can be retried — only the failed file re-runs, not the 11,999 that already succeeded.

### Without SI

The ingest script dies. The forty minutes are lost; everything restarts from scratch. The broken file is rediscovered manually by running the parser by hand. No record exists of the failure other than a console log nobody reads.

### With SI

The Studio process supervises every parser invocation. When `cobol-treesitter` exits with a non-zero status on `legacy/payroll/MAINMODULE.cob`:

```
$ si ingest aircraft-supply --path ./customer-handoff/ --recursive
... (39 minutes of progress) ...
[parser cobol-treesitter] FAILED on legacy/payroll/MAINMODULE.cob
  error class: ParseError
  error message: unexpected token at line 482: COPY "INVAL\D"
  partial DSL emitted: data/dsl/legacy_payroll_MAINMODULE.partial.sigdsl (rejected)
  audit block: si.parser.failed @ seq 3,847 (actor: maya@example.com)
... (continues with remaining 11,999 files) ...
✓ Batch complete: 11,999 / 12,000 files ingested. 1 parser failure.
⚠ BB substrate has 1 failed ingest pending operator review.
```

Maya inspects the BB queue. The failed input is there with full context: the parser command line, the stderr tail, the line number, the partial DSL output (marked `rejected`, not promoted). The chainblocks ledger has a `si.parser.failed` block with the actor's identity, the input hash, the error class, and the error message — but not the input file contents (per the security rule, NF-022).

Maya fixes the broken `COPY` directive in the customer's handoff (or marks the file as known-broken with tribal knowledge) and runs `si ingest aircraft-supply --path ./customer-handoff/legacy/payroll/MAINMODULE.cob --resume`. Studio recognizes the input by hash, retries only that file, and — because the file content is now different — incrementally re-parses it. The other 11,999 ingested files are untouched; their `input_artifact` nodes carry the same `blob_sha256` as before.

The Studio process itself can crash too. If it does, BB substrate state survives — it is checkpointed to disk per REQ-SI-034 and NF-011. On `si up`, Studio resumes from substrate state; in-flight parser invocations that did not complete before the crash are marked failed and surfaced in the BB queue for operator review. Promoted SI/G content is preserved independently; loss of BB state does not lose promoted graph content.

### Requirements exercised

REQ-SI-013, REQ-SI-014, REQ-SI-015, REQ-SI-024, REQ-SI-026, REQ-SI-034, REQ-SI-NF-010, REQ-SI-NF-011, REQ-SI-NF-022.

---

## UC-14: Two operators race to promote conflicting proposals

### Actor & situation

Maya and Sam are both Operators on `dla-stores`. The IntentVsReality analyst has surfaced a finding both noticed at the same time: a function `OrderProcessor.dispatch` either drifts from its documented intent or does not. Maya thinks the drift is real and clicks "promote drift edge" in Studio's UI. Sam, working in parallel, has investigated the runtime evidence and thinks the intent is the one that should be updated (the code is right; the design doc is out of date). Sam clicks "promote intent update."

Both actions arrive at GraphLoader within the same second. They are not just edits to two different nodes; they are *contradictory* claims about the same intent↔implementation edge.

### Need

1. Neither action silently overwrites the other.
2. The audit trail preserves the full order of attempts — not just the winner.
3. The losing action's actor (or both) gets a clear surface-level signal: *your action conflicts with one just made by Sam; review and decide.*
4. The conflict gets a `ba.bb.conflict.surfaced` event so it does not vanish into a log.
5. Eventually consistent: once one resolution is committed, both Maya's and Sam's Window views converge to the same state within the latency budget (REQ-SI-068).

### Without SI

Last-writer-wins. Maya's commit lands, Sam's commit overwrites it, no record of Maya's attempt survives. Three weeks later when an auditor asks "why did this drift edge disappear?" there is no answer.

### With SI

GraphLoader is the single writer to SI/G (REQ-SI-025), and its write queue is strictly serialized (NF-061). Maya's proposal arrives first by 47ms and is promoted; the BB substrate records `si.bb.proposal.promoted` @ seq 4,521 (actor: maya@example.com). Sam's proposal arrives 47ms later and, because it modifies the same conceptual edge, GraphLoader detects the conflict, rejects the second promotion, and emits `si.bb.conflict.surfaced` @ seq 4,522 with `between: [maya's-promotion, sam's-proposal]`, `actor: sam@example.com`.

Sam's Window updates within the latency budget. He sees: *"Your proposal conflicts with maya@example.com's promotion 47ms earlier. Review the conflict before proceeding."* Clicking through, he sees Maya's promoted drift edge, his rejected intent-update, and the underlying graph context: the `cs_2026.function`, the `ba.process` it implements, the `intended_behavior` they disagree about.

Sam and Maya talk. They agree the intent should be updated to match the code (Sam was right; Maya's drift edge is real but the right resolution is to *correct the intent*, not just mark the drift). Maya, holding Operator role, navigates to the conflict and selects `resolution: drifts-from-and-update-intent`. GraphLoader applies the resolution as a single atomic operation: the `DRIFTS_FROM` edge from Maya's promotion is replaced with an `INTENDS_TO_IMPLEMENT` edge bound to a new intended-behavior node sourced from Sam's runtime evidence. Audit: `si.bb.conflict.resolved` @ seq 4,531 (actor: maya@example.com, resolution-text references both prior blocks).

Three months later when a Reviewer queries the audit ledger for this function, the full sequence is visible — Maya's first promotion, Sam's conflicting attempt, the conversation (resolved-with-notes), and the final state. The audit trail is the negotiated history, not just the winning state.

Concurrent ingestion of overlapping inputs (NF-062): if Maya and Sam both drop the same file into the input bucket from different sessions, Studio detects the duplicate via `blob_sha256` match (REQ-SI-014) and ingests it only once; both operators see the same `input_artifact` node and neither sees a phantom duplicate.

### Requirements exercised

REQ-SI-025, REQ-SI-032, REQ-SI-033, REQ-SI-034, REQ-SI-035, REQ-SI-NF-060, REQ-SI-NF-061, REQ-SI-NF-062, REQ-SI-NF-063.

---

## UC-15: The project is exported, imported into a fresh installation, and reconciled

### Actor & situation

The `dla-stores` engagement is done. The customer wants to bring the work in-house, on their own infrastructure. Three months later, the customer's team — working on a fresh SI installation — wants to continue cultivating the SIG with new runtime evidence and a revised constraint set.

Meanwhile, Credence has continued cultivating the original project's SIG as new audit observations have come in. The two graphs have diverged. They need to be reconciled.

### Need

1. The original project exports to a portable bundle (graph + DSL streams + audit ledger archive + schema manifest).
2. The customer's fresh SI installation imports the bundle into a new project.
3. Both copies can be extended independently after the import.
4. When the two need to be reconciled, the merge surfaces conflicts (not silent winners) and produces a reconciled SI/G whose audit trail preserves both branches.

### Without SI

Whatever was in the customer's deliverable .zip is what they have. Three months later they cannot extend the model; they have a report, not a graph. The cost of re-doing the modernization analysis falls on them; the model accumulates no further.

### With SI

```
# At Credence, at engagement close:
$ si export-graph dla-stores --to s3://customer-handoff/dla-stores-export-2026-08-15/
✓ Exported 47,832 nodes + 124,917 edges + 9,333 DSL files + audit ledger archive
✓ Schema manifest declared:
    si_schema_version: 0.1.0
    domain_namespaces:   ["ba"]
    paradigm_namespaces: ["cs_2026"]
✓ chainblocks ledger: seq range [1, 18,402], all verified intact
✓ Bundle SHA-256: 7f3a91...
✓ si.export.created @ seq 18,403

# Three months later, at the customer:
$ si init dla-stores-customer --template csharp-to-servicenow
$ si import-graph dla-stores-customer --from s3://customer-handoff/dla-stores-export-2026-08-15/
✓ Schema compatibility check: si_schema_version 0.1.0 → 0.1.3 (forward-compatible)
✓ Imported 47,832 nodes + 124,917 edges + audit ledger archive
✓ si.import.applied @ seq 18,404 (actor: customer-lead@agency.gov, merge_policy: replace)
```

The schema manifest carries the domain (`ba`) and paradigm (`cs_2026`) namespaces; the importing SI installation, even if it has been updated to 0.1.3, recognizes 0.1.0 as forward-compatible and imports without breaking (NF-033). New labels added in 0.1.3 simply do not appear in the imported nodes; consumers reading the older stream against newer SI must ignore unknown labels without erroring (MODEL.md §7.1).

Three months pass at both sites. Credence has added 412 new audit `evidence` nodes from production logs. The customer has added 89 new `constraint` nodes from a new FedRAMP control set and updated 14 of the `ba.business_rule` nodes. They want to merge.

```
# Customer pulls Credence's branch:
$ si import-graph dla-stores-customer \
    --from s3://credence-bucket/dla-stores-evidence-2026-11-15/ \
    --merge-policy merge
✓ Schema compatibility check: OK
⚠ Merge conflict surfaced: 3 nodes modified in both branches
  - ba.business_rule "BR-OrderApproval-threshold" — customer set value=10000, credence set value=15000
  - intended_behavior "intake-claim-eligibility" — description updated in both
  - constraint "FAR-13.106-1(c)" — text revised in both
✓ 412 non-conflicting nodes merged.
✓ si.import.applied @ seq 21,847 (actor: customer-lead@agency.gov, merge_policy: merge, conflict_count: 3)
⚠ 3 conflicts await operator resolution in BB substrate.
```

The customer's Operator resolves the three conflicts — keeping their own threshold for the business rule, taking Credence's revised intent, and producing a merged constraint text that incorporates both wordings. Each resolution produces a `si.bb.conflict.resolved` event with the actor and the rationale. The audit ledger now preserves *both branches' histories* plus the merge decisions: an Inspector General three years from now can see Credence's evidence, the customer's constraints, and the negotiated reconciliation, all attributable to named operators.

The analysts are idempotent (REQ-SI-043): re-running ConstraintCoverage against the merged graph against an unchanged subgraph produces an identical set of findings. The only new findings are those genuinely caused by the merged content.

### Requirements exercised

REQ-SI-043, REQ-SI-044, REQ-SI-054, REQ-SI-055, REQ-SI-056, REQ-SI-NF-033.

---

## UC-16: A Customer-role viewer tries to URL-hack BB substrate state

### Actor & situation

The customer engagement has been delivered. A senior leader at the customer site — holding `Customer` role on `dla-stores-customer` — is reading the delivered Intent-vs-Reality Map in Window. He notices that some findings appear to reference "BB substrate state" that the curated Customer view does not show. Curious (and modestly technically literate), he tries:

- Editing the Window URL from `/projects/dla-stores-customer/view/intent-vs-reality` to `/projects/dla-stores-customer/view/bb-substrate`
- Inspecting the page's network calls and re-issuing one of them with a path swapped to `/api/v1/bb/proposals`
- Setting up a direct `curl` against `https://window.customer.gov/api/v1/projects/dla-stores-customer/bb/conflicts` with his session token

None of this is malicious; he is curious about what was filtered out of his view. But the methodology has to refuse all three attempts cleanly, log the attempts, and surface them.

### Need

1. Role scoping is enforced at the API boundary, not just hidden in the UI. The URL hack returns `403`, not the BB state.
2. The token is verified for both authentication ("is this a valid session?") and authorization ("does this user hold a role that permits this view?") on every request.
3. The denial is logged with enough detail to debug *and* without leaking secrets or session tokens.
4. The denial is audit-recorded — not as a chainblocks block (those are project-state events; this is a request-level audit), but in the per-component access log such that an Operator reviewing audit can see "customer-leader@agency.gov was denied access to bb.conflicts on Friday at 14:32 — he was holding Customer role on this project."
5. The Customer view itself does not leak any of the filtered material in headers, metadata, error messages, or response payloads.

### Without SI

The URL hack succeeds; the leader sees the BB substrate with all the operator overrides and rejected findings. He has a quiet crisis of confidence about the work and his trust in the deliverable evaporates.

### With SI

Every API request to SI/W (and SI/S) carries a token. The request handler resolves the token through SI/I, which returns `{ user_id, effective_roles_on_project }`. The handler then checks the route's required role against `effective_roles_on_project`:

```
GET /api/v1/projects/dla-stores-customer/bb/conflicts
  Authorization: Bearer <opaque-token>
  -> SI/I.resolve(token, project="dla-stores-customer")
     -> { user_id: "customer-leader@agency.gov",
          effective_roles: ["Customer"] }
  -> route requires role in [Owner, Operator, Analyst, Reviewer]
  -> 403 Forbidden
     {
       "error": "insufficient_role",
       "required": ["Owner", "Operator", "Analyst", "Reviewer"],
       "held": ["Customer"]
     }
```

The response does not include the BB state under any header, no "hint" of what would be returned to a higher-role user, and the error message does not leak session-token state. The access log (per NF-022, no input file content; per NF-077 standards for auth-failure logging) records: `2026-11-15T14:32:11Z denied=customer-leader@agency.gov route=GET /api/v1/projects/dla-stores-customer/bb/conflicts required-role=Operator-or-above held-role=Customer`.

The Customer view itself is constructed by GraphReader to *exclude* by construction — it cannot leak BB state because BB state is not in the query that produces it (NF-024). Even if the Window front-end were misconfigured to display all returned fields, there are no BB-state fields in the response payload.

The network-call re-issue gets the same `403`. The direct `curl` gets the same `403`. The leader contacts the project's Owner: "I noticed there is BB substrate state I can't see; what is it?" The Owner explains that BB state is the operators' workshop — proposed-but-not-promoted findings, conflicts the operators are deliberating about — and is intentionally excluded from the Customer view because curated deliverables are the contract, not the raw workshop. The leader's trust in the deliverable is *strengthened*: the methodology refuses to leak by accident.

### Requirements exercised

REQ-SI-062, REQ-SI-063, REQ-SI-064, REQ-SI-077 (auth/authz logging detail), REQ-SI-NF-020 (no unexpected network I/O), REQ-SI-NF-023 (per-project isolation enforced at container layer), REQ-SI-NF-024 (Customer views must not leak BB state).

---

## UC-17: The audit ledger is tampered with, and verify catches it

### Actor & situation

Three years after delivery, the agency hosting `dla-stores-customer` is undergoing a system audit. An assessor wants to know: is the audit trail intact, or has it been tampered with since the engagement closed? She also has reason to suspect that a specific block — the override of a particular drift finding — may have been altered to soften the finding.

Meanwhile, on the operations side, SRE has been doing routine maintenance on the chainblocks ledger storage. A misconfigured deduplication tool has "compressed" some old ledger blocks by recomputing what it thought were their hashes. The result, from the verifier's perspective, is corruption — even though no human intended to tamper.

### Need

1. `si verify <project>` must distinguish between intact, tampered, and operationally-broken ledger states.
2. The verification exit code must be machine-parseable for CI integration.
3. A failed verify must be surfaced as a critical health issue in `si status` — not just buried in a log.
4. The verification result itself must be timestamped and (if the assessor requests it) signed.

### Without SI

The assessor has to manually inspect the ledger; tampering is invisible because there is no cryptographic chain. The SRE accident is undetectable until much later when someone notices missing data. Trust in the audit trail decays slowly until the deliverable is reduced to "trust us, this is what we found."

### With SI

The assessor runs the verify command:

```
$ si verify dla-stores-customer
[verify] chainblocks-verify projects/dla-stores-customer/audit.ledger
[verify] Walking ledger: 18,402 blocks ... ✖
[verify] FAIL: block #14,891 hash mismatch at byte offset 4,238,712
        expected: a2f7c9...
        actual:   8e1b04...
        chain broken; subsequent blocks (14,892..18,402) cannot be trusted
[verify] Exit code: 1 (TAMPERED)
```

Exit code 1 means tampered (per REQ-SI-081). Exit code 0 would mean clean. Exit code 2 would mean operational error (couldn't read the ledger file, e.g.). The assessor sees that block 14,891 — the exact override block she was suspicious about — has been altered. She has cryptographic proof, not just a hunch.

The `si status` view shows the broken state prominently (NF-012):

```
$ si status dla-stores-customer
Project:      dla-stores-customer
Containers:   4/4 running
Graph nodes:  47,832
Graph edges:  124,917
Audit ledger: ⚠ 18,402 entries; chainblocks-verify FAILED at block #14,891 (TAMPERED).
BB conflicts: 0 open
```

The assessor escalates. SRE investigates, discovers the deduplication misconfiguration, and pulls a backup from the day before the maintenance. They restore the ledger and re-run verify:

```
$ si verify dla-stores-customer
[verify] chainblocks-verify projects/dla-stores-customer/audit.ledger
[verify] Walking ledger: 18,402 blocks ... ✓
[verify] PASS: chain intact, no tampering detected.
[verify] Exit code: 0 (CLEAN)
[verify] Result block written: si.verify.completed @ seq 18,403 (actor: sre@agency.gov)
```

The assessor accepts the restored ledger. The verify command is also exercised in CI on every commit to main (NF-054): the SI installation runs its own SIG against its own bookend documents nightly, and one of the steps is `si verify` against the test fixtures' ledgers. A regression in chainblocks would surface as a CI red within hours.

### Requirements exercised

REQ-SI-081, REQ-SI-082, REQ-SI-NF-012, REQ-SI-NF-054.

---

## UC-18: The project lifecycle through cold restart, status checks, and clean teardown

### Actor & situation

The `dla-stores` engagement concluded six months ago. The Credence team has been keeping the project running for follow-on work, but the contract option is not being exercised; it is time to retire the project. Meanwhile, three new SI projects (`piee-cor`, `eden-township`, `va-leads-pilot`) are starting up on the same Docker host this week.

### Need

1. `si up` brings a previously-stopped project back online cleanly, with all four services healthy.
2. `si status` returns honest health on each service and the audit ledger.
3. `si down` stops without data loss; restarting resumes from where things stopped.
4. `si destroy` removes a project completely — containers, volumes, network — *but archives the audit ledger* to a configurable location so future audits remain possible.
5. Multiple projects on the same host do not collide — ports are allocated cleanly per project, networks are isolated, and one project's lifecycle action does not affect the others.

### Without SI

Manual `docker compose` against bespoke YAML, with operator-maintained port assignments in a wiki page that drifts from reality. "Destroy" is `rm -rf`, which destroys the audit ledger along with everything else, which means the engagement's history is unrecoverable.

### With SI

```
# Bring the dormant project back online for a final retrospective:
$ si up dla-stores
✓ Resolved port allocations from ~/.si/ports.json
  studio=30001 window=30002 identity=30003 graph=30004
✓ Docker compose stack 'si-dla-stores' starting...
✓ identity: healthy (bangauth)
✓ graph: healthy (PolyGraph, 47,832 nodes)
✓ studio: healthy (BB substrate resumed from disk, 0 conflicts pending)
✓ window: healthy
✓ chainblocks-verify projects/dla-stores/audit.ledger: PASS (seq 1..18,402)

$ si status dla-stores
Project:      dla-stores
Containers:   4/4 running
Graph nodes:  47,832
Graph edges:  124,917
Audit ledger: ✓ 18,402 entries; chainblocks-verify PASS.
BB conflicts: 0 open
Uptime:       3 minutes
```

At the same time, Sam is starting up `piee-cor`. Port allocation requests the next three free ports from `~/.si/ports.json` (30005, 30006, 30007). The compose stack uses network `si-piee-cor`, separate from `si-dla-stores`. Sam's project does not see `dla-stores` and vice-versa — strict isolation at the Docker network layer (REQ-SI-006, NF-023).

The team finishes the retrospective, archives the deliverables, and decides to retire `dla-stores`:

```
$ si destroy dla-stores --archive-ledger-to s3://credence-archives/dla-stores-2026-09-30/
⚠ This will tear down containers, remove volumes, release ports, and archive the audit ledger.
  Confirm with: si destroy dla-stores --confirm

$ si destroy dla-stores --confirm --archive-ledger-to s3://credence-archives/dla-stores-2026-09-30/
✓ Audit ledger archived: s3://credence-archives/dla-stores-2026-09-30/audit.ledger.tar.gz (18,402 blocks)
✓ Audit ledger SHA-256 manifest: s3://credence-archives/dla-stores-2026-09-30/audit.manifest.json
✓ chainblocks final block written: si.project.destroyed @ seq 18,403 (actor: maya@example.com)
✓ Containers stopped and removed (4)
✓ Volumes removed (4)
✓ Docker network 'si-dla-stores' removed
✓ Ports released from ~/.si/ports.json: 30001, 30002, 30003, 30004
✓ Project 'dla-stores' destroyed.
```

Four years later, an Inspector General investigating an unrelated agency matter wants to inspect the `dla-stores` audit trail. The archived ledger is pulled from S3, mounted into a fresh `si verify` invocation, and confirmed intact. The engagement's history outlived the engagement, the project, the team, and several rounds of infrastructure churn. The methodology that produced it kept its promise.

Meanwhile, `piee-cor`, `eden-township`, and `va-leads-pilot` continue on the same Docker host, each in its own isolated stack. The host accommodates many SI projects side by side; the framework's job is to keep them from colliding (REQ-SI-007) and to let each one age out cleanly on its own schedule (REQ-SI-003 through REQ-SI-005).

### Requirements exercised

REQ-SI-003, REQ-SI-004, REQ-SI-005, REQ-SI-006, REQ-SI-007, REQ-SI-027, REQ-SI-082, REQ-SI-NF-030, REQ-SI-NF-031, REQ-SI-NF-032.

---

## Coverage summary

The 18 use cases above collectively exercise the bulk of the functional requirements in `REQUIREMENTS.md` and a substantial portion of the non-functional ones. The SI bookend SIG quantifies the coverage at every commit; see `sig/FINDINGS.md` for the current state.

| Layer | UCs | Focus |
|-------|-----|-------|
| Lifecycle | UC-1, UC-2, UC-3 | Instantiation, ingestion, analyst chain |
| Deliverable suite | UC-4 through UC-10 | Each of the seven primary deliverables |
| Governance & multi-user | UC-11, UC-12 | Collaboration; long-horizon audit |
| Alternative flows | UC-13 through UC-18 | Failure modes, concurrency races, portability, security scoping, tamper detection, lifecycle teardown |

The remaining standard deliverables — **Pattern Classification**, **Executive Briefing**, **MCP/HTTP API endpoint**, and **Audit Trail** — are exercised implicitly by UC-7 (pattern matching as part of constraint coverage), UC-10 (synthesis as a meta-deliverable), UC-12 (audit verification), and UC-17 (tamper detection). A future iteration may add dedicated UCs for each as the framework matures.

**Non-functional coverage.** Performance budgets (NF-001..003), reliability (NF-010..012), security (NF-020/022/023/024), compatibility (NF-030..033), concurrency (NF-060..063), and quality gates (NF-054) all have at least one UC that exercises them. The remaining non-functional REQs are documentation declarations (NF-040..044), CI configuration (NF-050..053), and audit-ledger total ordering (NF-063) that are not UC-shaped — they are properties of the build, not scenarios in the field — and are covered as cross-cutting concerns by `FT-SI-16` in `docs/FEATURES.md`.

---

*USE-CASES.md v0.1 — Solution Intelligence. Companion to STORY.md, REQUIREMENTS.md, and MODEL.md.*
