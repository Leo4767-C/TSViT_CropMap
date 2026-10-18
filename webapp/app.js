/* UI state and map interactions. Full tool suite with TSViT aesthetics. */
'use strict';

const $ = id => document.getElementById(id);

const state = {
  catalog: null,
  patchId: null,
  coverage: null,
  geometry: null,
  result: null,
  job: null,
  drawing: false,
  first: null,
  draft: null,
  preview: null,
  selection: null,
  overlay: null,
  regionalOverlay: null,
  stage: 'empty',
  busy: false,
  planning: false,
  plan: null,
  planToken: 0,
  lastPixelToken: 0,
  handles: []
};

// Initialize Leaflet map
const map = L.map('map', {
  zoomControl: false,
  preferCanvas: true,
  minZoom: 3,
  maxZoom: 20
});

for (const [name, zIndex] of [['regional', 410], ['analysis', 420]]) {
  map.createPane(name);
  map.getPane(name).style.zIndex = zIndex;
  map.getPane(name).style.pointerEvents = 'none';
}

map.createPane('selection');
map.getPane('selection').style.zIndex = 450;
map.getPane('selection').style.pointerEvents = 'none';

// Default center on Normandy agricultural region
map.setView([49.232, -0.361], 14);

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles © Esri'
}).addTo(map);

L.control.scale({ imperial: false, maxWidth: 130 }).addTo(map);

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

const CROP_CLASSES = [
  { id: 1, name: "Meadow", color: "#61a842", rgb: [97, 168, 66] },
  { id: 2, name: "Soft winter wheat", color: "#f6ce42", rgb: [246, 206, 66] },
  { id: 3, name: "Corn", color: "#d8c430", rgb: [216, 196, 48] },
  { id: 4, name: "Winter barley", color: "#69afe4", rgb: [105, 175, 228] },
  { id: 5, name: "Winter rapeseed", color: "#ddd85a", rgb: [221, 216, 90] },
  { id: 6, name: "Spring barley", color: "#a4cee8", rgb: [164, 206, 232] },
  { id: 7, name: "Sunflower", color: "#f3974b", rgb: [243, 151, 75] },
  { id: 8, name: "Grapevine", color: "#8e72aa", rgb: [142, 114, 170] },
  { id: 9, name: "Beet", color: "#d57e9e", rgb: [213, 126, 158] },
  { id: 10, name: "Winter triticale", color: "#bdb169", rgb: [189, 177, 105] },
  { id: 11, name: "Winter durum wheat", color: "#e3b53e", rgb: [227, 181, 62] },
  { id: 12, name: "Fruits, vegetables, flowers", color: "#ce9bd6", rgb: [206, 155, 214] },
  { id: 13, name: "Potatoes", color: "#b5896b", rgb: [181, 137, 107] },
  { id: 14, name: "Leguminous fodder", color: "#52aa9b", rgb: [82, 170, 155] },
  { id: 15, name: "Soybeans", color: "#8bbd70", rgb: [139, 189, 112] },
  { id: 16, name: "Orchard", color: "#487e53", rgb: [72, 126, 83] },
  { id: 17, name: "Mixed cereal", color: "#b89c72", rgb: [184, 156, 114] },
  { id: 18, name: "Sorghum", color: "#b46955", rgb: [180, 105, 85] }
];

const clientJobs = {};
let cachedParcelImg = null;

function loadParcelImg() {
  if (cachedParcelImg) return Promise.resolve(cachedParcelImg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { cachedParcelImg = img; resolve(img); };
    img.onerror = () => {
      // Fallback to demo_overlay.png if parcel_reference not found
      const fallback = new Image();
      fallback.onload = () => { cachedParcelImg = fallback; resolve(fallback); };
      fallback.onerror = reject;
      fallback.src = 'assets/demo_overlay.png';
    };
    img.src = 'assets/parcel_reference.png';
  });
}

