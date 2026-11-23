/**
 * Cosmetics are rewards only: they never change stats. Trails change the ball's light ribbon;
 * skins change the ball's glass. `unlock` is a human-readable description of where it comes from.
 */
export interface CosmeticDef {
  id: string;
  kind: 'trail' | 'skin';
  name: string;
  description: string;
  unlock: string;
  /** Colours used by the renderer. Empty = follow the carried element. */
  colors: string[];
  /** Trail style: ribbon (default), sparks, rainbow, flame. */
  style?: 'ribbon' | 'sparks' | 'rainbow' | 'flame' | 'void';
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'trail_gilt', kind: 'trail', name: 'Gilt Rebound', description: 'Hammered gold sparks follow each shot.', unlock: 'Earn 9 Ricochet medals', colors: ['#a96336', '#ffd17b', '#ffefbb'], style: 'sparks' },
  { id: 'skin_amethyst', kind: 'skin', name: 'Amethyst Reactor', description: 'A glass vessel veined with amethyst.', unlock: 'Earn 9 Catalyst medals', colors: ['#9a7aef', '#38266f'] },
  { id: 'trail_ion', kind: 'trail', name: 'Ion Wake', description: 'A bright mint ribbon with an ivory edge.', unlock: 'Earn 9 Pursuit medals', colors: ['#63e4c7', '#cffff0'], style: 'ribbon' },
  { id: 'trail_eclipse', kind: 'trail', name: 'Eclipse Flare', description: 'Violet and mint sparks in an orbital wake.', unlock: 'Feat: Total Eclipse', colors: ['#a67fed', '#66e1b7', '#fff3e0'], style: 'sparks' },
  { id: 'skin_porcelain', kind: 'skin', name: 'Glazed Porcelain', description: 'Pale ceramic with a band of burnt copper.', unlock: 'Earn 9 Glass medals', colors: ['#fff0d7', '#b76a51'] },
  { id: 'trail_default', kind: 'trail', name: 'Elemental Ribbon', description: 'Takes the colour of whatever you carry.', unlock: 'Always available', colors: [], style: 'ribbon' },
  { id: 'trail_ember', kind: 'trail', name: 'Ember Wake', description: 'A trail of drifting embers.', unlock: 'Reach player level 5', colors: ['#ff8a3d', '#ffd27a'], style: 'flame' },
  { id: 'trail_comet', kind: 'trail', name: 'Comet Tail', description: 'A bright white-gold streak.', unlock: 'Reach player level 10', colors: ['#fff6d8', '#ffd23a'], style: 'ribbon' },
  { id: 'trail_stardust', kind: 'trail', name: 'Stardust', description: 'Glittering motes in your wake.', unlock: 'Reach player level 13', colors: ['#e6f7ff', '#c9a6ff', '#ffd23a'], style: 'sparks' },
  { id: 'trail_prismatic', kind: 'trail', name: 'Prismatic', description: 'Every colour of the codex at once.', unlock: 'Reach player level 20', colors: ['#ff6a2b', '#ffe84a', '#8fe03a', '#3aa7ff', '#c77dff'], style: 'rainbow' },
  { id: 'trail_phoenix', kind: 'trail', name: 'Phoenix Plume', description: 'Fire that refuses to die.', unlock: 'Reach player level 25', colors: ['#ff3b1f', '#ffb347', '#fff1b0'], style: 'flame' },
  { id: 'trail_frost', kind: 'trail', name: 'Rime Wake', description: 'A crystalline, frost-bitten streak.', unlock: 'Feat: Cold Case', colors: ['#bdf3ff', '#ffffff'], style: 'sparks' },
  { id: 'trail_storm', kind: 'trail', name: 'Stormline', description: 'A crackling bolt of light.', unlock: 'Feat: Eye of the Storm', colors: ['#fff27a', '#c9a6ff'], style: 'ribbon' },
  { id: 'trail_void', kind: 'trail', name: 'Umbral Smoke', description: 'Light swallowed by darkness.', unlock: 'Feat: Abyss Walker', colors: ['#2a1840', '#c77dff'], style: 'void' },
  { id: 'skin_glass', kind: 'skin', name: 'Alchemical Glass', description: 'Clear glass that shows its core.', unlock: 'Always available', colors: [] },
  { id: 'skin_brass', kind: 'skin', name: 'Brass Astrolabe', description: 'Engraved brass rings around the core.', unlock: 'Reach player level 8', colors: ['#e6b875', '#8a5a2b'] },
  { id: 'skin_obsidian', kind: 'skin', name: 'Obsidian', description: 'Volcanic glass with a molten seam.', unlock: 'Reach player level 15', colors: ['#1a1420', '#ff6a2b'] },
  { id: 'skin_aurora', kind: 'skin', name: 'Aurora', description: 'Shifting northern lights.', unlock: 'Reach player level 18', colors: ['#5ef2c2', '#7f6bff'] },
  { id: 'skin_void', kind: 'skin', name: 'Void Pearl', description: 'A pearl of folded night.', unlock: 'Reach player level 23', colors: ['#0b0614', '#c77dff'] },
  { id: 'skin_crystal', kind: 'skin', name: 'Living Crystal', description: 'Faceted, singing crystal.', unlock: 'Feat: Shatterpoint', colors: ['#c5a3ff', '#bdf3ff'] },
  { id: 'skin_gilded', kind: 'skin', name: 'Gilded Core', description: 'Pure alchemical gold.', unlock: 'Reach core level 10 with any core', colors: ['#ffd23a', '#a8741a'] },
];
