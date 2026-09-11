// src/lib/voxel-field.ts — runtime for <VoxelField>: a 2-D simplex field
// (Ashima port) posterised into ink-alpha bands and drawn as a coarse grid of
// "voxels", CSS-upscaled with image-rendering:pixelated so the bands read as
// chunky device pixels. Stepped time at a few fps (matches AsciiAnim),
// IntersectionObserver pause, theme-reactive ink via the canvas's computed
// `color`, static single frame under reduced-motion.
//
// Every tunable lives in PARAMS. The debug panel (./voxel-debug.ts — dev
// builds or ?debug in the URL, backtick toggles it) edits the same object and
// its "Copy" button hands back a DEFAULTS literal to paste over the one below.

export interface VoxelParams {
  size: number;       // CSS px per voxel
  gap: number;        // CSS px between voxels — 0 = touching (XX), 2 = X X
  levels: number;     // posterisation bands
  alpha: number;      // strongest band's opacity — must stay subtle behind text
  curve: number;      // band → alpha exponent: >1 crisp cores, faint rings
  scale: number;      // noise-space units per voxel (lower = larger blobs)
  drift: number;      // time advance per tick
  fps: number;        // ticks per second
  falloff: boolean;   // fade the field out towards the top-left corner
  invert: boolean;    // false: ink islands on paper · true: paper islands in ink
  customInk: boolean; // paint with `ink` instead of the theme's --ink
  ink: string;        // hex colour used when customInk is on
  paused: boolean;
}

export const DEFAULTS: Readonly<VoxelParams> = {
  size: 10,
  gap: 0,
  levels: 5,
  alpha: 0.12,
  curve: 1.5,
  scale: 0.03,
  drift: 0.016,
  fps: 10,
  falloff: true,
  invert: false,
  customInk: false,
  ink: '#111111',
  paused: false,
};

export const PARAMS: VoxelParams = { ...DEFAULTS };

export type RefreshKind = 'grid' | 'paint' | 'clock';
export interface VoxelController {
  params: VoxelParams;
  defaults: Readonly<VoxelParams>;
  /** grid: size/gap changed · paint: colour/noise changed · clock: fps/pause changed */
  refresh(kind: RefreshKind): void;
}

const REDUCED_MQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const instances: Record<RefreshKind, () => void>[] = [];

function mod289(x: number): number { return x - Math.floor(x * (1 / 289)) * 289; }
function permute(x: number): number { return mod289((x * 34 + 1) * x); }
function fract(x: number): number { return x - Math.floor(x); }
function gcd(a: number, b: number): number { while (b) [a, b] = [b, a % b]; return a; }

// Direct port of Ashima's GLSL snoise(vec2), scalarised.
function snoise(vx: number, vy: number): number {
  const Cx = 0.211324865405187, Cy = 0.366025403784439,
        Cz = -0.577350269189626, Cw = 0.024390243902439;
  const s = (vx + vy) * Cy;
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s);
  const t = (ix + iy) * Cx;
  const x0x = vx - ix + t, x0y = vy - iy + t;
  const i1x = x0x > x0y ? 1 : 0, i1y = 1 - i1x;
  const x1x = x0x + Cx - i1x, x1y = x0y + Cx - i1y;
  const x2x = x0x + Cz, x2y = x0y + Cz;
  ix = mod289(ix); iy = mod289(iy);
  const p0 = permute(permute(iy) + ix);
  const p1 = permute(permute(iy + i1y) + ix + i1x);
  const p2 = permute(permute(iy + 1) + ix + 1);
  const corner = (p: number, dx: number, dy: number): number => {
    let m = Math.max(0.5 - (dx * dx + dy * dy), 0);
    m *= m; m *= m;
    const x = 2 * fract(p * Cw) - 1;
    const h = Math.abs(x) - 0.5;
    const a0 = x - Math.floor(x + 0.5);
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    return m * (a0 * dx + h * dy);
  };
  return 130 * (corner(p0, x0x, x0y) + corner(p1, x1x, x1y) + corner(p2, x2x, x2y));
}

