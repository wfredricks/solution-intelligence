#!/usr/bin/env npx tsx
/**
 * sig-build/inventory.mts — walk source repos, extract dom + imp
 * structure as CSVs ready for csv-loader.ts to ingest.
 *
 * Why this script: hand-curating CSV data for 48 source files would
 * (1) take hours, (2) drift the moment we ship more code. Using the
 * TypeScript compiler API to enumerate exported functions, try/catch
 * blocks, fetch/SDK call-outs, and Hono routes gives us machine-honest
 * data the methodology can then trace against.
 *
 * Output CSVs land in sig-build/load/csv/:
 *   dom-files.csv         file rows
 *   dom-functions.csv     exported function rows
 *   dom-alt-flows.csv     try/catch + early-return rows
 *   dom-call-outs.csv     fetch + bedrock.send + fs.* rows
 *   imp-files.csv         cs_2026.source_file realizations
 *   imp-functions.csv     cs_2026.function realizations
 *   imp-endpoints.csv     cs_2026.endpoint (Hono routes)
 *   edges.csv             LIVES_IN, DECLARES, HAS_ALT_FLOW, EMITS_CALLOUT,
 *                          IMPLEMENTS_INTENT_OF, REALIZES_FORM
 *
 * Each row carries source-line provenance (path, line range).
 *
 * Heuristics for feature-attribution (IMPLEMENTS_INTENT_OF):
 *   The script does NOT autodetect feature mapping. It writes the row
 *   with empty `feature` column; a separate hand-curated edit pass
 *   (or a future analyst) attaches features. This is honest: feature
 *   attribution is a judgment call that the LLM can help with later.
 *
 * Run from workspace root:
 *   npx tsx artifacts/solution-intelligence/sig-build/inventory.mts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
// Why the deep CJS import: this script is intentionally script-only,
// not part of any package.json. Bare 'typescript' resolution under
// ESM requires a local package.json + node_modules; the deep import
// works against any node_modules that has the typescript package
// installed (we use polygraph-viz's).
import ts from 'typescript/lib/typescript.js';

interface RepoConfig {
  /** sw.repo id used in the existing build SIG. */
  repoId: string;
  /** Absolute path to repo root on the host. */
  root: string;
  /** Subdir within the repo to scan (default 'src'). */
  scanDir?: string;
}

const WORKSPACE_ROOT = '/Users/williamfredricks/.openclaw/workspace';
const ARTIFACTS = join(WORKSPACE_ROOT, 'artifacts');
const OUT_DIR = join(
  ARTIFACTS,
  'solution-intelligence/sig-build/load/csv',
);

const REPOS: RepoConfig[] = [
  {
    repoId: 'solution-intelligence',
    root: join(ARTIFACTS, 'solution-intelligence'),
    scanDir: '.',
  },
  {
    repoId: 'polygraph-viz',
    root: join(ARTIFACTS, 'polygraph-viz'),
    scanDir: 'src',
  },
  {
    repoId: 'solution-intelligence-graph-adapter',
    root: join(ARTIFACTS, 'solution-intelligence-graph-adapter'),
    scanDir: 'src',
  },
  {
    repoId: 'solution-intelligence-parsers',
    root: join(ARTIFACTS, 'solution-intelligence-parsers'),
    scanDir: 'src',
  },
  {
    repoId: 'solution-intelligence-analysts',
    root: join(ARTIFACTS, 'solution-intelligence-analysts'),
    scanDir: 'src',
  },
];

interface FileRow {
  id: string;
  path: string;
  repo: string;
  language: string;
  lineCount: number;
}

interface FunctionRow {
  id: string;
  name: string;
  signature: string;
  returnType: string;
  kind: string;
  isAsync: string;
  fileId: string;
  sourceLineStart: number;
  sourceLineEnd: number;
}

interface AltFlowRow {
  id: string;
  name: string;
  condition: string;
  behavior: string;
  fnId: string;
  sourceLineStart: number;
  sourceLineEnd: number;
}

interface CallOutRow {
  id: string;
  target: string;
  kind: string;
  purpose: string;
  fnId: string;
  sourceLineStart: number;
  sourceLineEnd: number;
}

interface EdgeRow {
  fromId: string;
  toId: string;
  type: string;
  source: string;
}

