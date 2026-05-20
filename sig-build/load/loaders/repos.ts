/**
 * Loader: BUILD-STAGE-01-SPEC.md poly-repo layout -> sw.repo Tier-2 nodes +
 * DEPENDS_ON edges.
 *
 * The 8-repo plan + inter-repo dependencies + stage assignments are
 * canonical in BUILD-STAGE-01-SPEC.md §"Architecture decision: Poly-repo
 * with publishability-based layout". The data is small and the markdown
 * source would be brittle to parse, so we encode it inline here and treat
 * the const REPOS table below as the truth-shaped record of Bill's
 * decision.
 *
 * Why sw.repo: per MODEL.md §2.1 Tier 2, `sw.repo` is "a unit of code
 * versioned together that produces a unit of artifact." Each of the 8
 * SI v0.1 repos fits exactly.
 *
 * The loader also creates STAGE_PRODUCES edges to a small set of synthetic
 * sw.stage nodes (Stage 1..Stage 7) so the Sankey view eventually gets
 * a fourth layer (Repo → Stage) for "which stage fills which repo."
 *
 * Idempotency: stable ids (`repo:<name>`, `stage:<n>`). Re-runs upsert.
 *
 * Run: docker compose stop si-sig-viz
 *      docker compose run --rm si-sig-load npx tsx /app/loaders/repos.ts
 *      docker compose start si-sig-viz
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';

const DATA_DIR = '/data';

interface RepoRecord {
  name: string;
  publishability: 'standalone' | 'si-internal';
  path: string;
  purpose: string;
  filledByStages: number[];
  /** Inter-repo deps. */
  dependsOn: string[];
  /** External (already-existing) deps that aren't part of SI's 8 repos. */
  dependsOnExternal: string[];
}

const REPOS: RepoRecord[] = [
  // ── Flat repos (standalone-publishable; siblings of polygraph/bangauth/chainblocks)
  {
    name: 'solution-intelligence-graph-adapter',
    publishability: 'standalone',
    path: 'artifacts/solution-intelligence-graph-adapter/',
    purpose:
      'SI/G — PolyGraph adapter, GraphLoader, three-tier-schema enforcement, DSL validator, chainblocks audit integration. Useful to anyone building a graph-shaped audit-attached system.',
    filledByStages: [3],
    dependsOn: [],
    dependsOnExternal: ['polygraph'],
  },
  {
    name: 'solution-intelligence-parsers',
    publishability: 'standalone',
    path: 'artifacts/solution-intelligence-parsers/',
    purpose:
      'Parser library (markdown-intent, csharp-treesitter stub, future PDF/log/SQL parsers). The parser interface is portable; other projects could write parsers against it.',
    filledByStages: [4],
    dependsOn: [],
    dependsOnExternal: [],
  },
  {
    name: 'solution-intelligence-analysts',
    publishability: 'standalone',
    path: 'artifacts/solution-intelligence-analysts/',
    purpose:
      'Analyst library (Inventory, DependencyAtlas, IntentVsReality, ConstraintCoverage, RiskSurface). The analyst interface is a reusable pattern; other projects could write analysts against it.',
    filledByStages: [5],
    dependsOn: [],
    dependsOnExternal: [],
  },
  // ── Nested repos (SI-internal; under si-build/)
  {
    name: 'solution-intelligence-cli',
    publishability: 'si-internal',
    path: 'artifacts/si-build/cli/',
    purpose:
      'The `si` CLI (init, up, down, ingest, analyze, report, verify, grant, etc.). SI-specific by definition.',
    filledByStages: [2, 3, 4, 5, 6, 7],
    dependsOn: [
      'solution-intelligence-identity',
      'solution-intelligence-graph-adapter',
      'solution-intelligence-studio',
      'solution-intelligence-templates',
    ],
    dependsOnExternal: [],
  },
  {
    name: 'solution-intelligence-identity',
    publishability: 'si-internal',
    path: 'artifacts/si-build/identity/',
    purpose:
      'SI/I — a thin wrapper around bangauth specialized for SI 5-role model and per-project grant semantics. The substrate (bangauth) stands alone; SI wrapper does not.',
    filledByStages: [2],
    dependsOn: [],
    dependsOnExternal: ['bangauth'],
  },
  {
    name: 'solution-intelligence-studio',
    publishability: 'si-internal',
    path: 'artifacts/si-build/studio/',
    purpose:
      'SI/S — BB substrate + dev UI + parser/analyst host. SI workshop. May eventually extract its BB substrate as standalone @blackboard/core post-v0.1.',
    filledByStages: [4],
    dependsOn: [
      'solution-intelligence-graph-adapter',
      'solution-intelligence-parsers',
      'solution-intelligence-analysts',
    ],
    dependsOnExternal: [],
  },
  {
    name: 'solution-intelligence-window',
    publishability: 'si-internal',
    path: 'artifacts/si-build/window/',
    purpose: 'SI/W — consumer UI, role-scoped views. SI-specific.',
    filledByStages: [6],
    dependsOn: ['solution-intelligence-graph-adapter'],
    dependsOnExternal: [],
  },
  {
    name: 'solution-intelligence-templates',
    publishability: 'si-internal',
    path: 'artifacts/si-build/templates/',
    purpose:
      'Template manifests (prose-doc ready, csharp-to-servicenow stubbed). SI-specific by definition.',
    filledByStages: [4, 5],
    dependsOnExternal: [],
    dependsOn: [],
  },
];

