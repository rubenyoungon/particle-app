// Sound input (computer audio, microphone or a file) and analysis into bass/mid/high levels.

import { params } from './settings.js';
import { showHint } from './hint.js';

// Levels are 0..1. kick is 1 on a bass beat and decays; hueKick grows with each beat.
export const audio = { ctx: null, analyser: null, data: null, srcNode: null, stream: null, el: null,
                       mode: 'off', bass: 0, mid: 0, high: 0, bassAvg: 0, kick: 0, lastKick: 0, hueKick: 0 };

const meter = document.getElementById('meter');
const fileInput = document.getElementById('file');

function ensureAudio() {
  if (!audio.ctx) {
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.analyser = audio.ctx.createAnalyser();
    audio.analyser.fftSize = 2048;
    audio.analyser.smoothingTimeConstant = 0.7;
    audio.analyser.minDecibels = -85;
    audio.analyser.maxDecibels = -20;
    audio.data = new Uint8Array(audio.analyser.frequencyBinCount);
  }
  audio.ctx.resume();
}

export function stopAudio() {
  if (audio.srcNode) { try { audio.srcNode.disconnect(); } catch (e) {} audio.srcNode = null; }
  if (audio.stream) { audio.stream.getTracks().forEach(t => t.stop()); audio.stream = null; }
  if (audio.el) { audio.el.pause(); URL.revokeObjectURL(audio.el.src); audio.el = null; }
  audio.mode = 'off';
  meter.style.display = 'none';
}

export async function startMic() {
  try {
    ensureAudio();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    stopAudio();
    audio.stream = stream;
    audio.srcNode = audio.ctx.createMediaStreamSource(stream);
    audio.srcNode.connect(audio.analyser);   // not to the speakers: avoids feedback
    audio.mode = 'mic';
    meter.style.display = 'flex';
  } catch (e) {
    showHint('Microphone unavailable: ' + (e.message || e.name) + '. It needs https or localhost.');
  }
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

function startFile(file) {
  ensureAudio();
  stopAudio();
  const el = new Audio(URL.createObjectURL(file));
  el.loop = true;
  audio.el = el;
  audio.srcNode = audio.ctx.createMediaElementSource(el);
  audio.srcNode.connect(audio.analyser);
  audio.srcNode.connect(audio.ctx.destination);
  el.play();
  audio.mode = 'file';
  meter.style.display = 'flex';
}

export function pickAudioFile() { fileInput.click(); }
fileInput.addEventListener('change', () => { if (fileInput.files[0]) startFile(fileInput.files[0]); fileInput.value = ''; });

// Called once per frame: updates audio.bass/mid/high/kick and the level meter.
export function analyzeAudio(dt, time) {
  const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
  if (audio.mode === 'off') {
    audio.bass = ease(audio.bass, 0, 5); audio.mid = ease(audio.mid, 0, 5); audio.high = ease(audio.high, 0, 5);
    audio.kick *= Math.exp(-dt * 5);
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
  audio.bassAvg = ease(audio.bassAvg, b, 1.5);
  if (b > audio.bassAvg * 1.25 + 0.04 / sens && time - audio.lastKick > 0.18) {
    audio.kick = 1; audio.lastKick = time; audio.hueKick += 0.06;
  }
  audio.kick *= Math.exp(-dt * 5);
  const bars = meter.children;
  [audio.bass, audio.mid, audio.high].forEach((v, i) => bars[i].style.height = (2 + v * 38) + 'px');
}
