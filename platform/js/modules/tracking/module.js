// Tracking module (module one): rooms, checklists, check-off, issues, notes.
// FF&E and MEP punch stay separate populations, like the crew app today.

import { ic, el, esc, fmtWhen, toast, sheet, pressable } from '../../core/ui.js';

const QUICK_PICKS = ['NEED INSTALL', 'NEED PROPER PLACE', 'IN BOX', 'DAMAGED', 'MISSING', 'WRONG ITEM'];
// Copy that states a count has to be derived, or it goes stale the moment the
// build grows - which is worse than saying nothing, because it reads as fact.
import { counts, isBuildNote } from '../../core/store.js';

function floorsOf(docs) {
  return [...new Set(docs.map(d => Number(d.floor)).filter(n => n > 0))].sort((a, b) => a - b);
}
// "floor 1" or "floors 1 to 4", from the documents actually loaded, so the
// copy never claims a floor the data does not hold.
function floorRange(docs) {
  const f = floorsOf(docs);
  if (!f.length) return 'no floor yet';
  if (f.length === 1) return `floor ${f[0]}`;
  const contiguous = f[f.length - 1] - f[0] === f.length - 1;
  return contiguous ? `floors ${f[0]} to ${f[f.length - 1]}` : `floors ${f.join(', ')}`;
}
function sliceNote(store) {
  const rooms = store ? store.guestRooms() : [];
  const range = floorRange(rooms);
  return `${range[0].toUpperCase() + range.slice(1)}: ${rooms.length} guest rooms built.`;
}
// A room or space list with a heading row wherever the floor changes.
function appendByFloor(list, entries, floorOf, rowOf) {
  let last = null;
  for (const e of entries) {
    const f = Number(floorOf(e));
    if (f !== last) { list.append(el(`<div class="rlist-floor">Floor ${esc(f || '?')}</div>`)); last = f; }
    list.append(rowOf(e));
  }
}

// The printer icon opens the live in-app sheet (#/print/<no>), always current.
// Drive PDF revisions are generated and uploaded by tools at each milestone.

// Category display order mirrors the crew app (work top-of-wall down for MEP; FF&E families for rooms).
function groupByCategory(entries) {
  const groups = new Map();
  for (const [id, it] of entries) {
    const cat = it.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push([id, it]);
  }
  return groups;
}

function specRef(it) {
  if (!it.src) return '';
  const parts = String(it.src).split(';').map(x => x.trim()).filter(Boolean);
  const lead = (parts[0].match(/^[A-Z]{1,2}[0-9]{3}(?:\.[0-9]+)?/) || [parts[0].split(' ')[0]])[0];
  const more = parts.length > 1 ? ` +${parts.length - 1}` : '';
  return `<span class="speclink">${ic('jump')}${esc(lead)}${more}</span>`;
}
function fullSrc(it) { return String(it.src || '').trim(); }

// Crew-facing short label (Austin: "too much clutter"). The full label, model
// numbers, and the verification paper trail stay intact in the item sheet;
// the list row carries only what a punch walk needs.
function shortLabel(it) {
  let t = String(it.label || '');
  t = t.split(' \u2014 ')[0];                                   // cut at " — "
  t = t.split(/\s+-\s+(?=[A-Z]{1,4}-?\d)/)[0];                  // " - WC-3 ..." tag dumps
  t = t.split(/\s+-\s+(?=[A-Z][a-z]+\s+[A-Z0-9])/)[0];          // " - Danby DDW..." brand+model
  t = t.replace(/\s*\(.{12,}\)\s*$/, '');                      // trailing long parenthetical
  t = t.trim().replace(/[,;:]$/, '');
  if (t.length > 64) {
    const cut = t.slice(0, 64);
    t = cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)) + '\u2026';
  }
  return t || it.label || '';
}
function shortCode(it) {
  const c = String(it.code || '').trim();
  if (!c || c === '\u2014' || c === '-' || c === '\u2013') return '';
  if (c.length <= 10) return c;
  const head = c.split('/')[0].trim().split(' ').slice(0, 2).join(' ');
  return (head.length > 10 ? head.slice(0, 9) : head) + '\u2026';
}
function hasDetail(it) {
  return !!(it.instanceNote || (it.label && shortLabel(it) !== it.label)
    || (it.code && String(it.code).length > 10) || String(it.src || '').includes(';'));
}

// ---------- screens ----------

// Percent complete per trade, building-wide, with a per-floor split. FF&E is
// one trade with its families under it; each MEP category is its own trade.
// Counted off the same checklist lines the crew taps, rooms and common areas
// alike, so there is no second set of books.
const MEP_ORDER = ['Mechanical', 'Electrical', 'Plumbing', 'Fire Protection', 'Fire Sprinkler', 'Fire Alarm', 'Low Voltage'];
const MEP_TRADES = new Set(['Mechanical', 'Electrical', 'Plumbing', 'Fire Alarm', 'Fire Sprinkler', 'Fire Protection', 'Low Voltage', 'Finishes']);
function tradeStats(store) {
  const floors = new Set();
  const mk = () => ({ total: 0, done: 0, open: 0, byFloor: {} });
  const ffe = mk(), fam = new Map(), mep = new Map();
  const add = (acc, it, floor) => {
    acc.total++; if (it.checked) acc.done++; if (it.issue && !it.issueResolved) acc.open++;
    const f = acc.byFloor[floor] || (acc.byFloor[floor] = { total: 0, done: 0 });
    f.total++; if (it.checked) f.done++;
  };
  for (const [id, d] of Object.entries(store.docs)) {
    if (id.startsWith('_') || d.deleted) continue;
    const isMep = store.constructor.MEP_SUFFIXES.some(sfx => id.endsWith(sfx)) || d.type === 'mep-punch';
    const floor = Number(d.floor) || 0;
    if (floor) floors.add(floor);
    for (const [, it] of store.liveItems(d)) {
      /* Ruling D52 ("put the Plumbing items in Plumbing"): a line is counted by
       * its TRADE, not by the document it sits in. A Plumbing or Low Voltage
       * line that lives on an FF&E checklist rolls up under that MEP trade, so
       * the FF&E families stay furniture and the trades stay trades. */
      if (isMep || MEP_TRADES.has(it.category)) {
        const c = it.category || 'Other';
        if (!mep.has(c)) mep.set(c, mk());
        add(mep.get(c), it, floor);
      } else {
        add(ffe, it, floor);
        const c = String(it.category || 'Other').replace(/^FF&E - /, '');
        if (!fam.has(c)) fam.set(c, mk());
        add(fam.get(c), it, floor);
      }
    }
  }
  const order = (a, b) => { const ia = MEP_ORDER.indexOf(a[0]), ib = MEP_ORDER.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]); };
  return {
    floors: [...floors].sort((a, b) => a - b),
    rows: [
      { name: 'FF&E', ...ffe, head: true },
      ...[...fam].sort((a, b) => b[1].total - a[1].total).map(([name, v]) => ({ name, ...v, sub: true })),
      ...[...mep].sort(order).map(([name, v]) => ({ name, ...v, head: true, mep: true })),
    ],
  };
}
const pct = (d, t) => t ? Math.round(d / t * 100) : 0;
function tradeTable(store) {
  const { floors, rows } = tradeStats(store);
  return `<section class="card" style="margin-bottom:18px">
    <div class="card-head trades-head"><h2>Percent complete by trade</h2><span class="card-cap">FF&amp;E with its families, then each MEP trade · rooms and common areas · every floor</span><span class="spacer"></span><span class="card-cap">open issues counted per trade</span></div>
    <div class="trades" style="--nf:${floors.length}">
      <div class="trow th"><span class="tn">Trade</span><span class="tb"></span><span class="tp">%</span><span class="tf">checked</span><span class="ti">open</span>${floors.map(f => `<span class="tfl">F${f}</span>`).join('')}</div>
      ${rows.map(r => `<div class="trow ${r.sub ? 'sub' : 'head'} ${r.mep ? 'mep' : ''}">
        <span class="tn">${esc(r.name)}</span>
        <span class="tb"><span class="bar ${r.sub ? '' : 'cy'}"><i style="width:${pct(r.done, r.total)}%"></i></span></span>
        <span class="tp">${pct(r.done, r.total)}%</span>
        <span class="tf">${r.done}<small> / ${r.total}</small></span>
        <span class="ti ${r.open ? 'has' : ''}">${r.open ? ic('flag', 'flag-ic') + ' ' + r.open : '0'}</span>
        ${floors.map(f => { const x = r.byFloor[f]; return `<span class="tfl ${x ? '' : 'na'}">${x ? pct(x.done, x.total) + '%' : '·'}</span>`; }).join('')}
      </div>`).join('')}
    </div>
  </section>`;
}

