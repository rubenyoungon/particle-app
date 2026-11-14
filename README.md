# Particle Flow

A browser particle toy that runs on the GPU with WebGL2. It has two visuals, picked with **Visual** at the top of the settings panel (or the V key):

- **Flow**: particles with glowing tails follow a curl-noise flow field, with touch or mouse attraction.
- **Fountain**: two 3D particle fountains sharing one nozzle: a red one spraying up, and below it a blue mirror image spraying down, just as wide but less tall. Each red particle has a blue twin that leaves the nozzle with it and meets it again in the middle, where both skip outward along the meeting plane in a run of low, mirrored bounces. Where red and blue particles overlap a lot, they turn whiter. The fountain only flows while music plays on the captured computer audio, more strongly the louder it is.

Both have kaleidoscope mirrors and sound response.

## Run

The code uses JavaScript modules, which browsers only load from a web server, so opening `index.html` directly from disk doesn't work. Serve the folder with a local server:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Sound

Open the **Sound** folder in the settings panel and click **Capture computer audio**. The particles then react to whatever your computer plays (Spotify, YouTube, games). In the browser's share prompt, pick **Entire screen** and tick **Share system audio**. This works in Chrome or Edge on Windows. On macOS, Chrome can only share audio from a single tab. Only the audio is used.

## Controls

| Input | Action |
|---|---|
| Hold mouse / touch (multi-touch works) | Particles flow toward that point (Flow only) |
| V | Switch between Flow and Fountain |
| Hover the top-right corner, click the tile | Open settings (closes when the mouse leaves) |
| H | Open / close settings |
| M | Cycle kaleidoscope segments |
| 0 | Stop kaleidoscope rotation |
| R | Randomize the look |
| C | Clear the screen |
| F | Fullscreen |
| Space | Pause |

Settings are saved in the browser automatically.

## Code layout

No build step: `index.html` loads `js/main.js` as an ES module, which imports the rest.

| File | Contents |
|---|---|
| `index.html`, `style.css` | Page structure and styles |
| `js/main.js` | Startup and the per-frame loop |
| `js/settings.js` | Default settings, saving and loading them |
| `js/shaders.js` | GPU shader code: noise, simulation, tails, heads, kaleidoscope |
| `js/gl.js` | WebGL2 context and shader program helpers |
| `js/renderer.js` | The GPU passes run each frame: simulate, fade, draw, show |
| `js/particles.js` | Particle buffers: creating them and rebuilding when Count changes |
| `js/fountain.js` | Fountain mode: its 3D simulation, camera projection, colours and draw passes |
| `js/render-targets.js` | Trail and head buffers, resizing with the window |
| `js/input.js` | Mouse and touch attraction, kaleidoscope fold |
| `js/audio.js` | Computer audio capture and sound analysis |
| `js/ui.js` | Settings panel, corner tile, keyboard shortcuts |
| `js/hint.js` | The message at the bottom of the screen |

## How it works

- **Simulation**: particle positions and velocities stay on the GPU and are updated with transform feedback (`UPDATE_VS`).
- **Tails**: segments are added into a half-float trail buffer that is multiplied by a fade factor each frame.
- **Kaleidoscope**: the display shader folds each screen pixel's angle into one mirrored wedge. Touch points get the same fold, so particles head to the spot you see. Flow and Fountain each keep their own segment count and rotation speed.
- **Fountain**: particles are simulated in 3D as one upward fountain (launch, gravity, a few bounces on the meeting plane, then respawn at the nozzle). Each particle is drawn twice: as is (red), and flipped upside down with its height scaled (blue). The tail and head vertex shaders then project everything through a simple perspective camera and draw it into the same buffers as Flow, so trails and the kaleidoscope work the same. Fountain draws solid, soft-edged tails and opaque disc heads instead of Flow's glows: the display pass lays its heads over the trails rather than adding them as light. A depth buffer keeps heads further back behind nearer ones. **Softness** then draws the finished image into a buffer, shrinks it by half up to 4 times (averaging pixels) and stretches it smoothly back to the screen, mixing the two nearest sizes for in-between values, so neighbouring particles melt together the way a low-resolution visualizer looked. Each launch is aimed so a normal particle comes back down on a ring (Ring radius); particles that fly higher land farther out in proportion to their peak height, so higher arcs curve wider. Bass and beats make the fountains spray higher.
- **Sound**: Web Audio `AnalyserNode` splits the input into bands. Bass drives speed; particle size and brightness stay steady. Bass beats make the flow surge and shift the hue.
