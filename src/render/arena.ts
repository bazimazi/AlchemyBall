import type { RegionDef } from '../content/types';
import { PHYS } from '../sim/ballPhysics';
import { circle, polygon } from './art';

type Context = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const { arenaW: W, arenaH: H } = PHYS;

function octagon(c: Context, inset: number): void {
  const cut = 39 + inset * 0.42;
  c.beginPath();
  c.moveTo(cut, inset);
  c.lineTo(W - cut, inset);
  c.lineTo(W - inset, cut);
  c.lineTo(W - inset, H - cut);
  c.lineTo(W - cut, H - inset);
  c.lineTo(cut, H - inset);
  c.lineTo(inset, H - cut);
  c.lineTo(inset, cut);
  c.closePath();
}

function engraveDial(c: Context, x: number, y: number, r: number, metal: string, light: string): void {
  c.save();
  c.translate(x, y);
  c.lineWidth = 1.5;
  c.strokeStyle = metal + '46';
  for (const ratio of [1, 0.88, 0.7, 0.24]) {
    circle(c, 0, 0, r * ratio);
    c.stroke();
  }
  c.strokeStyle = light + '26';
  polygon(c, 0, 0, r * 0.87, 4, 0);
  c.stroke();
  polygon(c, 0, 0, r * 0.7, 4, Math.PI / 4);
  c.stroke();
  c.beginPath();
  for (let i = 0; i < 72; i++) {
    const a = i * TAU / 72;
    const inner = i % 6 === 0 ? 0.9 : 0.955;
    c.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.stroke();
  c.fillStyle = metal + '66';
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    polygon(c, Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, r * 0.025, 4, a);
    c.fill();
  }
  c.restore();
}

/** Baked floor with region-specific materials. The playfield and its edge remain clear at small sizes. */
export function paintArena(c: Context, palette: RegionDef['palette'], region: string, highContrast: boolean): void {
  const frost = region === 'frostvein';
  const storm = region === 'storm_spire';
  const metal = frost ? '#87b8d1' : storm ? '#c8a2ae' : '#aa8c62';
  const strata = frost ? '#759cb1' : storm ? '#9277b1' : '#698887';
  const tileW = storm ? 120 : frost ? 132 : 98;
  const tileH = storm ? 94 : frost ? 114 : 76;
  let seed = 54217;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  c.save();
  octagon(c, 0);
  c.clip();
  c.fillStyle = highContrast ? '#111923' : palette.floor;
  c.fillRect(0, 0, W, H);

  c.globalAlpha = highContrast ? 0.32 : 1;
  for (let row = 0; row * tileH < H; row++) {
    const y = row * tileH;
    for (let col = -1; col * tileW < W; col++) {
      const x = col * tileW + (storm ? 0 : row % 2 * tileW / 2);
      const k = random();
      c.fillStyle = strata + (k > 0.62 ? '1a' : k > 0.28 ? '0d' : '06');
      c.fillRect(x + 2, y + 2, tileW - 4, tileH - 4);
      c.strokeStyle = '#050b124f';
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);
      c.strokeStyle = strata + '26';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 4, y + tileH - 5);
      c.lineTo(x + 4, y + 4);
      c.lineTo(x + tileW - 5, y + 4);
      c.stroke();
      c.strokeStyle = strata + (frost ? '36' : '22');
      if (storm) {
        c.strokeStyle = metal + '36';
        c.beginPath();
        c.moveTo(x + 8, y + 18);
        c.lineTo(x + 32, y + 18);
        c.lineTo(x + 47, y + 33);
        c.lineTo(x + tileW - 15, y + 33);
        c.stroke();
        c.fillStyle = metal + '58';
        circle(c, x + tileW - 15, y + 33, 2.5);
        c.fill();
      } else if (k > 0.48) {
        c.beginPath();
        c.moveTo(x + tileW * k, y + 3);
        c.lineTo(x + tileW * k - 14, y + tileH * 0.34);
        c.lineTo(x + tileW * k - 10, y + tileH * 0.42);
        c.lineTo(x + tileW * k - 28, y + tileH * 0.59);
        c.moveTo(x + tileW * k - 14, y + tileH * 0.34);
        c.lineTo(x + tileW * k - 34, y + tileH * 0.45);
        c.stroke();
      }
    }
  }
  for (let i = 0; i < 6000; i++) {
    const x = random() * W;
    const y = random() * H;
    const r = random();
    c.fillStyle = i % 3 === 0 ? '#01050a44' : strata + (r > 0.94 ? '40' : '1b');
    c.fillRect(x, y, 0.8 + r * 2.2, 0.65 + r);
  }
  c.globalAlpha = 1;

  const light = c.createRadialGradient(W * 0.48, H * 0.47, 30, W / 2, H / 2, H * 0.66);
  light.addColorStop(0, palette.light + '14');
  light.addColorStop(0.54, '#09121f09');
  light.addColorStop(1, '#01050add');
  c.fillStyle = light;
  c.fillRect(0, 0, W, H);

  // Perimeter inlay and lap joints. Regional colour stays concentrated outside the shot lanes.
  for (const inset of [16, 34, 47]) {
    octagon(c, inset);
    c.lineWidth = inset === 16 ? 15 : 1.4;
    c.strokeStyle = inset === 16 ? '#060e17ae' : metal + '53';
    c.stroke();
  }
  c.lineWidth = 1.5;
  for (let y = 66; y < H - 50; y += 52) {
    for (const x of [34, W - 34]) {
      c.fillStyle = '#080d14';
      circle(c, x, y, 4.5);
      c.fill();
      c.fillStyle = metal + '9c';
      polygon(c, x, y, 2.5, 4, 0);
      c.fill();
    }
  }

  c.globalAlpha = highContrast ? 0.45 : 1;
  engraveDial(c, W / 2, H / 2, 192, metal, palette.light);
  for (const y of [104, H - 104]) engraveDial(c, W / 2, y, 40, metal, palette.light);

  for (const x of [34, W - 34]) {
    for (const y of [78, H - 78]) {
      const bloom = c.createRadialGradient(x, y, 4, x, y, 160);
      bloom.addColorStop(0, palette.accent + '40');
      bloom.addColorStop(0.25, palette.light + '20');
      bloom.addColorStop(1, palette.light + '00');
      c.fillStyle = bloom;
      c.fillRect(x - 160, y - 160, 320, 320);
      c.fillStyle = '#09131d';
      c.strokeStyle = metal + 'b0';
      polygon(c, x, y, 19, 6, 0);
      c.fill();
      c.stroke();
      c.fillStyle = palette.accent + 'be';
      polygon(c, x, y, 8, frost ? 4 : 6, 0);
      c.fill();
      c.fillStyle = '#fff5dbbf';
      circle(c, x, y, 2.6);
      c.fill();
    }
  }
  c.restore();
}
