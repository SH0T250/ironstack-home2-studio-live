// Directory module (module three): the project contact list and sub assignments.
// Registers its own nav entries and routes; the core was not touched to add it,
// which is the upgrade-safe contract (extend, never fork).
//
// Data lives in two docs in the platform collection, alongside the room docs:
//   _dir  contacts     items.{c_id} = one person at one company
//   _asg  assignments  items.{a_id} = one company owning one scope in a room set
// Same doc shape as a room, so the published rules already cover them and no
// rules change was needed. Deletes are blocked project-wide, so removing a
// record archives it (deleted: true) and it stays recoverable.

import { ic, el, esc, toast, sheet, pressable } from '../../core/ui.js';

export const DIR_DOC = '_dir';
export const ASG_DOC = '_asg';

const CAT_ORDER = ['Owner', 'Contractor (GC)', 'Architect', 'Engineer', 'MEP', 'Structural', 'Subcontractor', 'Supplier', 'Other'];
const ROLES = ['Install', 'Supply'];

function directoryNowIso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }
function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function skeleton(id, type, typeLabel) {
  return {
    number: id, floor: 0, type, typeLabel, items: {}, notes: {},
    deleted: false, schemaV: 1, createdAt: directoryNowIso(), updatedAt: directoryNowIso(),
  };
}
async function ensure(store, docId) {
  if (docId === DIR_DOC) return store.ensureDoc(DIR_DOC, skeleton(DIR_DOC, 'directory', 'Project Directory'));
  return store.ensureDoc(ASG_DOC, skeleton(ASG_DOC, 'assignments', 'Sub Assignments'));
}

// ---------- reads ----------

export function contactList(store) {
  const d = store.getDoc(DIR_DOC);
  return Object.entries(d?.items || {})
    .filter(([, c]) => !c.deleted)
    .sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0) || String(a[1].org).localeCompare(String(b[1].org)));
}
export function assignmentList(store) {
  const d = store.getDoc(ASG_DOC);
  return Object.entries(d?.items || {})
    .filter(([, a]) => !a.deleted)
    .sort((a, b) => String(a[1].category).localeCompare(String(b[1].category)));
}
function contactById(store, id) {
  return store.getDoc(DIR_DOC)?.items?.[id] || null;
}

// Live progress for one assignment: every line in its category, across its rooms,
// counted from the same checklist the crew is tapping. No separate bookkeeping.
export function scopeStats(store, a) {
  let total = 0, done = 0, issues = 0;
  for (const no of a.rooms || []) {
    for (const d of [store.getDoc(no), store.mepDoc(no)]) {
      if (!d) continue;
      for (const [, it] of store.liveItems(d)) {
        if ((it.category || '') !== a.category) continue;
        total++;
        if (it.checked) done++;
        if (it.issue && !it.issueResolved) issues++;
      }
    }
  }
  const allChecked = total > 0 && done === total;
  const complete = allChecked && issues === 0;
  const overdue = !!a.due && !complete && a.due < today();
  return { total, done, issues, allChecked, complete, overdue, pct: total ? Math.round(done / total * 100) : 0 };
}