// Item status board: for every line in the building, how many are installed
// (checked), pending (not checked, no open issue), or carry an open issue,
// by the issue's own text. Rows merge lines that share a category and label,
// the same way the Bulk mark screen does, so a row can be opened there.
const ISTAT_KEY = 'h2sep-p-istat';
function istatQ() {
  try { return { floor: 0, filter: '', ...(JSON.parse(sessionStorage.getItem(ISTAT_KEY)) || {}) }; } catch { return { floor: 0, filter: '' }; }
}
const KIND_LABEL = { ffe: 'Rooms · FF&E', mep: 'Rooms · MEP punch', 'space-ffe': 'Common areas · FF&E', 'space-mep': 'Common areas · MEP' };
function itemStatusStats(store, q) {
  const rows = new Map();
  const totals = { total: 0, installed: 0, pending: 0, other: 0 };
  for (const k of QUICK_PICKS) totals[k] = 0;
  const isCompanion = (id) => store.constructor.MEP_SUFFIXES.some(sfx => id.endsWith(sfx));
  for (const [id, d] of Object.entries(store.docs)) {
    if (id.startsWith('_') || d.deleted) continue;
    if (q.floor && Number(d.floor) !== q.floor) continue;
    const space = String(d.type || '').startsWith('space-');
    const mep = isCompanion(id) || d.type === 'mep-punch';
    const kind = (space ? 'space-' : '') + (mep ? 'mep' : 'ffe');
    for (const [, it] of store.liveItems(d)) {
      if (!counts(it)) continue;   // an "if needed" line (D52) joins the board only once someone acts on it
      const key = kind + '|' + codeKey(it);
      if (!rows.has(key)) { const r = { key, kind, tagKey: codeKey(it), category: it.category || 'Other', label: it.label || '', codes: new Set(), total: 0, installed: 0, pending: 0, other: 0, others: new Map() }; for (const k of QUICK_PICKS) r[k] = 0; rows.set(key, r); }
      const r = rows.get(key);
      if (it.code) for (const c of String(it.code).split('/')) if (c.trim()) r.codes.add(c.trim());
      const open = !!(it.issue && !it.issueResolved);
      r.total++; totals.total++;
      if (it.checked) { r.installed++; totals.installed++; }
      if (!it.checked && !open) { r.pending++; totals.pending++; }
      if (open) {
        if (QUICK_PICKS.includes(it.issue)) { r[it.issue]++; totals[it.issue]++; }
        else { r.other++; totals.other++; r.others.set(it.issue, (r.others.get(it.issue) || 0) + 1); }
      }
    }
  }
  const filter = String(q.filter || '').trim().toLowerCase();
  const list = [...rows.values()]
    .filter(r => !filter || `${[...r.codes].join(' ')} ${r.label} ${r.category}`.toLowerCase().includes(filter))
    .sort((a, b) => Object.keys(KIND_LABEL).indexOf(a.kind) - Object.keys(KIND_LABEL).indexOf(b.kind) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  return { rows: list, totals };
}
function itemStatusBoard(ctx) {
  const { store } = ctx;
  const q = istatQ();
  const { rows, totals } = itemStatusStats(store, q);
  const floors = floorsOf([...store.guestRooms(), ...store.spaces()]);
  const codesOf = (r) => { const c = [...r.codes]; return c.length ? (c.length > 3 ? `${c.slice(0, 3).join(' / ')} +${c.length - 3}` : c.join(' / ')) : '—'; };
  const cell = (n, cls = '') => `<td class="n ${n ? cls : 'zero'}">${n || '·'}</td>`;
  const root = el(`<section class="card istat" style="margin-bottom:18px">
    <div class="card-head istat-head"><h2>Item status</h2><span class="card-cap">every line, by what is on it · installed = checked · pending = not checked, no open issue · issue columns count open issues by their text</span></div>
    <div class="kpis istat-kpis">
      <div class="kpi"><div class="kl">Pending</div><div class="kv">${totals.pending}</div><div class="kc">not checked, nothing flagged</div></div>
      <div class="kpi"><div class="kl">Missing</div><div class="kv">${totals.MISSING}</div><div class="kc">open MISSING</div></div>
      <div class="kpi"><div class="kl">In box</div><div class="kv">${totals['IN BOX']}</div><div class="kc">delivered, not installed</div></div>
      <div class="kpi"><div class="kl">Need install</div><div class="kv">${totals['NEED INSTALL']}</div><div class="kc">open NEED INSTALL</div></div>
      <div class="kpi"><div class="kl">Need proper place</div><div class="kv">${totals['NEED PROPER PLACE']}</div><div class="kc">installed wrong spot</div></div>
      <div class="kpi"><div class="kl">Damaged</div><div class="kv">${totals.DAMAGED}</div><div class="kc">open DAMAGED</div></div>
      <div class="kpi"><div class="kl">Wrong item</div><div class="kv">${totals['WRONG ITEM']}</div><div class="kc">open WRONG ITEM</div></div>
      <div class="kpi"><div class="kl">Other issue</div><div class="kv">${totals.other}</div><div class="kc">written in by hand</div></div>
      <div class="kpi"><div class="kl">Installed</div><div class="kv">${totals.installed}<small> of ${totals.total}</small></div><div class="kc">checked off</div></div>
    </div>
    <div class="istat-tools">
      <div class="chips"><button class="fl ${!q.floor ? 'on' : ''}" data-fl="0">Every floor</button>${floors.map(f => `<button class="fl ${q.floor === f ? 'on' : ''}" data-fl="${f}">Floor ${f}</button>`).join('')}</div>
      <input class="tagfilter" data-filter placeholder="Find an item (headboard, PTAC, HD-08)" value="${esc(q.filter)}"/>
    </div>
    <div class="istat-wrap"><table class="istat-t">
      <thead><tr><th class="tn">Item</th><th>Total</th><th>Installed</th><th>Pending</th>${QUICK_PICKS.map(k => `<th title="open ${esc(k)}">${esc(k.replace('NEED PROPER PLACE', 'PROPER PLACE'))}</th>`).join('')}<th>Other</th></tr></thead>
      <tbody>${(() => { let last = ''; return rows.map(r => { const head = r.kind + '|' + r.category; const h = head !== last ? `<tr class="grp"><td colspan="${5 + QUICK_PICKS.length}">${esc(KIND_LABEL[r.kind])} · ${esc(r.category)}</td></tr>` : ''; last = head; return h + `<tr data-key="${esc(r.key)}" tabindex="0" role="link" aria-label="Open ${esc(r.label)} in Bulk mark">
        <td class="tn"><span class="tag">${esc(codesOf(r))}</span> <span>${esc(r.label.length > 54 ? r.label.slice(0, 53) + '…' : r.label)}</span></td>
        <td class="n">${r.total}</td>${cell(r.installed, 'ok')}${cell(r.pending, 'pend')}${QUICK_PICKS.map(k => cell(r[k], 'iss')).join('')}<td class="n ${r.other ? 'iss' : 'zero'}" title="${esc([...r.others].map(([t, n]) => `${n} · ${t}`).join('\n'))}">${r.other || '·'}</td>
      </tr>`; }).join(''); })()}</tbody>
    </table>${rows.length ? '' : '<div class="coming" style="padding:18px"><b>No items match</b></div>'}</div>
    <div class="istat-foot">${pl(rows.length, 'item row')} · tap a row to open it in Bulk mark with the tag picked</div>
  </section>`);
  const save = (patch) => { sessionStorage.setItem(ISTAT_KEY, JSON.stringify({ ...q, ...patch })); store._emit(); };
  root.querySelectorAll('[data-fl]').forEach(b => b.addEventListener('click', () => save({ floor: Number(b.dataset.fl) })));
  root.querySelector('[data-filter]').addEventListener('input', e => { const v = e.target.value; clearTimeout(root._ft); root._ft = setTimeout(() => save({ filter: v }), 250); });
  root.querySelectorAll('tr[data-key]').forEach(tr => {
    const go = () => {
      const r = rows.find(x => x.key === tr.dataset.key);
      if (!r) return;
      setBulkQ({ floors: q.floor ? [q.floor] : [], types: [], kind: r.kind, cats: [r.category], codes: [r.tagKey], action: 'check', text: '' });
      location.hash = '#/bulk';
    };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
  return root;
}

function renderDashboard(ctx) {
  const { store } = ctx;
  const rooms = store.guestRooms();
  let total = 0, done = 0, issues = 0, complete = 0;
  const rows = rooms.map(r => {
    const s = store.roomStats(r);
    total += s.total; done += s.done; issues += s.openIssues;
    if (s.complete) complete++;
    return { r, s };
  });
  const mepCount = rooms.reduce((n, r) => n + (store.mepDoc(r.number) ? 1 : 0), 0);
  const pct = total ? Math.round(done / total * 100) : 0;

  const root = el(`<div>
    <div class="pagehead">
      <h1 class="h1">Dashboard</h1>
      <span class="sub">${esc(sliceNote(store))}</span>
      <span class="spacer"></span>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kl">Items checked</div><div class="kv">${done}<small> of ${total}</small></div><div class="kc">${pct}% of ${esc(floorRange(rooms))}</div></div>
      <div class="kpi"><div class="kl">Open issues</div><div class="kv">${issues}</div><div class="kc">issue flags plus red room notes</div></div>
      <div class="kpi"><div class="kl">Rooms complete</div><div class="kv">${complete}<small> of ${rows.length}</small></div><div class="kc">every line checked, zero open issues</div></div>
      <div class="kpi"><div class="kl">MEP punch lists</div><div class="kv">${mepCount}</div><div class="kc">separate from FF&amp;E, per room</div></div>
    </div>
    ${tradeTable(store)}
    <div data-istat></div>
    <section class="card">
      <div class="card-head"><h2>Rooms</h2><span class="card-cap">${esc(floorRange(rooms))}</span><span class="spacer"></span><span class="card-cap">tap a room to open its checklist</span></div>
      <div class="rlist"></div>
    </section>
  </div>`);

  root.querySelector('[data-istat]').replaceWith(itemStatusBoard(ctx));
  const list = root.querySelector('.rlist');
  appendByFloor(list, rows, x => x.r.floor, x => roomRow(x.r, x.s));
  return root;
}

function roomRow(r, s) {
  const status = s.complete ? ['done', 'Done'] : s.openIssues > 0 ? ['issue', 'Issues'] : s.done > 0 ? ['prog', 'In Progress'] : ['ns', 'Not Started'];
  const row = el(`<div class="room-row" role="link" tabindex="0" aria-label="Open room ${esc(r.number)}">
    <span class="rno mono">${esc(r.number)}</span>
    <span class="rtype">${esc(r.typeLabel || r.type)}</span>
    <span class="chip ${status[0]} sm"><i class="dot"></i>${status[1]}</span>
    <span class="riss ${s.openIssues ? '' : 'none'}">${s.openIssues ? ic('flag', 'flag-ic') + ' ' + s.openIssues + ' open' : '0 open'}</span>
    <span class="rfrac">${s.done}/${s.total}</span>
    ${ic('chev', 'chev')}
  </div>`);
  pressable(row, { tap: () => { location.hash = `#/room/${r.number}`; } });
  return row;
}

function renderRooms(ctx) {
  const { store } = ctx;
  const rooms = store.guestRooms();
  const filter = sessionStorage.getItem('h2sep-p-filter') || 'all';
  const stats = rooms.map(r => ({ r, s: store.roomStats(r) }));
  const buckets = {
    all: stats,
    prog: stats.filter(x => x.s.done > 0 && !x.s.complete),
    issues: stats.filter(x => x.s.openIssues > 0),
    done: stats.filter(x => x.s.complete),
    ns: stats.filter(x => x.s.done === 0 && x.s.total > 0),
  };
  const chips = [['all', 'All'], ['prog', 'In progress'], ['issues', 'Issues'], ['done', 'Done'], ['ns', 'Not started']];

  const root = el(`<div>
    <div class="pagehead"><h1 class="h1">Rooms</h1><span class="sub">${rooms.length} guest rooms on ${esc(floorRange(rooms))}</span></div>
    <div class="filters">${chips.map(([k, l]) => `<button class="fl ${k === filter ? 'on' : ''}" data-f="${k}">${l} <b>${buckets[k].length}</b></button>`).join('')}</div>
    <section class="card"><div class="rlist"></div></section>
  </div>`);
  root.querySelectorAll('.fl').forEach(b => b.addEventListener('click', () => {
    sessionStorage.setItem('h2sep-p-filter', b.dataset.f); location.hash = '#/rooms'; dispatchEvent(new HashChangeEvent('hashchange'));
  }));
  const list = root.querySelector('.rlist');
  const shown = buckets[filter] || stats;
  if (!shown.length) list.append(el(`<div class="coming"><b>No rooms match</b><span>Nothing on ${esc(floorRange(rooms))} matches that filter right now.</span></div>`));
  appendByFloor(list, shown, x => x.r.floor, x => roomRow(x.r, x.s));
  return root;
}

function renderRoom(ctx, { no }) {
  const { store } = ctx;
  const doc = store.getDoc(no);
  if (!doc) return el(`<div class="coming">${ic('door')}<b>Room ${esc(no)} is not in this build</b><span>${esc(sliceNote(store))}</span></div>`);

  const view = new URLSearchParams((location.hash.split('?')[1] || '')).get('view') === 'mep' && store.mepDoc(no) ? 'mep' : 'ffe';
  const active = view === 'mep' ? store.mepDoc(no) : doc;
  const s = store.roomStats(active);
  const mep = store.mepDoc(no);
  const has3d = ctx.modelRooms.includes(no);

  const root = el(`<div>
    <div class="pagehead">
      <button class="icon-btn" data-back aria-label="Back to rooms">${ic('back')}</button>
      <div>
        <h1 class="h1">Room ${esc(no)}</h1>
        <div class="sub">${esc(doc.typeLabel || doc.type)} · Floor ${esc(doc.floor)}</div>
      </div>
      <span class="spacer"></span>
      <div class="hdr-actions">
        ${has3d ? `<a class="btn" href="#/bim/${esc(no)}">${ic('cube')}3D model</a>` : ''}
        <a class="btn" href="#/print/${esc(no)}">${ic('printer')}Print sheet</a>
        <button class="btn" data-note>${ic('note')}Room notes${noteCount(doc) ? ` · ${noteCount(doc)}` : ''}</button>
      </div>
    </div>
    ${mep ? `<div class="filters"><span class="seg">
      <button data-v="ffe" class="${view === 'ffe' ? 'on' : ''}">FF&amp;E · ${store.roomStats(doc).done}/${store.roomStats(doc).total}</button>
      <button data-v="mep" class="${view === 'mep' ? 'on' : ''}">MEP PUNCH · ${store.roomStats(mep).done}/${store.roomStats(mep).total}</button>
    </span></div>` : ''}
    <section class="card">
      <div class="card-head">
        <h2>${view === 'mep' ? 'MEP punch' : 'Checklist'}</h2>
        <span class="card-cap">${s.done} of ${s.total} checked</span>
        <span class="spacer"></span>
        <span class="bar cy" style="width:130px"><i style="width:${s.total ? s.done / s.total * 100 : 0}%"></i></span>
        <button class="btn ${bulkOn(view === 'mep' ? store.mepDocId(no) : no) ? 'primary' : ''}" data-bulk style="margin-left:10px;padding:5px 10px;font-size:12px">${ic('check')}${bulkOn(view === 'mep' ? store.mepDocId(no) : no) ? 'Done selecting' : 'Select lines'}</button>
      </div>
      <div class="how" style="padding:8px 16px;color:var(--subtle);font-size:11.5px">${bulkOn(view === 'mep' ? store.mepDocId(no) : no) ? 'Select mode: tap lines or a whole category, then choose an action below. Press and hold still opens a line.' : 'Tap a line to stamp your initials, like the paper sheet. Press and hold for the issue sheet.'}</div>
      <div class="ilist"></div>
    </section>
  </div>`);

  root.querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/rooms'; });
  root.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
    location.hash = `#/room/${no}` + (b.dataset.v === 'mep' ? '?view=mep' : '');
  }));
  root.querySelector('[data-note]').addEventListener('click', () => notesSheet(ctx, no));

  const list = root.querySelector('.ilist');
  // Never concatenate the suffix here: a space MEP doc is '-M', not '-MEP'.
  const activeId = view === 'mep' ? store.mepDocId(no) : no;
  if (bulkSel && bulkSel.docId !== activeId) bulkSel = null;   // a selection belongs to one document
  root.querySelector('[data-bulk]').addEventListener('click', () => { bulkSel = bulkOn(activeId) ? null : { docId: activeId, ids: new Set() }; store._emit(); });
  const groups = groupByCategory(store.liveItems(active));
  for (const [cat, entries] of groups) {
    const counted = entries.filter(([, it]) => counts(it));
    const done = counted.filter(([, it]) => it.checked).length;
    const head = el(`<div class="cat-head">${esc(cat)}<span style="letter-spacing:0">·</span><span>${done} of ${counted.length} checked</span>
      <span class="spacer"></span>${ownerChip(store, cat, no)}${bulkOn(activeId) ? `<span class="pickall" role="button" tabindex="0">${pickallLabel(activeId, entries)}</span>` : ''}</div>`);
    wirePickall(head, list, activeId, entries);
    list.append(head);
    for (const [id, it] of entries) list.append(itemRow(ctx, activeId, id, it));
  }
  if (bulkOn(activeId)) { root.append(bulkBar(ctx, activeId, active)); queueMicrotask(bulkRefreshBar); }
  return root;
}

