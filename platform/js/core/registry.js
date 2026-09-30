// Module registry (OpenConstructionERP idea, our code): a small stable core reads
// this registry; every feature ships as a module that registers nav entries and
// routes. Module two through module twenty plug in the same way with zero core edits.

export class Registry {
  constructor() { this.modules = []; this.routes = []; }

  register(mod) {
    // mod: { id, name, nav: [{path,label,icon,count?,section?}], routes: [{match, render}] }
    this.modules.push(mod);
    for (const r of mod.routes || []) this.routes.push({ ...r, moduleId: mod.id });
  }

  navEntries() {
    const entries = [];
    for (const m of this.modules) for (const n of m.nav || []) entries.push({ ...n, moduleId: m.id });
    // A module declares where it sits in the menu, so registration order does
    // not decide the office nav. No order given means "after the numbered ones".
    return entries.sort((a, b) => (a.order ?? 500) - (b.order ?? 500));
  }

  resolve(hash) {
    for (const r of this.routes) {
      const m = hash.match(r.match);
      if (m) return { route: r, params: m.groups || {}, match: m };
    }
    return null;
  }
}

export function startRouter(registry, ctx, renderShell) {
  // A store change re-renders the same screen in place: keep the scroll
  // position, so checking a line at the bottom of a long checklist does not
  // throw the reader back to the top. A hash change is a new screen and
  // starts at the top, as before.
  let lastHash = null;
  const render = () => {
    const hash = location.hash || '#/';
    const sameScreen = hash === lastHash;
    const y = sameScreen ? window.scrollY : 0;
    lastHash = hash;
    const hit = registry.resolve(hash);
    renderShell(hash, hit ? () => hit.route.render(ctx, hit.params) : null);
    if (sameScreen && y) {
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight)));
    }
  };
  window.addEventListener('hashchange', render);
  ctx.store.subscribe(() => render());
  render();
  return render;
}
