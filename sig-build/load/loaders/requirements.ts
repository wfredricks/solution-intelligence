/**
 * Loader: REQUIREMENTS.md -> intended_behavior nodes in the build SIG.
 *
 * Reads /sources/REQUIREMENTS.md, parses every REQ-SI-NNN and REQ-SI-NF-NNN,
 * and writes them as Tier-1 `intended_behavior` nodes into the PolyGraph
 * instance at /data.
 *
 * Why intended_behavior: per MODEL.md §2.1 Tier 1, an intended_behavior is
 * "a described intent extracted from a design doc." Each REQ is a described
 * intent for what the SI implementation must do. The build SIG models SI
 * itself as the solution; the REQs are its intended behaviors.
 *
 * Idempotency: nodes use REQ id as their stable id. Re-running upserts.
 *
 * Provenance: every node carries sourceFile, sourceLineStart, sourceLineEnd,
 * category (functional|non-functional), categoryGroup, summary, bodyMarkdown.
 *
 * Run: `docker compose stop si-sig-viz`
 *      `docker compose run --rm si-sig-load npx tsx /app/loaders/requirements.ts`
 *      `docker compose start si-sig-viz`
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { readFileSync } from 'node:fs';

const SOURCE = '/sources/REQUIREMENTS.md';
const DATA_DIR = '/data';

interface ReqRecord {
  id: string;
  category: 'functional' | 'non-functional';
  categoryGroup: string | null;
  summary: string;
  bodyMarkdown: string;
  sourceLineStart: number;
  sourceLineEnd: number;
}

function parseRequirements(content: string): ReqRecord[] {
  const lines = content.split('\n');
  const reqs: ReqRecord[] = [];

  let currentCategory: 'functional' | 'non-functional' = 'functional';
  let currentCategoryGroup: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop at "Cross-Reference Index" or "Retired Requirements" - those list IDs
    // in tables, not canonical definitions.
    if (/^## Cross-Reference Index/.test(line)) break;
    if (/^## Retired Requirements/.test(line)) break;

    // Track category headings (## Functional Requirements / ## Non-functional Requirements)
    const hSection = line.match(/^## (Functional Requirements|Non-functional Requirements)/);
    if (hSection) {
      currentCategory = hSection[1].startsWith('Functional') ? 'functional' : 'non-functional';
      currentCategoryGroup = null;
      continue;
    }

    // Track category-group headings (### <Group Name>)
    const hGroup = line.match(/^### (.+)$/);
    if (hGroup) {
      currentCategoryGroup = hGroup[1].trim();
      continue;
    }

    // Match canonical REQ definitions: **REQ-SI-NNN** — summary text
    // Also catches REQ-SI-NF-NNN
    const m = line.match(/^\*\*(REQ-SI-(?:NF-)?\d+)\*\* — (.+)$/);
    if (m) {
      const id = m[1];
      const summary = m[2].trim();

      // Body extends from this line until the next REQ, blank-then-non-REQ, or section heading.
      let bodyEnd = i + 1;
      while (bodyEnd < lines.length) {
        const next = lines[bodyEnd];
        if (next.match(/^\*\*REQ-SI-/)) break;
        if (next.match(/^## /)) break;
        if (next.match(/^### /)) break;
        bodyEnd++;
      }

      const body = lines.slice(i, bodyEnd).join('\n').trim();

      reqs.push({
        id,
        category: currentCategory,
        categoryGroup: currentCategoryGroup,
        summary,
        bodyMarkdown: body,
        sourceLineStart: i + 1,
        sourceLineEnd: bodyEnd,
      });
    }
  }

  return reqs;
}

async function main() {
  console.log(`[loader/requirements] reading ${SOURCE}`);
  const content = readFileSync(SOURCE, 'utf8');
  const reqs = parseRequirements(content);
  console.log(`[loader/requirements] parsed ${reqs.length} requirements`);

  if (reqs.length === 0) {
    console.error('[loader/requirements] FAIL: parsed zero requirements');
    process.exit(1);
  }

  const breakdown = reqs.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[loader/requirements] breakdown:`, breakdown);

  console.log(`[loader/requirements] opening PolyGraph at ${DATA_DIR}`);
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  let inserted = 0;
  let skipped = 0;
  for (const r of reqs) {
    const id = `req:${r.id}`;
    try {
      // PolyGraph createNode: (labels[], props, id)
      // Tier-1 label is bare lowercase per MODEL.md §2.1.
      // Multi-label adds 'BuildSIG' so we can find all nodes that belong to this graph.
      await graph.createNode(
        ['intended_behavior', 'BuildSIG'],
        {
          id,
          reqId: r.id,
          name: r.id,
          summary: r.summary,
          bodyMarkdown: r.bodyMarkdown,
          category: r.category,
          categoryGroup: r.categoryGroup,
          tier: 1,
          sourceFile: 'REQUIREMENTS.md',
          sourceLineStart: r.sourceLineStart,
          sourceLineEnd: r.sourceLineEnd,
        },
        id,
      );
      inserted++;
    } catch (err: any) {
      // Idempotency: if the node already exists, that's fine for re-runs.
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  console.log(`[loader/requirements] inserted ${inserted}, skipped ${skipped}`);

  // Verify by counting back
  const allReqs = await graph.findNodes('intended_behavior');
  console.log(`[loader/requirements] verify: ${allReqs.length} intended_behavior nodes in graph`);

  await graph.close();

  if (inserted + skipped !== reqs.length) {
    console.error(
      `[loader/requirements] FAIL: parsed ${reqs.length} but only ${inserted + skipped} were written`,
    );
    process.exit(1);
  }

  console.log('[loader/requirements] DONE');
}

main().catch((err) => {
  console.error('[loader/requirements] FAILED:', err);
  process.exit(1);
});
