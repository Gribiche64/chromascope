// ============================================================
// CHROMASCOPE DIGITAL VIDEO SYNTHESIZER
// ============================================================

const canvas = document.getElementById('display');
const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });

// ----- Sequence parameter generator -----

function generateSequenceParams() {
  // 1981 analog hardware — from studying full 4:21 reference video.
  // R, G, B guns can have INDEPENDENT H and V frequencies.
  // Square waves are very common. Frequency range goes from
  // screen-filling washes (0.2) to tight grids (12+).

  const mode = Math.random();
  let hFreqR, vFreqR, hFreqG, vFreqG;
  let waveH = 0, waveV = 0;  // 0=sine, 1=square, 3=triangle

  // Pick waveform — square waves are very common in reference
  const wavePick = Math.random();
  if (wavePick < 0.4) waveH = 0;       // sine
  else if (wavePick < 0.75) waveH = 1;  // square (hard edges)
  else waveH = 3;                        // triangle
  const wavePick2 = Math.random();
  if (wavePick2 < 0.4) waveV = 0;
  else if (wavePick2 < 0.75) waveV = 1;
  else waveV = 3;

  if (mode < 0.1) {
    // Rainbow gradient — R,G,B at very different low freqs (frames 21, 39, 45)
    hFreqR = 0.2 + Math.random() * 0.4;
    vFreqR = 0.1 + Math.random() * 0.3;
    hFreqG = 0.3 + Math.random() * 0.5;
    vFreqG = 0.2 + Math.random() * 0.4;
    waveH = 0; waveV = 0;
  } else if (mode < 0.2) {
    // Colour wash — very low frequency, nearly flat screen (frames 25,29,49)
    hFreqR = 0.15 + Math.random() * 0.5;
    vFreqR = 0.15 + Math.random() * 0.5;
    hFreqG = hFreqR * (0.8 + Math.random() * 0.4);
    vFreqG = vFreqR * (0.8 + Math.random() * 0.4);
    waveH = 0; waveV = 0;
  } else if (mode < 0.4) {
    // Big lozenges — low frequency grid (frames 1, 3, 7, 13)
    const base = 0.5 + Math.random() * 2.5;
    hFreqR = base;
    vFreqR = base * (0.6 + Math.random() * 0.8);
    hFreqG = hFreqR * (0.7 + Math.random() * 0.6);
    vFreqG = vFreqR * (0.7 + Math.random() * 0.6);
  } else if (mode < 0.6) {
    // Vertical bars (frames 17, 19, 33, 35)
    hFreqR = 3 + Math.random() * 10;
    vFreqR = 0.2 + Math.random() * 1;
    hFreqG = hFreqR * (0.8 + Math.random() * 0.4);
    vFreqG = vFreqR * (0.5 + Math.random() * 1);
  } else if (mode < 0.8) {
    // Horizontal bands (frames 9, 23, 31)
    hFreqR = 0.2 + Math.random() * 1;
    vFreqR = 2 + Math.random() * 6;
    hFreqG = hFreqR * (0.5 + Math.random() * 1);
    vFreqG = vFreqR * (0.8 + Math.random() * 0.4);
  } else {
    // Tight grid / checkerboard (frames 15, 27)
    hFreqR = 4 + Math.random() * 10;
    vFreqR = 3 + Math.random() * 8;
    hFreqG = hFreqR * (0.6 + Math.random() * 0.8);
    vFreqG = vFreqR * (0.6 + Math.random() * 0.8);
  }

  // Colour palette — reference heavily skews warm (red/magenta dominant)
  // Near-monochrome sequences are very common (frames 14,24,25,26,29)
  const basePhase = Math.random() * Math.PI * 2;
  let spread;
  const spreadRoll = Math.random();
  if (spreadRoll < 0.25) {
    spread = 0.1 + Math.random() * 0.4;  // near-monochrome
  } else if (spreadRoll < 0.6) {
    spread = 0.8 + Math.random() * 1.5;  // 2-colour palette
  } else {
    spread = 1.5 + Math.random() * 3.0;  // full spectrum
  }

  return {
    hFreq1: hFreqR,
    hFreq2: hFreqG,
    vFreq1: vFreqR,
    vFreq2: vFreqG,
    waveH1: waveH, waveH2: waveH,
    waveV1: waveV, waveV2: waveV,
    xmod: 0,
    columns: 0,
    colourOffset1: basePhase,
    colourOffset2: basePhase + spread,
    colourOffset3: basePhase + spread * 2,
    lozengeDepth: 0.3 + Math.random() * 0.5,
    speed1: 0.01 + Math.random() * 0.04,
    speed2: 0.005 + Math.random() * 0.025,
    mirror: 0.0,
    feedback: 0.65 + Math.random() * 0.25,
  };
}

