# Solution Intelligence SIG — Findings

*2026-05-19. Ingestion of the SI bookend documents into a PolyGraph-backed SIG.*

**Status update (2026-05-19 ~15:30 EDT):** All seven findings have been addressed. F-4 (alternative-flows gap) and F-5-remainder (NF-* feature mapping) were closed in the afternoon push following F-1/F-2/F-3/F-5-partial/F-6. Re-ingest after the full pass shows 304 bookend nodes, 312 cross-doc relationships, zero ingest warnings.

**Coverage now:**
- Requirements exercised by at least one UC: **103 of 111 (93%)**. The 8 unexercised are documentation declarations (NF-041..044) and CI declarations (NF-050..053) that are not UC-shaped; they are properties of the build, explicitly covered by `FT-SI-16` in `docs/FEATURES.md`.
- Requirements implemented by at least one feature: **111 of 111 (100%)**.
- Features with at least one UC: **15 of 16**. The one without is `FT-SI-16` (project-wide quality bar) which is meta-infrastructure; documented as intentional.

See "Resolution log" at the end for details on F-1 through F-6, and the new "F-4 resolution" section below for the alternative-flows pass.

The SIG ingests seven bookend documents: `STORY.md`, `REQUIREMENTS.md`, `MODEL.md`, `docs/PIPELINE.md`, `docs/USE-CASES.md`, `docs/FEATURES.md`, `docs/OVERVIEW.md`. The findings below are everything the SIG noticed on its first build that warranted prose attention before SI v0.1 implementation begins.

---

## Findings — by severity

### ✅ F-1: REQ-SI-066, 067, 068 are referenced but do not exist [RESOLVED]

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

**Resolution (2026-05-19):** Chose option (a). Added three new Window REQs to `REQUIREMENTS.md`:
- `REQ-SI-066`: Interactive deliverable views (Dependency Atlas, Intent-vs-Reality Map, Constraint Coverage Matrix, Risk Surface) with click-through citations
- `REQ-SI-067`: Exportable static artifacts (SVG, PNG, PDF) preserving citation links where supported
- `REQ-SI-068`: Newly-promoted findings surface in Window within p95 5s latency budget

Functional REQ total: 79 → 82; overall: 108 → 111. The Window cross-reference row in REQUIREMENTS.md was updated from "REQ-SI-060 through 065 | 6" to "REQ-SI-060 through 068 | 9".

Also surfaced during fix: the FEATURES.md matrix had FT-SI-08 (SI/G) mapped to REQ-SI-060 to 064 (Window REQs, not Graph REQs!) and FT-SI-07 (GraphReader) mapped to REQ-SI-027 + 050-053 + 100-103 (mixing reader and graph-backend). Corrected:
- `FT-SI-07: GraphReader` → `REQ-SI-027, 100 to 103`
- `FT-SI-08: SI/G` → `REQ-SI-050 to 056` (the actual Graph backend REQs)
- `FT-SI-09: SI/W` → `REQ-SI-060 to 068` (the full Window REQ range)

This third correction was a hidden defect F-1 surfaced indirectly: the matrix had cross-wired Graph and Window REQs.

---

### ✅ F-2: STORY says "eleven commitments"; SIG counts twelve [RESOLVED]

**Severity:** Medium — prose claim drifted from structural reality.

The SIG counts 12 `DoctrinePrinciple` nodes in STORY.md §VI. The closing paragraph of §V says *"That is the doctrine. Eleven commitments..."* The 12th principle (`The schema is three-tiered: solution-universal, solution-domain, implementation-paradigm`) was added in commit `59e5668` but the count in the closing prose was not updated.

**Recommended action:** Update STORY.md §V closing prose from "Eleven commitments" to "Twelve commitments."

**Resolution (2026-05-19):** Done. STORY.md line 125 updated.

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

### ✅ F-3: MODEL says "17 declared block kinds"; SIG counts 18 [RESOLVED]

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

