/**
 * Loader: docs/FEATURES.md -> sw.feature Tier-2 nodes + IMPLEMENTS / INVOLVES edges.
 *
 * Reads /sources/docs/FEATURES.md, parses the matrix at the top of the
 * doc and the per-feature detail section, and writes them as Tier-2
 * `sw.feature` nodes. Creates:
 *   - IMPLEMENTS edges from each feature -> the REQs (intended_behavior) it satisfies
 *   - INVOLVES  edges from each feature -> the use cases (sw.use_case) it exercises
 *
 * Why sw.feature: per MODEL.md §2.1 Tier 2, `sw.feature` is "a named bundle
 * of capability the software is promising to deliver." That matches the
 * FT-SI-NN definition exactly.
 *
 * REQ ID parsing reuses the same shorthand the bookend SIG and use-cases
 * loader handle:
 *   - REQ-SI-NNN, REQ-SI-NF-NNN (direct)
 *   - REQ-SI-NNN to NNN (functional range)
 *   - REQ-SI-NF-NNN to NF-NNN (non-functional range)
 *   - NF-NNN shorthand
 *   - REQ-SI-NNN, NNN, NNN (comma-separated bare numbers; inherits mode)
 *
 * Idempotency: nodes use FT id as their stable id; edges have deterministic
 * source/target/type triples so the createRelationship `already exists`
 * catch handles re-runs.
 *
 * Run: docker compose stop si-sig-viz
 *      docker compose run --rm si-sig-load npx tsx /app/loaders/features.ts
 *      docker compose start si-sig-viz
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { readFileSync } from 'node:fs';

const SOURCE = '/sources/docs/FEATURES.md';
const DATA_DIR = '/data';

interface FeatureRecord {
  id: string;
  ftNumber: number;
  title: string;
  summary: string;
  bodyMarkdown: string;
  reqsSatisfied: string[];
  ucsInvolved: string[];
  sourceLineStart: number;
  sourceLineEnd: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Parse a "REQ-SI-001 to 007, 080, 082" cell value into canonical REQ ids.
 */
function parseReqIds(cell: string): string[] {
  const out = new Set<string>();
  type Mode = 'functional' | 'nf';
  let mode: Mode = 'functional';
  const tokens = cell.split(',').map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const reqNfRange = tok.match(/REQ-SI-NF-(\d{3})\s+to\s+(?:NF-)?(\d{3})/i);
    if (reqNfRange) {
      mode = 'nf';
      const a = parseInt(reqNfRange[1]!, 10);
      const b = parseInt(reqNfRange[2]!, 10);
      for (let n = a; n <= b; n++) out.add(`REQ-SI-NF-${pad3(n)}`);
      continue;
    }
    const reqRange = tok.match(/REQ-SI-(\d{3})\s+to\s+(\d{3})/i);
    if (reqRange) {
      mode = 'functional';
      const a = parseInt(reqRange[1]!, 10);
      const b = parseInt(reqRange[2]!, 10);
      for (let n = a; n <= b; n++) out.add(`REQ-SI-${pad3(n)}`);
      continue;
    }
    const reqNf = tok.match(/REQ-SI-NF-(\d{3})/i);
    if (reqNf) {
      mode = 'nf';
      out.add(`REQ-SI-NF-${pad3(parseInt(reqNf[1]!, 10))}`);
      continue;
    }
    const req = tok.match(/REQ-SI-(\d{3})/i);
    if (req) {
      mode = 'functional';
      out.add(`REQ-SI-${pad3(parseInt(req[1]!, 10))}`);
      continue;
    }
    const nfRange = tok.match(/NF-(\d{3})\s+to\s+(?:NF-)?(\d{3})/i);
    if (nfRange) {
      mode = 'nf';
      const a = parseInt(nfRange[1]!, 10);
      const b = parseInt(nfRange[2]!, 10);
      for (let n = a; n <= b; n++) out.add(`REQ-SI-NF-${pad3(n)}`);
      continue;
    }
    const nf = tok.match(/NF-(\d{3})/i);
    if (nf) {
      mode = 'nf';
      out.add(`REQ-SI-NF-${pad3(parseInt(nf[1]!, 10))}`);
      continue;
    }
    const numRange = tok.match(/(\d{3})\s+to\s+(\d{3})/);
    if (numRange) {
      const a = parseInt(numRange[1]!, 10);
      const b = parseInt(numRange[2]!, 10);
      for (let n = a; n <= b; n++) {
        out.add(mode === 'nf' ? `REQ-SI-NF-${pad3(n)}` : `REQ-SI-${pad3(n)}`);
      }
      continue;
    }
    const num = tok.match(/^(\d{3})$/);
    if (num) {
      const n = parseInt(num[1]!, 10);
      out.add(mode === 'nf' ? `REQ-SI-NF-${pad3(n)}` : `REQ-SI-${pad3(n)}`);
      continue;
    }
  }
  return [...out];
}