// GLSL level(): how many of the band thresholds sit at/above source.
function level(source: number, levels: number): number {
  let val = 0;
  for (let i = 0; i < levels; i++) if (i / levels >= source) val++;
  return val / levels;
}

function boot(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // grid geometry, in canvas px: one canvas px = `unit` CSS px, where unit is
  // the largest size that tiles both the voxel and the gap exactly. With
  // gap 0 that is one canvas px per voxel — the cheapest path.
  let cols = 0, rows = 0, cellU = 1, sizeU = 1, width = 0;
  let img: ImageData | null = null;
  let inkR = 0, inkG = 0, inkB = 0;
  let time = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let inView = false;

  function readInk() {
    const src = PARAMS.customInk ? PARAMS.ink : getComputedStyle(canvas).color;
    const hex = src.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      inkR = n >> 16; inkG = (n >> 8) & 255; inkB = n & 255;
      return;
    }
    const m = src.match(/[\d.]+/g);
    if (m && m.length >= 3) { inkR = +m[0]; inkG = +m[1]; inkB = +m[2]; }
  }

  function draw() {
    if (!img || !ctx) return;
    const { levels, alpha, curve, scale, falloff, invert } = PARAMS;
    const d = img.data;
    d.fill(0);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const nx = gx * scale, ny = gy * scale;
        const t = snoise(nx, ny) + snoise(nx + time, ny + time);
        const l = falloff ? Math.hypot(gx / cols, gy / rows) : 1;
        // default is inverted vs the shader: ink islands on clean paper
        // (level()'s val=1 plateau covers ~half the area — as ink it reads as mud)
        const q = level(t * l, levels);
        const band = invert ? q : 1 - q;
        const a = Math.round(Math.pow(band, curve) * alpha * 255);
        if (a === 0) continue;
        // paint the voxel's sizeU×sizeU block inside its cellU×cellU cell
        const x0 = gx * cellU, y0 = gy * cellU;
        for (let j = 0; j < sizeU; j++) {
          let k = ((y0 + j) * width + x0) * 4;
          for (let i = 0; i < sizeU; i++) { d[k++] = inkR; d[k++] = inkG; d[k++] = inkB; d[k++] = a; }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function grid() {
    if (!ctx) return;
    const size = Math.max(1, Math.round(PARAMS.size));
    const gap = Math.max(0, Math.round(PARAMS.gap));
    const cell = size + gap;
    const unit = gap > 0 ? gcd(size, gap) : size;
    cellU = cell / unit;
    sizeU = size / unit;
    cols = Math.max(1, Math.ceil(canvas.clientWidth / cell));
    rows = Math.max(1, Math.ceil(canvas.clientHeight / cell));
    width = cols * cellU;
    canvas.width = width;
    canvas.height = rows * cellU;
    img = ctx.createImageData(width, rows * cellU);
    draw();
  }

  function paint() { readInk(); draw(); }

  function start() {
    if (interval || REDUCED_MQ.matches || !inView || PARAMS.paused) return;
    interval = setInterval(() => { time += PARAMS.drift; draw(); }, 1000 / PARAMS.fps);
  }
  function stop() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
  }
  function clock() { stop(); start(); }

  readInk();
  grid();

  new ResizeObserver(grid).observe(canvas);
  new MutationObserver(paint)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      inView = e.isIntersecting;
      if (inView) start(); else stop();
    });
  }, { threshold: 0.05 }).observe(canvas);

  // react to a mid-session OS reduce-motion toggle (static frame stays drawn)
  REDUCED_MQ.addEventListener('change', () => {
    if (REDUCED_MQ.matches) stop(); else start();
  });

  instances.push({ grid, paint, clock });
}

export const voxelField: VoxelController = {
  params: PARAMS,
  defaults: DEFAULTS,
  refresh(kind) { for (const i of instances) i[kind](); },
};

export function mountAll() {
  const run = () => {
    document.querySelectorAll<HTMLCanvasElement>('canvas.voxel-field').forEach(boot);
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
      import('./voxel-debug').then((m) => m.mount(voxelField));
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
