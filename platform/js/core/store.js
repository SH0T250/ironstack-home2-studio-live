// H2SEP Platform store.
// Local backend today, shaped like the Firestore ops the current app uses, so the
// Firebase backend drops in without rework (ruling D8). All writes are field-path
// patches applied atomically; check-off groups always travel together.

const LS_KEY = 'h2sep-original-review:platform-v1';
const UNDO_KEY = 'h2sep-original-review:platform-bulk-undo';
// Marker for "this field did not exist": the local store deletes the key and
// the Firebase backend maps it to deleteField(), so an undo is an exact inverse.
export const ABSENT = Object.freeze({ __absentField: true });
export const isAbsent = (v) => !!v && typeof v === 'object' && v.__absentField === true;
// A note the build wrote onto the record (open document conflicts, gaps, the
// type note): key n_..., no author. Office reference, never a crew flag (D55).
export const isBuildNote = (id, n) => /^n_/.test(String(id || '')) && !(n && (n.by || n.createdBy || n.createdByUid));
const ID_KEY = 'h2sep-original-review:platform-user';

function nowIso() { return new Date().toISOString(); }

// Ruling D52: an optional line counts toward a room only when it has been acted on.
export function counts(it) { return !it.optional || !!it.checked || !!(it.issue && !it.issueResolved); }

export class Store {
  // Long suffix first: a doc that has both is the guest-room one.
  static MEP_SUFFIXES = ['-MEP', '-M'];

  constructor(seed) {
    this.seed = seed;
    this.docs = {};
    for (const [id, doc] of Object.entries(seed.docs)) {
      this.docs[id] = structuredClone(doc);
    }
    this.activity = [];
    this.listeners = new Set();
    this.queued = 0;               // pending writes (offline story; local backend syncs instantly)
    this.backend = null;           // set by attachBackend() when Firebase is configured
    this.status = { mode: 'local', ready: true, fromCache: false, pending: 0, message: null };
    this._replayOverlay();
  }

  // ---- identity (initials are the human identity, like the paper sheet) ----
  get user() {
    try { return JSON.parse(localStorage.getItem(ID_KEY)) || this._reviewUser || null; } catch { return this._reviewUser || null; }
  }
  setUser(name, initials, company = '') {
    this._reviewUser = {
      name: name.trim().slice(0, 40),
      initials: initials.trim().toUpperCase().slice(0, 3),
      company: String(company || '').trim().slice(0, 60),
    };
    try { localStorage.setItem(ID_KEY, JSON.stringify(this._reviewUser)); } catch { /* still allow this local review session */ }
    this._emit();
  }