// A company name short enough to sit next to initials on a checklist line.
function shortCo(co) {
  let t = String(co || '').trim().replace(/,?\s+(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Company|Co\.)$/i, '');
  if (t.length > 22) t = t.slice(0, 21).trimEnd() + '\u2026';
  return t;
}
// Companies on the job, from the directory module's doc. Guarded: the identity
// sheet still works with a plain text box if the directory is not loaded.
function companyOptions(store) {
  const dir = store.getDoc('_dir');
  return [...new Set(Object.values(dir?.items || {}).filter(c => !c.deleted && c.org).map(c => c.org))]
    .sort((a, b) => a.localeCompare(b));
}
function contactByName(store, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return Object.values(store.getDoc('_dir')?.items || {}).find(c => !c.deleted && String(c.name || '').toLowerCase() === n) || null;
}

// Who owns a scope, read straight off the directory module's assignment doc.
// Kept as a guarded read rather than an import so tracking still runs on its
// own if the directory module is not registered.
function ownerChip(store, category, roomNo) {
  const asg = store.getDoc('_asg');
  const hit = Object.values(asg?.items || {}).find(a =>
    !a.deleted && a.category === category && (a.rooms || []).includes(String(roomNo)));
  const href = `#/assignments?cat=${encodeURIComponent(category)}&rooms=${encodeURIComponent(roomNo)}`;
  return hit
    ? `<a class="owner-chip" href="${href}" title="${esc(hit.role || 'Install')} · ${esc(hit.contactName || '')}">${ic('people')}${esc(hit.org || 'assigned')}</a>`
    : `<a class="owner-chip none" href="${href}">${ic('people')}assign</a>`;
}

function noteCount(doc) {
  return Object.entries(doc.notes || {}).filter(([id, n]) => !n.deleted && !isBuildNote(id, n)).length;
}


// ---------- bulk marking ----------
// Two entry points, one engine (store.planBulk / store.applyBulk):
//   1. Select mode on a room or space checklist: pick lines, pick a whole
//      category, then Mark checked / unchecked / Resolve / Flag in one patch.
//   2. The Bulk mark screen (#/bulk): one tag across many rooms.
// Every apply is previewed with the exact count and every line left alone is
// listed with its reason. Another person's initials are never restamped
// unless the user turns that on. Every apply has an Undo.
let bulkSel = null;               // { docId, ids: Set<itemId> } while select mode is on
const BULK_Q_KEY = 'h2sep-p-bulkq';
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// A document key shown to a PM: "Room 204 · MEP", "S221 · MEP", never a raw id.
function docLabel(id) {
  const m = String(id).match(/^(.*?)(-MEP|-M)?$/);
  const base = m[1], mep = !!m[2];
  return `${/^S/.test(base) ? base : 'Room ' + base}${mep ? ' · MEP' : ''}`;
}

function bulkOn(docId) { return !!(bulkSel && bulkSel.docId === docId); }
// The shell re-renders on every store emit; ending select mode from the bottom
// of a long checklist must not throw the reader back up the page.
function emitKeepingScroll(store) {
  const y = window.scrollY;
  store._emit();
  requestAnimationFrame(() => window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight)));
}
function bulkToggleRow(row, docId, itemId) {
  if (!bulkOn(docId)) return;
  if (bulkSel.ids.has(itemId)) bulkSel.ids.delete(itemId); else bulkSel.ids.add(itemId);
  row.classList.toggle('picked', bulkSel.ids.has(itemId));
  bulkRefreshBar();
}
function bulkRefreshBar() {
  const bar = document.querySelector('.bulkbar');
  if (!bar || !bulkSel) return;
  const n = bulkSel.ids.size;
  bar.querySelector('.cnt').innerHTML = `${n} selected<small> of ${bar.dataset.total}</small>`;
  bar.querySelectorAll('[data-act]:not([data-act="cancel"])').forEach(b => { b.disabled = n === 0; });
}
function pickallLabel(docId, entries) {
  return bulkOn(docId) && entries.length && entries.every(([id]) => bulkSel.ids.has(id)) ? 'clear' : 'select all';
}
function wirePickall(head, list, docId, entries) {
  const b = head.querySelector('.pickall');
  if (!b) return;
  const go = () => bulkCatToggle(list, docId, entries, b);
  b.addEventListener('click', go);
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
}
function bulkCatToggle(list, docId, entries, headEl) {
  if (!bulkOn(docId)) return;
  const ids = entries.map(([id]) => id);
  const allOn = ids.every(id => bulkSel.ids.has(id));
  for (const id of ids) { if (allOn) bulkSel.ids.delete(id); else bulkSel.ids.add(id); }
  list.querySelectorAll('.item-row[data-item]').forEach(r => r.classList.toggle('picked', bulkSel.ids.has(r.dataset.item)));
  if (headEl) headEl.textContent = allOn ? 'select all' : 'clear';
  bulkRefreshBar();
}
function bulkBar(ctx, docId, doc) {
  const { store } = ctx;
  const total = store.liveItems(doc).length;
  const bar = el(`<div class="bulkbar" data-total="${total}">
    <span class="cnt">0 selected<small> of ${total}</small></span>
    <span class="spacer"></span>
    <button class="btn primary" data-act="check" disabled>${ic('check')}Mark checked</button>
    <button class="btn" data-act="uncheck" disabled>Mark unchecked</button>
    <button class="btn" data-act="resolve" disabled>Resolve issues</button>
    <button class="btn" data-act="resolveAndCheck" disabled>Resolve and check</button>
    <button class="btn" data-act="flag:MISSING" disabled>${ic('flag', 'flag-ic')}Missing</button>
    <button class="btn" data-act="flag:IN BOX" disabled>${ic('flag', 'flag-ic')}In box</button>
    <button class="btn" data-act="setIssue" disabled>${ic('flag', 'flag-ic')}Other issue</button>
    <button class="btn" data-act="more" disabled>More…</button>
    <button class="btn" data-act="cancel">Cancel</button>
  </div>`);
  const run = (act) => {
    const targets = [...bulkSel.ids].map(itemId => ({ docId, itemId }));
    if (!targets.length) return;
    const go = (text) => bulkConfirm(ctx, targets, act.startsWith('flag:') ? 'setIssue' : act, { text, scopeLabel: docLabel(docId) }, () => { bulkSel = null; });
    if (act.startsWith('flag:')) go(act.slice(5));          // one-tap MISSING / IN BOX, straight to the preview
    else if (act === 'setIssue') issueTextSheet(ctx, go);
    else go('');
  };
  bar.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'cancel') { bulkSel = null; emitKeepingScroll(store); return; }
    if (act === 'more') {
      const A = store.constructor.BULK_ACTIONS;
      const { close } = sheet(`<div class="sh"><b style="font-size:15px">${bulkSel.ids.size} selected · do what?</b><button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
        <div style="display:grid;gap:8px">${[['flag:MISSING', 'Flag MISSING'], ['flag:IN BOX', 'Flag IN BOX'], ...Object.entries(A).filter(([k]) => k !== 'clearIssue').map(([k, l]) => [k, k === 'setIssue' ? 'Flag another issue' : l])].map(([k, l]) => `<button class="btn" data-more="${k}" style="justify-content:center;padding:12px">${l}</button>`).join('')}</div>`);
      document.querySelectorAll('.sheet [data-more]').forEach(x => x.addEventListener('click', () => { close(); run(x.dataset.more); }));
      return;
    }
    run(act);
  }));
  return bar;
}

