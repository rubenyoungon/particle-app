# Particle Flow

A browser particle toy that runs on the GPU with WebGL2: particles with glowing tails follow a curl-noise flow field. It includes kaleidoscope mirrors, touch or mouse attraction, and sound response.

## Run

Mic input only works on `localhost` or HTTPS, so serve the folder with a local server instead of opening the file directly:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Sound sources

Open the **Sound** folder in the settings panel:

- **Capture computer audio**: reacts to whatever your computer plays (Spotify, YouTube, games). In the browser's share prompt, pick **Entire screen** and tick **Share system audio**. This works in Chrome or Edge on Windows. On macOS, Chrome can only share audio from a single tab. Only the audio is used.
- **Use microphone**
- **Play audio file…**

## Controls

| Input | Action |
|---|---|
| Hold mouse / touch (multi-touch works) | Particles flow toward that point |
| Hover the top-right corner, click the tile | Open settings (closes when the mouse leaves) |
| H | Open / close settings |
| M | Cycle kaleidoscope segments |
| R | Randomize the look |
| C | Clear the screen |
| F | Fullscreen |
| Space | Pause |

Settings are saved in the browser automatically.

## How it works

- **Simulation**: particle positions and velocities stay on the GPU and are updated with transform feedback (`UPDATE_VS`).
- **Tails**: segments are added into a half-float trail buffer that is multiplied by a fade factor each frame.
- **Kaleidoscope**: the display shader folds each screen pixel's angle into one mirrored wedge. Touch points get the same fold, so particles head to the spot you see.
- **Sound**: Web Audio `AnalyserNode` splits the input into bands. Bass drives speed, mids drive brightness, and highs drive head size. Bass beats push particles outward and shift the hue.
