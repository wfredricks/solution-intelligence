# Solution Intelligence SIG — First-Run Findings

*2026-05-19. First ingestion of the SI bookend documents into a PolyGraph-backed SIG. 301 nodes, 207 cross-doc relationships. This file records what the SIG surfaced about its own design corpus — drift, gaps, and counts.*

The SIG ingests seven bookend documents: `STORY.md`, `REQUIREMENTS.md`, `MODEL.md`, `docs/PIPELINE.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`, `docs/OVERVIEW.md`. The findings below are everything the SIG noticed on its first build that warrants prose attention before SI v0.1 implementation begins.

---

## Findings — by severity

### 🔴 F-1: REQ-SI-066, 067, 068 are referenced but do not exist

**Severity:** High — broken cross-references across three documents.

`docs/FEATURES.md` row for FT-SI-09 (SI/W consumer window) and `docs/USE-CASES.md` UC-3, UC-5, UC-8 all reference `REQ-SI-066`, `REQ-SI-067`, and `REQ-SI-068`. None of these IDs exist in `REQUIREMENTS.md`. The Window section ends at `REQ-SI-065`; numbering jumps directly to `REQ-SI-070` (Identity section).

**SIG warnings:**
```
WARN: UC-3 references missing REQ "REQ-SI-066" at USE-CASES.md:95
WARN: UC-3 references missing REQ "REQ-SI-068" at USE-CASES.md:95
WARN: UC-5 references missing REQ "REQ-SI-066" at USE-CASES.md:175
WARN: UC-5 references missing REQ "REQ-SI-067" at USE-CASES.md:175
WARN: UC-8 references missing REQ "REQ-SI-066" at USE-CASES.md:251
WARN: matrix references missing node "REQ-SI-066" at FEATURES.md:21
WARN: matrix references missing node "REQ-SI-067" at FEATURES.md:21
WARN: matrix references missing node "REQ-SI-068" at FEATURES.md:21
```

**Likely cause:** REQ-SI-066/067/068 were drafted in an earlier session, referenced in USE-CASES and FEATURES, then either renumbered or removed from REQUIREMENTS without updating the downstream references. Or the downstream docs invented IDs that were never declared.

**Recommended action:** Decide whether to (a) add REQ-SI-066/067/068 to REQUIREMENTS.md (recovering the original intent) or (b) renumber the downstream references to point at existing REQs in the Window section (REQ-SI-060 through REQ-SI-065). Either fix; document the choice.

---

### 🟠 F-2: STORY says "eleven commitments"; SIG counts twelve

**Severity:** Medium — prose claim drifted from structural reality.

The SIG counts 12 `DoctrinePrinciple` nodes in STORY.md §VI. The closing paragraph of §V says *"That is the doctrine. Eleven commitments..."* The 12th principle (`The schema is three-tiered: solution-universal, solution-domain, implementation-paradigm`) was added in commit `59e5668` but the count in the closing prose was not updated.

**Recommended action:** Update STORY.md §V closing prose from "Eleven commitments" to "Twelve commitments."

The twelve, in order:

1. Honor the epistemic status of every input
2. One project, one container set; no cross-pollution
3. The model is the durable artifact; everything else is rebuildable
4. Every action is attributable to a named person
5. chainblocks audits the significant events
6. Automate as much as possible; intervene where judgment matters
7. Templates are libraries of practice; instances are configuration
8. The Window respects its audience and the role of its viewer
9. Multi-user from day one
10. Cultivate the model; do not just produce it
11. The schema is three-tiered: solution-universal, solution-domain, implementation-paradigm
12. Open-source-grade quality from day one

---

### 🟠 F-3: MODEL says "17 declared block kinds"; SIG counts 18

**Severity:** Medium — same prose-vs-table drift.

`MODEL.md` §3 prose says *"SI emits 17 declared chainblocks block kinds."* The `### 3.2 — The 17 block kinds` table has 18 rows. The 18 kinds parsed:

```
si.analyst.completed         si.input.ingested
si.analyst.invoked           si.input.reclassified
si.bb.conflict.resolved      si.parser.completed
si.bb.conflict.surfaced      si.parser.failed
si.bb.proposal.posted        si.parser.invoked
si.bb.proposal.promoted      si.project.destroyed
si.export.created            si.project.init
si.finding.overridden        si.role.granted
si.import.applied            si.role.revoked
```

