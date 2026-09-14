/* ============================================================
   Kenwer, Mission Simulator
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

  // Docking pad, drawn around the origin and translated onto the
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

  var Scene = window.KenwerScene;

  /* =========================================================
     3. Scenario dictionary: 8-step mission lifecycle
     ========================================================= */

  var SCENARIOS = {

    /* ---------------- SOLAR (primary showcase) ---------------- */
    solar: {
      label: 'Solar Farm',
      objective: 'Find the failing string',
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
                + 'before anything is allowed to arm. Your pilots keep the controls; the fleet gains a memory.',
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
          tag: 'DOCK', tone: 'link',
          title: 'Docking station and <mark>system reset</mark>',
          body: 'The pad is where a sortie starts and ends. The moment Kenwer confirms the aircraft is back on it, or has landed anywhere else, it <strong>resets the mission state</strong> so the next flight begins from a known-clean baseline. The pilot in command keeps the controls throughout; what Kenwer removes is the bookkeeping, not the pilot.',
          facts: [['Dock', 'Bay 01'], ['Reset', 'On confirmed landing'], ['Airframe', 'DJI M350 RTK']],
          hud: {
            status: 'DOCK_BAY_01 // SYSTEM RESET',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 24, satNote: 'RTK FIXED',
            a: { l: 'Reset', v: 'COMPLETE' }, b: { l: 'Self-test', v: 'PASS' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          dock: {
            title: 'Dock Bay 01 · pre-flight',
            checks: [['Landing state', 'CONFIRMED ON PAD'], ['Mission state', 'CLEARED'],
                     ['Pack voltage', '25.2V BALANCED'], ['Encrypted link', 'AES-256 OK'],
                     ['IMU / compass', 'SELF-TEST PASS']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 01 handshake · airframe seated on the pad, 4/4 locks engaged' },
            { t: '00:00:03', k: 'CORE', m: 'Landing confirmed · mission state cleared for the next sortie' },
            { t: '00:00:05', k: 'SEC', m: 'Encrypted link verified · AES-256 session key rotated', tone: 'good' },
            { t: '00:00:09', k: 'PWR', m: 'Pack 25.2V BALANCED · endurance checked against the planned lane', tone: 'good' },
            { t: '00:00:12', k: 'PRE', m: 'Self-test PASS · IMU, compass, ESC, payload bus', tone: 'good' },
            { t: '00:00:14', k: 'CREW', m: 'Pilot in command holds the controls · ready to launch', tone: 'good' }
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
          title: 'Automatic takeoff and <mark>dual-sensor cruise</mark>',
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
            { raw: '> Resume available to the pilot upon environmental clearance', tone: 'good' }
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
      objective: 'Find the blade defect',
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
                + 'before anything is allowed to arm. Your pilots keep the controls; the fleet gains a memory.',
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
          tag: 'DOCK', tone: 'link',
          title: 'Docking station and <mark>system reset</mark>',
          body: 'The pad sits at the turbine base. The moment Kenwer confirms the aircraft is back on it, or has landed anywhere else, it <strong>resets the mission state</strong> so the next flight begins from a known-clean baseline. Rotor lock and yaw are registered here too, and the pilot in command keeps the controls throughout.',
          facts: [['Dock', 'Bay 04 · tower base'], ['Reset', 'On confirmed landing'], ['Airframe', 'DJI M300 RTK']],
          hud: {
            status: 'DOCK_BAY_04 // SYSTEM RESET',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 22, satNote: 'RTK FIXED',
            a: { l: 'Reset', v: 'COMPLETE' }, b: { l: 'Self-test', v: 'PASS' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          dock: {
            title: 'Dock Bay 04 · pre-flight',
            checks: [['Landing state', 'CONFIRMED ON PAD'], ['Mission state', 'CLEARED'],
                     ['Pack voltage', '25.2V BALANCED'], ['Encrypted link', 'AES-256 OK'],
                     ['IMU / compass', 'SELF-TEST PASS']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 04 handshake · airframe seated at the tower base, 4/4 locks engaged' },
            { t: '00:00:03', k: 'CORE', m: 'Landing confirmed · mission state cleared for the next sortie' },
            { t: '00:00:05', k: 'SEC', m: 'Encrypted link verified · AES-256 session key rotated', tone: 'good' },
            { t: '00:00:09', k: 'PWR', m: 'Pack 25.2V BALANCED · endurance checked against the planned lane', tone: 'good' },
            { t: '00:00:12', k: 'PRE', m: 'Self-test PASS · IMU, compass, ESC, payload bus', tone: 'good' },
            { t: '00:00:14', k: 'CREW', m: 'Pilot in command holds the controls · ready to launch', tone: 'good' }
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
          title: 'Automatic takeoff and <mark>blade sweep</mark>',
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
            { raw: '> Resume available to the pilot upon environmental clearance', tone: 'good' }
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
      objective: 'Find the hot splice',
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
                + 'before anything is allowed to arm. Your pilots keep the controls; the fleet gains a memory.',
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
          tag: 'DOCK', tone: 'link',
          title: 'Docking station and <mark>system reset</mark>',
          body: 'The corridor pad is where a sortie starts and ends. The moment Kenwer confirms the aircraft is back on it, or has landed anywhere else, it <strong>resets the mission state</strong> so the next flight begins from a known-clean baseline. The pilot in command keeps the controls throughout, with the BVLOS waiver logged against the flight.',
          facts: [['Dock', 'Bay 07 · corridor pad'], ['Reset', 'On confirmed landing'], ['Airframe', 'Autel EVO Max 4T']],
          hud: {
            status: 'DOCK_BAY_07 // SYSTEM RESET',
            batt: 100, battNote: '25.2V 6S', alt: 0, spd: 0, sat: 26, satNote: 'RTK FIXED',
            a: { l: 'Reset', v: 'COMPLETE' }, b: { l: 'Self-test', v: 'PASS' }, modes: ['rgb']
          },
          scene: { dock: true, dockCard: true, dockLocked: true, flightT: 0 },
          dock: {
            title: 'Dock Bay 07 · pre-flight',
            checks: [['Landing state', 'CONFIRMED ON PAD'], ['Mission state', 'CLEARED'],
                     ['Pack voltage', '25.2V BALANCED'], ['Encrypted link', 'AES-256 OK'],
                     ['IMU / compass', 'SELF-TEST PASS']]
          },
          logs: [
            { t: '00:00:01', k: 'DOCK', m: 'Bay 07 handshake · airframe seated on the corridor pad, 4/4 locks engaged' },
            { t: '00:00:03', k: 'CORE', m: 'Landing confirmed · mission state cleared for the next sortie' },
            { t: '00:00:05', k: 'SEC', m: 'Encrypted link verified · AES-256 session key rotated', tone: 'good' },
            { t: '00:00:09', k: 'PWR', m: 'Pack 25.2V BALANCED · endurance checked against the planned lane', tone: 'good' },
            { t: '00:00:12', k: 'PRE', m: 'Self-test PASS · IMU, compass, ESC, payload bus', tone: 'good' },
            { t: '00:00:14', k: 'CREW', m: 'Pilot in command holds the controls · ready to launch', tone: 'good' }
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
          title: 'Automatic takeoff and <mark>corridor run</mark>',
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
            { raw: '> Resume available to the pilot upon environmental clearance', tone: 'good' }
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
  var hudObjective = $('hudObjective');
  var spine = $('spine');
  var logFilter = $('logFilter');
  var logAlerts = $('logAlerts');
  var logReplay = $('logReplay');
  var logCopy = $('logCopy');
  var logPaused = $('logPaused');
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
    queue: [],              // pending log reveals, so hovering can hold them
    pumpTimer: 0,
    paused: false,
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

  // Reveals run through a queue driven one item at a time. A plain chain of
  // timeouts cannot be held; this can, which is what lets hovering pause it.
  function pumpQueue() {
    if (state.pumpTimer || state.paused || !state.queue.length) return;
    var item = state.queue.shift();
    state.pumpTimer = setTimeout(function () {
      state.pumpTimer = 0;
      item.fn();
      pumpQueue();
    }, item.gap);
  }

  function enqueue(fn, gap) {
    state.queue.push({ fn: fn, gap: reduce.matches ? 0 : gap });
    pumpQueue();
  }

  function clearQueue() {
    state.queue.length = 0;
    if (state.pumpTimer) { clearTimeout(state.pumpTimer); state.pumpTimer = 0; }
  }

  function setPaused(on) {
    if (state.paused === on) return;
    state.paused = on;
    if (logPaused) logPaused.hidden = !on || !state.queue.length;
    if (!on) pumpQueue();
  }

  function rebuildLogs(target) {
    clearTimers(state.logTimers);
    clearQueue();
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
    clearQueue();
    if (state.logFilter === 'step' || target <= state.rendered) {
      rebuildLogs(target);
      return;
    }

    for (var st = state.rendered + 1; st <= target; st++) {
      (function (si) {
        enqueue(function () { logGroupHeader(si); }, 220);
        state.steps[si].logs.forEach(function (entry) {
          enqueue(function () { logLine(entry, si); }, 420);
        });
      })(st);
    }
    enqueue(function () { updateClock(target); if (logPaused) logPaused.hidden = true; }, 120);
    state.rendered = target;
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

  function applyBox(el, b) {
    if (!b) { el.style.opacity = '0'; return; }
    el.style.removeProperty('opacity');
    el.style.left = b.x.toFixed(1) + 'px';
    el.style.top = b.y.toFixed(1) + 'px';
    el.style.width = Math.max(8, b.w).toFixed(1) + 'px';
    el.style.height = Math.max(8, b.h).toFixed(1) + 'px';
  }

  // The renderer knows where the defect is on screen for the current shot,
  // so the callouts stay pinned to it while the camera moves.
  function placeOverlays() {
    var live = Scene.anomalyBox();
    var ghost = Scene.ghostBox();
    applyBox(anomLive, live);
    applyBox(anomGhost, ghost);
    if (live && ghost) {
      var l = memoryLink.firstElementChild;
      l.setAttribute('x1', (ghost.x + ghost.w / 2).toFixed(1));
      l.setAttribute('y1', (ghost.y + ghost.h / 2).toFixed(1));
      l.setAttribute('x2', (live.x + live.w / 2).toFixed(1));
      l.setAttribute('y2', (live.y + live.h / 2).toFixed(1));
    }
  }

  /* =========================================================
     9. Flight loop: one rAF drives every continuous motion
     ========================================================= */
  function tick(now) {
    state.raf = 0;
    // Motion and the aircraft are the renderer's job now. This loop only
    // keeps the heading tape and artificial horizon in step with it.
    if (!reduce.matches && sceneWrap.classList.contains('show-horizon')) {
      var t = Scene.at();
      state.headingShown = (state.headingShown + 0.6) % 360;
      headingTape.style.transform = 'translateX(' + (-state.headingShown * 0.52).toFixed(1) + 'px)';
      var roll = Math.sin(now / 2400) * 4;
      var pitch = Math.sin(now / 2100) * 3 - (t > 0.02 && t < 0.98 ? 3 : 0);
      horizonBall.style.transform = 'rotate(' + roll.toFixed(2) + 'deg) translateY(' + pitch.toFixed(2) + 'px)';
    }
    if (state.visible) schedule();
  }

  function schedule() {
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }

  // The camera moves between shots, so the callouts are re-pinned every
  // frame rather than only on resize.
  (function follow() {
    placeOverlays();
    requestAnimationFrame(follow);
  })();

  /* =========================================================
     10. Scene flags
     ========================================================= */
  function applyScene(sc) {
    Scene.flags(sc);
    Scene.target(sc.flightT === 'hold' ? 'hold' : (sc.flightT || 0));

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

    Scene.shot(index);
    schedule();

    narrative.querySelectorAll('.step').forEach(function (el, i) {
      el.classList.toggle('is-active', i === index);
    });

    if (changed) renderLogs(index);
  }

  function drawDivert() { /* the renderer draws the abort vector */ }

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
          hold: 3200, note: 'launch', tone: 'nominal',
          status: 'LAUNCH // AUTO TAKEOFF',
          run: function () {
            applyScene({ dock: true, dockOpen: true, flight: true, capture: true,
                         reticle: true, horizon: true, radar: true, flightT: 0.42 });
            countTo(tele.batt, 34, 0);
            countTo(tele.alt, 45.2, 1);
            countTo(tele.spd, 6.5, 1);
            tele.spdNote.textContent = 'm/s';
            tele.spdCell.classList.remove('hot');
          },
          logs: [
            { raw: '> Operator trigger: Low Battery Simulation', tone: 'warn' },
            { raw: '> Auto takeoff executed, pilot in command, resuming the survey lane', tone: '' }
          ]
        },
        {
          hold: 2800, note: 'reserve breach', tone: 'anomaly',
          status: 'PWR ALERT // STATE OF CHARGE 17%',
          run: function () {
            countTo(tele.batt, 17, 0);
            tele.battNote.textContent = 'RESERVE';
            tele.battCell.classList.add('low');
          },
          logs: [
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
            { raw: '> Action: Return to Dock Bay recommended, obstacle envelope clear', tone: 'warn' },
            { raw: '> Descending to pad · alignment markers acquired', tone: '' }
          ]
        },
        {
          hold: 5600, note: 'landing and reset', tone: 'link',
          status: 'DOCK_BAY // LANDED, SYSTEM RESET',
          run: function () {
            applyScene({ dock: true, dockCard: true, dockLocked: true, flightT: 0 });
            countTo(tele.alt, 0, 1);
            countTo(tele.spd, 0, 1);
            tele.spdNote.textContent = 'm/s';
            tele.spdCell.classList.remove('hot');
            renderDockCard({
              title: 'Recovered · system reset',
              checks: [['Landing state', 'CONFIRMED ON PAD'], ['Airframe seated', '4/4 LOCKS'],
                       ['Resume point', 'HELD IN MEMORY'], ['Mission state', 'RESET'],
                       ['Next launch', 'AWAITING PILOT']]
            });
            state.eventTimers.push(setTimeout(function () {
              countTo(tele.batt, 100, 0);
              tele.battNote.textContent = '25.2V 6S';
              tele.battCell.classList.remove('low');
            }, 2600));
          },
          logs: [
            { raw: '> Touchdown confirmed on the pad, mission state reset', tone: 'cog' },
            { raw: '> Fresh pack fitted by the crew · 100% · 25.2V 6S balanced', tone: 'good' }
          ]
        },
        {
          hold: 3000, note: 'resume armed', tone: 'nominal',
          status: 'RESUME ARMED // AWAITING PILOT',
          logs: [
            { raw: '> Pilot relaunches from the saved waypoint, not from zero', tone: 'good' },
            { raw: '> Total interruption: 4 min 12 s of a 22 min sortie', tone: 'good' }
          ]
        }
      ]
    },

    wind: {
      button: function () { return ctlWind; },
      phases: [
        {
          hold: 3200, note: 'on the lane', tone: 'nominal',
          status: 'IN_TRANSIT // SURVEY LANE',
          run: function () {
            applyScene({ dock: true, dockOpen: true, flight: true, capture: true,
                         reticle: true, horizon: true, radar: true, flightT: 0.5 });
            countTo(tele.alt, 45.2, 1);
            countTo(tele.spd, 6.5, 1);
            tele.spdNote.textContent = 'm/s';
            tele.spdCell.classList.remove('hot');
          },
          logs: [
            { raw: '> Operator trigger: High Wind Simulation', tone: 'warn' },
            { raw: '> Airframe on the survey lane, micro-weather nominal at 5.4 m/s', tone: '' }
          ]
        },
        {
          hold: 3400, note: 'gust hits', tone: 'anomaly',
          status: 'MET ALERT // WIND SHEAR 15.2 M/S',
          run: function () {
            applyScene({ dock: true, dockOpen: true, flight: true, gust: true,
                         reticle: true, horizon: true, radar: true, flightT: 0.5 });
            countTo(tele.spd, 15.2, 1);
            tele.spdNote.textContent = 'GUST';
            tele.spdCell.classList.add('hot');
          },
          logs: [
            { raw: '> Event: Localized wind shear spike 15.2 m/s against an 8.0 m/s envelope', tone: 'bad' },
            { raw: '> Attitude hold degraded, drift 26 cm, capture suspended', tone: 'bad' }
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
              flight: true, contingency: true, alert: true, gust: true,
              reticle: true, dock: true, flightT: 0
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
          status: 'ENVIRONMENT CLEAR // RESUME AVAILABLE',
          run: function () {
            countTo(tele.spd, 0, 1);
          },
          logs: [
            { raw: '> Micro-weather back inside envelope: 5.9 m/s', tone: 'good' },
            { raw: '> Resume available · the pilot restarts at the saved waypoint', tone: 'good' }
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
    // pull back so the recovery is visible rather than happening off frame
    Scene.wideShot();

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
    'CONNECT': 'Connect', 'DOCK': 'Dock', 'PLAN': 'Plan', 'SORTIE': 'Sortie',
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

  // Sweep blips laid out around the ring; the radar reads as an instrument
  // rather than a survey of the exact route.
  function buildRadarBlips() {
    var out = '';
    for (var i = 0; i < 7; i++) {
      var ang = (i / 7) * Math.PI * 2 + 0.4;
      var rad = 16 + noiseAt(i) * 24;
      out += '<circle class="blip" cx="' + (50 + Math.cos(ang) * rad).toFixed(1) +
             '" cy="' + (50 + Math.sin(ang) * rad).toFixed(1) +
             '" r="1.6" opacity="' + (0.3 + 0.4 * (i / 7)).toFixed(2) + '"/>';
    }
    radarBlips.innerHTML = out;
  }

  function noiseAt(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function loadScenario(key, opts) {
    var cfg = SCENARIOS[key];
    if (!cfg) return;
    state.key = key;
    state.cfg = cfg;
    state.steps = cfg.steps;

    Scene.load(key);

    if (hudObjective) hudObjective.textContent = cfg.objective || '';
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
    sceneWrap.className = 'scene-wrap';

    // Switching scenario starts the new mission from the top. The scroll has
    // to happen before the observer runs, and instantly rather than smoothly:
    // easing up from step 6 would drag the reader back through every step in
    // between, flashing each one's logs on the way past. scrollIntoView is
    // wrong here too, since 'start' parks the card behind the sticky window
    // and the focus line then picks a later step.
    if (opts && opts.scroll) {
      var first = narrative.querySelector('.step');
      if (first) {
        // Settle onto step one rather than guessing at it. focusLine() is
        // measured from the sticky window, and scrolling moves that window,
        // so the target shifts underneath a single calculation. Iterating on
        // the remaining error converges in two or three passes; a fixed
        // number of blind jumps was landing between steps 2 and 3.
        for (var pass = 0; pass < 8; pass++) {
          var r = first.getBoundingClientRect();
          var delta = (r.top + r.height / 2) - focusLine();
          if (Math.abs(delta) < 2) break;
          var to = Math.max(0, window.pageYOffset + delta);
          if (Math.abs(to - window.pageYOffset) < 1) break;
          window.scrollTo(0, to);
        }
      }
    }

    observeSteps();
    applyStep(0);
    // scrollTo above queues a scroll event; run the detector now so it agrees
    // with the position rather than fighting it on the next frame
    updateActiveStep();

    document.querySelectorAll('.pill[data-scenario]').forEach(function (p) {
      p.setAttribute('aria-pressed', String(p.dataset.scenario === key));
    });
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
      stopPlay(false);
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

  function jumpToStep(i) {
    var card = narrative.querySelectorAll('.step')[i];
    if (!card) return;
    var r = card.getBoundingClientRect();
    var top = window.pageYOffset + r.top + r.height / 2 - focusLine();
    window.scrollTo({ top: Math.max(0, top), behavior: reduce.matches ? 'auto' : 'smooth' });
  }

  if (spine) {
    spine.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.spine-step') : null;
      if (btn) jumpToStep(parseInt(btn.dataset.jump, 10));
    });
  }

  // every log line carries its step, so clicking one takes you to it
  termBody.addEventListener('click', function (e) {
    var line = e.target.closest ? e.target.closest('.tl') : null;
    if (!line || !line.dataset.step) return;
    jumpToStep(parseInt(line.dataset.step, 10));
  });

  // hold the reveal while someone is reading
  termBody.addEventListener('pointerenter', function () { setPaused(true); });
  termBody.addEventListener('pointerleave', function () { setPaused(false); });
  termBody.addEventListener('focusin', function () { setPaused(true); });
  termBody.addEventListener('focusout', function () { setPaused(false); });

  if (logAlerts) {
    logAlerts.addEventListener('click', function () {
      var on = termBody.classList.toggle('only-alerts');
      logAlerts.setAttribute('aria-pressed', String(on));
    });
  }

  if (logReplay) {
    logReplay.addEventListener('click', function () {
      var i = Math.max(0, state.current);
      clearQueue();
      clearTimers(state.logTimers);
      clearTimers(state.seqTimers);
      // drop this step's lines, then let applyStep lay them down again
      Array.prototype.slice.call(termBody.children).forEach(function (el) {
        if (el.dataset.step === String(i)) termBody.removeChild(el);
      });
      state.rendered = i - 1;
      state.current = -1;                     // force the full re-apply
      state.stick = true;
      applyStep(i);
    });
  }

  if (logCopy) {
    logCopy.addEventListener('click', function () {
      var text = Array.prototype.slice.call(termBody.children)
        .filter(function (el) { return el.offsetParent !== null || !el.offsetParent; })
        .filter(function (el) { return getComputedStyle(el).display !== 'none'; })
        .map(function (el) { return el.textContent; })
        .join('\n');
      function done() {
        logCopy.classList.add('done');
        logCopy.textContent = 'Copied';
        setTimeout(function () {
          logCopy.classList.remove('done');
          logCopy.textContent = 'Copy';
        }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* blocked */ }
        document.body.removeChild(ta);
      }
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

  /* ---------------------------------------------------------
     Autoplay. Rather than jumping between steps, the page is
     scrolled at a slow constant rate and the existing scroll
     machinery does the rest, so a played mission and a scrolled
     one are the same thing. Any manual input hands control back.
     --------------------------------------------------------- */
  var ctlPlay = $('ctlPlay');
  var ctlPlayLabel = $('ctlPlayLabel');
  var play = { on: false, raf: 0, last: 0, carry: 0 };
  var PLAY_PXS = 30;                      // pixels per second

  function playEnd() {
    var last = narrative.querySelectorAll('.step');
    if (!last.length) return 0;
    var el = last[last.length - 1];
    return window.pageYOffset + el.getBoundingClientRect().bottom - window.innerHeight + 40;
  }

  function stopPlay(done) {
    if (!play.on) return;
    play.on = false;
    if (play.raf) { cancelAnimationFrame(play.raf); play.raf = 0; }
    if (ctlPlay) ctlPlay.setAttribute('aria-pressed', 'false');
    if (ctlPlayLabel) ctlPlayLabel.textContent = done ? 'Replay mission' : 'Play mission';
  }

  function playTick(now) {
    if (!play.on) return;
    var dt = Math.min(64, now - (play.last || now));
    play.last = now;

    play.carry += PLAY_PXS * (dt / 1000);
    var whole = Math.floor(play.carry);
    if (whole >= 1) {
      play.carry -= whole;
      play.ignore = true;                 // our own scroll, not the reader's
      window.scrollBy(0, whole);
      play.ignore = false;
    }
    if (window.pageYOffset >= playEnd() - 2) { stopPlay(true); return; }
    play.raf = requestAnimationFrame(playTick);
  }

  function startPlay() {
    if (play.on) return;
    // begin at the first step so a played mission always runs start to finish
    var first = narrative.querySelector('.step');
    if (first) {
      var r = first.getBoundingClientRect();
      var top = window.pageYOffset + r.top + r.height / 2 - focusLine();
      if (window.pageYOffset > top + 40 || window.pageYOffset < top - 40) {
        window.scrollTo({ top: Math.max(0, top), behavior: reduce.matches ? 'auto' : 'smooth' });
      }
    }
    play.on = true;
    play.last = 0;
    play.carry = 0;
    if (ctlPlay) ctlPlay.setAttribute('aria-pressed', 'true');
    if (ctlPlayLabel) ctlPlayLabel.textContent = 'Pause';
    play.raf = requestAnimationFrame(function (t) {
      // let the smooth scroll to the first step settle before taking over
      setTimeout(function () { play.last = 0; play.raf = requestAnimationFrame(playTick); }, 700);
    });
  }

  if (ctlPlay) {
    ctlPlay.addEventListener('click', function () {
      if (play.on) stopPlay(false); else startPlay();
    });
  }

  // Any deliberate scrolling from the reader takes the wheel back, but
  // working the HUD does not: pressing Play, orbiting the scene or reading
  // the log should not cancel the run.
  function insideHud(t) { return !!(t && t.closest && t.closest('.hud')); }
  ['wheel', 'touchstart', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      if (!insideHud(e.target)) stopPlay(false);
    }, { passive: true });
  });
  window.addEventListener('keydown', function (e) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].indexOf(e.key) >= 0) stopPlay(false);
  });

  var ctlReset = $('ctlReset');
  if (ctlReset) ctlReset.addEventListener('click', function () { Scene.resetView(); });

  ctlBattery.addEventListener('click', function () { runEvent('battery'); });
  ctlWind.addEventListener('click', function () { runEvent('wind'); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      state.visible = entries[0].isIntersecting && !document.hidden;
      Scene.setVisible(state.visible);
      if (state.visible) { state.last = 0; schedule(); }
    }, { threshold: 0 }).observe(hud);
  }
  document.addEventListener('visibilitychange', function () {
    state.visible = !document.hidden;
    Scene.setVisible(state.visible);
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
  Scene.mount(scene);
  buildHeadingTape();

  var start = 'solar';
  try {
    var q = new URLSearchParams(location.search).get('scenario');
    if (q && SCENARIOS[q]) start = q;
  } catch (err) { /* older browser, default scenario */ }

  loadScenario(start);
  window.addEventListener('load', queuePlace);
})();
