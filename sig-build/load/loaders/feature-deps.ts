/**
 * Loader: feature-to-feature dependencies + Stage→Feature assignments.
 *
 * Adds two kinds of edges to the build SIG that today's data does not have:
 *
 *   1. STAGE_BUILDS edges  (sw.stage  -> sw.feature)
 *      Encodes which build stage from BUILD-PLAN.md is responsible for
 *      delivering each feature. Anchors feature order in your explicit
 *      architecture decision, not just edge-count heuristics.
 *
 *   2. DEPENDS_ON edges    (sw.feature -> sw.feature)
 *      Encodes which features must be built before which. Derived from:
 *      - BUILD-PLAN.md §"The build stages" stage ordering
 *      - FEATURES.md prose (e.g. analysts read from GraphReader, which
 *        reads from SI/G; Studio's parser host needs the parser registry).
 *      - MODEL.md §"Architecture" — the SI/I, SI/G, SI/S, SI/W boundaries.
 *
 * With these edges in place, a topological sort over sw.feature gives a
 * real "build this feature first" answer that respects both stage
 * order and intra-stage dependencies. Features within the same stage
 * that share no dependency can be developed in parallel.
 *
 * The data is small (16 features, ~25 directed deps) so we encode it
 * inline in this loader — same pattern as repos.ts. The table BELOW
 * is the canonical record of these dependency decisions; the source
 * markdown documents (FEATURES.md, BUILD-PLAN.md) are the textual
 * narratives those decisions came from.
 *
 * Idempotency: re-running upserts. Deterministic edge ids.
 *
 * Run: docker compose stop si-sig-viz
 *      docker compose run --rm si-sig-load npx tsx /app/loaders/feature-deps.ts
 *      docker compose start si-sig-viz
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';

const DATA_DIR = '/data';

interface FeatureStageMapping {
  /** FT-SI-NN id (canonical FEATURES.md id). */
  feature: string;
  /** 1..7 — which BUILD-PLAN.md stage delivers this feature. */
  stage: number;
  /** Reason this feature lives in this stage (human-readable; goes on the edge). */
  why: string;
}

/**
 * Per-feature stage assignments derived from BUILD-PLAN.md
 * §"The build stages". Each feature belongs to exactly one stage.
 */
const STAGE_BUILDS: FeatureStageMapping[] = [
  // Stage 1 — Foundations
  { feature: 'FT-SI-16', stage: 1, why: 'Project-wide quality bar set up once; inherited by every later stage.' },
  // Stage 2 — Identity + auth
  { feature: 'FT-SI-10', stage: 2, why: 'SI/I + bangauth + 5-role permission matrix; every subsequent stage depends on auth.' },
  // Stage 3 — Graph + GraphLoader + DSL
  { feature: 'FT-SI-08', stage: 3, why: 'SI/G durable graph: the substrate that GraphLoader writes to and GraphReader reads from.' },
  { feature: 'FT-SI-05', stage: 3, why: 'GraphLoader: the sole writer to SI/G; ships with the graph backend.' },
  { feature: 'FT-SI-14', stage: 3, why: 'DSL versioning + deterministic replay: the .sigdsl contract GraphLoader consumes.' },
  { feature: 'FT-SI-15', stage: 3, why: 'Compose stack + port allocation: the container infrastructure that makes SI/G reachable.' },
  // Stage 4 — Studio + BB + first parser
  { feature: 'FT-SI-04', stage: 4, why: 'Studio BB substrate: the workshop where proposals are formed before GraphLoader promotes them.' },
  { feature: 'FT-SI-03', stage: 4, why: 'Parser registry + .sigdsl emission: hosted inside Studio.' },
  { feature: 'FT-SI-02', stage: 4, why: 'Input ingestion + epistemic classification: handled by parsers in Studio.' },
  { feature: 'FT-SI-12', stage: 4, why: 'chainblocks audit integration: every BB promotion + every parse emits an audit block; lands with the first end-to-end pipeline.' },
  // Stage 5 — Analysts + GraphReader + output
  { feature: 'FT-SI-07', stage: 5, why: 'GraphReader + standard deliverable suite: the sole producer of deliverables from SI/G.' },
  { feature: 'FT-SI-06', stage: 5, why: 'Analyst suite: reads SI/G via GraphReader, emits findings.' },
  { feature: 'FT-SI-13', stage: 5, why: 'Output bucket as git-initialized tree: where deliverables land.' },
  // Stage 6 — Window
  { feature: 'FT-SI-09', stage: 6, why: 'SI/W consumer window: read-mostly UI over what Stage 5 produced.' },
  // Stage 7 — Integration + polish
  { feature: 'FT-SI-01', stage: 7, why: 'Project lifecycle (init/up/down/destroy): full surface integration; lifecycle commands only complete after every service exists.' },
  { feature: 'FT-SI-11', stage: 7, why: '`si` CLI full v0.1 surface: every command requires the underlying service it talks to be done.' },
];

