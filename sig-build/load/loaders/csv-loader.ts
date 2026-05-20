/**
 * Reusable CSV → PolyGraph ingest scaffold.
 *
 * One generic loader that reads a CSV file and writes nodes or edges
 * based on a per-file SCHEMA descriptor. Used by every CSV in v0.3.5:
 *   - csv/biz-reqs.csv         -> intended_behavior (Tier-1)
 *   - csv/biz-ucs.csv          -> sw.use_case
 *   - csv/biz-features.csv     -> sw.feature
 *   - csv/dom-files.csv        -> sw.file
 *   - csv/dom-functions.csv    -> sw.function
 *   - csv/dom-alt-flows.csv    -> sw.alt_flow
 *   - csv/dom-call-outs.csv    -> sw.call_out
 *   - csv/imp-files.csv        -> cs_2026.source_file + REALIZES_FORM
 *   - csv/imp-functions.csv    -> cs_2026.function + REALIZES_FORM
 *   - csv/imp-endpoints.csv    -> cs_2026.endpoint + REALIZES_FORM
 *   - csv/edges.csv            -> generic edges (LIVES_IN, DECLARES,
 *                                 IMPLEMENTS_INTENT_OF, etc)
 *
 * Why CSV + this scaffold (rather than per-CSV hardcoded loaders):
 *   - CSV is easy to hand-edit; the analyst pattern can later read
 *     the same files
 *   - One inventory script can write all 4 dom CSVs from AST output
 *   - One ingestion routine means one place to fix bugs
 *
 * Idempotency: all node ids are stable strings; createNode catches
 * 'already exists' and skips. Same for createRelationship via
 * deterministic (fromId, toId, type) triples.
 *
 * Run: docker compose stop si-sig-viz
 *      docker compose run --rm si-sig-load npx tsx /app/loaders/load-csvs.ts
 *      docker compose start si-sig-viz
 */

import { readFileSync } from 'node:fs';

export interface CsvRow {
  [column: string]: string;
}

/**
 * Minimal CSV parser. Handles double-quote-wrapped fields with embedded
 * commas and escaped quotes ("" inside ""). Does NOT handle multi-line
 * fields — we never need them for this use case and supporting them
 * adds complexity.
 *
 * Why hand-roll: the node:fs csv package is not a built-in, adding
 * a dependency for a 30-line parser isn't worth it.
 */
export function parseCsv(text: string): CsvRow[] {
  const lines: string[] = [];
  // Split on LF, preserving CR-LF tolerance.
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length === 0) continue;
    if (raw.startsWith('#')) continue; // comment lines
    lines.push(raw);
  }
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]!);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    if (fields.length === 0) continue;
    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]!] = fields[c] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    let value = '';
    if (line[i] === '"') {
      // Quoted field.
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // closing quote
          break;
        } else {
          value += line[i];
          i++;
        }
      }
    } else {
      // Unquoted field.
      while (i < line.length && line[i] !== ',') {
        value += line[i];
        i++;
      }
    }
    fields.push(value);
    if (line[i] === ',') i++;
  }
  return fields;
}

export function readCsv(path: string): CsvRow[] {
  return parseCsv(readFileSync(path, 'utf-8'));
}

/**
 * Lightweight tracker so each loader can report consistent counts at
 * the end of a run.
 */
export class LoadCounter {
  nodesCreated = 0;
  nodesSkipped = 0;
  edgesCreated = 0;
  edgesSkipped = 0;
  warnings: string[] = [];

  warn(msg: string): void {
    this.warnings.push(msg);
    console.warn('  WARN:', msg);
  }

  summary(label: string): void {
    console.log(
      `[${label}] nodes: ${this.nodesCreated} created, ${this.nodesSkipped} skipped | ` +
        `edges: ${this.edgesCreated} created, ${this.edgesSkipped} skipped | ` +
        `warnings: ${this.warnings.length}`,
    );
  }
}

/**
 * Helper that catches the 'already exists' / 'duplicate' error pattern
 * that the polygraph-db createNode + createRelationship throw, so
 * idempotent re-runs do not break.
 */
export function isDuplicateError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error)?.message ?? String(err);
  return msg.includes('already exists') || msg.includes('duplicate');
}