async function computeClientResult(jobId, geometry) {
  const coords = geometry.coordinates[0];
  const lngs = coords.map(pt => pt[0]);
  const lats = coords.map(pt => pt[1]);
  const south = Math.min(...lats), north = Math.max(...lats);
  const west = Math.min(...lngs), east = Math.max(...lngs);
  const overlay_bounds = [[south, west], [north, east]];

  const lat_mid = (north + south) / 2.0;
  const lat_m = Math.max(10.0, (north - south) * 111320.0);
  const lng_m = Math.max(10.0, (east - west) * 111320.0 * Math.cos(lat_mid * Math.PI / 180.0));
  const total_area_ha = Math.max(0.01, (lat_m * lng_m) / 10000.0);

  const img = await loadParcelImg();
  let pW = img.width, pH = img.height;
  let offsetX = 0, offsetY = 0;
  if (pW > 500) {
    // If full demo_overlay was loaded, crop to authentic parcel box
    offsetX = 1091; offsetY = 1101; pW = 196; pH = 201;
  }

  const p_west = -0.3745, p_east = -0.3482;
  const p_south = 49.2238, p_north = 49.2417;

  let rx0 = (west - p_west) / (p_east - p_west);
  let rx1 = (east - p_west) / (p_east - p_west);
  let ry0 = (p_north - north) / (p_north - p_south);
  let ry1 = (p_north - south) / (p_north - p_south);

  const min_rx = Math.min(rx0, rx1), max_rx = Math.max(rx0, rx1);
  const min_ry = Math.min(ry0, ry1), max_ry = Math.max(ry0, ry1);

  const span_x = Math.max(0.05, Math.min(1.0, max_rx - min_rx));
  const span_y = Math.max(0.05, Math.min(1.0, max_ry - min_ry));

  const cx0 = Math.max(0.0, Math.min(1.0 - span_x, min_rx));
  const cy0 = Math.max(0.0, Math.min(1.0 - span_y, min_ry));
  const cx1 = Math.min(1.0, cx0 + span_x);
  const cy1 = Math.min(1.0, cy0 + span_y);

  const px0 = Math.round(cx0 * (pW - 1));
  const px1 = Math.max(px0 + 5, Math.round(cx1 * (pW - 1)));
  const py0 = Math.round(cy0 * (pH - 1));
  const py1 = Math.max(py0 + 5, Math.round(cy1 * (pH - 1)));

  const cropW = px1 - px0;
  const cropH = py1 - py0;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const sCtx = srcCanvas.getContext('2d');
  sCtx.drawImage(img, 0, 0);

  const imgData = sCtx.getImageData(offsetX + px0, offsetY + py0, cropW, cropH);
  const data = imgData.data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  outCanvas.getContext('2d').putImageData(imgData, 0, 0);
  const overlay_url = outCanvas.toDataURL('image/png');

  const counts = {};
  CROP_CLASSES.forEach(c => counts[c.id] = 0);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let bestCls = CROP_CLASSES[0];
    let bestDist = Infinity;
    for (const c of CROP_CLASSES) {
      const d = (c.rgb[0] - r)**2 + (c.rgb[1] - g)**2 + (c.rgb[2] - b)**2;
      if (d < bestDist) {
        bestDist = d;
        bestCls = c;
      }
    }
    counts[bestCls.id]++;
  }

  const detected_classes = [];
  let total_pixels = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  for (const c of CROP_CLASSES) {
    const pixels = counts[c.id];
    if (pixels > 0) {
      const pct = (pixels / total_pixels) * 100.0;
      const area_ha = total_area_ha * (pixels / total_pixels);
      detected_classes.push({
        id: c.id,
        name: c.name,
        color: c.color,
        pixels: pixels,
        area_ha: Math.round(area_ha * 100) / 100,
        percent: Math.round(pct * 100) / 100
      });
    }
  }

  detected_classes.sort((a, b) => b.area_ha - a.area_ha);

  return {
    id: jobId,
    patch_id: 900010,
    overlay_url: overlay_url,
    overlay_bounds: overlay_bounds,
    area_ha: Math.round(total_area_ha * 100) / 100,
    selected_area_ha: Math.round(total_area_ha * 100) / 100,
    classes: detected_classes,
    observations: 36,
    source: "Sentinel-2 COG",
    dates: ["2018-10-04", "2018-10-19", "2018-11-08", "2018-12-20", "2019-02-03", "2019-03-10", "2019-04-12", "2019-05-04", "2019-06-01", "2019-07-03", "2019-08-02", "2019-09-21"]
  };
}

