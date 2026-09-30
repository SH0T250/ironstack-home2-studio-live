/* Shared graphics start-up for the 3D viewers (room3d.html and floor3d.html).
 *
 * WHY THIS EXISTS
 * A page cannot make a browser's graphics chip work. When Chrome or Edge fails
 * to start its graphics layer, every WebGL request returns null and no viewer
 * can draw. What a page CAN do is (1) ask in a sensible order, hardware first
 * and software last, (2) keep the reason the browser gives, and (3) say what
 * happened in plain words instead of showing a wrong or half-dead screen.
 *
 * The browser attributes matter less than the earlier code assumed: an
 * unsupported antialias request is silently ignored and powerPreference is only
 * a hint. The one attribute that can make creation fail on purpose is
 * failIfMajorPerformanceCaveat. It is used here to PREFER real hardware, but it
 * does not always trip (Chromium accepts SwiftShader without complaint when it
 * was requested explicitly), so software drawing is also recognized by the
 * renderer name. If a privacy setting hides that name, software drawing is
 * assumed to be hardware and the viewer runs at full quality.
 *
 * API (window.IronstackGL)
 *   create(THREE, {antialias})  -> {renderer, report}   throws Error with .report
 *   unavailable({...})          -> paints the honest "3D unavailable" card
 *   softwareNotice(report)      -> short notice when the browser draws in software
 *   diagnostics(report)         -> plain text a person can paste to support
 *
 * Messages to a hosting page (the dashboard) on window.parent:
 *   ironstack:webgl-unavailable  the viewer could not start (card is showing)
 *   ironstack:webgl-ok           the viewer started (clears an earlier warning)
 *
 * Page furniture that must be hidden while the card is showing (the room
 * viewer's Room 101 markup, the floor viewer's dead toolbar) is hidden by each
 * PAGE's own CSS under body.gl-dead, not here, so this file stays page-agnostic.
 *
 * Add ?gfx=full to any viewer URL to skip the software-quality tier (shadows
 * stay on, pixel ratio is not capped). Useful when a slow but capable renderer
 * such as a cloud container is being used for screenshots.
 */