// Ask for the issue text once, with the paper vocabulary, then continue.
function issueTextSheet(ctx, next) {
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">Flag an issue on the selected lines</b><button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="qps">${QUICK_PICKS.map(q => `<button class="qp" data-q="${q}">${q}</button>`).join('')}</div>
    <div class="field"><label>Or a custom note</label><input data-custom placeholder="Type what is wrong"/></div>
    <div class="srow"><button class="btn primary" data-next>Continue</button></div>`);
  const sh = document.querySelector('.sheet');
  let picked = '';
  sh.querySelectorAll('.qp').forEach(b => b.addEventListener('click', () => {
    picked = picked === b.dataset.q ? '' : b.dataset.q;
    sh.querySelectorAll('.qp').forEach(x => x.classList.toggle('on', x.dataset.q === picked));
  }));
  sh.querySelector('[data-next]').addEventListener('click', () => {
    const text = sh.querySelector('[data-custom]').value.trim() || picked;
    if (!text) { toast('Pick an issue or type one'); return; }
    close(); next(text);
  });
}

// One place that applies a plan, reports a refusal, watches the cloud acks,
// and offers Undo. Undo re-reads every line first and reports what it kept.
function bulkApplyAndToast(store, plan, verb) {
  const res = store.applyBulk(plan);
  if (!res) return null;
  if (res.error) { toast(res.error); return null; }
  toast(`${verb}: ${pl(res.lines, 'line')} in ${pl(res.docs, 'document')}`, { label: 'Undo', fn: () => {
    const r = store.undoBulk(res.entry);
    if (!r) { toast('Nothing to undo'); return; }
    toast(`Undone: ${pl(r.reverted, 'line')} reverted${r.skipped.length ? `, ${r.skipped.length} left alone (changed since, or gone)` : ''}`);
    r.done.then(({ failed, total }) => { if (failed) toast(`${failed} of ${total} documents did not save the undo`, { label: 'OK', fn: () => {} }); });
  } });
  res.done.then(({ failed, total }) => { if (failed) toast(`${failed} of ${total} documents did not save. Check the connection and try again.`, { label: 'OK', fn: () => {} }); });
  return res;
}
// The plan shown was computed at preview time. Re-plan at Apply; if the
// checklist moved underneath (another device, a line flagged since), show the
// new numbers instead of writing the stale ones.
function replanOrWarn(store, targets, action, opts, previewed) {
  const fresh = store.planBulk(targets, action, opts);
  if (fresh.changes.length !== previewed.changes.length || fresh.skipped.length !== previewed.skipped.length) {
    toast('The checklist changed since the preview. Look again, then Apply.');
    return null;
  }
  return fresh;
}

// The confirm sheet: exact count, exact skips with reasons, the restamp
// switch (off by default), Apply, and an Undo on the toast afterwards.
function bulkConfirm(ctx, targets, action, opts = {}, onDone) {
  const { store } = ctx;
  if (!store.user) return identityGate(ctx);
  let overwrite = false;
  const verb = store.constructor.BULK_ACTIONS[action] || action;
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">${esc(verb)}${opts.text ? ` · ${esc(opts.text)}` : ''}${opts.scopeLabel ? ` · ${esc(opts.scopeLabel)}` : ''}</b><button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div data-body></div>
    ${['check', 'uncheck', 'resolveAndCheck'].includes(action) ? `<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:10px"><input type="checkbox" data-overwrite/> Also restamp lines checked by someone else (their initials are field evidence; off unless you mean it)</label>` : ''}
    <div class="srow"><button class="btn" data-close>Cancel</button><button class="btn primary" data-apply>Apply</button></div>`);
  const sh = document.querySelector('.sheet');
  let plan = null;
  const render = () => {
    plan = store.planBulk(targets, action, { text: opts.text || '', overwriteChecked: overwrite });
    const byDoc = new Map();
    for (const c of plan.changes) byDoc.set(c.docId, (byDoc.get(c.docId) || 0) + 1);
    const byWhy = new Map();
    for (const k of plan.skipped) { if (!byWhy.has(k.why)) byWhy.set(k.why, []); byWhy.get(k.why).push(k); }
    const single = byDoc.size <= 1;
    const rows = single
      ? plan.changes.slice(0, 40).map(c => `<div class="prow"><span class="tag">${esc(shortCode(c) || '')}</span><span>${esc(c.label.length > 60 ? c.label.slice(0, 59) + '…' : c.label)}</span>${c.replaces ? `<span class="why">replaces "${esc(c.replaces)}"</span>` : ''}</div>`).join('')
        + (plan.changes.length > 40 ? `<div class="prow"><span class="why">and ${plan.changes.length - 40} more</span></div>` : '')
      : [...byDoc].slice(0, 60).map(([d, n]) => `<div class="prow"><span class="mono">${esc(docLabel(d))}</span><span>${pl(n, 'line')}</span></div>`).join('')
        + (byDoc.size > 60 ? `<div class="prow"><span class="why">and ${byDoc.size - 60} more documents</span></div>` : '');
    sh.querySelector('[data-body]').innerHTML = `
      <div class="preview">
        <div class="ph"><b>${plan.changes.length}</b> will change${byDoc.size > 1 ? ` in <b>${byDoc.size}</b> rooms` : ''} · <span class="n">${plan.skipped.length}</span> left alone${plan.replaced ? ` · <b style="color:var(--issue-ink)">${plan.replaced}</b> will have their issue text replaced` : ''}</div>
        ${rows}
        ${plan.skipped.length ? `<div class="skipsum"><b>Left alone (${plan.skipped.length})</b>${[...byWhy].map(([why, ks]) => `<div><b>${ks.length}</b> · ${esc(why)}${single ? `: ${esc(ks.slice(0, 8).map(k => shortCode(k) || k.itemId).join(', '))}${ks.length > 8 ? ', …' : ''}` : ''}</div>`).join('')}</div>` : '<div class="skipsum">Nothing left alone.</div>'}
      </div>`;
    const ap = sh.querySelector('[data-apply]');
    ap.disabled = plan.changes.length === 0;
    ap.textContent = plan.changes.length ? `Apply to ${pl(plan.changes.length, 'line')}` : 'Nothing to apply';
  };
  render();
  sh.querySelector('[data-overwrite]')?.addEventListener('change', e => { overwrite = e.target.checked; render(); });
  sh.querySelector('[data-apply]').addEventListener('click', () => {
    if (!plan || !plan.changes.length) return;
    const fresh = replanOrWarn(store, targets, action, { text: opts.text || '', overwriteChecked: overwrite }, plan);
    if (!fresh) { render(); return; }
    const res = bulkApplyAndToast(store, fresh, verb);
    if (!res) return;
    close();
    onDone && onDone(res);
    emitKeepingScroll(store);
  });
}

// ---------- Bulk mark screen: one tag across many rooms ----------
function bulkQ() {
  try { const q = JSON.parse(sessionStorage.getItem(BULK_Q_KEY)); if (q) return { floors: [], types: [], kind: 'ffe', cats: [], codes: [], action: 'check', text: '', ...q }; } catch { /* fresh */ }
  return { floors: [], types: [], kind: 'ffe', cats: [], codes: [], action: 'check', text: '' };
}
function setBulkQ(q) { sessionStorage.setItem(BULK_Q_KEY, JSON.stringify(q)); }
// One job, one row: keyed on category and label, so PTAC / PTAC-1 / an
// untagged "PTAC unit set and sealed" line on different floors collapse into
// a single row that names every code it covers.
const codeKey = (it) => `${it.category || 'Other'}|${String(it.label || '').trim().toLowerCase()}`;

function renderBulk(ctx) {
  const { store } = ctx;
  const q = bulkQ();
  const rooms = store.guestRooms();
  const spaces = store.spaces();
  const floors = floorsOf(rooms);
  const types = [...new Set(rooms.map(r => r.typeLabel || r.type))].sort();
  const parents = (q.kind.startsWith('space') ? spaces : rooms)
    .filter(r => !q.floors.length || q.floors.includes(Number(r.floor)))
    .filter(r => q.kind.startsWith('space') || !q.types.length || q.types.includes(r.typeLabel || r.type));
  const mep = q.kind.endsWith('mep');
  // Address documents by their STORE KEY, never by a field inside the payload.
  const keyOf = new Map(Object.entries(store.docs).map(([k, v]) => [v, k]));
  const docs = parents.map(r => mep ? store.mepDoc(r.number) : r).filter(Boolean).filter(d => keyOf.has(d));
  // Distinct lines across the scope, counted.
  const tags = new Map();
  for (const d of docs) for (const [, it] of store.liveItems(d)) {
    const k = codeKey(it);
    if (!tags.has(k)) tags.set(k, { key: k, category: it.category || 'Other', codes: new Set(), label: it.label || '', n: 0, unchecked: 0, open: 0 });
    const t = tags.get(k); t.n++; if (!it.checked) t.unchecked++; if (it.issue && !it.issueResolved) t.open++;
    for (const c of String(it.code || '').split('/').map(x => x.trim()).filter(Boolean)) t.codes.add(c);
  }
  const cats = [...new Set([...tags.values()].map(t => t.category))];
  const filterText = String(q.filter || '').trim().toLowerCase();
  const pickedKeys = new Set(q.codes);
  // A picked tag is always on screen, whatever the category chips or the
  // filter say: a bulk tool must never carry an armed pick out of sight.
  const shownTags = [...tags.values()]
    .filter(t => pickedKeys.has(t.key) || ((!q.cats.length || q.cats.includes(t.category))
      && (!filterText || `${[...t.codes].join(' ')} ${t.label}`.toLowerCase().includes(filterText))))
    .sort((a, b) => (pickedKeys.has(b.key) - pickedKeys.has(a.key)) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  const codesOf = (t) => { const c = [...t.codes]; return c.length ? (c.length > 3 ? `${c.slice(0, 3).join(' / ')} +${c.length - 3}` : c.join(' / ')) : '—'; };
  const typesOnFloors = new Set(rooms.filter(r => !q.floors.length || q.floors.includes(Number(r.floor))).map(r => r.typeLabel || r.type));
  const fam = (t) => /^King/.test(t) ? 'King' : /^(QQ|Queen)/.test(t) ? 'QQ' : '';
  const lastResult = q.lastResult || null;
  const picked = new Set(q.codes);
  const targets = [];
  if (picked.size) for (const d of docs) for (const [id, it] of store.liveItems(d)) if (picked.has(codeKey(it))) targets.push({ docId: keyOf.get(d), itemId: id });
  const planOpts = { text: q.text, overwriteChecked: !!q.overwrite };
  const plan = picked.size ? store.planBulk(targets, q.action, planOpts) : null;
  const A = store.constructor.BULK_ACTIONS;
  const D = store.constructor.BULK_DESTRUCTIVE;
  const lastUndo = store.loadUndo().slice(-1)[0];

  const root = el(`<div>
    <div class="pagehead"><h1 class="h1">Bulk mark</h1><span class="sub">one tag across many rooms · previewed, then one write per room · every apply has Undo</span></div>
    <div class="bulk-scope">
      <section class="card">
        <h3>Where</h3>
        <div class="chips" style="margin-bottom:8px">
          ${[['ffe', 'Rooms · FF&E'], ['mep', 'Rooms · MEP punch'], ['space-ffe', 'Common areas · FF&E'], ['space-mep', 'Common areas · MEP']].map(([k, l]) => `<button class="fl ${q.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}
        </div>
        <div class="chips" style="margin-bottom:8px">${floors.map(f => `<button class="fl ${q.floors.includes(f) ? 'on' : ''}" data-floor="${f}">Floor ${f}</button>`).join('')}</div>
        ${q.kind.startsWith('space') ? '' : `<div class="chips" style="margin-bottom:6px"><button class="fl" data-family="King">All King</button><button class="fl" data-family="QQ">All QQ</button><button class="fl" data-family="">Every type</button></div>
        <div class="chips">${types.map(tp => `<button class="fl ${q.types.includes(tp) ? 'on' : ''} ${typesOnFloors.has(tp) ? '' : 'dim'}" data-type="${esc(tp)}" title="${typesOnFloors.has(tp) ? '' : 'no rooms of this type on the picked floors'}">${esc(tp)}</button>`).join('')}</div>`}
        <div style="margin-top:10px;font-size:12.5px;color:var(--muted)"><b>${docs.length}</b> ${q.kind.startsWith('space') ? 'spaces' : 'rooms'} in scope${!q.floors.length && !q.types.length ? ' (every floor, every type; narrow it with the chips)' : ''}</div>
      </section>
      <section class="card">
        <h3>Which lines</h3>
        <div class="chips" style="margin-bottom:8px">${cats.map(c => `<button class="fl ${q.cats.includes(c) ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <input class="tagfilter" data-filter placeholder="Find a tag or a line (PTAC, grille, headboard)" value="${esc(q.filter || '')}"/>
        <div class="taglist">${shownTags.length ? shownTags.map(tg => `<label><input type="checkbox" data-code="${esc(tg.key)}" ${picked.has(tg.key) ? 'checked' : ''}/><span class="tag" title="${esc([...tg.codes].join(', '))}">${esc(codesOf(tg))}</span><span>${esc(tg.label.length > 48 ? tg.label.slice(0, 47) + '…' : tg.label)}</span><span class="tcount">${tg.unchecked} open of ${tg.n}${tg.open ? ` · ${pl(tg.open, 'issue')}` : ''}</span></label>`).join('') : '<div class="coming" style="padding:18px"><b>No lines match</b></div>'}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--subtle)">${pl(picked.size, 'tag')} picked · ${pl(targets.length, 'line')} in scope</div>
      </section>
      <section class="card">
        <h3>Do what</h3>
        <div class="chips">${Object.entries(A).flatMap(([k, l]) => {
          const chip = (key, label, on, preset) => `<button class="fl ${on ? 'on' : ''}" data-action="${key}" ${preset ? `data-preset="${preset}"` : ''} title="${D.includes(k) ? 'Changes or removes what is on the line' : ''}">${label}${D.includes(k) ? ' <span style="color:var(--issue-ink)">·</span>' : ''}</button>`;
          // One-tap flags sit ahead of the general "Flag an issue" (Austin, 2026-09-02: "add missing and in box to this area").
          if (k === 'setIssue') return [chip(k, 'Missing', q.action === k && q.text === 'MISSING', 'MISSING'), chip(k, 'In box', q.action === k && q.text === 'IN BOX', 'IN BOX'), chip(k, l, q.action === k && !['MISSING', 'IN BOX'].includes(q.text), '')];
          return [chip(k, l, q.action === k, '')];
        }).join('')}</div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--subtle)">A red dot marks an action that changes or removes what is already on a line.</div>
        ${q.action === 'setIssue' ? `<div class="qps" style="margin-top:8px">${QUICK_PICKS.map(x => `<button class="qp ${q.text === x ? 'on' : ''}" data-q="${x}">${x}</button>`).join('')}</div><div class="field"><label>Or a custom note</label><input data-custom value="${QUICK_PICKS.includes(q.text) ? '' : esc(q.text)}" placeholder="Type what is wrong"/></div>` : ''}
        ${['check', 'uncheck', 'resolveAndCheck'].includes(q.action) ? `<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:10px"><input type="checkbox" data-overwrite ${q.overwrite ? 'checked' : ''}/> Also restamp lines checked by someone else</label>` : ''}
      </section>
      <section class="card">
        <h3>Preview</h3>
        ${lastResult ? `<div class="preview done"><div class="ph">${ic('check')}<b>Done</b> · ${esc(lastResult.label)} · ${fmtWhen(lastResult.at)}</div></div>` : ''}
        ${plan ? bulkPreviewHtml(plan) : '<div class="coming" style="padding:18px"><b>Pick at least one tag</b><span>The preview shows exactly what will change and what is left alone, per room.</span></div>'}
        <div class="srow" style="margin-top:10px">${lastUndo ? `<button class="btn" data-undo-last title="${esc(lastUndo.label)}">Undo last bulk edit</button>` : ''}<button class="btn primary" data-apply ${plan && plan.changes.length && !(q.action === 'setIssue' && !q.text) ? '' : 'disabled'}>${ic('check')}${q.action === 'setIssue' && !q.text ? 'Pick an issue first' : plan && plan.changes.length ? `Apply to ${pl(plan.changes.length, 'line')}` : 'Nothing to apply'}</button></div>
      </section>
    </div>
  </div>`);
  const save = (patch) => { setBulkQ({ ...q, ...patch }); location.hash = '#/bulk'; dispatchEvent(new HashChangeEvent('hashchange')); };
  const toggleIn = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  root.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => save({ kind: b.dataset.kind, cats: [], codes: [] })));
  root.querySelectorAll('[data-floor]').forEach(b => b.addEventListener('click', () => save({ floors: toggleIn(q.floors, Number(b.dataset.floor)) })));
  root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => save({ types: toggleIn(q.types, b.dataset.type) })));
  root.querySelectorAll('[data-family]').forEach(b => b.addEventListener('click', () => save({ types: b.dataset.family ? types.filter(tp => fam(tp) === b.dataset.family) : [] })));
  root.querySelector('[data-filter]')?.addEventListener('input', e => { const v = e.target.value; clearTimeout(root._ft); root._ft = setTimeout(() => save({ filter: v }), 250); });
  root.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => save({ cats: toggleIn(q.cats, b.dataset.cat) })));
  root.querySelectorAll('[data-code]').forEach(b => b.addEventListener('change', () => save({ codes: toggleIn(q.codes, b.dataset.code) })));
  root.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => save({ action: b.dataset.action, text: b.dataset.preset || (b.dataset.action === 'setIssue' && ['MISSING', 'IN BOX'].includes(q.text) ? '' : q.text) })));
  root.querySelectorAll('.qp').forEach(b => b.addEventListener('click', () => save({ text: q.text === b.dataset.q ? '' : b.dataset.q })));
  root.querySelector('[data-custom]')?.addEventListener('change', e => save({ text: e.target.value.trim() }));
  root.querySelector('[data-overwrite]')?.addEventListener('change', e => save({ overwrite: e.target.checked }));
  root.querySelector('[data-apply]').addEventListener('click', () => {
    if (!plan || !plan.changes.length) return;
    if (!store.user) return identityGate(ctx);
    if (q.action === 'setIssue' && !q.text) { toast('Pick an issue or type one'); return; }
    const fresh = replanOrWarn(store, targets, q.action, planOpts, plan);
    if (!fresh) { store._emit(); return; }
    const res = bulkApplyAndToast(store, fresh, A[q.action]);
    if (res) save({ lastResult: { label: res.entry.label, at: res.entry.at } });
  });
  root.querySelector('[data-undo-last]')?.addEventListener('click', () => {
    const r = store.undoBulk(lastUndo);
    if (!r) { toast('Nothing to undo'); return; }
    toast(`Undone: ${pl(r.reverted, 'line')} reverted${r.skipped.length ? `, ${r.skipped.length} left alone (changed since, or gone)` : ''}`);
    save({ lastResult: { label: `Undone: ${lastUndo.label}`, at: new Date().toISOString() } });
  });
  return root;
}

function bulkPreviewHtml(plan) {
  const byDoc = new Map();
  for (const c of plan.changes) byDoc.set(c.docId, (byDoc.get(c.docId) || 0) + 1);
  const skipByDoc = new Map();
  for (const k of plan.skipped) { if (!skipByDoc.has(k.docId)) skipByDoc.set(k.docId, new Map()); const m = skipByDoc.get(k.docId); m.set(k.why, (m.get(k.why) || 0) + 1); }
  const byWhy = new Map();
  for (const k of plan.skipped) byWhy.set(k.why, (byWhy.get(k.why) || 0) + 1);
  // Only the exceptions are worth a row: a document with something left alone,
  // or with a count that differs from the common case. The rest collapse.
  const counts = [...byDoc.values()];
  const mode = counts.length ? counts.sort((a, b) => counts.filter(v => v === a).length - counts.filter(v => v === b).length).pop() : 0;
  const ids = [...new Set([...byDoc.keys(), ...skipByDoc.keys()])].sort();
  // Rooms that read exactly alike collapse into one row once there are more
  // than four of them; the exceptions keep their own row.
  const sig = (d) => `${byDoc.get(d) || 0}|${skipByDoc.has(d) ? [...skipByDoc.get(d)].map(([w, n]) => `${n} ${w}`).join(' · ') : ''}`;
  const groups = new Map();
  for (const d of ids) { const g = sig(d); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(d); }
  const shown = ids.filter(d => groups.get(sig(d)).length <= 4 && (skipByDoc.has(d) || (byDoc.get(d) || 0) !== mode));
  const collapsed = [...groups].filter(([, ds]) => ds.length > 4 && ds.some(d => skipByDoc.has(d) || (byDoc.get(d) || 0) !== mode));
  const hidden = ids.length - shown.length - collapsed.reduce((n, [, ds]) => n + ds.length, 0);
  return `<div class="preview">
    <div class="ph"><b>${plan.changes.length}</b> will change in <b>${byDoc.size}</b> ${byDoc.size === 1 ? 'room' : 'rooms'} · <span class="n">${plan.skipped.length}</span> left alone${plan.replaced ? ` · <b style="color:var(--issue-ink)">${plan.replaced}</b> will have their issue text replaced` : ''}</div>
    ${shown.slice(0, 60).map(d => `<div class="prow"><span class="mono">${esc(docLabel(d))}</span><span>${byDoc.get(d) ? `${pl(byDoc.get(d), 'line')} change` : 'no change'}</span><span class="why">${skipByDoc.has(d) ? [...skipByDoc.get(d)].map(([w, n]) => `${n} ${esc(w)}`).join(' · ') : ''}</span></div>`).join('')}
    ${shown.length > 60 ? `<div class="prow"><span class="why">and ${shown.length - 60} more exceptions</span></div>` : ''}
    ${collapsed.map(([g, ds]) => { const [n, why] = g.split('|'); return `<div class="prow"><span class="mono">${pl(ds.length, 'room')}</span><span>${Number(n) ? `${pl(Number(n), 'line')} change each` : 'no change'}</span><span class="why">${esc(why)}</span></div>`; }).join('')}
    ${hidden ? `<div class="prow"><span class="why">${hidden === ids.length ? `${pl(hidden, 'room')}, ${mode === 1 ? '1 line each' : mode + ' lines each'}` : `and ${pl(hidden, 'more room')} · ${mode === 1 ? '1 line each' : mode + ' lines each'}`}</span></div>` : ''}
    ${plan.skipped.length ? `<div class="skipsum"><b>Left alone (${plan.skipped.length})</b>${[...byWhy].map(([w, n]) => `<div><b>${n}</b> · ${esc(w)}</div>`).join('')}</div>` : '<div class="skipsum">Nothing left alone.</div>'}
  </div>`;
}

// Check the same line (same category and label, the way Bulk mark merges tags)
// on every document of the same kind on this floor. Goes through the bulk
// confirm sheet, so the count, the lines left alone and their reasons show
// before anything is written, and the apply has an Undo (D57).
function wholeFloorCheck(ctx, docId, itemId) { wholeFloorApply(ctx, docId, itemId, 'check'); }

// The same line on every other document of this kind on this floor: a guest
// room walks the floor's guest rooms, a common area the floor's common areas,
// a punch doc the punch docs of its own kind.
function wholeFloorTargets(ctx, docId, itemId) {
  const { store } = ctx;
  const doc = store.getDoc(docId); const it = doc?.items?.[itemId];
  if (!doc || !it) return null;
  const floor = Number(doc.floor);
  const isSpace = String(doc.type || '').startsWith('space-');
  const isMep = store.constructor.MEP_SUFFIXES.some(sfx => docId.endsWith(sfx)) || doc.type === 'mep-punch';
  const keyOf = new Map(Object.entries(store.docs).map(([k, v]) => [v, k]));
  const parents = (isSpace ? store.spaces() : store.guestRooms()).filter(d => Number(d.floor) === floor);
  const docs = parents.map(d => isMep ? store.mepDoc(d.number) : d).filter(d => d && keyOf.get(d) !== docId);
  const want = codeKey(it);
  const targets = [];
  for (const d of docs) for (const [id, x] of store.liveItems(d)) if (codeKey(x) === want) targets.push({ docId: keyOf.get(d), itemId: id });
  return { floor, isSpace, isMep, docs, targets, kind: isSpace ? 'common area' : 'room' };
}

// One floor-wide action from a single line: 'check' (D57/D58) or 'setIssue'
// with the flag text (D59, "Missing" for the whole floor). Always through the
// bulk confirm sheet, so the count and the lines left alone show first.
function wholeFloorApply(ctx, docId, itemId, action, text = '') {
  const w = wholeFloorTargets(ctx, docId, itemId);
  if (!w) return;
  if (!w.targets.length) { toast(`No other ${w.kind} on floor ${w.floor} carries this line`); return; }
  bulkConfirm(ctx, w.targets, action, { text, scopeLabel: `Floor ${w.floor} · ${pl(w.docs.length, 'other ' + w.kind)}` });
}

// The one check path for every line on every screen: a tap on a row and the
// stamp inside the line sheet both land here, so the whole-floor offer follows
// every check-off (D57, widened by D58): FF&E, MEP punch, common area and its
// punch, and a flagged line or one with an issue once its sheet is open.
function checkWithFloorOffer(ctx, docId, itemId) {
  const { store } = ctx;
  const it = store.getDoc(docId)?.items?.[itemId];
  if (!it) return;
  const wasChecked = !!it.checked;   // the store mutates this line in place
  store.check(docId, itemId, !wasChecked);
  if (wasChecked) return;
  toast(`Checked ${it.code || it.label}`, [
    { label: 'Undo', fn: () => store.check(docId, itemId, false) },
    { label: `Whole floor ${store.getDoc(docId)?.floor ?? ''}`, fn: () => wholeFloorCheck(ctx, docId, itemId) },
  ]);
}

function itemRow(ctx, docId, itemId, it) {
  const { store } = ctx;
  const flagged = it.reliability === 'FLAGGED';
  const openIssue = it.issue && !it.issueResolved;
  const sel = bulkOn(docId);
  const row = el(`<div class="item-row ${flagged ? 'flagged' : ''} ${sel ? 'selectable' : ''} ${sel && bulkSel.ids.has(itemId) ? 'picked' : ''}" role="button" tabindex="0" data-item="${esc(itemId)}"
      aria-label="${esc(it.label)}${it.checked ? ', checked' : ''}">
    <span class="stamp ${it.checked ? 'checked' : ''}">${it.checked ? esc(it.initials || '✓') : ''}</span>
    <span class="mid">
      <span class="l1">
        ${shortCode(it) ? `<span class="tag">${esc(shortCode(it))}</span>` : ''}
        <span class="nm">${esc(shortLabel(it))}</span>
        ${it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ''}
        ${flagged ? `<span class="chip hold sm">FLAGGED</span>` : ''}
        ${it.optional ? `<span class="chip ns sm" title="Counts only once it is checked">IF NEEDED</span>` : ''}
      </span>
      <span class="l2">
        ${openIssue ? `<span class="issue-pill">${ic('flag', 'flag-ic')}${esc(it.issue)}</span>` : it.issue ? `<span class="issue-done" title="Issue resolved">resolved · ${esc(it.issue)}</span>` : ''}
        ${specRef(it)}
        ${it.checked ? `<span class="meta">${esc(it.initials)}${it.checkedByCo ? ` · <b class="co">${esc(shortCo(it.checkedByCo))}</b>` : ''} · ${it.checkedAt ? fmtWhen(it.checkedAt) : 'from paper'}</span>` : ''}
        ${(it.attachments || []).length ? `<span class="detail-cue clip">${ic('clip')}${(it.attachments).length}</span>` : ''}
        ${hasDetail(it) ? `<span class="detail-cue">${ic('note')}details</span>` : ''}
      </span>
    </span>
  </div>`);

  pressable(row, {
    tap: () => {
      if (bulkOn(docId)) return bulkToggleRow(row, docId, itemId);
      if (!store.user) return identityGate(ctx);
      if (openIssue || flagged) return itemSheet(ctx, docId, itemId);   // a resolved issue is history, not a flag (D50)
      checkWithFloorOffer(ctx, docId, itemId);
    },
    hold: () => itemSheet(ctx, docId, itemId),
  });
  return row;
}

function itemSheet(ctx, docId, itemId) {
  const { store } = ctx;
  const doc = store.getDoc(docId);
  const it = doc.items[itemId];
  // D59: the issue picked here can go to the whole floor of this kind.
  const floorScope = (() => {
    const w = wholeFloorTargets(ctx, docId, itemId);
    if (!w || !w.targets.length) return null;
    return { kindWord: (w.isSpace ? 'common area' : 'guest room') + (w.isMep ? ' punch list' : '') };
  })();
  const { close } = sheet(`
    <div class="sh">
      ${shortCode(it) ? `<span class="tag">${esc(shortCode(it))}</span>` : ''}
      <b style="font-size:15px">${esc(shortLabel(it))}</b>
      ${it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ''}
      <button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button>
    </div>
    ${shortLabel(it) !== (it.label || '') || (it.code && String(it.code).length > 10) || String(it.src || '').includes(';') ? `<div class="fulldetail">${it.code && String(it.code).length > 10 ? `<div class="fd-code">${esc(it.code)}</div>` : ''}${shortLabel(it) !== (it.label || '') ? `<div>${esc(it.label)}</div>` : ''}${String(it.src || '').includes(';') ? `<div class="fd-src"><span>Sources</span> ${esc(fullSrc(it))}</div>` : ''}</div>` : ''}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <button class="stamp big ${it.checked ? 'checked' : ''}" data-check>${it.checked ? esc(it.initials) : ''}</button>
      <div style="font-size:13px">${it.checked ? `<b>Checked</b> · ${esc(it.initials)}${it.checkedByCo ? ' · ' + esc(it.checkedByCo) : ''}${it.checkedAt ? ' · ' + fmtWhen(it.checkedAt) : ' · from paper'}` : '<b>Not checked off</b> · tap the box to stamp your initials'}</div>
      <span class="spacer"></span>${specRef(it)}
    </div>
    ${it.checked && floorScope ? `<button class="btn" data-floor-check style="margin-bottom:8px">Check this on the whole floor ${esc(String(doc.floor))}</button>` : ''}
    ${it.reliability === 'FLAGGED' && it.instanceNote ? `<div class="conflict"><div class="ch">${ic('flag', 'flag-ic')}FLAGGED · SOURCES DISAGREE</div><div style="font-size:13px;padding:6px 0">${esc(it.instanceNote)}</div><div class="foot">Do not order or close from either position. Only Austin closes conflicts.</div></div>` : ''}
    ${it.reliability !== 'FLAGGED' && it.instanceNote ? `<div class="vnote"><div class="vn-h">Verification notes</div><div>${esc(it.instanceNote)}</div></div>` : ''}
    ${(it.attachments || []).length ? `<div class="attaches">${it.attachments.map(a => `<a class="btn attach" href="${esc(a.url)}" target="_blank" rel="noopener">${ic('clip')}${esc(a.label)}</a>`).join('')}</div>` : ''}
    ${it.issue && it.issueResolved ? `<div class="vnote" style="margin-bottom:8px"><div class="vn-h">Issue resolved</div><div>"${esc(it.issue)}" was raised on this line and has been resolved. It no longer counts as a flag anywhere. Clear it to erase the record, or pick a new issue below if the problem is back.</div></div>` : ''}
    <div class="field"><label>Issue</label></div>
    <div class="qps">${QUICK_PICKS.map(q => `<button class="qp ${it.issue === q ? 'on' : ''}" data-q="${q}">${q}</button>`).join('')}</div>
    <div class="field"><label>Custom note on the issue</label>
      <input data-custom placeholder="${it.issue && !QUICK_PICKS.includes(it.issue) ? esc(it.issue) : 'Type what is wrong (optional)'}" value="${!QUICK_PICKS.includes(it.issue || '') ? esc(it.issue || '') : ''}"/></div>
    ${floorScope ? `<label class="floor-opt" style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;margin:10px 0 4px;cursor:pointer"><input type="checkbox" data-floor style="margin-top:2px"/><span>Also flag this line on every other ${esc(floorScope.kindWord)} on floor ${esc(String(doc.floor))}. Save picks the flag above (Missing, In box, or your note); a count shows before anything is written.</span></label>` : ''}
    <div class="srow">
      ${it.issue && !it.issueResolved ? '<button class="btn" data-resolve>Mark issue resolved</button>' : ''}
      ${it.issue ? '<button class="btn" data-clear>Clear issue</button>' : ''}
      <button class="btn primary" data-save>Save</button>
    </div>`);

  const sheetEl = document.querySelector('.sheet');
  sheetEl.querySelector('[data-check]').addEventListener('click', () => {
    if (!store.user) { close(); return identityGate(ctx); }
    close(); checkWithFloorOffer(ctx, docId, itemId);   // D58: the sheet's stamp offers the floor too
  });
  let picked = QUICK_PICKS.includes(it.issue || '') ? it.issue : '';
  sheetEl.querySelectorAll('.qp').forEach(b => b.addEventListener('click', () => {
    picked = picked === b.dataset.q ? '' : b.dataset.q;
    sheetEl.querySelectorAll('.qp').forEach(x => x.classList.toggle('on', x.dataset.q === picked));
  }));
  sheetEl.querySelector('[data-save]').addEventListener('click', () => {
    const custom = sheetEl.querySelector('[data-custom]').value.trim();
    const issue = custom || picked;
    const floorToo = !!issue && !!sheetEl.querySelector('[data-floor]')?.checked;
    if (issue !== (it.issue || '')) store.setIssue(docId, itemId, issue);
    close();
    if (floorToo) wholeFloorApply(ctx, docId, itemId, 'setIssue', issue);   // D59
  });
  sheetEl.querySelector('[data-floor-check]')?.addEventListener('click', () => { close(); wholeFloorApply(ctx, docId, itemId, 'check'); });   // D61
  sheetEl.querySelector('[data-resolve]')?.addEventListener('click', () => { store.resolveIssue(docId, itemId); close(); });
  sheetEl.querySelector('[data-clear]')?.addEventListener('click', () => { store.setIssue(docId, itemId, ''); close(); });
}

function notesSheet(ctx, roomNo) {
  const { store } = ctx;
  const doc = store.getDoc(roomNo);
  const allNotes = Object.entries(doc.notes || {}).filter(([, n]) => !n.deleted)
    .sort((a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)));
  const notes = allNotes.filter(([id, n]) => !isBuildNote(id, n));
  const buildNotes = allNotes.filter(([id, n]) => isBuildNote(id, n));
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">Room ${esc(roomNo)} notes</b><button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="card" style="margin-bottom:10px">${notes.length ? notes.map(([id, n]) => `
      <div class="note-row ${n.resolved ? 'resolved' : ''}">
        <span class="nfl ${n.flag === 'issue' ? 'issue' : 'info'}">${n.flag === 'issue' ? 'ISSUE' : 'INFO'}</span>
        <span class="nt">${esc(n.text)}</span>
        <span class="nd">${n.by ? esc(n.by) + ' · ' : ''}${fmtWhen(n.createdAt)}</span>
        ${!n.resolved ? `<button class="btn" style="padding:3px 9px;font-size:11px" data-res="${id}">Resolve</button>` : ''}
      </div>`).join('') : '<div class="coming" style="padding:22px"><b>No notes yet</b></div>'}</div>
    ${buildNotes.length ? `<details class="build-notes"><summary>Document notes from the build (${buildNotes.length}) · office reference, not crew flags</summary>${buildNotes.map(([, n]) => `<div class="note-row"><span class="nfl info">BUILD</span><span class="nt">${esc(n.text)}</span></div>`).join('')}</details>` : ''}
    <div class="field"><label>New note</label><textarea data-text rows="2" placeholder="Whole-room note, like the star notes on paper"></textarea></div>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" data-flag/> Mark as issue (red)</label>
      <span class="spacer"></span><button class="btn primary" data-add>Add note</button>
    </div>`);
  const s = document.querySelector('.sheet');
  s.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => { store.resolveNote(roomNo, b.dataset.res); close(); notesSheet(ctx, roomNo); }));
  s.querySelector('[data-add]').addEventListener('click', () => {
    const text = s.querySelector('[data-text]').value.trim();
    if (!text) return;
    if (!store.user) { close(); return identityGate(ctx); }
    store.addNote(roomNo, text, s.querySelector('[data-flag]').checked ? 'issue' : 'info');
    close(); notesSheet(ctx, roomNo);
  });
}