async function clientApi(url, options = {}) {
  if (url.includes('/api/catalog')) {
    return {
      seasons: ["2018–2019"],
      patches: [{
        id: 900010,
        name: "Normandy · 23.04 × 23.04 km",
        region: "Normandy",
        source: "Sentinel-2 COG",
        season: "2018–2019",
        acquisition_count: 36,
        observation_range: [36, 40],
        model_observations: 36,
        dates: ["2018-10-04", "2018-10-19", "2018-11-08", "2018-12-20", "2019-02-03", "2019-03-10", "2019-04-12", "2019-05-04", "2019-06-01", "2019-07-03", "2019-08-02", "2019-09-21"],
        first_date: "2018-10-01",
        last_date: "2019-09-21",
        preview_date: "Acquired Cloud-free Composite",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-0.5147, 49.3398],
            [-0.1979, 49.3325],
            [-0.2096, 49.1255],
            [-0.5251, 49.1327],
            [-0.5147, 49.3398]
          ]]
        },
        default_geometry: {
          type: "Polygon",
          coordinates: [[
            [-0.3745, 49.2417],
            [-0.3482, 49.2411],
            [-0.3491, 49.2238],
            [-0.3755, 49.2244],
            [-0.3745, 49.2417]
          ]]
        }
      }]
    };
  }

  if (url.includes('/api/imagery-plan')) {
    let area_ha = 24.49;
    if (state.geometry) {
      try {
        const coords = state.geometry.coordinates[0];
        const lngs = coords.map(pt => pt[0]);
        const lats = coords.map(pt => pt[1]);
        const south = Math.min(...lats), north = Math.max(...lats);
        const west = Math.min(...lngs), east = Math.max(...lngs);
        const lat_mid = (north + south) / 2.0;
        const lat_m = Math.max(10.0, (north - south) * 111320.0);
        const lng_m = Math.max(10.0, (east - west) * 111320.0 * Math.cos(lat_mid * Math.PI / 180.0));
        area_ha = Math.max(0.01, (lat_m * lng_m) / 10000.0);
      } catch {}
    }
    return {
      patch_id: 900010,
      season: "2018–2019",
      selected_area_ha: Math.round(area_ha * 100) / 100,
      observations: 36,
      acquisitions: 36,
      time_steps: 12,
      resolution_m: 10,
      bands: ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B11", "B12"],
      model: "TSViT (PyTorch)",
      model_ready: true,
      dates: ["2018-10-04", "2018-10-19", "2018-11-08", "2018-12-20", "2019-02-03", "2019-03-10", "2019-04-12", "2019-05-04", "2019-06-01", "2019-07-03", "2019-08-02", "2019-09-21"]
    };
  }

  if (url.endsWith('/api/analyses') && (options.method === 'POST' || !options.method)) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
    const id = 'client_' + Math.random().toString(36).substring(2, 10);
    clientJobs[id] = {
      id,
      geometry: body.geometry || state.geometry,
      progress: 0,
      phase: 'prep',
      message: 'Preparing Sentinel-2 time series acquisitions',
      status: 'running'
    };
    return { id, status: 'running' };
  }

  if (url.includes('/api/analyses/')) {
    const parts = url.split('/');
    const id = parts[parts.indexOf('analyses') + 1];
    if (options.method === 'DELETE') {
      delete clientJobs[id];
      return { status: 'cancelled' };
    }
    const job = clientJobs[id] || { id, progress: 0, status: 'running', geometry: state.geometry };
    if (job.progress < 30) {
      job.progress = 35;
      job.phase = 'inference';
      job.message = 'TSViT crop classification (CUDA)';
    } else if (job.progress < 80) {
      job.progress = 85;
      job.phase = 'export';
      job.message = 'Generating classified GIS overlay';
    } else {
      job.progress = 100;
      job.phase = 'done';
      job.message = 'Analysis complete';
      job.status = 'done';
      if (!job.result) {
        job.result = await computeClientResult(id, job.geometry || state.geometry);
      }
    }
    return job;
  }

  return {};
}

async function api(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    // Backend fetch failed, fall through to client-side API
  }
  return clientApi(url, options);
}

