# Particle Flow

A browser particle toy that runs on the GPU with WebGL2. It has two visuals, picked with **Visual** at the top of the settings panel (or the V key):

- **Flow**: particles with glowing tails follow a curl-noise flow field, with touch or mouse attraction.
- **Fountain**: two 3D particle fountains sharing one nozzle: a red one spraying up, and below it a blue mirror image spraying down, just as wide but less tall. Their particles stretch into subtle droplets as they move, and the red ones have warm molten centers that cool as they travel. Each red particle has a blue twin that leaves the nozzle with it and meets it again in the middle, where both skip outward along the meeting plane in a run of low, mirrored bounces. Where red and blue particles overlap a lot, they turn whiter. Bass, mids and treble drive low, medium and high arcs respectively; beats raise the arcs and briefly increase the launch rate. Particles launch at different times and land near the same circle. Launch heights are capped to keep the spray on screen.

Both have kaleidoscope mirrors and sound response.

## Run

The code uses JavaScript modules, which browsers only load from a web server, so opening `public/index.html` directly from disk doesn't work. Serve the folder with a local server:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Sound

Open the **Sound** folder in the settings panel and click **Capture computer audio**. The particles then react to whatever your computer plays (Spotify, YouTube, games). In the browser's share prompt, pick **Entire screen** and tick **Share system audio**. This works in Chrome or Edge on Windows. On macOS, Chrome can only share audio from a single tab. Only the audio is used.

In Fountain mode, the relative levels of bass, mids and treble determine how many low, medium and high arcs launch. **Reaction** blends this frequency response in and controls the beat boost; **Sensitivity** adjusts the analyzed levels. Without audio capture, all three arc heights launch steadily.

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

No build step: `public/index.html` loads `public/js` as an ES module, which imports the rest.

| File | Contents |
|---|---|
| `public/index.html`, `public/style.css` | Page structure and styles |
| `public/js` | Startup and the per-frame loop |
| `public/js` | Default settings, saving and loading them |
| `public/js` | GPU shader code: noise, simulation, tails, heads, kaleidoscope |
| `public/js` | WebGL2 context and shader program helpers |
| `public/js` | The GPU passes run each frame: simulate, fade, draw, show |
| `public/js` | Particle buffers: creating them and rebuilding when Count changes |
| `public/js` | Fountain mode: its 3D simulation, camera projection, colours and draw passes |
| `public/js` | Trail and head buffers, resizing with the window |
| `public/js` | Mouse and touch attraction, kaleidoscope fold |
| `public/js` | Computer audio capture and sound analysis |
| `public/js` | Settings panel, corner tile, keyboard shortcuts |
| `public/js` | The message at the bottom of the screen |

## How it works

- **Simulation**: particle positions and velocities stay on the GPU and are updated with transform feedback (`UPDATE_VS`).
- **Tails**: segments are added into a half-float trail buffer that is multiplied by a fade factor each frame.
- **Kaleidoscope**: the display shader folds each screen pixel's angle into one mirrored wedge. Touch points get the same fold, so particles head to the spot you see. Flow and Fountain each keep their own segment count and rotation speed.
- **Fountain**: particles are simulated in 3D as one upward fountain (launch, gravity, a few bounces on the meeting plane, then respawn at the nozzle). Each particle is drawn twice: as is (red), and flipped upside down with its height scaled (blue). The tail and head vertex shaders then project everything through a simple perspective camera and draw it into the same buffers as Flow, so trails and the kaleidoscope work the same. Fountain draws solid, soft-edged tails and droplet-shaped heads instead of Flow's glows: the display pass lays its heads over the trails rather than adding them as light. A depth buffer keeps heads further back behind nearer ones. **Softness** then draws the finished image into a buffer, shrinks it by half up to 4 times (averaging pixels) and stretches it smoothly back to the screen, mixing the two nearest sizes for in-between values, so neighbouring particles melt together the way a low-resolution visualizer looked. Particles land on or near the circle set by **Ring radius**, with varied launch heights and times. Beats make the fountains spray higher and temporarily increase the rate of independently timed launches.
- **Sound**: Web Audio `AnalyserNode` splits the input into bands. Bass drives speed; particle size and brightness stay steady. Bass beats make the flow surge and shift the hue.