interface FeatureDep {
  /** The dependent feature: needs `dependsOn` first. */
  feature: string;
  /** The prerequisite feature. */
  dependsOn: string;
  /** Short human-readable reason. */
  why: string;
}

/**
 * Feature-to-feature dependencies. Each row says "feature cannot ship
 * until dependsOn is built." Derived from BUILD-PLAN.md stage ordering
 * + FEATURES.md prose semantics + MODEL.md architecture.
 *
 * Edges are stored as DEPENDS_ON (sw.feature -> sw.feature) which is
 * the same edge type used for repo-to-repo deps. The label is shared
 * because the semantic is the same: A depends on B means B must be
 * built before A.
 */
const FEATURE_DEPS: FeatureDep[] = [
  // Quality bar is foundational; every code-producing feature inherits
  // its CI gates. Modeled as a hard prereq for every product feature.
  { feature: 'FT-SI-10', dependsOn: 'FT-SI-16', why: 'Identity code passes the CI quality bar set by FT-SI-16.' },
  { feature: 'FT-SI-08', dependsOn: 'FT-SI-16', why: 'Graph backend code passes the CI quality bar.' },
  { feature: 'FT-SI-05', dependsOn: 'FT-SI-16', why: 'GraphLoader code passes the CI quality bar.' },
  { feature: 'FT-SI-14', dependsOn: 'FT-SI-16', why: 'DSL versioning code passes the CI quality bar.' },
  { feature: 'FT-SI-15', dependsOn: 'FT-SI-16', why: 'Compose-stack configs go through CI lint/typecheck.' },

  // Identity unlocks everything user-attributed. Every audit-emitting
  // feature transitively requires identity (the audit needs actor.userId).
  { feature: 'FT-SI-12', dependsOn: 'FT-SI-10', why: 'chainblocks audit blocks carry actor.userId; identity must resolve users first.' },
  { feature: 'FT-SI-04', dependsOn: 'FT-SI-10', why: 'BB substrate proposals are attributed to a logged-in operator.' },
  { feature: 'FT-SI-01', dependsOn: 'FT-SI-10', why: '`si init` creates the first Owner; lifecycle commands require auth thereafter.' },
  { feature: 'FT-SI-11', dependsOn: 'FT-SI-10', why: 'Every `si` command after `si login` carries a token.' },

  // Graph backend is the substrate for everything that reads/writes the graph.
  { feature: 'FT-SI-05', dependsOn: 'FT-SI-08', why: 'GraphLoader writes into SI/G; the backend must exist before the writer.' },
  { feature: 'FT-SI-14', dependsOn: 'FT-SI-08', why: 'DSL versioning + replay test runs against SI/G state.' },
  { feature: 'FT-SI-07', dependsOn: 'FT-SI-08', why: 'GraphReader reads from SI/G.' },

  // GraphLoader is the sole writer; every feature that ends up populating
  // the graph depends on it.
  { feature: 'FT-SI-04', dependsOn: 'FT-SI-05', why: 'BB substrate proposals are promoted to SI/G via GraphLoader.' },
  { feature: 'FT-SI-03', dependsOn: 'FT-SI-05', why: 'Parsers emit .sigdsl that GraphLoader consumes.' },

  // DSL is the contract parsers emit and GraphLoader consumes.
  { feature: 'FT-SI-03', dependsOn: 'FT-SI-14', why: 'Parsers emit .sigdsl in the versioned DSL format.' },

  // Compose stack must exist before any containerized service runs.
  { feature: 'FT-SI-04', dependsOn: 'FT-SI-15', why: 'Studio runs as a container in the compose stack.' },
  { feature: 'FT-SI-09', dependsOn: 'FT-SI-15', why: 'Window runs as a container in the compose stack.' },
  { feature: 'FT-SI-08', dependsOn: 'FT-SI-15', why: 'SI/G runs as a container with allocated host port.' },
  { feature: 'FT-SI-10', dependsOn: 'FT-SI-15', why: 'SI/I runs as a container in the compose stack.' },

  // Parser registry is hosted by Studio; ingestion uses the registry.
  { feature: 'FT-SI-02', dependsOn: 'FT-SI-03', why: 'Input ingestion routes documents to parsers from the registry.' },
  { feature: 'FT-SI-02', dependsOn: 'FT-SI-04', why: 'Ingestion happens inside Studio.' },

  // chainblocks audit blocks every state-changing operation; needed by
  // BB promotion + ingestion + lifecycle commands.
  { feature: 'FT-SI-04', dependsOn: 'FT-SI-12', why: 'Every BB promotion emits an audit block.' },
  { feature: 'FT-SI-01', dependsOn: 'FT-SI-12', why: 'Lifecycle commands (init/up/down/destroy) emit audit blocks.' },
  { feature: 'FT-SI-13', dependsOn: 'FT-SI-12', why: 'Output bucket commit hashes are recorded in the audit ledger.' },

  // GraphReader is the sole producer of deliverables; analysts and Window
  // both consume through it.
  { feature: 'FT-SI-06', dependsOn: 'FT-SI-07', why: 'Analysts read SI/G via GraphReader.' },
  { feature: 'FT-SI-09', dependsOn: 'FT-SI-07', why: 'Window renders deliverables produced by GraphReader.' },

  // Output bucket is where GraphReader writes deliverables.
  { feature: 'FT-SI-07', dependsOn: 'FT-SI-13', why: 'GraphReader writes deliverable artifacts into the git-initialized output tree.' },
  // ↑ Note: FT-SI-13 (output bucket) is itself a Stage 5 feature; the
  // dep here forces the output-bucket scaffolding to be in place before
  // GraphReader fills it. Both end up in the same stage but in this
  // sub-order.

  // Lifecycle integration depends on every prior service existing.
  { feature: 'FT-SI-01', dependsOn: 'FT-SI-08', why: 'si up brings up SI/G; lifecycle cannot complete without the graph service.' },
  { feature: 'FT-SI-01', dependsOn: 'FT-SI-04', why: 'si up brings up Studio.' },
  { feature: 'FT-SI-01', dependsOn: 'FT-SI-09', why: 'si up brings up Window.' },

  // Full CLI surface integrates every prior feature.
  { feature: 'FT-SI-11', dependsOn: 'FT-SI-01', why: '`si` CLI subcommands include init/up/down/destroy (FT-SI-01).' },
  { feature: 'FT-SI-11', dependsOn: 'FT-SI-02', why: '`si ingest` exercises FT-SI-02.' },
  { feature: 'FT-SI-11', dependsOn: 'FT-SI-06', why: '`si analyze` exercises FT-SI-06.' },
  { feature: 'FT-SI-11', dependsOn: 'FT-SI-07', why: '`si report` exercises FT-SI-07.' },
];