export function identityGate(ctx) {
  const { store } = ctx;
  const u = store.user;
  let orgs = companyOptions(store);
  // The directory arrives over live sync, often seconds AFTER this sheet opens
  // on a fresh device - which left the company list empty. Subscribe while the
  // sheet is up and refill the options the moment the directory lands.
  let unsub = null;
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">Who is checking?</b></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:4px">Your initials go on every box you check, exactly like initialing the paper sheet. Your company rides along with them, so anyone reading the list knows which outfit signed the line.</div>
    <div class="field"><label>Your name</label><input data-name maxlength="40" placeholder="Full name" value="${esc(u?.name || '')}"/></div>
    <div class="field"><label>Initials</label><input data-init maxlength="3" placeholder="AB" value="${esc(u?.initials || '')}" style="width:110px;text-transform:uppercase;font-family:var(--mono);font-weight:700"/></div>
    <div class="field"><label>Company you work for</label>
      <select data-co>
        <option value="">Pick your company</option>
        ${orgs.map(o => `<option ${u?.company === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        <option value="__other" ${u?.company && !orgs.includes(u.company) ? 'selected' : ''}>Not on the list, type it</option>
      </select></div>
    <div class="field" data-otherwrap style="display:${u?.company && !orgs.includes(u.company) ? 'block' : 'none'}"><label>Company name</label>
      <input data-other maxlength="60" placeholder="Company name" value="${esc(u?.company && !orgs.includes(u.company) ? u.company : '')}"/></div>
    <div class="srow"><button class="btn primary" data-go>Start</button></div>`, { onClose: () => { if (unsub) unsub(); } });
  const s = document.querySelector('.sheet');
  const nameEl = s.querySelector('[data-name]'), initEl = s.querySelector('[data-init]');
  const coEl = s.querySelector('[data-co]'), otherEl = s.querySelector('[data-other]');
  const otherWrap = s.querySelector('[data-otherwrap]');
  const fillCompanies = () => {
    const now = companyOptions(store);
    if (now.length === orgs.length) return;
    orgs = now;
    const picked = coEl.value;
    coEl.innerHTML = `<option value="">Pick your company</option>`
      + orgs.map(o => `<option>${esc(o)}</option>`).join('')
      + `<option value="__other">Not on the list, type it</option>`;
    if (picked && [...coEl.options].some(o => o.value === picked)) coEl.value = picked;
  };
  unsub = store.subscribe(fillCompanies);
  fillCompanies();
  let touched = !!u?.initials, coTouched = !!u?.company;
  initEl.addEventListener('input', () => { touched = true; });
  coEl.addEventListener('change', () => {
    coTouched = true;
    otherWrap.style.display = coEl.value === '__other' ? 'block' : 'none';
  });
  nameEl.addEventListener('input', () => {
    if (!touched) initEl.value = nameEl.value.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3);
    // If they are already in the project directory, their company is known.
    const hit = contactByName(store, nameEl.value);
    if (hit && !coTouched && orgs.includes(hit.org)) coEl.value = hit.org;
  });
  s.querySelector('[data-go]').addEventListener('click', () => {
    if (!initEl.value.trim()) { toast('Initials are required to check items'); return; }
    const company = coEl.value === '__other' ? otherEl.value.trim() : coEl.value;
    if (!company) { toast('Pick the company you work for'); return; }
    if (unsub) unsub();
    store.setUser(nameEl.value || initEl.value, initEl.value, company);
    close();
  });
}

