import * as THREE from 'three';
import { hashString, seeded } from '../utils/math';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return { c, g };
}

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipMapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export interface FacadeOptions {
  color: string;
  floors: number;
  cols: number;
  style?: 'deco' | 'motel' | 'industrial' | 'shop' | 'plain';
  night?: boolean;
  seed?: string;
}

/** Procedural building facade: pastel wall with a window grid, optional deco banding. */
export function facadeTexture(o: FacadeOptions): THREE.Texture {
  const key = 'facade:' + JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 64 * o.cols;
  const H = 64 * o.floors;
  const { c, g } = canvas(Math.max(64, W), Math.max(64, H));
  const rnd = seeded(hashString(o.seed ?? key));
  g.fillStyle = o.color;
  g.fillRect(0, 0, c.width, c.height);
  // subtle grime / noise
  for (let i = 0; i < c.width * c.height * 0.002; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  const style = o.style ?? 'plain';
  for (let f = 0; f < o.floors; f++) {
    const y0 = c.height - (f + 1) * 64;
    if (style === 'deco' || style === 'motel') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, y0 + 60, c.width, 3);
    }
    if (style === 'industrial') {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y0 + 58, c.width, 6);
    }
    for (let col = 0; col < o.cols; col++) {
      const x0 = col * 64;
      const isDoorFloor = f === 0 && style === 'shop';
      const wx = x0 + 14;
      const wy = y0 + (isDoorFloor ? 6 : 14);
      const ww = 36;
      const wh = isDoorFloor ? 52 : 34;
      if (style === 'industrial' && f > 0 && rnd() < 0.4) continue;
      // frame
      g.fillStyle = style === 'motel' ? '#3a3a44' : '#26262e';
      g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      // glass
      const lit = o.night && rnd() < 0.55;
      if (lit) {
        const warm = rnd() < 0.7;
        g.fillStyle = warm ? '#ffd27a' : '#9be3ff';
      } else {
        g.fillStyle = o.night ? '#101522' : '#5f7d99';
      }
      g.fillRect(wx, wy, ww, wh);
      if (!o.night) {
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(wx, wy, ww * 0.4, wh);
      }
      // mullion
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      if (!isDoorFloor) g.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      if (style === 'motel') {
        // door next to window
        g.fillStyle = '#7fd7d0';
        g.fillRect(x0 + 52, y0 + 20, 10, 42);
      }
    }
  }
  if (style === 'deco') {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) g.fillRect(0, i * 4, c.width, 2);
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Neon / painted sign texture. */
export function signTexture(text: string, opts: { color: string; bg?: string; glow?: boolean; font?: string; sub?: string } = { color: '#ff4fd8' }): THREE.Texture {
  const key = 'sign:' + text + JSON.stringify(opts);
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(512, 128);
  g.fillStyle = opts.bg ?? 'rgba(20,10,30,1)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = opts.font ?? 'bold 64px Impact, "Arial Black", sans-serif';
  if (opts.glow !== false) {
    g.shadowColor = opts.color;
    g.shadowBlur = 24;
  }
  g.fillStyle = opts.color;
  g.fillText(text, c.width / 2, opts.sub ? 48 : 64, c.width - 40);
  if (opts.sub) {
    g.font = '28px "Arial Narrow", Arial, sans-serif';
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillText(opts.sub, c.width / 2, 100, c.width - 40);
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function asphaltTexture(): THREE.Texture {
  const key = 'asphalt';
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(256, 256);
  const rnd = seeded(7);
  g.fillStyle = '#3f3f46';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? 20 : 90},${rnd() < 0.5 ? 20 : 90},${rnd() < 0.5 ? 24 : 96},${0.15 + rnd() * 0.2})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  const t = finish(c, 80, 80);
  cache.set(key, t);
  return t;
}

export function sidewalkTexture(): THREE.Texture {
  const key = 'sidewalk';
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#c9c1b3';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  const t = finish(c, 1, 1);
  cache.set(key, t);
  return t;
}

export function sandTexture(): THREE.Texture {
  const key = 'sand';
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(128, 128);
  const rnd = seeded(11);
  g.fillStyle = '#efdcb0';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(160,130,80,${rnd() * 0.25})`;
    g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
  }
  const t = finish(c, 20, 20);
  cache.set(key, t);
  return t;
}

export function grassTexture(): THREE.Texture {
  const key = 'grass';
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(128, 128);
  const rnd = seeded(13);
  g.fillStyle = '#6fa65a';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 800; i++) {
    g.fillStyle = `rgba(${40 + rnd() * 40},${110 + rnd() * 60},40,${rnd() * 0.4})`;
    g.fillRect(rnd() * 128, rnd() * 128, 2, 3);
  }
  const t = finish(c, 10, 10);
  cache.set(key, t);
  return t;
}

export function containerTexture(color: string): THREE.Texture {
  const key = 'container:' + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(256, 128);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x, 0, 4, 128);
  }
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = 'bold 26px Arial';
  g.fillText('SOL PALMA PORT', 20, 40);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function speechTexture(text: string, color = '#ffffff'): THREE.Texture {
  const { c, g } = canvas(512, 160);
  g.clearRect(0, 0, 512, 160);
  const w = Math.min(500, Math.max(160, text.length * 20 + 40));
  const x0 = (512 - w) / 2;
  g.fillStyle = 'rgba(15,10,25,0.9)';
  g.strokeStyle = color;
  g.lineWidth = 6;
  roundRect(g, x0, 10, w, 110, 22);
  g.fill();
  g.stroke();
  // tail
  g.beginPath();
  g.moveTo(236, 118);
  g.lineTo(276, 118);
  g.lineTo(256, 150);
  g.closePath();
  g.fillStyle = 'rgba(15,10,25,0.9)';
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 34px Arial, sans-serif';
  g.fillText(text, 256, 66, w - 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function labelTexture(text: string, color = '#ffe9a8'): THREE.Texture {
  const key = 'label:' + text + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(512, 96);
  g.clearRect(0, 0, 512, 96);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 44px Arial, sans-serif';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 256, 48, 490);
  g.fillStyle = color;
  g.fillText(text, 256, 48, 490);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
