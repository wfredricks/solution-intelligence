# si-sig — The Solution Intelligence Build SIG

*The PolyGraph-backed knowledge graph that models **Solution Intelligence itself as a solution being built.** Traces every requirement, through features and use cases, down to the classes and functions that will implement it. The SI's SIG is the model for the SI application.*

This is distinct from the **bookend SIG** at `../sig/` which models the design documents. The build SIG models the implementation those documents describe.

---

## What's in the container

A single container, `si-sig`, runs **PolyGraph + PolyGraph-Viz**:

- **PolyGraph** is the embedded graph database (LevelDB-backed).
- **PolyGraph-Viz** is the browser visualizer (Hono server on port 4444 inside the container).
- The container exposes the visualizer on **host port 30100**.
- The graph data lives at `/data` inside the container, backed by a named Docker volume `si-sig-data`.

The container is a single process — `npx polygraph-viz --path /data --port 4444 --write` — that owns the embedded PolyGraph and serves both the visualization and the write API.

## Quick start

```bash
cd ~/.openclaw/workspace/artifacts/solution-intelligence/sig-build/

# Build and start
docker compose up -d

# Verify
docker ps --filter "name=si-sig"

# Open the visualizer
open http://localhost:30100

# Stop (data survives)
docker compose down

# Reset (data destroyed)
docker compose down -v
```

## What the build SIG models

The build SIG uses the **three-tier SI schema** declared in `../MODEL.md` §2.1, applied to *SI itself as a software solution*:

- **Tier 1 — Solution-universal** (timeless across all solutions)
  - `intended_behavior` — each REQ-SI-NNN from `../REQUIREMENTS.md`
  - `constraint` — doctrinal commitments + NF requirements
  - `finding` — coverage and drift findings (analysts run against this graph too)

- **Tier 2 — `sw.*` Software solution domain** (timeless for any software solution)
  - `sw.repo` — each of the 8 repos in the SI v0.1 poly-repo layout
  - `sw.package` — npm packages each repo publishes
  - `sw.module` — modules within a package
  - `sw.class` — class definitions
  - `sw.function` — function/method definitions
  - `sw.interface` — interface definitions
  - `sw.type` — type aliases
  - `sw.test` — tests and test files
  - `sw.use_case` — UC-N from `../docs/USE-CASES.md`
  - `sw.feature` — FT-SI-NN from `../docs/FEATURES.md`
  - `sw.cli_command` — `si` subcommands
  - `sw.endpoint` — HTTP/gRPC endpoints
  - `sw.compose_service` — Docker compose services
  - `sw.audit_event` — chainblocks audit block kinds the code emits
  - `sw.dependency_edge` — declared inter-package dependencies

- **Tier 3 — `cs_2026.*` Implementation paradigm** (era-namespaced, paradigm-bound)
  - `cs_2026.source_file` — concrete .ts files
  - `cs_2026.function`, `cs_2026.class`, `cs_2026.interface`, etc. — concrete implementation units

The same three-tier discipline that MODEL.md applies to a customer's solution applies here to SI itself. The methodology's first real customer at the implementation level is itself.

## Cross-tier edges

The load-bearing edges from MODEL.md §2.2 apply here as well:

- `IMPLEMENTS_INTENT_OF` — `sw.class`/`sw.function` → `intended_behavior` ("this class/function implements this REQ")
- `EXERCISES` — `sw.test` → `intended_behavior` ("this test validates this REQ")
- `PRODUCES` — `sw.repo` → `sw.package`
- `DECLARES` — `sw.repo` → `sw.module`
- `DEPENDS_ON` — `sw.repo` → `sw.repo`
- `EMITS` — `sw.function` → `sw.audit_event`
- `PART_OF_PROCESS` — `sw.cli_command` → `sw.workflow` (the engagement lifecycle workflow)
- `DERIVED_FROM` — any node → `input_artifact` (the source document the node came from)
- `TRACED_TO` — any node → source-file:line-range

## Loading order (one stage at a time)

The graph is built **incrementally**, one build stage at a time, per the FOUNDATION-SEED pattern's "cultivate, don't just produce" doctrine.

1. **REQUIREMENTS** — load all 111 REQs as `intended_behavior` Tier-1 nodes. *(Step 1, current.)*
2. **FEATURES** — load 16 features as `sw.feature` nodes; create `IMPLEMENTS` edges to REQs.
3. **USE-CASES** — load 18 UCs as `sw.use_case` nodes; create `EXERCISES` edges to REQs and `INVOLVES` edges to features.
4. **REPOS** — load the 8 repos as `sw.repo` nodes; create `DEPENDS_ON` edges between them.
5. **STAGE 1 DETAIL** — for each repo, load the planned `sw.module`/`sw.test` skeleton from BUILD-STAGE-01-SPEC.md.
6. **STAGE 2-7 DETAIL** — load incrementally as each stage's brief is written.

After each load, run **coverage queries**: which REQs have no implementing feature? Which features have no UC? Which repos have no test? These surface gaps before code is written.

## Ingest scripts

Ingest scripts live at `loaders/<source>.ts` and are run via `docker exec` against the running container. They use the embedded PolyGraph instance the container already has open.

```bash
docker exec si-sig node /app/loaders/requirements.js
```

Loaders are idempotent: re-running a loader against an already-loaded source produces no duplicates (matches by `id`).

## Why this is separate from the bookend SIG

| | bookend SIG (`../sig/`) | build SIG (`./`) |
|---|---|---|
| **Models** | Design documents (STORY, REQUIREMENTS, MODEL, ...) | Implementation (repos, modules, classes, functions) |
| **Schema labels** | Bookend-domain (`Requirement`, `Feature`, `UseCase`, `SchemaLabel`, ...) | SI three-tier (`intended_behavior`, `sw.*`, `cs_2026.*`) |
| **Substrate** | Embedded PolyGraph, no container | PolyGraph + PolyGraph-Viz in `si-sig` container |
| **Question it answers** | "Is the design self-consistent?" | "Does every requirement trace to code that implements it?" |
| **Refresh** | Re-ingest from markdown when prose changes | Cultivate as implementation grows |

Both graphs coexist. Neither replaces the other. The bookend SIG is the methodology's design-validation customer; the build SIG is the methodology's implementation-traceability customer.

---

*sig-build/ v0.1 — Solution Intelligence build SIG. Distinct from the bookend SIG at `../sig/`. The methodology's first real customer at the implementation level is itself.*
