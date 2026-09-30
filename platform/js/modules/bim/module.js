// 3D BIM module (module two in the registry, per ruling D7): its own entry in the
// left section menu; every room opens its CORRECT per-room geometry, exactly the
// first build's exhibit (A555 dims, mirroring by reflection, connecting-door logic).
// Rooms without their own model keep the honest hard-stop; never a relabeled shell.

import { ic, el, esc } from '../../core/ui.js';

let floorContext = null;
let floorBridgeInstalled = false;

function floorSnapshot(frame) {
  if (!floorContext || !frame?.contentWindow) return;
  const docs = Object.fromEntries(Object.entries(floorContext.store.docs)
    .filter(([id, doc]) => !id.startsWith('_') && !doc.deleted && Number(doc.floor) === 1));
  frame.contentWindow.postMessage({ type: 'ironstack:floor:snapshot', docs,
    label: 'Local review snapshot' }, location.origin);
}

function installFloorBridge(ctx) {
  floorContext = ctx;
  if (floorBridgeInstalled) return;
  floorBridgeInstalled = true;
  ctx.store.subscribe(() => {
    const frame = document.querySelector('iframe[name="ironstack-floor-1"]');
    if (frame) floorSnapshot(frame);
  });
  window.addEventListener('message', event => {
    const frame = document.querySelector('iframe[name="ironstack-floor-1"]');
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ironstack:floor:snapshot-request') floorSnapshot(frame);
    if (msg.type !== 'ironstack:floor:navigate' || typeof msg.route !== 'string') return;
    const match = msg.route.match(/^#\/(bim|room|space)\/([A-Za-z0-9_-]+)(?:\?tag=([^&#]{1,160}))?$/);
    if (!match) return;
    const [, kind, id] = match;
    const doc = floorContext.store.getDoc(id);
    if (kind === 'bim' ? floorContext.modelRooms.includes(id) : doc && !doc.deleted && Number(doc.floor) === 1) {
      const tag = kind === 'bim' && match[3] ? new URLSearchParams(msg.route.split('?')[1]).get('tag') : '';
      location.hash = `#/${kind}/${id}${tag ? '?tag=' + encodeURIComponent(tag) : ''}`;
    }
  });
}

// The viewer pages tell their host how graphics went (platform/materials/gl-context.js).
// When the browser cannot start 3D the frame already shows an honest card with the
// steps to take, so the dashboard only corrects the "drag to orbit" and "tap an object"
// hints that would otherwise sit beside a viewer that cannot draw, and puts them back
// if a Retry succeeds.
let glNoticeInstalled = false;
function installGlNotice() {
  if (glNoticeInstalled) return;
  glNoticeInstalled = true;
  const NOTE = 'The 3D view cannot start in this browser. Follow the steps shown in the 3D area; the checklists still work.';
  window.addEventListener('message', event => {
    const msg = event.data;
    if (event.origin !== location.origin || !msg || typeof msg !== 'object') return;
    if (msg.type !== 'ironstack:webgl-unavailable' && msg.type !== 'ironstack:webgl-ok') return;
    const frame = [...document.querySelectorAll('iframe[name="ironstack-floor-1"], iframe[name^="h2sep-room-"]')]
      .find(f => f.contentWindow === event.source);
    if (!frame) return;
    for (const node of document.querySelectorAll('.pagehead .sub, .floor-help span:first-child')) {
      if (msg.type === 'ironstack:webgl-unavailable') {
        if (node.dataset.glOriginal === undefined) node.dataset.glOriginal = node.textContent;
        node.textContent = NOTE;
      } else if (node.dataset.glOriginal !== undefined) {
        node.textContent = node.dataset.glOriginal;
        delete node.dataset.glOriginal;
      }
    }
  });
}

function renderFloorModel(ctx) {
  installFloorBridge(ctx);
  const root = el(`<section class="floor-screen">
    <div class="pagehead">
      <div><div class="floor-kicker">HOME2 SUITES · EAGLE PASS</div><h1 class="h1">First floor, connected</h1>
      <div class="sub">Guest rooms, corridor and common areas · select a space to explore</div></div>
      <span class="spacer"></span>
      <a class="btn" href="#/bim">${ic('cube')}Room models</a>
      <a class="btn" href="floor3d.html" target="_blank" rel="noopener">Full-screen model ↗</a>
    </div>
    <div class="viewer-wrap floor-viewer"><iframe name="ironstack-floor-1" title="Home2 Suites connected first-floor model" src="floor3d.html"></iframe></div>
    <div class="floor-help"><span>Drag to orbit · scroll to zoom · select a room for its model and checklist</span><span>Local review snapshot</span></div>
  </section>`);
  root.querySelector('iframe').addEventListener('load', () => floorSnapshot(root.querySelector('iframe')));
  return root;
}

function viewerFrame(no) {
  // Hosted: room3d.html reads ?room=. Artifact bundle: the srcdoc viewer reads the
  // iframe name ("h2sep-room-<no>") because srcdoc frames have no query string.
  const requestedTag = new URLSearchParams(location.hash.split('?')[1] || '').get('tag');
  const src = window.__H2SEP_VIEWER_SRCDOC
    ? '' : `room3d.html?room=${encodeURIComponent(no)}&view=iso${requestedTag ? '&tag=' + encodeURIComponent(requestedTag) : ''}`;
  const f = el(`<iframe title="Room ${esc(no)} 3D model" name="h2sep-room-${esc(no)}" loading="lazy"></iframe>`);
  if (window.__H2SEP_VIEWER_SRCDOC) f.srcdoc = window.__H2SEP_VIEWER_SRCDOC;
  else f.src = src;
  return f;
}

function renderHub(ctx) {
  const { store, modelRooms } = ctx;
  // Floor 1 only, per Austin 2026-09-02: "Only show 3d bim for 1st floor as
  // its already completed." Floors 2 to 4 have no models yet and are not listed.
  const floorOneRooms = store.guestRooms().filter(r => Number(r.floor) === 1).map(r => r.number);
  const upperRooms = store.guestRooms().filter(r => Number(r.floor) > 1).length;
  const root = el(`<div>
    <div class="pagehead"><h1 class="h1">3D BIM</h1>
      <span class="sub">first-floor room models and connected floor · select a view below</span></div>
    <section class="floor-intro">
      <div><div class="floor-kicker">HOME2 SUITES · FIRST FLOOR</div><h2>See how the whole floor connects.</h2>
      <p>Explore the guest-room wing, corridor and common areas together. Open a room's detailed model or jump straight to its checklist.</p>
      <a class="btn primary" href="#/bim/floor1">${ic('layers')}Open connected first floor</a></div>
      <div class="floor-summary"><b>${floorOneRooms.length}</b><span>guest rooms</span><i></i><strong>One connected view</strong><span>Overview · Guest wing · Common areas</span></div>
    </section>
    <section class="card bimlist">
      <div class="card-head"><h2>Floor 1 room models</h2><span class="card-cap">each room renders its own geometry, never a shared shell</span></div>
      <div class="rows"></div>
    </section>
    <section class="card" style="margin-top:14px"><div class="card-head"><h2>Upper floors</h2><span class="card-cap">checklists available</span></div>
      <div class="coming" style="padding:20px">${ic('cube')}<b>Floors 2 to 4 have no models</b>
      <span>3D models currently cover the first floor. Room checklists remain available for all four floors.</span></div>
    </section>
    ${upperRooms ? `<p class="card-cap" style="margin-top:14px">Floors 2 to 4 (${upperRooms} rooms) are live on the checklists and have no 3D models yet; they are not listed here.</p>` : ''}
  </div>`);
  const rows = root.querySelector('.rows');
  for (const no of floorOneRooms) {
    const has = ctx.modelRooms.includes(no);
    const doc = store.getDoc(no);
    rows.append(el(`<div class="mrow">
      <span class="cube">${ic('cube')}</span>
      <span style="flex:1"><b class="mono" style="font-size:15px">${esc(no)}</b>
        <span style="color:var(--muted);font-size:12.5px;margin-left:8px">${esc(doc.typeLabel || '')}</span></span>
      ${has
        ? `<a class="btn" href="#/bim/${esc(no)}">${ic('cube')}Open model</a>`
        : `<span class="chip ns sm">NO MODEL YET</span>`}
    </div>`));
  }
  return root;
}

function renderRoomModel(ctx, { no }) {
  const { store, modelRooms } = ctx;
  const doc = store.getDoc(no);
  const root = el(`<div>
    <div class="pagehead">
      <button class="icon-btn" data-back aria-label="Back">${ic('back')}</button>
      <div><h1 class="h1">Room ${esc(no)} · 3D</h1>
      <div class="sub">${esc(doc?.typeLabel || '')} · tap an object for its info card · TAGS chip toggles labels</div></div>
      <span class="spacer"></span>
      <a class="btn" href="#/bim/floor1">${ic('layers')}Connected floor</a>
      ${doc ? `<a class="btn" href="#/room/${esc(no)}">${ic('door')}Checklist</a>` : ''}
    </div>
    <div class="viewer-wrap"></div>
  </div>`);
  root.querySelector('[data-back]').addEventListener('click', () => { history.length > 1 ? history.back() : location.hash = '#/bim'; });
  const wrap = root.querySelector('.viewer-wrap');
  if (!modelRooms.includes(no)) {
    wrap.replaceWith(el(`<section class="card"><div class="coming">${ic('cube')}<b>NO 3D MODEL FOR ROOM ${esc(no)} YET</b>
      <span>This room type needs its own geometry before it renders here. Standing ruling: never another room's shell.</span></div></section>`));
  } else {
    wrap.append(viewerFrame(no));
  }
  return root;
}

export function bimModule() {
  installGlNotice();
  return {
    id: 'bim',
    name: '3D BIM',
    nav: [{ path: '#/bim', label: '3D BIM', icon: 'cube', section: 'Model' }],
    routes: [
      { match: /^#\/bim$/, render: renderHub },
      { match: /^#\/bim\/floor1$/, render: renderFloorModel },
      { match: /^#\/bim\/(?<no>[^?]+)/, render: renderRoomModel },
    ],
  };
}
