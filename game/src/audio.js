// Coral Courier — sound, synthesized live with WebAudio. No audio files, no network.
// One clear job: engine hum, wind, ring chimes, touchdown thud and crash noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture at least once before any sound plays. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: a low sawtooth whose pitch follows the throttle, through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Wind: looped noise whose level follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(band);
    band.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    noise.start();
  }

  /** Per-frame engine + wind levels. `speed` in m/s, `throttle` 0..1, `flying` bool. */
  setFlight(throttle, speed, flying) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(48 + throttle * 95 + speed * 0.35, t, 0.1);
    this.engineGain.gain.setTargetAtTime(flying || throttle > 0.05 ? 0.028 + throttle * 0.05 : 0, t, 0.15);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, speed - 20) * 0.0016), t, 0.2);
  }

  _tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  chime() {
    this._tone(880, 0.35, 'sine', 0.16);
    this._tone(1318, 0.5, 'sine', 0.12, 0.09);
  }

  thud() {
    this._tone(70, 0.3, 'sine', 0.25);
    this._tone(140, 0.18, 'triangle', 0.12, 0.02);
  }

  crash() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.7;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    this._tone(55, 0.8, 'sine', 0.3);
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.14, i * 0.12));
  }

  click() {
    this._tone(660, 0.08, 'square', 0.06);
  }
}
