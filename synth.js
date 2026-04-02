// ============================================================
// SYNR Synth Engine (Bfxr-compatible)
// ============================================================
const SAMPLE_RATE = 44100;

const WAVEFORMS = ['sin','triangle','square','saw','noise','bitnoise'];

const PARAM_DEFS = [
  { group: 'Envelope', params: [
    { key: 'attackTime', label: 'Attack Time', min: 0, max: 1, def: 0 },
    { key: 'sustainTime', label: 'Sustain Time', min: 0, max: 1, def: 0.1 },
    { key: 'punch', label: 'Punch', min: 0, max: 1, def: 0 },
    { key: 'decayTime', label: 'Decay Time', min: 0, max: 1, def: 0.3 },
    { key: 'compression', label: 'Compression', min: 0, max: 1, def: 0 },
  ]},
  { group: 'Frequency', params: [
    { key: 'frequency', label: 'Frequency', min: 0, max: 1, def: 0.3 },
    { key: 'frequencySlide', label: 'Frequency Slide', min: -1, max: 1, def: 0 },
    { key: 'deltaSlide', label: 'Delta Slide', min: -1, max: 1, def: 0 },
    { key: 'frequencyCutoff', label: 'Frequency Cutoff', min: 0, max: 1, def: 1 },
  ]},
  { group: 'Vibrato', params: [
    { key: 'vibratoDepth', label: 'Vibrato Depth', min: 0, max: 1, def: 0 },
    { key: 'vibratoSpeed', label: 'Vibrato Speed', min: 0, max: 1, def: 0 },
  ]},
  { group: 'Pitch Jump', params: [
    { key: 'pitchJumpRepeatSpeed', label: 'Repeat Speed', min: 0, max: 1, def: 0 },
    { key: 'pitchJumpAmount1', label: 'Amount 1', min: -1, max: 1, def: 0 },
    { key: 'pitchJumpOnset1', label: 'Onset 1', min: 0, max: 1, def: 0 },
    { key: 'pitchJumpAmount2', label: 'Amount 2', min: -1, max: 1, def: 0 },
    { key: 'pitchJumpOnset2', label: 'Onset 2', min: 0, max: 1, def: 0 },
  ]},
  { group: 'Harmonics', params: [
    { key: 'harmonics', label: 'Harmonics', min: 0, max: 1, def: 0 },
    { key: 'harmonicsFalloff', label: 'Harmonics Falloff', min: 0, max: 1, def: 0 },
  ]},
  { group: 'Duty', params: [
    { key: 'squareDuty', label: 'Square Duty', min: 0, max: 1, def: 0.5 },
    { key: 'dutySweep', label: 'Duty Sweep', min: -1, max: 1, def: 0 },
  ]},
  { group: 'Repeat', params: [
    { key: 'repeatSpeed', label: 'Repeat Speed', min: 0, max: 1, def: 0 },
  ]},
  { group: 'Flanger', params: [
    { key: 'flangerOffset', label: 'Flanger Offset', min: -1, max: 1, def: 0 },
    { key: 'flangerSweep', label: 'Flanger Sweep', min: -1, max: 1, def: 0 },
  ]},
  { group: 'Low-Pass Filter', params: [
    { key: 'lpFilterCutoff', label: 'LP Cutoff', min: 0, max: 1, def: 1 },
    { key: 'lpFilterCutoffSweep', label: 'LP Cutoff Sweep', min: -1, max: 1, def: 0 },
    { key: 'lpFilterResonance', label: 'LP Resonance', min: 0, max: 1, def: 0 },
  ]},
  { group: 'High-Pass Filter', params: [
    { key: 'hpFilterCutoff', label: 'HP Cutoff', min: 0, max: 1, def: 0 },
    { key: 'hpFilterCutoffSweep', label: 'HP Cutoff Sweep', min: -1, max: 1, def: 0 },
  ]},
  { group: 'Bit Crush', params: [
    { key: 'bitCrush', label: 'Bit Crush', min: 0, max: 1, def: 0 },
    { key: 'bitCrushSweep', label: 'Bit Crush Sweep', min: -1, max: 1, def: 0 },
  ]},
];

function getDefaults() {
  const p = {};
  PARAM_DEFS.forEach(g => g.params.forEach(d => p[d.key] = d.def));
  return p;
}