async function main(): Promise<void> {
  console.log(`[loader/feature-deps] ${STAGE_BUILDS.length} STAGE_BUILDS + ${FEATURE_DEPS.length} DEPENDS_ON edges encoded`);

  console.log(`[loader/feature-deps] opening PolyGraph at ${DATA_DIR}`);
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  // Precondition: features + stages must already be loaded.
  const existingFeatures = await graph.findNodes('sw.feature');
  const existingFeatureIds = new Set(
    existingFeatures.map((n: any) => n.properties.ftId as string),
  );
  const existingStages = await graph.findNodes('sw.stage');
  const existingStageNumbers = new Set(
    existingStages.map((n: any) => n.properties.stageNumber as number),
  );
  console.log(
    `[loader/feature-deps] precondition: ${existingFeatures.length} sw.feature + ${existingStages.length} sw.stage in graph`,
  );

  if (existingFeatures.length === 0 || existingStages.length === 0) {
    console.error(
      '[loader/feature-deps] FAIL: features or stages missing. Run features.ts + repos.ts first.',
    );
    process.exit(1);
  }

  let stageBuildsCreated = 0;
  let dependsOnCreated = 0;
  let missingFeature = 0;
  let missingStage = 0;
  const missingFeatureIds = new Set<string>();
  const missingStageNumbers = new Set<number>();

  // 1. STAGE_BUILDS: sw.stage -> sw.feature
  for (const m of STAGE_BUILDS) {
    if (!existingFeatureIds.has(m.feature)) {
      missingFeatureIds.add(m.feature);
      missingFeature++;
      continue;
    }
    if (!existingStageNumbers.has(m.stage)) {
      missingStageNumbers.add(m.stage);
      missingStage++;
      continue;
    }
    const fromId = `stage:${m.stage}`;
    const toId = `ft:${m.feature}`;
    try {
      await graph.createRelationship(fromId, toId, 'STAGE_BUILDS', {
        source: 'BUILD-PLAN.md §"The build stages"',
        why: m.why,
      });
      stageBuildsCreated++;
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate')
      ) {
        continue;
      }
      throw err;
    }
  }

  // 2. DEPENDS_ON: sw.feature -> sw.feature
  for (const d of FEATURE_DEPS) {
    if (!existingFeatureIds.has(d.feature) || !existingFeatureIds.has(d.dependsOn)) {
      missingFeature++;
      if (!existingFeatureIds.has(d.feature)) missingFeatureIds.add(d.feature);
      if (!existingFeatureIds.has(d.dependsOn)) missingFeatureIds.add(d.dependsOn);
      continue;
    }
    const fromId = `ft:${d.feature}`;
    const toId = `ft:${d.dependsOn}`;
    try {
      await graph.createRelationship(fromId, toId, 'DEPENDS_ON', {
        source: 'feature-deps.ts (BUILD-PLAN.md + FEATURES.md + MODEL.md)',
        why: d.why,
      });
      dependsOnCreated++;
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate')
      ) {
        continue;
      }
      throw err;
    }
  }

  console.log(
    `[loader/feature-deps] edges: ${stageBuildsCreated} STAGE_BUILDS, ${dependsOnCreated} DEPENDS_ON`,
  );
  if (missingFeatureIds.size > 0) {
    console.warn(
      `[loader/feature-deps] WARN: missing feature ids: ${[...missingFeatureIds].sort().join(', ')}`,
    );
  }
  if (missingStageNumbers.size > 0) {
    console.warn(
      `[loader/feature-deps] WARN: missing stage numbers: ${[...missingStageNumbers].sort().join(', ')}`,
    );
  }

  // 3. Topological build-order verification: run a topo sort over
  // sw.feature DEPENDS_ON edges. If it succeeds, no cycles; emit the
  // wave layering for the team's reference.
  console.log('');
  console.log('[loader/feature-deps] === build-order verification ===');
  const featureIds = [...existingFeatureIds];
  const deps = new Map<string, Set<string>>(); // ft -> ft it depends on
  for (const ft of featureIds) deps.set(ft, new Set());
  for (const d of FEATURE_DEPS) {
    if (existingFeatureIds.has(d.feature) && existingFeatureIds.has(d.dependsOn)) {
      deps.get(d.feature)!.add(d.dependsOn);
    }
  }
  const done = new Set<string>();
  const waves: string[][] = [];
  while (done.size < featureIds.length) {
    const ready = featureIds.filter(
      (f) => !done.has(f) && [...deps.get(f)!].every((d) => done.has(d)),
    );
    if (ready.length === 0) {
      const stuck = featureIds.filter((f) => !done.has(f));
      console.error(
        `[loader/feature-deps] CYCLE: ${stuck.length} features unable to layer: ${stuck.join(', ')}`,
      );
      break;
    }
    ready.sort();
    waves.push(ready);
    for (const f of ready) done.add(f);
  }
  console.log(`[loader/feature-deps] ${waves.length} build waves derived:`);
  for (let i = 0; i < waves.length; i++) {
    console.log(`  Wave ${i + 1}: ${waves[i]!.join(', ')}`);
  }

  await graph.close();
  console.log('[loader/feature-deps] DONE');
}

main().catch((err) => {
  console.error('[loader/feature-deps] FAILED:', err);
  process.exit(1);
});