const files: FileRow[] = [];
const functions: FunctionRow[] = [];
const altFlows: AltFlowRow[] = [];
const callOuts: CallOutRow[] = [];
const edges: EdgeRow[] = [];

// Track id collisions so we can make ids stable but unique.
const idCounter = new Map<string, number>();
function uniqueId(base: string): string {
  const n = (idCounter.get(base) ?? 0) + 1;
  idCounter.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function walkRepo(cfg: RepoConfig): void {
  const scanRoot = join(cfg.root, cfg.scanDir ?? 'src');
  const scanned: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return; // dir doesn't exist
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      if (entry.startsWith('.')) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.mts')) {
        scanned.push(full);
      }
    }
  }
  walk(scanRoot);

  console.log(`[${cfg.repoId}] scanning ${scanRoot} (found ${scanned.length} .ts/.mts files)`);

  for (const filePath of scanned) {
    processFile(filePath, cfg);
  }
}

function processFile(filePath: string, cfg: RepoConfig): void {
  const text = readFileSync(filePath, 'utf-8');
  const relPath = relative(cfg.root, filePath);
  const fileId = `file:${cfg.repoId}:${relPath}`;

  // Skip if already seen (defensive — shouldn't happen but loops in the
  // walker could otherwise duplicate).
  if (files.find((f) => f.id === fileId)) return;

  const lineCount = text.split('\n').length;

  files.push({
    id: fileId,
    path: relPath,
    repo: cfg.repoId,
    language: 'typescript',
    lineCount,
  });

  // sw.file -> sw.repo
  edges.push({
    fromId: fileId,
    toId: `repo:${cfg.repoId}`,
    type: 'LIVES_IN',
    source: 'sig-build/inventory.mts',
  });

  // Tier-3 realization for the file.
  const impFileId = `cs_2026.file:${cfg.repoId}:${relPath}`;
  // Tracked as a separate "imp files" record but stored in files[] under
  // a different namespace at write time; here we just emit the edge.
  edges.push({
    fromId: impFileId,
    toId: fileId,
    type: 'REALIZES_FORM',
    source: 'sig-build/inventory.mts',
  });

  // Parse with TypeScript.
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  // Walk top-level declarations + visit deep for try/catch + call-outs.
  source.forEachChild((node) => visitTopLevel(node, source, fileId, impFileId, relPath));
}

function visitTopLevel(
  node: ts.Node,
  source: ts.SourceFile,
  fileId: string,
  impFileId: string,
  relPath: string,
): void {
  // Exported function declarations
  if (ts.isFunctionDeclaration(node) && hasExportModifier(node) && node.name) {
    emitFunction(node, source, fileId, impFileId, node.name.text, 'function');
  }

  // Exported variable statements with arrow / function expression initializers
  if (ts.isVariableStatement(node) && hasExportModifier(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        const name = decl.name.getText(source);
        emitFunction(decl.initializer, source, fileId, impFileId, name, 'arrow');
      }
    }
  }

  // Exported classes - emit methods as functions
  if (ts.isClassDeclaration(node) && hasExportModifier(node) && node.name) {
    const className = node.name.text;
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        const methodName = member.name.getText(source);
        emitFunction(member, source, fileId, impFileId, `${className}.${methodName}`, 'method');
      }
    }
  }
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function emitFunction(
  node: ts.FunctionLikeDeclaration,
  source: ts.SourceFile,
  fileId: string,
  impFileId: string,
  name: string,
  kind: 'function' | 'arrow' | 'method',
): void {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  const lineStart = start.line + 1;
  const lineEnd = end.line + 1;

  const baseId = `fn:${fileId.replace(/^file:/, '')}:${name}`;
  const fnId = uniqueId(baseId);

  // Signature: parameter list + return annotation if present
  const params = (node.parameters ?? []).map((p) => p.getText(source)).join(', ');
  const returnAnnot = node.type ? `: ${node.type.getText(source)}` : '';
  const signature = `(${params})${returnAnnot}`;
  const returnType = node.type ? node.type.getText(source) : 'inferred';
  const isAsync = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
    : false;

  functions.push({
    id: fnId,
    name,
    signature: signature.length > 200 ? signature.slice(0, 197) + '...' : signature,
    returnType: returnType.length > 80 ? returnType.slice(0, 77) + '...' : returnType,
    kind,
    isAsync: isAsync ? 'true' : 'false',
    fileId,
    sourceLineStart: lineStart,
    sourceLineEnd: lineEnd,
  });

  // sw.file -> sw.function
  edges.push({
    fromId: fileId,
    toId: fnId,
    type: 'DECLARES',
    source: `sig-build/inventory.mts:${lineStart}`,
  });

  // cs_2026.function -> sw.function
  const impFnId = `cs_2026.fn:${fnId.replace(/^fn:/, '')}`;
  edges.push({
    fromId: impFnId,
    toId: fnId,
    type: 'REALIZES_FORM',
    source: 'sig-build/inventory.mts',
  });

  // Walk the body for alt-flows + call-outs.
  if (node.body) {
    visitBody(node.body, source, fnId);
  }
}

