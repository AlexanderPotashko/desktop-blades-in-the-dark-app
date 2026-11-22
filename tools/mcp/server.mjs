#!/usr/bin/env node
// MCP server for the Blades in the Dark sheet prototype (charsheet.html).
// Code mode: instead of dozens of tools the agent gets two — `sheet_api` (read the API) and
// `sheet_execute` (run JS against the live sheet). The open page connects to this server over a
// local WebSocket (opt-in: ⚙ → "ИИ-агент (MCP)"), so edits appear in the browser immediately.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import vm from 'node:vm';

const PORT = +process.env.BLADES_PORT || 8765;
const TOKEN = process.env.BLADES_TOKEN || '';
const log = (...a) => console.error('[blades-mcp]', ...a); // stdout belongs to the MCP protocol
const NOT_CONNECTED = 'The sheet is not connected. Ask the user to open charsheet.html and enable ⚙ → "ИИ-агент (MCP)" (port ' + PORT + ').';

// ---- bridge to the page ----------------------------------------------------------------
let page = null, seq = 0;
const pending = new Map();
// file:// pages send Origin "null"; refuse web origins so a random website cannot pose as the sheet
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT, verifyClient: ({ origin }) => !origin || origin === 'null' || origin.startsWith('file://') });
let portBusy = false;
wss.on('error', e => { portBusy = e.code === 'EADDRINUSE'; log('websocket error:', e.message); });
wss.on('connection', ws => {
  let hello = false;
  ws.on('message', buf => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m.op === 'hello') {
      if (TOKEN && m.token !== TOKEN) { ws.send(JSON.stringify({ op: 'error', message: 'неверный токен' })); ws.close(); return; }
      hello = true; if (page && page !== ws) page.close(); page = ws; log('sheet connected'); return;
    }
    if (!hello) return;
    const done = pending.get(m.id); if (done) { pending.delete(m.id); done(m); }
  });
  ws.on('close', () => { if (page === ws) { page = null; log('sheet disconnected'); } });
});
function ask(msg, ms = 5000) {
  if (!page) return Promise.reject(new Error(portBusy ? `Port ${PORT} is busy: another blades-sheet MCP server (another AI client?) is already running. Close it or set BLADES_PORT and the same port in ⚙.` : NOT_CONNECTED));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error('The sheet did not answer in time.')); }, ms);
    pending.set(id, m => { clearTimeout(t); m.error ? reject(new Error(m.error)) : resolve(m); });
    page.send(JSON.stringify({ id, ...msg }));
  });
}

// ---- code mode -------------------------------------------------------------------------
const API = `// Blades in the Dark character sheet — code mode API.
// Your code is the body of an async function. Read and change \`sheet\` directly (or call the helpers);
// when the code finishes, changes are written back to the open sheet (pass save:false for a dry run).
// \`return\` a value to get it back; console.log output is returned too. The UI and data are in Russian.

type Sheet = {
  name: string; alias: string; look: string;
  heritage: string; heritageNote: string; background: string; backgroundNote: string; vice: string; viceNote: string;
  actions: Record<'Изучение'|'Охота'|'Разведка'|'Ремесло'|'Драка'|'Проникновение'|'Разрушение'|'Сноровка'|'Манипулирование'|'Общение'|'Приказ'|'Резонанс', 0|1|2|3|4>;
  xp: { 'Чутьё': number /*0..6*/; 'Удаль': number; 'Воля': number; 'Талант': number /*0..rules.talentXP (8 by book, 16 at our table)*/ };
  talents: string[];                          // special abilities by name, e.g. 'Врач'
  customTalents: { id: string; n: string; x: string }[];   // own abilities: name, text
  stress: number; trauma: string[]; traumaExtra: string[];  // traumaExtra = own trauma names
  h3: string; h2a: string; h2b: string; h1a: string; h1b: string;  // harm: level 3, two of level 2, two of level 1
  heal: number;                               // healing clock 0..4
  items: string[];                            // carried book items by id (s0, s1…)
  custom: { n: string; l: number; qty?: number; take?: number; base?: boolean; note?: string; sub?: { n: string; q?: number }[] }[]; // own items: name, load, total, carried, stored at base
  prod: { n: string; v: number|''; m: number|''; q: number }[];  // workshop: name, progress v/m, quantity
  ws: ({ book: string } | { n: string; l: number; qty?: number; note?: string; sub?: { n: string; q?: number }[] })[]; // workshop equipment: a book item moved from gear (by id) or an own item
  counters: { id: string; n: string; v: number; max: number|''; r: 'day'|'downtime'|'score'|'none' }[];
  cards: Card[];                              // notes tab; cards with rule:true live in the "Правила" tab
  contacts: { id: string; n: string; rel: string }[]; friends: Record<string, 'up'|'down'>;
  dr: number; drm: number;                    // custom currency: major / minor units (see rules.major, rules.minor, rules.rate)
  coin: number; stash: number;                // book money
  day: number; rules: Record<string, unknown>;
};
type Card = { t: string; x: string; pin?: boolean; rule?: boolean; plan?: Plan; imgs?: string[] };   // title, text, pinned on top; list shows newest first (array order = creation order); text is plain, rendered in view mode: "[ Floor ]"/"# h", "[[ Room ]]"/"## h", "- " bullets, **bold**, "---", chat lines "Name:text", dice "rolling 5d6 ( … ) = N"
type Plan = { f: number; floors: { n: string; s: Shape[] }[]; v: { x: number; y: number; z: number } };
type Shape =                                  // coordinates in plan units, grid = 20
  | { k: 'r'; x: number; y: number; w: number; h: number; t: string }      // room with label
  | { k: 'l'; x1: number; y1: number; x2: number; y2: number; d: 0|1|2 }   // wall (d:0), door (d:1, hinge at x1,y1) or window (d:2)
  | { k: 't'; x: number; y: number; t: string }                            // text label
  | { k: 'm'; x: number; y: number; g: string; t: string }                 // marker; g = glyph from the sheet's picker, e.g. '✕' '!' '?' '🔒' '🪜' '👁' '💀'
  | { k: 'p'; pts: [number, number][] }                                     // pen stroke
  | { k: 'i'; x: number; y: number; w: number; h: number; src: string };   // image
// Images are replaced by "img#N" placeholders; keep or delete them, never invent new ones.

// Helpers
declare function card(title: string, create?: boolean): Card | undefined;   // find a note by title (case-insensitive), create if missing
declare function floor(card: Card, name: string): { n: string; s: Shape[] }; // find or create a plan floor
declare function room(floor: { s: Shape[] }, r: { t: string; x?: number; y?: number; w?: number; h?: number }): Shape; // add a room

// Examples
//   return { name: sheet.name, stress: sheet.stress, craft: sheet.actions['Ремесло'] };
//   sheet.stress = Math.min(9, sheet.stress + 2);
//   const c = card('Дом Резо'); c.x += '\\n[[ Подвал ]]\\nсырость'; room(floor(c, 'Первый этаж'), { t: 'Подвал', x: 0, y: 300 });`;

