// src/lib/voxel-debug.ts — lil-gui tuning panel for the voxel backdrop.
// Loaded (dynamic import) only in dev builds or with ?debug in the URL, so it
// never ships in the normal bundle. Values persist in localStorage under the
// same gate so they survive page loads while tuning. "Copy" puts a DEFAULTS
// literal on the clipboard to paste over the one in voxel-field.ts.
// Backtick (`) shows/hides the panel.
import GUI from 'lil-gui';
import type { RefreshKind, VoxelController, VoxelParams } from './voxel-field';

const STORAGE_KEY = 'voxel-debug';
const HIDDEN_KEY = 'voxel-debug-hidden';

export function mount(ctl: VoxelController) {
  const P = ctl.params;
  try {
    Object.assign(P, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  const refreshAll = () => { ctl.refresh('grid'); ctl.refresh('paint'); ctl.refresh('clock'); };
  refreshAll();

  const gui = new GUI({ title: 'voxel field  (` to hide)', width: 300 });
  gui.domElement.style.cssText += 'top:auto;bottom:0;';
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(P));
  const on = (kind: RefreshKind) => () => { ctl.refresh(kind); save(); };

  const grid = gui.addFolder('grid');
  grid.add(P, 'size', 1, 40, 1).name('pixel size').onChange(on('grid'));
  grid.add(P, 'gap', 0, 20, 1).name('pixel gap').onChange(on('grid'));
  grid.add(P, 'scale', 0.005, 0.2, 0.001).name('noise scale').onChange(on('paint'));
  grid.add(P, 'falloff').name('corner falloff').onChange(on('paint'));

  const colour = gui.addFolder('colour');
  colour.add(P, 'levels', 1, 12, 1).name('bands').onChange(on('paint'));
  colour.add(P, 'alpha', 0, 1, 0.01).name('max alpha').onChange(on('paint'));
  colour.add(P, 'curve', 0.1, 4, 0.05).name('alpha curve').onChange(on('paint'));
  colour.add(P, 'invert').name('invert').onChange(on('paint'));
  colour.add(P, 'customInk').name('custom ink').onChange(on('paint'));
  colour.addColor(P, 'ink').name('ink').onChange(on('paint'));

  const motion = gui.addFolder('motion');
  motion.add(P, 'drift', 0, 0.1, 0.001).name('drift / tick').onChange(save);
  motion.add(P, 'fps', 1, 60, 1).name('fps').onChange(on('clock'));
  motion.add(P, 'paused').name('paused').onChange(on('clock'));

  const actions = {
    Reset() {
      Object.assign(P, ctl.defaults);
      localStorage.removeItem(STORAGE_KEY);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      refreshAll();
    },
    Copy() {
      const keys = Object.keys(ctl.defaults) as (keyof VoxelParams)[];
      const body = keys.filter((k) => k !== 'paused')
        .map((k) => `  ${k}: ${JSON.stringify(P[k])},`).join('\n');
      navigator.clipboard?.writeText(`export const DEFAULTS: Readonly<VoxelParams> = {\n${body}\n  paused: false,\n};`);
    },
  };
  gui.add(actions, 'Reset');
  gui.add(actions, 'Copy');

  // hidden state persists too, so a dev server doesn't force the panel on you
  let shown = localStorage.getItem(HIDDEN_KEY) === null;
  gui.show(shown);
  addEventListener('keydown', (e) => {
    if (e.key !== '`' || (e.target as HTMLElement).matches('input, textarea')) return;
    shown = !shown;
    gui.show(shown);
    if (shown) localStorage.removeItem(HIDDEN_KEY); else localStorage.setItem(HIDDEN_KEY, '1');
  });
}
