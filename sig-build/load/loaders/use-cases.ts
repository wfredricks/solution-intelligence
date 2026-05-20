/**
 * Loader: docs/USE-CASES.md -> sw.use_case Tier-2 nodes + EXERCISES edges.
 *
 * Reads /sources/docs/USE-CASES.md, parses every UC-N, writes them as
 * Tier-2 `sw.use_case` nodes, and creates EXERCISES edges from each
 * UC to the intended_behavior (REQ) nodes it lists under
 * "### Requirements exercised".
 *
 * Why sw.use_case: per MODEL.md §2.1 Tier 2, the `sw.*` namespace is the
 * software-as-solution domain. A use case is a stable concept across software
 * paradigms; it belongs in Tier 2.
 *
 * REQ ID parsing handles the same shorthand the bookend SIG handles:
 *   - REQ-SI-NNN, REQ-SI-NF-NNN (direct)
 *   - REQ-SI-NNN to NNN (functional range)
 *   - REQ-SI-NF-NNN to NF-NNN (non-functional range)
 *   - NF-NNN shorthand inside a cell that mentions REQ-SI- elsewhere
 *   - REQ-SI-NNN, NNN, NNN (comma-separated bare numbers)
 *
 * Edges that reference a missing REQ are logged as warnings (the loader
 * surfaces drift rather than silently dropping; per HEARTBEAT.md doctrine).
 *
 * Idempotency: nodes use UC id as their stable id. Re-running upserts.
 * Edges are created with deterministic ids so re-runs do not duplicate.
 *
 * Run: docker compose stop si-sig-viz
 *      docker compose run --rm si-sig-load npx tsx /app/loaders/use-cases.ts
 *      docker compose start si-sig-viz
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { readFileSync } from 'node:fs';

const SOURCE = '/sources/docs/USE-CASES.md';
const DATA_DIR = '/data';

interface UseCaseRecord {
  id: string;
  ucNumber: number;
  title: string;
  layer: 'lifecycle' | 'deliverable' | 'governance' | 'alternative-flow';
  summary: string;
  bodyMarkdown: string;
  actorSituation: string | null;
  need: string | null;
  withoutSi: string | null;
  withSi: string | null;
  reqsExercised: string[];
  sourceLineStart: number;
  sourceLineEnd: number;
}

function layerFor(ucNumber: number): UseCaseRecord['layer'] {
  if (ucNumber >= 1 && ucNumber <= 3) return 'lifecycle';
  if (ucNumber >= 4 && ucNumber <= 10) return 'deliverable';
  if (ucNumber >= 11 && ucNumber <= 12) return 'governance';
  if (ucNumber >= 13 && ucNumber <= 18) return 'alternative-flow';
  // Future UCs default to alternative-flow until reclassified
  return 'alternative-flow';
}

/**
 * Parse a REQ-exercised cell (e.g. "REQ-SI-001, REQ-SI-002, REQ-SI-NF-001, REQ-SI-070 to 077, NF-040 to NF-044")
 * into an array of canonical REQ ids.
 *
 * Why all four forms: the bookend was authored over multiple sessions with
 * different shorthand. The SIG ingest already handles these; we use the
 * same patterns to stay consistent.
 */
