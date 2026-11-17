// Sound input (computer audio) and analysis into bass/mid/high levels.

import { params } from './settings.js';
import { showHint } from './hint.js';

// Levels are 0..1; level is the overall loudness. kick is 1 on a bass beat and
// decays; beat is true only on the frame a beat is detected; hueKick grows with
// each beat.
export const audio = { ctx: null, analyser: null, data: null, srcNode: null, stream: null,
                       mode: 'off', bass: 0, mid: 0, high: 0, level: 0, bassAvg: 0, bassDev: 0, bassPrev: 0,
                       kick: 0, beat: false, lastKick: 0, hueKick: 0 };

const meter = document.getElementById('meter');

// How far above its recent average the bass must jump to count as a beat, in
// multiples of how much it usually varies. Lower catches more beats.
const BEAT_THRESHOLD = 1.4;

function ensureAudio() {
  if (!audio.ctx) {
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.analyser = audio.ctx.createAnalyser();
    // A short window and light smoothing, so beats show up without lag.
    audio.analyser.fftSize = 1024;
    audio.analyser.smoothingTimeConstant = 0.2;
    audio.analyser.minDecibels = -85;
    audio.analyser.maxDecibels = -20;
    audio.data = new Uint8Array(audio.analyser.frequencyBinCount);
  }
  audio.ctx.resume();
}

export function stopAudio() {
  if (audio.srcNode) { try { audio.srcNode.disconnect(); } catch (e) {} audio.srcNode = null; }
  if (audio.stream) { audio.stream.getTracks().forEach(t => t.stop()); audio.stream = null; }
  audio.mode = 'off';
  meter.style.display = 'none';
}

// Computer audio: the screen-share prompt can include system audio
// (Chrome/Edge on Windows: pick "Entire screen" and tick "Share system audio").
export async function startSystemAudio() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showHint('This browser cannot capture computer audio. Use Chrome or Edge.');
    return;
  }
  try {
    ensureAudio();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,   // required by browsers; the video track is disabled below
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
    });
    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      stream.getTracks().forEach(t => t.stop());
      showHint('No audio was shared. Choose "Entire screen" and tick "Share system audio".');
      return;
    }
    stopAudio();
    stream.getVideoTracks().forEach(t => t.enabled = false);
    audio.stream = stream;
    audio.srcNode = audio.ctx.createMediaStreamSource(new MediaStream(tracks));
    audio.srcNode.connect(audio.analyser);   // not to the speakers: you already hear it
    audio.mode = 'system';
    tracks[0].addEventListener('ended', () => { if (audio.stream === stream) stopAudio(); });
    meter.style.display = 'flex';
  } catch (e) {
    if (e.name !== 'NotAllowedError') showHint('Could not capture computer audio: ' + (e.message || e.name));
  }
}

// Called once per frame: updates audio.bass/mid/high/kick and the level meter.
export function analyzeAudio(dt, time) {
  const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
  if (audio.mode === 'off') {
    audio.bass = ease(audio.bass, 0, 5); audio.mid = ease(audio.mid, 0, 5); audio.high = ease(audio.high, 0, 5);
    audio.level = ease(audio.level, 0, 5);
    audio.kick *= Math.exp(-dt * 5);
    audio.beat = false;
    return;
  }
  const d = audio.data, hz = audio.ctx.sampleRate / audio.analyser.fftSize;
  audio.analyser.getByteFrequencyData(d);
  const band = (lo, hi) => {
    const a = Math.max(1, Math.floor(lo / hz)), b = Math.min(d.length - 1, Math.ceil(hi / hz));
    let s = 0; for (let i = a; i <= b; i++) s += d[i];
    return s / ((b - a + 1) * 255);
  };
  const sens = params.audioSensitivity;
  const shape = v => Math.min(1, Math.max(0, (v - 0.12) * 1.6 * sens));
  const b = band(20, 150), m = band(150, 2000), h = band(2000, 10000);
  audio.bass = ease(audio.bass, shape(b), 15);
  audio.mid  = ease(audio.mid,  shape(m * 1.2), 12);
  audio.high = ease(audio.high, shape(h * 1.8), 8);
  // Overall loudness: silence (below the noise floor) is 0.
  audio.level = ease(audio.level, shape(0.5 * b + 0.35 * m * 1.2 + 0.15 * h * 1.8), 6);
  // Beat: the bass jumps well above its recent average, measured against how
  // much it usually wobbles around that average. The spectrum is in decibels,
  // so a fixed ratio (as before) needed a huge jump and missed most beats; this
  // adapts to each track's own dynamics instead.
  const jump = b - audio.bassAvg;
  audio.beat = b > audio.bassPrev && jump > BEAT_THRESHOLD * audio.bassDev / sens + 0.008
               && time - audio.lastKick > 0.1;
  if (audio.beat) {
    audio.kick = 1; audio.lastKick = time; audio.hueKick += 0.06;
  }
  audio.bassAvg = ease(audio.bassAvg, b, 3);
  audio.bassDev = ease(audio.bassDev, Math.abs(jump), 3);
  audio.bassPrev = b;
  audio.kick *= Math.exp(-dt * 5);
  const bars = meter.children;
  [audio.bass, audio.mid, audio.high].forEach((v, i) => bars[i].style.height = (2 + v * 38) + 'px');
}
