/* Local review material adapter. Procedural generators adapted from the existing
 * platform/king-studio.html study, then adjusted against the supplied Room 110 photos.
 * Appearance approximation only; not an exact manufacturer texture or design approval.
 * No geometry, registry, camera, tag, quantity, or project-data changes.
 */
(function (global) {
'use strict';
var T = global.THREE;
function rng(seed) {                       // mulberry32, so every build is identical
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cv(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  /* flatten() reads pixels back repeatedly; say so up front (silences the
     per-load console warning and lets the browser keep the bitmap on CPU). */
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function flatten(g, w, h, lum, chr) {
  var d = g.getImageData(0, 0, w, h), a = d.data, n = w * h;
  var mr = 0, mg = 0, mb = 0, i;
  for (i = 0; i < n; i++) { mr += a[i * 4]; mg += a[i * 4 + 1]; mb += a[i * 4 + 2]; }
  mr /= n; mg /= n; mb /= n;
  var mm = (mr + mg + mb) / 3;
  for (i = 0; i < n; i++) {
    var r = a[i * 4], gg = a[i * 4 + 1], b = a[i * 4 + 2];
    var l = (r + gg + b) / 3, l2 = mm + (l - mm) * lum;
    a[i * 4]     = Math.max(0, Math.min(255, l2 + (r  - l) * chr + (mr - mm) * (1 - chr)));
    a[i * 4 + 1] = Math.max(0, Math.min(255, l2 + (gg - l) * chr + (mg - mm) * (1 - chr)));
    a[i * 4 + 2] = Math.max(0, Math.min(255, l2 + (b  - l) * chr + (mb - mm) * (1 - chr)));
  }
  g.putImageData(d, 0, 0);
}

function noiseOver(g, w, h, amt, seed) {    // fine film grain / fibre
  var r = rng(seed), img = g.getImageData(0, 0, w, h), d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function carpetCanvas() {
  // Redrawn against photo-01 and photo-05 rather than the written record: the
  // field is a mid teal-grey, not charcoal, the motifs are LARGE (arrowheads
  // and hatch blocks around 12-18"), and the mustard is a scattered accent in
  // groups of hatch lines, not a block colour.
  var N = 512, cell = N / 4, o = cv(N, N), c = o[0], g = o[1];
  var base = '#555e5d';
  var greys = ['#606a68', '#6c7674', '#7a8482', '#4d5655', '#5b6564'];
  var mustard = ['#98803f', '#8a7338'];
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  var r = rng(7331);

  function hatch(x, y, w, h, col, gap, ang) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = col; g.lineWidth = 2.4; g.globalAlpha = 0.85;
    for (var t = -h; t < w + h; t += gap) {
      g.beginPath();
      if (ang > 0) { g.moveTo(x + t, y + h); g.lineTo(x + t + h, y); }
      else { g.moveTo(x + t, y); g.lineTo(x + t + h, y + h); }
      g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }
  function arrow(cx, cy, sz, col, rot) {
    g.save(); g.translate(cx, cy); g.rotate(rot);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -sz * 0.55); g.lineTo(sz * 0.62, sz * 0.45);
    g.lineTo(0, sz * 0.12); g.lineTo(-sz * 0.62, sz * 0.45);
    g.closePath(); g.fill();
    g.restore();
  }

  for (var iy = 0; iy < 4; iy++) for (var ix = 0; ix < 4; ix++) {
    var x = ix * cell, y = iy * cell, k = (ix * 5 + iy * 3) % 8;
    g.save(); g.beginPath(); g.rect(x, y, cell, cell); g.clip();
    g.globalAlpha = 0.55 + r() * 0.3;
    g.fillStyle = greys[(ix + iy * 2) % greys.length];
    g.fillRect(x, y, cell, cell);
    g.globalAlpha = 1;
    if (k === 0 || k === 5) {
      arrow(x + cell * 0.5, y + cell * 0.5, cell * 0.86, greys[(ix + 3) % greys.length], (k === 0 ? 0 : Math.PI));
      hatch(x + cell * 0.08, y + cell * 0.60, cell * 0.84, cell * 0.30, greys[(iy + 1) % greys.length], 9, 1);
    } else if (k === 1 || k === 6) {
      hatch(x + cell * 0.06, y + cell * 0.10, cell * 0.88, cell * 0.34, mustard[iy % 2], 8, 1);
      hatch(x + cell * 0.06, y + cell * 0.55, cell * 0.55, cell * 0.35, greys[(ix + 2) % greys.length], 8, -1);
    } else if (k === 2 || k === 7) {
      arrow(x + cell * 0.35, y + cell * 0.42, cell * 0.62, greys[(ix + iy) % greys.length], Math.PI / 2);
      arrow(x + cell * 0.72, y + cell * 0.74, cell * 0.5, greys[(ix + 4) % greys.length], -Math.PI / 2);
    } else if (k === 3) {
      hatch(x, y, cell, cell, greys[(ix * 3 + iy) % greys.length], 11, -1);
    } else {
      g.fillStyle = greys[(ix + iy * 3) % greys.length];
      g.globalAlpha = 0.6;
      g.fillRect(x + cell * 0.10, y + cell * 0.16, cell * 0.5, cell * 0.62);
      g.globalAlpha = 1;
      hatch(x + cell * 0.62, y + cell * 0.20, cell * 0.30, cell * 0.62, mustard[ix % 2], 9, 1);
    }
    g.restore();
  }
  // low-frequency drift so the 4x4 build grid does not read as a chequerboard
  g.globalAlpha = 0.13;
  for (var d = 0; d < 34; d++) {
    var dx = r() * N, dy = r() * N, dr = 60 + r() * 180;
    var rg2 = g.createRadialGradient(dx, dy, 0, dx, dy, dr);
    rg2.addColorStop(0, r() < 0.5 ? '#000000' : '#9aa3a1');
    rg2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg2; g.beginPath(); g.arc(dx, dy, dr, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1;
  noiseOver(g, N, N, 22, 4242);
  // 0.56 luminance / 0.55 chroma takes the measured 0.0837 mid-band sigma to
  // about 0.047 and the 0.0180 chroma-noise sigma to about 0.010, against
  // photo-02's 0.0473 and 0.0030.
  flatten(g, N, N, 0.56, 0.55);
  return c;
}

function carpetBumpCanvas() {
  var N = 256, o = cv(N, N), c = o[0], g = o[1], r = rng(99);
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  for (var i = 0; i < 9000; i++) {
    var v = 100 + Math.floor(r() * 110);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 3);
  }
  return c;
}

function herringboneCanvas() {
  var N = 512, o = cv(N, N), c = o[0], g = o[1];
  g.fillStyle = '#ece7dd'; g.fillRect(0, 0, N, N);
  var step = N / 8, len = step * 1.35;
  g.lineCap = 'butt';
  for (var iy = 0; iy < 9; iy++) for (var ix = 0; ix < 9; ix++) {
    var x = ix * step, y = iy * step;
    var up = ((ix + iy) % 2) === 0;
    g.strokeStyle = up ? '#e6e0d5' : '#f1ede4';
    g.lineWidth = step * 0.42;
    g.beginPath();
    if (up) { g.moveTo(x, y + step); g.lineTo(x + len, y - step * 0.35); }
    else { g.moveTo(x, y - step * 0.35); g.lineTo(x + len, y + step); }
    g.stroke();
  }
  noiseOver(g, N, N, 12, 555);
  flatten(g, N, N, 0.62, 0.30);   // 0.0611 mid-band -> ~0.038 against photo-02's 0.0299
  return c;
}

function shadeCanvas() {
  // Against photo-01 and photo-09: cream ground, BURGUNDY / RUST-TERRACOTTA /
  // CHARCOAL / warm grey.  Big arch and half-round motifs with dot and dash
  // fills.  (The written record called this "red, gold, navy, grey"; the
  // photograph has no navy and no gold in it at all.)
  var N = 576, o = cv(N, N), c = o[0], g = o[1];
  var cream = '#efe7d8';
  var pal = ['#8e2f38', '#b3652c', '#31323a', '#9a938a', '#7d2b33', '#c08243'];
  g.fillStyle = cream; g.fillRect(0, 0, N, N);
  var q = N / 3, r = rng(20260812);

  function dots(x, y, w, h, col) {
    g.fillStyle = col;
    for (var dy = y + 5; dy < y + h; dy += 9)
      for (var dx = x + 5; dx < x + w; dx += 9) g.fillRect(dx, dy, 4, 4);
  }
  function dashes(x, y, w, h, col) {
    g.fillStyle = col;
    for (var dy = y + 4; dy < y + h; dy += 8) g.fillRect(x + 3, dy, w - 6, 2.6);
  }

  for (var iy = 0; iy < 3; iy++) for (var ix = 0; ix < 3; ix++) {
    var x = ix * q, y = iy * q, k = (ix * 4 + iy * 5) % 6, col = pal[k];
    g.save(); g.beginPath(); g.rect(x, y, q, q); g.clip();
    var mode = (ix + iy * 2) % 5;
    if (mode === 0) {                          // solid arch on a plinth
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x + q * 0.20, y + q * 0.86);
      g.lineTo(x + q * 0.20, y + q * 0.44);
      g.arc(x + q * 0.50, y + q * 0.44, q * 0.30, Math.PI, 0);
      g.lineTo(x + q * 0.80, y + q * 0.86);
      g.closePath(); g.fill();
      dots(x + q * 0.26, y + q * 0.50, q * 0.48, q * 0.30, cream);
    } else if (mode === 1) {                   // outlined arch, hatched inside
      g.strokeStyle = col; g.lineWidth = q * 0.075;
      g.beginPath();
      g.moveTo(x + q * 0.18, y + q * 0.88);
      g.lineTo(x + q * 0.18, y + q * 0.46);
      g.arc(x + q * 0.50, y + q * 0.46, q * 0.32, Math.PI, 0);
      g.lineTo(x + q * 0.82, y + q * 0.88);
      g.stroke();
      dashes(x + q * 0.28, y + q * 0.42, q * 0.44, q * 0.42, pal[(k + 2) % 6]);
    } else if (mode === 2) {                   // stacked blocks
      g.fillStyle = col;
      g.fillRect(x + q * 0.14, y + q * 0.12, q * 0.72, q * 0.26);
      dots(x + q * 0.18, y + q * 0.16, q * 0.64, q * 0.18, cream);
      g.fillStyle = pal[(k + 3) % 6];
      g.fillRect(x + q * 0.14, y + q * 0.48, q * 0.40, q * 0.36);
      g.fillStyle = pal[(k + 1) % 6];
      g.fillRect(x + q * 0.60, y + q * 0.52, q * 0.26, q * 0.32);
    } else if (mode === 3) {                   // half round + dash field
      g.fillStyle = col;
      g.beginPath(); g.arc(x + q * 0.50, y + q * 0.66, q * 0.34, Math.PI, 0); g.fill();
      dashes(x + q * 0.14, y + q * 0.10, q * 0.72, q * 0.36, pal[(k + 4) % 6]);
    } else {                                   // quarter arcs
      g.strokeStyle = col; g.lineWidth = q * 0.10;
      for (var i = 1; i <= 3; i++) {
        g.beginPath(); g.arc(x + q * 0.10, y + q * 0.90, q * 0.24 * i, -Math.PI / 2, 0); g.stroke();
      }
      g.fillStyle = pal[(k + 2) % 6];
      g.fillRect(x + q * 0.66, y + q * 0.10, q * 0.22, q * 0.44);
    }
    g.restore();
  }
  noiseOver(g, N, N, 9, 77);
  return c;
}

function tileCanvas(base, grout, shade, tw, th) {
  var N = 512, o = cv(N, N), c = o[0], g = o[1], r = rng(1234);
  g.fillStyle = grout; g.fillRect(0, 0, N, N);
  var rows = N / th;
  for (var ry = 0; ry < rows; ry++) {
    var off = (ry % 2) ? tw / 2 : 0;
    for (var x = -tw; x < N + tw; x += tw) {
      var px = x + off, py = ry * th;
      var v = 1 + (r() - 0.5) * shade;
      g.fillStyle = tint(base, v);
      g.fillRect(px + 1.5, py + 1.5, tw - 3, th - 3);
      // faint mottling inside each tile
      g.globalAlpha = 0.10;
      for (var m = 0; m < 12; m++) {
        g.fillStyle = tint(base, 1 + (r() - 0.5) * 0.35);
        g.beginPath(); g.ellipse(px + r() * tw, py + r() * th, 6 + r() * 26, 4 + r() * 14, r() * 3, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  noiseOver(g, N, N, 8, 31);
  return c;
}

function tint(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var R = Math.min(255, ((n >> 16) & 255) * f) | 0;
  var G = Math.min(255, ((n >> 8) & 255) * f) | 0;
  var B = Math.min(255, (n & 255) * f) | 0;
  return 'rgb(' + R + ',' + G + ',' + B + ')';
}

function tileBumpCanvas(tw, th) {
  var N = 512, o = cv(N, N), c = o[0], g = o[1];
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  var rows = N / th;
  for (var ry = 0; ry < rows; ry++) {
    var off = (ry % 2) ? tw / 2 : 0;
    for (var x = -tw; x < N + tw; x += tw) {
      g.fillStyle = '#c8c8c8';
      g.fillRect(x + off + 2, ry * th + 2, tw - 4, th - 4);
    }
  }
  return c;
}

function woodCanvas(base, dark, light, seed) {
  var N = 512, o = cv(N, N), c = o[0], g = o[1], r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  // broad colour drift
  for (var b = 0; b < 26; b++) {
    g.globalAlpha = 0.11;
    g.fillStyle = r() < 0.5 ? dark : light;
    g.fillRect(0, r() * N, N, 10 + r() * 52);
  }
  g.globalAlpha = 1;
  // grain lines running along canvas X
  for (var i = 0; i < 260; i++) {
    var y0 = r() * N;
    g.strokeStyle = r() < 0.55 ? dark : light;
    g.globalAlpha = 0.035 + r() * 0.11;
    g.lineWidth = 0.5 + r() * 3.4;
    g.beginPath();
    var y = y0; g.moveTo(0, y);
    for (var x = 0; x <= N; x += 12) { y += (r() - 0.5) * 2.4; g.lineTo(x, y); }
    g.stroke();
  }
  // a couple of cathedral figures
  for (var f = 0; f < 4; f++) {
    var cx = r() * N, cy = r() * N;
    g.globalAlpha = 0.10;
    g.strokeStyle = dark;
    for (var k = 1; k < 9; k++) {
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(cx, cy, k * 7, k * 30, 0, 0, 6.283);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  noiseOver(g, N, N, 14, seed + 1);
  return c;
}

function tweedCanvas(base, fleckA, fleckB) {
  var N = 256, o = cv(N, N), c = o[0], g = o[1], r = rng(881);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (var i = 0; i < 14000; i++) {
    g.fillStyle = r() < 0.5 ? fleckA : fleckB;
    g.globalAlpha = 0.10 + r() * 0.35;
    g.fillRect(r() * N, r() * N, 1 + r() * 2, 1);
  }
  g.globalAlpha = 1;
  noiseOver(g, N, N, 16, 2);
  return c;
}

function curtainWeaveCanvas(base) {   // coarse weave divider  [PHOTO]
  var N = 256, o = cv(N, N), c = o[0], g = o[1], r = rng(404);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (var y = 0; y < N; y += 4) {
    g.globalAlpha = 0.07 + r() * 0.05;
    g.fillStyle = '#ffffff'; g.fillRect(0, y, N, 1.6);
    g.globalAlpha = 0.05 + r() * 0.05;
    g.fillStyle = '#000000'; g.fillRect(0, y + 2, N, 1.2);
  }
  for (var x = 0; x < N; x += 5) {
    g.globalAlpha = 0.045 + r() * 0.045;
    g.fillStyle = '#000000'; g.fillRect(x, 0, 1.6, N);
  }
  g.globalAlpha = 1;
  noiseOver(g, N, N, 18, 5);
  return c;
}

function quiltCanvas() {
  // photo-09: a diamond quilt, each cell puffed between the stitch lines, with
  // the buttons pulling craters on top of it (those are geometry, not texture).
  var N = 512, o = cv(N, N), c = o[0], g = o[1];
  g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, N, N);
  var q = N / 4;
  function puff(cx, cy, r) {
    g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
    var rg2 = g.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
    rg2.addColorStop(0, 'rgba(255,255,255,0.62)');
    rg2.addColorStop(0.62, 'rgba(255,255,255,0.14)');
    rg2.addColorStop(1, 'rgba(146,138,120,0.22)');
    g.fillStyle = rg2;
    g.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
    g.restore();
  }
  for (var iy = -1; iy < 6; iy++) for (var ix = -1; ix < 6; ix++) {
    puff(ix * q + (iy % 2 ? q / 2 : 0), iy * q * 0.5, q * 0.52);
  }
  // stitch seams on the diamond lattice
  g.strokeStyle = 'rgba(150,141,122,0.6)'; g.lineWidth = 1.5;
  g.setLineDash([6, 5]);
  for (var k = -8; k < 16; k++) {
    g.beginPath(); g.moveTo(k * q * 0.5, 0); g.lineTo(k * q * 0.5 + N, N); g.stroke();
    g.beginPath(); g.moveTo(k * q * 0.5, N); g.lineTo(k * q * 0.5 + N, 0); g.stroke();
  }
  g.setLineDash([]);
  noiseOver(g, N, N, 11, 8);
  return c;
}

function quartzCanvas(base) {
  var N = 512, o = cv(N, N), c = o[0], g = o[1], r = rng(616);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (var i = 0; i < 5200; i++) {
    var v = r();
    g.fillStyle = v < 0.5 ? 'rgba(180,180,182,0.5)' : (v < 0.85 ? 'rgba(255,255,255,0.7)' : 'rgba(120,120,124,0.45)');
    g.beginPath(); g.arc(r() * N, r() * N, 0.5 + r() * 2.2, 0, 6.283); g.fill();
  }
  return c;
}

function paintCanvas() {
  var N = 512, o = cv(N, N), c = o[0], g = o[1], r = rng(4711);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N);
  // broad compound patches
  for (var i = 0; i < 26; i++) {
    var x = r() * N, y = r() * N, rr = 40 + r() * 150;
    var rg2 = g.createRadialGradient(x, y, 0, x, y, rr);
    var v = r() < 0.5 ? '250,249,246' : '255,255,255';
    rg2.addColorStop(0, 'rgba(' + v + ',' + (0.22 + r() * 0.26).toFixed(2) + ')');
    rg2.addColorStop(1, 'rgba(' + v + ',0)');
    g.fillStyle = rg2; g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
  }
  // roller lap: soft vertical bands, the width of a 9" roller
  for (var j = 0; j < 14; j++) {
    g.fillStyle = 'rgba(0,0,0,' + (0.008 + r() * 0.016).toFixed(3) + ')';
    g.fillRect(r() * N, 0, 18 + r() * 40, N);
  }
  noiseOver(g, N, N, 5, 1234);
  return c;
}

function paintBumpCanvas() {
  var N = 256, o = cv(N, N), c = o[0], g = o[1], r = rng(12);
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  for (var i = 0; i < 2600; i++) {
    var v = 118 + Math.floor(r() * 22);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.beginPath(); g.arc(r() * N, r() * N, 1 + r() * 3.5, 0, 6.283); g.fill();
  }
  return c;
}

function brushCanvas() {
  var W = 32, H = 512, o = cv(W, H), c = o[0], g = o[1];
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
  var r = rng(313);
  for (var i = 0; i < 900; i++) {
    var y = r() * H, v = 128 + (r() - 0.5) * 150;
    g.fillStyle = 'rgba(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ',0.5)';
    g.fillRect(0, y, W, 0.6 + r() * 1.4);
  }
  return c;
}

function goldLineCanvas() {
  // Against photo-16: big half-round "D" lozenges and rectangles, filled with
  // groups of parallel gold lines, on white.  Large and sparse — the motifs
  // are roughly a foot across on the wall.
  var N = 576, o = cv(N, N), c = o[0], g = o[1];
  g.fillStyle = '#fcfaf6'; g.fillRect(0, 0, N, N);
  var gold = '#d0a24a';
  var q = N / 3;
  function lines(x, y, w, h, n, vertical) {
    g.strokeStyle = gold; g.lineWidth = 2.0;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1 || 1);
      g.beginPath();
      if (vertical) { g.moveTo(x + t * w, y); g.lineTo(x + t * w, y + h); }
      else { g.moveTo(x, y + t * h); g.lineTo(x + w, y + t * h); }
      g.stroke();
    }
  }
  for (var iy = 0; iy < 3; iy++) for (var ix = 0; ix < 3; ix++) {
    var x = ix * q, y = iy * q, mode = (ix * 4 + iy * 5) % 5;
    g.save(); g.beginPath(); g.rect(x, y, q, q); g.clip();
    g.strokeStyle = gold; g.lineWidth = 2.2;
    if (mode === 0) {                          // D lozenge, flat side left
      g.beginPath();
      g.moveTo(x + q * 0.16, y + q * 0.16);
      g.lineTo(x + q * 0.52, y + q * 0.16);
      g.arc(x + q * 0.52, y + q * 0.46, q * 0.30, -Math.PI / 2, Math.PI / 2);
      g.lineTo(x + q * 0.16, y + q * 0.76);
      g.closePath(); g.stroke();
      lines(x + q * 0.22, y + q * 0.24, q * 0.26, q * 0.44, 6, false);
    } else if (mode === 1) {                   // rectangle with vertical rule set
      g.strokeRect(x + q * 0.18, y + q * 0.22, q * 0.62, q * 0.50);
      lines(x + q * 0.26, y + q * 0.30, q * 0.46, q * 0.34, 7, true);
    } else if (mode === 2) {                   // half round on its side + bars
      g.beginPath(); g.arc(x + q * 0.46, y + q * 0.50, q * 0.32, Math.PI / 2, -Math.PI / 2); g.stroke();
      g.beginPath(); g.moveTo(x + q * 0.46, y + q * 0.18); g.lineTo(x + q * 0.46, y + q * 0.82); g.stroke();
      lines(x + q * 0.56, y + q * 0.28, q * 0.28, q * 0.44, 5, false);
    } else if (mode === 3) {                   // stacked line groups
      lines(x + q * 0.14, y + q * 0.14, q * 0.34, q * 0.28, 6, false);
      lines(x + q * 0.56, y + q * 0.34, q * 0.30, q * 0.24, 5, true);
      g.beginPath(); g.arc(x + q * 0.34, y + q * 0.74, q * 0.20, Math.PI, 0); g.stroke();
    } else {                                   // big open lozenge
      g.beginPath();
      g.moveTo(x + q * 0.80, y + q * 0.18);
      g.lineTo(x + q * 0.42, y + q * 0.18);
      g.arc(x + q * 0.42, y + q * 0.50, q * 0.32, -Math.PI / 2, Math.PI / 2, true);
      g.lineTo(x + q * 0.80, y + q * 0.82);
      g.closePath(); g.stroke();
      lines(x + q * 0.50, y + q * 0.28, q * 0.26, q * 0.44, 6, false);
    }
    g.restore();
  }
  return c;
}

/* Material-only adapter. The shader derives UVs in feet from each object's existing
 * transform, so a chair and a room floor do not receive equally stretched images.
 * Shared maps keep this small; no geometry buffers or scene transforms are edited. */
global.Home2PhotoFinishes = {
  install: function (o) {
    var textures = {}, swaps = [], materialCache = {}, originalPartMats = {}, emissions = {};
    function rememberEmission(m) {
      if (m.emissive && !emissions[m.uuid]) emissions[m.uuid] = {material:m, color:m.emissive.clone(), intensity:m.emissiveIntensity};
    }
    function tex(name, canvas, bump) {
      var t = new T.CanvasTexture(canvas);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.encoding = bump ? T.LinearEncoding : T.sRGBEncoding;
      t.anisotropy = Math.min(8, o.renderer.capabilities.getMaxAnisotropy());
      textures[name] = t;
      return t;
    }
    tex('carpet', carpetCanvas()); tex('carpetBump', carpetBumpCanvas(), true);
    tex('wood', woodCanvas('#b9ab95', '#8b7c68', '#d0c3ae', 36));
    tex('darkWood', woodCanvas('#776554', '#564637', '#92806b', 38));
    tex('herringbone', herringboneCanvas());
    tex('tile', tileCanvas('#a9abad', '#858889', 0.12, 256, 128));
    tex('tileBump', tileBumpCanvas(256, 128), true);
    tex('whiteTile', tileCanvas('#edece7', '#b9b8b3', 0.035, 256, 128));
    tex('plum', tweedCanvas('#51424a', '#79676d', '#362e34'));
    tex('seat', tweedCanvas('#706b6b', '#97918c', '#4f4c4b'));
    tex('curtain', curtainWeaveCanvas('#8a8784'));
    tex('quilt', quiltCanvas()); tex('shade', shadeCanvas());
    tex('counter', quartzCanvas('#e7e6df'));
    var profiles = {
      floor: {map:'carpet', bump:'carpetBump', period:4, color:0x696762, roughness:0.98, bumpScale:0.018},
      bathfl:{map:'tile', bump:'tileBump', period:4, roughness:0.72, bumpScale:0.012},
      tile:{map:'whiteTile', bump:'tileBump', period:4, roughness:0.43, bumpScale:0.008},
      wood:{map:'wood', period:4, color:0xb7a992, roughness:0.55},
      woodDk:{map:'darkWood', period:4, roughness:0.62},
      panel:{map:'wood', period:4, color:0xb7a992, roughness:0.7},
      doorNeu:{map:'wood', period:4, color:0xb7a992, roughness:0.64},
      linen:{map:'quilt', period:2.5, roughness:0.94},
      wrap:{map:'seat', period:1, color:0xb6b1a8, roughness:0.95},
      head:{map:'plum', period:1, color:0x857781, roughness:0.93},
      uphol:{map:'seat', period:1.25, roughness:0.95},
      seatDk:{map:'plum', period:1.25, roughness:0.96},
      drape:{map:'curtain', period:1.5, color:0xc8c6c3, roughness:0.99},
      drape2:{map:'curtain', period:1.5, color:0xb7b5b3, roughness:0.99},
      shade:{map:'shade', period:4, roughness:0.96},
      counter:{map:'counter', period:3, roughness:0.32},
      wall:{color:0xf1eee5, roughness:0.94},
      base:{color:0x74777a, roughness:0.66},
      plinth:{color:0x454448, roughness:0.86},
      chrome:{color:0xc9ced0, roughness:0.22, metalness:0.88},
      metal:{color:0x8b9093, roughness:0.4, metalness:0.72},
      porc:{color:0xf3f1e9, roughness:0.25},
      ptac:{color:0xdeddd6, roughness:0.58, metalness:0.08},
      lampsh:{color:0xfff4d8, roughness:0.65, emissive:0xffd294, emissiveIntensity:0.48},
      'king:navy':{color:0x344257, roughness:0.56},
      'king:plum':{map:'plum', period:1, color:0x857781, roughness:0.93},
      'king:goldFr':{color:0xd4a530, roughness:0.5},
      'king:accent':{map:'herringbone', period:4, roughness:0.96},
      'king:matt':{map:'quilt', period:2.5, roughness:0.96}
    };
    function photoMaterial(original) {
      var key = original.userData && original.userData.reviewMaterial;
      var p = profiles[key];
      if (!p) return original;
      if (materialCache[original.uuid]) return materialCache[original.uuid];
      var m = original.clone();
      m.color.setHex(p.color == null ? 0xffffff : p.color);
      m.roughness = p.roughness;
      if (p.metalness != null) m.metalness = p.metalness;
      if (p.map) m.map = textures[p.map];
      if (p.bump) { m.bumpMap = textures[p.bump]; m.bumpScale = p.bumpScale; }
      if (p.emissive != null) {
        m.emissive.setHex(p.emissive); m.emissiveIntensity = p.emissiveIntensity;
        m.userData.reviewWarm = {color:p.emissive, intensity:p.emissiveIntensity};
      }
      if (p.map) {
        var scale = p.period.toFixed(4);
        m.onBeforeCompile = function (shader) {
          shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',
            '#include <uv_vertex>\n' +
            'vec3 reviewScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));\n' +
            'vec3 reviewP = position * reviewScale;\n' +
            'vec3 reviewN = abs(normal);\n' +
            'vUv = (reviewN.y > reviewN.x && reviewN.y > reviewN.z) ? reviewP.xz : (reviewN.x > reviewN.z ? reviewP.zy : reviewP.xy);\n' +
            'vUv /= ' + scale + ';\n');
        };
        m.customProgramCacheKey = function () { return 'home2-photo-feet-' + scale; };
      }
      materialCache[original.uuid] = m;
      rememberEmission(m);
      return m;
    }
    o.scene.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.material) return;
      var original = mesh.material;
      (Array.isArray(original) ? original : [original]).forEach(rememberEmission);
      var photo = Array.isArray(original) ? original.map(photoMaterial) : photoMaterial(original);
      if (photo !== original) swaps.push({mesh:mesh, original:original, photo:photo});
    });
    Object.keys(o.parts).forEach(function (id) { originalPartMats[id] = o.parts[id].mats; });
    var mode = 'original';
    var originalRender = {encoding:o.renderer.outputEncoding, tone:o.renderer.toneMapping, exposure:o.renderer.toneMappingExposure};
    var otherLights = [];
    o.scene.traverse(function (light) {
      if (light.isLight && light !== o.hemi) otherLights.push({light:light, intensity:light.intensity, color:light.color.clone()});
    });
    var originalHemi;
    function captureHemi() {
      originalHemi = {color:o.hemi.color.clone(), ground:o.hemi.groundColor.clone(), intensity:o.hemi.intensity};
    }
    captureHemi();
    function photoLight() {
      o.hemi.color.setHex(0xe9e4d9); o.hemi.groundColor.setHex(0x3b3935); o.hemi.intensity = 0.48;
      // The source's many interior fills were tuned for untextured diagram colors.
      // Reduce their combined energy only in this photographic comparison mode.
      otherLights.forEach(function (item) {
        item.light.intensity = item.intensity * (item.light.isPointLight ? 0.35 : 0.8);
      });
    }
    function restoreWarm(part) {
      part.mats.forEach(function (m) {
        if (m.userData.reviewWarm) {
          m.emissive.setHex(m.userData.reviewWarm.color);
          m.emissiveIntensity = m.userData.reviewWarm.intensity;
        }
      });
    }
    function choose(next) {
      if (next === mode) return;
      mode = next;
      var photo = mode === 'photo';
      swaps.forEach(function (s) { s.mesh.material = photo ? s.photo : s.original; });
      Object.keys(emissions).forEach(function (id) {
        var e = emissions[id]; e.material.emissive.copy(e.color); e.material.emissiveIntensity = e.intensity;
      });
      if (photo) {
        Object.keys(o.parts).forEach(function (id) { o.parts[id].mats = originalPartMats[id].map(photoMaterial); });
        o.renderer.outputEncoding = T.sRGBEncoding;
        o.renderer.toneMapping = T.ACESFilmicToneMapping;
        o.renderer.toneMappingExposure = 0.76;
        photoLight();
      } else {
        Object.keys(o.parts).forEach(function (id) { o.parts[id].mats = originalPartMats[id]; });
        o.renderer.outputEncoding = originalRender.encoding;
        o.renderer.toneMapping = originalRender.tone;
        o.renderer.toneMappingExposure = originalRender.exposure;
        o.hemi.color.copy(originalHemi.color); o.hemi.groundColor.copy(originalHemi.ground); o.hemi.intensity = originalHemi.intensity;
        otherLights.forEach(function (item) { item.light.intensity = item.intensity; item.light.color.copy(item.color); });
      }
      ['original', 'photo'].forEach(function (name) {
        var b = document.getElementById('finish-' + name);
        b.classList.toggle('on', name === mode); b.setAttribute('aria-pressed', String(name === mode));
      });
      document.getElementById('photo-finish-note').hidden = !photo;
      o.refreshSelection(); o.render();
    }
    document.getElementById('finish-original').addEventListener('click', function () { choose('original'); });
    document.getElementById('finish-photo').addEventListener('click', function () { choose('photo'); });
    var api = {
      choose:choose, restoreWarm:restoreWarm,
      syncTheme:function () { captureHemi(); if (mode === 'photo') photoLight(); },
      mode:function () { return mode; },
      materialCount:swaps.length
    };
    choose('photo');
    return api;
  }
};
})(window);