// Every category that actually exists in the slice, with its room set and size.
export function sliceCategories(store) {
  const map = new Map();
  for (const r of store.guestRooms()) {
    for (const d of [r, store.mepDoc(r.number)]) {
      if (!d) continue;
      for (const [, it] of store.liveItems(d)) {
        const cat = it.category || 'Other';
        if (!map.has(cat)) map.set(cat, { category: cat, rooms: new Set(), total: 0 });
        const e = map.get(cat);
        e.rooms.add(r.number); e.total++;
      }
    }
  }
  return [...map.values()].map(e => ({ ...e, rooms: [...e.rooms].sort() }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// Who owns this category in this room, if anyone. Read by the room screen too.
export function ownerOf(store, category, roomNo) {
  for (const [id, a] of assignmentList(store)) {
    if (a.category === category && (a.rooms || []).includes(String(roomNo))) return { id, a };
  }
  return null;
}

function statusChip(st, a) {
  if (st.total === 0) return '<span class="chip ns sm">NO LINES IN SCOPE</span>';
  if (st.complete) return '<span class="chip done sm"><i class="dot"></i>Complete</span>';
  if (st.allChecked) return '<span class="chip issue sm"><i class="dot"></i>Checked, issues open</span>';
  if (st.overdue) return '<span class="chip issue sm"><i class="dot"></i>Overdue</span>';
  if (st.done > 0) return '<span class="chip prog sm"><i class="dot"></i>In progress</span>';
  return '<span class="chip ns sm"><i class="dot"></i>Not started</span>';
}
function dueLabel(due) {
  if (!due) return 'no due date';
  const d = new Date(due + 'T12:00:00');
  return 'due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function roomsLabel(rooms) {
  const r = rooms || [];
  if (!r.length) return 'no rooms';
  if (r.length === 1) return 'Room ' + r[0];
  if (r.length <= 4) return 'Rooms ' + r.join(', ');
  return `${r.length} rooms`;
}
function initialsOf(s) {
  const words = String(s || '')
    .replace(/['\u2019]/g, '')                                  // Larry's -> Larrys, not "Larry s"
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .filter(w => !/^(llc|inc|corp|co|ltd|company|group|the)$/i.test(w));
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return digits.length >= 10 ? 'tel:+1' + digits.slice(0, 10) : '';
}

// ---------- contacts screen ----------

function renderContacts(ctx) {
  const { store } = ctx;
  const list = contactList(store);
  const orgs = new Set(list.map(([, c]) => c.org));
  const groups = new Map();
  for (const [id, c] of list) {
    const cat = CAT_ORDER.includes(c.category) ? c.category : 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push([id, c]);
  }
  const ordered = CAT_ORDER.filter(k => groups.has(k)).map(k => [k, groups.get(k)]);

  const root = el(`<div>
    <div class="pagehead">
      <div><h1 class="h1">Contacts</h1>
      <div class="sub">${orgs.size} companies · ${list.length} people · tap a card to call, email, or assign work</div></div>
      <span class="spacer"></span>
      <div class="hdr-actions">
        <a class="btn" href="#/assignments">${ic('people')}Assignments</a>
        <button class="btn primary" data-add>${ic('plus')}Add contact</button>
      </div>
    </div>
    <div class="searchbar">${ic('search')}<input data-q placeholder="Search a company, person, or trade" autocomplete="off"/></div>
    <div class="dirwrap"></div>
  </div>`);

  const wrap = root.querySelector('.dirwrap');
  if (!list.length) {
    wrap.append(el(`<section class="card"><div class="coming">${ic('contact')}<b>No contacts yet</b>
      <span>Add your first company and the assignment screen can put them on a scope.</span></div></section>`));
  }
  for (const [cat, entries] of ordered) {
    const orgCount = new Set(entries.map(([, c]) => c.org)).size;
    const sect = el(`<section class="card dirgroup"><div class="card-head"><h2>${esc(cat)}</h2>
      <span class="card-cap">${orgCount} ${orgCount === 1 ? 'company' : 'companies'} · ${entries.length} ${entries.length === 1 ? 'person' : 'people'}</span></div><div class="rows"></div></section>`);
    const rows = sect.querySelector('.rows');
    let prevOrg = null;
    for (const [id, c] of entries) {
      rows.append(contactRow(ctx, id, c, c.org === prevOrg));
      prevOrg = c.org;
    }
    wrap.append(sect);
  }

  // Filtering happens in the DOM so typing never re-renders (and never loses focus).
  const q = root.querySelector('[data-q]');
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    root.querySelectorAll('.dir-row').forEach(r => {
      r.style.display = !t || r.dataset.hay.includes(t) ? '' : 'none';
    });
    root.querySelectorAll('.dirgroup').forEach(g => {
      const any = [...g.querySelectorAll('.dir-row')].some(r => r.style.display !== 'none');
      g.style.display = any ? '' : 'none';
    });
  });
  root.querySelector('[data-add]').addEventListener('click', () => contactSheet(ctx, null));
  return root;
}

function contactRow(ctx, id, c, repeat = false) {
  const { store } = ctx;
  const mine = assignmentList(store).filter(([, a]) => a.contactId === id);
  const tel = telHref(c.phone);
  const row = el(`<div class="dir-row" role="button" tabindex="0" data-hay="${esc([c.org, c.name, c.scope, c.title, c.category].join(' ').toLowerCase())}">
    <span class="av org${repeat ? ' rep' : ''}">${repeat ? '' : esc(initialsOf(c.org))}</span>
    <span class="mid">
      <span class="l1"><b class="nm${repeat ? ' rep' : ''}">${esc(c.org || 'Unnamed company')}</b>
        ${repeat || !c.scope ? '' : `<span class="chip sm scope">${esc(c.scope)}</span>`}
        ${mine.length ? `<span class="chip prog sm">${mine.length} assigned</span>` : ''}</span>
      <span class="l2">${c.name ? esc(c.name) : '<i>no contact person yet</i>'}${c.title ? ' · ' + esc(c.title) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</span>
    </span>
    <span class="dir-acts">
      ${tel ? `<a class="icon-btn" href="${esc(tel)}" title="Call" aria-label="Call ${esc(c.org)}">${ic('phone')}</a>` : ''}
      ${c.email ? `<a class="icon-btn" href="mailto:${esc(String(c.email).split(';')[0].trim())}" title="Email" aria-label="Email ${esc(c.org)}">${ic('mail')}</a>` : ''}
    </span>
    ${ic('chev', 'chev')}
  </div>`);
  // The call and email buttons must not open the card.
  row.querySelectorAll('.dir-acts a').forEach(a => a.addEventListener('pointerdown', e => e.stopPropagation()));
  pressable(row, { tap: () => contactCard(ctx, id) });
  return row;
}

function contactCard(ctx, id) {
  const { store } = ctx;
  const c = contactById(store, id);
  if (!c) return;
  const mine = assignmentList(store).filter(([, a]) => a.contactId === id);
  const tel = telHref(c.phone);
  const emails = String(c.email || '').split(';').map(s => s.trim()).filter(Boolean);
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">${esc(c.org || 'Contact')}</b>
      ${c.scope ? `<span class="chip sm scope">${esc(c.scope)}</span>` : ''}
      <button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="cdetail">
      <div class="cd-row"><span>Person</span><b>${esc(c.name || 'not listed yet')}${c.title ? ' · ' + esc(c.title) : ''}</b></div>
      <div class="cd-row"><span>Category</span><b>${esc(c.category || 'Other')}</b></div>
      ${c.phone ? `<div class="cd-row"><span>Phone</span><b>${esc(c.phone)}</b></div>` : ''}
      ${emails.length ? `<div class="cd-row"><span>Email</span><b>${emails.map(esc).join('<br/>')}</b></div>` : ''}
      ${c.address ? `<div class="cd-row"><span>Address</span><b>${esc(c.address)}</b></div>` : ''}
      ${c.note ? `<div class="cd-row"><span>Note</span><b>${esc(c.note)}</b></div>` : ''}
    </div>
    <div class="callrow">
      ${tel ? `<a class="btn primary" href="${esc(tel)}">${ic('phone')}Call</a>` : ''}
      ${emails.length ? `<a class="btn" href="mailto:${esc(emails[0])}">${ic('mail')}Email</a>` : ''}
    </div>
    <div class="field"><label>Assigned work</label></div>
    <div class="asglist">${mine.length ? mine.map(([aid, a]) => {
      const st = scopeStats(store, a);
      return `<div class="asg-mini" data-open="${esc(aid)}">
        <span class="mid"><b>${esc(a.category)}</b><span class="l2">${esc(roomsLabel(a.rooms))} · ${esc(a.role || 'Install')} · ${esc(dueLabel(a.due))}</span></span>
        <span class="frac mono">${st.done}/${st.total}</span>${statusChip(st, a)}</div>`;
    }).join('') : '<div class="empty-note">Nothing assigned to them yet.</div>'}</div>
    <div class="srow">
      <button class="btn" data-edit>${ic('wrench')}Edit contact</button>
      <span class="spacer"></span>
      <button class="btn primary" data-assign>${ic('people')}Assign work</button>
    </div>`);
  const s = document.querySelector('.sheet');
  s.querySelector('[data-edit]').addEventListener('click', () => { close(); contactSheet(ctx, id); });
  s.querySelector('[data-assign]').addEventListener('click', () => { close(); assignSheet(ctx, null, { contactId: id }); });
  s.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { close(); assignSheet(ctx, b.dataset.open); }));
}

function contactSheet(ctx, id) {
  const { store } = ctx;
  const c = id ? contactById(store, id) : null;
  const F = [
    ['org', 'Company', 'Company or firm name'],
    ['name', 'Contact person', 'Full name'],
    ['title', 'Title or role', 'Owner, Superintendent, Estimator'],
    ['scope', 'Scope or trade', 'Plumbing, Electrical, FF&E'],
    ['phone', 'Phone', '(830) 555-0100'],
    ['email', 'Email', 'name@company.com'],
    ['address', 'Address', 'Street, City, State ZIP'],
    ['note', 'Note', 'Anything the crew should know'],
  ];
  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">${id ? 'Edit contact' : 'Add contact'}</b>
      <button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="field"><label>Category</label>
      <select data-f="category">${CAT_ORDER.map(k => `<option ${((c?.category) || 'Subcontractor') === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    ${F.map(([k, label, ph]) => `<div class="field"><label>${esc(label)}</label>
      <input data-f="${k}" placeholder="${esc(ph)}" value="${esc(c?.[k] || '')}"/></div>`).join('')}
    <div class="srow">
      ${id ? '<button class="btn" data-archive>Archive</button>' : ''}
      <span class="spacer"></span>
      <button class="btn primary" data-save>Save contact</button>
    </div>`);
  const s = document.querySelector('.sheet');
  s.querySelector('[data-save]').addEventListener('click', async () => {
    const v = {};
    s.querySelectorAll('[data-f]').forEach(i => { v[i.dataset.f] = i.value.trim(); });
    if (!v.org && !v.name) { toast('A company or a person name is required'); return; }
    const cid = id || rid('c_');
    await ensure(store, DIR_DOC);
    const rec = { ...(c || { sort: 9000, createdAt: directoryNowIso() }), ...v, deleted: false, updatedAt: directoryNowIso() };
    store.write(DIR_DOC, { [`items.${cid}`]: rec, updatedAt: directoryNowIso() },
      `${id ? 'updated' : 'added'} contact ${v.org || v.name}`);
    close();
    toast(`${id ? 'Updated' : 'Added'} ${v.org || v.name}`);
  });
  s.querySelector('[data-archive]')?.addEventListener('click', () => {
    store.write(DIR_DOC, { [`items.${id}.deleted`]: true, updatedAt: directoryNowIso() }, `archived contact ${c?.org || id}`);
    close();
    toast('Contact archived, not deleted', { label: 'Undo', fn: () => store.write(DIR_DOC, { [`items.${id}.deleted`]: false, updatedAt: directoryNowIso() }, `restored contact ${c?.org || id}`) });
  });
}

// ---------- assignments screen ----------

function renderAssignments(ctx) {
  const { store } = ctx;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const list = assignmentList(store);
  const cats = sliceCategories(store);
  const stats = list.map(([id, a]) => ({ id, a, st: scopeStats(store, a) }));
  const covered = new Set(list.map(([, a]) => a.category));
  const open = cats.filter(c => !covered.has(c.category));
  const lines = stats.reduce((n, x) => n + x.st.total, 0);
  const linesDone = stats.reduce((n, x) => n + x.st.done, 0);

  const root = el(`<div>
    <div class="pagehead">
      <div><h1 class="h1">Assignments</h1>
      <div class="sub">who owns which scope, in which rooms · progress counts the same lines the crew taps</div></div>
      <span class="spacer"></span>
      <div class="hdr-actions">
        <a class="btn" href="#/contacts">${ic('contact')}Contacts</a>
        <button class="btn primary" data-new>${ic('plus')}New assignment</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kl">Scopes assigned</div><div class="kv">${stats.length}<small> of ${cats.length}</small></div><div class="kc">categories with a company on them</div></div>
      <div class="kpi"><div class="kl">Lines under assignment</div><div class="kv">${linesDone}<small> of ${lines}</small></div><div class="kc">checked by the crew, counted live</div></div>
      <div class="kpi"><div class="kl">Overdue</div><div class="kv">${stats.filter(x => x.st.overdue).length}</div><div class="kc">past the due date, not complete</div></div>
      <div class="kpi"><div class="kl">Open issues in scope</div><div class="kv">${stats.reduce((n, x) => n + x.st.issues, 0)}</div><div class="kc">flags sitting on assigned lines</div></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Assigned</h2><span class="card-cap">tap one to change the rooms, the due date, or the company</span></div>
      <div class="asgrows"></div>
    </section>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><h2>Not assigned yet</h2><span class="card-cap">every scope in the slice with nobody on it</span></div>
      <div class="openrows"></div>
    </section>
  </div>`);

  const rows = root.querySelector('.asgrows');
  if (!stats.length) rows.append(el(`<div class="coming" style="padding:22px">${ic('people')}<b>Nothing assigned yet</b>
    <span>Pick a scope below, or hit New assignment, and put a company on it.</span></div>`));
  for (const x of stats) rows.append(assignmentRow(ctx, x));

  const orows = root.querySelector('.openrows');
  if (!open.length) orows.append(el('<div class="empty-note" style="padding:14px 16px">Every scope in the slice has a company on it.</div>'));
  for (const c of open) {
    const r = el(`<div class="open-row">
      <span class="mid"><b>${esc(c.category)}</b><span class="l2">${c.total} lines · ${esc(roomsLabel(c.rooms))}</span></span>
      <button class="btn primary sm" data-cat="${esc(c.category)}">${ic('plus')}Assign</button></div>`);
    r.querySelector('button').addEventListener('click', () => assignSheet(ctx, null, { category: c.category, rooms: c.rooms }));
    orows.append(r);
  }

  root.querySelector('[data-new]').addEventListener('click', () => assignSheet(ctx, null, {}));
  // Deep link from a room screen: #/assignments?cat=Plumbing&rooms=101
  if (params.get('cat')) {
    const cat = params.get('cat');
    const rooms = (params.get('rooms') || '').split(',').filter(Boolean);
    history.replaceState(null, '', '#/assignments');
    setTimeout(() => assignSheet(ctx, null, { category: cat, rooms: rooms.length ? rooms : (cats.find(c => c.category === cat)?.rooms || []) }), 0);
  }
  return root;
}

function assignmentRow(ctx, { id, a, st }) {
  const { store } = ctx;
  const c = contactById(store, a.contactId);
  const row = el(`<div class="asg-row" role="button" tabindex="0">
    <span class="av org">${esc(initialsOf(a.org || c?.org))}</span>
    <span class="mid">
      <span class="l1"><b class="nm">${esc(a.org || c?.org || 'Unassigned company')}</b>
        <span class="chip sm role">${esc((a.role || 'Install').toUpperCase())}</span>
        ${a.source === 'auto-match' ? '<span class="chip hold sm">AUTO-MATCHED · CONFIRM</span>' : ''}</span>
      <span class="l2"><b>${esc(a.category)}</b> · ${esc(roomsLabel(a.rooms))} · ${esc(dueLabel(a.due))}${st.issues ? ` · <span class="warn">${st.issues} open ${st.issues === 1 ? 'issue' : 'issues'}</span>` : ''}</span>
    </span>
    <span class="asg-prog">
      <span class="bar cy"><i style="width:${st.pct}%"></i></span>
      <span class="frac mono">${st.done}/${st.total}</span>
    </span>
    ${statusChip(st, a)}
    ${ic('chev', 'chev')}
  </div>`);
  pressable(row, { tap: () => assignSheet(ctx, id) });
  return row;
}

function assignSheet(ctx, id, prefill = {}) {
  const { store } = ctx;
  const existing = id ? store.getDoc(ASG_DOC)?.items?.[id] : null;
  const a = existing || { role: 'Install', rooms: prefill.rooms || [], category: prefill.category || '', contactId: prefill.contactId || '', due: '' };
  const cats = sliceCategories(store);
  const rooms = store.guestRooms().map(r => r.number);
  const people = contactList(store);
  const st = existing ? scopeStats(store, a) : null;

  const { close } = sheet(`
    <div class="sh"><b style="font-size:15px">${id ? 'Assignment' : 'New assignment'}</b>
      ${st ? `<span class="chip sm">${st.done} of ${st.total} checked</span>` : ''}
      <button class="icon-btn x" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="field"><label>Company</label>
      <select data-f="contactId">
        <option value="">Pick a company from the directory</option>
        ${people.map(([cid, c]) => `<option value="${esc(cid)}" ${a.contactId === cid ? 'selected' : ''}>${esc(c.org)}${c.name ? ' — ' + esc(c.name) : ''}${c.scope ? ' (' + esc(c.scope) + ')' : ''}</option>`).join('')}
      </select></div>
    <div class="field"><label>Scope</label>
      <select data-f="category">
        <option value="">Pick a scope</option>
        ${cats.map(c => `<option value="${esc(c.category)}" ${a.category === c.category ? 'selected' : ''}>${esc(c.category)} (${c.total} lines)</option>`).join('')}
      </select></div>
    <div class="field"><label>They are doing</label>
      <span class="seg">${ROLES.map(r => `<button type="button" data-role="${r}" class="${(a.role || 'Install') === r ? 'on' : ''}">${r}</button>`).join('')}</span></div>
    <div class="field"><label>Rooms</label>
      <div class="roompick">
        <button type="button" class="rp all" data-all>All ${rooms.length} rooms</button>
        ${rooms.map(no => `<button type="button" class="rp ${(a.rooms || []).includes(no) ? 'on' : ''}" data-room="${esc(no)}">${esc(no)}</button>`).join('')}
      </div></div>
    <div class="field"><label>Due date</label><input type="date" data-f="due" value="${esc(a.due || '')}"/></div>
    <div class="field"><label>Note to the crew</label><input data-f="note" placeholder="Optional" value="${esc(a.note || '')}"/></div>
    <div class="srow">
      ${id ? '<button class="btn" data-archive>Archive</button>' : ''}
      <span class="spacer"></span>
      <button class="btn primary" data-save>${id ? 'Save changes' : 'Assign'}</button>
    </div>`);

  const s = document.querySelector('.sheet');
  let role = a.role || 'Install';
  let picked = new Set(a.rooms || []);
  const paintRooms = () => s.querySelectorAll('[data-room]').forEach(b => b.classList.toggle('on', picked.has(b.dataset.room)));
  s.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
    role = b.dataset.role;
    s.querySelectorAll('[data-role]').forEach(x => x.classList.toggle('on', x.dataset.role === role));
  }));
  s.querySelectorAll('[data-room]').forEach(b => b.addEventListener('click', () => {
    picked.has(b.dataset.room) ? picked.delete(b.dataset.room) : picked.add(b.dataset.room);
    paintRooms();
  }));
  s.querySelector('[data-all]').addEventListener('click', () => {
    picked = picked.size === rooms.length ? new Set() : new Set(rooms);
    paintRooms();
  });

  s.querySelector('[data-save]').addEventListener('click', async () => {
    const v = {};
    s.querySelectorAll('[data-f]').forEach(i => { v[i.dataset.f] = i.value.trim(); });
    if (!v.contactId) { toast('Pick the company first'); return; }
    if (!v.category) { toast('Pick the scope they own'); return; }
    if (!picked.size) { toast('Pick at least one room'); return; }
    const c = contactById(store, v.contactId);
    const aid = id || rid('a_');
    await ensure(store, ASG_DOC);
    const rec = {
      ...(existing || { createdAt: directoryNowIso() }),
      contactId: v.contactId, org: c?.org || '', contactName: c?.name || '', phone: c?.phone || '',
      category: v.category, role, rooms: [...picked].sort(), due: v.due || '', note: v.note || '',
      source: existing?.source === 'auto-match' ? 'confirmed' : (existing?.source || 'manual'),
      deleted: false, updatedAt: directoryNowIso(), by: store.user?.initials || '',
    };
    store.write(ASG_DOC, { [`items.${aid}`]: rec, updatedAt: directoryNowIso() },
      `${id ? 'updated' : 'assigned'} ${v.category} in ${[...picked].sort().join(', ')} to ${c?.org || 'a company'}`);
    close();
    toast(`${c?.org || 'Company'} owns ${v.category} in ${roomsLabel([...picked].sort()).toLowerCase()}`);
  });
  s.querySelector('[data-archive]')?.addEventListener('click', () => {
    store.write(ASG_DOC, { [`items.${id}.deleted`]: true, updatedAt: directoryNowIso() }, `archived the ${a.category} assignment`);
    close();
    toast('Assignment archived, not deleted', { label: 'Undo', fn: () => store.write(ASG_DOC, { [`items.${id}.deleted`]: false, updatedAt: directoryNowIso() }, `restored the ${a.category} assignment`) });
  });
}

export function directoryModule() {
  return {
    id: 'directory',
    name: 'Directory',
    nav: [
      { path: '#/assignments', label: 'Assignments', icon: 'people', order: 50 },
      { path: '#/contacts', label: 'Contacts', icon: 'contact', order: 60 },
    ],
    routes: [
      { match: /^#\/contacts$/, render: renderContacts },
      { match: /^#\/assignments/, render: renderAssignments },
    ],
  };
}
