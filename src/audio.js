// Minimal synthesized sound: wind, footfalls, blade rings. No audio files needed.
export class Sound {
  constructor() {
    this.ctx = null;
  }

  // Browsers only allow audio after a user gesture.
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise();
    this.startWind();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  startWind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(bp.frequency);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2Gain = c.createGain();
    lfo2Gain.gain.value = 0.03;
    lfo2.connect(lfo2Gain).connect(g.gain);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    lfo2.start();
  }

  noiseBurst({ type = 'lowpass', freq = 800, q = 1, gain = 0.3, dur = 0.15, sweepTo = null, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(freq, gain, dur, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // steel on steel: inharmonic partials with a long tail
  ring(strength = 1, pitch = 1) {
    const base = 1180 * pitch * (0.97 + Math.random() * 0.06);
    [1, 2.27, 3.41, 4.63, 6.1].forEach((m, i) => this.tone(base * m, (0.12 / (i + 1)) * strength, 1.6 - i * 0.2));
    this.noiseBurst({ type: 'highpass', freq: 3000, gain: 0.25 * strength, dur: 0.06 });
  }
  whoosh() { this.noiseBurst({ type: 'bandpass', freq: 600, sweepTo: 2400, q: 1.2, gain: 0.18, dur: 0.22 }); }
  step() { this.noiseBurst({ type: 'lowpass', freq: 300, gain: 0.12, dur: 0.1 }); }
  cut() {
    this.noiseBurst({ type: 'bandpass', freq: 1800, sweepTo: 500, q: 0.8, gain: 0.4, dur: 0.18 });
    this.tone(70, 0.4, 0.25);
  }
  thud() { this.tone(55, 0.45, 0.5); this.noiseBurst({ type: 'lowpass', freq: 200, gain: 0.3, dur: 0.3 }); }
  sheathe() { this.noiseBurst({ type: 'bandpass', freq: 2600, sweepTo: 1200, q: 3, gain: 0.08, dur: 0.25 }); this.tone(2400, 0.03, 0.3); }
  drum() { this.tone(48, 0.6, 1.2); this.tone(96, 0.2, 0.6); this.noiseBurst({ type: 'lowpass', freq: 160, gain: 0.35, dur: 0.6 }); }
  parry() { this.tone(2900, 0.12, 0.9); this.tone(4400, 0.06, 0.6); this.noiseBurst({ type: 'bandpass', freq: 900, q: 0.7, gain: 0.35, dur: 0.12 }); this.tone(110, 0.3, 0.3); }
  tell() { this.tone(3600, 0.018, 0.25); }
}
