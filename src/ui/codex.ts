import { Content, pairKey } from '../content';
import type { ReactionDef } from '../content/types';
import { FEAT_LABELS, MASTERY_TIERS, masteryTier, nextLevel, pairKnowledge, type Profile } from '../game/profile';
import { clear, h } from './dom';

type Tab = 'reactions' | 'elements' | 'bestiary' | 'journal';

/** Reactions available for an element pair, including wildcard (Arcane) reactions. */
export function reactionsForPair(a: string, b: string): ReactionDef[] {
  const baseA = Content.elements.get(a)?.tier === 'base';
  const baseB = Content.elements.get(b)?.tier === 'base';
  return Content.lists.REACTIONS.filter((r) => {
    const [x, y] = r.inputs;
    if (pairKey(x, y) === pairKey(a, b)) return true;
    if (x === '*' || y === '*') {
      const fixed = x === '*' ? y : x;
      return (fixed === a && baseB && b !== a) || (fixed === b && baseA && a !== b);
    }
    return false;
  });
}

const STATE_TEXT = {
  known: 'Known reaction',
  stirred: 'Something stirred — a reaction exists, but its conditions were not met.',
  inert: 'Tested: these elements do not react.',
  hinted: 'Hinted: a reaction exists. Experiment!',
  unknown: 'Untested.',
};