**Resolution (2026-05-19):** Investigation: MODEL.md §3.2 had 18 distinct rows; REQ-SI-091 in REQUIREMENTS.md listed only 17, missing `si.parser.completed`. The 18th kind is a useful pairing for `si.parser.invoked` and `si.parser.failed` (success completion, with DSL path / record count / conflict count payload). Decision: keep 18, update REQ-SI-091 to include `si.parser.completed`, and update all four prose references in MODEL.md plus two in FEATURES.md from "17" to "18". A drift between the table and the requirement was corrected by adding the missing event to the requirement, not by removing the row.

**Files touched:** `REQUIREMENTS.md` REQ-SI-091, `MODEL.md` (4 places), `docs/FEATURES.md` (FT-SI-12 matrix row + detail paragraph).

---

### ✅ F-4: 62 requirements (57%) are not exercised by any use case [RESOLVED 2026-05-19 PM]

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

**Resolution (2026-05-19 PM):** Six new alternative-flow use cases were added to `docs/USE-CASES.md` (UC-13 through UC-18), each ~150-250 lines, each exercising a coherent failure-mode narrative:

- **UC-13**: A parser crashes mid-ingest, and operators recover. Exercises REQ-SI-013/014/015/024/026/034, NF-010/011/022.
- **UC-14**: Two operators race to promote conflicting proposals. Exercises REQ-SI-025/032/033/034/035, NF-060/061/062/063.
- **UC-15**: The project is exported, imported elsewhere, and reconciled. Exercises REQ-SI-043/044/054/055/056, NF-033.
- **UC-16**: A Customer tries to URL-hack BB substrate state. Exercises REQ-SI-062/063/064/077, NF-020/023/024.
- **UC-17**: The audit ledger is tampered with, and verify catches it. Exercises REQ-SI-081/082, NF-012/054.
- **UC-18**: Project lifecycle through cold restart, status, teardown. Exercises REQ-SI-003/004/005/006/007/027/082, NF-030/031/032.