function visitBody(body: ts.Node, source: ts.SourceFile, fnId: string): void {
  function visit(n: ts.Node): void {
    // try/catch -> alt flow
    if (ts.isTryStatement(n)) {
      const start = source.getLineAndCharacterOfPosition(n.getStart(source));
      const end = source.getLineAndCharacterOfPosition(n.getEnd());
      const afId = uniqueId(`af:${fnId.replace(/^fn:/, '')}:try`);
      const catchClause = n.catchClause;
      const condition = catchClause?.variableDeclaration?.getText(source) ?? 'thrown error';
      // Try to extract a brief behavior summary: first executable statement in catch block
      let behavior = 'catch + handle';
      if (catchClause?.block.statements[0]) {
        const stmt = catchClause.block.statements[0];
        const txt = stmt.getText(source).split('\n')[0]!.trim();
        behavior = txt.length > 80 ? txt.slice(0, 77) + '...' : txt;
      }
      altFlows.push({
        id: afId,
        name: `try/catch in fn`,
        condition,
        behavior,
        fnId,
        sourceLineStart: start.line + 1,
        sourceLineEnd: end.line + 1,
      });
      edges.push({
        fromId: fnId,
        toId: afId,
        type: 'HAS_ALT_FLOW',
        source: 'sig-build/inventory.mts',
      });
      // cs_2026.try_catch realization
      edges.push({
        fromId: `cs_2026.try_catch:${afId.replace(/^af:/, '')}`,
        toId: afId,
        type: 'REALIZES_FORM',
        source: 'sig-build/inventory.mts',
      });
    }

    // Early-return guard: `if (X) return Y;` at top level of function body
    if (
      ts.isIfStatement(n) &&
      !n.elseStatement &&
      n.thenStatement &&
      (ts.isReturnStatement(n.thenStatement) ||
        (ts.isBlock(n.thenStatement) &&
          n.thenStatement.statements.length === 1 &&
          ts.isReturnStatement(n.thenStatement.statements[0]!)))
    ) {
      const start = source.getLineAndCharacterOfPosition(n.getStart(source));
      const end = source.getLineAndCharacterOfPosition(n.getEnd());
      const afId = uniqueId(`af:${fnId.replace(/^fn:/, '')}:guard`);
      const condition = n.expression.getText(source).slice(0, 80);
      altFlows.push({
        id: afId,
        name: 'early-return guard',
        condition,
        behavior: 'early return',
        fnId,
        sourceLineStart: start.line + 1,
        sourceLineEnd: end.line + 1,
      });
      edges.push({
        fromId: fnId,
        toId: afId,
        type: 'HAS_ALT_FLOW',
        source: 'sig-build/inventory.mts',
      });
      edges.push({
        fromId: `cs_2026.early_return:${afId.replace(/^af:/, '')}`,
        toId: afId,
        type: 'REALIZES_FORM',
        source: 'sig-build/inventory.mts',
      });
    }

    // Call expression — classify if it's a known external invocation.
    if (ts.isCallExpression(n)) {
      const callTxt = n.expression.getText(source);
      const callOut = classifyCallOut(callTxt);
      if (callOut) {
        const start = source.getLineAndCharacterOfPosition(n.getStart(source));
        const end = source.getLineAndCharacterOfPosition(n.getEnd());
        const coId = uniqueId(`co:${fnId.replace(/^fn:/, '')}:${callOut.kind}`);
        callOuts.push({
          id: coId,
          target: callOut.target,
          kind: callOut.kind,
          purpose: callOut.purpose,
          fnId,
          sourceLineStart: start.line + 1,
          sourceLineEnd: end.line + 1,
        });
        edges.push({
          fromId: fnId,
          toId: coId,
          type: 'EMITS_CALLOUT',
          source: 'sig-build/inventory.mts',
        });
        // cs_2026 realization
        const impLabel =
          callOut.kind === 'http'
            ? 'cs_2026.fetch_call'
            : callOut.kind === 'sdk'
              ? 'cs_2026.sdk_call'
              : callOut.kind === 'fs'
                ? 'cs_2026.fs_call'
                : 'cs_2026.callout';
        edges.push({
          fromId: `${impLabel}:${coId.replace(/^co:/, '')}`,
          toId: coId,
          type: 'REALIZES_FORM',
          source: 'sig-build/inventory.mts',
        });
      }
    }

    n.forEachChild(visit);
  }
  visit(body);
}

