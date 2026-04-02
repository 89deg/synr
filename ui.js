// ============================================================
// SYNR UI
// ============================================================
let currentWaveform = 'sin';
let currentParams = getDefaults();
let lockedParams = new Set();
let presets = [];
let activePresetIndex = -1;
let lastSamples = null;

let audioCtx = null;
let currentSource = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ============================================================
// PLAYBACK
// ============================================================
function playSound() {
  // Stop previous sound if still playing
  if (currentSource) {
    try { currentSource.stop(); } catch(e) {}
    currentSource = null;
  }

  const ctx = getAudioCtx();
  const vol = parseFloat(document.getElementById('masterVol').value);
  const samples = synthesize(currentWaveform, currentParams);
  lastSamples = samples;

  const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buf.getChannelData(0).set(samples);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const gain = ctx.createGain();
  gain.gain.value = vol;

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();

  currentSource = src;
  src.onended = () => { if (currentSource === src) currentSource = null; };

  drawWaveform(samples);
}

function autoPlayIfEnabled() {
  if (document.getElementById('autoPlay').checked) playSound();
}

// ============================================================
// WAVEFORM VISUALIZER
// ============================================================
function drawWaveform(samples) {
  const canvas = document.getElementById('vizCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(83,52,131,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h/2);
  ctx.lineTo(w, h/2);
  ctx.stroke();

  if (!samples || samples.length < 2) return;

  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.beginPath();

  const step = samples.length / w;
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * step);
    const y = (1 - samples[idx]) * h / 2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(233,69,96,0.3)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * step);
    const y = (1 - samples[idx]) * h / 2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ============================================================
// UI: SLIDERS
// ============================================================
function buildSliders() {
  const container = document.getElementById('sliderContainer');
  container.innerHTML = '';

  PARAM_DEFS.forEach(group => {
    const div = document.createElement('div');
    div.className = 'slider-group';
    div.innerHTML = `<div class="slider-group-title">${group.group}</div>`;

    group.params.forEach(pd => {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const range = pd.max - pd.min;
      const norm = (currentParams[pd.key] - pd.min) / range;

      row.innerHTML = `
        <button class="slider-lock ${lockedParams.has(pd.key)?'locked':''}" data-key="${pd.key}" onclick="toggleLock('${pd.key}', this)">${lockedParams.has(pd.key)?'🔒':'🔓'}</button>
        <span class="slider-label">${pd.label}</span>
        <div class="slider-wrap" data-key="${pd.key}" data-min="${pd.min}" data-max="${pd.max}">
          <div class="slider-fill" style="width:${norm*100}%"></div>
          <div class="slider-handle" style="left:calc(${norm*100}% - 3px)"></div>
        </div>
        <span class="slider-val" id="val_${pd.key}">${currentParams[pd.key].toFixed(3)}</span>
      `;
      div.appendChild(row);
    });
    container.appendChild(div);
  });

  document.querySelectorAll('.slider-wrap').forEach(wrap => {
    const startDrag = (e) => {
      e.preventDefault();
      const update = (ev) => {
        const rect = wrap.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        let norm = (clientX - rect.left) / rect.width;
        norm = Math.max(0, Math.min(1, norm));

        const min = parseFloat(wrap.dataset.min);
        const max = parseFloat(wrap.dataset.max);
        const val = min + norm * (max - min);
        const key = wrap.dataset.key;

        currentParams[key] = val;
        wrap.querySelector('.slider-fill').style.width = norm * 100 + '%';
        wrap.querySelector('.slider-handle').style.left = `calc(${norm*100}% - 3px)`;
        document.getElementById('val_' + key).textContent = val.toFixed(3);
      };
      const stop = () => {
        document.removeEventListener('mousemove', update);
        document.removeEventListener('mouseup', stop);
        document.removeEventListener('touchmove', update);
        document.removeEventListener('touchend', stop);
        autoPlayIfEnabled();
      };
      update(e);
      document.addEventListener('mousemove', update);
      document.addEventListener('mouseup', stop);
      document.addEventListener('touchmove', update);
      document.addEventListener('touchend', stop);
    };
    wrap.addEventListener('mousedown', startDrag);
    wrap.addEventListener('touchstart', startDrag);
  });
}

function toggleLock(key, btn) {
  if (lockedParams.has(key)) {
    lockedParams.delete(key);
    btn.classList.remove('locked');
    btn.textContent = '🔓';
  } else {
    lockedParams.add(key);
    btn.classList.add('locked');
    btn.textContent = '🔒';
  }
}

