/**
 * Solution Intelligence SIG ingestion.
 *
 * Builds a queryable knowledge graph from the seven bookend documents:
 * STORY.md, REQUIREMENTS.md, MODEL.md, docs/PIPELINE.md, docs/USE-CASES.md,
 * docs/FEATURES.md, docs/OVERVIEW.md.
 *
 * Strategy: parse each bookend file with regex anchors that match the
 * structured patterns already present in the docs (REQ-SI-NNN, FT-SI-NN,
 * UC-N, table rows for the three-tier schema, principle sections). Emit
 * typed PolyGraph nodes and edges with provenance back to source-file:line
 * ranges.
 *
 * Idempotency: nuke and rebuild. The SIG is a derived artifact. If the
 * source docs change, re-run ingestion.
 *
 * Run: `npm run ingest` from artifacts/solution-intelligence/sig/
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DATA_DIR = resolve(__dirname, '..', 'data');

interface SourceRead {
  path: string;
  content: string;
  lines: string[];
}

function loadDoc(relPath: string): SourceRead {
  const abs = resolve(REPO_ROOT, relPath);
  const content = readFileSync(abs, 'utf8');
  return { path: relPath, content, lines: content.split('\n') };
}

function lineNumOf(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

function firstSentence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : trimmed.split('\n')[0].substring(0, 200);
}

/** Find end of a block starting at `start`, ending when `endRe` matches or `boundary` is reached. */
function findBlockEnd(lines: string[], start: number, endRe: RegExp, boundary: number): number {
  for (let i = start; i < Math.min(lines.length, boundary); i++) {
    if (endRe.test(lines[i])) return i;
  }
  return boundary;
}

const counts: Record<string, number> = {};
function bump(k: string) {
  counts[k] = (counts[k] ?? 0) + 1;
}