  // ---- persistence: an append-log of patches replayed over the seed ----
  _log() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
  }
  _replayOverlay() {
    for (const entry of this._log()) this._apply(entry.docId, entry.patch);
    for (const entry of this._log()) if (entry.activity) this.activity.push(entry.activity);
  }
  _persist(docId, patch, activity) {
    const log = this._log();
    log.push({ docId, patch, activity, at: nowIso() });
    localStorage.setItem(LS_KEY, JSON.stringify(log));
  }
  resetLocal() { localStorage.removeItem(LS_KEY); location.reload(); }

  _apply(docId, patch) {
    const doc = this.docs[docId];
    if (!doc) return;
    for (const [path, value] of Object.entries(patch)) {
      const parts = path.split('.');
      let target = doc;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof target[parts[i]] !== 'object' || target[parts[i]] === null) target[parts[i]] = {};
        target = target[parts[i]];
      }
      // A field that never existed comes back ABSENT on undo, not null: null
      // would drift the item schema one bulk at a time (crew engine rule).
      if (isAbsent(value)) delete target[parts[parts.length - 1]];
      else target[parts[parts.length - 1]] = value;
    }
  }

  // ---- reads ----
  getDoc(id) { return this.docs[id] || null; }
  guestRooms() {
    return Object.entries(this.docs)
      .filter(([id, d]) => !id.startsWith('_') && !d.deleted && d.type !== 'mep-punch' && !String(d.type).startsWith('space-'))
      .map(([, d]) => d)
      .sort((a, b) => String(a.number).localeCompare(String(b.number)));
  }
  // An MEP companion doc is suffixed '-MEP' on a guest room (105-MEP) and '-M'
  // on a common-area space (S003-M, SZONEB-M). The short suffix is not a typo:
  // the published Firestore rule caps a document id at 8 characters and
  // 'SZONEA-MEP' is 10, so the space docs cannot use the long one. The app
  // resolves both, preferring the long suffix, and every caller goes through
  // these two so the rule lives in exactly one place.
  // Common-area spaces: same document shape as a guest room, distinguished by a
  // "space-" type. Identified by ID rather than by type, because a space with
  // MEP lines and no FF&E lines legitimately owns the parent id and carries the
  // punch type - filtering on type alone would hide it.
  spaces() {
    const isCompanion = (id) => Store.MEP_SUFFIXES.some((sfx) => id.endsWith(sfx));
    return Object.entries(this.docs)
      .filter(([id, d]) => !id.startsWith('_') && !d.deleted &&
        String(d.type).startsWith('space-') && !isCompanion(id))
      .map(([, d]) => d)
      .sort((a, b) => String(a.typeLabel || a.number).localeCompare(String(b.typeLabel || b.number)));
  }

  mepDocId(parentId) {
    for (const suffix of Store.MEP_SUFFIXES) {
      const id = String(parentId) + suffix;
      if (this.docs[id]) return id;
    }
    return null;
  }
  mepDoc(parentId) { return this.docs[this.mepDocId(parentId)] || null; }

  liveItems(doc) {
    return Object.entries(doc.items || {})
      .filter(([, it]) => !it.deleted)
      .sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0) || a[0].localeCompare(b[0]));
  }
  roomStats(doc) {
    // An "if needed" line (optional: true, ruling D52) joins the count only
    // once someone checks it or raises an issue on it.
    const items = this.liveItems(doc).map(([, it]) => it).filter(counts);
    const total = items.length;
    const done = items.filter(i => i.checked).length;
    const openIssues = items.filter(i => i.issue && !i.issueResolved).length
      + Object.entries(doc.notes || {}).filter(([id, n]) => !n.deleted && !isBuildNote(id, n) && n.flag === 'issue' && !n.resolved).length;
    return { total, done, openIssues, complete: total > 0 && done === total && openIssues === 0 };
  }

  // ---- writes (each an atomic patch + activity record) ----
  _write(docId, patch, activityText) {
    const activity = activityText
      ? { text: activityText, by: this.user?.initials || '??', byCo: this.user?.company || '', at: nowIso(), docId }
      : null;
    this._apply(docId, patch);          // optimistic: the tap lands instantly
    if (activity) this.activity.push(activity);
    let done = Promise.resolve(true);
    if (this.backend) {
      // Firestore keeps its own offline queue and flushes on reconnect, so a
      // failure here is a real rejection (rules/auth), not a dead zone.
      done = this.backend.patch(docId, patch).then(() => true, err => {
        this.status.message = 'Could not save: ' + (err.code || err.message);
        this._emit();
        return false;
      });
    } else {
      this._persist(docId, patch, activity);
    }
    if (!this._quiet) this._emit();
    return done;
  }
  // The cloud write path is not ready until sign-in completes; a write made
  // before that would go to the local log and be replaced by the first
  // snapshot. Single taps are rare in that window; a bulk must refuse it.
  canWriteNow() { if (this.expectBackend && !this.backend) return false; return !this.backend || !this.backend.isWriteReady || this.backend.isWriteReady(); }

  // Generic patch entry point for modules that keep their own records (the
  // directory keeps contacts in _dir and assignments in _asg). Same atomic
  // field-path write every other call site uses, so offline and sync behave
  // identically for module data and checklist data.
  write(docId, patch, activityText) { this._write(docId, patch, activityText); }

  // A module doc may not exist yet on a fresh project. Create it locally, and
  // in the cloud with merge, so the first write from any device lands.
  async ensureDoc(docId, data) {
    if (this.docs[docId]) return;                 // already have it: never write a skeleton over live records
    this.docs[docId] = structuredClone(data);
    this._emit();
    if (this.backend?.isWriteReady?.()) {
      try { await this.backend.createIfMissing(docId, data); } catch { /* rules or offline: local copy still works */ }
    }
  }

  // Complete check-field group, never partial (parity contract). The bulk
  // engine writes the same group; Store.CHECK_FIELDS names it once.
  check(docId, itemId, on) {
    const u = this.user;
    if (!u) return;
    const p = `items.${itemId}.`;
    const doc = this.getDoc(docId);
    const label = doc?.items?.[itemId]?.code || doc?.items?.[itemId]?.label || itemId;
    this._write(docId, {
      [p + 'checked']: on,
      [p + 'initials']: on ? u.initials : '',
      [p + 'checkedByCo']: on ? (u.company || '') : '',
      [p + 'checkedAt']: on ? nowIso() : null,
      [p + 'checkedAtLocal']: on ? nowIso() : null,
      'updatedAt': nowIso(),
    }, `${on ? 'checked' : 'unchecked'} ${label} in ${docId}`);
  }

  setIssue(docId, itemId, issueText) {
    const p = `items.${itemId}.`;
    const doc = this.getDoc(docId);
    const label = doc?.items?.[itemId]?.code || itemId;
    this._write(docId, {
      [p + 'issue']: issueText,
      [p + 'issueResolved']: false,
      'updatedAt': nowIso(),
    }, issueText ? `flagged ${label} in ${docId}: ${issueText}` : `cleared issue on ${label} in ${docId}`);
  }
  resolveIssue(docId, itemId) {
    const p = `items.${itemId}.`;
    const doc = this.getDoc(docId);
    const label = doc?.items?.[itemId]?.code || itemId;
    this._write(docId, { [p + 'issueResolved']: true, 'updatedAt': nowIso() }, `resolved issue on ${label} in ${docId}`);
  }

  // ---- bulk: many lines at once, ONE atomic patch per document ----
  // Same rules as the crew dashboard's bulk engine: every line left alone is
  // reported with its reason (a bulk tool that silently drops rows is how you
  // end up believing you checked forty and actually checked twelve); another
  // person's initials are field evidence and are never overwritten unless the
  // user says so; a flagged line or a line with an open issue is never checked
  // off in bulk, because on paper those lines need a person's eyes.
  static BULK_SKIP = {
    ALREADY_CHECKED: 'already checked off',
    OTHER_INITIALS: 'checked by someone else',
    PAPER: 'checked from paper, no initials on file',
    NOT_CHECKED: 'not checked',
    FLAGGED: 'flagged, sources disagree: open the line',
    FLAGGED_RESOLVE: 'flagged: use Resolve issues, then check it by hand',
    OPEN_ISSUE: 'open issue: resolve it first',
    NO_OPEN_ISSUE: 'no open issue',
    ALREADY_RESOLVED: 'issue already resolved',
    NO_ISSUE: 'no issue to clear',
    SAME_ISSUE: 'already flagged with that text',
    NO_IDENTITY: 'set your initials first',
    NO_TEXT: 'pick an issue or type one first',
    GONE: 'no longer in the checklist',
    CHANGED: 'changed since the bulk edit, kept',
  };
  static BULK_ACTIONS = {
    check: 'Mark checked', uncheck: 'Mark unchecked', resolve: 'Resolve issues',
    resolveAndCheck: 'Resolve and check', setIssue: 'Flag an issue', clearIssue: 'Clear issues',
  };
  static BULK_DESTRUCTIVE = ['uncheck', 'clearIssue', 'setIssue'];
  static CHECK_FIELDS = ['checked', 'initials', 'checkedByCo', 'checkedAt', 'checkedAtLocal'];

  // targets: [{ docId, itemId }]. Returns the exact writes and the exact skips.
  planBulk(targets, action, opts = {}) {
    const u = this.user;
    const { text = '', overwriteChecked = false } = opts;
    const S = Store.BULK_SKIP;
    const changes = [], skipped = [];
    const stamp = nowIso();
    const checkOn = () => ({ checked: true, initials: u.initials, checkedByCo: u.company || '', checkedAt: stamp, checkedAtLocal: stamp });
    const checkOff = () => ({ checked: false, initials: '', checkedByCo: '', checkedAt: null, checkedAtLocal: null });
    const stamping = ['check', 'uncheck', 'resolveAndCheck'].includes(action);
    for (const t of targets) {
      const doc = this.getDoc(t.docId);
      const it = doc?.items?.[t.itemId];
      const base = { docId: t.docId, itemId: t.itemId, code: it?.code || '', label: it?.label || '' };
      const skip = (why, extra) => skipped.push({ ...base, why, ...(extra || {}) });
      if (!it || it.deleted) { skip(S.GONE); continue; }
      if (stamping && !u) { skip(S.NO_IDENTITY); continue; }
      if (action === 'setIssue' && !text) { skip(S.NO_TEXT); continue; }
      const paper = !!it.checked && !it.initials;
      const mine = !!u && !!it.initials && it.initials === u.initials;
      const openIssue = !!(it.issue && !it.issueResolved);
      let fields = null, replaces = null;
      if (action === 'check') {
        if (it.reliability === 'FLAGGED') { skip(S.FLAGGED); continue; }
        if (openIssue) { skip(S.OPEN_ISSUE); continue; }
        if (it.checked) {
          if (mine) { skip(S.ALREADY_CHECKED); continue; }
          if (!overwriteChecked) { skip(paper ? S.PAPER : S.OTHER_INITIALS); continue; }
        }
        fields = checkOn();
      } else if (action === 'uncheck') {
        if (!it.checked) { skip(S.NOT_CHECKED); continue; }
        if (!mine && !overwriteChecked) { skip(paper ? S.PAPER : S.OTHER_INITIALS); continue; }
        fields = checkOff();
      } else if (action === 'resolve') {
        if (!it.issue) { skip(S.NO_OPEN_ISSUE); continue; }
        if (it.issueResolved) { skip(S.ALREADY_RESOLVED); continue; }
        fields = { issueResolved: true };
      } else if (action === 'resolveAndCheck') {
        if (it.reliability === 'FLAGGED') { skip(S.FLAGGED_RESOLVE); continue; }
        const canCheck = !it.checked || (overwriteChecked && !mine);
        if (!openIssue && !canCheck) { skip(it.checked ? (mine ? S.ALREADY_CHECKED : (paper ? S.PAPER : S.OTHER_INITIALS)) : S.NO_OPEN_ISSUE); continue; }
        fields = {};
        if (openIssue) fields.issueResolved = true;
        if (canCheck) Object.assign(fields, checkOn());
      } else if (action === 'setIssue') {
        if (it.issue === text && !it.issueResolved) { skip(S.SAME_ISSUE); continue; }
        if (it.issue && it.issue !== text) replaces = it.issue;   // the preview must show what is lost
        fields = { issue: text, issueResolved: false };
      } else if (action === 'clearIssue') {
        if (!it.issue) { skip(S.NO_ISSUE); continue; }
        fields = { issue: '', issueResolved: false };
      } else {
        throw new Error('unknown bulk action: ' + action);
      }
      const before = {};
      for (const k of Object.keys(fields)) before[k] = k in it ? it[k] : ABSENT;
      changes.push({ ...base, fields, before, replaces });
    }
    return { action, text, changes, skipped, docs: [...new Set(changes.map(c => c.docId))],
      replaced: changes.filter(c => c.replaces).length };
  }

  // Apply a plan: one patch per document, one activity line per document, one
  // re-render at the end, and an undo entry (kept in memory and mirrored to
  // localStorage) that holds the exact before-state AND what was written, so
  // undo can tell a line the bulk wrote from a line someone changed since.
  // Refuses to run before the cloud write path is ready: a bulk that lands in
  // the local log while sign-in is still pending would vanish at the first
  // snapshot and the toast would have lied.
  applyBulk(plan) {
    if (!this.user) return { error: 'set your initials first' };
    if (!this.canWriteNow()) return { error: 'still signing in to the cloud, try again in a moment' };
    if (!plan.changes.length) return { docs: 0, lines: 0 };
    const byDoc = new Map();
    for (const c of plan.changes) {
      if (!byDoc.has(c.docId)) byDoc.set(c.docId, { patch: {}, lines: [], n: 0 });
      const d = byDoc.get(c.docId);
      for (const [k, v] of Object.entries(c.fields)) d.patch[`items.${c.itemId}.${k}`] = v;
      d.lines.push({ itemId: c.itemId, code: c.code, fields: c.fields, before: c.before });
      d.n++;
    }
    const verb = Store.BULK_ACTIONS[plan.action] || plan.action;
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const entry = { id: 'b' + Date.now().toString(36), action: plan.action, label: `${verb}: ${pl(plan.changes.length, 'line')} in ${pl(byDoc.size, 'document')}`, docs: [], at: nowIso() };
    const waits = [];
    // One summary line for the whole job, then one per document, so Activity
    // reads as a job and not as N identical rows.
    const tagSet = [...new Set(plan.changes.map(c => c.code).filter(Boolean))];
    this.activity.push({ text: `bulk ${verb.toLowerCase()}: ${pl(plan.changes.length, 'line')} in ${pl(byDoc.size, 'document')}${tagSet.length ? ` · ${tagSet.slice(0, 6).join(', ')}${tagSet.length > 6 ? ` and ${tagSet.length - 6} more tags` : ''}` : ''}${plan.text ? ` (${plan.text})` : ''}`, by: this.user.initials, byCo: this.user.company || '', at: nowIso(), docId: '' });
    this._quiet = true;
    try {
      for (const [docId, d] of byDoc) {
        d.patch.updatedAt = nowIso();
        const codes = d.lines.map(l => l.code || l.itemId);
        waits.push(this._write(docId, d.patch, `bulk ${verb.toLowerCase()} on ${pl(d.n, 'line')} in ${docId}${plan.text ? ` (${plan.text})` : ''}: ${codes.slice(0, 12).join(', ')}${codes.length > 12 ? ` and ${codes.length - 12} more` : ''}`));
        entry.docs.push({ docId, lines: d.lines, n: d.n });
      }
    } finally { this._quiet = false; }
    this._emit();
    this.bulkUndo = (this.bulkUndo || []).concat(entry).slice(-20);
    this._saveUndo();
    const done = Promise.all(waits).then(oks => ({ failed: oks.filter(ok => !ok).length, total: oks.length }));
    return { docs: byDoc.size, lines: plan.changes.length, entry, done };
  }

  // Undo re-reads every line first. A field is reverted only where the line
  // still holds exactly what the bulk wrote; a line someone changed since is
  // left alone and reported, and a line that is gone is reported. Never a
  // blind write over another person's newer work.
  undoBulk(entry) {
    const stack = this.bulkUndo || [];
    const e = entry || stack[stack.length - 1];
    if (!e) return null;
    const S = Store.BULK_SKIP;
    let reverted = 0; const skipped = [];
    const waits = [];
    this._quiet = true;
    try {
      for (const d of e.docs) {
        const doc = this.getDoc(d.docId);
        const patch = {}; let n = 0;
        for (const l of d.lines) {
          const it = doc?.items?.[l.itemId];
          if (!it || it.deleted) { skipped.push({ docId: d.docId, itemId: l.itemId, code: l.code, why: S.GONE }); continue; }
          const intact = Object.entries(l.fields).every(([k, v]) => String(it[k] ?? '') === String(v ?? ''));
          if (!intact) { skipped.push({ docId: d.docId, itemId: l.itemId, code: l.code, why: S.CHANGED }); continue; }
          for (const [k, v] of Object.entries(l.before)) patch[`items.${l.itemId}.${k}`] = v;
          n++;
        }
        if (!n) continue;
        patch.updatedAt = nowIso();
        waits.push(this._write(d.docId, patch, `undid bulk edit on ${n} line${n === 1 ? '' : 's'} in ${d.docId}`));
        reverted += n;
      }
    } finally { this._quiet = false; }
    this._emit();
    this.bulkUndo = stack.filter(x => x !== e);
    this._saveUndo();
    return { reverted, skipped, done: Promise.all(waits).then(oks => ({ failed: oks.filter(ok => !ok).length, total: oks.length })) };
  }
  _saveUndo() {
    try { localStorage.setItem(UNDO_KEY, JSON.stringify((this.bulkUndo || []).slice(-20))); } catch { /* storage full or blocked */ }
  }
  loadUndo() {
    if (this.bulkUndo) return this.bulkUndo;
    try { this.bulkUndo = JSON.parse(localStorage.getItem(UNDO_KEY)) || []; } catch { this.bulkUndo = []; }
    return this.bulkUndo;
  }

  addNote(docId, text, flag) {
    const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this._write(docId, {
      [`notes.${id}`]: { text: text.trim(), flag, resolved: false, createdAt: nowIso(), by: this.user?.initials || '' },
      'updatedAt': nowIso(),
    }, `added a room note in ${docId}`);
  }
  resolveNote(docId, noteId) {
    this._write(docId, { [`notes.${noteId}.resolved`]: true, 'updatedAt': nowIso() }, `resolved a room note in ${docId}`);
  }

  // Firebase takes over as the source of truth when attached. Remote docs
  // replace local ones wholesale: the server copy already carries every
  // patch this device sent, so there is nothing local worth preserving.
  async attachBackend(backend) {
    this.backend = backend;
    this.status = { mode: 'firebase', ready: false, fromCache: false, pending: 0, message: null };
    await backend.start({
      onChange: docs => {
        if (Object.keys(docs).length) {
          for (const [id, d] of Object.entries(docs)) this.docs[id] = d;
        }
        this._emit();
      },
      onStatus: st => {
        this.status = { mode: 'firebase', ...st };
        this._emit();
      },
    });
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(); }
}

export async function loadStore() {
  let seed = window.__H2SEP_SEED;
  if (!seed) {
    // The staged seeds paint first, one file per floor; Firestore replaces
    // them within seconds. Every floor that loads is merged into one seed.
    // The approved floor-1 slice stays as the fallback so the app still boots
    // if every staged file is ever absent.
    const floors = [];
    for (const f of ['../../data/floor1-staged.json', '../../data/floor2-staged.json', '../../data/floor3-staged.json', '../../data/floor4-staged.json']) {
      try {
        const res = await fetch(new URL(f, import.meta.url));
        if (res.ok) floors.push(await res.json());
      } catch { /* that floor stays absent until Firestore arrives */ }
    }
    if (floors.length) {
      seed = { docs: {}, meta: { ...(floors[0].meta || {}), floors: floors.map(x => x.meta && x.meta.floor).filter(Boolean) } };
      for (const fl of floors) Object.assign(seed.docs, fl.docs);
    } else {
      try {
        const res = await fetch(new URL('../../data/slice-f1.json', import.meta.url));
        if (res.ok) seed = await res.json();
      } catch { /* nothing to paint from */ }
    }
  }
  return new Store(seed);
}
