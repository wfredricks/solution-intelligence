/**
 * Feature gap audit (corrected for actual SIG edge model):
 *
 *   IMPLEMENTS  = Feature → Requirement
 *   EXERCISES   = UseCase → Requirement
 *   INVOLVES    = Component → Feature
 *
 * A Feature ↔ UseCase relationship is transitive:
 *   Feature -IMPLEMENTS-> Requirement <-EXERCISES- UseCase
 *
 * This script reports:
 *   1. Unimplemented REQs (Feature gap)
 *   2. UCs with at least one cited REQ that is unimplemented (UC-level gap)
 *   3. UCs whose REQs are all implemented, but by a fragmented feature set
 *      (suggests a missing UC-shaped feature that names the whole flow)
 *   4. Features grouped by which UCs they participate in (Feature → reachable UCs)
 *   5. Suggested new features (one per gap shape)
 *
 * Run: `npx tsx scripts/feature-gap-audit.ts`
 */

import { PolyGraph, LevelAdapter } from 'polygraph-db';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data');

async function main() {
  const graph = new PolyGraph({ adapter: new LevelAdapter({ path: DATA_DIR }) });
  await graph.open();

  const allNodes = await graph.findNodes('Bookend');
  const requirements = allNodes.filter(n => n.labels.includes('Requirement'));
  const features = allNodes.filter(n => n.labels.includes('Feature'));
  const usecases = allNodes.filter(n => n.labels.includes('UseCase'));

  console.log(`\n== INVENTORY ==`);
  console.log(`Requirements: ${requirements.length}  Features: ${features.length}  UseCases: ${usecases.length}`);

  const refOf = (n: any) => n.properties?.ref ?? n.id;
  const titleOf = (n: any) => n.properties?.title ?? '';

  const reqByRef = new Map<string, any>();
  const featByRef = new Map<string, any>();
  const ucByRef = new Map<string, any>();
  for (const r of requirements) reqByRef.set(refOf(r), r);
  for (const f of features) featByRef.set(refOf(f), f);
  for (const u of usecases) ucByRef.set(refOf(u), u);

  const implRels = await graph.findRelationships('IMPLEMENTS');
  const exerRels = await graph.findRelationships('EXERCISES');

  // Build indexes by ref (startNode/endNode are refs)
  const featuresByReq = new Map<string, Set<string>>();    // reqRef -> set<featRef>
  const reqsByFeature = new Map<string, Set<string>>();    // featRef -> set<reqRef>
  const reqsByUC = new Map<string, Set<string>>();         // ucRef -> set<reqRef>
  const ucsByReq = new Map<string, Set<string>>();         // reqRef -> set<ucRef>

  for (const e of implRels as any[]) {
    if (!featuresByReq.has(e.endNode)) featuresByReq.set(e.endNode, new Set());
    featuresByReq.get(e.endNode)!.add(e.startNode);
    if (!reqsByFeature.has(e.startNode)) reqsByFeature.set(e.startNode, new Set());
    reqsByFeature.get(e.startNode)!.add(e.endNode);
  }
  for (const e of exerRels as any[]) {
    if (!reqsByUC.has(e.startNode)) reqsByUC.set(e.startNode, new Set());
    reqsByUC.get(e.startNode)!.add(e.endNode);
    if (!ucsByReq.has(e.endNode)) ucsByReq.set(e.endNode, new Set());
    ucsByReq.get(e.endNode)!.add(e.startNode);
  }

  // 1. Unimplemented REQs
  const unimplemented = requirements.filter(r => !featuresByReq.has(refOf(r)));
  console.log(`\n== 1. UNIMPLEMENTED REQs (no Feature IMPLEMENTS) ==`);
  console.log(`Count: ${unimplemented.length}`);
  for (const r of unimplemented.sort((a, b) => refOf(a).localeCompare(refOf(b)))) {
    console.log(`  ${refOf(r).padEnd(16)} ${titleOf(r).slice(0, 90)}`);
  }

  // 2. UCs with at least one unimplemented cited REQ (UC-level hard gap)
  console.log(`\n== 2. UCs with at least one unimplemented cited REQ ==`);
  const ucHardGaps: { uc: string; title: string; missing: string[] }[] = [];
  for (const u of usecases) {
    const ucRef = refOf(u);
    const reqs = [...(reqsByUC.get(ucRef) ?? [])];
    const missing = reqs.filter(r => !featuresByReq.has(r));
    if (missing.length > 0) {
      ucHardGaps.push({ uc: ucRef, title: titleOf(u), missing: missing.sort() });
    }
  }
  console.log(`Count: ${ucHardGaps.length}`);
  for (const g of ucHardGaps.sort((a, b) => a.uc.localeCompare(b.uc))) {
    console.log(`  ${g.uc.padEnd(8)} ${g.title.slice(0, 70)}`);
    console.log(`           missing REQs: ${g.missing.join(', ')}`);
  }

  // 3. UCs whose REQs are all implemented (good!) — show which features carry the load
  console.log(`\n== 3. UCs fully implementable (all cited REQs have at least one Feature) ==`);
  const ucFullyCovered: { uc: string; title: string; features: Map<string, number>; reqCount: number }[] = [];
  for (const u of usecases.sort((a, b) => refOf(a).localeCompare(refOf(b)))) {
    const ucRef = refOf(u);
    const reqs = [...(reqsByUC.get(ucRef) ?? [])];
    const missing = reqs.filter(r => !featuresByReq.has(r));
    if (missing.length === 0 && reqs.length > 0) {
      // Count which features cover this UC's REQs
      const fCount = new Map<string, number>();
      for (const r of reqs) {
        for (const f of featuresByReq.get(r) ?? []) {
          fCount.set(f, (fCount.get(f) ?? 0) + 1);
        }
      }
      ucFullyCovered.push({ uc: ucRef, title: titleOf(u), features: fCount, reqCount: reqs.length });
    }
  }
  for (const u of ucFullyCovered) {
    const sortedFeatures = [...u.features.entries()].sort((a, b) => b[1] - a[1]);
    const featureSummary = sortedFeatures.map(([f, c]) => `${f}(${c}/${u.reqCount})`).join(', ');
    console.log(`  ${u.uc.padEnd(8)} ${u.title.slice(0, 60)}`);
    console.log(`           features: ${featureSummary}`);
  }

  // 4. Feature reach (which UCs each feature participates in)
  console.log(`\n== 4. Feature reach: which UCs each Feature participates in (via shared REQs) ==`);
  const ucsByFeature = new Map<string, Set<string>>();
  for (const [featRef, reqs] of reqsByFeature) {
    for (const r of reqs) {
      for (const uc of ucsByReq.get(r) ?? []) {
        if (!ucsByFeature.has(featRef)) ucsByFeature.set(featRef, new Set());
        ucsByFeature.get(featRef)!.add(uc);
      }
    }
  }
  for (const f of features.sort((a, b) => refOf(a).localeCompare(refOf(b)))) {
    const fRef = refOf(f);
    const ucs = [...(ucsByFeature.get(fRef) ?? [])].sort();
    const reqCount = reqsByFeature.get(fRef)?.size ?? 0;
    console.log(`  ${fRef.padEnd(10)} reqs=${reqCount}, UCs=[${ucs.join(', ') || '(none)'}]`);
    console.log(`              "${titleOf(f).slice(0, 80)}"`);
  }

  // 5. Features that touch no UC (a feature without an EXERCISES path)
  console.log(`\n== 5. Features with no UC reach (Feature implements REQs that no UC exercises) ==`);
  const orphanFeatures = features.filter(f => (ucsByFeature.get(refOf(f))?.size ?? 0) === 0);
  console.log(`Count: ${orphanFeatures.length}`);
  for (const f of orphanFeatures) {
    console.log(`  ${refOf(f).padEnd(10)} "${titleOf(f).slice(0, 80)}"`);
  }

  // 6. Heat map: which feature has the most UC reach (suggests it's actually two features)
  console.log(`\n== 6. Feature UC-reach distribution (high reach may indicate a feature that should be split) ==`);
  const reach = features
    .map(f => ({ ref: refOf(f), title: titleOf(f), ucs: ucsByFeature.get(refOf(f))?.size ?? 0 }))
    .sort((a, b) => b.ucs - a.ucs);
  for (const r of reach) console.log(`  ${r.ref.padEnd(10)} UCs=${String(r.ucs).padStart(2)}  "${r.title.slice(0, 70)}"`);

  await graph.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
