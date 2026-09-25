import { describe, expect, it } from 'vitest';
import { createSaveSlot, freshProfile, SAVE_KEY, SAVE_VERSION } from '../src/game/profile';
import { checksum, MemoryStore } from '../src/game/save';

describe('save system', () => {
  it('round-trips a profile', () => {
    const store = new MemoryStore();
    const slot = createSaveSlot(store);
    const p = freshProfile();
    p.essence = 123;
    p.discovered.steam_burst = { at: 1, count: 3, feats: ['enemy'] };
    slot.save(p);
    const back = createSaveSlot(store).load();
    expect(back.essence).toBe(123);
    expect(back.discovered.steam_burst.count).toBe(3);
  });

  it('falls back to the backup when the main copy is corrupt', () => {
    const store = new MemoryStore();
    const slot = createSaveSlot(store);
    const p = freshProfile();
    p.essence = 10;
    slot.save(p);
    p.essence = 20;
    slot.save(p); // backup now holds essence=10
    store.setItem(SAVE_KEY, store.getItem(SAVE_KEY)!.replace('"essence":20', '"essence":99999'));
    const s2 = createSaveSlot(store);
    const back = s2.load();
    expect(s2.lastLoadSource).toBe('backup');
    expect(back.essence).toBe(10);
  });

  it('survives garbage and returns a fresh profile', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{not json');
    const slot = createSaveSlot(store);
    expect(slot.load().essence).toBe(0);
    expect(slot.lastLoadSource).toBe('fresh');
  });

  it('migrates a v1 save (discoveries list) to the current schema', () => {
    const store = new MemoryStore();
    const v1 = { essence: 5, discoveries: ['steam_burst', 'freeze', 'removed_reaction'], research: ['res_lab', 'res_gone'] };
    store.setItem(SAVE_KEY, JSON.stringify({ v: 1, sum: checksum(JSON.stringify(v1)), data: v1 }));
    const p = createSaveSlot(store).load();
    expect(p.essence).toBe(5);
    expect(Object.keys(p.discovered).sort()).toEqual(['freeze', 'steam_burst']);
    expect(p.research).toEqual(['res_lab']);
    expect(p.settings.sfxVolume).toBeGreaterThan(0);
    expect(p.pairs).toEqual({});
  });

  it('refuses saves from a newer version rather than corrupting them', () => {
    const store = new MemoryStore();
    const data = { essence: 1 };
    store.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION + 1, sum: checksum(JSON.stringify(data)), data }));
    const slot = createSaveSlot(store);
    slot.load();
    expect(slot.lastLoadSource).toBe('fresh');
    expect(slot.lastError).toMatch(/newer/);
  });
});
