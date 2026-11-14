// Entry point: startup and the per-frame loop.

import { params, COLOR_MODES } from './settings.js';
import { resize, pixelRatio } from './render-targets.js';
import { particles, rebuildParticles } from './particles.js';
import { kaleido, updateAttractors } from './input.js';
import { audio, analyzeAudio } from './audio.js';
import { ui } from './ui.js';
import { simulate, fadeTrails, drawParticles, present } from './renderer.js';

resize();
rebuildParticles();

let last = performance.now(), time = 0, flowTime = 0, hueTime = 0;

function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const dt = ui.paused ? 0 : realDt;
  time += realDt;
  resize();
  analyzeAudio(realDt, time);

  const react = params.audioReact;
  const speedMul = 1 + audio.bass * react * 1.5;
  const brightMul = 1 + audio.mid * react * 1.2;
  // Highs pulse the head size. The tail keeps a steady width: a width that changes
  // every frame would be baked into the tail as jagged steps.
  const headMul = 1 + audio.high * react * 1.2;
  flowTime += dt * params.evolve * speedMul;
  hueTime += dt * params.hueCycle;
  kaleido.rot += dt * params.mirrorSpin;

  const attractors = updateAttractors(realDt);

  if (dt > 0) {
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

    fadeTrails(Math.pow(1 - Math.pow(10, -(0.7 + params.tail * 2.3)), dt * 60));

    const widthPx = Math.max(1, params.lineWidth * pixelRatio());
    const densityComp = Math.min(8, Math.max(0.3, Math.sqrt(20000 / particles.count)));
    drawParticles({
      widthPx,
      headSizePx: widthPx * params.headSize * headMul,
      hue: params.hue + hueTime + audio.hueKick * react,
      hueSpread: params.hueSpread,
      saturation: params.saturation,
      intensity: params.brightness * 0.12 * brightMul * densityComp,
      colorMode: Math.max(0, COLOR_MODES.indexOf(params.colorMode)),
      tailGlow: params.tailGlow,
      headGlow: params.headGlow,
    });
  }

  present(Math.round(params.mirrors), kaleido.rot);
}
requestAnimationFrame(frameLoop);
