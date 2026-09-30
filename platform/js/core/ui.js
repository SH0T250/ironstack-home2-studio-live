// Shared UI helpers + the inline SVG icon set (no emoji as icons, parity with mocks).

export const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  door: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><circle cx="15.2" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  layers: '<path d="M12 3 21 8l-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  tagi: '<path d="M3 3h8l10 10-8 8L3 11V3z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>',
  people: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.7-3.4 3.2-5.2 6.2-5.2s5.5 1.8 6.2 5.2"/><path d="M16 4.6a3.4 3.4 0 0 1 0 6.8M17.6 14.9c2.1.6 3.3 2.2 3.8 5.1"/>',
  contact: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 17.5c.5-1.9 1.8-2.9 3.2-2.9s2.7 1 3.2 2.9M15 9h4M15 13h4"/>',
  file: '<path d="M6 2h8l5 5v15H6V2z"/><path d="M14 2v5h5"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  cube: '<path d="M12 2.5 21 7.5v9l-9 5-9-5v-9l9-5z"/><path d="M12 12.5 21 7.5M12 12.5 3 7.5M12 12.5v9.5"/>',
  check: '<path d="M4.5 12.5 10 18 19.5 6.5"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  printer: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><rect x="7" y="13" width="10" height="8"/>',
  jump: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M9 6H4v14h14v-5"/>',
  note: '<path d="M4 4h16v12l-4 4H4V4z"/><path d="M16 20v-4h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wrench: '<path d="M14.2 6.3a4.6 4.6 0 0 0-6 5.9L3 17.4 6.6 21l5.2-5.2a4.6 4.6 0 0 0 5.9-6L14.6 13l-2.5-2.5 2.1-4.2z"/>',
  phone: '<path d="M6.5 3h3l1.6 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.6v3c0 .9-.7 1.6-1.6 1.5C10.6 17.6 6.4 13.4 5 5.6A1.5 1.5 0 0 1 6.5 3z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  clip: '<path d="M20 11.5 12.6 19a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l6.8-6.9"/>',
};

export function ic(name, cls = 'ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mo = d.toLocaleString('en-US', { month: 'short' });
  let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12;
  return `${mo} ${d.getDate()} · ${h}:${m}${ap}`;
}

let toastTimer = null;
// One action ({ label, fn }) or several ([{ label, fn }, ...], D57).
export function toast(msg, action) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const actions = Array.isArray(action) ? action : (action ? [action] : []);
  const t = el(`<div class="toast" role="status">${esc(msg)}${actions.map((a, i) => `<button data-i="${i}">${esc(a.label)}</button>`).join('')}</div>`);
  t.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { actions[Number(b.dataset.i)].fn(); t.remove(); }));
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), actions.length ? 8000 : 3200);
}

export function sheet(innerHtml, { onClose } = {}) {
  const scrim = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${innerHtml}</div></div>`);
  const close = () => { scrim.remove(); onClose && onClose(); };
  scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  scrim.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', function escKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escKey); }
  });
  document.body.append(scrim);
  return { scrim, close };
}

// Long-press without text selection (ruling D6): pointer events + threshold,
// cancels on scroll/move, never relies on contextmenu.
export function pressable(node, { tap, hold, holdMs = 480 } = {}) {
  let timer = null, held = false, startY = 0, startX = 0;
  node.addEventListener('contextmenu', e => e.preventDefault());
  node.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    held = false; startY = e.clientY; startX = e.clientX;
    timer = setTimeout(() => {
      held = true;
      if (navigator.vibrate) navigator.vibrate(12);
      hold && hold(e);
    }, holdMs);
  });
  node.addEventListener('pointermove', e => {
    if (timer && (Math.abs(e.clientY - startY) > 10 || Math.abs(e.clientX - startX) > 10)) {
      clearTimeout(timer); timer = null;
    }
  });
  const clear = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointercancel', clear);
  node.addEventListener('pointerleave', clear);
  node.addEventListener('pointerup', () => {
    if (timer) { clearTimeout(timer); timer = null; if (!held) tap && tap(); }
  });
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap && tap(); }
  });
}
