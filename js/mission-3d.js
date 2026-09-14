/* ============================================================
   Kenwer — mission scene renderer
   ------------------------------------------------------------
   A small shaded 3D renderer on a 2D canvas. No WebGL, no
   Three.js, no build step: the site ships vanilla and this keeps
   it that way.

   What it does that the previous SVG projector could not: real
   per-face lighting, depth fog, glow, a solid drone model with
   spinning rotors, a ground plane, and a camera that moves
   between shots instead of sitting still.

   Public API (window.KenwerScene):
     mount(canvas)          attach and start the render loop
     load(key)              build a scenario's geometry
     flags(obj)             set scene state (thermal, dock, ...)
     target(t)              where along the route the drone flies
     shot(i)                cut to a step's camera
     anomalyBox()           screen rect of the defect, in CSS px
     droneAt()              screen point of the aircraft
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------
     Vector helpers
     --------------------------------------------------------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  /* ---------------------------------------------------------
     Palette, tied to the site's brand tokens
     --------------------------------------------------------- */
  var SKY_TOP = [9, 9, 8];
  var SKY_LOW = [20, 20, 18];
  var FOG = [10, 10, 9];
  var BEIGE = [237, 235, 228];
  var ALERT = [226, 85, 63];
  var COG = [176, 139, 232];

  var SUN = norm([-0.45, 0.82, 0.36]);

  function rgb(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // Radiometric ramp, kept inside the brand palette so only a real defect
  // carries hue.
  var RAMP = [
    [0.00, [26, 26, 24]], [0.40, [70, 68, 62]], [0.70, [143, 141, 133]],
    [0.88, [222, 220, 212]], [1.00, ALERT]
  ];
  function thermal(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (var i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        var a = RAMP[i - 1], b = RAMP[i];
        return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return ALERT;
  }

  function noise(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  var S = {
    canvas: null, ctx: null, dpr: 1, w: 0, h: 0, orbit: null,
    faces: [], lines: [], route: [], routeLen: 0,
    dock: [0, 0, 0], anomaly: null, ghost: null, hold: 0.5,
    t: 0, targetT: 0, doorT: 0, trayT: 0, doorHold: 0,
    flags: {},
    cam: null, camFrom: null, camTo: null, camMix: 1,
    shots: [], raf: 0, last: 0, running: false, visible: true,
    projCache: null
  };

  /* ---------------------------------------------------------
     Camera
     --------------------------------------------------------- */
  function makeCam(pos, target, fov) { return { pos: pos, target: target, fov: fov || 1.0 }; }

  /* ---------------------------------------------------------
     Orbit controls. The camera never moves on its own, but the
     reader can. Drag to swing around the site, wheel or pinch to
     zoom, shift-drag (or two fingers) to slide the view.
     --------------------------------------------------------- */
  function camToOrbit(cam) {
    var d = sub(cam.pos, cam.target);
    var dist = Math.hypot(d[0], d[1], d[2]) || 1;
    return {
      target: cam.target.slice(), dist: dist, fov: cam.fov,
      pitch: Math.asin(Math.max(-1, Math.min(1, d[1] / dist))),
      yaw: Math.atan2(d[0], d[2]),
      home: null
    };
  }

  function orbitToCam() {
    var o = S.orbit;
    if (!o) return;
    var cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    S.cam = {
      pos: [o.target[0] + o.dist * cp * Math.sin(o.yaw),
            o.target[1] + o.dist * sp,
            o.target[2] + o.dist * cp * Math.cos(o.yaw)],
      target: o.target, fov: o.fov
    };
  }

  function clampPitch(p) { return Math.max(0.06, Math.min(1.45, p)); }

  function bindControls(canvas) {
    var pointers = {}, lastPinch = 0, mode = null, last = null;

    function pts() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }

    canvas.addEventListener('wheel', function (e) {
      if (!S.orbit) return;
      e.preventDefault();
      var f = Math.exp((e.deltaY > 0 ? 1 : -1) * 0.12);
      S.orbit.dist = Math.max(S.orbit.min, Math.min(S.orbit.max, S.orbit.dist * f));
      orbitToCam();
    }, { passive: false });

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };
      mode = (e.shiftKey || e.button === 1 || e.button === 2) ? 'pan' : 'orbit';
      canvas.classList.add('dragging');
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId] || !S.orbit) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var all = pts();

      if (all.length >= 2) {
        // pinch: distance between the two touches drives the zoom
        var gap = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
        if (lastPinch) {
          var f = lastPinch / gap;
          S.orbit.dist = Math.max(S.orbit.min, Math.min(S.orbit.max, S.orbit.dist * f));
          orbitToCam();
        }
        lastPinch = gap;
        return;
      }

      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };

      if (mode === 'pan') {
        var b = camBasis(S.cam);
        var scale = S.orbit.dist / Math.max(1, S.h) * 1.15;
        for (var i = 0; i < 3; i++) {
          S.orbit.target[i] += (-b.right[i] * dx + b.up[i] * dy) * scale;
        }
      } else {
        S.orbit.yaw -= dx * 0.005;
        S.orbit.pitch = clampPitch(S.orbit.pitch + dy * 0.004);
      }
      orbitToCam();
    });

    function end(e) {
      delete pointers[e.pointerId];
      if (!pts().length) { mode = null; lastPinch = 0; canvas.classList.remove('dragging'); }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function camBasis(cam) {
    var fwd = norm(sub(cam.target, cam.pos));
    var right = norm(cross(fwd, [0, 1, 0]));
    var up = cross(right, fwd);
    return { fwd: fwd, right: right, up: up };
  }

  // World point to screen. Returns null behind the camera.
  function project(p) {
    var c = S.projCache;
    var d = sub(p, c.pos);
    var z = dot(d, c.b.fwd);
    if (z < 12) return null;
    var x = dot(d, c.b.right), y = dot(d, c.b.up);
    var k = c.f / z;
    return { x: c.cx + x * k, y: c.cy - y * k, z: z, k: k };
  }

  function refreshProj() {
    var cam = S.cam;
    S.projCache = {
      pos: cam.pos, b: camBasis(cam),
      f: (S.h * 0.5) / Math.tan(cam.fov * 0.5),
      cx: S.w * 0.5, cy: S.h * 0.5
    };
  }

  /* ---------------------------------------------------------
     Geometry helpers
     --------------------------------------------------------- */
  function faceNormal(pts) {
    return norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  }
  function centroid(pts) {
    var x = 0, y = 0, z = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; z += pts[i][2]; }
    return [x / pts.length, y / pts.length, z / pts.length];
  }

  // kind: 'panel' (thermal-aware, glossy), 'metal', 'dark'
  function face(pts, kind, opts) {
    opts = opts || {};
    S.faces.push({
      pts: pts, n: faceNormal(pts), c: centroid(pts), kind: kind,
      base: opts.base || [40, 40, 37], temp: opts.temp === undefined ? 0.3 : opts.temp,
      gloss: opts.gloss || 0, hot: !!opts.hot, tag: opts.tag
    });
  }
  function edge(a, b, opts) {
    opts = opts || {};
    S.lines.push({ a: a, b: b, c: centroid([a, b]), col: opts.col || BEIGE, w: opts.w || 1, alpha: opts.alpha === undefined ? 0.22 : opts.alpha, dash: opts.dash, layer: opts.layer || 'geo' });
  }

  /* ---------------------------------------------------------
     Scenario geometry
     --------------------------------------------------------- */
  // how far along the route counts as still inside the hatch
  var BAY_EXIT = 0.085;

  var SCENES = {};

  SCENES.solar = function () {
    var COLS = 9, ROWS = 4, DX = 300, DZ = 330;
    var PW = 250, PL = 180, TILT = 26 * Math.PI / 180, LEG = 46;
    var sinT = Math.sin(TILT), cosT = Math.cos(TILT), k = 0;

    for (var r = 0; r < ROWS; r++) {
      var oz = (r - (ROWS - 1) / 2) * DZ;
      for (var c = 0; c < COLS; c++, k++) {
        var ox = (c - (COLS - 1) / 2) * DX;
        var hot = (r === 2 && c === 5);
        var quad = [[-PW / 2, -PL / 2], [PW / 2, -PL / 2], [PW / 2, PL / 2], [-PW / 2, PL / 2]]
          .map(function (q) {
            return [ox + q[0], LEG + PL / 2 * sinT - q[1] * sinT, oz + q[1] * cosT];
          });
        face(quad, 'panel', {
          base: [26, 32, 44], gloss: 0.85, hot: hot,
          temp: hot ? 1 : 0.26 + noise(k) * 0.12,
          tag: hot ? 'anomaly' : null
        });
        if (hot) { S.anomaly = quad; S.ghost = quad.map(function (p) { return [p[0] - DX * 3.4, p[1], p[2] - DZ * 1.9]; }); }

        // frame + legs give the array physical presence
        edge([ox - PW / 2, LEG + PL / 2 * sinT + PL / 2 * sinT, oz - PL / 2 * cosT],
             [ox + PW / 2, LEG + PL / 2 * sinT + PL / 2 * sinT, oz - PL / 2 * cosT], { alpha: 0.16 });
        edge([ox, 0, oz], [ox, LEG, oz], { alpha: 0.3, w: 2 });
      }
      edge([-(COLS - 1) / 2 * DX - PW / 2, LEG, oz], [(COLS - 1) / 2 * DX + PW / 2, LEG, oz], { alpha: 0.24, w: 2 });
    }

    // the rest of the farm: the same rows carrying on past the working block,
    // built from the same geometry so they read as one site
    for (var er = 0; er < 5; er++) {
      var ez = -(ROWS - 1) / 2 * DZ - (er + 1) * DZ * 1.08;
      for (var ec = -4; ec < COLS + 4; ec++) {
        var ex = (ec - (COLS - 1) / 2) * DX;
        face([[ex - PW / 2, LEG + PL / 2 * sinT + PL / 2 * sinT, ez - PL / 2 * cosT],
              [ex + PW / 2, LEG + PL / 2 * sinT + PL / 2 * sinT, ez - PL / 2 * cosT],
              [ex + PW / 2, LEG, ez + PL / 2 * cosT],
              [ex - PW / 2, LEG, ez + PL / 2 * cosT]],
             'panel', { base: [26, 32, 44], gloss: 0.6, temp: 0.26 + noise(er * 40 + ec) * 0.1 });
        edge([ex, 0, ez], [ex, LEG, ez], { alpha: 0.16, w: 1.5 });
      }
    }

    S.dock = [-(COLS - 1) / 2 * DX - 520, 0, (ROWS - 1) / 2 * DZ + 300];

    var ALT = 330;
    var route = [[S.dock[0], 30, S.dock[2]], [S.dock[0], ALT, S.dock[2]]];
    for (var rr = 0; rr < ROWS; rr++) {
      var z = (rr - (ROWS - 1) / 2) * DZ;
      var x0 = -(COLS - 1) / 2 * DX - 190, x1 = (COLS - 1) / 2 * DX + 190;
      route.push(rr % 2 === 0 ? [x0, ALT, z] : [x1, ALT, z]);
      route.push(rr % 2 === 0 ? [x1, ALT, z] : [x0, ALT, z]);
    }
    route.push([S.dock[0], ALT, S.dock[2]], [S.dock[0], 30, S.dock[2]]);
    S.route = route;

    return {
      ground: { halfX: 2600, halfZ: 2100, step: 300 },
      site: { halfX: 1500, halfZ: 800 },
      wide: makeCam([-900, 1250, 2500], [-300, 120, 400], 1.05),
      shots: [
        makeCam([-1500, 700, 1750], [-900, 90, 700], 0.95),   // 01 connect, on the pad
        makeCam([-1250, 420, 1400], [-950, 70, 620], 0.85),   // 02 dock
        makeCam([-300, 1500, 2300], [0, 60, 0], 1.02),        // 03 plan, survey the site
        makeCam([1500, 900, 1900], [0, 120, 0], 1.0),         // 04 sortie
        makeCam([820, 430, 760], [300, 130, 165], 0.78),      // 05 detect, close on the string
        makeCam([600, 330, 520], [305, 135, 168], 0.64),      // 06 revise, tighter still
        makeCam([-200, 1100, 2100], [-300, 100, 500], 1.05),  // 07 contingency, pull back
        makeCam([-1350, 520, 1550], [-930, 70, 640], 0.9)     // 08 dispatch, back on the pad
      ]
    };
  };

  // One turbine builder, used for the subject and for every machine on the
  // horizon, so a distant turbine is the same object seen small rather than a
  // different sketch that happens to be far away.
  function turbine(cx, cz, k, opts) {
    opts = opts || {};
    var HUB = [cx, 900 * k, cz], L = 700 * k;
    var TB = 95 * k, TT = 38 * k, NA = 58 * k;
    var anomaly = null;

    // tapered tower, four faces
    [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) {
      face([[cx + q[0] * TB, 0, cz + q[1] * TB], [cx + q[2] * TB, 0, cz + q[3] * TB],
            [cx + q[2] * TT, HUB[1] - 60 * k, cz + q[3] * TT],
            [cx + q[0] * TT, HUB[1] - 60 * k, cz + q[1] * TT]],
           'metal', { base: opts.base || [58, 58, 54] });
    });

    // nacelle
    [-1, 1].forEach(function (sg) {
      face([[cx - 70 * k, HUB[1] - NA, cz + sg * NA], [cx + 78 * k, HUB[1] - NA, cz + sg * NA],
            [cx + 78 * k, HUB[1] + NA, cz + sg * NA], [cx - 70 * k, HUB[1] + NA, cz + sg * NA]],
           'metal', { base: opts.nac || [66, 66, 61] });
    });
    face([[cx - 70 * k, HUB[1] + NA, cz - NA], [cx + 78 * k, HUB[1] + NA, cz - NA],
          [cx + 78 * k, HUB[1] + NA, cz + NA], [cx - 70 * k, HUB[1] + NA, cz + NA]],
         'metal', { base: opts.top || [104, 104, 98] });

    // hub spinner, so the three blades visibly meet at one point
    var HZ = cz - 62 * k, HR = 34 * k, spin = [];
    for (var h = 0; h < 10; h++) {
      var ha = (h / 10) * Math.PI * 2;
      spin.push([cx + Math.cos(ha) * HR, HUB[1] + Math.sin(ha) * HR, HZ - 6 * k]);
    }
    face(spin, 'metal', { base: opts.hub || [120, 120, 112] });

    // three blades, 120 degrees apart, tapered root to tip
    [-118, 2, 122].forEach(function (deg, bi) {
      var rad = deg * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
      var nx = -dy, ny = dx;
      for (var sg = 0; sg < 7; sg++) {
        var t0 = sg / 7, t1 = (sg + 1) / 7;
        var w0 = (46 - t0 * 36) * k, w1 = (46 - t1 * 36) * k;
        var p0 = [HUB[0] + dx * L * t0, HUB[1] + dy * L * t0];
        var p1 = [HUB[0] + dx * L * t1, HUB[1] + dy * L * t1];
        var hot = !!opts.anomaly && bi === 0 && sg === 5;
        var quad = [
          [p0[0] + nx * w0, p0[1] + ny * w0, HZ], [p1[0] + nx * w1, p1[1] + ny * w1, HZ],
          [p1[0] - nx * w1, p1[1] - ny * w1, HZ], [p0[0] - nx * w0, p0[1] - ny * w0, HZ]
        ];
        face(quad, 'panel', {
          base: opts.blade || [86, 86, 81], gloss: 0.35, hot: hot,
          temp: hot ? 1 : 0.24 + noise(bi * 9 + sg) * 0.1
        });
        if (hot) anomaly = quad;
      }
    });
    return anomaly;
  }

  SCENES.wind = function () {
    S.anomaly = turbine(0, 0, 1, { anomaly: true });
    S.ghost = S.anomaly.map(function (p) { return [p[0] - 150, p[1] - 230, p[2]]; });

    // the rest of the farm: the same machine, seen small and hazy
    [[-1900, -2100, 0.62], [1500, -1900, 0.70], [2700, -1150, 0.52],
     [-2700, -1400, 0.46]].forEach(function (t) {
      turbine(t[0], t[1], t[2], {
        base: [40, 44, 44], nac: [44, 48, 48], top: [56, 60, 60],
        hub: [58, 62, 62], blade: [54, 58, 58]
      });
    });

    S.dock = [-1150, 0, 900];
    S.route = [[-1150, 30, 900], [-1150, 340, 900], [-820, 620, 520],
               [-430, 880, 120], [-90, 940, -180], [-258, 470, -180],
               [-330, 330, -180]];

    return {
      ground: { halfX: 2400, halfZ: 2000, step: 300 },
      site: { halfX: 900, halfZ: 700 },
      wide: makeCam([-1300, 1150, 2400], [-500, 500, 300], 1.05),
      shots: []
    };
  };

  // A lattice tower with two cross-arms, reused for the span under inspection
  // and for the circuit marching away over the ridge.
  function pylon(tx, k, opts) {
    opts = opts || {};
    var TOP = 820 * k, bw = 105 * k, tw = 40 * k;
    [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) {
      face([[tx + q[0] * bw, 0, q[1] * bw], [tx + q[2] * bw, 0, q[3] * bw],
            [tx + q[2] * tw, TOP, q[3] * tw], [tx + q[0] * tw, TOP, q[1] * tw]],
           'metal', { base: opts.base || [52, 52, 48] });
    });
    for (var i = 0; i < 7; i++) {
      var y0 = i * TOP / 7, y1 = (i + 1) * TOP / 7;
      var w0 = bw - i * 9.2 * k, w1 = bw - (i + 1) * 9.2 * k;
      edge([tx - w0, y0, -w0], [tx + w1, y1, -w1], { alpha: opts.brace || 0.3 });
      edge([tx + w0, y0, -w0], [tx - w1, y1, -w1], { alpha: opts.brace || 0.3 });
    }
    // cross-arms carrying the three phases
    [TOP - 60 * k, TOP - 190 * k].forEach(function (ay) {
      face([[tx - 230 * k, ay + 9 * k, -9 * k], [tx + 230 * k, ay + 9 * k, -9 * k],
            [tx + 230 * k, ay - 9 * k, 9 * k], [tx - 230 * k, ay - 9 * k, 9 * k]],
           'metal', { base: opts.arm || [62, 62, 58] });
    });
  }

  // A conductor hanging between two towers, drawn as a real catenary.
  function conductor(x0, x1, zOff, yTop, k, alpha) {
    var N = 22, prev = null;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var p = [x0 + (x1 - x0) * t, yTop - Math.sin(t * Math.PI) * 210 * k, zOff];
      if (prev) edge(prev, p, { alpha: alpha === undefined ? 0.5 : alpha, w: 2 });
      prev = p;
    }
  }

  SCENES.powerline = function () {
    var TOWERS = [-950, 950], TOP = 820;
    TOWERS.forEach(function (tx) { pylon(tx, 1); });

    // outer phases across the span under inspection
    conductor(TOWERS[0], TOWERS[1], -230, TOP - 60, 1);
    conductor(TOWERS[0], TOWERS[1], 230, TOP - 60, 1);

    // centre phase, sampled into thermal segments so the splice can run hot
    var pts = [], N = 24;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      pts.push([TOWERS[0] + (TOWERS[1] - TOWERS[0]) * t, TOP - 190 - Math.sin(t * Math.PI) * 210, 0]);
    }
    for (var q = 0; q < N; q++) {
      var a2 = pts[q], b2 = pts[q + 1], hot = (q === 12);
      var quad = [[a2[0], a2[1] + 19, -19], [b2[0], b2[1] + 19, -19],
                  [b2[0], b2[1] - 19, 19], [a2[0], a2[1] - 19, 19]];
      face(quad, 'panel', { base: [62, 62, 58], gloss: 0.3, hot: hot, temp: hot ? 1 : 0.27 + noise(q) * 0.09 });
      if (hot) { S.anomaly = quad; S.ghost = quad.map(function (p) { return [p[0] - 70, p[1] - 300, p[2]]; }); }
    }

    // the circuit continuing over the ridge, still strung together
    var chain = [[950, 1], [1900, 0.74], [2650, 0.55], [3250, 0.42]];
    for (var c = 1; c < chain.length; c++) {
      var kk = chain[c][1], kAvg = (chain[c - 1][1] + kk) / 2;
      pylon(chain[c][0], kk, { base: [38, 36, 33], arm: [44, 42, 39], brace: 0.2 });
      [[-230, 820 * kAvg - 60], [0, 820 * kAvg - 190], [230, 820 * kAvg - 60]].forEach(function (ph) {
        conductor(chain[c - 1][0], chain[c][0], ph[0] * kAvg, ph[1], kAvg, 0.28);
      });
    }

    S.dock = [-1700, 0, 850];
    S.route = [[-1700, 30, 850], [-1700, 330, 850], [-1250, 480, 420],
               [-700, 540, 90], [0, 470, 90], [700, 540, 90], [1300, 500, 400]];

    return {
      ground: { halfX: 3000, halfZ: 2200, step: 320 },
      site: { halfX: 1250, halfZ: 500 },
      wide: makeCam([-1800, 1250, 2700], [-600, 380, 400], 1.05),
      shots: []
    };
  };

  /* ---------------------------------------------------------
     The aircraft: the home page's quadcopter. Crossed arms, four
     rotor discs, a small body. Every part is placed in the
     aircraft's own frame and projected, so the discs foreshorten
     into ellipses and the whole thing banks with the route, but
     it is drawn as clean line work rather than shaded solids.
     Stacking translucent boxes just produced a blob at this size.
     --------------------------------------------------------- */
  var DRONE = { arm: 72, rotor: 30, body: 20 };

  /* ---------------------------------------------------------
     Route sampling
     --------------------------------------------------------- */
  function routePoint(t) {
    var pts = S.route;
    if (!pts || pts.length < 2) return { p: [0, 200, 0], dir: [1, 0, 0] };
    var total = pts.length - 1;
    var f = Math.max(0, Math.min(0.9999, t)) * total;
    var i = Math.floor(f), u = f - i;
    var a = pts[i], b = pts[Math.min(total, i + 1)];
    return { p: lerp3(a, b, u), dir: norm(sub(b, a)) };
  }

  // Where on the route is the aircraft closest to the defect? Full 3D
  // distance, not ground track: on a turbine the climb passes over the blade
  // hundreds of units above it, which a horizontal test would wrongly pick.
  function solveHold() {
    if (!S.anomaly) return 0.5;
    var c = centroid(S.anomaly);
    var best = 0.5, bd = Infinity;
    for (var i = 0; i <= 400; i++) {
      var t = i / 400, p = routePoint(t).p;
      var dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
      var d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /* ---------------------------------------------------------
     Shading
     --------------------------------------------------------- */
  function shadeFace(fc, viewDir) {
    var n = fc.n;
    if (dot(n, viewDir) > 0) n = [-n[0], -n[1], -n[2]];   // two-sided
    var d = Math.max(0, dot(n, SUN));
    var base = fc.base;

    if (fc.kind === 'panel' && S.flags.thermal) {
      base = thermal(fc.temp);
      d = 0.55 + d * 0.35;                                 // IR is emissive, not lit
    } else if (fc.hot && S.flags.anomaly) {
      base = mix(base, ALERT, 0.45);
      d = 0.35 + d * 0.8;
    } else {
      d = 0.22 + d * 0.95;
    }

    var col = [base[0] * d, base[1] * d, base[2] * d];

    // glossy panels pick up a cool sky bounce
    if (fc.gloss && !S.flags.thermal) {
      var spec = Math.pow(Math.max(0, dot(norm([n[0] + SUN[0], n[1] + SUN[1], n[2] + SUN[2]]), [-viewDir[0], -viewDir[1], -viewDir[2]])), 22);
      col = mix(col, [150, 168, 200], fc.gloss * 0.18 + spec * fc.gloss * 0.5);
    }
    return col;
  }

  function fogAmount(z) {
    var near = 900, far = 5200;
    return Math.max(0, Math.min(0.82, (z - near) / (far - near)));
  }

  /* ---------------------------------------------------------
     Render
     --------------------------------------------------------- */
  // Where the ground plane meets infinity, in screen pixels. Everything in
  // the environment is hung off this line, which is what stops the scene
  // being a floating slab under an empty sky.
  function horizonY() {
    var c = S.projCache;
    var fh = norm([c.b.fwd[0], 0, c.b.fwd[2]]);
    var denom = dot(fh, c.b.fwd);
    if (Math.abs(denom) < 1e-4) return S.h * 0.42;
    return c.cy - c.f * dot(fh, c.b.up) / denom;
  }

  // A distant ridge line, deterministic so it never shimmers between frames.
  function ridge(ctx, y0, amp, col, alpha, seed) {
    ctx.beginPath();
    ctx.moveTo(0, S.h);
    ctx.lineTo(0, y0);
    for (var x = 0; x <= S.w; x += 24) {
      var u = x / Math.max(1, S.w);
      var h = Math.sin(u * 7.1 + seed) * 0.5 + Math.sin(u * 17.3 + seed * 2.3) * 0.28
            + Math.sin(u * 31.7 + seed * 4.1) * 0.14;
      ctx.lineTo(x, y0 - h * amp);
    }
    ctx.lineTo(S.w, y0);
    ctx.lineTo(S.w, S.h);
    ctx.closePath();
    ctx.fillStyle = rgb(col, alpha);
    ctx.fill();
  }

  // Each site gets its own landscape: arid flats for the solar farm, a damp
  // coastal upland for the turbine, a dry ridge corridor for the powerline.
  var ENV = {
    solar: {
      sky: ['rgb(7,7,8)', 'rgb(18,17,17)', 'rgb(38,33,29)', 'rgb(72,60,47)'],
      ground: ['rgb(62,54,43)', 'rgb(41,37,31)', 'rgb(26,24,21)', 'rgb(14,14,13)'],
      sunX: 0.24, sun: '231,197,142', sunA: 0.22,
      ridges: [[30, [44, 39, 33], 0.85, 1.7], [15, [31, 28, 25], 0.9, 4.2]],
      clouds: 2, cloudA: 0.045, haze: '150,128,98', hazeA: 0.16
    },
    wind: {
      sky: ['rgb(6,7,9)', 'rgb(15,17,19)', 'rgb(29,33,35)', 'rgb(52,58,60)'],
      ground: ['rgb(44,48,44)', 'rgb(31,34,31)', 'rgb(22,24,22)', 'rgb(13,14,13)'],
      sunX: 0.7, sun: '196,205,214', sunA: 0.16,
      ridges: [[46, [36, 40, 40], 0.85, 2.9], [24, [26, 29, 29], 0.9, 5.6],
               [12, [20, 22, 22], 0.92, 8.1]],
      clouds: 5, cloudA: 0.075, haze: '128,140,146', hazeA: 0.2
    },
    powerline: {
      sky: ['rgb(8,7,8)', 'rgb(19,17,17)', 'rgb(37,32,30)', 'rgb(64,54,47)'],
      ground: ['rgb(56,48,42)', 'rgb(38,34,30)', 'rgb(25,23,21)', 'rgb(13,13,12)'],
      sunX: 0.78, sun: '224,178,132', sunA: 0.2,
      ridges: [[62, [40, 35, 32], 0.85, 0.9], [34, [29, 26, 24], 0.9, 3.3],
               [16, [21, 20, 19], 0.92, 6.7]],
      clouds: 3, cloudA: 0.05, haze: '146,120,96', hazeA: 0.17
    }
  };

  function drawWorld(ctx) {
    var hy = horizonY();
    var e = ENV[S.key] || ENV.solar;

    var sky = ctx.createLinearGradient(0, Math.min(0, hy - S.h), 0, hy);
    sky.addColorStop(0, e.sky[0]);
    sky.addColorStop(0.55, e.sky[1]);
    sky.addColorStop(0.86, e.sky[2]);
    sky.addColorStop(1, e.sky[3]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, S.w, Math.max(0, hy));

    var sun = ctx.createRadialGradient(S.w * e.sunX, hy, 0, S.w * e.sunX, hy, S.w * 0.46);
    sun.addColorStop(0, 'rgba(' + e.sun + ',' + e.sunA + ')');
    sun.addColorStop(0.5, 'rgba(' + e.sun + ',' + (e.sunA * 0.3).toFixed(3) + ')');
    sun.addColorStop(1, 'rgba(' + e.sun + ',0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, S.w, S.h);

    for (var b = 0; b < e.clouds; b++) {
      var cy = hy - (26 + b * 24);
      if (cy < -20) continue;
      var a = Math.max(0, e.cloudA - b * 0.011);
      var cg = ctx.createLinearGradient(0, cy - 8, 0, cy + 8);
      cg.addColorStop(0, 'rgba(214,210,202,0)');
      cg.addColorStop(0.5, 'rgba(214,210,202,' + a.toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(214,210,202,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, cy - 8, S.w, 16);
    }

    var grd = ctx.createLinearGradient(0, hy, 0, S.h);
    grd.addColorStop(0, e.ground[0]);
    grd.addColorStop(0.10, e.ground[1]);
    grd.addColorStop(0.45, e.ground[2]);
    grd.addColorStop(1, e.ground[3]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, Math.max(0, hy), S.w, S.h - Math.max(0, hy));

    e.ridges.forEach(function (r, i) {
      ridge(ctx, hy + 1 + i * 4, r[0], r[1], r[2], r[3]);
    });

    var haze = ctx.createLinearGradient(0, hy - 30, 0, hy + 34);
    haze.addColorStop(0, 'rgba(' + e.haze + ',0)');
    haze.addColorStop(0.45, 'rgba(' + e.haze + ',' + e.hazeA + ')');
    haze.addColorStop(1, 'rgba(' + e.haze + ',0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, hy - 30, S.w, 64);
  }

  function drawPolyPath(ctx, pts2) {
    ctx.beginPath();
    ctx.moveTo(pts2[0].x, pts2[0].y);
    for (var i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i].x, pts2[i].y);
    ctx.closePath();
  }

  // A face can carry a gradient across it, which is what makes glass read as
  // glass instead of a flat fill.
  function drawPolyGrad(ctx, pts2, colA, colB, alpha, stroke) {
    drawPolyPath(ctx, pts2);
    var g = ctx.createLinearGradient(pts2[0].x, pts2[0].y, pts2[2].x, pts2[2].y);
    g.addColorStop(0, rgb(colA, alpha));
    g.addColorStop(1, rgb(colB, alpha));
    ctx.fillStyle = g;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawPoly(ctx, pts2, fill, alpha, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts2[0].x, pts2[0].y);
    for (var i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i].x, pts2[i].y);
    ctx.closePath();
    ctx.fillStyle = rgb(fill, alpha);
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // Rodrigues rotation, used for the small pitch and bank angles.
  function rotAxis(v, axis, ang) {
    var c = Math.cos(ang), si = Math.sin(ang), d = dot(axis, v);
    var cr = cross(axis, v);
    return [
      v[0] * c + cr[0] * si + axis[0] * d * (1 - c),
      v[1] * c + cr[1] * si + axis[1] * d * (1 - c),
      v[2] * c + cr[2] * si + axis[2] * d * (1 - c)
    ];
  }

  function droneTransform() {
    var rp = routePoint(S.t);
    var pos = rp.p.slice();
    var docked = S.targetT <= 0.001;
    if (!reduce.matches && S.flags.hover) pos[1] += Math.sin(S.last / 420) * 8;
    if (!reduce.matches && S.flags.gust) {
      pos[0] += Math.sin(S.last / 90) * 26 + Math.sin(S.last / 37) * 12;
      pos[1] += Math.sin(S.last / 70) * 18;
      pos[2] += Math.cos(S.last / 110) * 22;
    }

    // A multirotor flies level. Heading comes from the ground track alone, so
    // a vertical climb no longer tips the airframe onto its side, which is
    // what made it look upside down against the turbine.
    var h = [rp.dir[0], 0, rp.dir[2]];
    var hl = Math.hypot(h[0], h[2]);
    var fwd = hl > 0.0015 ? [h[0] / hl, 0, h[2] / hl] : (S.lastFwd || [1, 0, 0]);
    S.lastFwd = fwd;

    var right = norm(cross([0, 1, 0], fwd));
    var up = [0, 1, 0];

    // it leans into the direction of travel, and gets knocked about in a gust
    var moving = Math.abs(S.targetT - S.t) > 0.002;
    var pitch = moving ? -0.16 : 0;
    var roll = (!reduce.matches && S.flags.gust) ? Math.sin(S.last / 210) * 0.3 : 0;
    if (pitch) { fwd = rotAxis(fwd, right, pitch); up = rotAxis(up, right, pitch); }
    if (roll) { right = rotAxis(right, fwd, roll); up = rotAxis(up, fwd, roll); }

    return { pos: pos, fwd: fwd, right: right, up: up, sc: docked ? 0.9 : 1, docked: docked };
  }

  function localToWorld(tr, p) {
    return [
      tr.pos[0] + (tr.right[0] * p[0] + tr.up[0] * p[1] + tr.fwd[0] * p[2]) * tr.sc,
      tr.pos[1] + (tr.right[1] * p[0] + tr.up[1] * p[1] + tr.fwd[1] * p[2]) * tr.sc,
      tr.pos[2] + (tr.right[2] * p[0] + tr.up[2] * p[1] + tr.fwd[2] * p[2]) * tr.sc
    ];
  }

  function accentColour() {
    if (S.flags.contingency) return ALERT;
    if (S.flags.hover) return COG;
    return BEIGE;
  }

  function ringPoints(tr, cx, cy, cz, r, segs) {
    var out = [];
    for (var i = 0; i < segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      var p = project(localToWorld(tr, [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]));
      if (!p) return null;
      out.push(p);
    }
    return out;
  }

  function strokeLoop(ctx, pts, col, alpha, w, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = rgb(col, alpha);
    ctx.lineWidth = w;
    ctx.stroke();
  }

  function limb(ctx, tr, a, b, col, alpha, w) {
    var p = project(localToWorld(tr, a)), q = project(localToWorld(tr, b));
    if (!p || !q) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = rgb(col, alpha);
    ctx.lineWidth = w;
    ctx.stroke();
  }

  function drawDrone(ctx, now) {
    var tr = droneTransform();
    var acc = accentColour();
    var centre = project(tr.pos);
    if (!centre) return tr;

    var A = DRONE.arm, R = DRONE.rotor, B = DRONE.body, k = centre.k;
    var lw = Math.max(1, Math.min(3.2, 165 * k));
    var corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    var POD_Y = 9, DISC_Y = 20, FOOT = -26;

    // Ground shadow, but not while the aircraft is over the dock: the pad is
    // a solid object, so a shadow cast onto the ground beneath it read as a
    // stain across the doors.
    var overDock =
      Math.abs(tr.pos[0] - S.dock[0]) < 260 && Math.abs(tr.pos[2] - S.dock[2]) < 230;
    var gs = overDock ? null : project([tr.pos[0], 2, tr.pos[2]]);
    if (gs && tr.pos[1] > 20) {
      ctx.save();
      ctx.translate(gs.x, gs.y);
      ctx.scale(1, 0.32);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, (A + R) * 1.1 * gs.k), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.05, 0.34 - tr.pos[1] / 2600) + ')';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // legs: four struts down to short feet, no long skids to read as clutter
    corners.forEach(function (c) {
      limb(ctx, tr, [c[0] * B * 0.8, -2, c[1] * B * 0.8],
                    [c[0] * B * 1.5, FOOT, c[1] * B * 1.5], BEIGE, 0.42, lw * 0.7);
      limb(ctx, tr, [c[0] * B * 1.5, FOOT, c[1] * B * 1.1],
                    [c[0] * B * 1.5, FOOT, c[1] * B * 1.9], BEIGE, 0.34, lw * 0.6);
    });

    // arms out to each motor, drawn as separate limbs from the hull
    corners.forEach(function (c) {
      limb(ctx, tr, [c[0] * B * 0.7, 0, c[1] * B * 0.7], [c[0] * A, POD_Y, c[1] * A], BEIGE, 0.9, lw);
      // motor can standing on the arm tip
      limb(ctx, tr, [c[0] * A, POD_Y - 4, c[1] * A], [c[0] * A, DISC_Y - 3, c[1] * A], BEIGE, 0.85, lw * 1.5);
    });

    // hull: a small solid box so the centre has real mass
    var hull = [];
    boxFaces(0, 1, 0, B, B * 0.5, B * 1.3).forEach(function (f) {
      var w = f.map(function (q) { return localToWorld(tr, q); });
      var sc = [], ok = true;
      for (var i = 0; i < w.length; i++) {
        var pj = project(w[i]);
        if (!pj) { ok = false; break; }
        sc.push(pj);
      }
      if (!ok) return;
      var n = faceNormal(w), cc = centroid(w);
      var view = norm(sub(cc, S.cam.pos));
      if (dot(n, view) > 0) n = [-n[0], -n[1], -n[2]];
      var lit = 0.3 + Math.max(0, dot(n, SUN)) * 0.95;
      var pz = project(cc);
      if (pz) hull.push({ z: pz.z, sc: sc, lit: lit });
    });
    hull.sort(function (x, y) { return y.z - x.z; });
    hull.forEach(function (f) {
      drawPoly(ctx, f.sc, [150 * f.lit, 150 * f.lit, 142 * f.lit], 1, rgb(BEIGE, 0.5));
    });

    // rotor discs sit above the motors, blades kept inside the ring
    corners.forEach(function (c, idx) {
      var cx = c[0] * A, cz = c[1] * A;
      var ring = ringPoints(tr, cx, DISC_Y, cz, R, 22);
      if (!ring) return;
      strokeLoop(ctx, ring, BEIGE, 0.62, lw * 0.8);
      var spin = reduce.matches ? 0 : now / 58 + idx * 1.9;
      for (var bl = 0; bl < 2; bl++) {
        var ang = spin + bl * Math.PI / 2;
        limb(ctx, tr,
          [cx + Math.cos(ang) * R * 0.78, DISC_Y, cz + Math.sin(ang) * R * 0.78],
          [cx - Math.cos(ang) * R * 0.78, DISC_Y, cz - Math.sin(ang) * R * 0.78],
          BEIGE, 0.45, lw * 0.65);
      }
    });

    // nav light
    var top = project(localToWorld(tr, [0, B * 0.6 + 3, 0]));
    if (top) {
      ctx.shadowColor = rgb(acc, 0.85);
      ctx.shadowBlur = 12;
      ctx.fillStyle = rgb(acc, 0.95);
      ctx.beginPath();
      ctx.arc(top.x, top.y, Math.max(1.5, Math.min(5, 11 * k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return tr;
  }

  function drawRoute(ctx, now) {
    if (!S.flags.flight && !S.flags.grid) return;
    // Hide the part of the route that runs inside the dock housing, which
    // otherwise draws as a line skewering the whole structure.
    var pts = [];
    for (var i = 0; i <= 140; i++) {
      var wp = routePoint(i / 140).p;
      var inside = wp[1] < 86 &&
        Math.abs(wp[0] - S.dock[0]) < 230 && Math.abs(wp[2] - S.dock[2]) < 200;
      pts.push(inside ? null : project(wp));
    }
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = reduce.matches ? 0 : -(now / 26) % 14;
    ctx.strokeStyle = rgb(BEIGE, S.flags.flight ? 0.3 : 0.18);
    ctx.beginPath();
    var started = false;
    pts.forEach(function (p) {
      if (!p) { started = false; return; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // flown portion, solid
    if (S.flags.flight) {
      ctx.setLineDash([]);
      ctx.strokeStyle = rgb(BEIGE, 0.85);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      var upto = Math.floor(S.t * 140);
      started = false;
      for (var j = 0; j <= upto; j++) {
        var q = pts[j];
        if (!q) { started = false; continue; }
        if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }

    if (S.flags.contingency) {
      var a = project(routePoint(S.t).p), b = project([S.dock[0], 40, S.dock[2]]);
      if (a && b) {
        ctx.setLineDash([8, 7]);
        ctx.strokeStyle = rgb(ALERT, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Six quads of a box, so the dock has volume instead of being a decal
  // painted on the ground.
  function boxFaces(cx, cy, cz, sx, sy, sz) {
    var p = [
      [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz],
      [cx + sx, cy + sy, cz - sz], [cx - sx, cy + sy, cz - sz],
      [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz],
      [cx + sx, cy + sy, cz + sz], [cx - sx, cy + sy, cz + sz]
    ];
    return [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]
      .map(function (ix) { return ix.map(function (i) { return p[i]; }); });
  }

  // The dock is drawn in two passes. Everything below the rim goes down
  // before the aircraft, the doors go down after it, so a closed bay hides
  // what is parked inside and sliding the doors open reveals it.
  function drawDock(ctx, phase) {
    var d = S.dock, W = 215, L = 185, H = 62, TW = 24;
    var items = [];

    function solid(faces, base) {
      faces.forEach(function (f) {
        var sc = [], ok = true;
        for (var i = 0; i < f.length; i++) {
          var q = project(f[i]);
          if (!q) { ok = false; break; }
          sc.push(q);
        }
        if (!ok) return;
        var n = faceNormal(f), c = centroid(f);
        var view = norm(sub(c, S.cam.pos));
        if (dot(n, view) > 0) n = [-n[0], -n[1], -n[2]];
        var lit = 0.24 + Math.max(0, dot(n, SUN)) * 1.0;
        var pz = project(c);
        if (!pz) return;
        items.push({ z: pz.z, draw: function () {
          drawPoly(ctx, sc, [base[0] * lit, base[1] * lit, base[2] * lit], 1, rgb(BEIGE, 0.16));
        } });
      });
    }

    if (phase === 'base') {
      // bay floor and four rim walls, leaving the bay itself open so the
      // aircraft inside is visible once the doors retract
      solid(boxFaces(d[0], 7, d[2], W, 7, L), [30, 30, 28]);
      solid(boxFaces(d[0] - W + TW, H / 2, d[2], TW, H / 2, L), [58, 58, 54]);
      solid(boxFaces(d[0] + W - TW, H / 2, d[2], TW, H / 2, L), [58, 58, 54]);
      solid(boxFaces(d[0], H / 2, d[2] - L + TW, W, H / 2, TW), [52, 52, 48]);
      solid(boxFaces(d[0], H / 2, d[2] + L - TW, W, H / 2, TW), [64, 64, 60]);

      // corner locks along the rim
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        solid(boxFaces(d[0] + q[0] * (W - 18), H + 4, d[2] + q[1] * (L - 18), 12, 6, 12),
              S.flags.dockLocked ? [212, 210, 202] : [74, 74, 70]);
      });

      // service step at the front of the housing, where the crew works
      solid(boxFaces(d[0], 16, d[2] + L + 26, W * 0.62, 16, 26), [70, 70, 66]);
    } else {
      // Doors retract into the rim rather than sliding away from the dock.
      // Travelling their own width left them floating clear of the housing,
      // which is why they looked like they vanished.
      var t = ease(S.doorT);
      var half = (W / 2 - 3) * (1 - t * 0.86);
      [-1, 1].forEach(function (sg) {
        solid(boxFaces(d[0] + sg * (W - 6 - half), H + 8, d[2], half, 7, L - 4), [96, 96, 90]);
      });

      if (S.flags.dockCharging) {
        var c = project([d[0], H + 22, d[2]]);
        if (c) {
          var pulse = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(S.last / 340));
          ctx.save();
          ctx.shadowColor = rgb(BEIGE, 0.6);
          ctx.shadowBlur = 16;
          ctx.strokeStyle = rgb(BEIGE, pulse);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(c.x, c.y, Math.max(5, Math.min(46, 70 * c.k)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.draw(); });
  }

  // Wind made visible: streaks blowing across the site at low level.
  function drawGust(ctx, now) {
    if (!S.flags.gust || !S.ground) return;
    var g = S.ground;
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < 34; i++) {
      var seed = noise(i * 3.1);
      var lane = (seed - 0.5) * g.halfZ * 0.9;
      var y = 40 + noise(i * 7.7) * 520;
      var span = 340 + noise(i * 11.3) * 520;
      var speed = 900 + noise(i * 5.2) * 1400;
      var x = -g.halfX + ((now / 1000 * speed) + seed * 4000) % (g.halfX * 2 + span * 2) - span;
      var a = project([x, y, lane]), b = project([x + span, y, lane]);
      if (!a || !b) continue;
      if (Math.abs(a.x) > S.w * 4 || Math.abs(b.x) > S.w * 4) continue;
      var grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, rgb(BEIGE, 0));
      grad.addColorStop(0.45, rgb(ALERT, 0.30));
      grad.addColorStop(1, rgb(BEIGE, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1 + noise(i * 2.3) * 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Capture is shown as the sensor footprint on the ground under the
  // aircraft, which is what is actually being recorded. The old full-width
  // sweep line spanned the whole site, and any end of it that swung near the
  // camera plane drew as a hard streak across the frame.
  function drawFootprint(ctx, now) {
    if (!S.flags.capture) return;
    var tr = droneTransform();
    var alt = Math.max(40, tr.pos[1]);
    var half = alt * 0.42;
    var pulse = reduce.matches ? 0.5 : 0.42 + 0.26 * (0.5 + 0.5 * Math.sin(now / 520));

    var quad = [
      [tr.pos[0] - half, 5, tr.pos[2] - half * 0.72],
      [tr.pos[0] + half, 5, tr.pos[2] - half * 0.72],
      [tr.pos[0] + half, 5, tr.pos[2] + half * 0.72],
      [tr.pos[0] - half, 5, tr.pos[2] + half * 0.72]
    ].map(project);
    if (quad.indexOf(null) >= 0) return;

    ctx.save();
    drawPolyPath(ctx, quad);
    ctx.fillStyle = rgb(BEIGE, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgb(BEIGE, 0.22 * pulse + 0.1);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // corner ticks, so it reads as a frame rather than a panel
    [[0, 1, 3], [1, 0, 2], [2, 3, 1], [3, 2, 0]].forEach(function (ix) {
      var c = quad[ix[0]], p = quad[ix[1]], q = quad[ix[2]];
      ctx.beginPath();
      ctx.moveTo(c.x + (p.x - c.x) * 0.26, c.y + (p.y - c.y) * 0.26);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(c.x + (q.x - c.x) * 0.26, c.y + (q.y - c.y) * 0.26);
      ctx.strokeStyle = rgb(BEIGE, 0.5 * pulse);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
    ctx.restore();
  }

  function render(now) {
    var ctx = S.ctx;
    if (!ctx) return;

    // constant-rate travel along the route
    var dt = Math.min(64, now - (S.last || now));
    var diff = S.targetT - S.t;
    var dist = Math.abs(diff);
    // It will not fly through a shut bay: inside the hatch corridor the
    // aircraft waits on the doors before it moves either way.
    var blocked = S.t < BAY_EXIT && S.doorT < 0.82;
    if (dist > 0.0006 && !blocked) {
      var rate = 0.075 * (dt / 1000);
      if (dist < 0.09) rate *= Math.max(0.22, dist / 0.09);
      S.t += (diff > 0 ? 1 : -1) * Math.min(rate, dist);
    } else if (!blocked) S.t = S.targetT;

    // The bay answers to the aircraft, not to the step. Doors open when it is
    // in the launch or recovery corridor just above the pad, and close once it
    // has either settled on the contacts or cleared the area.
    // The bay answers to the aircraft. It opens whenever the aircraft is in
    // the corridor above the pad with somewhere to be, and then dwells for a
    // moment after it settles so the close is something you actually see.
    var nearPad = S.t < 0.18;
    var underway = Math.abs(S.targetT - S.t) > 0.004;
    if (nearPad && (underway || S.targetT > 0.004)) S.doorHold = 1400;
    else S.doorHold = Math.max(0, S.doorHold - dt);

    var glide = 1 - Math.pow(0.004, dt / 1000);
    S.doorT += ((S.doorHold > 0 ? 1 : 0) - S.doorT) * glide;

    S.last = now;

    refreshProj();

    drawWorld(ctx);

    // depth-sorted faces and edges together
    var viewPos = S.cam.pos;
    var items = [];
    S.faces.forEach(function (fc) {
      var s = [], ok = true;
      for (var i = 0; i < fc.pts.length; i++) {
        var q = project(fc.pts[i]);
        if (!q) { ok = false; break; }
        s.push(q);
      }
      if (!ok) return;
      var z = Math.hypot(fc.c[0] - viewPos[0], fc.c[1] - viewPos[1], fc.c[2] - viewPos[2]);
      var viewDir = norm(sub(fc.c, viewPos));
      var col = shadeFace(fc, viewDir);
      var fog = fogAmount(z);
      col = mix(col, FOG, fog);
      var colB = fc.kind === 'panel' && !S.flags.thermal
        ? mix(col, [96, 118, 156], 0.42)
        : mix(col, [0, 0, 0], 0.22);
      items.push({ z: z, draw: function () {
        drawPolyGrad(ctx, s, col, colB, 1, rgb(BEIGE, 0.08 * (1 - fog)));
        if (fc.hot && S.flags.anomaly) {
          ctx.save();
          ctx.shadowColor = rgb(ALERT, 0.9);
          ctx.shadowBlur = 26;
          drawPoly(ctx, s, ALERT, 0.55);
          ctx.restore();
        }
      } });
    });
    S.lines.forEach(function (ln) {
      var a = project(ln.a), b = project(ln.b);
      if (!a || !b) return;
      var z = Math.hypot(ln.c[0] - viewPos[0], ln.c[1] - viewPos[1], ln.c[2] - viewPos[2]);
      var fog = fogAmount(z);
      items.push({ z: z, draw: function () {
        ctx.strokeStyle = rgb(ln.col, ln.alpha * (1 - fog));
        ctx.lineWidth = ln.w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } });
    });

    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.draw(); });

    drawDock(ctx, 'base');
    drawFootprint(ctx, now);
    drawGust(ctx, now);
    drawRoute(ctx, now);
    drawDrone(ctx, now);
    drawDock(ctx, 'doors');   // doors last, so a closed bay hides the aircraft

    // vignette
    var vg = ctx.createRadialGradient(S.w * 0.5, S.h * 0.5, S.h * 0.25, S.w * 0.5, S.h * 0.5, S.h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.w, S.h);

    S.raf = S.visible ? requestAnimationFrame(render) : 0;
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */
  function resize() {
    if (!S.canvas) return;
    var r = S.canvas.getBoundingClientRect();
    S.dpr = Math.min(2, window.devicePixelRatio || 1);
    S.w = Math.max(1, r.width);
    S.h = Math.max(1, r.height);
    S.canvas.width = Math.round(S.w * S.dpr);
    S.canvas.height = Math.round(S.h * S.dpr);
    S.ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    refreshProj();
  }

  var API = {
    mount: function (canvas) {
      S.canvas = canvas;
      S.ctx = canvas.getContext('2d');
      S.cam = makeCam([-1200, 600, 1600], [0, 100, 0], 0.95);
      resize();
      bindControls(canvas);
      window.addEventListener('resize', resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
      S.visible = true;
      if (!S.raf) S.raf = requestAnimationFrame(render);
    },

    load: function (key) {
      S.faces = [];
      S.lines = [];
      S.anomaly = null;
      S.ghost = null;
      S.key = key;
      var built = (SCENES[key] || SCENES.solar)();
      S.ground = built.ground;
      S.site = built.site || { halfX: 900, halfZ: 700 };
      S.shots = built.shots;
      S.wide = built.wide || built.shots[2];
      S.cam = S.wide;
      S.orbit = camToOrbit(S.wide);
      S.orbit.min = S.orbit.dist * 0.28;
      S.orbit.max = S.orbit.dist * 2.4;
      S.orbit.home = { target: S.wide.target.slice(), dist: S.orbit.dist,
                       yaw: S.orbit.yaw, pitch: S.orbit.pitch };
      orbitToCam();
      S.hold = solveHold();
      S.t = 0;
      S.targetT = 0;
      S.camMix = 1;
      refreshProj();
    },

    flags: function (o) { S.flags = o || {}; },
    // 'hold' resolves to the point on the route above the defect
    target: function (t) { S.targetT = (t === 'hold') ? S.hold : t; },
    holdT: function () { return S.hold; },
    at: function () { return S.t; },

    // The camera is deliberately fixed. One composed framing per site keeps
    // the whole mission legible and stops the viewport lurching every time
    // the reader moves a step.
    // Put the framing back where the scenario intended it.
    resetView: function () {
      var h = S.orbit && S.orbit.home;
      if (!h) return;
      S.orbit.target = h.target.slice();
      S.orbit.dist = h.dist;
      S.orbit.yaw = h.yaw;
      S.orbit.pitch = h.pitch;
      orbitToCam();
    },

    wideShot: function () {},
    cutTo: function () {},
    shot: function () {},

    // Screen rect of a set of world points, in CSS pixels.
    boxOf: function (pts) {
      if (!pts) return null;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
      for (var i = 0; i < pts.length; i++) {
        var q = project(pts[i]);
        if (!q) continue;
        any = true;
        if (q.x < x0) x0 = q.x;
        if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y;
        if (q.y > y1) y1 = q.y;
      }
      if (!any) return null;
      var padX = Math.max(10, (x1 - x0) * 0.12), padY = Math.max(10, (y1 - y0) * 0.18);
      return { x: x0 - padX, y: y0 - padY, w: (x1 - x0) + padX * 2, h: (y1 - y0) + padY * 2 };
    },

    anomalyBox: function () { return API.boxOf(S.anomaly); },
    ghostBox: function () { return API.boxOf(S.ghost); },
    dronePoint: function () { return project(routePoint(S.t).p); },
    setVisible: function (v) {
      S.visible = v;
      if (v && !S.raf) { S.last = 0; S.raf = requestAnimationFrame(render); }
    },
    resize: resize
  };

  window.KenwerScene = API;
})();
