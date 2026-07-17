/* ------------------------------------------------------------------
   LEGATO – WebGL particle staff
   Replaces the original Canvas 2D overlay with a Three.js renderer
   that runs fully on the GPU:

     • OrthographicCamera matching canvas CSS pixel dimensions
     • 3D Simplex-Noise vertex shader for organic breathing drift
     • Multi-frequency sin layering driven by uBass / uEnergy
     • Scatter ↔ assemble state machine (idle / playback / settling)
     • Additive-blending "bloom" second pass for soft glow
     • Tone.Analyser tap for bass / energy uniforms (graceful fallback)
------------------------------------------------------------------ */

const MAX_PARTICLES = 8000;
const MAX_DPR       = 2;
const GOLD          = [209, 161, 90];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease  = (t) => 1 - (1 - clamp(t)) ** 3;

/* ── GLSL ────────────────────────────────────────────────────────── */

// Compact 3D Simplex noise (Stefan Gustavson / Ashima Arts)
const SIMPLEX = /* glsl */`
vec4 _p289(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = _p289(_p289(_p289(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
    + i.y + vec4(0.0,i1.y,i2.y,1.0))
    + i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4  j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_  = floor(j * ns.z);
  vec4 y_  = floor(j - 7.0 * x_);
  vec4 xx  = x_ * ns.x + ns.yyyy;
  vec4 yy  = y_ * ns.x + ns.yyyy;
  vec4 h   = 1.0 - abs(xx) - abs(yy);
  vec4 b0  = vec4(xx.xy, yy.xy);
  vec4 b1  = vec4(xx.zw, yy.zw);
  vec4 s0  = floor(b0)*2.0 + 1.0;
  vec4 s1  = floor(b1)*2.0 + 1.0;
  vec4 sh  = -step(h, vec4(0.0));
  vec4 a0  = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1  = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0  = vec3(a0.xy, h.x);
  vec3 p1  = vec3(a0.zw, h.y);
  vec3 p2  = vec3(a1.xy, h.z);
  vec3 p3  = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERT = /* glsl */`
precision highp float;
${SIMPLEX}

uniform float uTime;
uniform float uBass;
uniform float uEnergy;
uniform float uProgress;
uniform float uScatterT;   // 0 = assembled, 1 = fully scattered
uniform float uCanvasH;    // canvas CSS height for y-flip
uniform float uPixelRatio; // for gl_PointSize
uniform float uBloomMult;  // 1.0 for main pass, >1 for bloom

attribute float aSeed;
attribute float aOrder;
attribute float aMeasure;
attribute vec3  aCol;

varying float vAlpha;
varying float vBright;
varying vec3  vCol;