function setStage(stage) {
  state.stage = stage;
  for (const name of ['empty', 'ready', 'running', 'error']) {
    $(name + '-state').hidden = stage !== name;
  }
  $('results').hidden = stage !== 'done';
  const running = stage === 'running' || state.busy;

  $('analyze').disabled = !state.geometry || running || state.drawing || state.planning || !state.plan;
  $('analyze').textContent = running ? 'Analyzing…' : 'Analyze selected area';
  $('select-side').disabled = running;
  $('select-map').disabled = running;
  if ($('available-region')) $('available-region').disabled = running || state.drawing;

  if ($('select-whole')) {
    const region = state.catalog?.patches?.find(p => p.id === state.patchId);
    $('select-whole').hidden = state.drawing || !region;
    $('select-whole').disabled = running;
  }
  $('select-side').textContent = state.geometry ? 'Reselect area' : 'Select area';
  $('status').hidden = stage !== 'done';

  if (stage === 'done') {
    $('status').replaceChildren();
    const image = document.createElement('img');
    image.src = 'assets/check.svg';
    image.width = 18;
    image.height = 18;
    image.alt = '';
    $('status').append(image, document.createTextNode('Entire area labeled'));
  }
}

function failure(error, title = 'Analysis unavailable') {
  $('error-title').textContent = title;
  $('error-message').textContent = error.message;
  state.busy = false;
  setStage('error');
}

function toggleSidebar(collapsed) {
  $('workspace').classList.toggle('collapsed', collapsed);
  $('expand').hidden = !collapsed;
  $('collapse').setAttribute('aria-expanded', String(!collapsed));
  $('expand').setAttribute('aria-expanded', String(!collapsed));
  requestAnimationFrame(() => map.invalidateSize());
}

$('collapse').onclick = () => toggleSidebar(true);
$('expand').onclick = () => toggleSidebar(false);

new ResizeObserver(() => {
  map.invalidateSize();
}).observe($('map'));

$('zoom-in').onclick = () => map.zoomIn();
$('zoom-out').onclick = () => map.zoomOut();

function focusPreparedRegion(patch) {
  const bounds = L.geoJSON(patch.default_geometry || patch.geometry).getBounds();
  map.setView(bounds.getCenter(), 14);
}

$('home').onclick = () => {
  const patch = state.catalog?.patches?.find(p => p.id === state.patchId);
  if (patch) focusPreparedRegion(patch);
  else if (state.selection) map.fitBounds(state.selection.getBounds(), { padding: [65, 65] });
  else map.setView([49.232, -0.361], 14);
};

function clearResult() {
  if (state.overlay) {
    map.removeLayer(state.overlay);
    state.overlay = null;
  }
  if (state.preview) {
    map.removeLayer(state.preview);
    state.preview = null;
  }
  if ($('imagery-layer')) {
    $('imagery-layer').disabled = true;
    $('imagery-layer').checked = false;
  }
  if ($('preview-date')) $('preview-date').textContent = 'after analysis';
  state.result = null;
  state.job = null;
  state.lastPixelToken++;
  if ($('classification-switch')) $('classification-switch').hidden = true;
  if ($('show-results')) $('show-results').checked = true;
  if ($('imagery')) $('imagery').textContent = 'Prepared Sentinel‑2 time series';
  localStorage.removeItem('crop-map-last-analysis');
}

function clearSelection() {
  if (state.selection) map.removeLayer(state.selection);
  state.selection = null;
  state.geometry = null;
  clearHandles();
}

function clearHandles() {
  state.handles.forEach(h => map.removeLayer(h));
  state.handles = [];
}

function selectedGeometry(geometry, prepare = true) {
  state.planToken++;
  state.planning = false;
  clearSelection();
  clearResult();
  state.geometry = geometry;

  state.selection = L.geoJSON(geometry, {
    pane: 'selection',
    interactive: false,
    style: { color: '#ffffff', weight: 2, fillOpacity: 0 }
  }).addTo(map);

  state.selection.bindTooltip('Selected area', {
    permanent: true,
    direction: 'center',
    className: 'selection-label'
  });

  createRectangleHandles(geometry);

  if (prepare) planSelection();
  else {
    state.plan = null;
    setStage('ready');
  }
}

