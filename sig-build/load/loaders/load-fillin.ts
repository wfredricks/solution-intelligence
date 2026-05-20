/**
 * load-fillin.ts — Option-A fill-in loader for v0.3.5.
 *
 * Ingests the AST-extracted dom/imp CSVs + hand-curated function→feature
 * mapping CSV into the running build SIG. Idempotent.
 *
 * Reads from /sources/csv/ (mounted from
 * artifacts/solution-intelligence/sig-build/load/csv/):
 *   dom-files.csv         -> sw.file nodes
 *   dom-functions.csv     -> sw.function nodes
 *   dom-alt-flows.csv     -> sw.alt_flow nodes
 *   dom-call-outs.csv     -> sw.call_out nodes
 *   edges.csv             -> LIVES_IN, DECLARES, HAS_ALT_FLOW,
 *                            EMITS_CALLOUT, REALIZES_FORM,
 *                            and the cs_2026.* realizations (creates
 *                            target nodes lazily on edge insert).
 *   function-features.csv -> IMPLEMENTS_INTENT_OF edges (fn -> feature)
 *
 * Precondition: features.ts + repos.ts + feature-deps.ts have already
 * run (so sw.feature + sw.repo nodes exist as edge endpoints).
 *
 * The cs_2026.* tier-3 nodes are created lazily when REALIZES_FORM
 * edges in edges.csv reference them as fromId; we materialize them on
 * the fly so the inventory script doesn't need to list them separately.
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { readCsv, LoadCounter, isDuplicateError } from './csv-loader.js';

const DATA_DIR = '/data';
const CSV_DIR = '/sources/csv';

interface RawNodeInsert {
  labels: string[];
  properties: Record<string, unknown>;
  id: string;
}

async function tryCreateNode(
  graph: any,
  insert: RawNodeInsert,
  ctr: LoadCounter,
): Promise<void> {
  try {
    await graph.createNode(insert.labels, insert.properties, insert.id);
    ctr.nodesCreated++;
  } catch (err) {
    if (isDuplicateError(err)) {
      ctr.nodesSkipped++;
      return;
    }
    throw err;
  }
}

async function tryCreateEdge(
  graph: any,
  fromId: string,
  toId: string,
  type: string,
  properties: Record<string, unknown>,
  ctr: LoadCounter,
): Promise<void> {
  try {
    await graph.createRelationship(fromId, toId, type, properties);
    ctr.edgesCreated++;
  } catch (err) {
    if (isDuplicateError(err)) {
      ctr.edgesSkipped++;
      return;
    }
    const msg = (err as Error)?.message ?? String(err);
    // Tolerate missing-endpoint errors — the load-fillin step prepends
    // the bulk of nodes, but a few edge endpoints (newly-added biz-2
    // features, future Tier-3 nodes) may not yet exist. Surface and
    // continue rather than hard-fail the whole run.
    if (msg.includes('not found')) {
      ctr.warn(`edge ${fromId} -${type}-> ${toId} skipped: ${msg.slice(0, 100)}`);
      ctr.edgesSkipped++;
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  console.log('[load-fillin] opening PolyGraph at', DATA_DIR);
  const graph: any = new PolyGraph({
    adapter: new LevelAdapter({ path: DATA_DIR }),
  });
  await graph.open();

  // Precondition: existing sw.feature / sw.repo nodes.
  const existingFeatures = await graph.findNodes('sw.feature');
  const featureIds = new Set<string>(
    existingFeatures.map((n: any) => n.properties.ftId as string),
  );
  const existingRepos = await graph.findNodes('sw.repo');
  const repoIds = new Set<string>(
    existingRepos.map((n: any) => n.properties.repoName as string),
  );
  console.log(
    `[load-fillin] precondition: ${existingFeatures.length} sw.feature, ${existingRepos.length} sw.repo`,
  );

  const ctr = new LoadCounter();

  // ── 0. Materialize missing repos (substrate + bookend) ──────
  // The existing build SIG models the 8 SI v0.1 product repos. We also
  // need nodes for the bookend repo (solution-intelligence) itself and
  // the substrate repos (polygraph, polygraph-viz, bangauth, chainblocks)
  // because dom-files.csv references them as LIVES_IN targets.
  {
    const substrateRepos = [
      { id: 'repo:solution-intelligence', name: 'solution-intelligence', purpose: 'SI v0.1 bookend (design corpus + build SIG)', publishability: 'standalone' },
      { id: 'repo:polygraph-viz', name: 'polygraph-viz', purpose: 'D3 visualizer for any PolyGraph database (NL + chat at v0.3+)', publishability: 'standalone' },
      { id: 'repo:polygraph', name: 'polygraph', purpose: 'Embeddable graph database (LevelDB-backed)', publishability: 'standalone' },
      { id: 'repo:bangauth', name: 'bangauth', purpose: 'Embeddable identity provider with MFA', publishability: 'standalone' },
      { id: 'repo:chainblocks', name: 'chainblocks', purpose: 'Immutable hash-chained audit ledger', publishability: 'standalone' },
    ];
    for (const r of substrateRepos) {
      await tryCreateNode(
        graph,
        {
          id: r.id,
          labels: ['sw.repo', 'BuildSIG'],
          properties: {
            id: r.id,
            repoName: r.name,
            name: r.name,
            publishability: r.publishability,
            purpose: r.purpose,
            tier: 2,
            domain: 'sw',
            sourceFile: 'sig-build/load/loaders/load-fillin.ts',
          },
        },
        ctr,
      );
      repoIds.add(r.name);
    }
  }

  // ── 1. dom-files.csv -> sw.file nodes ──────────────────────────
  {
    const rows = readCsv(`${CSV_DIR}/dom-files.csv`);
    console.log(`[load-fillin] dom-files.csv: ${rows.length} rows`);
    for (const r of rows) {
      const repoExists = repoIds.has(r['repo']!);
      if (!repoExists) {
        ctr.warn(`dom-files: repo "${r['repo']}" not in graph — file ${r['id']} will lack LIVES_IN target`);
      }
      await tryCreateNode(
        graph,
        {
          id: r['id']!,
          labels: ['sw.file', 'BuildSIG'],
          properties: {
            id: r['id'],
            name: r['path'],
            path: r['path'],
            repo: r['repo'],
            language: r['language'],
            lineCount: parseInt(r['lineCount'] ?? '0', 10),
            tier: 2,
            domain: 'sw',
          },
        },
        ctr,
      );
    }
  }

  // ── 2. dom-functions.csv -> sw.function nodes ─────────────────
  {
    const rows = readCsv(`${CSV_DIR}/dom-functions.csv`);
    console.log(`[load-fillin] dom-functions.csv: ${rows.length} rows`);
    for (const r of rows) {
      await tryCreateNode(
        graph,
        {
          id: r['id']!,
          labels: ['sw.function', 'BuildSIG'],
          properties: {
            id: r['id'],
            name: r['name'],
            signature: r['signature'],
            returnType: r['returnType'],
            kind: r['kind'],
            isAsync: r['isAsync'] === 'true',
            fileId: r['fileId'],
            sourceLineStart: parseInt(r['sourceLineStart'] ?? '0', 10),
            sourceLineEnd: parseInt(r['sourceLineEnd'] ?? '0', 10),
            tier: 2,
            domain: 'sw',
          },
        },
        ctr,
      );
    }
  }

  // ── 3. dom-alt-flows.csv -> sw.alt_flow nodes ─────────────────
  {
    const rows = readCsv(`${CSV_DIR}/dom-alt-flows.csv`);
    console.log(`[load-fillin] dom-alt-flows.csv: ${rows.length} rows`);
    for (const r of rows) {
      await tryCreateNode(
        graph,
        {
          id: r['id']!,
          labels: ['sw.alt_flow', 'BuildSIG'],
          properties: {
            id: r['id'],
            name: r['name'],
            condition: r['condition'],
            behavior: r['behavior'],
            fnId: r['fnId'],
            sourceLineStart: parseInt(r['sourceLineStart'] ?? '0', 10),
            sourceLineEnd: parseInt(r['sourceLineEnd'] ?? '0', 10),
            tier: 2,
            domain: 'sw',
          },
        },
        ctr,
      );
    }
  }

  // ── 4. dom-call-outs.csv -> sw.call_out nodes ─────────────────
  {
    const rows = readCsv(`${CSV_DIR}/dom-call-outs.csv`);
    console.log(`[load-fillin] dom-call-outs.csv: ${rows.length} rows`);
    for (const r of rows) {
      await tryCreateNode(
        graph,
        {
          id: r['id']!,
          labels: ['sw.call_out', 'BuildSIG'],
          properties: {
            id: r['id'],
            name: r['target'],
            target: r['target'],
            kind: r['kind'],
            purpose: r['purpose'],
            fnId: r['fnId'],
            sourceLineStart: parseInt(r['sourceLineStart'] ?? '0', 10),
            sourceLineEnd: parseInt(r['sourceLineEnd'] ?? '0', 10),
            tier: 2,
            domain: 'sw',
          },
        },
        ctr,
      );
    }
  }

  // ── 5. edges.csv -> all the edges + lazy cs_2026.* node creation
  {
    const rows = readCsv(`${CSV_DIR}/edges.csv`);
    console.log(`[load-fillin] edges.csv: ${rows.length} rows`);
    const tier3Created = new Set<string>();
    for (const r of rows) {
      const fromId = r['fromId']!;
      const toId = r['toId']!;
      const type = r['type']!;
      // Lazy-create Tier-3 nodes that appear as REALIZES_FORM sources.
      // The label is encoded in the id prefix (cs_2026.file:..., cs_2026.fn:...).
      if (type === 'REALIZES_FORM' && fromId.startsWith('cs_2026.')) {
        if (!tier3Created.has(fromId)) {
          tier3Created.add(fromId);
          // Extract the label from the id ('cs_2026.file:foo' -> 'cs_2026.file').
          const colonIdx = fromId.indexOf(':');
          const label = colonIdx > 0 ? fromId.slice(0, colonIdx) : 'cs_2026.unknown';
          await tryCreateNode(
            graph,
            {
              id: fromId,
              labels: [label, 'BuildSIG'],
              properties: {
                id: fromId,
                name: fromId,
                realizes: toId,
                tier: 3,
                paradigm: 'cs_2026',
              },
            },
            ctr,
          );
        }
      }
      await tryCreateEdge(
        graph,
        fromId,
        toId,
        type,
        { source: r['source'] ?? 'load-fillin' },
        ctr,
      );
    }
  }

  // ── 5.5 biz-extensions.csv -> REQ-SI2-NNN, UC-SI2-N, FT-SI2-NN ──
  {
    const rows = readCsv(`${CSV_DIR}/biz-extensions.csv`);
    console.log(`[load-fillin] biz-extensions.csv: ${rows.length} rows`);
    let reqs = 0, ucs = 0, fts = 0;
    for (const r of rows) {
      const kind = r['kind'];
      if (kind === 'req') {
        // intended_behavior (Tier-1) node, namespaced REQ-SI2-NNN.
        // Store with same shape the requirements loader produces.
        const id = `req:${r['id']}`;
        await tryCreateNode(
          graph,
          {
            id,
            labels: ['intended_behavior', 'BuildSIG'],
            properties: {
              id,
              reqId: r['id'],
              name: r['id'],
              title: r['title'],
              summary: r['summary'],
              category: r['category'] || 'functional',
              tier: 1,
              namespace: 'SI2',
              sourceFile: 'sig-build/load/csv/biz-extensions.csv',
            },
          },
          ctr,
        );
        reqs++;
      } else if (kind === 'uc') {
        const id = `uc:${r['id']}`;
        await tryCreateNode(
          graph,
          {
            id,
            labels: ['sw.use_case', 'BuildSIG'],
            properties: {
              id,
              ucId: r['id'],
              name: r['id'],
              title: r['title'],
              summary: r['summary'],
              tier: 2,
              domain: 'sw',
              namespace: 'SI2',
              sourceFile: 'sig-build/load/csv/biz-extensions.csv',
            },
          },
          ctr,
        );
        ucs++;
        // EXERCISES edges: UC -> REQ (each |-separated id in reqsExercised)
        for (const rid of (r['reqsExercised'] || '').split('|').map((x) => x.trim()).filter(Boolean)) {
          await tryCreateEdge(graph, id, `req:${rid}`, 'EXERCISES', { source: 'biz-extensions.csv' }, ctr);
        }
      } else if (kind === 'ft') {
        const id = `ft:${r['id']}`;
        await tryCreateNode(
          graph,
          {
            id,
            labels: ['sw.feature', 'BuildSIG'],
            properties: {
              id,
              ftId: r['id'],
              name: r['id'],
              title: r['title'],
              summary: r['summary'],
              tier: 2,
              domain: 'sw',
              namespace: 'SI2',
              sourceFile: 'sig-build/load/csv/biz-extensions.csv',
            },
          },
          ctr,
        );
        fts++;
        // IMPLEMENTS edges: FT -> REQ
        for (const rid of (r['reqsImplemented'] || '').split('|').map((x) => x.trim()).filter(Boolean)) {
          await tryCreateEdge(graph, id, `req:${rid}`, 'IMPLEMENTS', { source: 'biz-extensions.csv' }, ctr);
        }
        // INVOLVES edges: FT -> UC
        for (const uid of (r['ucsInvolved'] || '').split('|').map((x) => x.trim()).filter(Boolean)) {
          await tryCreateEdge(graph, id, `uc:${uid}`, 'INVOLVES', { source: 'biz-extensions.csv' }, ctr);
        }
      }
    }
    console.log(`[load-fillin] biz-extensions: ${reqs} REQs, ${ucs} UCs, ${fts} features`);
    // Add the newly-created SI2 features into the in-memory set so the
    // function-features mapping below can resolve them.
    const rescan = await graph.findNodes('sw.feature');
    for (const n of rescan as any[]) {
      featureIds.add(n.properties.ftId as string);
    }
  }

  // ── 6. function-features.csv -> IMPLEMENTS_INTENT_OF ──────────
  {
    const rows = readCsv(`${CSV_DIR}/function-features.csv`);
    console.log(`[load-fillin] function-features.csv: ${rows.length} rows`);
    let mapped = 0;
    let missingFeature = 0;
    for (const r of rows) {
      const fnId = r['fnId']!;
      const features = (r['features'] ?? '').split('|').map((s) => s.trim()).filter(Boolean);
      for (const ftId of features) {
        // Resolve feature node id (the existing graph stores them as `ft:FT-SI-NN`
        // for v0.1 features; for new FT-SI2-XX features the next loader pass will
        // create them — but for now, just try and let the createRelationship fail
        // cleanly if the target doesn't exist yet).
        const featureNodeId = `ft:${ftId}`;
        if (ftId.startsWith('FT-SI-') && !featureIds.has(ftId)) {
          missingFeature++;
          ctr.warn(`function-features: feature ${ftId} not in graph (fn=${fnId})`);
          continue;
        }
        try {
          await graph.createRelationship(fnId, featureNodeId, 'IMPLEMENTS_INTENT_OF', {
            source: 'function-features.csv',
            note: r['note'] ?? '',
          });
          ctr.edgesCreated++;
          mapped++;
        } catch (err) {
          if (isDuplicateError(err)) {
            ctr.edgesSkipped++;
            continue;
          }
          // FT-SI2-* features may not exist yet; tolerate.
          ctr.warn(`IMPLEMENTS_INTENT_OF ${fnId} -> ${featureNodeId} failed: ${(err as Error).message.slice(0, 100)}`);
        }
      }
    }
    console.log(`[load-fillin] IMPLEMENTS_INTENT_OF edges: ${mapped} mapped, ${missingFeature} missing-feature warnings`);
  }

  ctr.summary('load-fillin');

  // Verification: dump label distribution
  const labels = ['sw.file', 'sw.function', 'sw.alt_flow', 'sw.call_out'];
  for (const l of labels) {
    const all = await graph.findNodes(l);
    console.log(`  ${l}: ${all.length}`);
  }
  // Tier-3
  const tier3Labels = [
    'cs_2026.file', 'cs_2026.fn', 'cs_2026.try_catch',
    'cs_2026.early_return', 'cs_2026.sdk_call', 'cs_2026.fetch_call', 'cs_2026.fs_call',
  ];
  for (const l of tier3Labels) {
    const all = await graph.findNodes(l);
    if (all.length > 0) console.log(`  ${l}: ${all.length}`);
  }

  await graph.close();
  console.log('[load-fillin] DONE');
}

main().catch((err) => {
  console.error('[load-fillin] FAILED:', err);
  process.exit(1);
});
