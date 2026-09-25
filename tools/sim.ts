/**
 * Balance simulation: runs the autoplay bot across cores and seeds and reports win rate,
 * run length, reaction frequency and discovery rates.
 *   npm run sim -- [runsPerCore=20] [skill=0.6]
 */
import { Content } from '../src/content';
import { botRun, type BotResult } from '../src/game/autoplay';

const runs = Number(process.argv[2] ?? 20);
const skill = Number(process.argv[3] ?? 0.6);
const cores = Content.lists.CORES.map((c) => c.id);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const all: BotResult[] = [];
const causeCount: Record<string, number> = {};
const reactionTotals: Record<string, number> = {};

console.log(`Simulating ${runs} runs × ${cores.length} cores at bot skill ${skill}\n`);
console.log('core      win    avgFloor  avgMin  react/min  disc  maxDepth  maxRxnStep');
for (const core of cores) {
  const res: BotResult[] = [];
  for (let i = 0; i < runs; i++) res.push(botRun({ seed: 1000 + i * 7919, core, skill }));
  all.push(...res);
  for (const r of res) {
    if (r.cause) causeCount[r.cause] = (causeCount[r.cause] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.reactionCounts)) reactionTotals[k] = (reactionTotals[k] ?? 0) + v;
  }
  const avg = (f: (r: BotResult) => number) => res.reduce((s, r) => s + f(r), 0) / res.length;
  const mins = avg((r) => r.seconds) / 60;
  console.log(
    `${core.padEnd(9)} ${pct(avg((r) => (r.won ? 1 : 0))).padStart(4)}   ${avg((r) => r.floor).toFixed(1).padStart(6)}   ${mins.toFixed(1).padStart(5)}   ${(avg((r) => r.reactions) / Math.max(0.1, mins)).toFixed(1).padStart(8)}   ${avg((r) => r.discoveries).toFixed(1).padStart(4)}   ${Math.max(...res.map((r) => r.maxDepth)).toString().padStart(6)}   ${Math.max(...res.map((r) => r.maxReactionsInStep)).toString().padStart(8)}`,
  );
}
console.log('\nFailure causes:', causeCount);
const total = Object.values(reactionTotals).reduce((a, b) => a + b, 0);
console.log('\nReaction share (all cores):');
for (const [k, v] of Object.entries(reactionTotals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${pct(v / total).padStart(4)}  (${v})`);
const never = Content.lists.REACTIONS.filter((r) => !reactionTotals[r.id]).map((r) => r.id);
console.log('\nNever triggered by bot:', never.join(', ') || 'none');
const rooms = all.flatMap((r) => r.roomSeconds);
console.log(`\nRoom length: median ${rooms.sort((a, b) => a - b)[Math.floor(rooms.length / 2)].toFixed(0)}s, p90 ${rooms[Math.floor(rooms.length * 0.9)].toFixed(0)}s`);
