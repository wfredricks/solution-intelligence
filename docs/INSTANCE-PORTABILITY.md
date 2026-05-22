# Instance Portability: The Substrate Upgrades, the Instance Endures

*A design doctrine paper. Extends the twin-portability principle (Decision #37, 2026-05-08) to Solution Intelligence instances. Written 2026-05-22 by William Fredricks and Bhai during a working session on the morning's Phase 1a–1e substrate refresh.*

**Status:** Design doctrine, sign-off pending. No code yet. The paper exists so the contract can be reviewed before being built.

---

## The principle

A constellation has two kinds of things in it. The first is the **substrate** — the code, the schemas, the archetype, the container images, the methodology paper that describes how everything works. The substrate is replaceable. We replaced large parts of it this morning across five sub-agent phases, and the constellation runs better for it. The second is the **instance** — the running graph the substrate has built up over its lifetime, the audit ledger of every state change it has produced, the contracts that have been loaded, the hypotheses that have been verified, the events that have been emitted. The instance is precious. It is the operational truth the customer engagement was hired to produce.

The principle is simple: **the substrate upgrades, the instance endures.** An upgrade of the substrate must not require the instance to be re-bootstrapped. Otherwise every upgrade is a fresh start, the methodology cannot be trusted with real engagement data, and the SI claim that a Solution Intelligence Graph survives the era it was built in collapses into the era it was built in.

This is the same shape as Decision #37 from 2026-05-08: *"Everything but the birthright belongs in the artifact."* The twin moves between constellations carrying its graph, knowledge, preferences, habits, and insights; only the constellation-bound birthright stays behind. The instance-portability principle is what that decision becomes when the thing being moved is not a twin but a Solution Intelligence instance — `archetypes-solution-intelligence` against the `asi` namespace, `stores-solution-intelligence` against the `dla-stores` namespace, or any future instance of `solution-intel`.

---

## What counts as instance data

The line between substrate and instance has to be drawn before it can be defended. Five categories belong on the instance side, one belongs on the substrate side with a clarifying note, and three explicitly do not travel.

**Instance — the SIG content.** Every node and every edge produced in the running graph, with all properties and all timestamps. For `archetypes-solution-intelligence` today, this is two Contracts (`events-spine`, `simple-auth`), thirteen Hypotheses (six held, one partial, six open), and the supporting Principle/Constraint/Service/Process/DataObject nodes the bookend parser produced when those archetypes were committed. The Phase 1c verifiedAt harmonization landed at the contract-loader boundary precisely because instance data was on the wrong side of an inconsistency — the agents had to grow a `normalizeIsoString` helper to defend against a write-path-vs-read-path mismatch in instance properties. Instance data is what an agent walks; it is the operational truth the substrate exists to host.

**Instance — the audit ledger.** Every event the substrate emitted during the instance's life. Today this is asi's identity service emitting `si.identity.login.completed`, `si.identity.grant.recorded`, `si.identity.revoke.recorded` via events-spine. The ledger is append-only JSONL by design. It is the chain of custody for every state change in the instance. It is also the canonical source from which the SIG can in principle be rebuilt — see §"Streaming replay as a future option."

**Instance — the identity records.** Tokens, grants, role assignments, the per-instance bangauth state. Smaller than the SIG, sensitive in different ways. The grants ledger (`data/audit/grants.jsonl` per the canonical archetype's adoption answers) is itself a JSONL append-only log; tokens are mostly rotatable but the user-to-role mapping is precious. An engagement that has spent two months refining who-can-see-what loses operational time if those mappings vanish in an upgrade.

**Instance — derived reports and findings.** CompletenessAgent's output, BookendAuditAgent's snapshot diffs, any future biz-deriver agent's proposals. These are derived from the SIG and can be re-run after an upgrade. They are not migration-critical, but they should be tagged as such in the export so an operator who wants to compare pre-upgrade and post-upgrade reports has the pre-upgrade artifact in hand.

**Instance — operator config and per-instance state.** The `.si/config.yaml`, the `@adopt:` marker resolutions baked into the adopter codebase, the operator-set policies. Strictly speaking this is closer to substrate than to instance — the adoption codebase contains it — but it has a per-instance flavor that distinguishes it from the upstream archetype. An export should record the resolved markers as data so the upgraded substrate can be re-stamped without losing the operator's choices.

**Substrate — the code itself.** The cli, the contract-loader, the agents, the graph-client, the identity service, the scripts directory, the workspace metadata. These are replaceable. The substrate upgrade IS the act of swapping them out.

**Does not travel — the birthright analog.** For a twin, the birthright is the constellation's identity foundation. For an SI instance, the analog is the substrate's archetype lift tag (`solution-intel-reference-impl-2026-05-22c` today). The instance came from a specific lift; the upgrade is the act of leaving that lift behind. The lift tag does not migrate; it is overwritten when the new substrate is stamped in.

**Does not travel — node_modules, dist, coverage, test fixtures.** These are downstream of the code and rebuilt from `package-lock.json` and the source tree. They have no place in an export.

**Does not travel — running container state.** A container's in-memory cache, its open connections, its in-flight requests. The export contract is for data at rest, not for live-migration. An upgrade is a stop-and-start operation, not a hot swap.

## The export-import contract

The contract has four obligations: completeness, schema versioning, reversibility, and identity preservation.

**Completeness.** An export captures every category of instance data named above. A round-trip — export, fresh substrate, import — produces a SIG that an agent cannot distinguish from the pre-export SIG (modulo intentional schema migrations, which we'll come back to). The substrate must be able to produce an export without coordinating with running processes other than its own; the import must be able to reconstruct from the export alone.

**Schema versioning.** Every export carries a stamp recording the substrate version that produced it. The Phase 1c verifiedAt harmonization is the canonical example of why this matters: an SI instance running on contract-loader v0.1.0-pre wrote `verifiedAt` as a Neo4j temporal DateTime; the same instance after upgrade to v0.2.0-pre expects ISO-8601 string. An import that does not know which version produced the export cannot perform the coercion. The stamp is small — substrate name, substrate version, schema version, export timestamp — but it is load-bearing. Without it, instance data and substrate code drift out of joint and the round-trip property does not hold.

**Reversibility.** An export is human-readable enough that an operator can inspect it. JSONL where it makes sense (the audit ledger already is; the SIG export should follow), structured directories where it doesn't. A `tar.gz` artifact at the outer layer is fine; opaque binary at the leaves is not. The reason is operational: when an upgrade goes wrong and the operator has to triage at 11pm, "can I read the export?" is the difference between fixing it and re-creating the instance from scratch.

**Identity preservation.** Node ids and relationship ids in the SIG must survive the round-trip. Two reasons. First, the audit ledger references node ids; if the import re-mints them, the ledger's references become stale. Second, the cross-view edges that make the Solution Intelligence Graph trustworthy — `Biz.Feature → Code.Method` `DERIVED_FROM` edges, eventually `Imp.UpdateSet → Dom.Entity` `REALIZES` edges — depend on node identity surviving across operations. An upgrade is one of those operations.

## Granularity: three plausible designs

The contract above is implementation-neutral. The implementation has to pick a granularity.

**Whole-instance snapshot.** Back up the SIG store atomically — for PolyGraph today, that is `cp -r data/polygraph/ backup/`, and for Neo4j it is a `neo4j-admin dump`. Pair the snapshot with the audit ledger, the identity records, the resolved markers, and the schema-version stamp. Import is the reverse. **Simplest, fastest, works today.** Does not handle schema migrations on its own — the importer has to apply migrations after restore, and for that it needs the schema-version stamp.

**Per-archetype export.** Each archetype's contract — its Principles, Constraints, Services, Processes, DataObjects, Hypotheses, plus the audit blocks that justify each — exports independently. The instance is a collection of these per-archetype bundles plus the cross-archetype edges (`HAS_CONTRACT`, `COMPOSES`). **Composable, survives partial upgrades**, and matches the way `solution-intel` is organized internally. The cost is that the export contract grows to specify how cross-archetype edges are emitted and re-attached on import.

**Streaming replay.** The audit ledger IS the truth. An import is a replay of the ledger against a fresh substrate; the SIG is reconstructed from the events. **The purest design — the substrate becomes a deterministic function of the ledger.** It also matches the direction the events-spine adoption pointed at when the Stage 2d FINDINGS noted that publishers can run before subscribers and that the canonical event format is owned by the Scribe. The cost is that every state-changing operation in the substrate must emit a corresponding event, and the substrate must guarantee deterministic SIG reconstruction from those events. Today's substrate does not yet meet that bar — `commitContract` writes directly to the graph and only some operations emit events.

**Recommendation: start with the whole-instance snapshot.** The schema-version stamp gives a migration handle when one is needed. The per-archetype shape is a refactor we can do later if it becomes operationally useful. Streaming replay is the direction; it is not the first step.

## Schema migrations

Some upgrades change the shape of instance data, not just the substrate code. The contract has to name how those are handled.

A migration is a substrate-version-pair-keyed transformation from one schema to another. For Phase 1c's verifiedAt example, the migration is: *for every node with label `Hypothesis`, if `verifiedAt` is a Neo4j DateTime object, coerce to ISO-8601 string; if null, leave null; if already a string, leave alone.* The migration is idempotent (running it twice has the same effect as running it once) and named (`migration-0.1.0-pre-to-0.2.0-pre-verifiedAt-iso`) and recorded in the audit ledger as an `instance.migration.applied` event.

Migrations live in the substrate, not the export. The export carries the schema-version stamp; the substrate carries the catalog of migrations and applies them based on the gap between the export's version and the substrate's version. This way the export is forward-compatible by default: an export produced today can be imported into next year's substrate provided that substrate carries the migrations for the intervening versions. The substrate also has a contract: a substrate version must be able to import any export whose schema version it has migrations for, even if other migrations exist that go further.

A migration that cannot be performed deterministically — one that requires operator judgment, or external data — is a different kind of operation. The contract should distinguish *automatic migrations* from *operator-assisted migrations*. An automatic migration runs as part of import. An operator-assisted migration produces a report at import time naming what cannot be resolved and a pointer to a CLI command the operator can run to resolve it. The migration is not complete until the operator's action is recorded. This matches the methodology's overall posture of using audit blocks to justify state changes a human had to weigh in on.

## Relationship to PolyGraph's own portability story

PolyGraph is leveldb-on-disk. A naive `cp -r data/polygraph/ backup/` is literally a backup. Restore is `cp -r backup/ data/polygraph/`. This makes the whole-instance snapshot design especially cheap for instances running on PolyGraph, which is exactly the default backend in the canonical archetype after Phase 1e.

But PolyGraph itself is a substrate that upgrades. Phase 1d shipped v0.1.4; v0.1.5 will ship eventually; the qengine graduation will ship after that. A leveldb produced by v0.1.4 must remain readable by v0.1.5 and v0.2.0 and v0.3.0 — or PolyGraph must ship its own export/import contract that bridges leveldb format changes. This is PolyGraph's responsibility, not the SI substrate's. The SI export contract assumes PolyGraph's leveldb is portable across PolyGraph versions; if it stops being so, that's a PolyGraph regression and the right fix is upstream in PolyGraph — the same direction Phase 1d went for the MERGE limitation. *"PolyGraph needs to grow up one limitation fix at a time."*

The SI export contract is also backend-agnostic by design. An instance running on Neo4j produces an export in the same logical shape as an instance running on PolyGraph. The export format does not mention backend internals. This means an upgrade can also be a backend swap: export from a Neo4j-backed asi, import into a PolyGraph-backed asi, run the substrate against the new backend. That is operationally useful — asi today runs against the constellation Neo4j and may not always want to; stores tomorrow runs against PolyGraph; an export-import contract that bridges the two means asi's instance can move to PolyGraph at a chosen moment without operational loss.

## What the contract requires the substrate to grow

This paper is doctrine, not code. The substrate has to acquire four new surfaces for the contract to become real.

**An `si instance export` command.** Produces a `tar.gz` artifact carrying the SIG export, the audit ledger snapshot, the identity records, the resolved markers, and the schema-version stamp. Idempotent; deterministic for a given instance state. Lives in the cli package. Default output path is `data/exports/<timestamp>-<schema-version>.tar.gz`.

**An `si instance import` command.** Consumes a `tar.gz` artifact produced by `si instance export`, validates the schema-version stamp, applies any required automatic migrations, surfaces any operator-assisted migrations as actionable findings, and restores the SIG + audit ledger + identity records to the substrate's storage. Refuses to import into a non-empty instance unless `--force` is passed. Records the import itself as an `instance.import.completed` event in the new audit ledger.

**A migrations catalog inside the substrate.** A directory (`src/migrations/`) of migration scripts, each named for the schema-version pair it bridges, each implementing a deterministic transformation against an open backend. The catalog is exhaustive for every version pair the substrate claims to support. CI verifies the catalog covers every pair declared in the version-bumps log.

**A round-trip integrity test in CI.** For every substrate version bump that touches the instance schema, CI must run an export-then-import round trip against a fixture instance and assert the post-import SIG matches the pre-export SIG within the migration's expected transformations. This is the regression net for the round-trip property. Without it, the contract decays silently.

## What this enables

Three operational properties become real once the contract is in place.

**An upgrade is a stop, swap, and restart.** Take the instance's last export. Replace the substrate (in place, or in a sibling directory the operator switches to). Run `si instance import` against the export. Resume operations. Migrations run automatically where they can and surface operator actions where they cannot. The operator never re-creates an instance from scratch unless they explicitly want to.

**An engagement is portable.** A `stores-solution-intelligence` instance running on a Mac mini can produce an export that an iLabs deploy can consume, and vice versa. The substrate runs on both. The instance moves between them. Same shape as a twin moving between constellations, scoped to the SI substrate.

**An instance can be branched.** An operator can produce an export, import it into a parallel substrate, experiment with substrate changes, and decide whether to promote the experiment back to the canonical substrate. The instance itself remains intact in the original substrate throughout. This is the prerequisite for the "I want to try a substrate refresh against a copy of production before doing it in production" operational pattern any real engagement will need.

These are not new ideas. They are what software has done since at least the era of `pg_dump`. The contract above is the small set of decisions that make them apply to SI instances specifically, with the SI-shaped guarantees the methodology promises — auditable, traceable, schema-versioned, deterministic where possible and operator-assisted where it cannot be.

## What this paper deliberately does not say

This paper names the contract. It does not specify the wire format. It does not specify the per-archetype export shape if a future granularity refactor changes the design. It does not specify how `si instance export` interacts with a substrate that is actively serving requests (the answer is "drain first" but the details belong in the operational guide, not the doctrine). It does not specify how exports are stored long-term, encrypted, or shared between operators (those are infrastructure choices that follow the contract; they do not change it).

It also does not say when the substrate should grow these surfaces. That is a planning question, not a doctrinal one. The morning's Phase 1a–1e shipped enough substrate refresh that the contract is now overdue; the right next move is probably a small phase that builds the export-import skeleton against the simplest design (whole-instance snapshot, schema-version stamp, no migrations catalog yet) and then grows from there. But this paper is not that plan. This paper is the doctrine the plan would honor.

## Decision log

- **2026-05-22:** Contract drafted in response to Bill's observation that the morning's substrate refresh implicitly relied on the substrate being newer than any instance data — which would not be safe for real engagements. The principle "the substrate upgrades, the instance endures" was lifted directly from the twin-portability decision of 2026-05-08 and extended to SI instances specifically. PolyGraph's own portability story was named as a separate concern that must hold independently for the SI export contract to remain backend-agnostic.

🖇️