function updateSlidersFromParams() {
  PARAM_DEFS.forEach(g => g.params.forEach(pd => {
    const wrap = document.querySelector(`.slider-wrap[data-key="${pd.key}"]`);
    if (!wrap) return;
    const range = pd.max - pd.min;
    const norm = (currentParams[pd.key] - pd.min) / range;
    wrap.querySelector('.slider-fill').style.width = norm * 100 + '%';
    wrap.querySelector('.slider-handle').style.left = `calc(${norm*100}% - 3px)`;
    document.getElementById('val_' + pd.key).textContent = currentParams[pd.key].toFixed(3);
  }));
  updateWaveButtons();
}

// ============================================================
// UI: WAVEFORM BUTTONS
// ============================================================
function buildWaveButtons() {
  const c = document.getElementById('waveButtons');
  c.innerHTML = '';
  WAVEFORMS.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'wave-btn' + (currentWaveform === w ? ' active' : '');
    btn.textContent = w.charAt(0).toUpperCase() + w.slice(1);
    btn.onclick = () => {
      currentWaveform = w;
      updateWaveButtons();
      autoPlayIfEnabled();
    };
    c.appendChild(btn);
  });
}

function updateWaveButtons() {
  document.querySelectorAll('.wave-btn').forEach((btn, i) => {
    btn.classList.toggle('active', WAVEFORMS[i] === currentWaveform);
  });
}

// ============================================================
// GENERATORS
// ============================================================
function setParams(obj) {
  Object.keys(obj).forEach(k => {
    if (!lockedParams.has(k)) currentParams[k] = obj[k];
  });
}

function generate(type) {
  const d = getDefaults();
  const r = () => Math.random();

  switch(type) {
    case 'pickup':
      Object.assign(d, { frequency: 0.4 + r()*0.3, sustainTime: 0.05, decayTime: 0.2,
        frequencySlide: 0.1 + r()*0.2 });
      currentWaveform = r() > 0.5 ? 'square' : 'sin';
      break;
    case 'laser':
      Object.assign(d, { frequency: 0.5 + r()*0.4, sustainTime: 0.05 + r()*0.1,
        decayTime: 0.1 + r()*0.1, frequencySlide: -0.2 - r()*0.4 });
      currentWaveform = ['square','saw','sin'][Math.floor(r()*3)];
      break;
    case 'explosion':
      Object.assign(d, { frequency: 0.05 + r()*0.1, sustainTime: 0.1 + r()*0.2,
        decayTime: 0.3 + r()*0.3, punch: 0.5 + r()*0.5 });
      currentWaveform = 'noise';
      break;
    case 'powerup':
      Object.assign(d, { frequency: 0.3 + r()*0.2, sustainTime: 0.1 + r()*0.1,
        decayTime: 0.2 + r()*0.2, frequencySlide: 0.2 + r()*0.3,
        repeatSpeed: 0.4 + r()*0.3 });
      currentWaveform = r() > 0.5 ? 'square' : 'saw';
      break;
    case 'hit':
      Object.assign(d, { frequency: 0.2 + r()*0.3, sustainTime: 0.02, decayTime: 0.1 + r()*0.1,
        punch: 0.5 + r()*0.5 });
      currentWaveform = r() > 0.5 ? 'noise' : 'saw';
      break;
    case 'jump':
      Object.assign(d, { frequency: 0.25 + r()*0.15, sustainTime: 0.05 + r()*0.05,
        decayTime: 0.15 + r()*0.15, frequencySlide: 0.2 + r()*0.2 });
      currentWaveform = 'square';
      break;
    case 'blip':
      Object.assign(d, { frequency: 0.4 + r()*0.3, sustainTime: 0.02 + r()*0.03,
        decayTime: 0.05 + r()*0.05 });
      currentWaveform = r() > 0.5 ? 'square' : 'sin';
      break;
  }
  setParams(d);
  updateSlidersFromParams();
  autoPlayIfEnabled();
}

function randomize() {
  PARAM_DEFS.forEach(g => g.params.forEach(pd => {
    if (!lockedParams.has(pd.key)) {
      currentParams[pd.key] = pd.min + Math.random() * (pd.max - pd.min);
    }
  }));
  // Ensure audible output: minimum duration, frequency, and safe filter values
  if (!lockedParams.has('frequency')) currentParams.frequency = 0.15 + Math.random() * 0.7;
  if (!lockedParams.has('sustainTime')) currentParams.sustainTime = Math.max(0.05, currentParams.sustainTime);
  if (!lockedParams.has('decayTime')) currentParams.decayTime = Math.max(0.1, currentParams.decayTime);
  if (!lockedParams.has('lpFilterCutoff')) currentParams.lpFilterCutoff = 0.3 + Math.random() * 0.7;
  if (!lockedParams.has('hpFilterCutoff')) currentParams.hpFilterCutoff = Math.random() * 0.4;
  currentWaveform = WAVEFORMS[Math.floor(Math.random() * WAVEFORMS.length)];
  updateSlidersFromParams();
  autoPlayIfEnabled();
}

