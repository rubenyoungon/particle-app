// Entry point: startup and the per-frame loop.

import { params, COLOR_MODES } from './settings.js';
import { resize, pixelRatio } from './render-targets.js';
import { particles, rebuildParticles } from './particles.js';
import { kaleido, updateAttractors } from './input.js';
import { audio, analyzeAudio } from './audio.js';
import { ui } from './ui.js';
import { simulate, fadeTrails, drawParticles, present } from './renderer.js';
import { simulateFountain, drawFountain } from './fountain.js';

resize();
rebuildParticles();

// Fountain flow (share of particles in the air) when no audio is being captured.
const IDLE_FLOW = 0.5;
let last = performance.now(), time = 0, flowTime = 0, hueTime = 0, fountainYaw = 0;

function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const dt = ui.paused ? 0 : realDt;
  time += realDt;
  resize();
  analyzeAudio(realDt, time);

  const react = params.audioReact;
  // Sound changes motion and colour only; particle size and brightness stay steady.
  const speedMul = 1 + audio.bass * react * 1.5;
  flowTime += dt * params.evolve * speedMul;
  hueTime += dt * params.hueCycle;
  kaleido.rot += dt * params.mirrorSpin;

  const attractors = updateAttractors(realDt);

  const fountain = params.mode === 'Fountain';
  fountainYaw += dt * params.fountainSpin;

  if (dt > 0) {
    if (fountain) {
      const bandLevel = (audio.bass + audio.mid + audio.high) / 3;
      const bandReaction = Math.min(1, react);
      const bands = audio.mode === 'off' ? [1, 1, 1] : [
        bandLevel + (audio.bass - bandLevel) * bandReaction,
        bandLevel + (audio.mid - bandLevel) * bandReaction,
        bandLevel + (audio.high - bandLevel) * bandReaction,
      ];
      simulateFountain(dt, {
        time,
        height: params.fountainHeight,
        ring: params.fountainRing,
        bands,
        // Beats boost the selected height range, subject to the shader's cap.
        power: 1,
        kick: audio.kick * react * 0.7,
        // Each band contributes to the launch rate; beats briefly increase it.
        flow: audio.mode === 'off' ? IDLE_FLOW
            : Math.min(0.9, (audio.bass + audio.mid + audio.high) * 0.25 * (1 + 0.8 * audio.kick * react)),
      });
    } else {
      simulate(dt, {
        time: flowTime,
        speed: params.speed * speedMul,
        scale: params.flowScale,
        inertia: params.inertia,
        spread: params.spread,
        attract: params.attract,
        swirl: params.swirl,
        kick: audio.kick * react * 0.8,
        attractors,
      });
    }

    const tail = fountain ? params.fountainTail : params.tail;
    fadeTrails(Math.pow(1 - Math.pow(10, -(0.7 + tail * 2.3)), dt * 60));

    const widthPx = Math.max(1, params.lineWidth * pixelRatio());
    const count = fountain ? params.fountainCount : particles.count;
    const densityComp = Math.min(8, Math.max(0.3, Math.sqrt(20000 / count)));
    if (fountain) {
      const headPx = widthPx * params.fountainScale * params.headSize;
      drawFountain({
        widthPx: headPx,                                           // tails as wide as the heads
        headSizePx: headPx,
        intensity: params.brightness * 0.1 * densityComp,
        headIntensity: params.brightness * 0.55,  // heads show their colour directly, subdued
        saturation: params.saturation,
        headGlow: params.headGlow,
      }, {
        dt, yaw: fountainYaw, tilt: params.fountainTilt, zoom: 1.15, height: params.fountainHeight,
        lower: params.fountainLower,
      });
    } else drawParticles({
      widthPx,
      headSizePx: widthPx * params.headSize,
      hue: params.hue + hueTime + audio.hueKick * react,
      hueSpread: params.hueSpread,
      saturation: params.saturation,
      intensity: params.brightness * 0.12 * densityComp,
      colorMode: Math.max(0, COLOR_MODES.indexOf(params.colorMode)),
      tailGlow: params.tailGlow,
      headGlow: params.headGlow,
    });
  }

  present(Math.round(params.mirrors), kaleido.rot, fountain, fountain ? params.fountainSoftness : 0);
}
requestAnimationFrame(frameLoop);