export function renderCodex(root: HTMLElement, p: Profile, onBack: () => void): void {
  let tab: Tab = 'reactions';
  let sel: [string, string] | null = null;
  let query = '';
  const cols = Content.lists.ELEMENTS.filter((e) => e.tier !== 'hidden').map((e) => e.id);
  const colsWithImpact = [...cols, 'kinetic'];

  const render = () => {
    clear(root);
    const known = Object.keys(p.discovered).length;
    const wrap = h('div', { class: 'wrap' },
      h('div', { class: 'row' }, h('button', { class: 'ghost small', onclick: onBack }, '← Back'), h('div', { class: 'spacer' }), h('span', { class: 'pill frag' }, `${known}/${Content.lists.REACTIONS.length} reactions`)),
      h('h2', null, 'Alchemy Codex'),
      h('div', { class: 'tabs' }, ...(['reactions', 'elements', 'bestiary', 'journal'] as Tab[]).map((t) =>
        h('button', { class: `small${tab === t ? ' on' : ''}`, onclick: () => { tab = t; render(); } }, t[0].toUpperCase() + t.slice(1)))),
    );
    root.append(wrap);
    if (tab === 'reactions') renderReactions(wrap);
    if (tab === 'elements') renderElements(wrap);
    if (tab === 'bestiary') renderBestiary(wrap);
    if (tab === 'journal') renderJournal(wrap);
  };

  const cellFor = (a: string, b: string) => {
    if (a === b) return h('div', { class: 'cell self' });
    const rs = reactionsForPair(a, b);
    const k = pairKnowledge(p, pairKey(a, b), rs.map((r) => r.id));
    const label = k.state === 'known' ? String(k.reactions.length) : k.state === 'stirred' ? '!' : k.state === 'inert' ? '·' : k.state === 'hinted' ? '?' : '';
    const isSel = sel && pairKey(sel[0], sel[1]) === pairKey(a, b);
    return h('div', { class: `cell ${k.state}${isSel ? ' sel' : ''}`, title: `${Content.elements.get(a)?.name} + ${Content.elements.get(b)?.name}`, onclick: () => { sel = [a, b]; render(); } }, label);
  };

  const renderReactions = (wrap: HTMLElement) => {
    const seen = (id: string) => id === 'kinetic' || p.seenElements.includes(id);
    const grid = h('div', { class: 'matrix', style: `grid-template-columns: 20px repeat(${colsWithImpact.length}, minmax(0, 1fr))` });
    grid.append(h('div', { class: 'h' }));
    for (const c of colsWithImpact) {
      const d = Content.elements.get(c)!;
      grid.append(h('div', { class: 'h', style: `color:${seen(c) ? d.color : '#444'}`, title: d.name }, seen(c) ? d.glyph : '?'));
    }
    for (const r of cols) {
      const d = Content.elements.get(r)!;
      grid.append(h('div', { class: 'h', style: `color:${seen(r) ? d.color : '#444'}`, title: d.name }, seen(r) ? d.glyph : '?'));
      for (const c of colsWithImpact) grid.append(cellFor(r, c));
    }
    wrap.append(h('div', { class: 'card' }, grid,
      h('div', { class: 'legend', style: 'margin-top:8px' },
        h('span', { style: '--c:#ff8a3d55' }, 'known'), h('span', { style: '--c:#ffd23a44' }, '! stirred'), h('span', { style: '--c:#c9a6ff44' }, '? hinted'),
        h('span', { style: '--c:#ffffff10' }, '· tested, inert'), h('span', { style: '--c:#ffffff08' }, 'untested')),
      h('div', { class: 'tiny dim', style: 'margin-top:4px' }, 'Last column (✶) is Impact: reactions triggered by hitting something hard.')));
    if (sel) wrap.append(pairDetail(sel[0], sel[1]));
    const input = h('input', { type: 'search', placeholder: 'Search known reactions…', value: query, oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.toLowerCase(); renderList(); } });
    const list = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    const renderList = () => {
      clear(list);
      const rs = Content.lists.REACTIONS.filter((r) => p.discovered[r.id]).filter((r) => !query || r.name.toLowerCase().includes(query) || r.inputs.some((i) => Content.elements.get(i)?.name.toLowerCase().includes(query)) || r.category.includes(query));
      if (!rs.length) list.append(h('div', { class: 'small dim' }, query ? 'No match.' : 'No reactions yet — collide elements to discover them.'));
      for (const r of rs) list.append(reactionCard(r));
    };
    renderList();
    wrap.append(input, list);
  };

  const pairDetail = (a: string, b: string) => {
    const rs = reactionsForPair(a, b);
    const k = pairKnowledge(p, pairKey(a, b), rs.map((r) => r.id));
    const ea = Content.elements.get(a)!;
    const eb = Content.elements.get(b)!;
    const card = h('div', { class: 'card' }, h('h3', null, h('span', { style: `color:${ea.color}` }, `${ea.glyph} ${ea.name}`), ' + ', h('span', { style: `color:${eb.color}` }, `${eb.glyph} ${eb.name}`)));
    card.append(h('div', { class: 'small dim' }, STATE_TEXT[k.state]));
    for (const r of rs) {
      if (p.discovered[r.id]) card.append(reactionCard(r));
      else if (k.state === 'stirred' || k.state === 'hinted' || p.revealed.includes(r.id)) card.append(h('div', { class: 'small', style: 'margin-top:6px;color:#c9a6ff' }, `Hint: ${r.hint}`));
    }
    if (rs.some((r) => p.discovered[r.id]) && rs.some((r) => !p.discovered[r.id])) card.append(h('div', { class: 'tiny dim', style: 'margin-top:6px' }, 'This pair has other outcomes in different contexts…'));
    return card;
  };

  const reactionCard = (r: ReactionDef) => {
    const rec = p.discovered[r.id];
    const tier = masteryTier(rec);
    const color = r.color ?? Content.elements.get(r.output?.element ?? r.inputs[0])?.color ?? '#fff';
    const next = MASTERY_TIERS.find((m) => m.tier === tier + 1);
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', { style: `color:${color}` }, r.name), h('div', { class: 'spacer' }), h('span', { class: 'mastery-stars' }, '★'.repeat(tier) + '☆'.repeat(3 - tier))),
      h('div', { class: 'tiny dim' }, `${r.inputs.map((i) => (i === '*' ? 'any' : Content.elements.get(i)?.name)).join(' + ')} · ${r.category} · used ${rec?.count ?? 0}×`),
      h('div', { class: 'small', style: 'margin:4px 0' }, r.description),
      h('div', { class: 'tiny' }, '💡 ', r.followUp),
      h('details', null, h('summary', { class: 'tiny dim' }, `Mastery: ${rec?.feats.length ?? 0} feats${next ? ` — ${next.feats} for ${'★'.repeat(next.tier)} (+${Math.round((next.potency - 1) * 100)}% potency)` : ' — mastered'}`),
        ...Object.entries(FEAT_LABELS).map(([k, label]) => h('div', { class: `feat ${rec?.feats.includes(k) ? 'got' : 'not'}` }, `${rec?.feats.includes(k) ? '✓' : '○'} ${label}`))),
    );
  };

  const renderElements = (wrap: HTMLElement) => {
    for (const e of Content.lists.ELEMENTS.filter((x) => x.tier !== 'hidden')) {
      const seen = p.seenElements.includes(e.id);
      const phys = e.ballPhysics ? Object.entries(e.ballPhysics).map(([k, v]) => physLabel(k, v!)).join(', ') : '';
      wrap.append(h('div', { class: `card${seen ? '' : ' locked'}` },
        h('div', { class: 'row' }, h('span', { style: `font-size:22px;color:${e.color}` }, seen ? e.glyph : '?'), h('b', null, seen ? e.name : 'Unknown element'), h('div', { class: 'spacer' }), h('span', { class: 'tiny dim' }, e.tier)),
        seen ? h('div', { class: 'small' }, e.description) : h('div', { class: 'small dim' }, e.tier === 'compound' ? 'Created by a reaction.' : 'Not yet encountered.'),
        seen && phys ? h('div', { class: 'tiny dim', style: 'margin-top:4px' }, `On your ball: ${phys}`) : null,
      ));
    }
  };

  const renderBestiary = (wrap: HTMLElement) => {
    for (const e of Content.lists.ENEMIES) {
      const b = p.bestiary[e.id];
      if (!b) {
        wrap.append(h('div', { class: 'card locked small' }, '??? — not yet encountered'));
        continue;
      }
      const weak = Content.lists.REACTIONS.filter((r) => p.discovered[r.id] && e.innate && r.inputs.includes(e.innate.element)).map((r) => r.name);
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'row' }, h('span', { style: `color:${e.color};font-size:20px` }, '●'), h('b', null, e.name), h('div', { class: 'spacer' }), h('span', { class: 'tiny dim' }, `defeated ${b.kills}`)),
        h('div', { class: 'small' }, e.description),
        h('div', { class: 'small', style: 'color:var(--gold);margin-top:4px' }, e.lesson),
        h('div', { class: 'tiny dim', style: 'margin-top:4px' }, [
          e.innate ? `Carries ${Content.elements.get(e.innate.element)?.name}` : null,
          e.armor ? `Armor ${Math.round(e.armor * 100)}%` : null,
          e.resist ? `Immune: ${Object.entries(e.resist).filter(([, v]) => v === 0).map(([k]) => Content.elements.get(k)?.name).join(', ')}` : null,
          e.adaptive ? 'Adapts to repeated elements' : null,
          e.tags.includes('flying') ? 'Flying' : null,
        ].filter(Boolean).join(' · ')),
        weak.length ? h('div', { class: 'tiny', style: 'margin-top:2px' }, `Known interactions: ${weak.join(', ')}`) : null,
      ));
    }
  };

  const renderJournal = (wrap: HTMLElement) => {
    const nl = nextLevel(p);
    const total = Content.lists.REACTIONS.length;
    const known = Object.keys(p.discovered).length;
    const mastered = Object.values(p.discovered).filter((r) => masteryTier(r) >= 3).length;
    const tested = Object.values(p.pairs).length;
    wrap.append(
      h('div', { class: 'stat-grid' },
        h('div', null, 'Mastery level', h('b', null, p.level)),
        h('div', null, 'Discovered', h('b', null, `${known}/${total}`)),
        h('div', null, 'Fully mastered', h('b', null, mastered)),
        h('div', null, 'Pairs tested', h('b', null, tested)),
        h('div', null, 'Runs / wins', h('b', null, `${p.stats.runs} / ${p.stats.wins}`)),
        h('div', null, 'Total reactions', h('b', null, p.stats.reactions)),
      ),
      h('div', { class: 'card small' }, nl ? `Next level at ${nl.xp} XP (you have ${p.xp}): ${nl.reward}` : 'You have reached the highest mastery level.'),
      h('div', { class: 'card' }, h('h3', null, 'Collection milestones'),
        ...[5, 10, 20, total].map((n) => h('div', { class: `feat ${known >= n ? 'got' : 'not'}` }, `${known >= n ? '✓' : '○'} Discover ${n === total ? 'every' : n} reaction${n > 1 ? 's' : ''}`)),
        ...Content.lists.CORES.map((c) => h('div', { class: `feat ${p.trophies.includes(`boss:warden:${c.id}`) ? 'got' : 'not'}` }, `${p.trophies.includes(`boss:warden:${c.id}`) ? '✓' : '○'} Defeat the Crucible Warden with the ${c.name}`)),
      ),
    );
  };

  render();
}

function physLabel(k: string, v: number): string {
  switch (k) {
    case 'massMul': return `${v > 1 ? 'heavier' : 'lighter'} (×${v})`;
    case 'dragMul': return v < 1 ? 'glides further' : 'more drag';
    case 'restitutionAdd': return v > 0 ? 'bouncier' : 'less bouncy';
    case 'maxSpeedMul': return 'faster top speed';
    case 'launchMul': return v > 1 ? 'stronger launches' : 'weaker launches';
    case 'impactDamageMul': return `impact damage ×${v}`;
    default: return k;
  }
}