function mutate() {
  PARAM_DEFS.forEach(g => g.params.forEach(pd => {
    if (!lockedParams.has(pd.key)) {
      const range = pd.max - pd.min;
      let val = currentParams[pd.key] + (Math.random() - 0.5) * range * 0.15;
      val = Math.max(pd.min, Math.min(pd.max, val));
      currentParams[pd.key] = val;
    }
  }));
  updateSlidersFromParams();
  autoPlayIfEnabled();
}

// ============================================================
// PRESETS
// ============================================================
function renderPresets() {
  const list = document.getElementById('presetList');
  list.innerHTML = '';
  presets.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'preset-item' + (i === activePresetIndex ? ' active' : '');
    div.innerHTML = `
      <span class="name" ondblclick="renamePreset(${i}, this)">${p.name}</span>
      <button class="del" onclick="event.stopPropagation(); deletePreset(${i})">&#10005;</button>
    `;
    div.onclick = () => loadPreset(i);
    list.appendChild(div);
  });
}

function savePreset() {
  const name = 'Sound ' + (presets.length + 1);
  presets.push({
    name,
    waveform: currentWaveform,
    params: { ...currentParams }
  });
  activePresetIndex = presets.length - 1;
  renderPresets();
  saveToStorage();
}

function duplicatePreset() {
  if (activePresetIndex < 0) { savePreset(); return; }
  const src = presets[activePresetIndex];
  presets.push({
    name: src.name + ' (copy)',
    waveform: src.waveform,
    params: { ...src.params }
  });
  activePresetIndex = presets.length - 1;
  renderPresets();
  saveToStorage();
}

function loadPreset(i) {
  activePresetIndex = i;
  currentWaveform = presets[i].waveform;
  currentParams = { ...presets[i].params };
  updateSlidersFromParams();
  renderPresets();
  autoPlayIfEnabled();
}

function deletePreset(i) {
  presets.splice(i, 1);
  if (activePresetIndex >= presets.length) activePresetIndex = presets.length - 1;
  renderPresets();
  saveToStorage();
}

function renamePreset(i, el) {
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = presets[i].name;
  el.replaceWith(input);
  input.focus();
  input.select();
  const done = () => {
    presets[i].name = input.value || presets[i].name;
    renderPresets();
    saveToStorage();
  };
  input.onblur = done;
  input.onkeydown = (e) => { if (e.key === 'Enter') done(); };
}