const STAGES: { num: number; name: string }[] = [
  { num: 1, name: 'Foundations' },
  { num: 2, name: 'Identity + auth' },
  { num: 3, name: 'Graph + GraphLoader + DSL' },
  { num: 4, name: 'Studio + BB + first-parser' },
  { num: 5, name: 'Analysts + GraphReader + output' },
  { num: 6, name: 'Window' },
  { num: 7, name: 'Integration' },
];

async function main(): Promise<void> {
  console.log(`[loader/repos] ${REPOS.length} repos, ${STAGES.length} stages encoded`);

  console.log(`[loader/repos] opening PolyGraph at ${DATA_DIR}`);
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  let reposInserted = 0;
  let reposSkipped = 0;
  let stagesInserted = 0;
  let stagesSkipped = 0;
  let dependsOnCreated = 0;
  let producesCreated = 0;
  let missingDepEdgesSkipped = 0;
  const missingDeps = new Set<string>();

  // 1. Insert all 8 repos.
  for (const r of REPOS) {
    const id = `repo:${r.name}`;
    try {
      await graph.createNode(
        ['sw.repo', 'BuildSIG'],
        {
          id,
          repoName: r.name,
          name: r.name,
          publishability: r.publishability,
          path: r.path,
          purpose: r.purpose,
          filledByStages: JSON.stringify(r.filledByStages),
          tier: 2,
          domain: 'sw',
          sourceFile: 'BUILD-STAGE-01-SPEC.md',
        },
        id,
      );
      reposInserted++;
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate')
      ) {
        reposSkipped++;
      } else {
        throw err;
      }
    }
  }

  // 2. Insert 7 synthetic stages.
  for (const s of STAGES) {
    const id = `stage:${s.num}`;
    try {
      await graph.createNode(
        ['sw.stage', 'BuildSIG'],
        {
          id,
          stageNumber: s.num,
          name: `Stage ${s.num}`,
          title: s.name,
          tier: 2,
          domain: 'sw',
          sourceFile: 'BUILD-PLAN.md',
        },
        id,
      );
      stagesInserted++;
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate')
      ) {
        stagesSkipped++;
      } else {
        throw err;
      }
    }
  }

  // 3. DEPENDS_ON edges (between SI's own repos only; external deps are
  // recorded as a property string but not created as nodes here — they
  // belong to other projects, not this SIG's scope).
  const repoIds = new Set(REPOS.map((r) => `repo:${r.name}`));
  for (const r of REPOS) {
    const fromId = `repo:${r.name}`;
    for (const depName of r.dependsOn) {
      const toId = `repo:${depName}`;
      if (!repoIds.has(toId)) {
        missingDeps.add(depName);
        missingDepEdgesSkipped++;
        continue;
      }
      try {
        await graph.createRelationship(fromId, toId, 'DEPENDS_ON', {
          source: 'BUILD-STAGE-01-SPEC.md',
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
  }

  // 4. PRODUCES edges: Stage N -> Repo R when Stage N fills R.
  // Direction: Stage produces (fills) Repo, so Sankey shows Stage on the
  // left and Repo on the right.
  for (const r of REPOS) {
    const toId = `repo:${r.name}`;
    for (const stageNum of r.filledByStages) {
      const fromId = `stage:${stageNum}`;
      try {
        await graph.createRelationship(fromId, toId, 'PRODUCES', {
          source: 'BUILD-STAGE-01-SPEC.md',
        });
        producesCreated++;
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
  }

  console.log(
    `[loader/repos] nodes: ${reposInserted} repos inserted (${reposSkipped} skipped), ${stagesInserted} stages inserted (${stagesSkipped} skipped)`,
  );
  console.log(
    `[loader/repos] edges: ${dependsOnCreated} DEPENDS_ON, ${producesCreated} PRODUCES`,
  );
  if (missingDeps.size > 0) {
    console.warn(
      `[loader/repos] WARN: ${missingDepEdgesSkipped} DEPENDS_ON edges had no SI-internal target (these are likely external deps captured in property only): ${[...missingDeps].sort().join(', ')}`,
    );
  }

  const allRepos = await graph.findNodes('sw.repo');
  const allStages = await graph.findNodes('sw.stage');
  console.log(
    `[loader/repos] verify: ${allRepos.length} sw.repo + ${allStages.length} sw.stage nodes in graph`,
  );

  await graph.close();
  console.log('[loader/repos] DONE');
}

main().catch((err) => {
  console.error('[loader/repos] FAILED:', err);
  process.exit(1);
});