function parseReqIds(text: string): string[] {
  const ids = new Set<string>();

  // Direct matches: REQ-SI-NNN and REQ-SI-NF-NNN
  for (const m of text.matchAll(/REQ-SI-(?:NF-)?\d+/g)) {
    ids.add(m[0]);
  }

  const hasFnPrefix = /REQ-SI-\d+/.test(text);

  // Comma-separated functional shorthand: ", NNN" after a REQ-SI- earlier in the cell
  if (hasFnPrefix) {
    for (const m of text.matchAll(/,\s*(\d{3})(?!\s*to)\b/g)) {
      ids.add(`REQ-SI-${m[1]}`);
    }
  }

  // Functional ranges: "REQ-SI-NNN to NNN" or "REQ-SI-NNN to REQ-SI-NNN"
  for (const m of text.matchAll(/REQ-SI-(\d+)\s+to\s+(?:REQ-SI-)?(\d+)\b/g)) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    for (let n = a; n <= b; n++) {
      ids.add(`REQ-SI-${String(n).padStart(3, '0')}`);
    }
  }

  // Functional range continuation: bare "NNN to NNN" after a REQ-SI- prefix earlier in the cell
  if (hasFnPrefix) {
    for (const m of text.matchAll(/(?<![\w-])(\d{3})\s+to\s+(\d{3})\b/g)) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      for (let n = a; n <= b; n++) {
        ids.add(`REQ-SI-${String(n).padStart(3, '0')}`);
      }
    }
  }

  // NF ranges: accepts "NF-NNN to NF-NNN", "REQ-SI-NF-NNN to NF-NNN", or full both-sides
  for (const m of text.matchAll(/(?:REQ-SI-)?NF-(\d+)\s+to\s+(?:REQ-SI-)?NF-(\d+)/g)) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    for (let n = a; n <= b; n++) {
      ids.add(`REQ-SI-NF-${String(n).padStart(3, '0')}`);
    }
  }

  // NF shorthand: bare "NF-NNN" inside a cell that's already in REQ context
  if (hasFnPrefix || /REQ-SI-NF-\d+/.test(text)) {
    for (const m of text.matchAll(/(?<!\w)NF-(\d+)(?!\d)/g)) {
      ids.add(`REQ-SI-NF-${String(parseInt(m[1], 10)).padStart(3, '0')}`);
    }
  }

  return Array.from(ids).sort();
}