UC-2, UC-3, and UC-10 were also extended with their full citation lists (the narrative already covered REQs that weren't in the `Requirements exercised` line).

Result: unexercised count dropped from 62 of 108 to **8 of 111**. The remaining 8 are all NF-* documentation and CI declarations that have no operator-facing scenario; they are properties of the build, covered cross-cuttingly by `FT-SI-16`.

---

### 🟡 F-5 [PARTIAL RESOLVED]: requirements not implemented by any feature

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

**Resolution (2026-05-19, partial):** Fixed the Graph-backend block (REQ-SI-050 to 056) by correcting the cross-wired FEATURES matrix entries described in F-1's resolution. Post-fix unimplemented count is 41 of 111 (was 49 of 108). The remaining 41 are mostly NF-* requirements and a few cross-cutting functional REQs (REQ-SI-007 port collision, REQ-SI-016 `si inputs`, REQ-SI-017/018 S3 ingestion specifics, REQ-SI-024 parser audit, REQ-SI-026 GraphLoader DSL validation, REQ-SI-035 concurrent BB operators). These remain unclaimed in the matrix and are deferred to a later housekeeping pass.

**F-5 full resolution (2026-05-19 PM):** The FEATURES.md matrix was extended row-by-row to enumerate every previously-implicit requirement:

- FT-SI-01 (lifecycle): added REQ-SI-007 (port collision)
- FT-SI-02 (ingestion): added REQ-SI-016/017/018 (inputs query, S3 auth, S3 event-driven)
- FT-SI-03 (parser registry): added REQ-SI-024 (audit), 026 (validation)
- FT-SI-04 (BB substrate): added REQ-SI-035 (concurrency), NF-060..063 (consistency)
- FT-SI-05 (GraphLoader): added REQ-SI-026 (validation)
- FT-SI-07 (GraphReader): extended REQ range 100 to 106 (reports + output)
- FT-SI-08 (SI/G): added NF-033 (export format stability)
- FT-SI-09 (Window): added NF-002/003 (perf), NF-024 (Customer view scoping)
- FT-SI-10 (Identity): added NF-020 (network I/O), NF-021 (secrets)
- FT-SI-12 (audit): added NF-012 (verify-fail surfaces), NF-063 (total order)
- FT-SI-15 (compose stack): added REQ-SI-007 + NF-010/011/022/023/030/031/032
- FT-SI-16 (quality bar): added NF-001 (perf as declaration)

Also fixed three ingest.ts regex bugs that were undercounting matrix coverage: NF-range expansion with bare 'NF-NNN to NF-NNN' shorthand, functional-range continuation with bare 'NNN to NNN' after a REQ-SI- prefix, and comma-separated bare numbers like 'REQ-SI-025, 026, 030'.

Result: unimplemented count dropped from 41 of 111 to **0 of 111**. Every requirement now has at least one feature claiming it.

---

### ✅ F-6: FT-SI-16 (Project-wide quality bar) has no UC [RESOLVED]

**Severity:** Low — likely correct; surface for review.

`FT-SI-16: Project-wide quality bar` is the only feature in the matrix that no UC `INVOLVES`. This is probably correct — the quality bar (CI gates, JSDoc coverage, license, etc.) is *meta-feature* infrastructure that doesn't get exercised by an operator-facing use case. It's enforced by the build, not by the user.

**Recommended action:** No change. Document the exception in FEATURES.md: "FT-SI-16 is meta-infrastructure; not exercised by any UC by design."

**Resolution (2026-05-19):** Done. Added a "Note on UC coverage" paragraph to the FT-SI-16 detail section in `docs/FEATURES.md`.

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

## Resolution log

Following the first-run report above, fixes were applied across two passes on 2026-05-19. Final post-fix state:

| Finding | First-run | Mid-day | End-of-day | Final status |
|---------|-----------|---------|------------|--------------|
| F-1 (missing REQs) | 8 ingest warnings | 0 ingest warnings | 0 ingest warnings | RESOLVED |
| F-2 ("eleven" vs 12) | mismatch | matches | matches | RESOLVED |
| F-3 (17 vs 18 blocks) | prose says 17 | prose says 18 | prose says 18 | RESOLVED |
| F-4 (unexercised REQs) | 62 of 108 | 62 of 111 | **8 of 111** (all NF docs/CI) | RESOLVED |
| F-5 (unimplemented REQs) | 49 of 108 | 41 of 111 | **0 of 111** | RESOLVED |
| F-6 (FT-SI-16 no UC) | undocumented | documented | documented | RESOLVED |
| F-7 (clean fast ingest) | informational | informational | informational | n/a |

Also surfaced (and resolved) during F-1's fix: the FEATURES.md matrix had **FT-SI-07, FT-SI-08, and FT-SI-09 cross-wired** — FT-SI-08 (SI/G) was mapped to Window REQs 060-064, FT-SI-09 (SI/W) to nonexistent 066-068, and FT-SI-07 (GraphReader) was mixing Reader and Graph REQs. All three were corrected to their natural REQ ranges. This was a hidden defect that only surfaced because F-1 forced an audit of the surrounding rows.

**Net counts after fixes:**
- Total bookend nodes: 298 (was 301 — not directly comparable due to schema changes during fixes)
- Functional REQs: 82 (was 79; added REQ-SI-066/067/068)
- Total REQs: 111 (was 108)
- AuditBlockKind: 18 (was 18; prose now agrees)
- DoctrinePrinciple: 12 (was 12; prose now agrees)
- IMPLEMENTS edges: 76 (was 65; matrix corrections added 11)
- EXERCISES edges: 89 (was 84; the new REQs got picked up by UCs implicitly via the range expansion)
- INVOLVES edges: 58 (unchanged)
- Ingest warnings: 0 (was 8)

The SI bookend is now self-consistent across all seven documents. The substantive design work that remains — the alternative-flows pass exposed by F-4 — is deferred to a later session.

---

*FINDINGS.md — Solution Intelligence SIG. First ingestion 2026-05-19; first-run fixes applied same day. Companion to `SCHEMA.md` and `scripts/ingest.ts`.*