function parseUcIds(cell: string): string[] {
  const out = new Set<string>();
  const re = /UC-(\d{1,3})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) {
    out.add(`UC-${parseInt(m[1]!, 10)}`);
  }
  return [...out];
}

function parseMatrix(content: string): Map<string, Partial<FeatureRecord>> {
  const lines = content.split('\n');
  const matrix = new Map<string, Partial<FeatureRecord>>();
  let inMatrix = false;
  for (const line of lines) {
    if (line.startsWith('## Feature → Requirement → Use Case Matrix')) {
      inMatrix = true;
      continue;
    }
    if (inMatrix && line.startsWith('## ')) {
      inMatrix = false;
      continue;
    }
    if (!inMatrix) continue;
    const m = line.match(/^\|\s*\*\*FT-SI-(\d{2}):\s*([^*]+?)\*\*\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    if (!m) continue;
    const ftNumber = parseInt(m[1]!, 10);
    const id = `FT-SI-${pad2(ftNumber)}`;
    matrix.set(id, {
      id,
      ftNumber,
      title: m[2]!.trim(),
      reqsSatisfied: parseReqIds(m[3]!),
      ucsInvolved: parseUcIds(m[4]!),
    });
  }
  return matrix;
}

function parseDetail(content: string, partial: Map<string, Partial<FeatureRecord>>): FeatureRecord[] {
  const lines = content.split('\n');
  const records: FeatureRecord[] = [];
  let current: FeatureRecord | null = null;
  let bodyStart = 0;
  let inDetailSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('## Feature Detail')) {
      inDetailSection = true;
      continue;
    }
    if (
      inDetailSection &&
      (line.startsWith('## Out-of-Scope') ||
        line.startsWith('## Feature Sizing') ||
        line.startsWith('## Provenance'))
    ) {
      if (current) {
        current.sourceLineEnd = i;
        current.bodyMarkdown = lines.slice(bodyStart, i).join('\n').trim();
        records.push(current);
        current = null;
      }
      inDetailSection = false;
      continue;
    }
    if (!inDetailSection) continue;

    const header = line.match(/^### FT-SI-(\d{2}):\s*(.+)$/);
    if (header) {
      if (current) {
        current.sourceLineEnd = i;
        current.bodyMarkdown = lines.slice(bodyStart, i).join('\n').trim();
        records.push(current);
      }
      const ftNumber = parseInt(header[1]!, 10);
      const id = `FT-SI-${pad2(ftNumber)}`;
      const p = partial.get(id);
      current = {
        id,
        ftNumber,
        title: p?.title ?? header[2]!.trim(),
        summary: '',
        bodyMarkdown: '',
        reqsSatisfied: p?.reqsSatisfied ?? [],
        ucsInvolved: p?.ucsInvolved ?? [],
        sourceLineStart: i + 1,
        sourceLineEnd: 0,
      };
      bodyStart = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j]!.trim();
        if (lj.length > 0 && !lj.startsWith('### ') && !lj.startsWith('## ')) {
          current.summary = lj.replace(/^\*\*|\*\*$/g, '').slice(0, 200);
          break;
        }
        if (lj.startsWith('### ') || lj.startsWith('## ')) break;
      }
    }
  }
  if (current) {
    current.sourceLineEnd = lines.length;
    current.bodyMarkdown = lines.slice(bodyStart, lines.length).join('\n').trim();
    records.push(current);
  }

  return records.sort((a, b) => a.ftNumber - b.ftNumber);
}

