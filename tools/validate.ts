/**
 * Content validation CLI.
 *   npm run validate        → integrity report, exits 1 on errors
 *   npm run graph           → also prints the reaction dependency graph as Mermaid
 */
import { Content } from '../src/content';
import { reactionEdges, validateContent } from '../src/content/validate';

const issues = validateContent();
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

console.log(`Alchemy Ball content: ${Content.lists.ELEMENTS.length} elements, ${Content.lists.REACTIONS.length} reactions, ${Content.lists.ENEMIES.length} enemies, ${Content.lists.UPGRADES.length} upgrades, ${Content.lists.RESEARCH.length} research nodes`);
for (const w of warnings) console.log(`  warn  ${w.where}: ${w.message}`);
for (const e of errors) console.log(`  ERROR ${e.where}: ${e.message}`);

// Coverage: which base-element pairs have reactions, which are inert by design.
const base = Content.lists.ELEMENTS.filter((e) => e.tier === 'base').map((e) => e.id);
const covered: string[] = [];
const inert: string[] = [];
for (let i = 0; i < base.length; i++)
  for (let j = i + 1; j < base.length; j++) {
    const a = base[i];
    const b = base[j];
    const has = Content.lists.REACTIONS.some((r) => (r.inputs.includes(a) && r.inputs.includes(b)) || r.inputs.includes('*') && (r.inputs.includes(a) || r.inputs.includes(b)));
    (has ? covered : inert).push(`${a}+${b}`);
  }
console.log(`\nBase pair coverage: ${covered.length}/${covered.length + inert.length} pairs react. Inert pairs (content opportunities):`);
console.log('  ' + inert.join(', '));

if (process.argv.includes('--graph')) {
  console.log('\n```mermaid\ngraph LR');
  for (const e of reactionEdges()) console.log(`  ${e.from} -->|${e.via}| ${e.to}`);
  console.log('```');
}

console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
