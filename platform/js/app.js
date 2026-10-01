// H2SEP Platform boot: small stable core reads the module registry (ERP idea,
// our code). Modules: tracking (module one), bim (module two). Zero core edits
// when a module is added; that is the upgrade-safe contract to prove later.

import { loadStore } from './core/store.js';
import { Registry, startRouter } from './core/registry.js';
import { ic, el, esc } from './core/ui.js';
import { trackingModule, identityGate } from './modules/tracking/module.js';
import { bimModule } from './modules/bim/module.js';
import { directoryModule } from './modules/directory/module.js';
import { firebaseConfig } from './config.js';

// One knob decides the copy's nature: with no Firebase config this is a local
// review of saved records (no sign-in, nothing saved); with a config it is a
// live client - the identity sheet gates checking, writes sync to the
// platform's own ledger (projects/h2sep/platform_rooms), and the crew app's
// records are never touched (see core/firebase-backend.js). The master repo
// ships null; the live deployment carries the real config in config.js.
const LOCAL_REVIEW = !firebaseConfig;

// Rooms with their own CORRECT geometry in the viewer (D7): every floor-1 key.
// The QQ family is drawn from A555; the King family from A550 (116 from view
// 01.1, 118 from A552), verified room by room on 2026-09-02 (D41). Floors 2 to
// 4 have no models and are not listed, per Austin. king-studio.html exists but
// is a materials exhibit, not the tagged viewer.
const MODEL_ROOMS = ['101', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114', '115', '116', '118'];

const store = await loadStore();
// Local review signs nothing, so a stand-in identity keeps the UI whole.
// Live mode must NOT seed one: with no user, the "Who is checking?" sheet
// gates the first visit, exactly like the crew app. A device that visited
// during local review still carries the stand-in in storage - forget it, so
// the live boot onboards that person properly instead of skipping them past
// the sheet.
// Guarded call: right after a deploy a phone can briefly hold THIS file fresh
// and core/store.js from cache, and an unconditional call to a brand-new
// method would crash the boot to a black screen. Degrading to "keep the
// stand-in until the cache turns over" is the acceptable failure.
if (!LOCAL_REVIEW && store.user?.name === 'Preview Reviewer' && store.user?.initials === 'RV' && typeof store.clearUser === 'function') store.clearUser();
if (!store.user && LOCAL_REVIEW) store.setUser('Preview Reviewer', 'RV', 'Local review');

// Attach Firebase when configured. The bundled artifact preview cannot reach
// external hosts (its page blocks them), so it stays in local mode by flag.
if (!LOCAL_REVIEW && firebaseConfig && !window.__H2SEP_NO_BACKEND) {
  store.expectBackend = true;   // a bulk write refuses to run until the backend is attached and signed in
  import('./core/firebase-backend.js')
    .then(({ FirebaseBackend }) => store.attachBackend(new FirebaseBackend(firebaseConfig)))
    .catch(err => { store.status.message = 'Backend unavailable: ' + (err.message || err); store._emit(); });
}

const registry = new Registry();
registry.register(trackingModule(store));
registry.register(directoryModule());   // module three: contacts + sub assignments
registry.register(bimModule());

const ctx = { store, registry, modelRooms: MODEL_ROOMS };
window.__store = store;   // debug/test handle, same as the crew app exposes

const app = document.getElementById('app');

function connPill(st) {
  if (LOCAL_REVIEW || st.mode === 'local') return '<span class="offline-pill">LOCAL REVIEW · SAVED SNAPSHOT</span>';
  if (st.message) return `<span class="offline-pill">${esc(st.message)}</span>`;
  if (!st.ready) return '<span class="offline-pill">SIGNING IN…</span>';
  if (st.pending > 0) return `<span class="offline-pill">SYNCING · ${st.pending} QUEUED</span>`;
  if (st.fromCache) return '<span class="offline-pill">OFFLINE · CACHED</span>';
  return '<span class="live-pill"><i class="dot"></i>LIVE · SYNCED</span>';
}

function navLink(n, hash, mobile) {
  const active = n.path === '#/' ? (hash === '#/' || hash === '') : hash.startsWith(n.path);
  return `<a href="${n.path}" class="${active ? 'active' : ''}">${ic(n.icon)}<span>${esc(n.label)}</span>${!mobile && n.count ? `<span class="ct">${n.count}</span>` : ''}</a>`;
}

function renderShell(hash, renderScreen) {
  const u = store.user;
  const entries = registry.navEntries();
  const main = entries.filter(n => !n.section);
  const modelSect = entries.filter(n => n.section === 'Model');
  // Bulk mark rides on the phone too (Austin, 2026-09-02: "Add bulk edit to the mobile app").
  const mobilePicks = ['#/', '#/rooms', '#/bulk', '#/contacts', '#/bim', '#/activity'];

  app.innerHTML = '';
  app.append(el(`<div class="shell">
    <aside class="side">
      <div class="brand"><img src="${window.__H2SEP_LOGO || '../brand/ironstack-logo.png'}" alt="IRONSTACK.PRO — Build Better Systems."/></div>
      <div class="proj"><div class="pcode">H2SEP · FLOORS 1-4 REVIEW</div><div class="pname">Home2 Suites · Eagle Pass</div><div class="conn">${connPill(store.status)}</div></div>
      <nav class="nav">
        ${main.map(n => navLink(n, hash)).join('')}
        <div class="sect">Model</div>
        ${modelSect.map(n => navLink(n, hash)).join('')}
      </nav>
      <div class="me">
        <span class="av">${esc(u?.initials || '?')}</span>
        <span><span class="mn">${esc(u?.name || 'Set your initials')}</span><br/><span class="mr">${u ? esc(u.company || 'Initials on every check') : 'Required to check items'}</span></span>
        <button class="sw" data-id-switch>${u ? 'switch' : 'set up'}</button>
      </div>
    </aside>
    <main class="main">
      <header class="project-brandbar" aria-label="Home2 Suites project and Ironstack studio">
        <div class="project-brandbar-label">HOME2 SUITES · EAGLE PASS<span>Field operations &amp; model studio</span></div>
        <div class="project-brandbar-logos">
          <img class="hotel-brand-logo" src="../brand/home2-suites-by-hilton.svg" alt="Home2 Suites by Hilton" width="116" height="64"/>
        </div>
      </header>
    </main>
    <nav class="navmob">${entries.filter(n => mobilePicks.includes(n.path)).map(n => navLink(n, hash, true)).join('')}</nav>
  </div>`));

  const mobPill = el(`<div class="connmob">${connPill(store.status)}</div>`);
  app.append(mobPill);
  app.querySelectorAll('[data-id-switch]').forEach(b => b.addEventListener('click', () => identityGate(ctx)));
  const mainEl = app.querySelector('.main');
  if (renderScreen) mainEl.append(renderScreen());
  else mainEl.append(el(`<div class="coming"><b>Not found</b><span>That screen does not exist. Use the menu.</span></div>`));
  if (!store.user && !sessionStorage.getItem('h2sep-original-review:id-prompted')) {
    sessionStorage.setItem('h2sep-original-review:id-prompted', '1');
    identityGate(ctx);
  }
}

startRouter(registry, ctx, renderShell);