function synthesize(waveform, params) {
  const p = { ...params };

  const attackSamples = Math.floor(p.attackTime * p.attackTime * 100000);
  const sustainSamples = Math.floor(p.sustainTime * p.sustainTime * 100000);
  const decaySamples = Math.floor(p.decayTime * p.decayTime * 100000);
  const totalSamples = attackSamples + sustainSamples + decaySamples;

  if (totalSamples < 1) return new Float32Array(1);

  const samples = new Float32Array(totalSamples);

  let freq = p.frequency * p.frequency * 0.01;
  let freqSlide = p.frequencySlide * 0.01;
  let freqDeltaSlide = p.deltaSlide * 0.000001;
  const freqMin = p.frequencyCutoff * p.frequencyCutoff * 0.01;

  const vibDepth = p.vibratoDepth * 0.1;
  const vibSpeed = p.vibratoSpeed * p.vibratoSpeed * 0.01;
  let vibPhase = 0;

  let duty = 0.5 - p.squareDuty * 0.5;
  let dutySweep = -p.dutySweep * 0.00005;

  const repeatLimit = p.repeatSpeed > 0 ? Math.floor((1 - p.repeatSpeed) * (1 - p.repeatSpeed) * 20000 + 32) : 0;
  let repeatTime = 0;

  const flangerBuf = new Float32Array(1024);
  let flangerIdx = 0;
  let flangerOffset = Math.floor(p.flangerOffset * p.flangerOffset * 1020);
  if (p.flangerOffset < 0) flangerOffset = -flangerOffset;
  let flangerSweep = p.flangerSweep * p.flangerSweep * p.flangerSweep * 0.2;

  let lpEnabled = p.lpFilterCutoff < 1.0;
  let lpCutoff = p.lpFilterCutoff * p.lpFilterCutoff * p.lpFilterCutoff * 0.1;
  let lpCutoffSweep = 1.0 + p.lpFilterCutoffSweep * 0.0001;
  let lpDamping = 5.0 / (1.0 + p.lpFilterResonance * p.lpFilterResonance * 20.0) * (0.01 + lpCutoff);
  if (lpDamping > 0.8) lpDamping = 0.8;
  let lpVal = 0, lpValD = 0;

  let hpCutoff = p.hpFilterCutoff * p.hpFilterCutoff * 0.1;
  let hpCutoffSweep = 1.0 + p.hpFilterCutoffSweep * 0.0003;
  let hpVal = 0;

  const pjRepeat = p.pitchJumpRepeatSpeed > 0 ? Math.floor((1 - p.pitchJumpRepeatSpeed) * (1 - p.pitchJumpRepeatSpeed) * 20000 + 32) : 0;
  let pjTime = 0;
  let pjApplied1 = false, pjApplied2 = false;

  let bitCrush = p.bitCrush;
  let bitCrushSweep = p.bitCrushSweep * 0.000004;

  const noiseBuf = new Float32Array(32);
  for (let i = 0; i < 32; i++) noiseBuf[i] = Math.random() * 2 - 1;

  let phase = 0;
  let period = 100.0 / (freq * freq + 0.001);

  const freqStart = freq;
  const dutyStart = duty;

  for (let i = 0; i < totalSamples; i++) {
    // Envelope
    let env = 1;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i < attackSamples + sustainSamples) {
      const t = (i - attackSamples) / (sustainSamples || 1);
      env = 1.0 + p.punch * (1.0 - t);
    } else {
      env = 1.0 - (i - attackSamples - sustainSamples) / (decaySamples || 1);
    }

    // Repeat
    if (repeatLimit > 0) {
      repeatTime++;
      if (repeatTime >= repeatLimit) {
        repeatTime = 0;
        freq = freqStart;
        freqSlide = p.frequencySlide * 0.01;
        duty = dutyStart;
        pjTime = 0;
        pjApplied1 = false;
        pjApplied2 = false;
      }
    }

    // Frequency slide
    freqSlide += freqDeltaSlide;
    freq += freqSlide;
    if (freq < freqMin) { freq = freqMin; }
    if (freq < 0.0000001) freq = 0.0000001;

    // Vibrato
    vibPhase += vibSpeed;
    let modFreq = freq + freq * Math.sin(vibPhase) * vibDepth;

    period = 100.0 / (modFreq * modFreq + 0.001);

    // Pitch jump
    if (pjRepeat > 0) {
      pjTime++;
      if (!pjApplied1 && pjTime >= Math.floor(p.pitchJumpOnset1 * p.pitchJumpOnset1 * 20000)) {
        freq *= 1 + p.pitchJumpAmount1 * p.pitchJumpAmount1 * (p.pitchJumpAmount1 > 0 ? 1 : -1) * 0.5;
        pjApplied1 = true;
      }
      if (!pjApplied2 && pjTime >= Math.floor(p.pitchJumpOnset2 * p.pitchJumpOnset2 * 20000)) {
        freq *= 1 + p.pitchJumpAmount2 * p.pitchJumpAmount2 * (p.pitchJumpAmount2 > 0 ? 1 : -1) * 0.5;
        pjApplied2 = true;
      }
      if (pjTime >= pjRepeat) {
        pjTime = 0;
        pjApplied1 = false;
        pjApplied2 = false;
      }
    }

    // Duty
    duty += dutySweep;
    duty = Math.max(-0.5, Math.min(0.5, duty));

    // Wave generation
    phase += 1.0 / period;
    if (phase >= 1) {
      phase -= 1;
      if (waveform === 'noise' || waveform === 'bitnoise') {
        for (let n = 0; n < 32; n++) noiseBuf[n] = Math.random() * 2 - 1;
      }
    }

    let sample = 0;
    const t = phase;
    switch (waveform) {
      case 'sin':
        sample = Math.sin(t * Math.PI * 2);
        break;
      case 'triangle':
        sample = Math.abs(t - 0.5) * 4 - 1;
        break;
      case 'square':
        sample = t < (0.5 + duty) ? 1 : -1;
        break;
      case 'saw':
        sample = t * 2 - 1;
        break;
      case 'noise':
        sample = noiseBuf[Math.floor(t * 32) % 32];
        break;
      case 'bitnoise':
        sample = noiseBuf[Math.floor(t * 32) % 32] > 0 ? 1 : -1;
        break;
    }

    // Harmonics
    if (p.harmonics > 0) {
      let harm = sample;
      for (let h = 1; h <= Math.floor(p.harmonics * 10 + 1); h++) {
        const falloff = Math.pow(1 - p.harmonicsFalloff, h);
        harm += Math.sin(t * Math.PI * 2 * (h + 1)) * falloff * 0.5;
      }
      sample = harm;
    }

    // LP Filter
    if (lpEnabled) {
      lpCutoff *= lpCutoffSweep;
      lpCutoff = Math.max(0, Math.min(0.1, lpCutoff));
      const d = sample - lpVal;
      lpValD += d * lpCutoff;
      lpValD *= lpDamping;
      lpVal += lpValD;
      sample = lpVal;
    }

    // HP Filter
    hpCutoff *= hpCutoffSweep;
    hpCutoff = Math.max(0.00001, Math.min(0.1, hpCutoff));
    hpVal += sample - hpVal;
    sample -= hpVal * (1 - hpCutoff * 10);

    // Flanger
    if (p.flangerOffset !== 0 || p.flangerSweep !== 0) {
      flangerBuf[flangerIdx & 1023] = sample;
      const readIdx = (flangerIdx - Math.floor(flangerOffset)) & 1023;
      sample = (sample + flangerBuf[readIdx]) * 0.5;
      flangerIdx++;
      flangerOffset += flangerSweep;
    }

    // Bit crush
    if (bitCrush > 0) {
      bitCrush += bitCrushSweep;
      bitCrush = Math.max(0, Math.min(1, bitCrush));
      const factor = Math.pow(2, (1 - bitCrush) * 16);
      sample = Math.round(sample * factor) / factor;
    }

    // Compression
    if (p.compression > 0) {
      sample = Math.sign(sample) * Math.pow(Math.abs(sample), 1.0 - p.compression * 0.9);
    }

    sample *= env;
    sample = Math.max(-1, Math.min(1, sample));
    samples[i] = sample;
  }

  return samples;
}

function samplesToWav(samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666D7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    let val = Math.floor(samples[i] * 32767);
    val = Math.max(-32768, Math.min(32767, val));
    view.setInt16(44 + i * 2, val, true);
  }
  return new Uint8Array(buffer);
}