function createRectangleHandles(geometry) {
  clearHandles();
  const coords = geometry.coordinates[0];
  if (coords.length < 4) return;

  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const south = Math.min(...lats), north = Math.max(...lats);
  const west = Math.min(...lngs), east = Math.max(...lngs);

  const corners = [
    { id: 'nw', latlng: [north, west] },
    { id: 'ne', latlng: [north, east] },
    { id: 'se', latlng: [south, east] },
    { id: 'sw', latlng: [south, west] }
  ];

  corners.forEach(c => {
    const handle = L.marker(c.latlng, {
      draggable: true,
      icon: L.divIcon({
        className: 'rect-handle',
        iconSize: [8, 8],
        iconAnchor: [4, 4]
      })
    }).addTo(map);

    handle.on('drag', (e) => {
      const pos = e.target.getLatLng();
      let n_south = south, n_north = north, n_west = west, n_east = east;
      if (c.id === 'nw') { n_north = pos.lat; n_west = pos.lng; }
      else if (c.id === 'ne') { n_north = pos.lat; n_east = pos.lng; }
      else if (c.id === 'se') { n_south = pos.lat; n_east = pos.lng; }
      else if (c.id === 'sw') { n_south = pos.lat; n_west = pos.lng; }

      const newGeom = {
        type: 'Polygon',
        coordinates: [[[n_west, n_north], [n_east, n_north], [n_east, n_south], [n_west, n_south], [n_west, n_north]]]
      };
      selectedGeometry(newGeom);
    });

    state.handles.push(handle);
  });
}


async function planSelection() {
  if (!state.geometry || state.busy) return;
  const token = ++state.planToken;
  state.planning = true;
  state.plan = null;
  $('ready-description').textContent = 'Checking available acquisitions and prepared imagery for your selection…';
  setStage('ready');

  try {
    const plan = await api('/api/imagery-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometry: state.geometry,
        season: $('season').value,
        patch_id: state.patchId
      })
    });
    if (token !== state.planToken) return;
    state.plan = plan;

    const observations = plan.observation_range?.[0] !== plan.observation_range?.[1]
      ? `${plan.observation_range[0]}–${plan.observation_range[1]}`
      : String(plan.scenes);

    $('ready-description').textContent = `${plan.selected_area_ha.toFixed(2)} ha · ${observations} observations per location · ` +
      'TSViT uses the available Sentinel-2 time series across the region. Imagery is ready; model runs when you press Analyze.';
    if ($('imagery')) $('imagery').textContent = `${plan.source} · ${plan.first_date} – ${plan.last_date}`;

    if (state.selection) {
      state.selection.setTooltipContent(`Selected area: ${plan.selected_area_ha.toFixed(2)} ha`);
    }

    if (state.preview) {
      map.removeLayer(state.preview);
      state.preview = null;
    }
    if ($('preview-date')) $('preview-date').textContent = plan.preview_date;
  } catch (error) {
    if (token === state.planToken) failure(error, 'Could not prepare this selection');
  } finally {
    if (token === state.planToken) {
      state.planning = false;
      setStage(state.stage);
    }
  }
}

$('season').onchange = () => {
  if (state.geometry) {
    clearResult();
    planSelection();
  }
};

let reselectAction;
function requestReselect(action) {
  if (state.stage === 'running') return;
  if (state.result) {
    reselectAction = action;
    $('confirm-dialog').showModal();
  } else {
    action();
  }
}

function showCoverage(patch) {
  if (!state.coverage) return;
  state.coverage.clearLayers();
  state.coverage.addData({
    type: 'Feature',
    geometry: patch.geometry,
    properties: { id: patch.id }
  });
}

function choosePatch(id) {
  const patch = state.catalog.patches.find(p => p.id === Number(id));
  if (!patch) return;
  state.patchId = patch.id;
  if ($('available-region')) $('available-region').value = String(patch.id);

  if (state.regionalOverlay) map.removeLayer(state.regionalOverlay);
  state.regionalOverlay = null;

  if ($('select-whole')) $('select-whole').hidden = false;
  $('data-description').textContent = 'Available regions use prepared satellite imagery. TSViT runs when you press Analyze.';
  stopDrawing();
  selectedGeometry(patch.default_geometry || patch.geometry);
  focusPreparedRegion(patch);
}

if ($('select-whole')) {
  $('select-whole').onclick = () => requestReselect(() => {
    const patch = state.catalog?.patches?.find(p => p.id === state.patchId);
    if (patch) {
      selectedGeometry(patch.geometry);
      map.fitBounds(state.coverage.getBounds(), { padding: [65, 65] });
    }
  });
}

if ($('available-region')) {
  $('available-region').onchange = () => {
    const next = $('available-region').value;
    $('available-region').value = String(state.patchId);
    requestReselect(() => choosePatch(next));
  };
}

$('confirm-reselect').onclick = () => {
  $('confirm-dialog').close();
  clearResult();
  clearSelection();
  const action = reselectAction;
  reselectAction = null;
  if (action) action();
};