function helpers(state) {
  const card = (title, create = true) => {
    state.cards ??= [];
    let c = state.cards.find(c => (c.t || '').toLowerCase() === String(title).toLowerCase());
    if (!c && create) { c = { t: String(title), x: '' }; state.cards.push(c); }
    return c;
  };
  const floor = (c, name) => {
    c.plan ??= { f: 0, floors: [{ n: '1 этаж', s: [] }], v: { x: 40, y: 40, z: 1 } };
    let f = c.plan.floors.find(f => f.n.toLowerCase() === String(name).toLowerCase());
    if (!f) {
      const only = c.plan.floors.length === 1 && !c.plan.floors[0].s.length && c.plan.floors[0].n === '1 этаж';
      if (only) { f = c.plan.floors[0]; f.n = String(name); } else { f = { n: String(name), s: [] }; c.plan.floors.push(f); }
    }
    return f;
  };
  const room = (f, r) => { const s = { k: 'r', x: 0, y: 0, w: 180, h: 120, ...r, t: String(r.t ?? '') }; f.s.push(s); return s; };
  return { card, floor, room };
}

const fmt = v => typeof v === 'string' ? v : JSON.stringify(v);
async function runCode(code, save) {
  const { state } = await ask({ op: 'get' });
  const before = JSON.stringify(state), logs = [];
  const sandbox = { sheet: state, console: { log: (...a) => logs.push(a.map(fmt).join(' ')) }, ...helpers(state) };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  // ponytail: node:vm limits time, not capabilities; fine for the user's own local agent, use an isolate if this ever runs untrusted code
  const run = new vm.Script(`(async () => {\n${code}\n})()`, { filename: 'agent.js' }).runInContext(ctx, { timeout: 2000 });
  const result = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('Code timed out (5 s).')), 5000))]);
  const changed = JSON.stringify(sandbox.sheet) !== before;
  if (changed && save) await ask({ op: 'set', state: sandbox.sheet });
  return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), logs, changed, saved: changed && save };
}

// ---- MCP -------------------------------------------------------------------------------
const server = new McpServer({ name: 'blades-sheet', version: '0.1.0' });
server.registerTool('sheet_api', {
  title: 'Sheet API',
  description: 'Returns the TypeScript description of the character sheet and helpers for sheet_execute, plus a short summary of the open sheet. Call this first.',
  inputSchema: {},
}, async () => {
  let summary = NOT_CONNECTED;
  if (page) try {
    const { state: s } = await ask({ op: 'get' });
    summary = `Open sheet: ${s.name || '(no name)'}${s.alias ? ' «' + s.alias + '»' : ''}, stress ${s.stress}, talents: ${(s.talents || []).join(', ') || '—'}, notes: ${(s.cards || []).map(c => c.t || '(untitled)').join(', ') || '—'}.`;
  } catch (e) { summary = e.message; }
  return { content: [{ type: 'text', text: API + '\n\n// ' + summary }] };
});
server.registerTool('sheet_execute', {
  title: 'Run code against the sheet',
  description: 'Runs JavaScript (body of an async function) with `sheet` and helpers card(), floor(), room(). Changes are saved to the open sheet unless save is false. Returns { result, logs, changed, saved }. Read sheet_api first.',
  inputSchema: { code: z.string().describe('JavaScript; use `return` to send data back'), save: z.boolean().optional().describe('default true; false = dry run') },
}, async ({ code, save = true }) => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await runCode(code, save), null, 2) }] }; }
  catch (e) { return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] }; }
});

await server.connect(new StdioServerTransport());
process.stdin.on('close', () => process.exit(0)); // the AI client went away: free the port
log(`ready; waiting for the sheet on ws://127.0.0.1:${PORT}`);