// ---------- common areas (the spaces on every built floor) ----------

function spaceRow(ctx, sp) {
  const { store } = ctx;
  const mep = store.mepDoc(sp.number);
  const a = store.roomStats(sp);
  const b = mep ? store.roomStats(mep) : { total: 0, done: 0, openIssues: 0 };
  const total = a.total + b.total, done = a.done + b.done, issues = a.openIssues + b.openIssues;
  const complete = total > 0 && done === total && issues === 0;
  const status = complete ? ['done', 'Done'] : issues > 0 ? ['issue', 'Issues'] : done > 0 ? ['prog', 'In Progress'] : ['ns', 'Not Started'];
  const row = el(`<div class="room-row" role="link" tabindex="0" aria-label="Open ${esc(sp.typeLabel || sp.number)}">
    <span class="rno mono" style="width:64px;font-size:13px">${esc(sp.number)}</span>
    <span class="rtype">${esc(sp.typeLabel || sp.type)}</span>
    <span class="chip ${status[0]} sm"><i class="dot"></i>${status[1]}</span>
    <span class="riss ${issues ? '' : 'none'}">${issues ? ic('flag', 'flag-ic') + ' ' + issues + ' open' : '0 open'}</span>
    <span class="rfrac">${done}/${total}</span>
    ${ic('chev', 'chev')}
  </div>`);
  pressable(row, { tap: () => { location.hash = `#/space/${sp.number}`; } });
  return row;
}