That is 18 distinct kinds. Either the prose count is stale (we added one and didn't update the headline number) or the table has an extra kind that should be culled.

**Recommended action:** Confirm intent. If 18 is correct, update §3.2 heading and §3 prose to "18 block kinds." If 17 is correct, identify which kind is extra and remove it.

---

### 🟡 F-4: 62 requirements (57%) are not exercised by any use case

**Severity:** Investigative — not necessarily a defect, but worth a deliberate pass.

108 REQs total, 12 use cases, 84 EXERCISES edges. **62 REQs are not cited by any UC's "Requirements exercised" block.** The use cases were written as happy paths; the unexercised REQs include significant chunks of:

- Project lifecycle beyond UC-1 (REQ-SI-003 through REQ-SI-007 — start, stop, destroy, isolation, port allocation)
- Ingestion edge cases (REQ-SI-013 through REQ-SI-018 — routing, incremental re-ingestion, failure handling, `si inputs` query, S3 specifics)
- Parser registry mechanics (REQ-SI-022, REQ-SI-023, REQ-SI-024, REQ-SI-026 — parser inventory, DSL stream, audit, validation)
- BB substrate operations (REQ-SI-032 through REQ-SI-035 — promotion policy, conflict surfacing, durability, concurrent operators)
- Analyst chaining and override (REQ-SI-042 through REQ-SI-045)
- Graph export / import / versioning (REQ-SI-054, REQ-SI-055, REQ-SI-056)
- Window non-default behaviors (REQ-SI-062, REQ-SI-064, REQ-SI-065 — role scoping, commenting, executive briefing view)
- DSL plumbing (REQ-SI-112 through REQ-SI-114)
- All 29 non-functional requirements (NF-001 through NF-063)

**This is the alternative-flows gap.** Most of the unexercised REQs describe failure modes, recovery behavior, concurrent-operator semantics, or specific component contracts that no happy-path UC exercises. The morning's conversation flagged this gap; the SIG now quantifies it: **57% of REQs have no UC validating them.**

**Recommended action:** Plan an alternative-flows pass on USE-CASES.md. Each existing UC could grow a "What goes wrong" subsection that exercises the failure-mode REQs. Or new UCs could be added that target specific high-risk areas (concurrent operations, parser failure, ledger tampering, identity revocation mid-flight, role-scope evasion attempts).

This is not a small lift — easily another 2-3 hours — but the SIG now gives us a precise checklist of which REQs are unprotected by UCs.

---

### 🟡 F-5: 15 requirements (14%) are not implemented by any feature

**Severity:** Investigative — overlap with F-4 but distinct list.

108 REQs total, 16 features, 65 IMPLEMENTS edges. **49 REQs are not claimed by any feature.** Most of these are non-functional requirements (NF-*) that are arguably *cross-cutting* — every feature satisfies them collectively — but FEATURES.md does not currently claim them anywhere.

Notable functional REQs that no feature claims:

- `REQ-SI-007` (port collision avoidance)
- `REQ-SI-016` (`si inputs` query)
- `REQ-SI-017`, `REQ-SI-018` (S3 authentication / event-driven ingestion)
- `REQ-SI-024` (parser audit events)
- `REQ-SI-026` (GraphLoader DSL validation)
- `REQ-SI-035` (concurrent BB operators)
- `REQ-SI-050` through `REQ-SI-056` (the entire Graph contract — backend, schema, export/import, versioning)
- `REQ-SI-065` (executive briefing view)

The Graph-backend block is the most surprising — REQ-SI-050 through 056 are foundational and no feature in `docs/FEATURES.md` claims to implement them. This is likely because `FT-SI-08: SI/G (durable graph)` was named in the matrix without spelling out which Graph REQs it claims.

**Recommended action:** Audit FEATURES.md matrix entries against REQUIREMENTS.md sections; ensure every functional REQ has at least one feature claiming it. The NF-* REQs are arguably handled by `FT-SI-16: Project-wide quality bar` and a (currently absent) "Cross-cutting" feature — could be addressed by adding NF coverage to existing features or declaring `FT-SI-16` to cover the entire NF-050 through NF-054 range explicitly.

---

### 🟢 F-6: FT-SI-16 (Project-wide quality bar) has no UC

**Severity:** Low — likely correct; surface for review.

`FT-SI-16: Project-wide quality bar` is the only feature in the matrix that no UC `INVOLVES`. This is probably correct — the quality bar (CI gates, JSDoc coverage, license, etc.) is *meta-feature* infrastructure that doesn't get exercised by an operator-facing use case. It's enforced by the build, not by the user.

**Recommended action:** No change. Document the exception in FEATURES.md: "FT-SI-16 is meta-infrastructure; not exercised by any UC by design."

---

### 🟢 F-7: SIG ingestion is clean, idempotent, fast

**Severity:** Informational — positive finding.

The full ingestion (seven bookend documents, 301 nodes, 207 cross-doc edges) completes in **~2 seconds** on the Mac mini, including a fresh LevelDB wipe and reopen. PolyGraph handles the load cleanly. The SIG is regenerable; the source documents are the source of truth. No backend tuning required.

This validates the choice of PolyGraph for the SI/G default backend at v0.1.

---

## Counts (SIG overview)

```
Total bookend nodes:       301

By type:
  Requirement              108  (79 functional + 29 non-functional)
  EdgeType                  40
  SchemaLabel               35  (T1=11, T2=14, T3=10)
  AuditBlockKind            18
  Feature                   16
  DoctrinePrinciple         12
  UseCase                   12
  Deliverable               11
  PipelineStep               7
  NonGoal                   7
  EpistemicClass            7
  SourceDoc                  7
  SolutionDomain            5  (1 built: ba; 4 anticipated: mfg, clin, infra, research)
  Role                      5
  Component                  4
  ParadigmNamespace          1  (cs_2026)
  Project                    1

Cross-doc relationships:
  EXERCISES   84  (UC -> Requirement)
  IMPLEMENTS  65  (Feature -> Requirement)
  INVOLVES    58  (UC -> Feature)
```

## Schema coverage (Tier 1 / Tier 2 / Tier 3)

Verified: the three-tier schema declared in `MODEL.md` §2.1 ingests cleanly with the right tier counts and namespace assignments.

- **Tier 1 (11):** `arch_decision`, `constraint`, `coverage`, `evidence`, `finding`, `input_artifact`, `intended_behavior`, `inventory`, `reference_pattern`, `risk_item`, `tribal_knowledge`
- **Tier 2 (14) — `ba`:** `ba.account`, `ba.agreement`, `ba.approval`, `ba.business_rule`, `ba.counterparty`, `ba.document`, `ba.form`, `ba.ledger`, `ba.organization`, `ba.policy`, `ba.process`, `ba.role`, `ba.transaction`, `ba.workflow`
- **Tier 3 (10) — `cs_2026`:** `cs_2026.class`, `cs_2026.column`, `cs_2026.config_key`, `cs_2026.endpoint`, `cs_2026.function`, `cs_2026.interface`, `cs_2026.schema`, `cs_2026.source_file`, `cs_2026.table`, `cs_2026.variable`

---

## What the SIG validates

- The three-tier schema is real, namespace-correct, and queryable.
- Every doctrine commitment, deliverable, pipeline step, role, audit block kind, and non-goal is uniquely named and ingestable from the bookend prose.
- The standard deliverable suite has 11 named artifacts (matches STORY's claim).
- The pipeline has 7 named steps (matches STORY's claim).
- 5 roles, 4 components, 7 epistemic classes (matches STORY's claim).

## What the SIG flags

- 3 broken cross-references (F-1).
- 2 prose-vs-table count mismatches (F-2, F-3).
- 62 unexercised REQs (F-4) — the alternative-flows gap.
- 15 unimplemented functional REQs (F-5) — the feature-matrix coverage gap.
- 1 feature without a UC (F-6) — likely intentional.

---

## Recommended fix order

1. **F-1** — broken REQ references (5 minutes; mechanical decision)
2. **F-2** — STORY "eleven" → "twelve" (1 minute)
3. **F-3** — block-kind count "17" → "18" or remove extra row (5 minutes)
4. **F-5** — fill missing feature claims for REQ-SI-050 through 056 (30 minutes)
5. **F-4** — alternative-flows pass on USE-CASES.md (2-3 hours; deferred)
6. **F-6** — document the FT-SI-16 exception (2 minutes)

Items 1-3 plus 6 are quick housekeeping; item 4 is meaningful but bounded; item 5 is the substantive design work that the morning's conversation flagged.

---

## How to reproduce

```bash
cd artifacts/solution-intelligence/sig
npm install
npm run ingest    # builds the SIG from current bookend docs
npm run query     # runs canonical queries against the SIG
```

Re-running `npm run ingest` rebuilds the SIG fresh from the markdown. The SIG is a derived artifact; the bookend documents are the source of truth.

---

*FINDINGS.md v0.1 — Solution Intelligence SIG. First ingestion 2026-05-19. Companion to `SCHEMA.md` and `scripts/ingest.ts`.*
