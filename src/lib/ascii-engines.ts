// @ts-nocheck — engine factory bodies are verified, pasted-verbatim plain JS
// (untyped inner closures by design). The public surface below is fully typed.
// ascii-engines.ts
// Shared ASCII animation engines, one per project slug.
// Each factory is (cols, rows) => AsciiEngine; tick(t) returns a `rows`-line
// string where every line is exactly `cols` characters wide. Used to render
// per-project ASCII intros (first frame static, animated client-side).

export interface AsciiEngine {
  tick(t: number): string;
}

export type AsciiEngineFactory = (cols: number, rows: number) => AsciiEngine;

export const engines: Record<string, AsciiEngineFactory> = {
  'automaton-qts': (cols, rows) => {
    const rnd = (s) => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const COLS_G = Math.max(3, Math.min(5, Math.round(cols / 8)));
    const nodes = [];
    const big = rows >= 8;
    for (let c = 0; c < COLS_G; c++) {
      const rowsHere = (c === 0) ? 1 : (big ? 2 + Math.round(rnd(c + 11)) : 1 + Math.round(rnd(c + 11) + 0.4));
      const cx = Math.round((c + 0.6) / COLS_G * (cols - 2) + 1);
      for (let r = 0; r < rowsHere; r++) {
        const fy = rowsHere === 1 ? 0.5 : 0.12 + 0.76 * (r / (rowsHere - 1));
        const y = Math.max(0, Math.min(rows - 1, Math.round(fy * (rows - 1) + (rnd(c * 7 + r) - 0.5) * 1.0)));
        const x = Math.max(1, Math.min(cols - 2, cx + Math.round((rnd(c * 3 + r + 5) - 0.5) * 1.6)));
        nodes.push({ x, y, col: c });
      }
    }
    const N = nodes.length;
    const edges = [];
    for (let i = 0; i < N; i++) {
      let cands = [];
      for (let j = 0; j < N; j++) if (nodes[j].col === nodes[i].col + 1) {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        cands.push({ j, d: dx * dx + dy * dy });
      }
      cands.sort((a, b) => a.d - b.d);
      const k = (rnd(i + 3) > 0.55 && cands.length > 1) ? 2 : 1;
      for (let c = 0; c < Math.min(k, cands.length); c++) edges.push([i, cands[c].j]);
    }
    const src = 0;
    const adj = nodes.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    const depth = nodes.map(() => Infinity);
    depth[src] = 0;
    let frontier = [src];
    while (frontier.length) {
      const next = [];
      for (const u of frontier) for (const v of adj[u]) if (depth[v] === Infinity) { depth[v] = depth[u] + 1; next.push(v); }
      frontier = next;
    }
    let maxDepth = 0;
    for (const d of depth) if (isFinite(d) && d > maxDepth) maxDepth = d;
    const STEP = 4;
    const PERIOD = (maxDepth + 3) * STEP;
    const nodeGlyph = (lvl) => lvl <= 0 ? '.' : lvl < 0.45 ? 'o' : lvl < 0.8 ? 'O' : '@';
    return {
      tick(t) {
        const phase = t % PERIOD;
        const wave = phase / STEP;
        const g = [];
        for (let y = 0; y < rows; y++) g.push(new Array(cols).fill(' '));
        const put = (x, y, ch, over) => {
          if (x < 0 || x >= cols || y < 0 || y >= rows) return;
          if (over || g[y][x] === ' ') g[y][x] = ch;
        };
        for (const [a, b] of edges) {
          const na = nodes[a], nb = nodes[b];
          const da = depth[a], db = depth[b];
          const lo = Math.min(da, db), hi = Math.max(da, db);
          const hot = wave > lo + 0.05 && wave < hi + 1.1;
          const steps = Math.max(Math.abs(nb.x - na.x), Math.abs(nb.y - na.y));
          for (let s = 1; s < steps; s++) {
            const fx = s / steps;
            const x = Math.round(na.x + (nb.x - na.x) * fx);
            const y = Math.round(na.y + (nb.y - na.y) * fx);
            const dxs = Math.sign(nb.x - na.x), dys = Math.sign(nb.y - na.y);
            let ch;
            if (dys === 0) ch = '-';
            else if (dxs === 0) ch = '|';
            else if (dxs === dys) ch = '\\';
            else ch = '/';
            put(x, y, hot ? '=' : ch, false);
          }
        }
        for (let i = 0; i < N; i++) {
          const n = nodes[i];
          const d = depth[i];
          let lvl;
          if (!isFinite(d)) lvl = 0.15;
          else {
            const since = wave - d;
            if (since < -0.1) lvl = 0;
            else lvl = Math.max(0.25, 1 - since * 0.28);
          }
          if (i === src) lvl = 0.6 + 0.4 * Math.abs(Math.sin(phase * 0.5));
          put(n.x, n.y, nodeGlyph(lvl), true);
        }
        return g.map((r) => r.join('')).join('\n');
      }
    };
  },
  'ca-accelerator': (cols, rows) => {
    const W = cols;
    let gens = [new Uint8Array(W)];
    gens[0][W >> 1] = 1;
    const step = (prev) => {
      const next = new Uint8Array(W);
      for (let x = 0; x < W; x++) {
        const l = prev[(x - 1 + W) % W];
        const c = prev[x];
        const r = prev[(x + 1) % W];
        next[x] = (l ^ (c | r)) & 1;
      }
      return next;
    };
    const rowAt = (g) => {
      while (g >= gens.length) gens.push(step(gens[gens.length - 1]));
      return gens[g];
    };
    return {
      tick(t) {
        const bottom = t;
        const top = bottom - rows + 1;
        const lines = [];
        for (let r = 0; r < rows; r++) {
          const g = top + r;
          if (g < 0) {
            lines.push(' '.repeat(W));
            continue;
          }
          const row = rowAt(g);
          let s = '';
          for (let x = 0; x < W; x++) s += row[x] ? '#' : ' ';
          lines.push(s);
        }
        return lines.join('\n');
      }
    };
  },
  'stump-cpu': (cols, rows) => {
    const blank = (n) => ' '.repeat(Math.max(0, n));
    const fit = (s) => {
      const a = [...s];
      if (a.length > cols) return a.slice(0, cols).join('');
      return s + blank(cols - a.length);
    };
    const wide = cols >= 30;
    const names = wide ? ['IF', 'ID', 'EX', 'ME', 'WB'] : ['F', 'D', 'X', 'M', 'W'];
    const n = 5;
    const sep = wide ? '-' : '';
    const toks = '#@*%&+';
    let strip = '';
    const seat = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) strip += sep;
      const open = strip.length;
      strip += '[' + names[i] + ']';
      seat.push(open + 1);
    }
    const stripArr0 = [...strip];
    const stripW = stripArr0.length;
    const pad = Math.max(0, Math.floor((cols - stripW) / 2));
    return {
      tick(t) {
        const out = [];
        const showClock = rows >= 6;
        const showArrows = rows >= 8;
        const showBus = rows >= 5;
        if (showClock) {
          let clk = '';
          for (let c = 0; c < cols; c++) clk += (((c - t) % 4 + 4) % 4 < 2) ? '_' : '-';
          out.push(clk);
        }
        const lane = new Array(stripW).fill(' ');
        for (let k = t - (n - 1); k <= t; k++) {
          const stage = t - k;
          if (stage < 0 || stage >= n) continue;
          const ch = toks[((k % toks.length) + toks.length) % toks.length];
          const col = seat[stage];
          lane[col] = ch;
          if (wide) lane[col + 1] = ch;
        }
        const laneLine = blank(pad) + lane.join('') + blank(Math.max(0, cols - pad - stripW));
        if (showArrows) {
          const ar = new Array(stripW).fill(' ');
          for (let i = 0; i < stripW; i++) {
            if (stripArr0[i] === sep && wide) ar[i] = (((i + t) % 2) === 0) ? '>' : '-';
          }
          out.push(blank(pad) + ar.join('') + blank(Math.max(0, cols - pad - stripW)));
        }
        out.push(laneLine);
        out.push(blank(pad) + strip + blank(Math.max(0, cols - pad - stripW)));
        if (showBus) {
          const bus = new Array(cols).fill(' ');
          for (let i = 0; i < stripW; i++) {
            const c = pad + i;
            if (c < 0 || c >= cols) continue;
            if (stripArr0[i] === '[' || stripArr0[i] === ']') bus[c] = '+';
            else if (((i + t) % 2) === 0) bus[c] = '-';
          }
          out.push(bus.join(''));
        }
        const lvl = ['.', ':', '|', '#'];
        const bars = (idx) => lvl[(Math.floor(t / 2) + idx * 2) % 4];
        let rf;
        if (cols >= 18) {
          const slots = wide ? 8 : 4;
          let s = 'RF ';
          for (let i = 0; i < slots; i++) {
            const add = 'r' + i + bars(i) + ' ';
            if ([...s].length + [...add].length - 1 > cols) break;
            s += add;
          }
          rf = fit(s);
        } else {
          let s = 'RF ';
          for (let i = 0; i < 8 && [...s].length < cols; i++) s += bars(i);
          rf = fit(s);
        }
        out.push(rf);
        while (out.length < rows) {
          const idx = out.length;
          const fl = new Array(cols).fill(' ');
          for (let c = 0; c < cols; c++) if (((c + t * 2 + idx) % 9) === 0) fl[c] = '.';
          out.push(fl.join(''));
        }
        return out.slice(0, rows).map(fit).join('\n');
      }
    };
  },
  'multicore': (cols, rows) => {
    // barrier sits ~66% across, leaving room for a visible release sweep
    const barX = Math.max(3, Math.min(cols - 3, Math.round(cols * 0.66)));
    const APPROACH = 26;   // frames spent advancing toward the barrier
    const HOLD = 5;        // frames all gathered at the barrier (sync point)
    const RELEASE = 11;    // frames sweeping past the barrier together
    const PERIOD = APPROACH + HOLD + RELEASE;
    const speeds = [];
    const phases = [];
    for (let r = 0; r < rows; r++) {
      // distinct per-lane rate + stagger so they reach the barrier at different times
      speeds.push(0.45 + 0.55 * (((r * 7 + 2) % 5) / 4));
      phases.push((r * 5) % 7);
    }
    const lead = barX - 1;      // marker rests just left of barrier when gathered
    const tail = cols - 1;      // far right edge for the release sweep
    return {
      tick(t) {
        const p = ((t % PERIOD) + PERIOD) % PERIOD;
        const lines = [];
        for (let r = 0; r < rows; r++) {
          const row = new Array(cols).fill(' ');
          for (let x = 0; x < barX; x++) row[x] = '·';
          row[barX] = '│';
          for (let x = barX + 1; x < cols; x++) row[x] = ' ';
          let pos, glyph = '›', trailFrom = -1;
          if (p < APPROACH) {
            // advance from left toward the barrier at lane-specific pace, then wait
            const adv = (p + phases[r]) * speeds[r] * 0.9;
            pos = 1 + Math.floor(adv);
            if (pos >= lead) pos = lead;
          } else if (p < APPROACH + HOLD) {
            // all lanes gathered at the barrier — the synchronization moment
            pos = lead;
            glyph = '▸';
          } else {
            // release: every lane crosses and sweeps right together (in lockstep)
            const k = p - (APPROACH + HOLD);
            const span = tail - barX;
            pos = barX + 1 + Math.round(k * span / (RELEASE - 1));
            if (pos > tail) pos = tail;
            trailFrom = barX + 1;
          }
          if (trailFrom >= 0) {
            for (let x = trailFrom; x < pos; x++) row[x] = '─';
          }
          if (pos >= 0 && pos < cols) row[pos] = glyph;
          lines.push(row.join(''));
        }
        return lines.join('\n');
      }
    };
  },
  'oni': (cols, rows) => {
    const tools = ['read', 'bash', 'write', 'edit', 'grep', 'list', 'fetch'];
    const args = ['src/lib.rs', 'cargo test', 'out.log', 'main.rs', 'Cargo.toml', 'agent.rs', 'mlx.c', 'tool.rs', 'harness', 'src/oni.rs', 'build', 'llama.cpp'];
    const oks = ['ok', '..', 'ok', 'ok', '..', 'done', 'ok'];
    const pick = (n, arr) => arr[((n * 2654435761) >>> 0) % arr.length];
    const lineFor = (n) => {
      const tool = pick(n, tools);
      const arg = pick(n * 3 + 1, args);
      const ok = pick(n * 7 + 2, oks);
      return '> ' + tool + '(' + arg + ') ' + ok;
    };
    const fit = (s) => {
      const a = [...s];
      if (a.length > cols) return a.slice(0, cols).join('');
      return s + ' '.repeat(cols - a.length);
    };
    return {
      tick(t) {
        const lines = [];
        const head = rows + Math.floor(t / 2);
        const spin = ['|', '/', '-', '\\'][t % 4];
        for (let r = 0; r < rows; r++) {
          const fromBottom = rows - 1 - r;
          if (fromBottom === 0) {
            const idx = head;
            const tool = pick(idx, tools);
            const arg = pick(idx * 3 + 1, args);
            const partial = '> ' + tool + '(' + arg + ') ' + spin;
            lines.push(fit(partial));
          } else {
            const idx = head - fromBottom;
            if (idx < 0) {
              lines.push(fit(''));
            } else {
              lines.push(fit(lineFor(idx)));
            }
          }
        }
        return lines.join('\n');
      }
    };
  },
  'dawgit': (cols, rows) => {
    const NODE = '○';
    const VBAR = '│';
    const DOT = '·';
    const step = cols <= 20 ? 2 : 4;
    const left = 1;
    const maxLanes = Math.max(2, Math.min(cols <= 20 ? 2 : 3, Math.floor((cols - 3) / step)));
    const laneX = (i) => left + i * step;
    const activeAt = (g) => {
      const c = ((g % 14) + 14) % 14;
      let n = 1;
      if (c >= 2 && c <= 11) n = 2;
      if (c >= 5 && c <= 8) n = maxLanes;
      return Math.min(n, maxLanes);
    };
    return {
      tick(t) {
        const grid = [];
        for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(' '));
        const place = (x, y, ch) => {
          if (x >= 0 && x < cols && y >= 0 && y < rows) grid[y][x] = ch;
        };
        const phase = t;
        for (let r = 0; r < rows; r++) {
          const g = r + phase;
          const nNow = activeAt(g);
          const nPrev = activeAt(g - 1);
          for (let i = 0; i < Math.min(nNow, nPrev); i++) place(laneX(i), r, VBAR);
          if (nNow > nPrev) {
            const child = nNow - 1;
            const px = laneX(child - 1);
            const cx = laneX(child);
            for (let x = px + 1; x < cx; x++) place(x, r, '\\');
            place(laneX(child - 1), r, VBAR);
          }
          if (nNow < nPrev) {
            const gone = nPrev - 1;
            const px = laneX(gone - 1);
            const cx = laneX(gone);
            for (let x = px + 1; x < cx; x++) place(x, r, '/');
            place(laneX(gone - 1), r, VBAR);
          }
          if (((g % 2) + 2) % 2 === 0) place(laneX(0), r, NODE);
          if (nNow >= 2 && nNow === nPrev && ((g % 3) + 3) % 3 === 1) {
            place(laneX(nNow - 1), r, NODE);
          }
        }
        const clipX = cols - 1;
        for (let r = 0; r < rows; r++) {
          if (grid[r][clipX] === ' ' && r % 2 === 0) grid[r][clipX] = DOT;
        }
        const head = ((t % rows) + rows) % rows;
        grid[head][clipX] = NODE === grid[head][clipX] ? NODE : '◆';
        return grid.map((row) => {
          let s = row.join('');
          const len = [...s].length;
          if (len < cols) s += ' '.repeat(cols - len);
          else if (len > cols) s = [...s].slice(0, cols).join('');
          return s;
        }).join('\n');
      }
    };
  },
  'aero-lab': (cols, rows) => {
    const SKY = '·';
    const GND = '▒';
    const GNDH = '▓';
    const HORZ = '─';
    const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const band = rows >= 8 ? 2 : 1;
    const horizonRows = rows - band;
    return {
      tick(t) {
        const roll = 0.42 * Math.sin(t * 0.11) + 0.16 * Math.sin(t * 0.047);
        const pitch = 2.2 * Math.sin(t * 0.07) * (cy / 3);
        const slope = Math.tan(roll);
        const grid = [];
        for (let y = 0; y < horizonRows; y++) {
          let line = '';
          for (let x = 0; x < cols; x++) {
            const hY = cy + pitch * 0.5 + slope * (x - cx);
            const d = y - hY;
            let ch;
            if (Math.abs(d) < 0.55) ch = HORZ;
            else if (d < 0) ch = ((x + y) % 3 === 0 ? SKY : ' ');
            else if (d < 2.2) ch = GND;
            else ch = GNDH;
            line += ch;
          }
          grid.push(line);
        }
        const mY = Math.round(cy);
        if (mY >= 0 && mY < horizonRows) {
          const r = grid[mY].split('');
          const lx = Math.max(0, Math.round(cx) - 2);
          const rx = Math.min(cols - 1, Math.round(cx) + 2);
          r[Math.round(cx)] = '╋';
          if (lx < cols) r[lx] = '─';
          if (rx >= 0) r[rx] = '─';
          grid[mY] = r.join('');
        }
        for (let b = 0; b < band; b++) {
          let line = '';
          const seg = cols / 4;
          for (let x = 0; x < cols; x++) {
            const rotor = Math.min(3, Math.floor(x / seg));
            const phase = t * 0.23 + rotor * 1.7;
            const thrust = 0.5 + 0.5 * Math.sin(phase);
            const level = thrust * band;
            const rowFromBottom = band - 1 - b;
            const inSeg = x - rotor * seg;
            const gap = inSeg < 0.8 || inSeg > seg - 1.2;
            let ch = ' ';
            if (!gap) {
              const fill = level - rowFromBottom;
              if (fill >= 1) ch = BLOCKS[8];
              else if (fill > 0) ch = BLOCKS[Math.max(1, Math.round(fill * 8))];
              else ch = '▁';
            }
            line += ch;
          }
          grid.push(line);
        }
        const out = [];
        for (let y = 0; y < rows; y++) {
          let ln = grid[y] !== undefined ? grid[y] : '';
          const arr = [...ln];
          if (arr.length > cols) ln = arr.slice(0, cols).join('');
          else if (arr.length < cols) ln = ln + ' '.repeat(cols - arr.length);
          out.push(ln);
        }
        return out.join('\n');
      }
    };
  },
  'racing-lab': (cols, rows) => {
    // Top-down view of a single right-hand corner. The racing line enters wide
    // from the lower-left, sweeps UP toward the top as it rounds the bend, kisses
    // an apex near the inside (upper-mid), then exits wide to the lower-right.
    // A car '>' rides the line; a near lookahead '*' and a far lookahead '+'
    // slide ahead. Before the corner the far point DIVERGES inward toward the
    // apex (the pre-braking mechanism) — it visibly cuts off the curve.
    const W = cols, H = rows;
    const yTop = 0.18 * (H - 1);     // apex height (near top = inside of corner)
    const yBot = 0.92 * (H - 1);     // wide entry/exit (bottom = outside)
    const apexS = 0.5;
    const line = (s) => {
      const x = 0.5 + s * (W - 2);
      const u = 1 - Math.pow((s - apexS) / apexS, 2); // 0..1, peak at apexS
      const y = yBot - u * (yBot - yTop);
      return { x, y };
    };
    return {
      tick(t) {
        const g = [];
        for (let r = 0; r < H; r++) g.push(new Array(W).fill(' '));
        const put = (x, y, ch, over) => {
          const xi = Math.round(x), yi = Math.round(y);
          if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
          if (over || g[yi][xi] === ' ') g[yi][xi] = ch;
        };
        const N = W * 4;
        for (let i = 0; i <= N; i++) {
          const s = i / N;
          const p = line(s);
          const p2 = line(Math.min(1, s + 1 / N));
          const dy = p2.y - p.y, dx = p2.x - p.x;
          const ang = Math.atan2(dy, dx);
          let ch = '-';
          if (ang < -0.35) ch = '/';
          else if (ang > 0.35) ch = '\\';
          else if (Math.abs(ang) < 0.12) ch = '_';
          put(p.x, p.y, ch, false);
        }
        const ap = line(apexS);
        put(ap.x, ap.y - 1, ':', false);
        const period = 64;
        const carS = (t % period) / period;
        const cp = line(carS);
        const nearS = Math.min(0.999, carS + 0.12);
        const farS = Math.min(0.999, carS + 0.26);
        const np = line(nearS);
        const fp = line(farS);
        const pre = Math.max(0, Math.min(1, (apexS - carS) / apexS)); // 1 far before, 0 at apex
        const cutY = fp.y - (fp.y - (yTop - 0.3)) * pre * 0.8;
        put(np.x, np.y, '*', true);
        put(fp.x, cutY, '+', true);
        put(cp.x, cp.y, '>', true);
        return g.map((row) => row.join('')).join('\n');
      }
    };
  },
  'fsai-sim': (cols, rows) => {
    const top = 0;
    const bot = rows - 1;
    const carCol = Math.max(2, Math.floor(cols * 0.28));
    const spacing = Math.max(4, Math.floor(cols / 4) + 1);
    const speed = 2;
    const lo = 1;
    const hi = Math.max(1, rows - 2);
    return {
      tick(t) {
        const grid = [];
        for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(' '));
        const offset = t * speed;
        const yAt = (wx) => {
          const g = wx / spacing;
          const tri = Math.abs(((g % 2) + 2) % 2 - 1);
          return lo + tri * (hi - lo);
        };
        for (let c = 0; c < cols; c++) {
          const wx = c + offset;
          const phase = ((wx % spacing) + spacing) % spacing;
          const gateIndex = Math.floor(wx / spacing);
          if (phase === 0) {
            const openTop = gateIndex % 2 === 0;
            grid[top][c] = '^';
            grid[bot][c] = '^';
            if (openTop) {
              const ir = Math.min(rows - 2, hi);
              if (grid[ir][c] === ' ') grid[ir][c] = '^';
            } else {
              const ir = Math.max(1, lo);
              if (grid[ir][c] === ' ') grid[ir][c] = '^';
            }
          } else {
            grid[top][c] = '.';
            grid[bot][c] = '.';
          }
        }
        for (let k = 3; k >= 1; k--) {
          const cc = carCol - k;
          if (cc < 0) continue;
          const r = Math.min(rows - 2, Math.max(1, Math.round(yAt(cc + offset))));
          const gl = k === 1 ? '=' : (k === 2 ? '-' : '.');
          if (grid[r][cc] === ' ') grid[r][cc] = gl;
        }
        const carRow = Math.min(rows - 2, Math.max(1, Math.round(yAt(carCol + offset))));
        grid[carRow][carCol] = '>';
        return grid.map((row) => row.join('')).join('\n');
      }
    };
  },
  'commonroad': (cols, rows) => {
    const SHADE = ['░', '▒', '▓'];
    return {
      tick(t) {
        const grid = [];
        for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(' '));

        const roadY = rows - 1;
        const roadY2 = rows - 2;

        // road surface scrolling beneath: textured ground + lane dashes moving left
        for (let x = 0; x < cols; x++) {
          const phase = (x + t) % 4;
          grid[roadY][x] = phase === 0 ? '_' : (phase === 2 ? '.' : '_');
        }
        if (roadY2 >= 0) {
          for (let x = 0; x < cols; x++) {
            const xp = (x + t) % 6;
            grid[roadY2][x] = (xp < 3) ? '=' : ' ';
          }
        }

        // car body: fixed; the road scrolls beneath it. body axis = heading.
        const cx = Math.floor(cols * 0.34);
        const cy = Math.max(2, Math.floor(rows * 0.55));
        const bodyLen = Math.max(2, Math.floor(cols * 0.16));
        const tailX = cx - Math.floor(bodyLen / 2);
        for (let i = 0; i < bodyLen; i++) {
          const x = tailX + i;
          if (x >= 0 && x < cols) grid[cy][x] = '▬';
        }
        const noseX = tailX + bodyLen;
        if (noseX < cols) grid[cy][noseX] = '▸';

        // slip angle beta: velocity vector points off the heading axis, oscillating.
        // beta >= 0 always so the vector swings UPWARD off the body axis (never below road).
        // cap so the arrowhead always lands inside the box (headroom = rows above body).
        const head = cy; // rows available above the body axis
        const vlen = Math.max(4, Math.floor(cols * 0.36));
        const betaMax = Math.min(0.85, Math.asin(Math.min(1, (head - 0.5) / vlen)) || 0.85);
        const beta = Math.abs(Math.sin(t * 0.22)) * betaMax; // unsigned slip magnitude
        const ab = beta;
        // origin of velocity vector = the nose of the car
        const ox = noseX, oy = cy;
        let prevY = oy;
        let lastIn = null; // last in-bounds non-body cell, for guaranteed arrowhead
        for (let i = 1; i <= vlen; i++) {
          const ax = Math.round(ox + Math.cos(beta) * i);
          const ay = Math.round(oy - Math.sin(beta) * i);
          if (ax < 0 || ax >= cols || ay < 0 || ay >= rows) break;
          if (ay >= cy && ax <= noseX) { prevY = ay; continue; } // skip body cells
          const stepUp = ay - prevY;
          let ch;
          if (stepUp < 0) ch = '/';
          else if (stepUp > 0) ch = '\\';
          else ch = '-';
          if (grid[ay][ax] === ' ') grid[ay][ax] = ch;
          lastIn = [ax, ay];
          prevY = ay;
        }
        // arrowhead at the tip: tilted-up triangle when slipping, forward when gripped
        if (lastIn) grid[lastIn[1]][lastIn[0]] = (beta > 0.18) ? '▴' : '▸';

        // grip / slip indicator top-right: shaded bar; slip eats grip.
        const grip = 1 - ab / (betaMax || 1);
        const nbar = Math.max(3, Math.floor(cols * 0.2));
        const filled = Math.round(grip * nbar);
        for (let i = 0; i < nbar; i++) {
          const gx = cols - nbar + i;
          if (gx >= 0 && gx < cols) grid[0][gx] = i < filled ? SHADE[2] : SHADE[0];
        }

        return grid.map(r => r.join('')).join('\n');
      }
    };
  },
  'slit-sim': (cols, rows) => {
    const blocks = [' ', '░', '▒', '▓', '█'];
    const cx = (cols - 1) / 2;
    // slit separation controls fringe spacing; envelope width controls decay
    const fringe = Math.max(2.6, cols / 6.5);
    const env = cols / 1.7;
    return {
      tick(t) {
        const drift = t * 0.18;
        const shimmer = 0.9 + 0.1 * Math.sin(t * 0.31);
        const lines = [];
        for (let y = 0; y < rows; y++) {
          let line = '';
          for (let x = 0; x < cols; x++) {
            const d = x - cx;
            // cos^2 fringe term (the interference maxima/minima), drifting sideways
            const fr = Math.cos((d / fringe) * Math.PI + drift);
            const fringeI = fr * fr;
            // sinc^2 envelope (single-slit diffraction falloff)
            let u = (d / env) * Math.PI;
            let sinc = u === 0 ? 1 : Math.sin(u) / u;
            const envI = sinc * sinc;
            let I = fringeI * envI * shimmer;
            // gentle vertical breathing so bands aren't dead-flat
            I *= 0.86 + 0.14 * Math.sin(y * 0.9 - t * 0.22 + d * 0.05);
            let lvl = Math.round(I * 4.6 + 0.05);
            if (lvl < 0) lvl = 0;
            if (lvl > 4) lvl = 4;
            line += blocks[lvl];
          }
          lines.push(line);
        }
        return lines.join('\n');
      }
    };
  },
  'carrlane': (cols, rows) => {
    // Parts-catalog lookup stream: PN-#### rows scroll up, each row resolves to
    // an availability tick (check = in stock / OK) or a cross (not found).
    // A function-call cursor scans down the rows as the API "decides".
    const CK = '✓';   // check  ✓  -> OK / in stock
    const CX = '✗';   // cross  ✗  -> not found
    const DOT = '·';  // middle dot
    const ARR = '▸';  // small right pointer ▸ (active query)
    const parts = ['BRACKET','MOTOR-CTRL','BEARING','GASKET','RELAY','PUMP',
                   'SENSOR','FLANGE','PISTON','VALVE','SHAFT','COUPLER',
                   'FUSE','SPRING','ROTOR','CLAMP','WASHER','SEAL'];
    const rowData = (k) => {
      const pn = 4000 + ((k * 4471) % 6000);
      const name = parts[((k * 7) + 3) % parts.length];
      const hit = (((k * 131) >> 2) % 5) !== 0;
      return { pn, name, hit };
    };
    return {
      tick(t) {
        const lines = [];
        const active = t % rows;
        for (let r = 0; r < rows; r++) {
          const idx = t + (rows - 1 - r);
          const d = rowData(idx);
          const isActive = (r === active);
          let s = '';
          if (cols < 24) {
            const lead = isActive ? ARR : ' ';
            const pn = 'PN' + String(d.pn).slice(0, 4);
            const nm = d.name.slice(0, 4);
            const mark = d.hit ? CK : CX;
            const body = lead + pn + ' ' + nm;
            s = body.padEnd(cols - 2, ' ').slice(0, cols - 2) + ' ' + mark;
          } else {
            const lead = isActive ? ARR : ' ';
            const pn = 'PN-' + String(d.pn).slice(0, 4);
            const nm = d.name;
            const status = d.hit ? ('IN STOCK ' + CK) : ('NOT FOUND ' + CX);
            let mid = lead + ' ' + pn + '  ' + nm + ' ';
            const room = cols - mid.length - status.length - 1;
            let dots = '';
            for (let i = 0; i < Math.max(0, room); i++) {
              dots += ((i + idx) % 2 === 0) ? DOT : ' ';
            }
            s = mid + dots + ' ' + status;
          }
          const arr = [...s];
          if (arr.length > cols) s = arr.slice(0, cols).join('');
          else if (arr.length < cols) s = s + ' '.repeat(cols - arr.length);
          lines.push(s);
        }
        return lines.join('\n');
      }
    };
  },
  'aubry': (cols, rows) => {
    const W = cols, H = rows;
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    const ax = Math.max(2, (W - 6) / 2);
    const ay = Math.max(1, (H - 4) / 2);
    const subjAt = (tt) => {
      const a = tt * 0.11 + 0.9;
      return [
        cx + ax * Math.cos(a),
        cy + ay * Math.sin(a * 1.6),
      ];
    };
    return {
      tick(t) {
        const g = [];
        for (let y = 0; y < H; y++) g.push(new Array(W).fill(' '));
        const put = (x, y, ch, over) => {
          const xi = Math.round(x), yi = Math.round(y);
          if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
          if (!over && g[yi][xi] !== ' ') return;
          g[yi][xi] = ch;
        };
        const [sx, sy] = subjAt(t);
        const [dx, dy] = subjAt(t - 4.5);
        // 1. fading breadcrumb trail behind subject
        for (let k = 8; k >= 1; k--) {
          const [px, py] = subjAt(t - k * 1.3);
          const gl = k <= 2 ? '∙' : k <= 5 ? '·' : '.';
          put(px, py, gl, false);
        }
        // 2. sight-line dots between drone and subject
        const steps = 6;
        for (let i = 1; i < steps; i++) {
          const f2 = i / steps;
          put(dx + (sx - dx) * f2, dy + (sy - dy) * f2, '.', false);
        }
        // 3. framing reticle brackets (lower priority than drone/subject)
        const syr = Math.round(sy);
        const sxr = Math.round(sx);
        put(sxr - 2, syr, '[', false);
        put(sxr + 2, syr, ']', false);
        // 4. drone # (over brackets/trail)
        put(dx, dy, '#', true);
        // 5. subject @ (highest priority)
        put(sx, sy, '@', true);
        return g.map((r) => r.join('')).join('\n');
      },
    };
  },
  'proce-tree': (cols, rows) => {
    return {
      tick(t) {
        const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
        const put = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < cols && y >= 0 && y < rows && g[y][x] === ' ') g[y][x] = ch; };
        const cx = cols >> 1;
        const sway = Math.round(Math.sin(t * 0.12) * Math.max(1, cols / 18));
        const trunkTop = Math.max(1, Math.floor(rows * 0.58));
        for (let y = rows - 1; y >= trunkTop; y--) g[y][cx] = '|';
        for (let y = trunkTop - 1, k = 1; y >= 0; y--, k++) {
          const spread = Math.min(cx, k + 1);
          put(cx - spread + sway, y, '/');
          put(cx + spread + sway, y, '\\');
          if (cols >= 28) { put(cx - 1 + sway, y, '/'); put(cx + 1 + sway, y, '\\'); }
        }
        for (let y = 0; y < trunkTop; y++) {
          const w = Math.min(cx, 2 + (trunkTop - y));
          for (let x = cx - w + sway; x <= cx + w + sway; x++) {
            if (x < 0 || x >= cols || g[y][x] !== ' ') continue;
            const n = Math.sin(x * 12.9 + y * 78.2 + Math.floor(t / 5));
            if (n > 0.2) g[y][x] = n > 0.6 ? '*' : '·';
          }
        }
        return g.map((r) => r.join('')).join('\n');
      },
    };
  },
  'fsai-unity': (cols, rows) => {
    return {
      tick(t) {
        const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
        const put = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch; };
        const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
        const rx = cx - 0.5, ry = cy - 0.5;
        const warpOf = (a) => 1 + 0.18 * Math.sin(a * 3 + 0.6);
        const N = Math.max(18, cols + 4);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const w = warpOf(a);
          put(cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w, 'o');
        }
        const a = (t * 0.09) % (Math.PI * 2);
        const carR = 0.78;
        put(cx + Math.cos(a) * rx * warpOf(a) * carR, cy + Math.sin(a) * ry * warpOf(a) * carR, '#');
        const a2 = a + 0.28;
        put(cx + Math.cos(a2) * rx * warpOf(a2) * carR, cy + Math.sin(a2) * ry * warpOf(a2) * carR, '*');
        return g.map((r) => r.join('')).join('\n');
      },
    };
  },
  _default: (cols, rows) => ({ tick() { return Array.from({ length: rows }, () => ' '.repeat(cols)).join('\n'); } }),
};

export function asciiFirstFrame(slug: string, cols: number, rows: number): string {
  return (engines[slug] ?? engines._default)(cols, rows).tick(0);
}