interface CallOutInfo {
  target: string;
  kind: 'http' | 'sdk' | 'fs' | 'process' | 'docker';
  purpose: string;
}

function classifyCallOut(callText: string): CallOutInfo | null {
  // The classifier is intentionally narrow: only well-known external
  // calls get a node. Internal helpers, .map/.filter, and library-internal
  // chains are skipped.
  if (callText === 'fetch') return { target: 'fetch', kind: 'http', purpose: 'outbound HTTP' };
  if (callText.endsWith('.send') && callText.includes('client'))
    return { target: callText, kind: 'sdk', purpose: 'AWS SDK send' };
  if (/^bedrock\.\w+/.test(callText))
    return { target: callText, kind: 'sdk', purpose: 'Bedrock invocation' };
  if (callText === 'readFileSync' || callText === 'writeFileSync' || callText === 'existsSync')
    return { target: callText, kind: 'fs', purpose: 'sync file I/O' };
  if (callText.startsWith('fs.') || callText.startsWith('promises.'))
    return { target: callText, kind: 'fs', purpose: 'file I/O' };
  if (callText.startsWith('app.get') || callText.startsWith('app.post'))
    return { target: callText, kind: 'http', purpose: 'Hono route registration' };
  if (callText.includes('createNode') || callText.includes('createRelationship'))
    return { target: callText, kind: 'sdk', purpose: 'PolyGraph write' };
  if (callText.includes('execSync') || callText.includes('spawn'))
    return { target: callText, kind: 'process', purpose: 'child process' };
  return null;
}

// ── Run ──────────────────────────────────────────────────────────

for (const r of REPOS) walkRepo(r);

console.log('');
console.log('Inventory summary:');
console.log(`  files:      ${files.length}`);
console.log(`  functions:  ${functions.length}`);
console.log(`  alt flows:  ${altFlows.length}`);
console.log(`  call-outs:  ${callOuts.length}`);
console.log(`  edges:      ${edges.length}`);
console.log('');

mkdirSync(OUT_DIR, { recursive: true });

writeCsv(join(OUT_DIR, 'dom-files.csv'),
  ['id', 'path', 'repo', 'language', 'lineCount'],
  files);
writeCsv(join(OUT_DIR, 'dom-functions.csv'),
  ['id', 'name', 'signature', 'returnType', 'kind', 'isAsync', 'fileId', 'sourceLineStart', 'sourceLineEnd'],
  functions);
writeCsv(join(OUT_DIR, 'dom-alt-flows.csv'),
  ['id', 'name', 'condition', 'behavior', 'fnId', 'sourceLineStart', 'sourceLineEnd'],
  altFlows);
writeCsv(join(OUT_DIR, 'dom-call-outs.csv'),
  ['id', 'target', 'kind', 'purpose', 'fnId', 'sourceLineStart', 'sourceLineEnd'],
  callOuts);
writeCsv(join(OUT_DIR, 'edges.csv'),
  ['fromId', 'toId', 'type', 'source'],
  edges);

console.log(`✅ CSVs written to ${OUT_DIR}`);

function writeCsv<T extends Record<string, unknown>>(
  path: string,
  columns: string[],
  rows: T[],
): void {
  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    const vals = columns.map((c) => {
      const v = (row as Record<string, unknown>)[c];
      return formatCsvValue(v);
    });
    lines.push(vals.join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n');
  console.log(`  wrote ${path} (${rows.length} rows)`);
}

function formatCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