function saveToStorage() {
  try { localStorage.setItem('synr_presets', JSON.stringify(presets)); } catch(e) {}
}
function loadFromStorage() {
  try {
    const d = localStorage.getItem('synr_presets');
    if (d) presets = JSON.parse(d);
  } catch(e) {}
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function presetToJSON(p) {
  return {
    id: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: p.name,
    waveform: p.waveform,
    envelope: {
      attack: p.params.attackTime,
      sustain: p.params.sustainTime,
      punch: p.params.punch,
      decay: p.params.decayTime,
    },
    frequency: {
      base: p.params.frequency,
      slide: p.params.frequencySlide,
      deltaSlide: p.params.deltaSlide,
      cutoff: p.params.frequencyCutoff,
    },
    vibrato: {
      depth: p.params.vibratoDepth,
      speed: p.params.vibratoSpeed,
    },
    pitchJump: {
      repeatSpeed: p.params.pitchJumpRepeatSpeed,
      amount1: p.params.pitchJumpAmount1,
      onset1: p.params.pitchJumpOnset1,
      amount2: p.params.pitchJumpAmount2,
      onset2: p.params.pitchJumpOnset2,
    },
    harmonics: {
      amount: p.params.harmonics,
      falloff: p.params.harmonicsFalloff,
    },
    duty: {
      squareDuty: p.params.squareDuty,
      sweep: p.params.dutySweep,
    },
    repeat: { speed: p.params.repeatSpeed },
    flanger: {
      offset: p.params.flangerOffset,
      sweep: p.params.flangerSweep,
    },
    lowPassFilter: {
      cutoff: p.params.lpFilterCutoff,
      cutoffSweep: p.params.lpFilterCutoffSweep,
      resonance: p.params.lpFilterResonance,
    },
    highPassFilter: {
      cutoff: p.params.hpFilterCutoff,
      cutoffSweep: p.params.hpFilterCutoffSweep,
    },
    bitCrush: {
      amount: p.params.bitCrush,
      sweep: p.params.bitCrushSweep,
    },
    compression: p.params.compression,
    volume: 0.8,
  };
}

function jsonToPreset(j) {
  return {
    name: j.name || j.id || 'Imported',
    waveform: j.waveform || 'sin',
    params: {
      attackTime: j.envelope?.attack ?? 0,
      sustainTime: j.envelope?.sustain ?? 0.1,
      punch: j.envelope?.punch ?? 0,
      decayTime: j.envelope?.decay ?? 0.3,
      compression: j.compression ?? 0,
      frequency: j.frequency?.base ?? 0.3,
      frequencySlide: j.frequency?.slide ?? 0,
      deltaSlide: j.frequency?.deltaSlide ?? 0,
      frequencyCutoff: j.frequency?.cutoff ?? 1,
      vibratoDepth: j.vibrato?.depth ?? 0,
      vibratoSpeed: j.vibrato?.speed ?? 0,
      pitchJumpRepeatSpeed: j.pitchJump?.repeatSpeed ?? 0,
      pitchJumpAmount1: j.pitchJump?.amount1 ?? 0,
      pitchJumpOnset1: j.pitchJump?.onset1 ?? 0,
      pitchJumpAmount2: j.pitchJump?.amount2 ?? 0,
      pitchJumpOnset2: j.pitchJump?.onset2 ?? 0,
      harmonics: j.harmonics?.amount ?? 0,
      harmonicsFalloff: j.harmonics?.falloff ?? 0,
      squareDuty: j.duty?.squareDuty ?? 0.5,
      dutySweep: j.duty?.sweep ?? 0,
      repeatSpeed: j.repeat?.speed ?? 0,
      flangerOffset: j.flanger?.offset ?? 0,
      flangerSweep: j.flanger?.sweep ?? 0,
      lpFilterCutoff: j.lowPassFilter?.cutoff ?? 1,
      lpFilterCutoffSweep: j.lowPassFilter?.cutoffSweep ?? 0,
      lpFilterResonance: j.lowPassFilter?.resonance ?? 0,
      hpFilterCutoff: j.highPassFilter?.cutoff ?? 0,
      hpFilterCutoffSweep: j.highPassFilter?.cutoffSweep ?? 0,
      bitCrush: j.bitCrush?.amount ?? 0,
      bitCrushSweep: j.bitCrush?.sweep ?? 0,
    }
  };
}

function exportJSON() {
  if (presets.length === 0) { alert('No presets saved yet!'); return; }
  const data = presets.map(presetToJSON);
  document.getElementById('jsonArea').value = JSON.stringify(data, null, 2);
  document.getElementById('modalTitle').textContent = 'Export All Presets';
  document.getElementById('modalImportBtn').style.display = 'none';
  document.getElementById('jsonModal').classList.add('open');
}

function exportCurrentJSON() {
  const p = { name: 'Current', waveform: currentWaveform, params: { ...currentParams } };
  const data = presetToJSON(p);
  document.getElementById('jsonArea').value = JSON.stringify(data, null, 2);
  document.getElementById('modalTitle').textContent = 'Export Current Sound';
  document.getElementById('modalImportBtn').style.display = 'none';
  document.getElementById('jsonModal').classList.add('open');
}

function importJSON() {
  document.getElementById('jsonArea').value = '';
  document.getElementById('modalTitle').textContent = 'Import JSON (single or array)';
  document.getElementById('modalImportBtn').style.display = 'block';
  document.getElementById('jsonModal').classList.add('open');
}

function doImport() {
  try {
    const data = JSON.parse(document.getElementById('jsonArea').value);
    const arr = Array.isArray(data) ? data : [data];
    arr.forEach(j => {
      presets.push(jsonToPreset(j));
    });
    activePresetIndex = presets.length - 1;
    loadPreset(activePresetIndex);
    renderPresets();
    saveToStorage();
    closeModal();
  } catch(e) {
    alert('Invalid JSON: ' + e.message);
  }
}

function exportWAV() {
  const samples = synthesize(currentWaveform, currentParams);
  const vol = parseFloat(document.getElementById('masterVol').value);
  const scaled = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * vol;

  const wav = samplesToWav(scaled);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (activePresetIndex >= 0 ? presets[activePresetIndex].name : 'synr_sound') + '.wav';
  a.click();
  URL.revokeObjectURL(url);
}

function copyJSON() {
  const area = document.getElementById('jsonArea');
  navigator.clipboard.writeText(area.value).then(() => {
    area.style.borderColor = '#4ecca3';
    setTimeout(() => area.style.borderColor = '', 500);
  });
}

function downloadJSON() {
  const blob = new Blob([document.getElementById('jsonArea').value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'synr_presets.json';
  a.click();
  URL.revokeObjectURL(url);
}

function closeModal() {
  document.getElementById('jsonModal').classList.remove('open');
}

// ============================================================
// INIT
// ============================================================
loadFromStorage();
buildWaveButtons();
buildSliders();
renderPresets();
drawWaveform(null);