// ----- State -----
const state = {
  time: 0,
  sequence: 0,
  sequenceBlend: 1.0,
  prevSequence: 0,
  hold: false,
  seqTimerSeconds: 8,
  seqFormAudio: false,
  lastStep: 0,
  formMod: [0, 0, 0, 0],
  formModRate: [0.05, 0.035, 0.025, 0.04],
  rgb: [0.8, 0.7, 0.9],
  audioEnabled: false,
  audioBands: [0, 0, 0, 0],
  audioLevel: 0.7,
  broken: false,
  brokenAmount: 0.0,
  params: generateSequenceParams(),
  prevParams: generateSequenceParams(),
  feedbackAmount: 0.85,
  drift: { x: 0, y: 0, sync: 0, colourShift: 0 },
};

// ----- Shaders -----
const vertexSrc = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentSrc = `
  precision highp float;
  varying vec2 v_uv;

  uniform float u_time;
  uniform vec3 u_rgb;
  uniform vec4 u_formMod;

  uniform float u_hFreq1;
  uniform float u_hFreq2;
  uniform float u_vFreq1;
  uniform float u_vFreq2;
  uniform float u_waveH1;
  uniform float u_waveH2;
  uniform float u_waveV1;
  uniform float u_waveV2;
  uniform float u_xmod;
  uniform float u_columns;
  uniform float u_colourOffset1;
  uniform float u_colourOffset2;
  uniform float u_colourOffset3;
  uniform float u_lozengeDepth;
  uniform float u_speed1;
  uniform float u_speed2;
  uniform float u_mirror;

  uniform sampler2D u_feedback;
  uniform float u_feedbackAmount;

  uniform vec4 u_audio;

  uniform float u_broken;
  uniform vec4 u_drift;

  uniform vec2 u_resolution;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  // Analog function generators — the core of the Chromascope
  float wave(float x, float mode) {
    float m = mod(mode, 4.0);
    if (m < 1.0) return sin(x);
    if (m < 2.0) return sign(sin(x)) * 0.8 + sin(x) * 0.2; // soft square
    if (m < 3.0) return fract(x / TAU) * 2.0 - 1.0;         // saw
    return abs(fract(x / TAU) * 2.0 - 1.0) * 2.0 - 1.0;     // triangle
  }

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec2 uv = v_uv;
    vec2 p = uv;
    float aspect = u_resolution.x / u_resolution.y;

    float px = u_mirror > 0.5 ? abs(p.x - 0.5) * 2.0 : p.x;
    float py = p.y;

    px += u_drift.x * u_broken * 0.05;
    py += u_drift.y * u_broken * 0.02;

    float syncGlitch = u_drift.z * u_broken;
    px += syncGlitch * 0.08 * step(0.3, fract(py * 3.0 + u_time * 0.1));

    float t = u_time;

    float ph1 = u_formMod.x * TAU;
    float ph2 = u_formMod.y * TAU;
    float ph3 = u_formMod.z * TAU;
    float ph4 = u_formMod.w * TAU;

    float audioBass = u_audio.x;
    float audioMid = (u_audio.y + u_audio.z) * 0.5;
    float audioTreble = u_audio.w;

    // R channel — hFreq1, vFreq1
    float hR = wave(px * u_hFreq1 * TAU + t * u_speed1 + ph1 + audioMid * 2.0, u_waveH1);
    float vR = wave(py * u_vFreq1 * TAU + t * u_speed2 + ph2 + audioBass * 1.5, u_waveV1);

    // G channel — hFreq2, vFreq2 (independent frequencies = colour separation)
    float hG = wave(px * u_hFreq2 * TAU + t * u_speed1 * 0.85 + ph1 * 0.7, u_waveH2);
    float vG = wave(py * u_vFreq2 * TAU + t * u_speed2 * 0.9 + ph2 * 1.3, u_waveV2);

    // B channel — mix of both frequency sets
    float hB = wave(px * (u_hFreq1 + u_hFreq2) * 0.5 * TAU + t * u_speed1 * 0.7 + ph3, u_waveH1);
    float vB = wave(py * (u_vFreq1 + u_vFreq2) * 0.5 * TAU + t * u_speed2 * 1.1 + ph3 * 0.8, u_waveV1);

    vec3 col = vec3(
      sin((hR + vR) * 0.5 * PI + u_colourOffset1 + ph4),
      sin((hG + vG) * 0.5 * PI + u_colourOffset2 + ph4),
      sin((hB + vB) * 0.5 * PI + u_colourOffset3 + ph4)
    );

    col = clamp(col * 2.0, -1.0, 1.0);
    col = col * 0.5 + 0.5;
    col *= 1.5;

    col *= u_rgb;

    col.r += audioBass * 0.12;
    col.g += audioMid * 0.08;
    col.b += audioTreble * 0.12;

    // ======== FEEDBACK ========
    vec2 fbUV = v_uv;
    fbUV = (fbUV - 0.5) * 0.998 + 0.5;
    fbUV.x += 0.0015;
    vec2 fbCentered = fbUV - 0.5;
    float rotAngle = 0.002;
    fbUV = vec2(
      fbCentered.x * cos(rotAngle) - fbCentered.y * sin(rotAngle),
      fbCentered.x * sin(rotAngle) + fbCentered.y * cos(rotAngle)
    ) + 0.5;
    vec3 fb = texture2D(u_feedback, fbUV).rgb;

    fb.r = mix(fb.r, texture2D(u_feedback, fbUV + vec2(0.005, 0.0)).r, 0.5);
    fb.b = mix(fb.b, texture2D(u_feedback, fbUV - vec2(0.004, 0.0)).b, 0.5);

    col = mix(col, fb, u_feedbackAmount);

    // ======== PAL CRT SCANLINES + SHADOW MASK ========
    float scanY = uv.y * 576.0;
    float scanline = 0.6 + 0.4 * smoothstep(0.0, 0.35, abs(fract(scanY) - 0.5) * 2.0);
    col *= scanline;

    float field = mod(floor(u_time * 50.0), 2.0);
    float interlaceY = uv.y * 288.0 + field * 0.5;
    float interlace = 0.92 + 0.08 * smoothstep(0.0, 0.4, abs(fract(interlaceY) - 0.5) * 2.0);
    col *= interlace;

    float maskX = uv.x * u_resolution.x * 0.35;
    float vmask = 0.88 + 0.12 * smoothstep(0.0, 0.4, abs(fract(maskX) - 0.5) * 2.0);
    col *= vmask;

    float chromaXT = sin((uv.x * 768.0 + uv.y * 576.0) * PI) * 0.02;
    col.r += chromaXT;
    col.b -= chromaXT;

    vec3 bloom = texture2D(u_feedback, fbUV + vec2(0.004, 0.0)).rgb +
                 texture2D(u_feedback, fbUV - vec2(0.004, 0.0)).rgb +
                 texture2D(u_feedback, fbUV + vec2(0.0, 0.003)).rgb +
                 texture2D(u_feedback, fbUV - vec2(0.0, 0.003)).rgb;
    bloom = bloom * 0.25;
    col += max(bloom - 0.3, vec3(0.0)) * 0.35;

    // ======== ALWAYS-ON ANALOG CHARACTER ========
    float grain = fract(sin(dot(uv * u_resolution + fract(t * 7.3), vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.025;

    col.r = mix(col.r, texture2D(u_feedback, fbUV + vec2(0.005, 0.0)).r, 0.4);
    col.b = mix(col.b, texture2D(u_feedback, fbUV - vec2(0.004, 0.0)).b, 0.4);

    float phosphorWear = 0.97 + 0.03 * sin(uv.x * 2.1 + 0.5) * sin(uv.y * 1.7 + 0.3);
    col *= phosphorWear;

    // ======== WORN ANALOG ARTEFACTS ========
    if (u_broken > 0.0) {
      float fringe = u_drift.w * u_broken * 0.01;
      col.r = mix(col.r, texture2D(u_feedback, fbUV + vec2(fringe, 0.0)).r, 0.5 * u_broken);
      col.b = mix(col.b, texture2D(u_feedback, fbUV - vec2(fringe * 0.7, 0.0)).b, 0.5 * u_broken);

      float roll = sin(uv.y * 6.0 + t * 0.7) * 0.5 + 0.5;
      roll = smoothstep(0.4, 0.6, roll);
      col.rg += vec2(roll * 0.06, -roll * 0.04) * u_broken;

      col += (grain - 0.5) * 0.06 * u_broken;

      col *= 1.0 + syncGlitch * 0.5;

      float vHold = sin(t * 0.31 + uv.y * 0.5) * 0.006 * u_broken;
      col = mix(col, texture2D(u_feedback, fbUV + vec2(0.0, vHold)).rgb, 0.3 * u_broken);

      float tear = step(0.92, fract(sin(floor(uv.y * 200.0 + t * 3.0) * 43.7) * 17.3));
      col = mix(col, texture2D(u_feedback, fbUV + vec2(tear * 0.02 * u_broken, 0.0)).rgb, tear * u_broken * 0.6);
    }

    float cornerDist = length(max(abs(v_uv - 0.5) - 0.42, 0.0));
    float cornerDark = 1.0 - smoothstep(0.0, 0.1, cornerDist);
    col *= cornerDark;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// ----- WebGL Setup -----
function createShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

const vs = createShader(gl.VERTEX_SHADER, vertexSrc);
const fs = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
const program = gl.createProgram();
gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);
gl.useProgram(program);

// Fullscreen quad
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

// Get uniform locations
const u = {};
['time','rgb','formMod',
 'hFreq1','hFreq2','vFreq1','vFreq2',
 'waveH1','waveH2','waveV1','waveV2',
 'xmod','columns','colourOffset1','colourOffset2','colourOffset3',
 'lozengeDepth','speed1','speed2','mirror',
 'feedback','feedbackAmount','audio','broken',
 'drift','resolution'].forEach(name => {
  u[name] = gl.getUniformLocation(program, 'u_' + name);
});

// ----- Ping-pong framebuffers for feedback -----
function createFBO() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width || 1, canvas.height || 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

let fbo = [createFBO(), createFBO()];
let fboIndex = 0;

function resizeFBOs() {
  for (const f of fbo) {
    gl.bindTexture(gl.TEXTURE_2D, f.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
}

// ----- Resize -----
function resize() {
  const maxH = window.innerHeight * devicePixelRatio;
  const maxW = window.innerWidth * devicePixelRatio;
  let h = maxH;
  let w = Math.floor(h * 4 / 3);
  if (w > maxW) {
    w = maxW;
    h = Math.floor(w * 3 / 4);
  }
  canvas.width = w;
  canvas.height = h;
  const cssH = h / devicePixelRatio;
  const cssW = w / devicePixelRatio;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  gl.viewport(0, 0, w, h);
  resizeFBOs();
}
window.addEventListener('resize', resize);
resize();

// ----- Audio -----
let audioCtx, analyser, bandFilters;

async function enableAudio() {
  if (audioCtx) { disableAudio(); return; }
  try {
    audioCtx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);

    const bands = [
      { low: 20, high: 150 },
      { low: 150, high: 800 },
      { low: 800, high: 4000 },
      { low: 4000, high: 16000 }
    ];

    bandFilters = bands.map(b => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = Math.sqrt(b.low * b.high);
      filter.Q.value = filter.frequency.value / (b.high - b.low);
      source.connect(filter);

      const a = audioCtx.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.7;
      filter.connect(a);
      return a;
    });

    state.audioEnabled = true;
    document.getElementById('btn-audio').classList.add('audio-active');
  } catch (e) {
    console.warn('Audio failed:', e);
  }
}

function disableAudio() {
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  state.audioEnabled = false;
  state.audioBands = [0, 0, 0, 0];
  document.getElementById('btn-audio').classList.remove('audio-active');
  bandFilters = null;
}

function updateAudio() {
  if (!bandFilters) return;
  const buf = new Uint8Array(128);
  bandFilters.forEach((a, i) => {
    a.getByteFrequencyData(buf);
    let sum = 0;
    for (let j = 0; j < buf.length; j++) sum += buf[j];
    state.audioBands[i] = (sum / buf.length) / 255;
  });

  const bands = ['bass', 'lomid', 'himid', 'treble'];
  bands.forEach((name, i) => {
    const el = document.getElementById('band-' + name);
    el.style.height = (2 + state.audioBands[i] * 28) + 'px';
  });
}

// ----- Sequence stepping -----
function stepSequence() {
  state.prevParams = { ...state.params };
  state.prevSequence = state.sequence;
  state.params = generateSequenceParams();
  state.sequence++;
  state.lastStep = state.time;
  state.sequenceBlend = 0;
  document.getElementById('info-seq').textContent = 'SEQ ' + state.sequence;
}

// ----- Broken mode drift -----
function updateDrift(dt) {
  if (!state.broken) {
    state.drift = { x: 0, y: 0, sync: 0, colourShift: 0 };
    return;
  }
  const amt = state.brokenAmount;
  const t = state.time;

  state.drift.x = Math.sin(t * 0.13) * amt * 0.5 + Math.sin(t * 0.37) * amt * 0.3;
  state.drift.y = Math.cos(t * 0.11) * amt * 0.3;
  state.drift.colourShift = Math.sin(t * 0.23) * amt;

  if (Math.random() < 0.005 * amt) {
    state.drift.sync = (Math.random() - 0.5) * amt * 2;
    const indicator = document.getElementById('broken-indicator');
    indicator.classList.add('flash');
    setTimeout(() => indicator.classList.remove('flash'), 150);
  } else {
    state.drift.sync *= 0.95;
  }
}

// ----- Render loop -----
let lastTime = 0;

function render(timestamp) {
  requestAnimationFrame(render);

  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  state.time += dt;

  for (let i = 0; i < 4; i++) {
    state.formMod[i] = (state.formMod[i] + state.formModRate[i] * dt) % 1.0;
  }

  if (!state.hold) {
    if (state.seqFormAudio) {
      if (state.audioBands[0] > 0.7 && (state.time - state.lastStep) > 1.0) {
        stepSequence();
      }
    } else {
      if ((state.time - state.lastStep) > state.seqTimerSeconds) {
        stepSequence();
      }
    }
  }

  if (state.sequenceBlend < 1.0) {
    state.sequenceBlend = Math.min(1.0, state.sequenceBlend + dt * 2.0);
  }

  updateAudio();
  updateDrift(dt);

  const p = state.params;
  const blend = state.sequenceBlend;

  const readFBO = fbo[fboIndex];
  const writeFBO = fbo[1 - fboIndex];

  gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
  gl.uniform1i(u.feedback, 0);

  gl.uniform1f(u.time, state.time);
  gl.uniform3f(u.rgb, state.rgb[0], state.rgb[1], state.rgb[2]);
  gl.uniform4f(u.formMod, state.formMod[0], state.formMod[1], state.formMod[2], state.formMod[3]);
  gl.uniform1f(u.hFreq1, p.hFreq1);
  gl.uniform1f(u.hFreq2, p.hFreq2);
  gl.uniform1f(u.vFreq1, p.vFreq1);
  gl.uniform1f(u.vFreq2, p.vFreq2);
  gl.uniform1f(u.waveH1, p.waveH1);
  gl.uniform1f(u.waveH2, p.waveH2);
  gl.uniform1f(u.waveV1, p.waveV1);
  gl.uniform1f(u.waveV2, p.waveV2);
  gl.uniform1f(u.xmod, p.xmod);
  gl.uniform1f(u.columns, p.columns);
  gl.uniform1f(u.colourOffset1, p.colourOffset1);
  gl.uniform1f(u.colourOffset2, p.colourOffset2);
  gl.uniform1f(u.colourOffset3, p.colourOffset3);
  gl.uniform1f(u.lozengeDepth, p.lozengeDepth);
  gl.uniform1f(u.speed1, p.speed1);
  gl.uniform1f(u.speed2, p.speed2);
  gl.uniform1f(u.mirror, p.mirror);
  gl.uniform1f(u.feedbackAmount, p.feedback);
  const aL = state.audioLevel;
  gl.uniform4f(u.audio, state.audioBands[0]*aL, state.audioBands[1]*aL, state.audioBands[2]*aL, state.audioBands[3]*aL);
  gl.uniform1f(u.broken, state.brokenAmount);
  gl.uniform4f(u.drift, state.drift.x, state.drift.y, state.drift.sync, state.drift.colourShift);
  gl.uniform2f(u.resolution, canvas.width, canvas.height);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, writeFBO.tex);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  fboIndex = 1 - fboIndex;
}

// ----- Controls -----
const controlsEl = document.getElementById('controls');
const hintEl = document.getElementById('controls-hint');
let controlsVisible = true;

function toggleControls() {
  controlsVisible = !controlsVisible;
  controlsEl.classList.toggle('visible', controlsVisible);
  hintEl.classList.toggle('hidden', controlsVisible);
}

['formmod-a', 'formmod-b', 'formmod-c', 'formmod-d'].forEach((id, i) => {
  document.getElementById(id).addEventListener('input', e => {
    state.formModRate[i] = 0.005 + (e.target.value / 100) * 0.495;
  });
});

document.getElementById('btn-seqform-timer').addEventListener('click', () => {
  state.seqFormAudio = false;
  document.getElementById('btn-seqform-timer').classList.add('active');
  document.getElementById('btn-seqform-audio').classList.remove('active');
});
document.getElementById('btn-seqform-audio').addEventListener('click', () => {
  state.seqFormAudio = true;
  document.getElementById('btn-seqform-audio').classList.add('active');
  document.getElementById('btn-seqform-timer').classList.remove('active');
});

document.getElementById('audio-level').addEventListener('input', e => {
  state.audioLevel = e.target.value / 100;
});

document.getElementById('timer').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  state.seqTimerSeconds = Math.round(121 - v * 1.2);
  if (state.seqTimerSeconds < 1) state.seqTimerSeconds = 1;
  document.getElementById('timer-display').textContent = state.seqTimerSeconds + 's';
  document.getElementById('info-timer').textContent = 'TIMER ' + state.seqTimerSeconds + 's';
});

['r', 'g', 'b'].forEach((ch, i) => {
  document.getElementById('fader-' + ch).addEventListener('input', e => {
    state.rgb[i] = e.target.value / 100;
  });
});

document.getElementById('btn-step').addEventListener('click', stepSequence);

document.getElementById('btn-hold').addEventListener('click', () => {
  state.hold = !state.hold;
  document.getElementById('btn-hold').classList.toggle('hold-active', state.hold);
});

document.getElementById('btn-audio').addEventListener('click', enableAudio);

document.getElementById('btn-pristine').addEventListener('click', () => {
  state.broken = false;
  state.brokenAmount = 0.0;
  document.getElementById('btn-pristine').classList.add('active');
  document.getElementById('btn-worn').classList.remove('active');
  document.getElementById('broken-amount').style.display = 'none';
});
document.getElementById('btn-worn').addEventListener('click', () => {
  state.broken = true;
  const slider = document.getElementById('broken-amount');
  state.brokenAmount = 0.3 + (slider.value / 100) * 2.7;
  document.getElementById('btn-worn').classList.add('active');
  document.getElementById('btn-pristine').classList.remove('active');
  slider.style.display = '';
});
document.getElementById('broken-amount').addEventListener('input', e => {
  state.brokenAmount = 0.3 + (e.target.value / 100) * 2.7;
});

document.addEventListener('keydown', e => {
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      toggleControls();
      break;
    case 'f':
      if (!document.fullscreenElement) canvas.requestFullscreen();
      else document.exitFullscreen();
      break;
    case 'h':
      state.hold = !state.hold;
      document.getElementById('btn-hold').classList.toggle('hold-active', state.hold);
      break;
    case 's':
      stepSequence();
      break;
    case 'a':
      enableAudio();
      break;
  }
});

canvas.addEventListener('mousemove', e => {
  if (e.clientY > window.innerHeight - 40 && !controlsVisible) toggleControls();
});

// ----- Init -----
state.lastStep = 0;
document.getElementById('info-seq').textContent = 'SEQ 0';
document.getElementById('info-timer').textContent = 'TIMER 8s';
requestAnimationFrame(render);
