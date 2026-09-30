/* Home2 Suites source library. Static, same-origin registry; no account or write APIs. */
(function () {
  'use strict';
  if (window.Home2Documents) return;
  const base = new URL('./', document.currentScript.src);
  const css = new URL('document-library.css', base).href;
  if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(x => x.href === css)) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = css; document.head.append(link);
  }
  let registry, modal, returnFocus, currentRoom, currentTab, selectedDoc, selectedTag, zoom = 100;
  let request = 0;
  const mountRequests = new WeakMap();
  const ready = fetch(new URL('registry.json', base)).then(r => {
    if (!r.ok) throw new Error('Source library could not be loaded.');
    return r.json();
  }).then(data => (registry = data));
  // Calls show their own readable error; avoid an unhandled rejection on pages
  // that load this module but never open documents.
  ready.catch(() => {});
  const el = (tag, cls, text) => {
    const node = document.createElement(tag); if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text; return node;
  };
  function url(value) {
    if (!value) return null;
    try {
      const u = new URL(value, base);
      return (u.origin === location.origin || (u.protocol === 'https:' && /^(drive|docs)\.google\.com$/.test(u.hostname))) ? u.href : null;
    } catch (_) { return null; }
  }
  function link(label, href, cls) {
    const a = el('a', cls, label); a.href = url(href); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function button(label, action, cls) {
    const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b;
  }
  function key(room) { return String(room || '').replace(/^S-?/, '').replace(/^ZONE-/, 'ZONE').toUpperCase(); }
  function roomFor(room) { return registry?.rooms?.[key(room)] || registry?.rooms?.[String(room)] || null; }
  function itemFor(room, tag) {
    const items = roomFor(room)?.items || {};
    const value = String(tag || '');
    return items[value] || items[value.replace(/R$/, '')] || null;
  }
  function tabs() { return [['plan','Plans'],['elevations','Elevations'],['bath','Bathroom'],['items','Item references']]; }
  function close() { if (modal?.open) modal.close(); }
  function ensureModal() {
    if (modal) return;
    modal = el('dialog', 'h2docs'); modal.setAttribute('aria-labelledby', 'h2docs-title');
    const shell = el('div', 'h2docs-shell');
    const header = el('header', 'h2docs-header');
    const heading = el('div'); heading.append(el('p','h2docs-eyebrow','HOME2 SUITES · SOURCE LIBRARY'), el('h2','',''));
    heading.lastChild.id = 'h2docs-title';
    const x = button('×', close, 'h2docs-close'); x.setAttribute('aria-label','Close document library');
    header.append(heading,x);
    const context = el('p','h2docs-context');
    const nav = el('div','h2docs-tabs'); nav.setAttribute('role','tablist'); nav.setAttribute('aria-label','Document category');
    tabs().forEach(([id,label]) => {
      const b = button(label, () => selectTab(id), 'h2docs-tab'); b.dataset.tab = id;
      b.id = `h2docs-tab-${id}`; b.setAttribute('role','tab'); b.setAttribute('aria-controls','h2docs-panel'); nav.append(b);
    });
    nav.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      const buttons = [...nav.querySelectorAll('button')];
      let index = buttons.indexOf(document.activeElement); if (index < 0) return;
      e.preventDefault();
      index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length-1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      selectTab(buttons[index].dataset.tab); buttons[index].focus();
    });
    const panel = el('div','h2docs-panel'); panel.id = 'h2docs-panel'; panel.setAttribute('role','tabpanel');
    const footer = el('footer','h2docs-footer','Source drawings retain their original orientation. Linked supplier documents are references; approval is shown only when verified.');
    shell.append(header,context,nav,panel,footer); modal.append(shell); document.body.append(modal);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.addEventListener('close', () => { returnFocus?.isConnected && returnFocus.focus(); });
    modal.addEventListener('cancel', e => { e.preventDefault(); close(); });
  }
  function displayError(message) {
    ensureModal(); currentRoom = null;
    modal.querySelector('.h2docs-tabs').hidden = true;
    modal.querySelector('#h2docs-title').textContent = 'Source documents';
    modal.querySelector('.h2docs-context').textContent = message;
    modal.querySelector('.h2docs-panel').replaceChildren();
    if (!modal.open) { returnFocus = document.activeElement; modal.showModal(); }
  }
  function refsForTab() {
    const room = roomFor(currentRoom);
    if (!room) return [];
    if (currentTab === 'items') {
      if (selectedTag) return itemFor(currentRoom, selectedTag)?.references || [];
      const refs = [], seen = new Set();
      Object.values(room.items || {}).forEach(item => (item.references || []).forEach(ref => {
        const identity = `${ref.title}|${ref.image || ref.url || ''}`;
        if (!seen.has(identity)) { refs.push(ref); seen.add(identity); }
      }));
      return refs;
    }
    return (room[currentTab] || []).map(id => registry.documents[id]).filter(Boolean);
  }
  function selectTab(id) {
    if (!registry?.rooms || !currentRoom) return;
    currentTab = id; selectedDoc = null; zoom = 100;
    modal.querySelectorAll('[data-tab]').forEach(b => {
      const active = b.dataset.tab === id; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
    });
    modal.querySelector('.h2docs-panel').setAttribute('aria-labelledby',`h2docs-tab-${id}`);
    renderPanel();
  }
  function renderPanel() {
    const panel = modal.querySelector('.h2docs-panel'); panel.replaceChildren();
    const refs = refsForTab();
    if (!refs.length) {
      const empty = el('div','h2docs-empty');
      empty.append(el('h3','',currentTab === 'items' ? 'No direct item document is indexed' : 'No drawing is indexed for this view'));
      empty.append(el('p','',currentTab === 'items' ? 'Use the room plans and sheet references for context. This does not indicate approval or absence from the project record.' : 'The library contains only recovered source drawings.'));
      if (currentTab !== 'plan') empty.append(button('View available plans',() => selectTab('plan'),'h2docs-action'));
      panel.append(empty); return;
    }
    const nav = el('nav','h2docs-list'); nav.setAttribute('aria-label','Available documents');
    const stage = el('section','h2docs-stage');
    const select = (ref, index) => {
      selectedDoc = ref; zoom = 100;
      nav.querySelectorAll('button').forEach((b,i) => b.setAttribute('aria-current', i === index ? 'true' : 'false'));
      renderDocument(stage,ref);
    };
    refs.forEach((ref,index) => {
      const b = button('',() => select(ref,index),'h2docs-document');
      b.append(el('small','',ref.sheet || ref.kind || 'REFERENCE'),el('span','',ref.title)); nav.append(b);
    });
    panel.append(nav,stage); select(refs[0],0);
  }
  function renderDocument(stage,ref) {
    stage.replaceChildren();
    const head = el('div','h2docs-document-head'); head.append(el('h3','',ref.title));
    const metadata = [ref.sheet, ref.view, ref.revision, ref.date, ref.page ? `PDF page ${ref.page}` : null].filter(Boolean);
    head.append(el('p','h2docs-meta',metadata.join(' · ')));
    if (ref.note) head.append(el('p','h2docs-note',ref.note));
    if (ref.kind === 'submittal') head.append(el('p','h2docs-status',ref.approval || 'Approval status not verified'));
    const actions = el('div','h2docs-actions');
    if (url(ref.url)) actions.append(link('Open original ↗',ref.url,'h2docs-action'));
    if (url(ref.fullImage || ref.image)) actions.append(link('Full drawing image ↗',ref.fullImage || ref.image,'h2docs-action h2docs-secondary'));
    head.append(actions); stage.append(head);
    if (!url(ref.image)) {
      const message = el('div','h2docs-file'); message.append(el('span','','PDF'),el('p','','Open the original document to view the complete source. Google Drive may ask you to sign in.'));
      stage.append(message); return;
    }
    const toolbar = el('div','h2docs-zoom');
    const viewport = el('div','h2docs-image-viewport');
    const img = el('img','h2docs-image'); img.src = url(ref.image); img.alt = `${ref.sheet || ''} ${ref.title}`.trim(); img.loading = 'eager'; img.draggable = false;
    const readout = el('span','','100%');
    const setZoom = n => { zoom = Math.max(100,Math.min(300,n)); img.style.width = `${zoom}%`; readout.textContent = `${zoom}%`; };
    toolbar.append(button('−',()=>setZoom(zoom-25),'h2docs-zoom-button'),readout,button('+',()=>setZoom(zoom+25),'h2docs-zoom-button'),button('Fit',()=>setZoom(100),'h2docs-zoom-button'));
    toolbar.querySelectorAll('button')[0].setAttribute('aria-label','Zoom out'); toolbar.querySelectorAll('button')[1].setAttribute('aria-label','Zoom in');
    img.addEventListener('error',() => { viewport.replaceChildren(el('p','h2docs-empty','Drawing image unavailable. Open the original source above.')); });
    viewport.tabIndex = 0; viewport.setAttribute('aria-label','Drawing viewport. Use zoom controls and scroll to inspect.');
    viewport.append(img); stage.append(toolbar,viewport);
  }
  async function openRoom(roomId, tab = 'plan', tag = null) {
    const token = ++request;
    try {
      await ready; if (token !== request) return false;
      const room = roomFor(roomId); if (!room) { displayError('No source set is indexed for this space.'); return false; }
      ensureModal(); currentRoom = key(roomId); selectedTag = tag;
      modal.querySelector('.h2docs-tabs').hidden = false;
      const item = tag ? itemFor(roomId,tag) : null;
      modal.querySelector('#h2docs-title').textContent = item ? `${room.title} · ${tag}` : room.title;
      modal.querySelector('.h2docs-context').textContent = [room.note, item?.label].filter(Boolean).join(' ');
      const wanted = tab === 'plans' ? 'plan' : tab;
      selectTab(tabs().some(([id])=>id===wanted) ? wanted : 'plan');
      if (!modal.open) { returnFocus = document.activeElement; modal.showModal(); }
      modal.querySelector('.h2docs-close').focus(); return true;
    } catch (error) { if (token === request) displayError(error.message); return false; }
  }
  async function mountItem(container,roomId,tag) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return false;
    const token = {}; mountRequests.set(container,token); container.replaceChildren();
    try {
      await ready; if (mountRequests.get(container) !== token || !container.isConnected) return false;
      const item = itemFor(roomId,tag), refs = item?.references || [];
      const block = el('div','h2docs-inline');
      block.append(el('span','h2docs-inline-title','SOURCE DOCUMENTS'));
      if (refs.length) {
        const images = refs.filter(r=>r.image).length, subs = refs.filter(r=>r.kind==='submittal').length;
        block.append(button(`View ${images ? 'drawing detail' : 'references'}${subs ? ' + supplier documents' : ''}`,()=>openRoom(roomId,'items',tag),'h2docs-inline-button'));
        block.append(el('small','',`${refs.length} source reference${refs.length===1?'':'s'}${subs ? ' · approval not verified' : ''}`));
      } else {
        block.append(button('View room drawings',()=>openRoom(roomId,'plan'),'h2docs-inline-button'));
        block.append(el('small','','No direct item document indexed.'));
      }
      container.append(block); return !!refs.length;
    } catch (_) {
      if (mountRequests.get(container) === token) container.append(el('p','h2docs-note','Source library unavailable.'));
      return false;
    }
  }
  window.Home2Documents = { ready, openRoom, mountItem, openItem: (room,tag) => openRoom(room,'items',tag), close };
})();
