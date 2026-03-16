# Chromascope

A digital recreation of the **CEL Chromascope Video Synthesizer** (1981, UK) — built as a single-page WebGL app with PAL CRT simulation.

## What it does

Generates real-time abstract video patterns using independent R/G/B function generators, ping-pong feedback buffers, and PAL-authentic CRT effects (576-line scanlines, 50Hz interlace, chroma cross-talk, phosphor bloom). Patterns auto-sequence on a timer or react to microphone input.

## Usage

Serve the directory with any static HTTP server and open in a browser:

```bash
npx serve . -l 3333
```

Then visit `http://localhost:3333`.

### Controls

| Key       | Action              |
|-----------|---------------------|
| `Space`   | Toggle control panel |
| `F`       | Fullscreen           |
| `H`       | Hold (freeze sequence) |
| `S`       | Step (next pattern)  |
| `A`       | Toggle microphone    |

The control panel also provides RGB colour balance faders, Form Modification timers (A–D), sequence speed, audio level, and a Pristine/Worn condition toggle.

## Dependencies

None — pure HTML/CSS/JavaScript with raw WebGL. No build step, no npm packages.

## Browser support

Requires WebGL 1.0 and Web Audio API. Tested in Chrome and Safari on macOS.