function renderCommon(ctx) {
  const { store } = ctx;
  const spaces = store.spaces();
  if (!spaces.length) {
    return comingSoon('Common Areas', 'The common-area spaces arrive with the data rollout.')();
  }
  let total = 0, done = 0, issues = 0;
  for (const sp of spaces) {
    const mep = store.mepDoc(sp.number);
    for (const d of [sp, mep].filter(Boolean)) {
      const st = store.roomStats(d);
      total += st.total; done += st.done; issues += st.openIssues;
    }
  }
  const root = el(`<div>
    <div class="pagehead"><h1 class="h1">Common Areas</h1>
      <span class="sub">${spaces.length} spaces on ${esc(floorRange(spaces))} \u00b7 plan numbering from the architectural set</span></div>
    <div class="kpis">
      <div class="kpi"><div class="kl">Lines checked</div><div class="kv">${done}<small> of ${total}</small></div><div class="kc">FF&amp;E and MEP punch together</div></div>
      <div class="kpi"><div class="kl">Open issues</div><div class="kv">${issues}</div><div class="kc">flags and red space notes</div></div>
      <div class="kpi"><div class="kl">Spaces</div><div class="kv">${spaces.length}</div><div class="kc">every space with a package</div></div>
    </div>
    <section class="card"><div class="rlist"></div></section>
  </div>`);
  const list = root.querySelector('.rlist');
  const byFloor = [...spaces].sort((a, b) => (Number(a.floor) - Number(b.floor)) || String(a.typeLabel || a.number).localeCompare(String(b.typeLabel || b.number)));
  appendByFloor(list, byFloor, sp => sp.floor, sp => spaceRow(ctx, sp));
  return root;
}

function renderSpace(ctx, { id }) {
  const { store } = ctx;
  const doc = store.getDoc(id);
  if (!doc) return el(`<div class="coming">${ic('layers')}<b>${esc(id)} is not in this build</b>
    <span>Only spaces with a package are built.</span></div>`);
  const mep = store.mepDoc(id);
  const view = new URLSearchParams((location.hash.split('?')[1] || '')).get('view') === 'mep' && mep ? 'mep' : 'ffe';
  const active = view === 'mep' ? mep : doc;
  const s = store.roomStats(active);
  const activeId = view === 'mep' ? store.mepDocId(id) : id;

  const root = el(`<div>
    <div class="pagehead">
      <button class="icon-btn" data-back aria-label="Back to common areas">${ic('back')}</button>
      <div><h1 class="h1">${esc(doc.typeLabel || doc.type)}</h1>
      <div class="sub">Space ${esc(doc.number)} \u00b7 Floor ${esc(doc.floor)}</div></div>
      <span class="spacer"></span>
      <div class="hdr-actions">
        <a class="btn" href="#/print/${esc(id)}">${ic('printer')}Print sheet</a>
        <button class="btn" data-note>${ic('note')}Space notes${noteCount(doc) ? ` \u00b7 ${noteCount(doc)}` : ''}</button>
      </div>
    </div>
    ${mep ? `<div class="filters"><span class="seg">
      <button data-v="ffe" class="${view === 'ffe' ? 'on' : ''}">FF&amp;E \u00b7 ${store.roomStats(doc).done}/${store.roomStats(doc).total}</button>
      <button data-v="mep" class="${view === 'mep' ? 'on' : ''}">MEP PUNCH \u00b7 ${store.roomStats(mep).done}/${store.roomStats(mep).total}</button>
    </span></div>` : ''}
    <section class="card">
      <div class="card-head"><h2>${view === 'mep' ? 'MEP punch' : 'Checklist'}</h2>
        <span class="card-cap">${s.done} of ${s.total} checked</span><span class="spacer"></span>
        <span class="bar cy" style="width:130px"><i style="width:${s.total ? s.done / s.total * 100 : 0}%"></i></span>
        <button class="btn ${bulkOn(activeId) ? 'primary' : ''}" data-bulk style="margin-left:10px;padding:5px 10px;font-size:12px">${ic('check')}${bulkOn(activeId) ? 'Done selecting' : 'Select lines'}</button></div>
      <div class="how" style="padding:8px 16px;color:var(--subtle);font-size:11.5px">${bulkOn(activeId) ? 'Select mode: tap lines or a whole category, then choose an action below.' : 'Tap a line to stamp your initials. Press and hold for the issue sheet.'}</div>
      <div class="ilist"></div>
    </section>
  </div>`);
  root.querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/common'; });
  root.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
    location.hash = `#/space/${id}` + (b.dataset.v === 'mep' ? '?view=mep' : '');
  }));
  root.querySelector('[data-note]').addEventListener('click', () => notesSheet(ctx, id));

  const list = root.querySelector('.ilist');
  if (bulkSel && bulkSel.docId !== activeId) bulkSel = null;
  root.querySelector('[data-bulk]').addEventListener('click', () => { bulkSel = bulkOn(activeId) ? null : { docId: activeId, ids: new Set() }; store._emit(); });
  for (const [cat, entries] of groupByCategory(store.liveItems(active))) {
    const counted = entries.filter(([, it]) => counts(it));
    const done = counted.filter(([, it]) => it.checked).length;
    const head = el(`<div class="cat-head">${esc(cat)}<span style="letter-spacing:0">\u00b7</span><span>${done} of ${counted.length} checked</span>${bulkOn(activeId) ? `<span class="pickall" role="button" tabindex="0">${pickallLabel(activeId, entries)}</span>` : ''}</div>`);
    wirePickall(head, list, activeId, entries);
    list.append(head);
    for (const [iid, it] of entries) list.append(itemRow(ctx, activeId, iid, it));
  }
  if (bulkOn(activeId)) { root.append(bulkBar(ctx, activeId, active)); queueMicrotask(bulkRefreshBar); }
  return root;
}

function comingSoon(title, body) {
  return () => el(`<div><div class="pagehead"><h1 class="h1">${esc(title)}</h1></div>
    <section class="card"><div class="coming">${ic('wrench')}<b>${esc(title)} ships with the full rollout</b><span>${esc(body)} The approved mock for this screen is in the Mock Book, and the module slot is already registered.</span></div></section></div>`);
}

function renderActivity(ctx) {
  const { store } = ctx;
  const acts = [...store.activity].reverse();
  return el(`<div>
    <div class="pagehead"><h1 class="h1">Activity</h1><span class="sub">every action in this browser, newest first</span></div>
    <section class="card">${acts.length ? acts.map(a => `
      <div class="note-row"><span class="nfl info">${esc(a.by)}</span><span class="nt">${esc(a.text)}${a.byCo ? ` <b class="co">${esc(shortCo(a.byCo))}</b>` : ''}</span><span class="nd">${fmtWhen(a.at)}</span></div>`).join('')
      : `<div class="coming">${ic('pulse')}<b>Nothing yet</b><span>Check a line in any room and it lands here with your initials and a timestamp.</span></div>`}</section>
  </div>`);
}