(function (root) {
  'use strict';

  var SOFTWARE_RE = /SwiftShader|llvmpipe|softpipe|Basic Render|WARP|Software/i;

  function rungList(wantAA) {
    /* Attributes are spelled out so they match Three.js r128's own defaults
       (alpha false, stencil true); the browser's defaults are different. */
    function attrs(aa, power, caveat) {
      var a = { alpha: false, depth: true, stencil: true, premultipliedAlpha: true,
        preserveDrawingBuffer: false, antialias: aa, powerPreference: power };
      if (caveat) a.failIfMajorPerformanceCaveat = true;
      return a;
    }
    var list = [];
    list.push({ id: 'hardware-webgl2', names: ['webgl2'], attrs: attrs(wantAA, 'high-performance', true) });
    if (wantAA) list.push({ id: 'hardware-webgl2-default-adapter', names: ['webgl2'], attrs: attrs(true, 'default', true) });
    list.push({ id: 'hardware-webgl2-no-msaa', names: ['webgl2'], attrs: attrs(false, 'default', true) });
    list.push({ id: 'hardware-webgl1', names: ['webgl', 'experimental-webgl'], attrs: attrs(false, 'default', true) });
    list.push({ id: 'software-webgl2', names: ['webgl2'], attrs: attrs(false, 'default', false) });
    list.push({ id: 'software-webgl1', names: ['webgl', 'experimental-webgl'], attrs: attrs(false, 'default', false) });
    return list;
  }

  function attempt(rung) {
    /* A fresh canvas per attempt: a failed getContext leaves the canvas usable,
       but a fresh one keeps each attempt's reason separate and clean. */
    var canvas = document.createElement('canvas');
    var reasons = [];
    canvas.addEventListener('webglcontextcreationerror', function (ev) {
      if (ev && ev.statusMessage) reasons.push(String(ev.statusMessage));
    }, false);
    var gl = null, tried = [];
    for (var j = 0; j < rung.names.length && !gl; j++) {
      tried.push(rung.names[j]);
      try { gl = canvas.getContext(rung.names[j], rung.attrs); }
      catch (err) { reasons.push('getContext threw: ' + (err && err.message)); }
    }
    return { canvas: canvas, gl: gl, tried: tried, reasons: reasons };
  }

  function loseQuietly(gl) {
    try { var lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (_) { /* nothing to release */ }
  }

  function tellHost(message) {
    try {
      if (window.parent !== window) window.parent.postMessage(message, location.origin);
    } catch (_) { /* standalone, cross-origin or file://: nothing to tell */ }
  }

  function create(THREE, opts) {
    opts = opts || {};
    var wantAA = opts.antialias !== false;
    var forceFull = false;
    try { forceFull = new URLSearchParams(location.search).get('gfx') === 'full'; } catch (_) { /* no query string */ }
    var report = { userAgent: navigator.userAgent, page: location.pathname + location.search,
      attempts: [], chosen: null, renderer: null, software: null, webgl2: null,
      msaa: 0, wantedMsaa: wantAA, forcedFull: forceFull };
    var list = rungList(wantAA);
    for (var i = 0; i < list.length; i++) {
      var rung = list[i], a = attempt(rung);
      var rec = { rung: rung.id, ok: !!a.gl, tried: a.tried, reason: a.reasons.length ? a.reasons[0].slice(0, 400) : null };
      report.attempts.push(rec);
      if (!a.gl) continue;
      try {
        var renderer = new THREE.WebGLRenderer({ canvas: a.canvas, context: a.gl, alpha: false,
          antialias: !!rung.attrs.antialias, powerPreference: rung.attrs.powerPreference });
        try {
          var ext = a.gl.getExtension('WEBGL_debug_renderer_info');
          report.renderer = String(ext ? a.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : a.gl.getParameter(a.gl.RENDERER));
        } catch (_) { report.renderer = null; }
        try { report.msaa = Number(a.gl.getParameter(a.gl.SAMPLES)) || 0; } catch (_) { report.msaa = 0; }
        report.chosen = rung.id;
        report.webgl2 = typeof root.WebGL2RenderingContext !== 'undefined' && a.gl instanceof root.WebGL2RenderingContext;
        report.software = rung.id.indexOf('software') === 0 || SOFTWARE_RE.test(report.renderer || '');
        if (forceFull) report.software = false;
        tellHost({ type: 'ironstack:webgl-ok' });
        return { renderer: renderer, report: report };
      } catch (err2) {
        rec.ok = false;
        rec.reason = 'Three.js could not use this context: ' + (err2 && err2.message);
        loseQuietly(a.gl);
      }
    }
    var e = new Error('No WebGL context could be created');
    e.report = report;
    throw e;
  }

  function diagnostics(report, error) {
    var out = ['Ironstack 3D graphics report', '', 'Page: ' + (report && report.page || location.pathname + location.search),
      'Browser: ' + (report && report.userAgent || navigator.userAgent)];
    if (error && error.message) out.push('Error: ' + error.message);
    if (report) {
      out.push('Result: ' + (report.chosen ? 'started with ' + report.chosen + (report.software ? ' (software drawing)' : ' (hardware)') : 'no graphics context could be created'));
      if (report.renderer) out.push('Graphics: ' + report.renderer);
      out.push('', 'Attempts:');
      (report.attempts || []).forEach(function (a, n) {
        out.push((n + 1) + '. ' + a.rung + ': ' + (a.ok ? 'ok' : 'failed') + (a.reason ? ' | ' + a.reason : ''));
      });
    }
    return out.join('\n');
  }

  function classify(report) {
    var text = ((report && report.attempts) || []).map(function (a) { return a.reason || ''; }).join(' | ');
    return /disabled by enterprise policy|commandline switch|blocklist|blacklist/i.test(text) ? 'off' : 'failed';
  }

  var CSS = [
    /* The wrapper scrolls (so a short window never clips the card, and its
       scrollbar and empty margins work). Nothing else in the stage is
       interactive in this state and the side panel sits above it. margin:auto
       centers the box and lets an oversized box start at the top instead of
       overflowing upward. */
    '.gl-card{position:absolute;inset:0;z-index:20;display:flex;overflow-y:auto;padding:24px 24px 24px 336px}',
    '.gl-card>div{margin:auto;max-width:540px;background:var(--panel,#12181f);color:var(--ink,#eef3f7);border:1px solid var(--line,rgba(143,160,173,.22));border-left:3px solid var(--cyan,#02A9E0);border-radius:6px;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.45)}',
    '.gl-card h2{font:700 15px/1.3 var(--mono,monospace);letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}',
    '.gl-card p{font:13.5px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--mut,#8fa0ad);margin:0 0 10px}',
    '.gl-card ol{font:13.5px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink,#eef3f7);margin:0 0 12px;padding-left:20px}',
    '.gl-card li{margin:0 0 6px}',
    '.gl-card .act{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.gl-card button,.gl-card a.b{font:700 11px var(--mono,monospace);letter-spacing:.1em;text-transform:uppercase;padding:10px 12px;min-height:40px;border-radius:4px;border:1px solid var(--cyan,#02A9E0);background:transparent;color:var(--cyan,#02A9E0);text-decoration:none;cursor:pointer;display:inline-flex;align-items:center}',
    '.gl-card button.primary{background:var(--cyan,#02A9E0);color:#03181f}',
    '.gl-card button:hover,.gl-card a.b:hover{filter:brightness(1.15)}',
    '.gl-card details{margin-top:12px;font:11px/1.5 var(--mono,monospace);color:var(--mut,#8fa0ad)}',
    '.gl-card summary{display:list-item;box-sizing:border-box;min-height:40px;padding:10px 0;cursor:pointer}',
    '.gl-card pre{white-space:pre-wrap;word-break:break-word;margin:4px 0 0;max-height:180px;overflow:auto}',
    /* Phones and narrow windows: the pages put fixed bars (back bar, menu
       button) across the top, so start the card below them. */
    '@media(max-width:900px){.gl-card{padding:calc(env(safe-area-inset-top, 0px) + 72px) 16px 48px}.gl-card button,.gl-card a.b,.gl-card summary{min-height:44px}.gl-card button,.gl-card a.b{font-size:12px}}',
    /* The software notice sits bottom-left of the glass, right of the side
       panel, above the pages' caption strip, so it covers no control. */
    '.gl-toast{position:fixed;left:330px;bottom:56px;z-index:9;max-width:min(520px,calc(100vw - 342px));background:var(--panel,#12181f);color:var(--ink,#eef3f7);border:1px solid var(--line,rgba(143,160,173,.22));border-left:3px solid var(--cyan,#02A9E0);border-radius:6px;padding:10px 12px;font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;gap:12px;align-items:flex-start}',
    '.gl-toast b{font-weight:700}',
    '.gl-toast button{flex:none;min-height:40px;min-width:72px;padding:0 12px;font:700 11px var(--mono,monospace);letter-spacing:.06em;color:var(--ink,#eef3f7);background:transparent;border:1px solid var(--line,rgba(143,160,173,.5));border-radius:4px;cursor:pointer}',
    '@media(max-width:900px){.gl-toast{left:12px;right:12px;bottom:60px;max-width:none}}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('ironstack-gl-style')) return;
    var s = document.createElement('style');
    s.id = 'ironstack-gl-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function copyText(text, done) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        done(!!ok);
      } catch (_) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }

  /* cfg: {host, room, checklistHref, checklistLabel, report, error} */
  function unavailable(cfg) {
    ensureStyle();
    document.body.classList.add('gl-dead');
    var report = cfg.report || (cfg.error && cfg.error.report) || null;
    var off = classify(report) === 'off';
    var text = diagnostics(report, cfg.error);
    var headline = off ? '3D is turned off in this browser' : 'This browser could not start 3D';
    var lead = off
      ? 'Your browser or your company’s settings have turned off graphics acceleration, which lets the browser use your computer’s graphics chip to draw 3D.'
      : 'The browser could not start the graphics feature that draws 3D, so the model cannot be shown.';
    var touch = false;
    try { touch = matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (_) { /* assume a computer */ }
    var steps = touch
      ? '<li>Close the browser completely, then open it again.</li>' +
        '<li>Update the browser from your app store, or try another browser (Chrome or Safari).</li>' +
        '<li>Restart the phone or tablet.</li>' +
        '<li>Still stuck? Use the checklist button below, and let your office contact know.</li>'
      : '<li>Open Settings, then System (in Edge it is called System and performance). Make sure <b>Use graphics acceleration when available</b> is on, then click Relaunch (Chrome) or Restart (Edge). Tip: paste chrome://settings/system or edge://settings/system into the address bar.</li>' +
        '<li>If the switch is gray, or says your organization manages it, ask your IT contact to allow graphics acceleration in the browser. If it was already on, update the browser: open the menu, then Help, then About Google Chrome (in Edge: Help and feedback, then About Microsoft Edge). Then relaunch.</li>' +
        '<li>Still stuck? Try the other browser, Chrome or Edge. If that fails too, restart the computer (save your other work first).</li>' +
        '<li>Last resort: ask your IT contact to update the graphics driver (through Windows Update or the PC maker\u2019s support page, not a driver-updater site).</li>';
    var card = document.createElement('div');
    card.className = 'gl-card';
    card.innerHTML = '<div role="region" aria-labelledby="gl-h">' +
      '<div role="alert"><h2 id="gl-h">' + esc(headline) + '</h2>' +
      '<p>' + lead + ' Nothing is wrong with the project data or the checklists.</p></div>' +
      '<ol>' + steps + '</ol>' +
      '<p>After a change, press Retry 3D. If it still fails, press Copy details and send that text to your IT contact or whoever set up this viewer.</p>' +
      '<div class="act"><button type="button" class="primary" data-gl="retry">Retry 3D</button>' +
      (cfg.checklistHref ? '<a class="b" target="_top" href="' + esc(cfg.checklistHref) + '">' + esc(cfg.checklistLabel || 'Open checklist') + '</a>' : '') +
      '<button type="button" data-gl="copy">Copy details</button></div>' +
      '<details><summary>Technical details</summary><pre tabindex="0">' + esc(text) + '</pre></details></div>';
    (cfg.host || document.body).appendChild(card);
    card.querySelector('[data-gl="retry"]').addEventListener('click', function () { location.reload(); });
    var copyBtn = card.querySelector('[data-gl="copy"]');
    copyBtn.addEventListener('click', function () {
      copyText(text, function (ok) {
        copyBtn.textContent = ok ? 'Copied' : 'Open Technical details to copy';
        if (!ok) card.querySelector('details').open = true;
        setTimeout(function () { copyBtn.textContent = 'Copy details'; }, 2500);
      });
    });
    tellHost({ type: 'ironstack:webgl-unavailable', room: cfg.room || '', message: cfg.error && cfg.error.message || '' });
    return card;
  }

  function softwareNotice(report) {
    if (!report || !report.software) return null;
    ensureStyle();
    var t = document.createElement('div');
    t.className = 'gl-toast';
    t.setAttribute('role', 'status');
    t.innerHTML = '<span><b>Simplified 3D view.</b> This browser is not using your computer’s graphics chip, so shadows are off and it may feel slow. To fix it: Settings, System, turn on Use graphics acceleration when available.</span><button type="button">Got it</button>';
    function remove() {
      if (t.parentNode) t.parentNode.removeChild(t);
      document.removeEventListener('pointerdown', onUse, true);
      document.removeEventListener('keydown', onUse, true);
    }
    /* Read once, then out of the way: the first click, tap or key press
       anywhere else (selecting an item, starting the walkthrough) dismisses it. */
    function onUse(ev) { if (!t.contains(ev.target)) remove(); }
    t.querySelector('button').addEventListener('click', remove);
    document.addEventListener('pointerdown', onUse, true);
    document.addEventListener('keydown', onUse, true);
    document.body.appendChild(t);
    /* The page spends seconds building the scene before the first frame, so the
       clock starts when loading has finished, not when the notice is created. */
    function arm() { setTimeout(remove, 45000); }
    if (document.readyState === 'complete') arm(); else window.addEventListener('load', arm);
    return t;
  }

  root.IronstackGL = { create: create, unavailable: unavailable, softwareNotice: softwareNotice, diagnostics: diagnostics };
})(window);
