/**
 * Solution Intelligence SIG queries.
 *
 * Run: `npm run query` (assumes `npm run ingest` has been run first).
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
  console.log(`\n== SIG OVERVIEW ==`);
  console.log(`Total bookend nodes: ${allNodes.length}`);

  const byLabel = new Map<string, number>();
  for (const n of allNodes) {
    for (const lbl of n.labels) {
      if (lbl !== 'Bookend') byLabel.set(lbl, (byLabel.get(lbl) ?? 0) + 1);
    }
  }
  console.log('By label:');
  for (const [lbl, n] of [...byLabel.entries()].sort()) {
    console.log(`  ${lbl.padEnd(24)} ${n}`);
  }

  // Index all relationships by type for downstream queries
  const allRels = {
    implements: await graph.findRelationships('IMPLEMENTS'),
    exercises: await graph.findRelationships('EXERCISES'),
    involves: await graph.findRelationships('INVOLVES'),
  };
  console.log(`\nRelationship counts:`);
  console.log(`  IMPLEMENTS: ${allRels.implements.length}`);
  console.log(`  EXERCISES:  ${allRels.exercises.length}`);
  console.log(`  INVOLVES:   ${allRels.involves.length}`);

  const reqsImplemented = new Set(allRels.implements.map(r => r.endNode));
  const reqsExercised = new Set(allRels.exercises.map(r => r.endNode));
  const featuresInvolved = new Set(allRels.involves.map(r => r.endNode));

  // == Q1: Requirements not exercised by any UC ============================
  console.log('\n== Q1: Requirements not exercised by any UseCase ==');
  const reqs = await graph.findNodes('Requirement');
  let unexercised = 0;
  for (const r of reqs) {
    if (!reqsExercised.has(r.id)) {
      console.log(`  ${r.id}: ${(r.properties.summary as string ?? '').substring(0, 100)}`);
      unexercised++;
    }
  }
  console.log(`Total unexercised: ${unexercised} of ${reqs.length}`);

  // == Q2: Requirements not implemented by any feature =====================
  console.log('\n== Q2: Requirements not implemented by any Feature ==');
  let unimplemented = 0;
  for (const r of reqs) {
    if (!reqsImplemented.has(r.id)) {
      console.log(`  ${r.id}: ${(r.properties.summary as string ?? '').substring(0, 100)}`);
      unimplemented++;
    }
  }
  console.log(`Total unimplemented: ${unimplemented} of ${reqs.length}`);

  // == Q3: Features with no UCs ============================================
  console.log('\n== Q3: Features with no UseCase coverage ==');
  const features = await graph.findNodes('Feature');
  let featuresNoUC = 0;
  for (const f of features) {
    if (!featuresInvolved.has(f.id)) {
      console.log(`  ${f.id}: ${f.properties.title}`);
      featuresNoUC++;
    }
  }
  console.log(`Total features without UC: ${featuresNoUC} of ${features.length}`);

  // == Q4: SchemaLabel tier counts =========================================
  console.log('\n== Q4: SchemaLabel counts by tier ==');
  const labels = await graph.findNodes('SchemaLabel');
  const byTier = new Map<number, string[]>();
  for (const l of labels) {
    const t = (l.properties.tier as number) ?? 0;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(l.properties.qualifiedName as string);
  }
  for (const [t, names] of [...byTier.entries()].sort()) {
    console.log(`  Tier ${t}: ${names.length} labels`);
    for (const n of names.sort()) console.log(`    ${n}`);
  }

  // == Q5: Deliverables ====================================================
  console.log('\n== Q5: Deliverables ==');
  const deliverables = await graph.findNodes('Deliverable');
  for (const d of deliverables) {
    console.log(`  ${d.properties.name} | inputs: ${d.properties.inputClasses} | audience: ${d.properties.audience}`);
  }
  console.log(`Total: ${deliverables.length}`);

  // == Q6: Pipeline steps ===================================================
  console.log('\n== Q6: Pipeline steps in order ==');
  const steps = await graph.findNodes('PipelineStep');
  steps.sort((a, b) => (a.properties.stepNumber as number) - (b.properties.stepNumber as number));
  for (const s of steps) {
    console.log(`  Step ${s.properties.stepNumber}: ${s.properties.name}`);
  }
  console.log(`Total: ${steps.length}`);

  // == Q7: Doctrine ========================================================
  console.log('\n== Q7: Doctrine commitments ==');
  const principles = await graph.findNodes('DoctrinePrinciple');
  principles.sort((a, b) => (a.properties.principleNumber as number) - (b.properties.principleNumber as number));
  for (const p of principles) {
    console.log(`  ${p.properties.principleNumber}. ${p.properties.name}`);
  }
  console.log(`Total: ${principles.length}`);

  // == Q8: AuditBlockKinds =================================================
  console.log('\n== Q8: AuditBlockKinds ==');
  const blocks = await graph.findNodes('AuditBlockKind');
  for (const b of blocks) console.log(`  ${b.properties.name}`);
  console.log(`Total: ${blocks.length}`);

  // == Q9: Non-goals =======================================================
  console.log('\n== Q9: Non-goals ==');
  const nongoals = await graph.findNodes('NonGoal');
  for (const ng of nongoals) console.log(`  ${ng.properties.name}`);
  console.log(`Total: ${nongoals.length}`);

  await graph.close();
}

main().catch((err) => {
  console.error('[query] FAILED:', err);
  process.exit(1);
});