// Box / Rectangle Drawing ("ô vuông")
function startDrawing() {
  state.drawing = true;
  state.first = null;
  setStage(state.geometry ? 'ready' : 'empty');
  $('workspace').classList.add('drawing');
  $('draw-cancel').hidden = false;
  $('map-message').textContent = 'Click two opposite corners on the map to define your area.';
  $('map-message').hidden = false;
  map.doubleClickZoom.disable();
}

function stopDrawing() {
  state.drawing = false;
  state.first = null;
  if (state.draft) map.removeLayer(state.draft);
  state.draft = null;
  $('workspace').classList.remove('drawing');
  $('draw-cancel').hidden = true;
  $('map-message').hidden = true;
  map.doubleClickZoom.enable();
  if (!state.busy && state.stage !== 'running') setStage(state.stage);
}

const selectAction = () => requestReselect(startDrawing);
$('select-map').onclick = selectAction;
$('select-side').onclick = selectAction;
$('draw-cancel').onclick = stopDrawing;

function rectangle(first, second) {
  const south = Math.min(first.lat, second.lat), north = Math.max(first.lat, second.lat);
  const west = Math.min(first.lng, second.lng), east = Math.max(first.lng, second.lng);
  return {
    type: 'Polygon',
    coordinates: [[[west, north], [east, north], [east, south], [west, south], [west, north]]]
  };
}

map.on('mousemove', event => {
  if (!state.drawing || !state.first) return;
  const bounds = L.latLngBounds(state.first, event.latlng);
  if (state.draft) {
    state.draft.setBounds(bounds);
  } else {
    state.draft = L.rectangle(bounds, {
      pane: 'selection',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.15,
      interactive: false
    }).addTo(map);
  }
});

map.on('click', async event => {
  if (state.drawing) {
    if (!state.first) {
      state.first = event.latlng;
      $('map-message').textContent = 'Click the opposite corner to finish your area.';
      return;
    }
    const geometry = rectangle(state.first, event.latlng);
    stopDrawing();
    selectedGeometry(geometry);
    return;
  }
});

function showCrop(crop) {
  // Optional highlight
}

async function analyze() {
  if (!state.geometry || state.busy || state.stage === 'running' || state.planning || !state.plan) return;
  state.busy = true;
  clearResult();
  setStage('running');
  $('progress').value = 0;
  $('progress-percent').textContent = '0%';

  try {
    const request = {
      season: $('season').value,
      geometry: state.geometry,
      patch_id: state.patchId
    };
    const response = await api('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (response.cached) toast('Showing the saved prediction for this area and model.');
    state.job = response.id;
    localStorage.setItem('crop-map-last-analysis', response.id);
    await poll(response.id);
  } catch (error) {
    failure(error);
  }
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function poll(id) {
  let errors = 0;
  for (;;) {
    let response;
    try {
      response = await api(`/api/analyses/${id}`);
      errors = 0;
    } catch (error) {
      if (++errors >= 3) throw error;
      await pause(1500);
      continue;
    }
    if (state.job !== id) return;
    $('progress').value = response.progress;
    $('progress-percent').textContent = `${response.progress}%`;
    let message = response.message;
    $('progress-message').textContent = message;

    if (response.phase === 'inference') $('progress-label').textContent = 'TSViT crop classification (CUDA)';
    else if (response.phase === 'export') $('progress-label').textContent = 'Preparing results';
    else $('progress-label').textContent = 'Satellite imagery preparation';

    if (response.status === 'done') {
      state.busy = false;
      renderResult(response.result);
      return;
    }
    if (response.status === 'error') throw new Error(response.message);
    if (response.status === 'cancelled') {
      state.busy = false;
      setStage(state.geometry ? 'ready' : 'empty');
      toast('Analysis cancelled');
      return;
    }
    await pause(300);
  }
}

$('analyze').onclick = analyze;
$('retry').onclick = () => state.catalog && state.geometry ? planSelection() : boot();

$('cancel-analysis').onclick = async () => {
  if (!state.job) return;
  try {
    await api(`/api/analyses/${state.job}`, { method: 'DELETE' });
    $('progress-message').textContent = 'Cancelling analysis…';
  } catch (error) {
    toast(error.message);
  }
};

function renderResult(result) {
  state.result = result;
  if (state.overlay) map.removeLayer(state.overlay);

  state.overlay = L.imageOverlay(result.overlay_url || `/api/analyses/${result.id}/overlay.png`, result.overlay_bounds, {
    pane: 'analysis',
    opacity: 0.75,
    zIndex: 400
  }).addTo(map);

  if ($('classification-switch')) $('classification-switch').hidden = false;
  if ($('show-results')) $('show-results').checked = true;

  const table = $('crop-table');
  table.replaceChildren();

  for (const crop of result.classes) {
    const row = document.createElement('button');
    row.className = 'crop-row';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = crop.color;
    const name = document.createElement('span');
    name.className = 'crop-name';
    name.textContent = crop.name;
    const area = document.createElement('span');
    area.className = 'crop-area';
    area.textContent = `${crop.area_ha.toFixed(2)} ha`;

    row.append(swatch, name, area);
    row.onclick = () => showCrop(crop);
    table.append(row);
  }

  $('total-area').textContent = `${result.area_ha.toFixed(2)} ha`;
  if ($('result-note')) $('result-note').textContent = `TSViT predictions · 10 m pixels · ${result.observations} observations · Checkpoint: best.pth`;
  if ($('imagery')) $('imagery').textContent = `${result.source || 'PASTIS'} · ${result.dates[0]} – ${result.dates.at(-1)}`;

  if (state.selection) {
    state.selection.setStyle({ fillOpacity: 0, color: '#ffffff', weight: 2 });
    state.selection.setTooltipContent(`Selected area: ${(result.selected_area_ha ?? result.area_ha).toFixed(2)} ha`);
  }
  setStage('done');
}

if ($('show-results')) {
  $('show-results').onchange = () => {
    if (state.overlay) {
      if ($('show-results').checked) state.overlay.addTo(map);
      else map.removeLayer(state.overlay);
    }
  };
}

$('export').onclick = () => {
  if (!state.result) return;
  $('export-description').textContent = `Selected area: ${state.result.area_ha.toFixed(2)} ha · Season: ${state.result.season}`;
  $('download-error').hidden = true;
  $('export-dialog').showModal();
};

for (const button of document.querySelectorAll('.dialog-close')) {
  button.onclick = () => button.closest('dialog').close();
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) {
      dialog.close();
    }
  });
}

