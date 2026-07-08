// lib/game/audio.ts
// Procedural sound effects using Web Audio API — no audio files required.
// AudioContext is created lazily on the first user gesture to comply with
// browser autoplay policy.

let _ctx: AudioContext | null = null;
// Master gain node — all oscillators route through this before destination
let _masterGain: GainNode | null = null;
// Current volume level [0, 1]
let _volume = 0.7;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new AudioContext();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = _volume;
      _masterGain.connect(_ctx.destination);
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser blocked autoplay before first gesture)
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return _ctx;
}

function getMasterGain(): GainNode | null {
  getCtx(); // ensure initialised
  return _masterGain;
}

// Initialise (or resume) the AudioContext on user gesture.
// Call this from any click / keydown / touchstart handler.
export function initAudio(): void {
  getCtx();
}

// Set master volume. v is 0..1.
export function setVolume(v: number): void {
  _volume = Math.max(0, Math.min(1, v));
  if (_masterGain) {
    _masterGain.gain.value = _volume;
  }
}

// Get current master volume [0, 1].
export function getVolume(): number {
  return _volume;
}

// --- Internal helper ---

function playTone(
  frequency: number,
  type: OscillatorType,
  gainPeak: number,
  startTime: number,
  duration: number,
  freqEnd?: number,
): void {
  const ctx = getCtx();
  const masterGain = getMasterGain();
  if (!ctx || !masterGain) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  // Route through master gain instead of directly to destination
  gain.connect(masterGain);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  if (freqEnd !== undefined) {
    osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

// --- Public sound functions ---

export function playHitPaddle(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Short blip, medium pitch ~300 Hz
  playTone(300, "square", 0.18, now, 0.08, 260);
}

export function playHitBrick(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Higher pitch blip ~520 Hz
  playTone(520, "square", 0.14, now, 0.06, 480);
}

export function playDestroyBrick(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Satisfying crunch: short noise burst via detuned sawtooth + rapid frequency drop
  playTone(440, "sawtooth", 0.22, now, 0.04, 120);
  playTone(220, "sawtooth", 0.18, now + 0.03, 0.07, 60);
}

export function playBallLost(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Descending tone
  playTone(400, "sine", 0.25, now, 0.15, 120);
  playTone(180, "sine", 0.18, now + 0.12, 0.20, 80);
}

export function playWin(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Ascending arpeggio: C E G C (simplified as 261, 330, 392, 523 Hz)
  const notes = [261, 330, 392, 523, 659];
  notes.forEach((freq, i) => {
    playTone(freq, "triangle", 0.22, now + i * 0.1, 0.18);
  });
}

export function playGameOver(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Low descending notes
  const notes = [220, 185, 155, 110];
  notes.forEach((freq, i) => {
    playTone(freq, "sawtooth", 0.20, now + i * 0.18, 0.22);
  });
}

export function playPowerupPickup(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Rising two-tone chime
  playTone(440, "triangle", 0.20, now, 0.08);
  playTone(660, "triangle", 0.22, now + 0.07, 0.12);
}

export function playLaserShoot(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Short high-frequency zap
  playTone(880, "square", 0.12, now, 0.05, 440);
}

export function playLevelUp(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Ascending arpeggio (shorter than win)
  const notes = [330, 440, 550, 660];
  notes.forEach((freq, i) => {
    playTone(freq, "triangle", 0.18, now + i * 0.08, 0.12);
  });
}