async function main() {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(DATA_DIR, { recursive: true });

  const graph = new PolyGraph({
    adapter: new LevelAdapter({ path: DATA_DIR }),
  });
  await graph.open();

  console.log(`[ingest] opened PolyGraph at ${DATA_DIR}`);

  const docs = {
    story: loadDoc('STORY.md'),
    requirements: loadDoc('REQUIREMENTS.md'),
    model: loadDoc('MODEL.md'),
    pipeline: loadDoc('docs/PIPELINE.md'),
    useCases: loadDoc('docs/USE-CASES.md'),
    features: loadDoc('docs/FEATURES.md'),
    overview: loadDoc('docs/OVERVIEW.md'),
  };

  // === Project root ========================================================
  const projectId = 'project:solution-intelligence';
  await graph.createNode(
    ['Project'],
    {
      id: projectId,
      name: 'Solution Intelligence',
      summary: 'A project framework for ingesting heterogeneous artifacts, building a traceable substrate-independent model, and producing defensible deliverables.',
      license: 'Apache-2.0',
      bookendDate: '2026-05-19',
    },
    projectId,
  );
  bump('Project');

  // === SourceDoc nodes =====================================================
  for (const [_k, d] of Object.entries(docs)) {
    const id = `doc:${d.path}`;
    await graph.createNode(
      ['SourceDoc', 'Bookend'],
      { id, name: d.path, lineCount: d.lines.length },
      id,
    );
    await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
    bump('SourceDoc');
  }

  // === DoctrinePrinciple ===================================================
  // STORY.md §VI — each principle is a paragraph beginning **Bold name.**
  {
    const lines = docs.story.lines;
    const sectionStart = lineNumOf(lines, /^## VI — The doctrine as resolved negotiation/);
    const sectionEnd = lineNumOf(lines, /^## VII —/);
    if (sectionStart < 0 || sectionEnd < 0) {
      console.warn('[ingest] WARN: could not locate doctrine section in STORY.md');
    } else {
      let count = 0;
      for (let i = sectionStart; i < sectionEnd; i++) {
        // Match opening of a principle: "**<Title>.**" at line start
        const m = lines[i]?.match(/^\*\*([^*]+?)\.\*\*\s*(.*)$/);
        if (m) {
          count++;
          const title = m[1].trim();
          const id = `principle:${slugify(title)}`;
          // Body extends until the next ** or section end
          const bodyEnd = findBlockEnd(lines, i + 1, /^\*\*[^*]+?\.\*\*|^---|^## /, sectionEnd);
          const restOfFirstLine = m[2].trim();
          const restBody = lines.slice(i + 1, bodyEnd).join('\n').trim();
          const body = restOfFirstLine + (restBody ? ('\n' + restBody) : '');
          await graph.createNode(
            ['DoctrinePrinciple', 'Bookend'],
            {
              id,
              name: title,
              principleNumber: count,
              summary: firstSentence(body),
              bodyMarkdown: body,
              sourceFile: 'STORY.md',
              sourceLineStart: i + 1,
              sourceLineEnd: bodyEnd,
            },
            id,
          );
          await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
          await graph.createRelationship(projectId, id, 'HOLDS_PRINCIPLE', {
            via: `STORY.md:${i + 1}-${bodyEnd}`,
            confidence: 'explicit',
          });
          await graph.createRelationship(id, 'doc:STORY.md', 'TRACED_TO', {
            via: `STORY.md:${i + 1}-${bodyEnd}`,
            confidence: 'explicit',
          });
          bump('DoctrinePrinciple');
        }
      }
    }
  }

  // === Component nodes (SI/S, SI/G, SI/W, SI/I) ============================
  {
    const components = [
      { id: 'component:si-s', name: 'SI/S', longName: 'Studio', summary: 'The developer workbench, which is the Blackboard substrate plus a developer UI.' },
      { id: 'component:si-g', name: 'SI/G', longName: 'Graph', summary: 'The durable, queryable knowledge graph artifact — the SIG itself.' },
      { id: 'component:si-w', name: 'SI/W', longName: 'Window', summary: 'The consumer-facing UI; read-mostly, polished, role-scoped.' },
      { id: 'component:si-i', name: 'SI/I', longName: 'Identity', summary: 'The authentication and authorization layer; per-project; bangauth or OIDC.' },
    ];
    for (const c of components) {
      await graph.createNode(
        ['Component', 'Bookend'],
        { ...c, sourceFile: 'docs/OVERVIEW.md' },
        c.id,
      );
      await graph.createRelationship(c.id, projectId, 'BELONGS_TO', {});
      await graph.createRelationship(c.id, 'doc:docs/OVERVIEW.md', 'TRACED_TO', { confidence: 'explicit' });
      bump('Component');
    }
  }

  // === EpistemicClass nodes ================================================
  {
    const classes = [
      { id: 'epistemic:ground-truth', name: 'ground-truth', summary: 'Hard truth describing what the system actually does.' },
      { id: 'epistemic:aspirational-intent', name: 'aspirational-intent', summary: 'What was intended; may be wrong, outdated, or never fully implemented.' },
      { id: 'epistemic:constraint', name: 'constraint', summary: 'Binding obligations the system must demonstrably satisfy.' },
      { id: 'epistemic:evidence', name: 'evidence', summary: 'What actually happened in operation.' },
      { id: 'epistemic:tribal-knowledge', name: 'tribal-knowledge', summary: 'High-value, low-rigor, person-attributed claims.' },
      { id: 'epistemic:reference-pattern', name: 'reference-pattern', summary: 'External truth: standards, patterns, prior-art.' },
      { id: 'epistemic:analyst-output', name: 'analyst-output', summary: 'Produced by analysts running over the graph.' },
    ];
    for (const c of classes) {
      await graph.createNode(['EpistemicClass', 'Bookend'], { ...c, sourceFile: 'STORY.md' }, c.id);
      await graph.createRelationship(c.id, projectId, 'BELONGS_TO', {});
      bump('EpistemicClass');
    }
  }

  // === SolutionDomain + ParadigmNamespace ==================================
  {
    await graph.createNode(['SolutionDomain', 'Bookend'], {
      id: 'domain:ba',
      name: 'ba',
      longName: 'Business Automation',
      summary: 'Solutions whose substance is forms, processes, organizations, approvals, agreements, business rules, transactions, accounts, and policies.',
      status: 'v0.1-built',
      sourceFile: 'MODEL.md',
    }, 'domain:ba');
    await graph.createRelationship('domain:ba', projectId, 'BELONGS_TO', {});
    bump('SolutionDomain');

    for (const d of ['mfg', 'clin', 'infra', 'research']) {
      await graph.createNode(['SolutionDomain', 'Bookend'], {
        id: `domain:${d}`,
        name: d,
        status: 'anticipated-not-built',
        sourceFile: 'MODEL.md',
      }, `domain:${d}`);
      await graph.createRelationship(`domain:${d}`, projectId, 'BELONGS_TO', {});
      bump('SolutionDomain');
    }

    await graph.createNode(['ParadigmNamespace', 'Bookend'], {
      id: 'paradigm:cs_2026',
      name: 'cs_2026',
      longName: 'Current computing substrate (2026)',
      summary: 'Object-oriented or procedural code in text files, relational schemas, HTTP/gRPC endpoints, key-value configuration.',
      status: 'v0.1-built',
      sourceFile: 'MODEL.md',
    }, 'paradigm:cs_2026');
    await graph.createRelationship('paradigm:cs_2026', projectId, 'BELONGS_TO', {});
    bump('ParadigmNamespace');
  }

  // === SchemaLabel — parse three-tier tables from MODEL.md §2.1 ============
  {
    const lines = docs.model.lines;
    const t1Start = lineNumOf(lines, /^#### Tier 1 — Solution-universal/);
    const t2Start = lineNumOf(lines, /^#### Tier 2 — Solution-domain/);
    const t3Start = lineNumOf(lines, /^#### Tier 3 — Implementation-paradigm/);
    const sectionEnd = lineNumOf(lines, /^#### How the three tiers compose/);

    type Span = { from: number; to: number; tier: 1 | 2 | 3 };
    const spans: Span[] = [
      { from: t1Start, to: t2Start, tier: 1 },
      { from: t2Start, to: t3Start, tier: 2 },
      { from: t3Start, to: sectionEnd, tier: 3 },
    ];

    for (const span of spans) {
      if (span.from < 0 || span.to < 0) {
        console.warn(`[ingest] WARN: could not locate Tier ${span.tier} section in MODEL.md`);
        continue;
      }
      for (let i = span.from; i < span.to; i++) {
        // Table row: | `label` | description | props |
        const m = lines[i]?.match(/^\|\s*`([a-z][a-z0-9_.]*)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
        if (m && !lines[i].includes('Label') && !lines[i].includes('---')) {
          const qualified = m[1];
          const description = m[2].trim();
          const props = m[3].trim();
          const id = `label:${qualified}`;
          let domain: string | null = null;
          let paradigm: string | null = null;
          if (span.tier === 2 && qualified.includes('.')) {
            domain = qualified.split('.')[0];
          }
          if (span.tier === 3 && qualified.includes('.')) {
            paradigm = qualified.split('.')[0];
          }
          await graph.createNode(['SchemaLabel', 'Bookend'], {
            id,
            name: qualified,
            qualifiedName: qualified,
            tier: span.tier,
            domain,
            paradigm,
            description,
            requiredProps: props,
            sourceFile: 'MODEL.md',
            sourceLineStart: i + 1,
          }, id);
          await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
          await graph.createRelationship(id, 'doc:MODEL.md', 'TRACED_TO', { via: `MODEL.md:${i + 1}` });
          if (domain) {
            await graph.createRelationship(id, `domain:${domain}`, 'BELONGS_TO_DOMAIN', {});
          }
          if (paradigm) {
            await graph.createRelationship(id, `paradigm:${paradigm}`, 'BELONGS_TO_PARADIGM', {});
          }
          bump(`SchemaLabel-T${span.tier}`);
        }
      }
    }
  }

  // === EdgeType — parse MODEL.md §2.2 edge tables ==========================
  {
    const lines = docs.model.lines;
    const start = lineNumOf(lines, /^### 2\.2 — Edge types/);
    const end = lineNumOf(lines, /^### 2\.3 —/);
    if (start > 0 && end > 0) {
      for (let i = start; i < end; i++) {
        // Edge table row: | `EDGE_TYPE` | direction | description |
        const m = lines[i]?.match(/^\|\s*`([A-Z][A-Z0-9_]+(?:`\s*\/\s*`[A-Z0-9_]+)?)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
        if (m && !lines[i].includes('Type') && !lines[i].includes('---')) {
          // Some rows have "READS / WRITES" combined — split if so
          const raw = m[1];
          const types = raw.includes('/') ? raw.split(/\s*`\s*\/\s*`\s*/) : [raw];
          for (const t of types) {
            const id = `edge:${t}`;
            await graph.createNode(['EdgeType', 'Bookend'], {
              id,
              name: t,
              direction: m[2].trim(),
              description: m[3].trim(),
              sourceFile: 'MODEL.md',
              sourceLineStart: i + 1,
            }, id);
            await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
            await graph.createRelationship(id, 'doc:MODEL.md', 'TRACED_TO', { via: `MODEL.md:${i + 1}` });
            bump('EdgeType');
          }
        }
      }
    }
  }

  // === Requirement — parse REQ-SI-NNN patterns =============================
  {
    const lines = docs.requirements.lines;
    let currentCategory: 'functional' | 'non-functional' = 'functional';
    let currentCategoryGroup: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (/^## Retired Requirements/.test(lines[i])) break;
      if (/^## Cross-Reference Index/.test(lines[i])) break;
      const hSection = lines[i]?.match(/^## (Functional Requirements|Non-functional Requirements)/);
      if (hSection) {
        currentCategory = hSection[1].startsWith('Functional') ? 'functional' : 'non-functional';
        currentCategoryGroup = null;
      }
      const hGroup = lines[i]?.match(/^### (.+)$/);
      if (hGroup) currentCategoryGroup = hGroup[1].trim();
      const m = lines[i]?.match(/^\*\*(REQ-SI-(?:NF-)?\d+)\*\* — (.+)$/);
      if (m) {
        const id = m[1];
        const summary = m[2].trim();
        let bodyEnd = i + 1;
        while (bodyEnd < lines.length && lines[bodyEnd].trim() !== '' && !lines[bodyEnd].startsWith('**REQ-SI-') && !lines[bodyEnd].startsWith('### ') && !lines[bodyEnd].startsWith('## ')) {
          bodyEnd++;
        }
        const body = lines.slice(i, bodyEnd).join('\n');
        await graph.createNode(['Requirement', 'Bookend'], {
          id,
          name: id,
          summary,
          bodyMarkdown: body,
          category: currentCategory,
          categoryGroup: currentCategoryGroup,
          sourceFile: 'REQUIREMENTS.md',
          sourceLineStart: i + 1,
          sourceLineEnd: bodyEnd,
        }, id);
        await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
        await graph.createRelationship(id, 'doc:REQUIREMENTS.md', 'TRACED_TO', { via: `REQUIREMENTS.md:${i + 1}-${bodyEnd}` });
        bump(`Requirement-${currentCategory}`);
      }
    }
  }

  // === Feature — parse FT-SI-NN from docs/FEATURES.md =====================
  {
    const lines = docs.features.lines;
    // Detail sections: "### FT-SI-NN: Title"
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]?.match(/^### (FT-SI-\d+):\s*(.+)$/);
      if (m) {
        const id = m[1];
        const title = m[2].trim();
        let bodyEnd = findBlockEnd(lines, i + 1, /^### FT-SI-|^## /, lines.length);
        const body = lines.slice(i, bodyEnd).join('\n');
        await graph.createNode(['Feature', 'Bookend'], {
          id,
          name: id,
          title,
          summary: firstSentence(body),
          bodyMarkdown: body,
          sourceFile: 'docs/FEATURES.md',
          sourceLineStart: i + 1,
          sourceLineEnd: bodyEnd,
        }, id);
        await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
        await graph.createRelationship(id, 'doc:docs/FEATURES.md', 'TRACED_TO', { via: `docs/FEATURES.md:${i + 1}-${bodyEnd}` });
        bump('Feature');
      }
    }

    // (Matrix parsing for IMPLEMENTS / INVOLVES edges is deferred until after
    // UseCase nodes have been created — see end of main().)
  }

  // === UseCase — parse "## UC-N: ..." from docs/USE-CASES.md ===============
  {
    const lines = docs.useCases.lines;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]?.match(/^## (UC-\d+):\s*(.+)$/);
      if (m) {
        const id = m[1];
        const title = m[2].trim();
        let bodyEnd = findBlockEnd(lines, i + 1, /^## UC-|^## Coverage summary|^---\s*$/, lines.length);
        const body = lines.slice(i, bodyEnd).join('\n');
        // Parse the "Requirements exercised" block for EXERCISES edges
        const reqExercisedBlock = body.match(/### Requirements exercised\s*\n+([\s\S]*?)(?=\n##|\n---|\n###|$)/);
        const reqIds = reqExercisedBlock
          ? Array.from(reqExercisedBlock[1].matchAll(/REQ-SI-(?:NF-)?\d+/g)).map(x => x[0])
          : [];
        await graph.createNode(['UseCase', 'Bookend'], {
          id,
          name: id,
          title,
          summary: firstSentence(body.replace(/^## [^\n]+\n+/, '')),
          bodyMarkdown: body,
          sourceFile: 'docs/USE-CASES.md',
          sourceLineStart: i + 1,
          sourceLineEnd: bodyEnd,
        }, id);
        await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
        await graph.createRelationship(id, 'doc:docs/USE-CASES.md', 'TRACED_TO', { via: `docs/USE-CASES.md:${i + 1}-${bodyEnd}` });
        for (const rId of new Set(reqIds)) {
          try {
            await graph.createRelationship(id, rId, 'EXERCISES', {
              via: `docs/USE-CASES.md:${i + 1}-${bodyEnd}`,
              confidence: 'explicit',
            });
            bump('EXERCISES');
          } catch (e) {
            console.warn(`[ingest] WARN: ${id} references missing REQ "${rId}" at USE-CASES.md:${i + 1}`);
            bump('WARN-missing-req-ref');
          }
        }
        bump('UseCase');
      }
    }
  }

  // === Deliverable — parse the standard suite from STORY.md / OVERVIEW.md ==
  {
    const lines = docs.overview.lines;
    const start = lineNumOf(lines, /^## The standard deliverable suite/);
    const end = lineNumOf(lines, /^## Sibling projects/);
    if (start > 0 && end > 0) {
      for (let i = start; i < end; i++) {
        // | **Name** | what it answers | inputs | audience |
        const m = lines[i]?.match(/^\|\s*\*\*([^*]+?)\*\*\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
        if (m && !lines[i].includes('Artifact')) {
          const name = m[1].trim();
          const id = `deliverable:${slugify(name)}`;
          await graph.createNode(['Deliverable', 'Bookend'], {
            id,
            name,
            answers: m[2].trim(),
            inputClasses: m[3].trim(),
            audience: m[4].trim(),
            sourceFile: 'docs/OVERVIEW.md',
            sourceLineStart: i + 1,
          }, id);
          await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
          await graph.createRelationship(id, 'doc:docs/OVERVIEW.md', 'TRACED_TO', { via: `docs/OVERVIEW.md:${i + 1}` });
          bump('Deliverable');
        }
      }
    }
  }

  // === PipelineStep — parse seven steps from docs/PIPELINE.md ==============
  // PIPELINE.md uses circled-digit unicode (①-⑦) in headings: '### ① Input bucket (S3)'
  {
    const lines = docs.pipeline.lines;
    const circled: Record<string, number> = {
      '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7,
    };
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]?.match(/^### ([①-⑦]) (.+)$/);
      if (m) {
        const num = circled[m[1]];
        const title = m[2].trim();
        const id = `step:${num}-${slugify(title)}`;
        const bodyEnd = findBlockEnd(lines, i + 1, /^### Step \d+|^## /, lines.length);
        const body = lines.slice(i, bodyEnd).join('\n');
        await graph.createNode(['PipelineStep', 'Bookend'], {
          id,
          name: title,
          stepNumber: num,
          summary: firstSentence(body),
          bodyMarkdown: body,
          sourceFile: 'docs/PIPELINE.md',
          sourceLineStart: i + 1,
        }, id);
        await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
        await graph.createRelationship(id, 'doc:docs/PIPELINE.md', 'TRACED_TO', { via: `docs/PIPELINE.md:${i + 1}-${bodyEnd}` });
        bump('PipelineStep');
      }
    }
  }

  // === Role nodes ==========================================================
  {
    const roles = ['Owner', 'Operator', 'Analyst', 'Reviewer', 'Customer'];
    for (const r of roles) {
      const id = `role:${r.toLowerCase()}`;
      await graph.createNode(['Role', 'Bookend'], {
        id,
        name: r,
        sourceFile: 'MODEL.md',
      }, id);
      await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
      bump('Role');
    }
  }

  // === AuditBlockKind — parse MODEL.md §3.2 table ==========================
  {
    const lines = docs.model.lines;
    const start = lineNumOf(lines, /^### 3\.2 — The \d+ block kinds/);
    const end = lineNumOf(lines, /^### 3\.3 —/);
    if (start > 0 && end > 0) {
      for (let i = start; i < end; i++) {
        const m = lines[i]?.match(/^\|\s*`(si\.[a-z._]+)`\s*\|\s*(.+?)\s*\|$/);
        if (m) {
          const kind = m[1];
          const id = `block:${kind}`;
          await graph.createNode(['AuditBlockKind', 'Bookend'], {
            id,
            name: kind,
            payloadSchema: m[2].trim(),
            sourceFile: 'MODEL.md',
            sourceLineStart: i + 1,
          }, id);
          await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
          await graph.createRelationship(id, 'doc:MODEL.md', 'TRACED_TO', { via: `MODEL.md:${i + 1}` });
          bump('AuditBlockKind');
        }
      }
    }
  }

  // === NonGoal — parse OVERVIEW.md "## Non-goals" bullets ==================
  {
    const lines = docs.overview.lines;
    const start = lineNumOf(lines, /^## Non-goals/);
    const end = lineNumOf(lines, /^## Build path/);
    if (start > 0 && end > 0) {
      for (let i = start; i < end; i++) {
        const m = lines[i]?.match(/^- \*\*([^*]+?)\.\*\*\s*(.*)$/);
        if (m) {
          const title = m[1].trim();
          const id = `nongoal:${slugify(title)}`;
          await graph.createNode(['NonGoal', 'Bookend'], {
            id,
            name: title,
            rationale: m[2].trim(),
            sourceFile: 'docs/OVERVIEW.md',
            sourceLineStart: i + 1,
          }, id);
          await graph.createRelationship(id, projectId, 'BELONGS_TO', {});
          await graph.createRelationship(projectId, id, 'EXCLUDES', {
            via: `docs/OVERVIEW.md:${i + 1}`,
            confidence: 'explicit',
          });
          bump('NonGoal');
        }
      }
    }
  }

  // === FEATURE ↔ REQUIREMENT ↔ USECASE matrix ============================
  // Parsed AFTER UseCase nodes are created so endpoint resolution succeeds.
  {
    const lines = docs.features.lines;
    let inMatrix = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith('## Feature → Requirement → Use Case Matrix')) {
        inMatrix = true;
        continue;
      }
      if (inMatrix && lines[i]?.startsWith('## ')) {
        inMatrix = false;
      }
      if (!inMatrix) continue;
      const m = lines[i]?.match(/^\|\s*\*\*(FT-SI-\d+):[^*]+\*\*\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
      if (m) {
        const featureId = m[1];
        const reqText = m[2];
        const ucText = m[3];
        // Direct matches (REQ-SI-NNN or REQ-SI-NF-NNN)
        const reqIds = Array.from(reqText.matchAll(/REQ-SI-(?:NF-)?\d+/g)).map(x => x[0]);
        // Comma-separated functional shorthand: 'REQ-SI-NNN, NNN' (bare 3-digit number after a comma in a cell that mentions REQ-SI-)
        const hasFnPrefix = /REQ-SI-\d+/.test(reqText);
        if (hasFnPrefix) {
          const fnShorthand = Array.from(reqText.matchAll(/,\s*(\d{3})(?!\s*to)\b/g));
          for (const m of fnShorthand) {
            reqIds.push(`REQ-SI-${m[1]}`);
          }
        }
        // Functional ranges. Pattern 1: 'REQ-SI-NNN to (REQ-SI-)NNN' (full prefix).
        const fnRanges1 = Array.from(reqText.matchAll(/REQ-SI-(\d+)\s+to\s+(?:REQ-SI-)?(\d+)\b/g));
        // Pattern 2: 'REQ-SI-NNN, NNN to NNN' (shorthand following a full reference)
        // Captured as bare 'NNN to NNN' appearing after at least one REQ-SI-NNN earlier in the same cell.
        const hasFnContext = /REQ-SI-\d+/.test(reqText);
        const fnRanges2 = hasFnContext
          ? Array.from(reqText.matchAll(/(?<![\w-])(\d{3})\s+to\s+(\d{3})\b/g))
          : [];
        for (const rm of [...fnRanges1, ...fnRanges2]) {
          const a = parseInt(rm[1], 10);
          const b = parseInt(rm[2], 10);
          for (let n = a; n <= b; n++) {
            reqIds.push(`REQ-SI-${String(n).padStart(3, '0')}`);
          }
        }
        // Non-functional ranges. Accepts forms:
        //   'REQ-SI-NF-NNN to REQ-SI-NF-NNN'
        //   'REQ-SI-NF-NNN to NF-NNN'
        //   'NF-NNN to NF-NNN'
        const nfRanges = Array.from(reqText.matchAll(/(?:REQ-SI-)?NF-(\d+)\s+to\s+(?:REQ-SI-)?NF-(\d+)/g));
        for (const rm of nfRanges) {
          const a = parseInt(rm[1], 10);
          const b = parseInt(rm[2], 10);
          for (let n = a; n <= b; n++) {
            reqIds.push(`REQ-SI-NF-${String(n).padStart(3, '0')}`);
          }
        }
        // NF-NNN shorthand (without REQ-SI- prefix, in matrix cells where prefix is implied)
        const nfShorthand = Array.from(reqText.matchAll(/(?<!\w)NF-(\d+)(?!\d)/g));
        for (const rm of nfShorthand) {
          reqIds.push(`REQ-SI-NF-${String(parseInt(rm[1], 10)).padStart(3, '0')}`);
        }
        const ucIds = Array.from(ucText.matchAll(/UC-\d+/g)).map(x => x[0]);
        for (const rId of new Set(reqIds)) {
          try {
            await graph.createRelationship(featureId, rId, 'IMPLEMENTS', {
              via: `docs/FEATURES.md:${i + 1}`,
              confidence: 'explicit',
            });
            bump('IMPLEMENTS');
          } catch (e) {
            console.warn(`[ingest] WARN: matrix references missing node "${rId}" or "${featureId}" at FEATURES.md:${i + 1}`);
          }
        }
        for (const uId of new Set(ucIds)) {
          try {
            await graph.createRelationship(uId, featureId, 'INVOLVES', {
              via: `docs/FEATURES.md:${i + 1}`,
              confidence: 'explicit',
            });
            bump('INVOLVES');
          } catch (e) {
            console.warn(`[ingest] WARN: matrix references missing node "${uId}" or "${featureId}" at FEATURES.md:${i + 1}`);
          }
        }
      }
    }
  }

  // === Summary =============================================================
  const totalNodes = Object.entries(counts)
    .filter(([k]) => !['IMPLEMENTS', 'EXERCISES', 'INVOLVES'].includes(k))
    .reduce((s, [, v]) => s + v, 0);
  console.log('[ingest] node counts by label:');
  for (const [k, v] of Object.entries(counts).sort()) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log(`[ingest] total nodes: ${totalNodes}`);
  console.log('[ingest] DONE.');

  await graph.close();
}

main().catch((err) => {
  console.error('[ingest] FAILED:', err);
  process.exit(1);
});