void main() {
  // Raw pixel coordinates stored in buffer; flip y to match Three.js (y-up)
  vec3 pos = vec3(position.x, uCanvasH - position.y, position.z);

  // Stable per-particle randoms from seed
  float s1 = fract(sin(aSeed * 12.9898 + 1.0) * 43758.5453);
  float s2 = fract(sin(aSeed * 78.233  + 2.0) * 43758.5453);
  float s3 = fract(sin(aSeed * 39.346  + 3.0) * 43758.5453);

  // ── Organic idle breathing ────────────────────────────────────────
  // Simplex noise gives slow turbulence; sin layers add fine-grain shimmer
  float nAmp = 2.8 + uBass * 2.6 + uEnergy * 1.8;
  float nT   = uTime * 0.23;
  float nX   =  snoise(vec3(pos.x * 0.0038, pos.y * 0.0076, nT)) * nAmp;
  float nY   =  snoise(vec3(pos.x * 0.0038 + 100.0, pos.y * 0.0076, nT * 0.66)) * nAmp
             +  sin(uTime * 0.37 + pos.x * 0.018 + s1 * 6.2832) * (0.78 + uBass * 0.80)
             +  sin(uTime * 0.20 + pos.x * 0.009 + aMeasure)    * 0.42
             +  sin(uTime * 0.07 + pos.x * 0.003 + s2 * 3.14)   * 0.20;

  // ── Scatter displacement (random per particle, slow drift) ────────
  float scX = (s1 - 0.5) * 78.0;
  float scY = (s2 - 0.5) * 58.0 + sin(uTime * 0.048 + s3 * 6.2832) * 9.0;

  // ── Assembly progress for this individual particle ────────────────
  float dist      = uProgress - aOrder;
  float assembled = clamp(dist / 0.018 + 0.5, 0.0, 1.0);

  // scatter only applies to unbuilt portion
  float effScatter = uScatterT * (1.0 - assembled);

  pos.x += mix(nX, scX, effScatter);
  pos.y += mix(nY, scY, effScatter);
  // Subtle z pulsation (visible in perspective-free ortho as size modulation)
  pos.z  = snoise(vec3(pos.x * 0.0026, pos.y * 0.0026, uTime * 0.09)) * 1.4
         + uBass * 0.7;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

  // ── Point size ───────────────────────────────────────────────────
  float isFrontier = step(abs(dist), 0.026);
  float isActive   = step(abs(dist), 0.062);
  float sz         = (1.6 + s3 * 1.3 + uBass * 0.7) * uPixelRatio;
  sz *= (1.0 + isFrontier * 0.85 + isActive * 0.36) * uBloomMult;
  gl_PointSize = sz;

  // ── Alpha ────────────────────────────────────────────────────────
  float idleA     = 0.64 + s1 * 0.26;
  float playbackA = 0.26 + assembled * 0.58 + isActive * 0.24;
  vAlpha = mix(idleA, playbackA, step(0.01, uScatterT));

  // ── Brightness ──────────────────────────────────────────────────
  vBright = 0.80 + isFrontier * 0.32 + isActive * 0.22
          + uBass * 0.18 + uEnergy * 0.09;

  vCol = aCol;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDotTex;
uniform float     uBloomAlpha;
varying float vAlpha;
varying float vBright;
varying vec3  vCol;
void main() {
  vec4 t = texture2D(uDotTex, gl_PointCoord);
  if (t.a < 0.012) discard;
  gl_FragColor = vec4(vCol * vBright, t.a * vAlpha * uBloomAlpha);
}
`;

/* ── Soft radial dot texture ────────────────────────────────────── */
function makeDotTexture(T) {
  const S = 64;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.48)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new T.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/* ── Main export ────────────────────────────────────────────────── */
export function createScoreParticles(canvas) {
  const T = window.THREE;
  if (!T) {
    console.warn('[particles] Three.js not available — visual disabled.');
    return { setScore() {}, beginPlayback() {}, setProgress() {}, settle() {} };
  }

  const stage   = canvas.closest('.notation-stage');
  const stateEl = stage?.querySelector('#score-fx-state');
  const mq      = window.matchMedia('(prefers-reduced-motion: reduce)');
  let   rm      = mq.matches;

  /* ── Three.js renderer ─────────────────────────────────────────── */
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x000000, 0);
  renderer.sortObjects = false;
  // Avoid double gamma correction – particle colours come from sRGB image data
  // and are passed as-is; output in linear so the browser compositor handles sRGB.
  if (T.LinearSRGBColorSpace !== undefined) {
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
  }

  const scene = new T.Scene();
  let camera  = null;
  let cW = 0, cH = 0;

  /* ── Shared uniform objects (mutated every frame) ─────────────── */
  const uTime       = { value: 0 };
  const uBass       = { value: 0 };
  const uEnergy     = { value: 0 };
  const uProgress   = { value: 0 };
  const uScatterT   = { value: 0 };
  const uCanvasH    = { value: 1 };
  const uPixelRatio = { value: renderer.getPixelRatio() };
  const uDotTex     = { value: makeDotTexture(T) };

  // Main pass (normal blending, tight point size)
  const mainUniforms = {
    uTime, uBass, uEnergy, uProgress, uScatterT,
    uCanvasH, uPixelRatio, uDotTex,
    uBloomMult:  { value: 1.0 },
    uBloomAlpha: { value: 1.0 },
  };

  // Bloom pass (additive blending, enlarged points for soft halo)
  const bloomUniforms = {
    uTime, uBass, uEnergy, uProgress, uScatterT,
    uCanvasH, uPixelRatio, uDotTex,
    uBloomMult:  { value: 2.5 },
    uBloomAlpha: { value: 0.20 },
  };

  const matBase = {
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  };

  const mat      = new T.ShaderMaterial({ ...matBase, uniforms: mainUniforms,  blending: T.NormalBlending });
  const bloomMat = new T.ShaderMaterial({ ...matBase, uniforms: bloomUniforms, blending: T.AdditiveBlending });

  let geo = null, pts = null, bPts = null;

  /* ── Camera / resize ───────────────────────────────────────────── */
  function syncCamera() {
    const par = canvas.parentElement;
    if (!par) return;
    const w = Math.max(1, par.clientWidth);
    const h = Math.max(1, par.clientHeight);
    if (w === cW && h === cH && camera) return;
    cW = w; cH = h;
    renderer.setSize(w, h, false); // false = don't override CSS width/height
    uCanvasH.value    = h;
    uPixelRatio.value = renderer.getPixelRatio();
    if (camera) {
      camera.left = 0; camera.right = w;
      camera.top  = h; camera.bottom = 0;
      camera.updateProjectionMatrix();
    } else {
      // top=h, bottom=0 → world y=0 at bottom, y=h at top
      // particle y is raw pixel (0=top); flip in shader: world_y = h - pixel_y
      camera = new T.OrthographicCamera(0, w, h, 0, -200, 200);
    }
  }

  /* ── State ─────────────────────────────────────────────────────── */
  let mode          = 'idle';
  let progress      = 0;
  let activeMeasure = null;
  let modeStartedAt = performance.now();
  let layout        = [];
  let sampleGen     = 0;
  let frameId       = 0;
  let lastT         = performance.now();

  /* ── Audio analysis via Tone.Analyser ──────────────────────────── */
  let toneAnalyser = null;

  function getAnalyser() {
    if (toneAnalyser) return toneAnalyser;
    try {
      if (!window.Tone) return null;
      const raw = Tone.getContext().rawContext;
      if (raw.state === 'suspended') return null;
      toneAnalyser = new Tone.Analyser({ type: 'fft', size: 128, smoothing: 0.82 });
      Tone.getDestination().connect(toneAnalyser);
    } catch (e) { toneAnalyser = null; }
    return toneAnalyser;
  }

  function readAudio() {
    if (rm) return { bass: 0, energy: 0 };
    const an = getAnalyser();
    if (!an) return { bass: 0, energy: 0 };
    const v = an.getValue(); // Float32Array dBFS (~-100..0)
    const n = v.length;
    const bassEnd = Math.max(2, Math.floor(n * 0.04));
    let bSum = 0;
    for (let i = 0; i < bassEnd; i++) bSum += Math.max(0, (v[i] + 100) / 100);
    const bass = Math.min(1, bSum / bassEnd);
    let eSum = 0;
    for (let i = 0; i < n; i++) eSum += Math.max(0, (v[i] + 100) / 100);
    const energy = Math.min(1, eSum / n);
    return { bass, energy };
  }

  /* ── Geometry builders ─────────────────────────────────────────── */
  const seededR = (v) => { const r = Math.sin(v * 12.9898 + 78.233) * 43758.5453; return r - Math.floor(r); };

  function nearestM(x, y) {
    return layout.reduce((best, m) => {
      const hd = x < m.x ? m.x - x : Math.max(0, x - m.x - m.width);
      const d  = hd * 2 + Math.abs(y - (m.staffTop + 20));
      return !best || d < best.d ? { m, d } : best;
    }, null)?.m;
  }

  function buildGeo(list) {
    const n  = list.length;
    const pa = new Float32Array(n * 3);
    const sa = new Float32Array(n);
    const oa = new Float32Array(n);
    const ma = new Float32Array(n);
    const ca = new Float32Array(n * 3);

    list.forEach((p, i) => {
      pa[i * 3]     = p.x;
      pa[i * 3 + 1] = p.y; // raw pixel y (0 = top); flipped in shader via uCanvasH
      pa[i * 3 + 2] = 0;
      sa[i]     = p.seed;
      oa[i]     = p.order;
      ma[i]     = p.measure;
      ca[i * 3]     = p.color[0] / 255;
      ca[i * 3 + 1] = p.color[1] / 255;
      ca[i * 3 + 2] = p.color[2] / 255;
    });

    if (geo)  geo.dispose();
    geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pa, 3));
    geo.setAttribute('aSeed',    new T.BufferAttribute(sa, 1));
    geo.setAttribute('aOrder',   new T.BufferAttribute(oa, 1));
    geo.setAttribute('aMeasure', new T.BufferAttribute(ma, 1));
    geo.setAttribute('aCol',     new T.BufferAttribute(ca, 3));

    if (pts)  { scene.remove(pts);  pts.geometry.dispose(); }
    if (bPts) { scene.remove(bPts); bPts.geometry.dispose(); }

    // Bloom renders first (behind), main pass on top
    bPts = new T.Points(geo, bloomMat);
    pts  = new T.Points(geo, mat);
    scene.add(bPts);
    scene.add(pts);
  }

  function buildFallback() {
    const sp   = Math.max(4, layout.reduce((s, m) => s + m.width * 5, 0) / 1800);
    const list = [];
    layout.forEach((m) => {
      const cnt = Math.max(2, Math.floor(m.width / sp));
      for (let line = 0; line < 5; line++) {
        for (let k = 0; k <= cnt; k++) {
          const lp   = k / cnt;
          const seed = m.index * 997 + line * 173 + k * 11;
          list.push({
            x: m.x + lp * m.width,
            y: m.staffTop + line * m.lineGap,
            color: GOLD, seed,
            order:   (m.index + lp) / Math.max(1, layout.length),
            measure: m.index,
          });
        }
      }
    });
    buildGeo(list);
  }

  function samplePx(imgData, w, h, sp) {
    const px = imgData.data;
    const list = [];
    for (let cy = 0; cy < h; cy += sp) {
      for (let cx = 0; cx < w; cx += sp) {
        let bestA = 28, bestOff = -1;
        for (let y = cy; y < Math.min(h, cy + sp); y++) {
          for (let x = cx; x < Math.min(w, cx + sp); x++) {
            const off = (y * w + x) * 4;
            if (px[off + 3] > bestA) { bestA = px[off + 3]; bestOff = off; }
          }
        }
        if (bestOff < 0) continue;
        const pi = bestOff / 4;
        const x  = pi % w;
        const y  = Math.floor(pi / w);
        const m  = nearestM(x, y);
        if (!m) continue;
        const lp   = clamp((x - m.x) / m.width);
        const seed = m.index * 997 + Math.round(x) * 17 + Math.round(y) * 31 + list.length;
        list.push({
          x, y,
          color: [px[bestOff], px[bestOff + 1], px[bestOff + 2]]
            .map((c) => Math.min(255, Math.round(c * 1.18 + 12))),
          seed,
          order:   (m.index + lp) / Math.max(1, layout.length),
          measure: m.index,
        });
      }
    }
    return list;
  }

  async function sampleSvg(svg, gen) {
    const par = canvas.parentElement;
    if (!svg || !par) return false;
    const w = Math.max(1, Math.round(par.clientWidth));
    const h = Math.max(1, Math.round(par.clientHeight));
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
    );
    const img = new Image();
    try {
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
      if (gen !== sampleGen) return false;
      const rc  = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const rctx = rc.getContext('2d', { willReadFrequently: true });
      rctx.drawImage(img, 0, 0, w, h);
      const data = rctx.getImageData(0, 0, w, h);
      let sp = 3;
      let list = samplePx(data, w, h, sp);
      while (list.length > MAX_PARTICLES && sp < 8) { sp++; list = samplePx(data, w, h, sp); }
      if (gen !== sampleGen || !list.length) return false;
      buildGeo(list.slice(0, MAX_PARTICLES));
      stage?.classList.add('has-full-particles');
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ── Render loop ───────────────────────────────────────────────── */
  function loop(now) {
    frameId = requestAnimationFrame(loop);

    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    syncCamera();
    if (!camera) return;

    const { bass, energy } = readAudio();
    uTime.value     += dt;
    uBass.value      = bass;
    uEnergy.value    = energy;
    uProgress.value  = progress;

    const elapsed = now - modeStartedAt;
    if (mode === 'idle') {
      uScatterT.value = 0;
    } else if (mode === 'playback') {
      uScatterT.value = ease(elapsed / 280);
    } else if (mode === 'settling') {
      uScatterT.value = 1 - ease(elapsed / 700);
      if (elapsed >= 700) {
        mode = 'idle';
        modeStartedAt = now;
        uScatterT.value = 0;
        stage?.classList.remove('is-particle-playing', 'is-particle-settling');
        stage?.style.setProperty('--score-progress', '0%');
        setLabel('Score breathing');
      }
    }

    renderer.render(scene, camera);
  }

  function ensureLoop() { if (!frameId) frameId = requestAnimationFrame(loop); }
  function setLabel(v)  { if (stateEl) stateEl.textContent = v; }

  /* ── Public API (identical surface to old Canvas 2D version) ───── */
  function setScore(svg, nextLayout) {
    sampleGen++;
    const gen = sampleGen;
    layout = nextLayout;
    syncCamera();
    if (!svg || !layout.length) {
      stage?.classList.remove('has-full-particles');
      buildFallback();
      ensureLoop();
      return;
    }
    if (!stage?.classList.contains('has-full-particles')) buildFallback();
    ensureLoop();
    sampleSvg(svg, gen)
      .then((ok) => { if (!ok && gen === sampleGen) { stage?.classList.remove('has-full-particles'); buildFallback(); } })
      .catch(()  => { if (gen === sampleGen)        { stage?.classList.remove('has-full-particles'); buildFallback(); } });
  }

  function beginPlayback() {
    mode = 'playback';
    progress = 0;
    activeMeasure = null;
    modeStartedAt = performance.now();
    stage?.classList.remove('is-particle-settling');
    stage?.classList.add('is-particle-playing');
    stage?.style.setProperty('--score-progress', '0%');
    setLabel('Notation dispersing');
    getAnalyser(); // eagerly start audio tap on first user gesture
    ensureLoop();
  }

  function setProgress(next, measureIndex = activeMeasure) {
    progress = clamp(next);
    activeMeasure = measureIndex;
    stage?.style.setProperty('--score-progress', `${ (progress * 100).toFixed(2) }%`);
    if (measureIndex != null) setLabel(`Assembling measure ${ measureIndex + 1 }`);
  }

  function settle() {
    if (mode === 'idle') return;
    mode = rm ? 'idle' : 'settling';
    modeStartedAt = performance.now();
    stage?.classList.remove('is-particle-playing');
    stage?.classList.toggle('is-particle-settling', !rm);
    setLabel(rm ? 'Score breathing' : 'Recalling the score');
    ensureLoop();
  }

  mq.addEventListener?.('change', (e) => {
    rm = e.matches;
    if (rm && mode === 'settling') mode = 'idle';
  });

  syncCamera();
  ensureLoop();

  return { setScore, beginPlayback, setProgress, settle };
}
