/* ============================================================
   Kenwer, Autonomous Mission Simulator
   ------------------------------------------------------------
   A scroll-driven state machine over a tactical HUD.

   Everything scenario-specific lives in SCENARIOS: narrative copy,
   telemetry, logs, overlay labels, and a scene builder returning SVG
   geometry plus the flight path and anomaly box in viewBox units.
   Adding an inspection type = adding one dictionary entry.

   Rendering rules: one rAF loop drives every continuous motion, and
   nothing animates a property that triggers layout.
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =========================================================
     1. Geometry helpers
     ========================================================= */

  // Radiometric ramp kept inside the brand palette: cold runs to the
  // site's raised black, warm runs to beige, and only a genuine defect
  // reaches the alert red, so the hot cell is the one thing with hue.
  var THERMAL_STOPS = [
    [0.00, [22, 22, 20]], [0.40, [66, 65, 60]], [0.70, [140, 138, 130]],
    [0.88, [222, 220, 212]], [1.00, [226, 85, 63]]
  ];

  function thermalColor(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < THERMAL_STOPS.length; i++) {
      if (t <= THERMAL_STOPS[i][0]) {
        var a = THERMAL_STOPS[i - 1], b = THERMAL_STOPS[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        return 'rgb(' +
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * k) + ',' +
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * k) + ',' +
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * k) + ')';
      }
    }
    return 'rgb(255,233,168)';
  }

  // Deterministic pseudo-noise, so the scene looks identical on every load.
  function noise(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // Each panel carries both its visible-light and its thermal fill;
  // mission.css cross-fades between them via .is-thermal.
  function panel(points, temp, rgbFill) {
    return '<polygon class="panel" points="' + points + '" style="--rgb-fill:' +
      (rgbFill || '#122231') + ';--th-fill:' + thermalColor(temp) + '"/>';
  }

  function quadPoint(p0, p1, p2, t) {
    var u = 1 - t;
    return {
      x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
    };
  }

  // Same top-down quadcopter the home page hero flies: crossed arms,
  // four rotor discs with spinning blades, a hub, scaled up for the HUD.
  function droneSvg() {
    var A = 15, R = 7;
    var rotors = [[-A, -A], [A, -A], [-A, A], [A, A]].map(function (p) {
      return '<g transform="translate(' + p[0] + ' ' + p[1] + ')">' +
               '<circle r="' + R + '"/>' +
               '<g class="rotor"><path d="M-5 0H5M0-5V5"/></g>' +
             '</g>';
    }).join('');
    return '' +
      '<g class="drone" id="drone">' +
        '<circle class="halo" r="22"/>' +
        '<g class="quad">' +
          '<path d="M-' + A + ' -' + A + 'L' + A + ' ' + A + 'M' + A + ' -' + A + 'L-' + A + ' ' + A + '"/>' +
          rotors +
          '<rect class="hub" x="-5" y="-6.5" width="10" height="13" rx="2.5"/>' +
        '</g>' +
      '</g>';
  }

  // Drone-in-a-box pad, drawn around the origin and translated onto the
  // start of the flight path once the path is measurable.
  function dockSvg() {
    var locks = [[-46, -30], [46, -30], [-46, 30], [46, 30]].map(function (p) {
      return '<circle class="dock-lock" cx="' + p[0] + '" cy="' + p[1] + '" r="3"/>';
    }).join('');
    return '' +
      '<g class="dock-layer" id="dockLayer">' +
        '<rect class="dock-pad" x="-60" y="-42" width="120" height="84" rx="7"/>' +
        '<circle class="dock-mark" cx="0" cy="0" r="24"/>' +
        '<path class="dock-mark" d="M-13,0 H13 M0,-13 V13"/>' +
        '<path class="dock-rail" d="M-58,34 H58"/>' +
        '<g class="dock-tray">' +
          '<rect class="dock-cell fresh" x="-16" y="28" width="32" height="12" rx="2"/>' +
          '<rect class="dock-cell spent" x="-56" y="28" width="32" height="12" rx="2"/>' +
        '</g>' +
        '<path class="dock-charge" d="M-22,-38 H22 M-22,38 H22"/>' +
        locks +
        '<rect class="dock-lid l" x="-60" y="-42" width="60" height="84"/>' +
        '<rect class="dock-lid r" x="0" y="-42" width="60" height="84"/>' +
      '</g>';
  }

  // Wraps per-scenario geometry in the layers every scene needs.
  // The scene is authored in a 1280x520 box, a wide format that matches the
  // shape of the centred stage so nothing has to be cropped or letterboxed.
  function assemble(parts) {
    var wp = (parts.waypoints || []).map(function (p) {
      return '<circle class="wp" cx="' + p[0] + '" cy="' + p[1] + '" r="2.6"/>' +
             '<circle class="wp-ring" cx="' + p[0] + '" cy="' + p[1] + '" r="6.5"/>';
    }).join('');

    return '' +
      '<rect class="ground" x="0" y="0" width="1280" height="520"/>' +
      '<g class="geo">' + parts.geo + '</g>' +
      '<g class="grid-layer">' + (parts.bound || '') +
        '<path class="lane" d="' + parts.flight + '"/>' + wp +
      '</g>' +
      dockSvg() +
      '<g class="flight-layer">' +
        '<path class="trace" id="flightPath" d="' + parts.flight + '"/>' +
        '<path class="trace-done" id="flightDone" d="' + parts.flight + '"/>' +
        '<path class="divert" id="divertPath" d=""/>' +
      '</g>' +
      // The aircraft lives outside .flight-layer so it stays on screen while
      // docked, during the swap cycle and after landing, not just in cruise.
      '<g class="drone-layer">' + droneSvg() + '</g>' +
      '<rect class="sweep" x="0" y="-80" width="1280" height="80" fill="url(#sweepGrad)"/>';
  }

  /* ---------------------------------------------------------
     Scene builders. Each returns geometry plus the boxes the HTML
     overlays get pinned to, all in 1280x520 viewBox units.
     --------------------------------------------------------- */

  function buildSolar() {
    var geo = '', lanes = [], waypoints = [], anomaly = null;
    var ROWS = 5, PER_ROW = 8, GAP = 14;
    var y = 108, k = 0;

    for (var r = 0; r < ROWS; r++) {
      var h = 28 + r * 5;
      var left = 300 - r * 56;
      var width = 680 + r * 112;
      var shear = 20 - r * 3;
      var pw = (width - GAP * (PER_ROW - 1)) / PER_ROW;

      for (var c = 0; c < PER_ROW; c++, k++) {
        var x = left + c * (pw + GAP);
        var hot = (r === 2 && c === 4);
        var temp = hot ? 1 : 0.24 + noise(k) * 0.13 + r * 0.012;
        geo += panel(
          x + ',' + (y + h) + ' ' + (x + pw) + ',' + (y + h) + ' ' +
          (x + pw + shear) + ',' + y + ' ' + (x + shear) + ',' + y, temp);
        if (hot) anomaly = { x: x - 4, y: y - 4, w: pw + shear + 8, h: h + 8 };
      }

      geo += '<line class="detail" x1="' + left + '" y1="' + (y + h + 5) + '" x2="' +
             (left + width) + '" y2="' + (y + h + 5) + '"/>';

      var ly = y + h * 0.5;
      var a = [left - 26, ly], b = [left + width + 26, ly];
      lanes.push(r % 2 === 0 ? [a, b] : [b, a]);
      y += h + 22 + r * 6;
    }

    // The survey grid launches from, and returns to, the pad at bottom left.
    var d = 'M96,468';
    lanes.forEach(function (seg) {
      d += ' L' + seg[0][0] + ',' + seg[0][1] + ' L' + seg[1][0] + ',' + seg[1][1];
      waypoints.push(seg[0], seg[1], [(seg[0][0] + seg[1][0]) / 2, seg[0][1]]);
    });

    return {
      svg: assemble({
        geo: geo, flight: d, waypoints: waypoints,
        bound: '<path class="bound" d="M26,86 L1254,86 L1254,444 L26,444 Z"/>'
      }),
      anomaly: anomaly,
      ghostOffset: { dx: -186, dy: -74 }
    };
  }

  function buildWind() {
    var hub = [660, 272], L = 182, geo = '', anomaly = null;

    geo += '<rect class="ground" x="0" y="470" width="1280" height="50" style="fill:#080807"/>';
    geo += '<line class="detail" x1="0" y1="470" x2="1280" y2="470"/>';
    geo += '<polygon class="struct-fill" points="646,470 674,470 666,274 654,274"/>';
    geo += '<rect class="struct-fill" x="632" y="254" width="56" height="24" rx="9"/>';
    geo += '<circle class="struct-fill" cx="660" cy="272" r="10"/>';

    [-125, -5, 115].forEach(function (deg, bi) {
      var rad = deg * Math.PI / 180;
      var dx = Math.cos(rad), dy = Math.sin(rad);
      var nx = -dy, ny = dx;
      for (var s2 = 0; s2 < 6; s2++) {
        var t0 = s2 / 6, t1 = (s2 + 1) / 6;
        var w0 = 9.5 - t0 * 7, w1 = 9.5 - t1 * 7;
        var p0 = [hub[0] + dx * L * t0, hub[1] + dy * L * t0];
        var p1 = [hub[0] + dx * L * t1, hub[1] + dy * L * t1];
        var hot = (bi === 0 && s2 === 4);
        geo += panel(
          (p0[0] + nx * w0) + ',' + (p0[1] + ny * w0) + ' ' +
          (p1[0] + nx * w1) + ',' + (p1[1] + ny * w1) + ' ' +
          (p1[0] - nx * w1) + ',' + (p1[1] - ny * w1) + ' ' +
          (p0[0] - nx * w0) + ',' + (p0[1] - ny * w0),
          hot ? 1 : 0.22 + noise(bi * 10 + s2) * 0.1, '#1b1b19');
        if (hot) {
          anomaly = { x: (p0[0] + p1[0]) / 2 - 36, y: (p0[1] + p1[1]) / 2 - 30, w: 72, h: 60 };
        }
      }
    });

    var d = 'M130,452 C300,440 392,374 470,316 C528,272 538,214 572,176';
    return {
      svg: assemble({
        geo: geo, flight: d,
        waypoints: [[130, 452], [470, 316], [572, 176], [660, 272]],
        bound: '<path class="bound" d="M430,70 L900,70 L900,470 L430,470 Z"/>'
      }),
      anomaly: anomaly,
      ghostOffset: { dx: -200, dy: 108 }
    };
  }

  function buildPowerline() {
    var geo = '', anomaly = null;

    geo += '<rect class="ground" x="0" y="452" width="1280" height="68" style="fill:#080807"/>';
    geo += '<line class="detail" x1="0" y1="452" x2="1280" y2="452"/>';

    [360, 1040].forEach(function (tx, ti) {
      geo += '<polygon class="struct-fill" points="' +
        (tx - 34) + ',452 ' + (tx - 11) + ',132 ' + (tx + 11) + ',132 ' + (tx + 34) + ',452"/>';
      for (var i2 = 0; i2 < 7; i2++) {
        var y0 = 452 - i2 * 46, y1 = y0 - 46;
        var w0 = 34 - i2 * 3.3, w1 = 34 - (i2 + 1) * 3.3;
        geo += '<path class="struct" d="M' + (tx - w0) + ',' + y0 + ' L' + (tx + w1) + ',' + y1 +
               ' M' + (tx + w0) + ',' + y0 + ' L' + (tx - w1) + ',' + y1 + '"/>';
      }
      [168, 216].forEach(function (ay) {
        geo += '<path class="struct" d="M' + (tx - 62) + ',' + ay + ' L' + (tx + 62) + ',' + ay + '"/>';
        geo += '<path class="struct" d="M' + (tx - 30) + ',' + (ay + 15) + ' L' + (tx - 30) + ',' + ay +
               ' M' + (tx + 30) + ',' + (ay + 15) + ' L' + (tx + 30) + ',' + ay + '"/>';
      });
      geo += '<text x="' + tx + '" y="484" fill="rgba(156,154,146,.5)" font-size="11" ' +
             'font-family="monospace" text-anchor="middle">TWR-' + (ti === 0 ? '114' : '115') + '</text>';
    });

    var spans = [
      { p0: [392, 170], p1: [700, 262], p2: [1008, 170], sample: false },
      { p0: [392, 218], p1: [700, 326], p2: [1008, 218], sample: true },
      { p0: [330, 232], p1: [700, 350], p2: [1070, 232], sample: false }
    ];

    spans.forEach(function (sp, si) {
      geo += '<path class="struct" d="M' + sp.p0 + ' Q' + sp.p1 + ' ' + sp.p2 + '"/>';
      if (!sp.sample) return;
      for (var i3 = 0; i3 < 20; i3++) {
        var a = quadPoint(sp.p0, sp.p1, sp.p2, i3 / 20);
        var b = quadPoint(sp.p0, sp.p1, sp.p2, (i3 + 1) / 20);
        var ang = Math.atan2(b.y - a.y, b.x - a.x);
        var nx = -Math.sin(ang) * 5, ny = Math.cos(ang) * 5;
        var hot = (i3 === 10);
        geo += panel(
          (a.x + nx) + ',' + (a.y + ny) + ' ' + (b.x + nx) + ',' + (b.y + ny) + ' ' +
          (b.x - nx) + ',' + (b.y - ny) + ' ' + (a.x - nx) + ',' + (a.y - ny),
          hot ? 1 : 0.26 + noise(si * 30 + i3) * 0.1, '#1b1b19');
        if (hot) {
          anomaly = { x: (a.x + b.x) / 2 - 38, y: (a.y + b.y) / 2 - 30, w: 76, h: 60 };
        }
      }
    });

    var d = 'M150,438 C230,398 300,330 420,300 Q700,406 980,300 C1040,282 1090,300 1130,338';
    return {
      svg: assemble({
        geo: geo, flight: d,
        waypoints: [[420, 300], [560, 356], [700, 376], [840, 356], [980, 300]],
        bound: '<path class="bound" d="M280,118 L1120,118 L1120,452 L280,452 Z"/>'
      }),
      anomaly: anomaly,
      ghostOffset: { dx: -40, dy: 112 }
    };
  }

  /* =========================================================
     3. Scenario dictionary: 7-step autonomous lifecycle
     ========================================================= */

  var SCENARIOS = {

    /* ---------------- SOLAR (primary showcase) ---------------- */
    solar: {
      label: 'Solar Farm',
      build: buildSolar,
      overlay: {
        liveTag: 'ERR: STRING DIODE OVERHEAT +18.4°C',
        liveSub: 'PANEL_ID_#8492 · CONF 0.94',
        ghostTag: 'T-30 DAYS: +4.1°C (WATCH)',
        ghostSub: 'FLIGHT #14 · ARCHIVED'
      },
      memory: {
        title: 'Cognitive Identity · Panel_ID_#8492',
        pastK: 'T-30 days · ΔT', pastV: '+4.1°C', pastW: '22%',
        nowK: 'Current · ΔT', nowV: '+18.4°C', nowW: '96%',
        confV: '0.62 → 0.97', confW: '97%'
      },
      revision: {
        prior: 'Surface dust / soiling hotspot',
        next: 'Sub-surface bypass diode breakdown',
        note: 'Priority escalated P4 (Monitor) → P1 (Critical dispatch)'
      },
      result: {
        wo: 'WO-40881 · SAP PM',
        metrics: [
          { l: 'Yield loss prevented', v: '$14,200/yr', good: true },
          { l: 'Defects logged', v: '1 critical' },
          { l: 'Geo', v: '33.4152 N, -111.9312 W' },
          { l: 'Dock', v: 'Bay 01 · charging' }
        ]
      },
      steps: [
        {
          tag: 'CONNECT', tone: 'link',
          title: 'Connect the drones you <mark>already fly</mark>',
          body: 'Nothing gets replaced. Kenwer Core attaches to your existing airframe over the companion '
                + 'SDK, takes custody of the flight controller and the payload bus, and proves the link '
                + 'before anything is allowed to arm. Your fleet keeps its airframes; it gains a memory.',
          facts: [['Supported', 'PX4 · DJI M350/M300 · Autel'], ['Link', 'AES-256 encrypted'], ['Onboarding', 'One site at a time']],
          hud: {
            status: 'LINKING // KENWER CORE HANDSHAKE',
            batt: 18, battNote: '22.1V', alt: 0, spd: 0, sat: 24, satNote: 'ACQUIRING',
            a: { l: 'Fleet', v: '1 OF 6 ONLINE' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, flightT: 0 },
          dock: {
            title: 'Kenwer Core · handshake',
            checks: [['Companion SDK', 'ATTACHED'], ['Flight controller', 'PX4 v1.14 · MAVLink2'],
                     ['Payload bus', 'CLAIMED'], ['Encryption', 'AES-256 OK'],
                     ['Asset registry', '18 ARRAYS LOADED']]
          },
          logs: [
            { t: '00:00:01', k: 'LINK', m: 'Companion SDK attached · PX4 v1.14 · MAVLink2' },
            { t: '00:00:02', k: 'LINK', m: 'Payload bus claimed · RGB 61MP + radiometric LWIR' },
            { t: '00:00:04', k: 'SEC', m: 'Encrypted channel established · AES-256 session key issued', tone: 'good' },
            { t: '00:00:07', k: 'CORE', m: 'Site asset registry loaded · 18 arrays with prior identities', tone: 'good' },
            { t: '00:00:09', k: 'CORE', m: 'Airframe registered to fleet · ready to accept a mission', tone: 'good' }
          ]
        },
        {
          tag: 'DOCK · DiaB', tone: 'link',
          title: 'Docking handshake and <mark>robotic battery swap</mark>',
          body: 'The aircraft never needs a human. It sits on the pad at <strong>18% state of charge</strong>, ' +
                'Kenwer takes custody over the encrypted companion link, the mechanical tray ejects the spent ' +
                'pack and seats a fresh one, and the pre-flight self-test signs off before the lids open.',
          facts: [['Dock', 'Bay 01 · universal DiaB'], ['Swap cycle', '96 s tray-to-lock'], ['Airframe', 'DJI M350 RTK']],
          hud: {
            status: 'DOCK_BAY_01 // BATTERY_SWAP_CYCLE',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 24, satNote: 'RTK FIXED',
            a: { l: 'Swap', v: 'COMPLETE' }, b: { l: 'Self-test', v: 'PASS' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          seq: 'swap',
          dock: {
            title: 'Dock Bay 01 · pre-flight',
            checks: [['Mechanical lock', '4/4 ENGAGED'], ['Battery swap', '18% → 100%'],
                     ['Pack voltage', '25.2V BALANCED'], ['Encrypted link', 'AES-256 OK'],
                     ['IMU / compass', 'SELF-TEST PASS']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 01 handshake · airframe seated, 4/4 locks engaged' },
            { t: '00:00:02', k: 'PWR', m: 'State of charge 18% · swap subroutine requested', tone: 'warn' },
            { t: '00:00:04', k: 'SEC', m: 'Encrypted link verified · AES-256 session key rotated', tone: 'good' },
            { t: '00:00:48', k: 'PWR', m: 'Spent pack ejected · fresh pack seated and latched' },
            { t: '00:01:36', k: 'PWR', m: 'Battery 100% · 25.2V 6S balanced · cells within 0.02V', tone: 'good' },
            { t: '00:01:40', k: 'PRE', m: 'Self-test PASS · IMU, compass, ESC, payload bus', tone: 'good' }
          ]
        },
        {
          tag: 'PLAN', tone: 'link',
          title: 'Waypoint synthesis and <mark>environmental clearing</mark>',
          body: 'Site boundaries and the sectors not yet inspected are loaded, and Kenwer solves the flight ' +
                'itself: a terrain-following grid with altitude pinned to hold <em>GSD under 2.5 cm/px</em>. ' +
                'The on-pad micro-weather station has to clear it before anything arms.',
          facts: [['Site', '42.6 ha · 18 arrays'], ['GSD', '2.1 cm/px @ 45 m AGL'], ['Wind', '5.4 m/s · limit 8.0']],
          hud: {
            status: 'MISSION_GENERATED',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 24, satNote: 'RTK FIXED',
            a: { l: 'Waypoints', v: '184', n: 184 }, b: { l: 'Airspace', v: 'CLEAR' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, grid: true, radar: true, flightT: 0 },
          dock: {
            title: 'Environmental clearing',
            checks: [['Micro-weather', 'WIND 5.4 m/s'], ['Gust forecast', '< 8.0 m/s / 30 min'],
                     ['Airspace', 'CLEAR · LAANC OK'], ['Thermal sensor', 'NUC CALIBRATED'],
                     ['Uninspected sectors', '12 LANES QUEUED']]
          },
          logs: [
            { t: '00:02:04', k: 'GEO', m: 'Site boundary ingested · 42.6 ha / 18 array blocks' },
            { t: '00:02:06', k: 'PLAN', m: 'Terrain-following grid solved · 184 waypoints · 12 lanes' },
            { t: '00:02:07', k: 'PLAN', m: 'Altitude locked 45.0 m AGL for GSD 2.1 cm/px · overlap 80/70' },
            { t: '00:02:09', k: 'MET', m: 'Micro-weather 5.4 m/s · gust ceiling 7.1 m/s · within envelope', tone: 'good' },
            { t: '00:02:11', k: 'NAV', m: 'Airspace CLEAR · mission uploaded · ETA 22 min', tone: 'good' }
          ]
        },
        {
          tag: 'SORTIE', tone: 'nominal',
          title: 'Autonomous takeoff and <mark>dual-sensor cruise</mark>',
          body: 'Lids retract, the aircraft lifts off the pad under precision vertical control and transitions ' +
                'to cruise. It captures synchronized optical and radiometric LWIR frames on the same trigger, ' +
                'so every thermal pixel has an RGB twin at the same instant and the same geotag.',
          facts: [['Alt', '45.2 m AGL'], ['Ground speed', '6.5 m/s'], ['Positioning', 'RTK FIXED · 26 SV']],
          hud: {
            status: 'IN_TRANSIT',
            batt: 94, battNote: '24.8V', alt: 45.2, spd: 6.5, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Coverage', v: '64%', n: 64, u: '%' }, b: { l: 'Frames', v: '1284', n: 1284 },
            modes: ['rgb', 'thermal']
          },
          scene: {
            dock: true, dockOpen: true, grid: true, flight: true, capture: true,
            reticle: true, horizon: true, radar: true, flightT: 0.5
          },
          logs: [
            { t: '00:03:02', k: 'FLT', m: 'Lids retracted · precision vertical takeoff · climbing to 45.0 m' },
            { t: '00:03:40', k: 'NAV', m: 'RTK FIXED · 26 SV · horizontal accuracy 1.2 cm', tone: 'good' },
            { t: '00:04:40', k: 'CAP', m: 'Dual-sensor capture armed · RGB and LWIR trigger-synchronized' },
            { t: '00:09:18', k: 'CAP', m: '1,284 frame pairs captured · geotag drift 0.0 ms' }
          ]
        },
        {
          tag: 'EDGE AI', tone: 'anomaly',
          title: 'Live inference flags a <mark>thermal anomaly</mark>',
          body: 'Detection runs on-board at 18 ms per frame, with no upload and no waiting for a desk review. ' +
                'A string on the B7 inverter reads <em>+18.4 °C above the array median</em>, well past the ' +
                'noise floor of a dirty panel.',
          facts: [['Defect', 'String diode overheat'], ['ΔT vs median', '+18.4 °C'], ['Confidence', '0.94']],
          hud: {
            status: 'INFERENCE_TRIGGER',
            batt: 88, battNote: '24.4V', alt: 45.2, spd: 5.8, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Sensor', v: 'LWIR' }, b: { l: 'Conf', v: '0.94' },
            modes: ['thermal']
          },
          scene: {
            flight: true, capture: true, anomaly: true, reticle: true, flightT: 'hold'
          },
          logs: [
            { t: '00:12:47', k: 'EDGE', m: 'Defect network running on-board · 18 ms/frame' },
            { t: '00:12:47', k: 'DET', m: 'Inverter string B7 · ΔT +18.4°C against array median', tone: 'warn' },
            { t: '00:12:48', k: 'DET', m: 'Panel_ID_#8492 flagged · confidence 0.94', tone: 'bad' }
          ]
        },
        {
          tag: 'COGNITIVE LAYER', tone: 'cognitive',
          title: 'Temporal memory and <mark>belief revision</mark>',
          body: 'The aircraft holds a hover while Kenwer does the part conventional software cannot. It ' +
                'recognises the asset, pulls <em>every prior observation of this exact panel</em> out of ' +
                'temporal memory, and asks whether its old explanation still holds. It does not.',
          facts: [['Prior state', '+4.1 °C · flight #14'], ['Drift acceleration', '3.4×'], ['Confidence', '0.62 → 0.97']],
          hud: {
            status: 'COGNITIVE_LAYER // REVISING_BELIEF',
            batt: 84, battNote: '24.2V', alt: 45.2, spd: 0, spdNote: 'HOVER_HOLD', sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Memory', v: '6 months' }, b: { l: 'Priority', v: 'P4 → P1' },
            modes: ['thermal', 'memory']
          },
          scene: {
            flight: true, anomaly: true, ghost: true, cognitive: true, hover: true, reticle: true, flightT: 'hold'
          },
          extra: 'revision',
          logs: [
            { raw: '> Memory Fetch: Panel_ID_#8492 (Flight #14, 30 days prior)', tone: 'cog' },
            { raw: '> Prior State: +4.1°C [Confidence: 62%, Flag: Monitor]', tone: 'cog' },
            { raw: '> Current State: +18.4°C [Thermal Drift Acceleration: 3.4x]', tone: 'cog' },
            { raw: '> BELIEF REVISION:', tone: 'head' },
            { raw: '> Prior Hypothesis: "Surface Dust / Soiling Hotspot"', tone: 'cog' },
            { raw: '> Revised Diagnosis: "Sub-surface Bypass Diode Breakdown"', tone: 'cog' },
            { raw: '> Priority escalated: P4 -> P1 Critical', tone: 'bad' }
          ]
        },
        {
          tag: 'CONTINGENCY', tone: 'anomaly',
          title: 'Universal contingency and <mark>failover handling</mark>',
          body: 'A micro-gust spikes past the envelope mid-lane. Kenwer does not abandon the mission. It ' +
                'writes the exact 3D coordinates and waypoint index to persistent memory, flies a safe abort ' +
                'vector to the alternate landing zone, and <em>holds the resume point</em> until conditions clear.',
          facts: [['Trigger', 'Wind shear 15.2 m/s'], ['Resume point', 'WP #43 / 184'], ['Abort vector', 'Alternate LZ · 340 m']],
          hud: {
            status: 'CONTINGENCY_HANDLING // RESUME_POINT_SAVED',
            batt: 71, battNote: '23.6V', alt: 30, spd: 9.4, spdNote: 'ABORT', sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Event', v: 'WIND SHEAR' }, b: { l: 'Resume', v: 'WP #43' },
            modes: ['rgb']
          },
          scene: {
            flight: true, contingency: true, alert: true,
            reticle: true, flightT: 0.06
          },
          extra: 'contingency',
          alert: {
            title: 'Contingency · wind shear',
            body: 'Localized gust 15.2 m/s exceeds the 8.0 m/s envelope.\nAborting to alternate docking LZ.',
            resume: 'Waypoint #43/184 locked in persistent memory'
          },
          logs: [
            { raw: '> Event: Localized Wind Shear Spike (15.2 m/s)', tone: 'bad' },
            { raw: '> Action: Precision Return to Safe Zone / Alternate Docking LZ', tone: 'warn' },
            { raw: '> State: Waypoint #43/184 locked in persistent memory', tone: 'cog' },
            { raw: '> Autonomous Resume available upon environmental clearance', tone: 'good' }
          ]
        },
        {
          tag: 'DISPATCH', tone: 'nominal',
          title: 'Orthomosaic ingestion, <mark>work order and fleet status</mark>',
          body: 'Data syncs through the edge gateway into an interactive orthomosaic twin, the defect becomes ' +
                'a priority-one work order already inside the maintenance system, with the belief history attached, ' +
                'and the aircraft settles back onto its charge contacts, ready for the next window.',
          facts: [['Orthomosaic', '1,284 frames · 2.1 cm/px'], ['Endpoint', 'POST /workorders → SAP PM'], ['Fleet', 'Docked · charging 42%']],
          hud: {
            status: 'DOCKED & CHARGING // SYNC COMPLETE',
            batt: 42, battNote: 'CHARGING', alt: 0, spd: 0, sat: 24, satNote: 'RTK FIXED',
            a: { l: 'Defects', v: '1 CRITICAL' }, b: { l: 'Work order', v: 'WO-40881' },
            modes: ['rgb']
          },
          scene: {
            dock: true, dockOpen: true, dockLocked: true, dockCharging: true,
            dockCard: true, flightT: 0
          },
          dock: {
            title: 'Mission complete · secured',
            checks: [['Edge gateway sync', 'COMPLETE'], ['Orthomosaic', '1,284 FRAMES'],
                     ['Work order', 'WO-40881 · P1'], ['Charge contacts', 'ENGAGED'],
                     ['Next window', 'ARMED']]
          },
          extra: 'cta',
          logs: [
            { t: '00:22:31', k: 'SYNC', m: 'Edge gateway sync complete · orthomosaic twin built · 2.1 cm/px' },
            { t: '00:22:33', k: 'API', m: 'POST /workorders → SAP PM · WO-40881 created P1', tone: 'good' },
            { t: '00:22:33', k: 'API', m: 'Crew dispatched · 33.4152 N, -111.9312 W · SLA 72 h', tone: 'good' },
            { t: '00:22:40', k: 'DOCK', m: 'Airframe secured on charge contacts · 42% and climbing', tone: 'good' },
            { t: '00:22:41', k: 'CORE', m: 'Panel_ID_#8492 identity updated · next sortie verifies the repair', tone: 'cog' }
          ]
        }
      ]
    },

    /* ---------------- WIND ---------------- */
    wind: {
      label: 'Wind Turbine',
      build: buildWind,
      overlay: {
        liveTag: 'ERR: LAMINATE DELAM 1.9 m²',
        liveSub: 'BLADE_A_#T44 · CONF 0.91',
        ghostTag: 'T-90 DAYS: 0.3 m² (WATCH)',
        ghostSub: 'FLIGHT #06 · ARCHIVED'
      },
      memory: {
        title: 'Cognitive Identity · Blade_A_#T44',
        pastK: 'T-90 days · area', pastV: '0.3 m²', pastW: '18%',
        nowK: 'Current · area', nowV: '1.9 m²', nowW: '92%',
        confV: '0.55 → 0.94', confW: '94%'
      },
      revision: {
        prior: 'Leading-edge coating wear',
        next: 'Sub-surface laminate delamination at the shear web',
        note: 'Priority escalated P3 (Seasonal) → P1 (Rope access ≤ 14 days)'
      },
      result: {
        wo: 'WO-T4409 · Maximo',
        metrics: [
          { l: 'Downtime avoided', v: '$86,000', good: true },
          { l: 'Defects logged', v: '1 critical' },
          { l: 'Blade station', v: 'A · 31 of 41.7 m' },
          { l: 'Dock', v: 'Bay 04 · charging' }
        ]
      },
      steps: [
        {
          tag: 'CONNECT', tone: 'link',
          title: 'Connect the drones you <mark>already fly</mark>',
          body: 'Nothing gets replaced. Kenwer Core attaches to your existing airframe over the companion '
                + 'SDK, takes custody of the flight controller and the payload bus, and proves the link '
                + 'before anything is allowed to arm. Your fleet keeps its airframes; it gains a memory.',
          facts: [['Supported', 'DJI M300 RTK · PX4'], ['Link', 'AES-256 encrypted'], ['Onboarding', 'One site at a time']],
          hud: {
            status: 'LINKING // KENWER CORE HANDSHAKE',
            batt: 18, battNote: '22.1V', alt: 0, spd: 0, sat: 22, satNote: 'ACQUIRING',
            a: { l: 'Fleet', v: '1 OF 4 ONLINE' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, flightT: 0 },
          dock: {
            title: 'Kenwer Core · handshake',
            checks: [['Companion SDK', 'ATTACHED'], ['Flight controller', 'PX4 · MAVLink2'],
                     ['Payload bus', 'CLAIMED'], ['Encryption', 'AES-256 OK'],
                     ['Asset registry', '12 TURBINES LOADED']]
          },
          logs: [
            { t: '00:00:01', k: 'LINK', m: 'Companion SDK attached · PX4 · MAVLink2' },
            { t: '00:00:02', k: 'LINK', m: 'Payload bus claimed · RGB 45MP + radiometric LWIR' },
            { t: '00:00:04', k: 'SEC', m: 'Encrypted channel established · AES-256 session key issued', tone: 'good' },
            { t: '00:00:07', k: 'CORE', m: 'Site asset registry loaded · 12 turbines with prior identities', tone: 'good' },
            { t: '00:00:09', k: 'CORE', m: 'Airframe registered to fleet · ready to accept a mission', tone: 'good' }
          ]
        },
        {
          tag: 'DOCK · DiaB', tone: 'link',
          title: 'Docking handshake and <mark>robotic battery swap</mark>',
          body: 'The pad sits at the turbine base. Kenwer takes the payload bus, the tray swaps a spent pack ' +
                'for a fresh one at <strong>18% state of charge</strong>, and the aircraft also registers the ' +
                'turbine rotor-lock and yaw state before it is allowed to arm.',
          facts: [['Dock', 'Bay 04 · tower base'], ['Swap cycle', '96 s tray-to-lock'], ['Airframe', 'DJI M300 RTK']],
          hud: {
            status: 'DOCK_BAY_04 // BATTERY_SWAP_CYCLE',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Swap', v: 'COMPLETE' }, b: { l: 'Rotor', v: 'LOCKED' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          seq: 'swap',
          dock: {
            title: 'Dock Bay 04 · pre-flight',
            checks: [['Mechanical lock', '4/4 ENGAGED'], ['Battery swap', '18% → 100%'],
                     ['Turbine rotor', 'LOCKED · YAW 212°'], ['Encrypted link', 'AES-256 OK'],
                     ['IMU / compass', 'SELF-TEST PASS']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 04 handshake · airframe seated, 4/4 locks engaged' },
            { t: '00:00:02', k: 'PWR', m: 'State of charge 18% · swap subroutine requested', tone: 'warn' },
            { t: '00:00:04', k: 'SCADA', m: 'Turbine T44 rotor locked · yaw 212° confirmed', tone: 'good' },
            { t: '00:01:36', k: 'PWR', m: 'Battery 100% · 25.2V 6S balanced', tone: 'good' },
            { t: '00:01:40', k: 'PRE', m: 'Self-test PASS · IMU, compass, ESC, payload bus', tone: 'good' }
          ]
        },
        {
          tag: 'PLAN', tone: 'link',
          title: 'Blade-relative <mark>waypoint synthesis</mark>',
          body: 'The turbine geometry is loaded and Kenwer builds a standoff path per blade face (pressure ' +
                'side, suction side and both edges), holding a fixed <em>6 m standoff</em> so every frame ' +
                'lands at the same scale.',
          facts: [['Faces', '12 passes · 3 blades'], ['Standoff', '6.0 m fixed'], ['GSD', '1.1 mm/px']],
          hud: {
            status: 'MISSION_GENERATED',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Waypoints', v: '96', n: 96 }, b: { l: 'Airspace', v: 'CLEAR' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, grid: true, radar: true, flightT: 0 },
          dock: {
            title: 'Environmental clearing',
            checks: [['Micro-weather', 'WIND 6.1 m/s'], ['Gust forecast', '< 8.0 m/s / 30 min'],
                     ['Airspace', 'CLEAR · site NOTAM'], ['Thermal sensor', 'NUC CALIBRATED'],
                     ['Uninspected faces', '12 QUEUED']]
          },
          logs: [
            { t: '00:02:04', k: 'GEO', m: 'Turbine model ingested · 41.7 m blades · hub 92 m' },
            { t: '00:02:06', k: 'PLAN', m: 'Blade-relative path solved · 96 waypoints · 12 faces' },
            { t: '00:02:08', k: 'PLAN', m: 'Standoff locked 6.0 m for GSD 1.1 mm/px' },
            { t: '00:02:10', k: 'MET', m: 'Micro-weather 6.1 m/s · within envelope', tone: 'good' },
            { t: '00:02:11', k: 'NAV', m: 'Airspace CLEAR · mission uploaded · ETA 17 min', tone: 'good' }
          ]
        },
        {
          tag: 'SORTIE', tone: 'nominal',
          title: 'Autonomous takeoff and <mark>blade sweep</mark>',
          body: 'The aircraft climbs the blade capturing synchronized optical and radiometric LWIR frames. ' +
                'Thermal matters here: sub-surface damage is invisible in RGB but shows as a signature as ' +
                'the laminate sheds heat unevenly.',
          facts: [['Alt', '68.0 m AGL'], ['Ground speed', '2.4 m/s'], ['Positioning', 'RTK FIXED · 22 SV']],
          hud: {
            status: 'IN_TRANSIT',
            batt: 93, battNote: '24.8V', alt: 68, spd: 2.4, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Coverage', v: '58%', n: 58, u: '%' }, b: { l: 'Frames', v: '842', n: 842 },
            modes: ['rgb', 'thermal']
          },
          scene: {
            dock: true, dockOpen: true, grid: true, flight: true, capture: true,
            reticle: true, horizon: true, radar: true, flightT: 0.52
          },
          logs: [
            { t: '00:02:40', k: 'FLT', m: 'Lids retracted · takeoff · standoff acquired at 6.0 m' },
            { t: '00:04:12', k: 'CAP', m: 'Dual-sensor capture armed · RGB and LWIR synchronized' },
            { t: '00:08:55', k: 'CAP', m: '842 frame pairs captured · blade A face 3 of 4' },
            { t: '00:09:40', k: 'FLT', m: 'Gust 7.1 m/s · standoff held within 0.2 m', tone: 'warn' }
          ]
        },
        {
          tag: 'EDGE AI', tone: 'anomaly',
          title: 'Live inference flags <mark>sub-surface damage</mark>',
          body: 'On-board inference isolates a thermal signature on the blade A leading edge at station 31: ' +
                '<em>1.9 m² of anomalous heat retention</em> with no visible surface breach in the RGB twin.',
          facts: [['Defect', 'Laminate anomaly'], ['Area', '1.9 m²'], ['Confidence', '0.91']],
          hud: {
            status: 'INFERENCE_TRIGGER',
            batt: 88, battNote: '24.4V', alt: 68, spd: 1.2, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Sensor', v: 'LWIR' }, b: { l: 'Conf', v: '0.91' }, modes: ['thermal']
          },
          scene: {
            flight: true, capture: true, anomaly: true, reticle: true, flightT: 'hold'
          },
          logs: [
            { t: '00:11:20', k: 'EDGE', m: 'Defect network running on-board · 21 ms/frame' },
            { t: '00:11:21', k: 'DET', m: 'Blade A station 31 · anomalous heat retention', tone: 'warn' },
            { t: '00:11:22', k: 'DET', m: 'Blade_A_#T44 flagged · confidence 0.91 · no surface breach', tone: 'bad' }
          ]
        },
        {
          tag: 'COGNITIVE LAYER', tone: 'cognitive',
          title: 'Temporal memory and <mark>belief revision</mark>',
          body: 'Kenwer has inspected this blade before. It retrieves the identity <em>Blade_A_#T44</em>, ' +
                'compares the footprint against the archived sortie from 90 days ago, and finds growth no ' +
                'coating-wear model can explain.',
          facts: [['Prior state', '0.3 m² · flight #06'], ['Growth', '6.3×'], ['Confidence', '0.55 → 0.94']],
          hud: {
            status: 'COGNITIVE_LAYER // REVISING_BELIEF',
            batt: 84, battNote: '24.2V', alt: 68, spd: 0, spdNote: 'HOVER_HOLD', sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Memory', v: '6 months' }, b: { l: 'Priority', v: 'P3 → P1' },
            modes: ['thermal', 'memory']
          },
          scene: {
            flight: true, anomaly: true, ghost: true, cognitive: true, hover: true, reticle: true, flightT: 'hold'
          },
          extra: 'revision',
          logs: [
            { raw: '> Memory Fetch: Blade_A_#T44 (Flight #06, 90 days prior)', tone: 'cog' },
            { raw: '> Prior State: area 0.3 m² [Confidence: 55%, Flag: Monitor]', tone: 'cog' },
            { raw: '> Current State: area 1.9 m² [Growth Rate: 6.3x]', tone: 'cog' },
            { raw: '> BELIEF REVISION:', tone: 'head' },
            { raw: '> Prior Hypothesis: "Leading-Edge Coating Wear"', tone: 'cog' },
            { raw: '> Revised Diagnosis: "Shear Web Laminate Delamination"', tone: 'cog' },
            { raw: '> Priority escalated: P3 -> P1 Critical', tone: 'bad' }
          ]
        },
        {
          tag: 'CONTINGENCY', tone: 'anomaly',
          title: 'Universal contingency and <mark>failover handling</mark>',
          body: 'Gusts at hub height build past the envelope. Kenwer writes the blade station and waypoint ' +
                'index to persistent memory, flies a clean abort vector away from the rotor plane, and ' +
                '<em>holds the resume point</em> for the next weather window.',
          facts: [['Trigger', 'Wind shear 15.2 m/s'], ['Resume point', 'WP #61 / 96'], ['Abort vector', 'Away from rotor plane']],
          hud: {
            status: 'CONTINGENCY_HANDLING // RESUME_POINT_SAVED',
            batt: 74, battNote: '23.8V', alt: 30, spd: 8.2, spdNote: 'ABORT', sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Event', v: 'WIND SHEAR' }, b: { l: 'Resume', v: 'WP #61' }, modes: ['rgb']
          },
          scene: {
            flight: true, contingency: true, alert: true,
            reticle: true, flightT: 0.06
          },
          extra: 'contingency',
          alert: {
            title: 'Contingency · wind shear',
            body: 'Hub-height gust 15.2 m/s exceeds the 8.0 m/s envelope.\nAborting clear of the rotor plane.',
            resume: 'Waypoint #61/96 locked in persistent memory'
          },
          logs: [
            { raw: '> Event: Localized Wind Shear Spike (15.2 m/s)', tone: 'bad' },
            { raw: '> Action: Precision Return to Safe Zone / Tower Base LZ', tone: 'warn' },
            { raw: '> State: Waypoint #61/96 locked in persistent memory', tone: 'cog' },
            { raw: '> Autonomous Resume available upon environmental clearance', tone: 'good' }
          ]
        },
        {
          tag: 'DISPATCH', tone: 'nominal',
          title: 'Blade twin, <mark>work order and fleet status</mark>',
          body: 'The blade is delivered as a measurable 3D twin with the defect pinned to a station, the ' +
                'work order lands in Maximo with the full belief trail attached, and the aircraft is back ' +
                'on charge contacts at the tower base.',
          facts: [['Twin', '842 frames · 1.1 mm/px'], ['Endpoint', 'POST /workorders → Maximo'], ['Fleet', 'Docked · charging 44%']],
          hud: {
            status: 'DOCKED & CHARGING // SYNC COMPLETE',
            batt: 44, battNote: 'CHARGING', alt: 0, spd: 0, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Defects', v: '1 CRITICAL' }, b: { l: 'Work order', v: 'WO-T4409' }, modes: ['rgb']
          },
          scene: { dock: true, dockOpen: true, dockLocked: true, dockCharging: true, dockCard: true, flightT: 0 },
          dock: {
            title: 'Mission complete · secured',
            checks: [['Edge gateway sync', 'COMPLETE'], ['Blade twin', '842 FRAMES'],
                     ['Work order', 'WO-T4409 · P1'], ['Charge contacts', 'ENGAGED'],
                     ['Next window', 'ARMED']]
          },
          extra: 'cta',
          logs: [
            { t: '00:17:02', k: 'SYNC', m: 'Edge gateway sync complete · 3D blade twin built' },
            { t: '00:17:04', k: 'API', m: 'POST /workorders → Maximo · WO-T4409 created P1', tone: 'good' },
            { t: '00:17:05', k: 'API', m: 'Rope access team scheduled · 35.1721 N, -101.8313 W', tone: 'good' },
            { t: '00:17:12', k: 'DOCK', m: 'Airframe secured on charge contacts · 44% and climbing', tone: 'good' },
            { t: '00:17:13', k: 'CORE', m: 'Blade_A_#T44 identity updated · repair verification queued', tone: 'cog' }
          ]
        }
      ]
    },

    /* ---------------- POWERLINE ---------------- */
    powerline: {
      label: 'HV Powerline',
      build: buildPowerline,
      overlay: {
        liveTag: 'ERR: SPLICE HOTSPOT +41.7°C',
        liveSub: 'SPLICE_ID_#L1149 · CONF 0.96',
        ghostTag: 'T-60 DAYS: +9.2°C (WATCH)',
        ghostSub: 'FLIGHT #09 · ARCHIVED'
      },
      memory: {
        title: 'Cognitive Identity · Splice_ID_#L1149',
        pastK: 'T-60 days · ΔT', pastV: '+9.2°C', pastW: '26%',
        nowK: 'Current · ΔT', nowV: '+41.7°C', nowW: '98%',
        confV: '0.48 → 0.98', confW: '98%'
      },
      revision: {
        prior: 'Solar gain / vegetation shading artifact',
        next: 'Compression splice degradation, thermal runaway path',
        note: 'Priority escalated P4 (Monitor) → P1 (De-energise and replace)'
      },
      result: {
        wo: 'WO-L1149 · Maximo',
        metrics: [
          { l: 'Outage avoided', v: '$310,000', good: true },
          { l: 'Defects logged', v: '1 critical' },
          { l: 'Span', v: 'TWR-114 → TWR-115' },
          { l: 'Dock', v: 'Bay 07 · charging' }
        ]
      },
      steps: [
        {
          tag: 'CONNECT', tone: 'link',
          title: 'Connect the drones you <mark>already fly</mark>',
          body: 'Nothing gets replaced. Kenwer Core attaches to your existing airframe over the companion '
                + 'SDK, takes custody of the flight controller and the payload bus, and proves the link '
                + 'before anything is allowed to arm. Your fleet keeps its airframes; it gains a memory.',
          facts: [['Supported', 'Autel EVO Max 4T · PX4'], ['Link', 'AES-256 encrypted'], ['Onboarding', 'One site at a time']],
          hud: {
            status: 'LINKING // KENWER CORE HANDSHAKE',
            batt: 18, battNote: '22.1V', alt: 0, spd: 0, sat: 26, satNote: 'ACQUIRING',
            a: { l: 'Fleet', v: '1 OF 9 ONLINE' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, flightT: 0 },
          dock: {
            title: 'Kenwer Core · handshake',
            checks: [['Companion SDK', 'ATTACHED'], ['Flight controller', 'PX4 · companion SDK'],
                     ['Payload bus', 'CLAIMED'], ['Encryption', 'AES-256 OK'],
                     ['Asset registry', '12 TOWERS LOADED']]
          },
          logs: [
            { t: '00:00:01', k: 'LINK', m: 'Companion SDK attached · PX4 · companion SDK' },
            { t: '00:00:02', k: 'LINK', m: 'Payload bus claimed · RGB 48MP + radiometric LWIR' },
            { t: '00:00:04', k: 'SEC', m: 'Encrypted channel established · AES-256 session key issued', tone: 'good' },
            { t: '00:00:07', k: 'CORE', m: 'GIS corridor registry loaded · 12 towers with prior identities', tone: 'good' },
            { t: '00:00:09', k: 'CORE', m: 'Airframe registered to fleet · ready to accept a mission', tone: 'good' }
          ]
        },
        {
          tag: 'DOCK · DiaB', tone: 'link',
          title: 'Docking handshake and <mark>robotic battery swap</mark>',
          body: 'Corridor work runs BVLOS from a remote pad, so nobody is on site. The dock swaps a spent ' +
                'pack for a fresh one at <strong>18% state of charge</strong> and the encrypted link, RTK fix ' +
                'and radiometric calibration are all logged for the utility\'s audit trail.',
          facts: [['Dock', 'Bay 07 · corridor pad'], ['Swap cycle', '96 s tray-to-lock'], ['Airframe', 'Autel EVO Max 4T']],
          hud: {
            status: 'DOCK_BAY_07 // BATTERY_SWAP_CYCLE',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Swap', v: 'COMPLETE' }, b: { l: 'BVLOS', v: 'WAIVER OK' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          seq: 'swap',
          dock: {
            title: 'Dock Bay 07 · pre-flight',
            checks: [['Mechanical lock', '4/4 ENGAGED'], ['Battery swap', '18% → 100%'],
                     ['Pack voltage', '25.2V BALANCED'], ['BVLOS waiver', 'ACTIVE'],
                     ['Emissivity', 'SET 0.92 ACSR']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 07 handshake · airframe seated, 4/4 locks engaged' },
            { t: '00:00:02', k: 'PWR', m: 'State of charge 18% · swap subroutine requested', tone: 'warn' },
            { t: '00:00:04', k: 'SEC', m: 'Encrypted link verified · AES-256 · BVLOS waiver active', tone: 'good' },
            { t: '00:01:36', k: 'PWR', m: 'Battery 100% · 25.2V 6S balanced', tone: 'good' },
            { t: '00:01:40', k: 'PLD', m: 'Radiometric LWIR calibrated · emissivity 0.92 (ACSR)', tone: 'good' }
          ]
        },
        {
          tag: 'PLAN', tone: 'link',
          title: 'Corridor <mark>waypoint synthesis</mark>',
          body: 'The circuit is loaded from the GIS corridor and Kenwer generates a span-following path that ' +
                'tracks conductor sag, holding <em>clearance and GSD constant</em> across terrain that rises ' +
                '90 m between towers.',
          facts: [['Circuit', '230 kV · 4.2 km'], ['Spans', '11 · 12 towers'], ['GSD', '0.8 cm/px']],
          hud: {
            status: 'MISSION_GENERATED',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Waypoints', v: '212', n: 212 }, b: { l: 'Airspace', v: 'CLEAR' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, grid: true, radar: true, flightT: 0 },
          dock: {
            title: 'Environmental clearing',
            checks: [['Micro-weather', 'WIND 4.8 m/s'], ['Gust forecast', '< 8.0 m/s / 30 min'],
                     ['Airspace', 'CLEAR · LAANC OK'], ['Thermal sensor', 'NUC CALIBRATED'],
                     ['Uninspected spans', '11 QUEUED']]
          },
          logs: [
            { t: '00:02:04', k: 'GEO', m: 'GIS corridor ingested · 230 kV · 4.2 km · 12 towers' },
            { t: '00:02:06', k: 'PLAN', m: 'Span-following path solved · 212 waypoints · sag compensated' },
            { t: '00:02:08', k: 'PLAN', m: 'Clearance envelope 8.0 m held over 90 m terrain rise' },
            { t: '00:02:10', k: 'MET', m: 'Micro-weather 4.8 m/s · within envelope', tone: 'good' },
            { t: '00:02:11', k: 'NAV', m: 'Airspace CLEAR · mission uploaded · ETA 26 min', tone: 'good' }
          ]
        },
        {
          tag: 'SORTIE', tone: 'nominal',
          title: 'Autonomous takeoff and <mark>corridor run</mark>',
          body: 'The aircraft tracks the conductors capturing synchronized RGB and radiometric LWIR. Every ' +
                'splice, damper and insulator string gets an optical record and an absolute temperature in ' +
                'the same frame pair.',
          facts: [['Alt', '52.0 m AGL'], ['Ground speed', '8.1 m/s'], ['Positioning', 'RTK FIXED · 26 SV']],
          hud: {
            status: 'IN_TRANSIT',
            batt: 92, battNote: '24.8V', alt: 52, spd: 8.1, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Coverage', v: '71%', n: 71, u: '%' }, b: { l: 'Frames', v: '1960', n: 1960 },
            modes: ['rgb', 'thermal']
          },
          scene: {
            dock: true, dockOpen: true, grid: true, flight: true, capture: true,
            reticle: true, horizon: true, radar: true, flightT: 0.48
          },
          logs: [
            { t: '00:02:15', k: 'FLT', m: 'Lids retracted · takeoff · climbing to 52.0 m AGL' },
            { t: '00:03:40', k: 'CAP', m: 'Dual-sensor capture armed · RGB and LWIR synchronized' },
            { t: '00:12:31', k: 'CAP', m: '1,960 frame pairs captured · span 6 of 11' },
            { t: '00:13:02', k: 'FLT', m: 'Conductor sag tracked · clearance 8.1 m nominal' }
          ]
        },
        {
          tag: 'EDGE AI', tone: 'anomaly',
          title: 'Live inference flags a <mark>splice hotspot</mark>',
          body: 'Mid-span between TWR-114 and TWR-115, a compression splice reads <em>+41.7 °C above the ' +
                'conductor baseline</em> while carrying the same current as its neighbours.',
          facts: [['Defect', 'Splice hotspot'], ['ΔT vs conductor', '+41.7 °C'], ['Confidence', '0.96']],
          hud: {
            status: 'INFERENCE_TRIGGER',
            batt: 86, battNote: '24.4V', alt: 52, spd: 4.2, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Sensor', v: 'LWIR' }, b: { l: 'Conf', v: '0.96' }, modes: ['thermal']
          },
          scene: {
            flight: true, capture: true, anomaly: true, reticle: true, flightT: 'hold'
          },
          logs: [
            { t: '00:14:08', k: 'EDGE', m: 'Defect network running on-board · 16 ms/frame' },
            { t: '00:14:08', k: 'DET', m: 'Mid-span TWR-114/115 · ΔT +41.7°C vs conductor baseline', tone: 'warn' },
            { t: '00:14:09', k: 'DET', m: 'Splice_ID_#L1149 flagged · confidence 0.96', tone: 'bad' }
          ]
        },
        {
          tag: 'COGNITIVE LAYER', tone: 'cognitive',
          title: 'Temporal memory and <mark>belief revision</mark>',
          body: 'Two months ago this same splice ran warm and Kenwer explained it away as solar gain. ' +
                'Retrieving that record, <em>same identity, same load, cooler ambient</em>, the old ' +
                'explanation collapses and the diagnosis is rewritten.',
          facts: [['Prior state', '+9.2 °C · flight #09'], ['Drift acceleration', '4.5×'], ['Confidence', '0.48 → 0.98']],
          hud: {
            status: 'COGNITIVE_LAYER // REVISING_BELIEF',
            batt: 82, battNote: '24.1V', alt: 52, spd: 0, spdNote: 'HOVER_HOLD', sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Memory', v: '6 months' }, b: { l: 'Priority', v: 'P4 → P1' },
            modes: ['thermal', 'memory']
          },
          scene: {
            flight: true, anomaly: true, ghost: true, cognitive: true, hover: true, reticle: true, flightT: 'hold'
          },
          extra: 'revision',
          logs: [
            { raw: '> Memory Fetch: Splice_ID_#L1149 (Flight #09, 60 days prior)', tone: 'cog' },
            { raw: '> Prior State: +9.2°C [Confidence: 48%, Flag: Monitor]', tone: 'cog' },
            { raw: '> Current State: +41.7°C [Thermal Drift Acceleration: 4.5x]', tone: 'cog' },
            { raw: '> Cross-check: load 0.98x prior, ambient -6.4°C -> solar gain rejected', tone: 'cog' },
            { raw: '> BELIEF REVISION:', tone: 'head' },
            { raw: '> Prior Hypothesis: "Solar Gain / Shading Artifact"', tone: 'cog' },
            { raw: '> Revised Diagnosis: "Compression Splice Degradation"', tone: 'cog' },
            { raw: '> Priority escalated: P4 -> P1 Critical', tone: 'bad' }
          ]
        },
        {
          tag: 'CONTINGENCY', tone: 'anomaly',
          title: 'Universal contingency and <mark>failover handling</mark>',
          body: 'A downdraft off the ridge spikes past the envelope. Kenwer locks the span and waypoint index ' +
                'into persistent memory, flies a safe abort vector clear of the conductors to the alternate ' +
                'LZ, and <em>holds the resume point</em> until the corridor clears.',
          facts: [['Trigger', 'Wind shear 15.2 m/s'], ['Resume point', 'WP #118 / 212'], ['Abort vector', 'Clear of conductors']],
          hud: {
            status: 'CONTINGENCY_HANDLING // RESUME_POINT_SAVED',
            batt: 70, battNote: '23.6V', alt: 30, spd: 10.1, spdNote: 'ABORT', sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Event', v: 'WIND SHEAR' }, b: { l: 'Resume', v: 'WP #118' }, modes: ['rgb']
          },
          scene: {
            flight: true, contingency: true, alert: true,
            reticle: true, flightT: 0.06
          },
          extra: 'contingency',
          alert: {
            title: 'Contingency · wind shear',
            body: 'Ridge downdraft 15.2 m/s exceeds the 8.0 m/s envelope.\nAborting clear of energised conductors.',
            resume: 'Waypoint #118/212 locked in persistent memory'
          },
          logs: [
            { raw: '> Event: Localized Wind Shear Spike (15.2 m/s)', tone: 'bad' },
            { raw: '> Action: Precision Return to Safe Zone / Alternate Docking LZ', tone: 'warn' },
            { raw: '> State: Waypoint #118/212 locked in persistent memory', tone: 'cog' },
            { raw: '> Autonomous Resume available upon environmental clearance', tone: 'good' }
          ]
        },
        {
          tag: 'DISPATCH', tone: 'nominal',
          title: 'Corridor twin, <mark>work order and fleet status</mark>',
          body: 'The corridor becomes a geo-referenced twin, the splice becomes a switching request inside ' +
                'Maximo, and the outage that would have taken the circuit down at summer peak never happens.',
          facts: [['Twin', '1,960 frames · 0.8 cm/px'], ['Endpoint', 'POST /workorders → Maximo'], ['Fleet', 'Docked · charging 39%']],
          hud: {
            status: 'DOCKED & CHARGING // SYNC COMPLETE',
            batt: 39, battNote: 'CHARGING', alt: 0, spd: 0, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Defects', v: '1 CRITICAL' }, b: { l: 'Work order', v: 'WO-L1149' }, modes: ['rgb']
          },
          scene: { dock: true, dockOpen: true, dockLocked: true, dockCharging: true, dockCard: true, flightT: 0 },
          dock: {
            title: 'Mission complete · secured',
            checks: [['Edge gateway sync', 'COMPLETE'], ['Corridor twin', '1,960 FRAMES'],
                     ['Work order', 'WO-L1149 · P1'], ['Charge contacts', 'ENGAGED'],
                     ['Next window', 'ARMED']]
          },
          extra: 'cta',
          logs: [
            { t: '00:26:11', k: 'SYNC', m: 'Edge gateway sync complete · corridor twin built · 0.8 cm/px' },
            { t: '00:26:13', k: 'API', m: 'POST /workorders → Maximo · WO-L1149 created P1', tone: 'good' },
            { t: '00:26:14', k: 'API', m: 'Switching request raised · 34.0522 N, -112.0736 W', tone: 'good' },
            { t: '00:26:22', k: 'DOCK', m: 'Airframe secured on charge contacts · 39% and climbing', tone: 'good' },
            { t: '00:26:23', k: 'CORE', m: 'Splice_ID_#L1149 identity updated · post-repair scan queued', tone: 'cog' }
          ]
        }
      ]
    }
  };

  /* =========================================================
     4. DOM refs
     ========================================================= */
  var $ = function (id) { return document.getElementById(id); };
  var hud = $('hud');
  if (!hud) return;

  var narrative = $('narrative');
  var scene = $('scene');
  var sceneWrap = $('sceneWrap');
  var statusTxt = $('hudStatus');
  var stepCount = $('stepCount');
  var stepName = $('hudStepName');
  var spine = $('spine');
  var logFilter = $('logFilter');
  var hudBody = document.querySelector('.hud-body');
  var hudRail = $('hudRail');
  var spine = $('spine');
  var termBody = $('termBody');
  var termClock = $('termClock');
  var anomLive = $('anomLive');
  var anomGhost = $('anomGhost');
  var memoryLink = $('memoryLink');
  var srcState = $('srcState');
  var srcNote = $('srcNote');
  var headingTape = $('headingTape');
  var horizonBall = $('horizonBall');
  var radarBlips = $('radarBlips');
  var ctlBattery = $('ctlBattery');
  var ctlWind = $('ctlWind');
  var ctlHint = $('ctlHint');
  var CTL_HINT = ctlHint ? ctlHint.textContent : '';

  var tele = {
    batt: hud.querySelector('[data-tele="batt"]'),
    alt: hud.querySelector('[data-tele="alt"]'),
    spd: hud.querySelector('[data-tele="spd"]'),
    sat: hud.querySelector('[data-tele="sat"]'),
    a: hud.querySelector('[data-tele="a"]'),
    b: hud.querySelector('[data-tele="b"]'),
    battNote: hud.querySelector('[data-note="batt"]'),
    spdNote: hud.querySelector('[data-note="spd"]'),
    satNote: hud.querySelector('[data-note="sat"]'),
    battCell: hud.querySelector('[data-cell="batt"]'),
    spdCell: hud.querySelector('[data-cell="spd"]'),
    aSlot: hud.querySelector('[data-slot="a"]'),
    bSlot: hud.querySelector('[data-slot="b"]'),
    aLabel: hud.querySelector('[data-label="a"]'),
    bLabel: hud.querySelector('[data-label="b"]')
  };

  /* =========================================================
     5. State
     ========================================================= */
  var state = {
    key: 'solar',
    cfg: null,
    steps: [],
    current: -1,
    rendered: -1,
    logTimers: [],
    seqTimers: [],
    eventTimers: [],
    event: null,            // 'battery' | 'wind' | null
    manualMode: null,       // sensor override, cleared when the step changes
    logFilter: 'all',       // 'all' | 'step'
    stick: true,            // keep the log pinned to the newest line
    geometry: null,
    io: null,
    ioNarrow: null,
    ratios: null,
    visible: true,
    raf: 0,
    last: 0,
    flight: { path: null, done: null, divert: null, drone: null, dockLayer: null, len: 0, t: 0, target: 0, hold: .6, dock: { x: 0, y: 0 } },
    heading: 0,
    headingShown: 0
  };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function clearTimers(list) { list.forEach(clearTimeout); list.length = 0; }

  /* =========================================================
     6. Telemetry counters
     ========================================================= */
  function countTo(el, to, decimals, unit) {
    if (!el) return;
    var from = parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, ''));
    if (isNaN(from)) from = 0;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (reduce.matches || from === to) {
      el.textContent = to.toFixed(decimals) + (unit || '');
      return;
    }
    var t0 = performance.now(), dur = 1150;
    el._raf = requestAnimationFrame(function tick(now) {
      var k = Math.min(1, (now - t0) / dur);
      el.textContent = (from + (to - from) * (1 - Math.pow(1 - k, 3))).toFixed(decimals) + (unit || '');
      if (k < 1) el._raf = requestAnimationFrame(tick);
    });
  }

  function setChip(slot, labelEl, valueEl, chip) {
    if (!slot) return;
    if (!chip) { slot.hidden = true; return; }
    slot.hidden = false;
    labelEl.textContent = chip.l;
    if (typeof chip.n === 'number') countTo(valueEl, chip.n, 0, chip.u || '');
    else valueEl.textContent = chip.v;
  }

  /* =========================================================
     7. Terminal
     ========================================================= */
  function logLine(entry, stepIdx) {
    var el = document.createElement('span');
    el.className = 'tl' + (entry.tone ? ' ' + entry.tone : '');
    if (stepIdx != null) el.dataset.step = stepIdx;
    if (entry.raw) el.textContent = entry.raw;
    else el.innerHTML = '<span class="t">[' + entry.t + ']</span> <span class="c">' + entry.k + '</span> ▸ ' + entry.m;
    termBody.appendChild(el);
    while (termBody.children.length > 120) termBody.removeChild(termBody.firstChild);
    // Only follow the newest line if the reader has not scrolled back to
    // look at something. Nothing is more annoying than being yanked away
    // mid-sentence.
    if (state.stick !== false) termBody.scrollTop = termBody.scrollHeight;
  }

  // Each step's output is fenced under its own heading, so it is obvious
  // which stage of the mission produced which lines.
  function logGroupHeader(i) {
    var el = document.createElement('span');
    el.className = 'tl tl-group';
    el.dataset.step = i;
    el.textContent = 'Step ' + pad2(i + 1) + ' · ' + state.steps[i].tag;
    termBody.appendChild(el);
    if (state.stick !== false) termBody.scrollTop = termBody.scrollHeight;
  }

  function lastStamp(step) {
    for (var i = step.logs.length - 1; i >= 0; i--) if (step.logs[i].t) return step.logs[i].t;
    return null;
  }

  function updateClock(step) {
    var stamp = null;
    for (var i = step; i >= 0 && !stamp; i--) stamp = lastStamp(state.steps[i]);
    termClock.textContent = 'T+' + (stamp || '00:00:00');
  }

  function rebuildLogs(target) {
    clearTimers(state.logTimers);
    termBody.innerHTML = '';
    var from = state.logFilter === 'step' ? target : 0;
    for (var i = from; i <= target; i++) {
      logGroupHeader(i);
      /* jshint loopfunc:true */
      (function (si) {
        state.steps[si].logs.forEach(function (e) { logLine(e, si); });
      })(i);
    }
    state.rendered = target;
    state.stick = true;
    termBody.scrollTop = termBody.scrollHeight;
    updateClock(target);
  }

  // Logs are cumulative. Scrolling forward appends with a stagger; scrolling
  // back, or filtering, rebuilds instantly so the panel always matches the
  // step in view.
  function renderLogs(target) {
    clearTimers(state.logTimers);
    if (state.logFilter === 'step' || target <= state.rendered) {
      rebuildLogs(target);
      return;
    }

    var delay = 0;
    for (var st = state.rendered + 1; st <= target; st++) {
      (function (si) {
        state.logTimers.push(setTimeout(function () { logGroupHeader(si); }, delay));
        state.steps[si].logs.forEach(function (entry) {
          delay += reduce.matches ? 0 : 420;
          state.logTimers.push(setTimeout(function () { logLine(entry, si); }, delay));
        });
      })(st);
    }
    state.rendered = target;
    state.logTimers.push(setTimeout(function () { updateClock(target); }, delay));
  }

  /* =========================================================
     8. Overlay placement (viewBox units -> container pixels)
     ========================================================= */
  var placeQueued = false;
  function queuePlace() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(function () { placeQueued = false; placeOverlays(); });
  }

  function toPx(box) {
    var ctm = scene.getScreenCTM();
    if (!ctm) return null;
    var wrap = sceneWrap.getBoundingClientRect();
    var p = scene.createSVGPoint();
    p.x = box.x; p.y = box.y;
    var a = p.matrixTransform(ctm);
    p.x = box.x + box.w; p.y = box.y + box.h;
    var b = p.matrixTransform(ctm);
    return { x: a.x - wrap.left, y: a.y - wrap.top, w: b.x - a.x, h: b.y - a.y };
  }

  function applyBox(el, b) {
    el.style.left = b.x.toFixed(1) + 'px';
    el.style.top = b.y.toFixed(1) + 'px';
    el.style.width = b.w.toFixed(1) + 'px';
    el.style.height = b.h.toFixed(1) + 'px';
  }

  function placeOverlays() {
    if (!state.geometry || !state.geometry.anomaly) return;
    var live = toPx(state.geometry.anomaly);
    if (!live) return;
    applyBox(anomLive, live);

    var off = state.geometry.ghostOffset;
    var g = toPx({
      x: state.geometry.anomaly.x + off.dx, y: state.geometry.anomaly.y + off.dy,
      w: state.geometry.anomaly.w, h: state.geometry.anomaly.h
    });
    applyBox(anomGhost, g);

    var l = memoryLink.firstElementChild;
    l.setAttribute('x1', (g.x + g.w / 2).toFixed(1));
    l.setAttribute('y1', (g.y + g.h / 2).toFixed(1));
    l.setAttribute('x2', (live.x + live.w / 2).toFixed(1));
    l.setAttribute('y2', (live.y + live.h / 2).toFixed(1));
  }

  /* =========================================================
     9. Flight loop: one rAF drives every continuous motion
     ========================================================= */
  function pointAt(t) {
    var len = state.flight.len;
    var c = Math.max(0, Math.min(len, t * len));
    var p = state.flight.path.getPointAtLength(c);
    var q = state.flight.path.getPointAtLength(Math.min(len, c + 1));
    return { x: p.x, y: p.y, a: Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI };
  }

  // The aircraft parks at the point on the path closest to the anomaly.
  function solveHold() {
    if (!state.geometry || !state.geometry.anomaly || !state.flight.path) return 0.6;
    var a = state.geometry.anomaly, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    var best = 0.6, bestD = Infinity;
    for (var i = 0; i <= 220; i++) {
      var t = i / 220, p = pointAt(t);
      var d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  var RATE = 0.075;        // fraction of the route covered per second
  var EASE_BAND = 0.09;    // ease out over the last stretch

  function tick(now) {
    state.raf = 0;
    var dt = Math.min(64, now - (state.last || now));
    state.last = now;

    var f = state.flight;
    if (!f.path) return;

    // Constant rate of travel. An exponential ease moves proportionally to
    // the distance left, which made a long leg (the return to the pad) look
    // much faster than a short one. This covers the same fraction of the
    // route per second whichever way the aircraft is heading, easing only
    // over the last stretch so it settles instead of stopping dead.
    var diff = f.target - f.t;
    var dist = Math.abs(diff);
    if (dist > 0.0006) {
      var rate = RATE * (dt / 1000);
      if (dist < EASE_BAND) rate *= Math.max(0.22, dist / EASE_BAND);
      f.t += (diff > 0 ? 1 : -1) * Math.min(rate, dist);
    } else {
      f.t = f.target;
    }

    var p = pointAt(f.t);
    var hovering = scene.classList.contains('is-hover');
    var docked = f.target === 0 && scene.classList.contains('show-dock');
    var bob = (!reduce.matches && hovering) ? Math.sin(now / 420) * 3 : 0;

    f.drone.setAttribute('transform',
      'translate(' + p.x.toFixed(2) + ',' + (p.y + bob).toFixed(2) + ') rotate(' + p.a.toFixed(1) + ')' +
      (docked ? ' scale(.82)' : ''));
    f.done.style.strokeDashoffset = (f.len * (1 - f.t)).toFixed(1);

    // Instruments: heading tape + artificial horizon track the flight.
    if (!reduce.matches && sceneWrap.classList.contains('show-horizon')) {
      var hdg = (p.a + 90 + 360) % 360;
      var delta = ((hdg - state.headingShown + 540) % 360) - 180;
      state.headingShown = (state.headingShown + delta * 0.08 + 360) % 360;
      headingTape.style.transform = 'translateX(' + (-state.headingShown * 0.52).toFixed(1) + 'px)';
      var roll = Math.max(-9, Math.min(9, delta * 0.35)) + Math.sin(now / 1600) * 1.2;
      var pitch = Math.sin(now / 2100) * 3 + (Math.abs(diff) > 0.002 ? -4 : 0);
      horizonBall.style.transform = 'rotate(' + roll.toFixed(2) + 'deg) translateY(' + pitch.toFixed(2) + 'px)';
    }

    if (state.visible) schedule();
  }

  function schedule() {
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }

  /* =========================================================
     10. Scene flags
     ========================================================= */
  function applyScene(sc) {
    scene.classList.toggle('show-grid', !!sc.grid);
    scene.classList.toggle('show-flight', !!sc.flight);
    scene.classList.toggle('is-capturing', !!sc.capture);
    scene.classList.toggle('is-hover', !!sc.hover);
    scene.classList.toggle('is-contingency', !!sc.contingency);
    scene.classList.toggle('show-dock', !!sc.dock);
    scene.classList.toggle('dock-open', !!sc.dockOpen);
    scene.classList.toggle('dock-locked', !!sc.dockLocked);
    scene.classList.toggle('dock-charging', !!sc.dockCharging);
    sceneWrap.classList.toggle('show-anomaly', !!sc.anomaly);
    sceneWrap.classList.toggle('show-ghost', !!sc.ghost);
    sceneWrap.classList.toggle('is-cognitive', !!sc.cognitive);
    sceneWrap.classList.toggle('show-result', !!sc.result);
    sceneWrap.classList.toggle('show-dock-card', !!sc.dockCard);
    sceneWrap.classList.toggle('show-alert', !!sc.alert);
    sceneWrap.classList.toggle('show-reticle', !!sc.reticle);
    sceneWrap.classList.toggle('show-horizon', !!sc.horizon);
    sceneWrap.classList.toggle('show-radar', !!sc.radar);
  }

  // Sensor modes come from the step unless the operator has overridden them.
  function applyModes(stepModes) {
    var modes = state.manualMode ? [state.manualMode] : stepModes.slice();
    hud.querySelectorAll('.mode').forEach(function (m) {
      var on = modes.indexOf(m.dataset.mode) !== -1;
      m.classList.toggle('on', on);
      m.setAttribute('aria-pressed', String(on));
    });
    scene.classList.toggle('is-thermal', modes.indexOf('thermal') !== -1);

    // The memory overlay can be summoned manually at any point in the flight;
    // dropping the override restores whatever the current step asked for.
    if (state.manualMode === 'memory') {
      sceneWrap.classList.add('show-ghost', 'is-cognitive', 'show-anomaly');
    } else {
      var sc = (state.steps[state.current] || {}).scene || {};
      sceneWrap.classList.toggle('show-ghost', !!sc.ghost);
      sceneWrap.classList.toggle('is-cognitive', !!sc.cognitive);
      sceneWrap.classList.toggle('show-anomaly', !!sc.anomaly);
    }

    srcState.classList.toggle('manual', !!state.manualMode);
    srcState.querySelector('b').textContent = state.manualMode ? 'MANUAL' : 'AUTO';
    srcNote.textContent = state.manualMode ? 'operator override' : 'synced to step';
  }

  function renderDockCard(dock) {
    if (!dock) return;
    $('dockTitle').textContent = dock.title;
    var host = $('dockChecks');
    host.innerHTML = dock.checks.map(function (c) {
      return '<span class="check"><i aria-hidden="true"></i>' + c[0] + '<b>' + c[1] + '</b></span>';
    }).join('');
    // Tick the checks in sequence so it reads as a real pre-flight run-up.
    var items = host.querySelectorAll('.check');
    clearTimers(state.seqTimers);
    items.forEach(function (el, i) {
      if (reduce.matches) { el.classList.add('ok'); return; }
      state.seqTimers.push(setTimeout(function () { el.classList.add('ok'); }, 420 + i * 430));
    });
  }

  // Scripted battery-swap subroutine for step 01 / the operator trigger.
  function runSwapSequence() {
    if (reduce.matches) {
      scene.classList.add('dock-open', 'dock-locked');
      return;
    }
    scene.classList.remove('dock-open');
    scene.classList.add('dock-locked');
    state.seqTimers.push(setTimeout(function () { scene.classList.add('dock-open'); }, 700));
    state.seqTimers.push(setTimeout(function () { scene.classList.add('dock-swapping'); }, 2400));
    state.seqTimers.push(setTimeout(function () { scene.classList.remove('dock-swapping'); }, 5200));
    state.seqTimers.push(setTimeout(function () { scene.classList.add('dock-charging'); }, 5700));
    state.seqTimers.push(setTimeout(function () { scene.classList.remove('dock-charging'); }, 8200));
  }

  /* =========================================================
     11. Applying a step
     ========================================================= */
  function applyStep(index, force) {
    var step = state.steps[index];
    if (!step || (index === state.current && !force)) return;

    var changed = index !== state.current;
    state.current = index;
    if (changed) {
      state.manualMode = null;
      clearTimers(state.seqTimers);
      clearTimers(state.eventTimers);
      if (state.event) endEvent(true);
    }

    var h = step.hud;
    hud.dataset.tone = step.tone;
    statusTxt.textContent = h.status;
    stepCount.textContent = 'STEP ' + pad2(index + 1) + '/' + pad2(state.steps.length);
    if (stepName) stepName.textContent = pad2(index + 1) + ' · ' + step.tag;

    hud.classList.remove('flash');
    void hud.offsetWidth;                 // restart the bracket flash
    hud.classList.add('flash');

    markSpine(index);
    if (spine) {
      for (var i = 0; i < spine.children.length; i++) {
        spine.children[i].classList.toggle('is-done', i < index);
        spine.children[i].classList.toggle('is-active', i === index);
      }
    }

    countTo(tele.batt, h.batt, 0);
    countTo(tele.alt, h.alt, 1);
    countTo(tele.spd, h.spd, 1);
    countTo(tele.sat, h.sat, 0);
    tele.battNote.textContent = h.battNote || '';
    if (tele.satNote) tele.satNote.textContent = h.satNote || '';
    tele.spdNote.textContent = h.spdNote || 'm/s';
    tele.spdCell.classList.toggle('hot', !!h.spdNote);
    tele.battCell.classList.toggle('low', h.batt <= 25);
    setChip(tele.aSlot, tele.aLabel, tele.a, h.a);
    setChip(tele.bSlot, tele.bLabel, tele.b, h.b);

    applyScene(step.scene);
    applyModes(h.modes || []);

    renderDockCard(step.dock || {
      title: 'Dock bay · ' + (step.scene.dock ? 'occupied' : 'awaiting return'),
      checks: step.scene.dock
        ? [['Airframe', 'ON PAD'], ['Mechanical lock', '4/4 ENGAGED'],
           ['Charge slot', 'READY'], ['Pad', 'CLEAR'], ['Next window', 'ARMED']]
        : [['Airframe', 'IN FLIGHT'], ['Pad', 'CLEAR AND HELD'],
           ['Charge slot', 'READY'], ['Resume point', 'TRACKING'],
           ['Recovery', 'AVAILABLE ON DEMAND']]
    });
    if (step.alert) {
      $('alertTitle').textContent = step.alert.title;
      $('alertBody').textContent = step.alert.body;
      $('alertResume').textContent = step.alert.resume;
    }
    if (step.scene.contingency) drawDivert();
    if (step.seq === 'swap' && changed) runSwapSequence();

    state.flight.target = step.scene.flightT === 'hold' ? state.flight.hold : (step.scene.flightT || 0);
    if (reduce.matches) state.flight.t = state.flight.target;
    schedule();

    narrative.querySelectorAll('.step').forEach(function (el, i) {
      el.classList.toggle('is-active', i === index);
    });

    if (changed) renderLogs(index);
  }

  // Abort vector: straight line from wherever the aircraft is back to the pad.
  function drawDivert() {
    if (!state.flight.divert) return;
    var p = pointAt(state.flight.t);
    var d = state.flight.dock;
    state.flight.divert.setAttribute('d', 'M' + p.x.toFixed(1) + ',' + p.y.toFixed(1) +
      ' L' + d.x.toFixed(1) + ',' + d.y.toFixed(1));
  }

  /* =========================================================
     12. Operator-triggered contingency events
     ========================================================= */
  // Both triggers run the subroutine all the way through rather than
  // flipping a single state: detect, checkpoint, act, secure, resume.
  // Each phase holds long enough to read and the control strip counts them.
  var EVENTS = {
    battery: {
      button: function () { return ctlBattery; },
      phases: [
        {
          hold: 2800, note: 'reserve breach', tone: 'anomaly',
          status: 'PWR ALERT // STATE OF CHARGE 17%',
          run: function () {
            countTo(tele.batt, 17, 0);
            tele.battNote.textContent = 'RESERVE';
            tele.battCell.classList.add('low');
          },
          logs: [
            { raw: '> Operator trigger: Low Battery Simulation', tone: 'warn' },
            { raw: '> State of Charge 17% is below the 20% reserve threshold', tone: 'bad' }
          ]
        },
        {
          hold: 2800, note: 'checkpoint saved', tone: 'link',
          status: 'RESUME POINT SAVED // RTH COMPUTED',
          logs: [
            { raw: '> Writing 3D coordinates and waypoint index to persistent memory', tone: 'cog' },
            { raw: '> Return path computed · 340 m to Dock Bay · 3.1 min at 1.9% charge', tone: 'cog' }
          ]
        },
        {
          hold: 3800, note: 'return to dock', tone: 'link',
          status: 'PRECISION RETURN TO DOCK BAY',
          run: function () {
            applyScene({ dock: true, flight: true, reticle: true, radar: true, flightT: 0 });
            state.flight.target = 0;
            countTo(tele.alt, 18, 1);
            countTo(tele.spd, 7.2, 1);
            tele.spdNote.textContent = 'RTH';
            tele.spdCell.classList.add('hot');
          },
          logs: [
            { raw: '> Action: Precision return to Dock Bay, obstacle envelope clear', tone: 'warn' },
            { raw: '> Descending to pad · alignment markers acquired', tone: '' }
          ]
        },
        {
          hold: 5600, note: 'tray cycle', tone: 'link',
          status: 'DOCK_BAY // BATTERY_SWAP_CYCLE',
          run: function () {
            applyScene({ dock: true, dockCard: true, dockLocked: true, flightT: 0 });
            countTo(tele.alt, 0, 1);
            countTo(tele.spd, 0, 1);
            tele.spdNote.textContent = 'm/s';
            tele.spdCell.classList.remove('hot');
            renderDockCard({
              title: 'Dock recall · swap subroutine',
              checks: [['Airframe seated', '4/4 LOCKS'], ['Spent pack', 'EJECTED'],
                       ['Fresh pack', 'SEATED AND LATCHED'], ['Cell balance', 'WITHIN 0.02V'],
                       ['Charge', '17% TO 100%']]
            });
            runSwapSequence();
            state.eventTimers.push(setTimeout(function () {
              countTo(tele.batt, 100, 0);
              tele.battNote.textContent = '25.2V 6S';
              tele.battCell.classList.remove('low');
            }, 2600));
          },
          logs: [
            { raw: '> Tray cycle: spent pack ejected, fresh pack seated and latched', tone: 'cog' },
            { raw: '> Battery 100% · 25.2V 6S balanced', tone: 'good' }
          ]
        },
        {
          hold: 3000, note: 'resume armed', tone: 'nominal',
          status: 'AUTONOMOUS RESUME ARMED',
          logs: [
            { raw: '> Mission resumes from the saved waypoint, not from zero', tone: 'good' },
            { raw: '> Total interruption: 4 min 12 s of a 22 min sortie', tone: 'good' }
          ]
        }
      ]
    },

    wind: {
      button: function () { return ctlWind; },
      phases: [
        {
          hold: 2800, note: 'gust detected', tone: 'anomaly',
          status: 'MET ALERT // WIND SHEAR 15.2 M/S',
          run: function () {
            countTo(tele.spd, 15.2, 1);
            tele.spdNote.textContent = 'GUST';
            tele.spdCell.classList.add('hot');
          },
          logs: [
            { raw: '> Operator trigger: High Wind Simulation', tone: 'warn' },
            { raw: '> Event: Localized wind shear spike 15.2 m/s against an 8.0 m/s envelope', tone: 'bad' }
          ]
        },
        {
          hold: 2800, note: 'checkpoint saved', tone: 'link',
          status: 'RESUME POINT SAVED // WAYPOINT LOCKED',
          logs: [
            { raw: '> Writing 3D coordinates and waypoint index to persistent memory', tone: 'cog' },
            { raw: '> Capture buffer flushed to the edge gateway before divert', tone: 'cog' }
          ]
        },
        {
          hold: 4000, note: 'abort vector', tone: 'anomaly',
          status: 'CONTINGENCY_HANDLING // DIVERT TO ALTERNATE LZ',
          run: function () {
            applyScene({
              flight: true, contingency: true, alert: true, reticle: true, flightT: 0
            });
            $('alertTitle').textContent = 'Contingency · wind shear';
            $('alertBody').textContent = 'Localized gust 15.2 m/s exceeds the 8.0 m/s envelope.\nFlying the safe abort vector to the alternate docking LZ.';
            $('alertResume').textContent = 'Resume point locked in persistent memory';
            drawDivert();
            countTo(tele.alt, 30, 1);
            countTo(tele.spd, 9.4, 1);
            tele.spdNote.textContent = 'ABORT';
            state.flight.target = 0;
          },
          logs: [
            { raw: '> Action: Safe abort vector to alternate docking LZ', tone: 'warn' },
            { raw: '> Holding 30.0 m below the shear layer on the run home', tone: '' }
          ]
        },
        {
          hold: 3400, note: 'airframe secured', tone: 'link',
          status: 'ALTERNATE LZ // AIRFRAME SECURED',
          run: function () {
            applyScene({ dock: true, dockCard: true, dockLocked: true, flightT: 0 });
            countTo(tele.alt, 0, 1);
            countTo(tele.spd, 0, 1);
            tele.spdNote.textContent = 'm/s';
            tele.spdCell.classList.remove('hot');
            renderDockCard({
              title: 'Alternate LZ · secured',
              checks: [['Touchdown', 'NOMINAL'], ['Mechanical lock', '4/4 ENGAGED'],
                       ['Captured data', 'SYNCED TO GATEWAY'], ['Resume point', 'HELD'],
                       ['Airframe', 'NO DAMAGE REPORTED']]
            });
          },
          logs: [
            { raw: '> Touchdown nominal · 4/4 locks engaged · no damage reported', tone: 'good' }
          ]
        },
        {
          hold: 3000, note: 'resume available', tone: 'nominal',
          status: 'ENVIRONMENT CLEAR // AUTONOMOUS RESUME AVAILABLE',
          run: function () {
            countTo(tele.spd, 0, 1);
          },
          logs: [
            { raw: '> Micro-weather back inside envelope: 5.9 m/s', tone: 'good' },
            { raw: '> Autonomous resume available · mission restarts at the saved waypoint', tone: 'good' }
          ]
        }
      ]
    }
  };

  function endEvent(silent) {
    if (!state.event) return;
    EVENTS[state.event].button().classList.remove('live');
    state.event = null;
    ctlBattery.disabled = false;
    ctlWind.disabled = false;
    if (ctlHint) ctlHint.textContent = CTL_HINT;
    if (!silent) applyStep(state.current, true);
  }

  function runEvent(type) {
    if (state.event) return;
    var ev = EVENTS[type];
    var total = ev.phases.length;
    state.event = type;
    clearTimers(state.eventTimers);
    clearTimers(state.seqTimers);
    ev.button().classList.add('live');
    ctlBattery.disabled = true;
    ctlWind.disabled = true;

    var at = 0;
    ev.phases.forEach(function (ph, i) {
      state.eventTimers.push(setTimeout(function () {
        hud.dataset.tone = ph.tone;
        statusTxt.textContent = ph.status;
        hud.classList.remove('flash');
        void hud.offsetWidth;
        hud.classList.add('flash');
        if (ctlHint) ctlHint.textContent = 'Phase ' + (i + 1) + ' of ' + total + ' · ' + ph.note;
        if (ph.run) ph.run();
        schedule();
        (ph.logs || []).forEach(function (entry, j) {
          state.eventTimers.push(setTimeout(function () { logLine(entry); }, j * 560));
        });
      }, at));
      at += ph.hold;
    });

    state.eventTimers.push(setTimeout(function () { endEvent(false); }, at + 400));
  }

  /* =========================================================
     13. Rendering a scenario
     ========================================================= */
  function renderNarrative(cfg) {
    narrative.innerHTML = cfg.steps.map(function (step, i) {
      var facts = step.facts.map(function (f) {
        return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>';
      }).join('');

      var extra = '';
      if (step.extra === 'revision') {
        extra =
          '<div class="revision">' +
            '<h3>Belief revision protocol</h3>' +
            '<p class="belief prior"><span>Prior</span><b>' + cfg.revision.prior + '</b></p>' +
            '<p class="belief next"><span>Revised</span><b>' + cfg.revision.next + '</b></p>' +
            '<p class="note">' + cfg.revision.note + '</p>' +
          '</div>';
      } else if (step.extra === 'contingency') {
        extra =
          '<div class="contingency">' +
            '<h3>Failover subroutine</h3>' +
            '<ol>' +
              '<li><b>Detect.</b> Micro-weather crosses the envelope mid-lane.</li>' +
              '<li><b>Checkpoint.</b> 3D coordinates and waypoint index written to persistent memory.</li>' +
              '<li><b>Abort.</b> Safe vector flown to the alternate docking LZ.</li>' +
              '<li><b>Resume.</b> The mission restarts from the saved waypoint, not from zero.</li>' +
            '</ol>' +
          '</div>';
      } else if (step.extra === 'cta') {
        // The HUD card is small and easy to scroll past, so the outcome is
        // repeated at full size in the reading column.
        extra =
          '<div class="outcome">' +
            '<h3>Mission outcome</h3>' +
            '<p class="outcome-head"><b>Work order dispatched</b><span>' + cfg.result.wo + '</span></p>' +
            '<dl class="outcome-metrics">' +
              cfg.result.metrics.map(function (x) {
                return '<div><dt>' + x.l + '</dt><dd>' + x.v + '</dd></div>';
              }).join('') +
            '</dl>' +
          '</div>' +
          '<div class="mission-cta">' +
            '<h2>Run this on your own fleet.</h2>' +
            '<p>Kenwer rides on the drones and docks you already own. We start with one site, one ' +
              'scenario, and the memory builds from the first sortie.</p>' +
            '<div class="cta-row">' +
              '<a class="mbtn" href="https://cal.com/kenwer-drones/30min" target="_blank" rel="noopener">' +
                'Book an enterprise demo <span class="arw" aria-hidden="true">→</span></a>' +
              '<a class="mbtn ghost" href="index.html">Back to the site <span class="arw" aria-hidden="true">→</span></a>' +
            '</div>' +
          '</div>';
      }

      return '<article class="step" data-step="' + (i + 1) + '" data-tone="' + step.tone + '">' +
          '<div class="step-index"><b>' + pad2(i + 1) + '</b><span class="tag">' + step.tag + '</span>' +
            '<span class="rule"></span></div>' +
          '<h2>' + step.title + '</h2>' +
          '<p>' + step.body + '</p>' +
          '<dl class="step-facts">' + facts + '</dl>' +
          extra +
        '</article>';
    }).join('');
  }

  function renderOverlayText(cfg) {
    $('liveTag').textContent = cfg.overlay.liveTag;
    $('liveSub').textContent = cfg.overlay.liveSub;
    $('ghostTag').textContent = cfg.overlay.ghostTag;
    $('ghostSub').textContent = cfg.overlay.ghostSub;

    var m = cfg.memory;
    $('memTitle').textContent = m.title;
    $('memPastK').textContent = m.pastK; $('memPastV').textContent = m.pastV;
    $('memPastBar').style.setProperty('--w', m.pastW);
    $('memNowK').textContent = m.nowK; $('memNowV').textContent = m.nowV;
    $('memNowBar').style.setProperty('--w', m.nowW);
    $('memConfV').textContent = m.confV;
    $('memConfBar').style.setProperty('--w', m.confW);

    $('resultWO').textContent = cfg.result.wo;
    $('resultMetrics').innerHTML = cfg.result.metrics.map(function (x) {
      return '<div><dt>' + x.l + '</dt><dd' + (x.good ? ' class="good"' : '') + '>' + x.v + '</dd></div>';
    }).join('');
  }

  // Short names for the spine. The step tags are written for the narrative
  // column, which is wordier than a rail can carry.
  var SPINE_LABEL = {
    'CONNECT': 'Connect', 'DOCK · DiaB': 'Dock', 'PLAN': 'Plan', 'SORTIE': 'Sortie',
    'EDGE AI': 'Detect', 'COGNITIVE LAYER': 'Revise', 'CONTINGENCY': 'Failover',
    'DISPATCH': 'Dispatch'
  };

  function buildSpine(cfg) {
    if (!spine) return;
    spine.innerHTML = cfg.steps.map(function (st, i) {
      var label = SPINE_LABEL[st.tag] || st.tag;
      return '<button class="spine-step" type="button" data-jump="' + i + '" ' +
               'aria-label="Stage ' + (i + 1) + ': ' + label + '">' +
               '<span class="sp-tick" aria-hidden="true"></span>' +
               '<span class="sp-row"><span class="sp-num">' + pad2(i + 1) + '</span>' +
               '<span class="sp-label">' + label + '</span></span>' +
             '</button>';
    }).join('');
  }

  function markSpine(index) {
    if (!spine) return;
    var items = spine.children;
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-done', i < index);
      items[i].classList.toggle('is-active', i === index);
    }
  }

  function buildHeadingTape() {
    var out = '';
    for (var i = 0; i < 48; i++) {
      var deg = (i * 15) % 360;
      out += '<span>' + (deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : pad3(deg)) + '</span>';
    }
    headingTape.innerHTML = out;
  }
  function pad3(n) { return (n < 100 ? (n < 10 ? '00' : '0') : '') + n; }

  function buildRadarBlips() {
    var out = '';
    for (var i = 0; i <= 7; i++) {
      var p = pointAt(i / 7);
      var dx = (p.x - 640) / 640 * 40, dy = (p.y - 260) / 260 * 40;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > 42) { dx = dx / r * 42; dy = dy / r * 42; }
      out += '<circle class="blip" cx="' + (50 + dx).toFixed(1) + '" cy="' + (50 + dy).toFixed(1) +
             '" r="1.6" opacity="' + (0.35 + 0.45 * (i / 7)).toFixed(2) + '"/>';
    }
    radarBlips.innerHTML = out;
  }

  function loadScenario(key, opts) {
    var cfg = SCENARIOS[key];
    if (!cfg) return;
    state.key = key;
    state.cfg = cfg;
    state.steps = cfg.steps;

    var built = cfg.build();
    var defs = scene.querySelector('defs');
    scene.innerHTML = '';
    if (defs) scene.appendChild(defs);
    scene.insertAdjacentHTML('beforeend', built.svg);
    state.geometry = { anomaly: built.anomaly, ghostOffset: built.ghostOffset };

    var f = state.flight;
    f.path = $('flightPath');
    f.done = $('flightDone');
    f.divert = $('divertPath');
    f.drone = $('drone');
    f.dockLayer = $('dockLayer');
    f.len = f.path.getTotalLength();
    f.done.style.strokeDasharray = f.len;
    f.done.style.strokeDashoffset = f.len;
    f.t = 0; f.target = 0;
    f.hold = solveHold();
    f.dock = pointAt(0);
    f.dockLayer.setAttribute('transform', 'translate(' + f.dock.x.toFixed(1) + ',' + f.dock.y.toFixed(1) + ')');

    buildRadarBlips();
    buildSpine(cfg);
    renderOverlayText(cfg);
    renderNarrative(cfg);
    queuePlace();

    clearTimers(state.logTimers);
    clearTimers(state.seqTimers);
    clearTimers(state.eventTimers);
    state.event = null;
    state.manualMode = null;
    ctlBattery.disabled = false;
    ctlWind.disabled = false;
    ctlBattery.classList.remove('live');
    ctlWind.classList.remove('live');
    termBody.innerHTML = '';
    state.current = -1;
    state.rendered = -1;
    // SVGElement.className is a read-only SVGAnimatedString, so it has to be
    // reset through the attribute. Assigning to it throws under "use strict"
    // and would abort the rest of this function.
    scene.setAttribute('class', 'scene');
    sceneWrap.className = 'scene-wrap';

    observeSteps();
    applyStep(0);

    document.querySelectorAll('.pill[data-scenario]').forEach(function (p) {
      p.setAttribute('aria-pressed', String(p.dataset.scenario === key));
    });

    if (opts && opts.scroll) {
      var first = narrative.querySelector('.step');
      if (first) first.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* =========================================================
     14. Scroll observation
     ========================================================= */
  // A focus line is projected across the viewport and whichever card
  // straddles it is the active step. Intersection ratios were the wrong
  // tool here: a card taller than the observer root can never cross a
  // 0.25/0.5/0.75 threshold, so the ladder silently stops firing and the
  // HUD freezes mid-scroll. Geometry can't dead-zone, reads identically
  // in both directions, and costs one rAF-batched measure per frame.
  // The window is pinned to the top of the viewport at every width now, so
  // the reading position is measured from where it actually ends rather
  // than guessed from a breakpoint.
  var stageEl = document.querySelector('.stage');
  function focusLine() {
    var vh = window.innerHeight;
    if (stageEl) {
      var r = stageEl.getBoundingClientRect();
      if (r.bottom > 0 && r.bottom < vh) return r.bottom + Math.min(140, (vh - r.bottom) * 0.42);
    }
    return vh * 0.5;
  }

  function updateActiveStep() {
    var cards = narrative.querySelectorAll('.step');
    if (!cards.length) return;
    var line = focusLine();
    var best = 0, bestD = Infinity;

    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      // straddling the line wins outright; otherwise take the nearest edge
      var d = (r.top <= line && r.bottom >= line) ? 0
            : Math.min(Math.abs(r.top - line), Math.abs(r.bottom - line));
      if (d < bestD) { bestD = d; best = i; }
    }
    applyStep(best);
  }

  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () { scrollQueued = false; updateActiveStep(); });
  }

  function observeSteps() {
    state.ioNarrow = window.innerWidth <= 992;
    updateActiveStep();
  }

  /* =========================================================
     15. Wiring
     ========================================================= */
  document.querySelectorAll('.pill[data-scenario]').forEach(function (pill) {
    pill.addEventListener('click', function () {
      if (pill.dataset.scenario === state.key) return;
      loadScenario(pill.dataset.scenario, { scroll: true });
      try { history.replaceState(null, '', '?scenario=' + pill.dataset.scenario); } catch (err) { /* file:// */ }
    });
  });

  hud.querySelectorAll('.mode').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var m = btn.dataset.mode;
      state.manualMode = (state.manualMode === m) ? null : m;
      applyModes((state.steps[state.current] || { hud: {} }).hud.modes || []);
    });
  });

  if (spine) {
    spine.addEventListener('click', function (e) {
      var btn = e.target.closest('.spine-step');
      if (!btn) return;
      var card = narrative.querySelector('.step[data-step="' + (+btn.dataset.jump + 1) + '"]');
      if (!card) return;
      // land the card on the reading line rather than at the top of the page,
      // where the pinned window would cover it
      var y = window.scrollY + card.getBoundingClientRect().top - focusLine() + card.offsetHeight / 2;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce.matches ? 'auto' : 'smooth' });
    });
  }

  if (spine) {
    spine.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.spine-step') : null;
      if (!btn) return;
      var card = narrative.querySelectorAll('.step')[parseInt(btn.dataset.jump, 10)];
      if (!card) return;
      var r = card.getBoundingClientRect();
      var top = window.pageYOffset + r.top + r.height / 2 - focusLine();
      window.scrollTo({ top: Math.max(0, top), behavior: reduce.matches ? 'auto' : 'smooth' });
    });
  }

  if (logFilter) {
    logFilter.addEventListener('click', function () {
      state.logFilter = state.logFilter === 'step' ? 'all' : 'step';
      logFilter.setAttribute('aria-pressed', String(state.logFilter === 'step'));
      logFilter.textContent = state.logFilter === 'step' ? 'This step' : 'All steps';
      rebuildLogs(Math.max(0, state.current));
    });
  }

  termBody.addEventListener('scroll', function () {
    state.stick = termBody.scrollHeight - termBody.scrollTop - termBody.clientHeight < 26;
  }, { passive: true });

  /* ---- drag to resize the rail and the log panel ---- */
  function dragHandle(handle, axis, onMove, onKey) {
    if (!handle) return;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      handle.classList.add('dragging');
      document.body.classList.add('rsz-active');
      if (axis === 'y') document.body.classList.add('rsz-y-active');

      function mv(ev) { onMove(ev); queuePlace(); }
      function up(ev) {
        try { handle.releasePointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
        handle.classList.remove('dragging');
        document.body.classList.remove('rsz-active', 'rsz-y-active');
        handle.removeEventListener('pointermove', mv);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      }
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', function (e) {
      var d = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -24
            : (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 24 : 0;
      if (!d) return;
      e.preventDefault();
      onKey(d);
      queuePlace();
    });
  }

  function store(k, v) { try { localStorage.setItem(k, v); } catch (err) { /* private mode */ } }

  function setRail(px) {
    if (!hudBody) return;
    var r = hudBody.getBoundingClientRect();
    var w = Math.max(240, Math.min(r.width * 0.55, px));
    hudBody.style.setProperty('--rail-w', Math.round(w) + 'px');
    store('kw-rail-w', Math.round(w));
  }

  function setLog(px) {
    if (!hudRail) return;
    var r = hudRail.getBoundingClientRect();
    var h = Math.max(90, Math.min(r.height - 110, px));
    hudRail.style.setProperty('--log-h', Math.round(h) + 'px');
    store('kw-log-h', Math.round(h));
  }

  dragHandle($('rszRail'), 'x',
    function (ev) { setRail(hudBody.getBoundingClientRect().right - ev.clientX); },
    function (d) { setRail(hudRail.getBoundingClientRect().width - d); });

  dragHandle($('rszLog'), 'y',
    function (ev) { setLog(ev.clientY - hudRail.getBoundingClientRect().top); },
    function (d) { setLog(hudRail.querySelector('.panel-log').getBoundingClientRect().height + d); });

  // restore whatever sizes the reader last chose
  try {
    if (window.innerWidth > 1100) {
      var rw = localStorage.getItem('kw-rail-w');
      var lh = localStorage.getItem('kw-log-h');
      if (rw && hudBody) hudBody.style.setProperty('--rail-w', rw + 'px');
      if (lh && hudRail) hudRail.style.setProperty('--log-h', lh + 'px');
    }
  } catch (err) { /* storage blocked */ }

  ctlBattery.addEventListener('click', function () { runEvent('battery'); });
  ctlWind.addEventListener('click', function () { runEvent('wind'); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      state.visible = entries[0].isIntersecting && !document.hidden;
      if (state.visible) { state.last = 0; schedule(); }
    }, { threshold: 0 }).observe(hud);
  }
  document.addEventListener('visibilitychange', function () {
    state.visible = !document.hidden;
    if (state.visible) { state.last = 0; schedule(); }
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    queuePlace();
    onScroll();
  });

  if ('ResizeObserver' in window) new ResizeObserver(queuePlace).observe(sceneWrap);

  /* =========================================================
     16. Boot
     ========================================================= */
  buildHeadingTape();

  var start = 'solar';
  try {
    var q = new URLSearchParams(location.search).get('scenario');
    if (q && SCENARIOS[q]) start = q;
  } catch (err) { /* older browser, default scenario */ }

  loadScenario(start);
  window.addEventListener('load', queuePlace);
})();
