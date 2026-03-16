# Video Synth Recreation — Learnings & Findings

Notes from building the Chromascope recreation, applicable to future analog video synth projects.

---

## Architecture that worked

### Single-page WebGL with ping-pong FBOs
The core pattern: render to framebuffer A while reading from framebuffer B, then swap. This gives you feedback/persistence for free — essential for any video synth that has trailing, ghosting, or echo effects.

```
Frame N:  read FBO[0] → render → write FBO[1] → copy to screen
Frame N+1: read FBO[1] → render → write FBO[0] → copy to screen
```

### Fragment shader does everything
All the visual work lives in a single fragment shader. The JavaScript side just manages state, UI, and passes uniforms. This keeps the architecture simple and the rendering fast.

### Uniform-driven parameter changes
Every knob/fader maps to a shader uniform. Sequence changes just swap a bag of uniform values. This makes it trivial to add new parameters — add a uniform to the shader, add a value to the params object, wire up a control.

---

## How analog video synths actually work

### Independent R/G/B function generators
The key insight from studying the Chromascope: each colour gun (R, G, B) is driven by its own oscillator(s). Colour comes from *frequency differences between channels*, not from a single pattern with colour mapping applied.

```glsl
// Each gun has independent H and V frequencies
float hR = wave(px * freqR_H * TAU + phase, waveform);
float hG = wave(px * freqG_H * TAU + phase, waveform);  // different freq = colour
```

This is fundamentally different from the naive approach of generating one pattern and colouring it. Get this wrong and everything looks digital.

### Waveform variety matters enormously
Real hardware has sine, square, triangle, and sawtooth generators. Square waves in particular create the hard-edged geometric patterns that define the look. If you only use sine waves, everything looks too smooth and organic.

- **Sine** → soft gradients, washes
- **Square** → hard bars, checkerboards, bold geometry
- **Triangle** → angular patterns with more definition than sine
- **Sawtooth** → asymmetric ramps (less common but distinctive)

The Chromascope reference showed square waves in ~35% of sequences and triangle in ~25%. Don't default to sine.

### Frequency ranges define the visual vocabulary
From studying the full reference video:

| Frequency range | Visual result |
|----------------|---------------|
| 0.1–0.5 | Screen-filling colour washes |
| 0.5–3.0 | Large lozenges, broad bands |
| 3–8 | Medium bars, grids |
| 8–14 | Tight grids, fine detail |

Most sequences use a mix — e.g. low vertical frequency (broad horizontal bands) with high horizontal frequency (many vertical bars within each band).

### Near-monochrome is common
Real synths often produce sequences where all three guns are nearly in phase — giving near-monochrome output in red, magenta, cyan, etc. Budget ~25% of random sequences for this. It's a signature look.

---

## CRT simulation

### What matters most (in order)
1. **Scanlines** — 576 for PAL, 480 for NTSC. Darken gaps between lines.
2. **Feedback persistence** — heavy ghosting/trailing is characteristic of CRT phosphor decay
3. **Horizontal colour fringing** — R and B channels offset slightly left/right (shadow mask misalignment)
4. **Bloom** — bright areas bleed into neighbours
5. **Interlace** — alternate fields offset by half a line, 50Hz (PAL) or 60Hz (NTSC)
6. **Phosphor grain** — subtle noise

### What to get right per standard

| | PAL | NTSC |
|---|-----|------|
| Visible lines | 576 | 480 |
| Field rate | 50 Hz | 60 Hz |
| Aspect ratio | 4:3 | 4:3 |
| Chroma subcarrier | 4.43 MHz | 3.58 MHz |
| Colour artefact | Diagonal herringbone | Rainbow fringing |

PAL chroma cross-talk creates a diagonal pattern:
```glsl
float chromaXT = sin((uv.x * 768.0 + uv.y * 576.0) * PI) * 0.02;
col.r += chromaXT;
col.b -= chromaXT;
```

### Feedback tricks
- Slight **zoom** in feedback UV (0.998 scale) creates trailing/persistence
- Slight **rotation** (0.002 rad) creates spiral ghost trails
- **Horizontal offset** (0.0015) simulates CRT beam smear
- **Per-channel horizontal smear** — offset R right and B left in feedback reads for colour bleeding

### Corner vignette, not edge darkening
Real CRTs are bright edge-to-edge. Only the extreme corners darken. Heavy vignetting looks wrong.

---

## "Worn" / degraded effects

These sell authenticity but must be optional and adjustable:

- **Colour gun misalignment** — increased R/B horizontal offset
- **Rolling bar** — slow sine wave moving vertically, shifting colour (not darkening)
- **Sync tear** — random horizontal scan line shifts
- **Vertical hold wobble** — slow vertical displacement
- **Brightness surge** — on sync glitch moments
- **Extra noise** — amplified phosphor grain

Important: worn effects should shift colour, not darken the image. Early versions that darkened areas looked wrong compared to real degraded hardware.

---

## Sequence generation tips

### Random parameter generation
For auto-sequencing, define distinct *modes* (wash, bars, grid, etc.) and pick one randomly per step. Within each mode, randomise parameters within characteristic ranges. This produces more variety than pure random across the whole parameter space.

### What the real hardware cycles through
From 52 frames across 4:21 of Chromascope footage:
- ~10% rainbow gradients (very low, widely separated R/G/B frequencies)
- ~10% colour washes (nearly flat, very low frequency)
- ~20% large lozenges (low-frequency grid interference)
- ~20% vertical bar patterns
- ~20% horizontal band patterns
- ~20% tight grids/checkerboards

### Transition style
The Chromascope does hard cuts between sequences — no crossfade. Some other synths (Sandin, Rutt/Etra) have smoother transitions. Match the hardware you're recreating.

---

## Common mistakes to avoid

1. **Single-signal-with-colour-map** — looks digital. Use independent per-channel oscillators.
2. **Sine-only waveforms** — too soft. Mix in square and triangle.
3. **Too much vignetting** — CRTs are bright. Corner-only darkening.
4. **Worn = dark** — worn analog gear shifts colour and tears sync, it doesn't dim.
5. **Over-engineering the shader** — the real hardware is simple function generators summed together. Complex math looks wrong. Start simple.
6. **Ignoring aspect ratio** — force 4:3. Widescreen looks immediately wrong for period hardware.
7. **60Hz for PAL gear** — match the field rate to the video standard the hardware used.

---

## Other synths to research

For future recreations, each has a distinct visual signature:

- **Sandin Image Processor** (1973) — patch-programmable, more abstract/fluid
- **Rutt/Etra Video Synthesizer** (1973) — scan-line displacement, 3D-looking surfaces
- **Fairlight CVI** (1983) — digital effects on video input, solarisation, quantisation
- **Jones Colorizer** (Dave Jones, 1970s) — keying/colourising camera input
- **Paik-Abe Video Synthesizer** (1969) — magnet-distorted CRT, very organic
- **EMS Spectron** (1974) — UK, similar era to Chromascope, spectral processing
- **LZX Industries Vidiot** (modern) — Eurorack analog video, good reference for modular signal flow

---

## Project structure recommendation

```
synth-name/
  index.html        — HTML shell only (~100 lines)
  style.css          — all CSS
  synth-name.js      — all JS + shader sources
  test/              — Node.js tests for pure functions
  README.md          — what, how to run, controls, deps
  .gitignore         — exclude media, IDE, build artefacts
  reference/         — gitignored reference images/video
```

Keep it as a zero-dependency static site. No build step, no npm. WebGL + Web Audio API cover everything needed.