// ---------- print sheet (live data, paper-styled, like the first build) ----------

// One paper sheet for one document (a room or a common-area space), FF&E then
// MEP, generated from the live store at the moment it is drawn. The router
// re-renders on every store change, so an open sheet updates as lines are
// checked off; the GENERATED stamp is the moment of the last redraw.
function paperHtml(store, no) {
  const doc = store.getDoc(no);
  if (!doc) return `<div class="paper"><div class="coming"><b>${esc(no)} is not in this build</b></div></div>`;
  const mep = store.mepDoc(no);
  const now = new Date();
  const stamp = `${now.toLocaleDateString('en-US')} · ${fmtWhen(now.toISOString())}`;
  const isSpace = String(doc.type || '').startsWith('space-');
  function section(title, d) {
    const groups = groupByCategory(store.liveItems(d));
    let html = '';
    for (const [cat, entries] of groups) {
      html += `<div class="p-cat">${esc(cat.toUpperCase())}</div>`;
      for (const [, it] of entries) {
        const openIssue = it.issue && !it.issueResolved;
        html += `<div class="p-row">
          <span class="p-box">${it.checked ? esc(it.initials || '') : ''}</span>
          <span class="p-tag">${esc(shortCode(it) || '')}</span>
          <span class="p-lbl">${esc(shortLabel(it))}${it.qty > 1 ? ` <b>×${it.qty}</b>` : ''}
            ${openIssue ? `<span class="p-issue">! ${esc(it.issue)}</span>` : ''}</span>
        </div>`;
      }
    }
    return `<div class="p-sect"><div class="p-sect-h">${esc(title)}</div>${html}</div>`;
  }
  const notes = Object.values(doc.notes || {}).filter(n => !n.deleted && !n.resolved && n.by);   // crew and office notes; build-authored notes stay in the app
  const signers = [...new Set([doc, mep].filter(Boolean).flatMap(d =>
    store.liveItems(d).filter(([, it]) => it.checked && it.initials)
      .map(([, it]) => it.initials + (it.checkedByCo ? ' — ' + shortCo(it.checkedByCo) : ''))))].sort();
  const a = store.roomStats(doc), b = mep ? store.roomStats(mep) : { total: 0, done: 0, openIssues: 0 };
  return `<div class="paper" data-paper="${esc(no)}">
      <div class="p-head">
        <img src="${window.__H2SEP_LOGO || '../brand/ironstack-logo.png'}" alt="ironstack.pro"/>
        <div class="p-title"><b>${isSpace ? esc(doc.typeLabel || doc.type) : 'ROOM ' + esc(no)}</b><span>${isSpace ? 'Space ' + esc(doc.number) : esc(doc.typeLabel || doc.type)} · Floor ${esc(doc.floor)} · ${a.done + b.done} of ${a.total + b.total} checked · ${a.openIssues + b.openIssues} open</span></div>
        <div class="p-tb">
          <div><span>PROJECT</span><b>H2SEP</b></div>
          <div><span>JOB</span><b>ironstack.pro 24030</b></div>
          <div><span>GENERATED</span><b>${esc(stamp)}</b></div>
        </div>
      </div>
      ${notes.length ? `<div class="p-notes"><b>${isSpace ? 'SPACE' : 'ROOM'} NOTES:</b> ${notes.map(n => esc(n.text)).join(' · ')}</div>` : ''}
      ${store.liveItems(doc).length ? section('FF&E CHECKLIST', doc) : ''}
      ${mep ? `${store.liveItems(doc).length ? '<div class="p-break"></div>' : ''}${section('MEP PUNCH', mep)}
        <div class="p-sign"><span>Punch walked by: ____________________</span><span>Date: ____________</span></div>` : ''}
      ${signers.length ? `<div class="p-signers"><b>SIGNED BY:</b> ${signers.map(x => `${esc(x)}`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <div class="p-foot">Initials in the box mean checked, like the paper sheet. Generated from live data · ironstack.pro</div>
    </div>`;
}

function renderPrint(ctx, { no }) {
  const { store } = ctx;
  const doc = store.getDoc(no);
  const isSpace = !!doc && String(doc.type || '').startsWith('space-');
  const root = el(`<div class="paper-wrap">
    <div class="pagehead noprint">
      <button class="icon-btn" data-back aria-label="Back">${ic('back')}</button>
      <div><h1 class="h1">${isSpace ? esc(doc.typeLabel || no) : 'Room ' + esc(no)} print sheet</h1>
        <div class="sub">generated from live data · this page redraws as lines are checked off · print or save it whenever you need a copy</div></div>
      <span class="spacer"></span>
      <a class="btn" href="#/prints">${ic('printer')}All sheets</a>
      <button class="btn primary" data-print>${ic('printer')}Print or save PDF</button>
    </div>
    ${paperHtml(store, no)}
  </div>`);
  root.querySelector('[data-back]').addEventListener('click', () => { location.hash = isSpace ? `#/space/${no}` : `#/room/${no}`; });
  root.querySelector('[data-print]').addEventListener('click', () => window.print());
  return root;
}

// A packet: every sheet on a floor (rooms first, then common areas), or the
// whole building, one print job with a page break between sheets.
function renderPrintPacket(ctx, { f }) {
  const { store } = ctx;
  const floor = f === 'all' ? null : Number(f);
  const rooms = store.guestRooms().filter(r => floor === null || Number(r.floor) === floor);
  const spaces = store.spaces().filter(sp => floor === null || Number(sp.floor) === floor)
    .sort((a, b) => (Number(a.floor) - Number(b.floor)) || String(a.typeLabel || a.number).localeCompare(String(b.typeLabel || b.number)));
  const ids = [...rooms.map(r => r.number), ...spaces.map(sp => sp.number)];
  const root = el(`<div class="paper-wrap">
    <div class="pagehead noprint">
      <button class="icon-btn" data-back aria-label="Back">${ic('back')}</button>
      <div><h1 class="h1">${floor === null ? 'Whole building' : 'Floor ' + floor} packet</h1>
        <div class="sub">${pl(rooms.length, 'room')} and ${pl(spaces.length, 'common area')} · ${pl(ids.length, 'sheet')} · generated from live data at print time</div></div>
      <span class="spacer"></span>
      <button class="btn primary" data-print>${ic('printer')}Print or save PDF</button>
    </div>
    ${ids.map((id, i) => `${i ? '<div class="p-break"></div>' : ''}${paperHtml(store, id)}`).join('')}
  </div>`);
  root.querySelector('[data-back]').addEventListener('click', () => { location.hash = '#/prints'; });
  root.querySelector('[data-print]').addEventListener('click', () => window.print());
  return root;
}

// The hub: every sheet in the building, by floor, plus the packets.
function renderPrintHub(ctx) {
  const { store } = ctx;
  const rooms = store.guestRooms(), spaces = store.spaces();
  const floors = floorsOf([...rooms, ...spaces]);
  const root = el(`<div>
    <div class="pagehead"><h1 class="h1">Print sheets</h1>
      <span class="sub">one sheet per room and per common area, FF&amp;E then MEP punch, drawn from live data whenever it is opened or printed</span></div>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="kl">Room sheets</div><div class="kv">${rooms.length}</div><div class="kc">every guest room, ${esc(floorRange(rooms))}</div></div>
      <div class="kpi"><div class="kl">Common area sheets</div><div class="kv">${spaces.length}</div><div class="kc">every space with a package</div></div>
      <div class="kpi"><div class="kl">Always current</div><div class="kv">live</div><div class="kc">a sheet is generated at the moment you open or print it</div></div>
    </div>
    <section class="card" style="margin-bottom:14px">
      <div class="card-head"><h2>Packets</h2><span class="card-cap">one print job, a page break between sheets</span></div>
      <div class="chips" style="padding:10px 16px 14px">
        ${floors.map(fl => `<a class="btn" href="#/print-floor/${fl}">${ic('printer')}Floor ${fl} packet</a>`).join('')}
        <a class="btn" href="#/print-floor/all">${ic('printer')}Whole building</a>
      </div>
    </section>
    <section class="card"><div class="card-head"><h2>Sheets</h2><span class="card-cap">tap a row to open its sheet</span></div><div class="rlist"></div></section>
  </div>`);
  const list = root.querySelector('.rlist');
  const row = (d, isSpace) => {
    const mep = store.mepDoc(d.number);
    const a = store.roomStats(d), b = mep ? store.roomStats(mep) : { total: 0, done: 0, openIssues: 0 };
    const r = el(`<div class="room-row" role="link" tabindex="0" aria-label="Open the print sheet for ${esc(d.number)}">
      <span class="rno mono" style="width:64px">${esc(d.number)}</span>
      <span class="rtype">${esc(d.typeLabel || d.type)}${isSpace ? '' : ''}</span>
      <span class="riss ${a.openIssues + b.openIssues ? '' : 'none'}">${a.openIssues + b.openIssues ? ic('flag', 'flag-ic') + ' ' + (a.openIssues + b.openIssues) + ' open' : '0 open'}</span>
      <span class="rfrac">${a.done + b.done}/${a.total + b.total}</span>
      ${ic('printer', 'chev')}
    </div>`);
    pressable(r, { tap: () => { location.hash = `#/print/${d.number}`; } });
    return r;
  };
  const entries = [...rooms.map(d => ({ d, sp: false })), ...spaces.map(d => ({ d, sp: true }))]
    .sort((x, y) => (Number(x.d.floor) - Number(y.d.floor)) || (x.sp - y.sp) || String(x.d.number).localeCompare(String(y.d.number)));
  appendByFloor(list, entries, x => x.d.floor, x => row(x.d, x.sp));
  return root;
}

export function trackingModule(store) {
  return {
    id: 'tracking',
    name: 'Tracking',
    nav: [
      { path: '#/', label: 'Dashboard', icon: 'grid', order: 10 },
      { path: '#/rooms', label: 'Rooms', icon: 'door', order: 20,
        get count() { return store ? String(store.guestRooms().length) : ''; } },
      { path: '#/common', label: 'Common Areas', icon: 'layers', order: 30,
        get count() { return store ? String(store.spaces().length) : ''; } },
      { path: '#/bulk', label: 'Bulk mark', icon: 'check', order: 35 },
      { path: '#/prints', label: 'Print sheets', icon: 'printer', order: 36 },
      { path: '#/categories', label: 'Categories', icon: 'tagi', order: 40 },
      { path: '#/files', label: 'Files', icon: 'file', order: 70 },
      { path: '#/activity', label: 'Activity', icon: 'pulse', order: 80 },
    ],
    routes: [
      { match: /^#\/$/, render: renderDashboard },
      { match: /^#\/rooms$/, render: renderRooms },
      { match: /^#\/room\/(?<no>[^?]+)/, render: renderRoom },
      { match: /^#\/print\/(?<no>[^?]+)/, render: renderPrint },
      { match: /^#\/print-floor\/(?<f>\d+|all)$/, render: renderPrintPacket },
      { match: /^#\/prints$/, render: renderPrintHub },
      { match: /^#\/activity$/, render: renderActivity },
      { match: /^#\/common$/, render: renderCommon },
      { match: /^#\/space\/(?<id>[^?]+)/, render: renderSpace },
      { match: /^#\/bulk$/, render: renderBulk },
      { match: /^#\/categories$/, render: comingSoon('Categories', 'The 21 real categories plus the custom category creator.') },
      { match: /^#\/files$/, render: comingSoon('Files', 'Plans, submittals, and exports with spec jump links.') },
    ],
  };
}