async function main(): Promise<void> {
  console.log(`[loader/features] reading ${SOURCE}`);
  const content = readFileSync(SOURCE, 'utf-8');
  const partial = parseMatrix(content);
  const features = parseDetail(content, partial);
  console.log(`[loader/features] parsed ${features.length} features`);

  if (features.length === 0) {
    console.error('[loader/features] FAIL: parsed zero features');
    process.exit(1);
  }

  console.log(`[loader/features] opening PolyGraph at ${DATA_DIR}`);
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  // Precondition: REQs + UCs must already be loaded.
  const existingReqs = await graph.findNodes('intended_behavior');
  const existingReqIds = new Set(existingReqs.map((n: any) => n.properties.reqId as string));
  const existingUcs = await graph.findNodes('sw.use_case');
  const existingUcIds = new Set(existingUcs.map((n: any) => n.properties.ucId as string));
  console.log(
    `[loader/features] precondition: ${existingReqs.length} REQ nodes, ${existingUcs.length} UC nodes`,
  );

  if (existingReqs.length === 0 || existingUcs.length === 0) {
    console.error(
      '[loader/features] FAIL: REQs or UCs missing. Run requirements + use-cases loaders first.',
    );
    process.exit(1);
  }

  let nodesInserted = 0;
  let nodesSkipped = 0;
  let implementsCreated = 0;
  let involvesCreated = 0;
  let edgesSkippedMissingReq = 0;
  let edgesSkippedMissingUc = 0;
  const missingReqs = new Set<string>();
  const missingUcs = new Set<string>();

  for (const f of features) {
    const ftId = `ft:${f.id}`;
    try {
      await graph.createNode(
        ['sw.feature', 'BuildSIG'],
        {
          id: ftId,
          ftId: f.id,
          ftNumber: f.ftNumber,
          name: f.id,
          title: f.title,
          summary: f.summary,
          bodyMarkdown: f.bodyMarkdown,
          tier: 2,
          domain: 'sw',
          sourceFile: 'docs/FEATURES.md',
          sourceLineStart: f.sourceLineStart,
          sourceLineEnd: f.sourceLineEnd,
        },
        ftId,
      );
      nodesInserted++;
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.message?.includes('duplicate')
      ) {
        nodesSkipped++;
      } else {
        throw err;
      }
    }

    // IMPLEMENTS edges to REQs.
    for (const reqId of f.reqsSatisfied) {
      if (!existingReqIds.has(reqId)) {
        missingReqs.add(reqId);
        edgesSkippedMissingReq++;
        continue;
      }
      const reqNodeId = `req:${reqId}`;
      try {
        await graph.createRelationship(ftId, reqNodeId, 'IMPLEMENTS', {
          via: `docs/FEATURES.md:${f.sourceLineStart}-${f.sourceLineEnd}`,
          confidence: 'explicit',
        });
        implementsCreated++;
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

    // INVOLVES edges to UCs.
    for (const ucId of f.ucsInvolved) {
      if (!existingUcIds.has(ucId)) {
        missingUcs.add(ucId);
        edgesSkippedMissingUc++;
        continue;
      }
      const ucNodeId = `uc:${ucId}`;
      try {
        await graph.createRelationship(ftId, ucNodeId, 'INVOLVES', {
          via: `docs/FEATURES.md:${f.sourceLineStart}-${f.sourceLineEnd}`,
          confidence: 'explicit',
        });
        involvesCreated++;
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
    `[loader/features] nodes: ${nodesInserted} inserted, ${nodesSkipped} skipped`,
  );
  console.log(
    `[loader/features] edges: ${implementsCreated} IMPLEMENTS, ${involvesCreated} INVOLVES`,
  );
  if (missingReqs.size > 0) {
    console.warn(
      `[loader/features] WARN: ${edgesSkippedMissingReq} IMPLEMENTS edges skipped (missing REQ targets)`,
    );
    console.warn(`[loader/features] missing REQs: ${[...missingReqs].sort().join(', ')}`);
  }
  if (missingUcs.size > 0) {
    console.warn(
      `[loader/features] WARN: ${edgesSkippedMissingUc} INVOLVES edges skipped (missing UC targets)`,
    );
    console.warn(`[loader/features] missing UCs: ${[...missingUcs].sort().join(', ')}`);
  }

  const allFts = await graph.findNodes('sw.feature');
  console.log(`[loader/features] verify: ${allFts.length} sw.feature nodes in graph`);

  await graph.close();
  console.log('[loader/features] DONE');
}

main().catch((err) => {
  console.error('[loader/features] FAILED:', err);
  process.exit(1);
});