function parseUseCases(content: string): UseCaseRecord[] {
  const lines = content.split('\n');
  const ucs: UseCaseRecord[] = [];

  // Find each "## UC-N: <title>" header and its body extent
  const headerRe = /^## UC-(\d+):\s*(.+)$/;
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(headerRe);
    if (!m) {
      i++;
      continue;
    }

    const ucNumber = parseInt(m[1], 10);
    const title = m[2].trim();
    const sourceLineStart = i + 1;
    const startIdx = i;

    // Find the next ## or end of file
    let endIdx = i + 1;
    while (endIdx < lines.length) {
      if (lines[endIdx].match(/^## (?:UC-|Coverage summary)/)) break;
      endIdx++;
    }
    const sourceLineEnd = endIdx;

    const body = lines.slice(startIdx, endIdx).join('\n');

    // Parse subsections by ### anchor
    const sections: Record<string, string> = {};
    let currentSection: string | null = null;
    let sectionLines: string[] = [];
    for (let j = startIdx + 1; j < endIdx; j++) {
      const sh = lines[j].match(/^### (.+)$/);
      if (sh) {
        if (currentSection !== null) {
          sections[currentSection] = sectionLines.join('\n').trim();
        }
        currentSection = sh[1].trim();
        sectionLines = [];
      } else if (currentSection !== null) {
        sectionLines.push(lines[j]);
      }
    }
    if (currentSection !== null) {
      sections[currentSection] = sectionLines.join('\n').trim();
    }

    const reqsExercisedText = sections['Requirements exercised'] ?? '';
    const reqsExercised = parseReqIds(reqsExercisedText);

    const actorSituation = sections['Actor & situation'] ?? null;
    const need = sections['Need'] ?? null;
    const withoutSi = sections['Without SI'] ?? null;
    const withSi = sections['With SI'] ?? null;

    // Summary: first 200 chars of actor/situation if available, else first line of body
    const summarySource = actorSituation ?? body;
    const summary = summarySource.replace(/\s+/g, ' ').substring(0, 250).trim();

    ucs.push({
      id: `UC-${ucNumber}`,
      ucNumber,
      title,
      layer: layerFor(ucNumber),
      summary,
      bodyMarkdown: body,
      actorSituation,
      need,
      withoutSi,
      withSi,
      reqsExercised,
      sourceLineStart,
      sourceLineEnd,
    });

    i = endIdx;
  }

  return ucs;
}

async function main() {
  console.log(`[loader/use-cases] reading ${SOURCE}`);
  const content = readFileSync(SOURCE, 'utf8');
  const ucs = parseUseCases(content);
  console.log(`[loader/use-cases] parsed ${ucs.length} use cases`);

  if (ucs.length === 0) {
    console.error('[loader/use-cases] FAIL: parsed zero use cases');
    process.exit(1);
  }

  const byLayer = ucs.reduce<Record<string, number>>((acc, u) => {
    acc[u.layer] = (acc[u.layer] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[loader/use-cases] breakdown:`, byLayer);

  const totalReqs = ucs.reduce((s, u) => s + u.reqsExercised.length, 0);
  console.log(`[loader/use-cases] total REQ references across all UCs: ${totalReqs}`);

  console.log(`[loader/use-cases] opening PolyGraph at ${DATA_DIR}`);
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  // Verify the REQs are already in the graph (precondition)
  const existingReqs = await graph.findNodes('intended_behavior');
  const existingReqIds = new Set(existingReqs.map((n: any) => n.properties.reqId as string));
  console.log(`[loader/use-cases] precondition: ${existingReqs.length} intended_behavior nodes in graph`);

  if (existingReqs.length === 0) {
    console.error('[loader/use-cases] FAIL: no intended_behavior nodes found. Run the requirements loader first.');
    process.exit(1);
  }

  let nodesInserted = 0;
  let nodesSkipped = 0;
  let edgesCreated = 0;
  let edgesSkippedMissingTarget = 0;
  const missingReqs = new Set<string>();

  for (const u of ucs) {
    const id = `uc:${u.id}`;

    // Insert the use case node
    try {
      await graph.createNode(
        ['sw.use_case', 'BuildSIG'],
        {
          id,
          ucId: u.id,
          ucNumber: u.ucNumber,
          name: u.id,
          title: u.title,
          layer: u.layer,
          summary: u.summary,
          bodyMarkdown: u.bodyMarkdown,
          actorSituation: u.actorSituation,
          need: u.need,
          withoutSi: u.withoutSi,
          withSi: u.withSi,
          tier: 2,
          domain: 'sw',
          sourceFile: 'docs/USE-CASES.md',
          sourceLineStart: u.sourceLineStart,
          sourceLineEnd: u.sourceLineEnd,
        },
        id,
      );
      nodesInserted++;
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        nodesSkipped++;
      } else {
        throw err;
      }
    }

    // Create EXERCISES edges to each REQ
    for (const reqId of u.reqsExercised) {
      const reqNodeId = `req:${reqId}`;
      if (!existingReqIds.has(reqId)) {
        missingReqs.add(reqId);
        edgesSkippedMissingTarget++;
        continue;
      }
      try {
        await graph.createRelationship(id, reqNodeId, 'EXERCISES', {
          via: `docs/USE-CASES.md:${u.sourceLineStart}-${u.sourceLineEnd}`,
          confidence: 'explicit',
        });
        edgesCreated++;
      } catch (err: any) {
        // Idempotency: edge may already exist on a re-run; ignore.
        if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
          continue;
        }
        throw err;
      }
    }
  }

  console.log(`[loader/use-cases] nodes: ${nodesInserted} inserted, ${nodesSkipped} skipped`);
  console.log(`[loader/use-cases] edges: ${edgesCreated} EXERCISES created`);

  if (missingReqs.size > 0) {
    console.warn(`[loader/use-cases] WARN: ${edgesSkippedMissingTarget} edges skipped because their REQ target is not in the graph.`);
    console.warn(`[loader/use-cases] missing REQ ids: ${Array.from(missingReqs).sort().join(', ')}`);
  }

  // Verify by counting back
  const allUcs = await graph.findNodes('sw.use_case');
  console.log(`[loader/use-cases] verify: ${allUcs.length} sw.use_case nodes in graph`);

  await graph.close();

  console.log('[loader/use-cases] DONE');
}

main().catch((err) => {
  console.error('[loader/use-cases] FAILED:', err);
  process.exit(1);
});