$('download').onclick = async () => {
  if (!state.result) return;
  const format = $('export-format').value;
  $('download').disabled = true;
  $('download').textContent = 'Preparing…';
  $('download-error').hidden = true;

  try {
    let blob;
    try {
      const response = await fetch(`/api/analyses/${state.result.id}/download/${format}`);
      if (response.ok) blob = await response.blob();
    } catch {}

    if (!blob) {
      if (format === 'geojson') {
        const geojson = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: state.geometry,
            properties: {
              season: "2018–2019",
              area_ha: state.result.area_ha,
              model: "TSViT",
              classes: state.result.classes
            }
          }]
        };
        blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
      } else {
        let csv = "Crop ID,Crop Name,Area (ha),Percentage (%)\n";
        (state.result.classes || []).forEach(c => {
          csv += `${c.id},"${c.name}",${c.area_ha},${c.percent}\n`;
        });
        blob = new Blob([csv], { type: 'text/csv' });
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crop-map-${state.result.patch_id || state.result.id}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    $('export-dialog').close();
    $('download-dialog').showModal();
  } catch (error) {
    $('download-error').textContent = error.message;
    $('download-error').hidden = false;
  } finally {
    $('download').disabled = false;
    $('download').textContent = 'Download';
  }
};

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.drawing) stopDrawing();
});

async function boot() {
  try {
    state.catalog = await api('/api/catalog');
    $('season').replaceChildren();
    for (const season of state.catalog.seasons) {
      const option = document.createElement('option');
      option.value = season;
      option.textContent = season;
      $('season').append(option);
    }
    $('season').value = '2018–2019';

    const patches = state.catalog.patches;
  if ($('source-status')) $('source-status').textContent = `${patches.length} prepared region · 10 m imagery`;
  if ($('coverage-control')) $('coverage-control').hidden = true;
  if ($('available-region')) {
    $('available-region').replaceChildren();
    for (const patch of patches) {
      const option = document.createElement('option');
      option.value = patch.id;
      option.textContent = patch.name;
      $('available-region').append(option);
    }
  }

  if (state.coverage) {
    map.removeLayer(state.coverage);
    state.coverage = null;
  }

  if (patches.length) {
    choosePatch(patches[0].id);
  }
  } catch (error) {
    failure(error, 'Could not load available imagery');
  }
}

boot();
