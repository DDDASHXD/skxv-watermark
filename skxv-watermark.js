/* SKXV Watermark. Load with a script tag or a side-effect JavaScript import. */
(() => {
  'use strict';
  // Safe to evaluate during server rendering; registration happens in the browser.
  if (typeof window === 'undefined' || !window.customElements || window.customElements.get('skxv-watermark')) return;

  const schema = {
    width: ['size', 30, 10, 10000],
    openness: ['openness', 100, 0, 120, 100],
    'pupil-size': ['pupilSize', 100, 1, 140],
    speed: ['speed', 1.5, 0.1, 5],
    inertia: ['inertia', 1, 0.1, 5],
    tilt: ['tilt', 20, 0, 45],
    'blink-interval': ['interval', 5.5, 0.5, 60],
    'double-blink-chance': ['doubleChance', 24, 0, 100, 100],
    'entrance-blur': ['blur', 6, 0, 30],
    'auto-blink': ['autoBlink', true],
    'follow-cursor': ['followCursor', true],
    'pupil-lead': ['pupilLead', true],
    'idle-glances': ['idleGlances', true],
    'resting-expression': ['restingExpression', true],
    intro: ['intro', true],
  };
  // Lid curves at full opening. Blink and openness still scale these toward the closed line.
  // The almond stays close to neutral. Smile, scowl, and slit reshape the pupil cutout.
  const emotions = {
    neutral: { upperL: -92, upperM: -143, upperR: -92, lowerL: 92, lowerM: 143, lowerR: 92, pupil: 1, smile: 0, scowl: 0, slit: 0, love: 0 },
    happy: { upperL: -48, upperM: -128, upperR: -48, lowerL: 70, lowerM: 55, lowerR: 70, pupil: 0.82, smile: 0, scowl: 0, slit: 0, love: 0 },
    sad: { upperL: -1, upperM: 25, upperR: -1, lowerL: 11, lowerM: 107, lowerR: 11, pupil: 0.78, smile: 0, scowl: 0, slit: 0, love: 0 },
    love: { upperL: -90, upperM: -140, upperR: -90, lowerL: 88, lowerM: 138, lowerR: 88, pupil: 0.9, smile: 0, scowl: 0, slit: 0, love: 1 },
    angry: { upperL: -100, upperM: -58, upperR: -100, lowerL: 48, lowerM: 128, lowerR: 48, pupil: 0.82, smile: 0, scowl: 0, slit: 0, love: 0 },
    skeptical: { upperL: -11, upperM: -14, upperR: -11, lowerL: 9, lowerM: 11, lowerR: 9, pupil: 1, smile: 0, scowl: 0, slit: 1, love: 0 },
    scared: { upperL: -110, upperM: -172, upperR: -110, lowerL: 110, lowerM: 172, lowerR: 110, pupil: 0.16, smile: 0, scowl: 0, slit: 0, love: 0 },
  };
  // Real cutout paths, in the same space as a circle of radius 100.
  // A blend samples each outline and lerps those points. The circle is not redrawn per face.
  const pupilPaths = [
    'M 0 -100 C 55.2 -100 100 -55.2 100 0 C 100 55.2 55.2 100 0 100 C -55.2 100 -100 55.2 -100 0 C -100 -55.2 -55.2 -100 0 -100 Z',
    'M 0 -78 C 19.7 -78 45 -67 59 -53 C 73 -39 86.2 -2.8 84 6 C 81.8 14.8 60 3.3 46 0 C 32 -3.3 15.3 -14 0 -14 C -15.3 -14 -32 -3.3 -46 0 C -60 3.3 -81.8 14.8 -84 6 C -86.2 -2.8 -73 -39 -59 -53 C -45 -67 -19.7 -78 0 -78 Z',
    'M -84 -34 C -102 18 -78 54 0 66 C 78 54 102 18 84 -34 C 62 0 30 16 0 20 C -30 16 -62 0 -84 -34 Z',
    'M 0 -88 C 61.9 -88 112 -48.6 112 0 C 112 48.6 61.9 88 0 88 C -61.9 88 -112 48.6 -112 0 C -112 -48.6 -61.9 -88 0 -88 Z',
    'M 0 86 C 28 70 52 48 68 28 C 86 6 80 -24 58 -42 C 40 -56 18 -50 6 -34 C 2 -26 0 -20 0 -14 C 0 -20 -2 -26 -6 -34 C -18 -50 -40 -56 -58 -42 C -80 -24 -86 6 -68 28 C -52 48 -28 70 0 86 Z',
  ];
  const pupilSamples = pupilPaths.map((path) => orientOutline(sampleOutline(path, 56)));
  function cubicAt(seg, t) {
    const u = 1 - t;
    return [
      u * u * u * seg.p0[0] + 3 * u * u * t * seg.p1[0] + 3 * u * t * t * seg.p2[0] + t * t * t * seg.p3[0],
      u * u * u * seg.p0[1] + 3 * u * u * t * seg.p1[1] + 3 * u * t * t * seg.p2[1] + t * t * t * seg.p3[1],
    ];
  }
  function pathCubics(d) {
    const tokens = d.replace(/,/g, ' ').trim().split(/\s+/);
    const segs = [];
    let i = 0;
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === 'M') {
        x = sx = Number(tokens[i++]);
        y = sy = Number(tokens[i++]);
      } else if (cmd === 'C') {
        while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
          const p1 = [Number(tokens[i++]), Number(tokens[i++])];
          const p2 = [Number(tokens[i++]), Number(tokens[i++])];
          const p3 = [Number(tokens[i++]), Number(tokens[i++])];
          segs.push({ p0: [x, y], p1, p2, p3 });
          x = p3[0];
          y = p3[1];
        }
      } else if (cmd === 'Z' || cmd === 'z') {
        if (Math.hypot(x - sx, y - sy) > 0.01) segs.push({ p0: [x, y], p1: [x, y], p2: [sx, sy], p3: [sx, sy] });
      }
    }
    return segs;
  }
  function sampleOutline(d, count) {
    const segs = pathCubics(d);
    const cloud = [];
    const marks = [];
    let length = 0;
    for (const seg of segs) {
      let prev = seg.p0;
      for (let step = 1; step <= 16; step++) {
        const point = cubicAt(seg, step / 16);
        length += Math.hypot(point[0] - prev[0], point[1] - prev[1]);
        cloud.push(point);
        marks.push(length);
        prev = point;
      }
    }
    const points = [];
    for (let index = 0; index < count; index++) {
      const dist = (index / count) * length;
      let at = 0;
      while (at < marks.length - 1 && marks[at] < dist) at += 1;
      const prevLen = at === 0 ? 0 : marks[at - 1];
      const span = marks[at] - prevLen || 1;
      const mix = (dist - prevLen) / span;
      const a = at === 0 ? segs[0].p0 : cloud[at - 1];
      const b = cloud[at];
      points.push([a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix]);
    }
    return points;
  }
  // Start at the top of each outline and walk clockwise, so blends do not spin.
  function orientOutline(points) {
    let cx = 0;
    for (const point of points) cx += point[0];
    cx /= points.length;
    // The upper crossing of the vertical center line. Tips that sit higher, but off to the side, stay tips.
    let hit = null;
    for (let index = 0; index < points.length; index++) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const crosses = (a[0] - cx) * (b[0] - cx) <= 0 && a[0] !== b[0];
      if (!crosses) continue;
      const t = (cx - a[0]) / (b[0] - a[0]);
      const y = a[1] + (b[1] - a[1]) * t;
      if (!hit || y < hit.y) hit = { y, index, t };
    }
    let start = 0;
    let best = Infinity;
    const target = hit ? [cx, hit.y] : [cx, Math.min(...points.map((point) => point[1]))];
    for (let index = 0; index < points.length; index++) {
      const score = Math.hypot(points[index][0] - target[0], points[index][1] - target[1]);
      if (score < best) { best = score; start = index; }
    }
    const ordered = points.slice(start).concat(points.slice(0, start));
    let area = 0;
    for (let index = 0; index < ordered.length; index++) {
      const next = ordered[(index + 1) % ordered.length];
      area += ordered[index][0] * next[1] - next[0] * ordered[index][1];
    }
    if (area < 0) return [ordered[0], ...ordered.slice(1).reverse()];
    return ordered;
  }
  function outlinePath(points) {
    const n = points.length;
    const num = (value) => Math.round(value * 10) / 10;
    let path = `M ${num(points[0][0])} ${num(points[0][1])}`;
    for (let index = 0; index < n; index++) {
      const prev = points[(index - 1 + n) % n];
      const curr = points[index];
      const next = points[(index + 1) % n];
      const next2 = points[(index + 2) % n];
      path += ` C ${num(curr[0] + (next[0] - prev[0]) / 6)} ${num(curr[1] + (next[1] - prev[1]) / 6)} ${num(next[0] - (next2[0] - curr[0]) / 6)} ${num(next[1] - (next2[1] - curr[1]) / 6)} ${num(next[0])} ${num(next[1])}`;
    }
    return `${path} Z`;
  }
  function pupilPath(smile, scowl, slit, love) {
    const weights = [
      Math.max(0, 1 - smile - scowl - slit - love),
      Math.max(0, smile),
      Math.max(0, scowl),
      Math.max(0, slit),
      Math.max(0, love),
    ];
    const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
    const dominant = weights.findIndex((weight) => weight / sum > 0.995);
    if (dominant >= 0) return pupilPaths[dominant];
    const count = pupilSamples[0].length;
    const points = [];
    for (let index = 0; index < count; index++) {
      let x = 0;
      let y = 0;
      for (let form = 0; form < weights.length; form++) {
        x += pupilSamples[form][index][0] * weights[form];
        y += pupilSamples[form][index][1] * weights[form];
      }
      points.push([x / sum, y / sum]);
    }
    return outlinePath(points);
  }
  const attributes = [...Object.keys(schema), 'emotion', 'color'];
  function readOptions(host) {
    const options = {};
    for (const [name, [key, fallback, min, max, divisor = 1]] of Object.entries(schema)) {
      const raw = host.getAttribute(name);
      if (typeof fallback === 'boolean') {
        options[key] = raw === null ? fallback : !['false', '0', 'off'].includes(raw.trim().toLowerCase());
      } else {
        const value = raw === null || raw.trim() === '' ? fallback : Number(raw);
        options[key] = Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback)) / divisor;
      }
    }
    const emotion = (host.getAttribute('emotion') || 'neutral').trim().toLowerCase();
    options.emotion = emotions[emotion] ? emotion : 'neutral';
    return options;
  }

  const loads = new WeakMap();
  function loadGsap(doc) {
    const win = doc.defaultView;
    if (win.gsap) return Promise.resolve(win.gsap);
    if (loads.has(doc)) return loads.get(doc);
    const loading = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js';
      script.async = true;
      const timeout = win.setTimeout(() => finish(new Error('GSAP loading timed out.')), 15000);
      function finish(error) {
        win.clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(win.gsap);
      }
      script.onload = () => finish(win.gsap ? null : new Error('GSAP was not available after loading.'));
      script.onerror = () => finish(new Error('Could not load GSAP.'));
      doc.head.append(script);
    });
    loads.set(doc, loading);
    loading.catch(() => loads.delete(doc));
    return loading;
  }

  const template = `
<style>
    :host { display: inline-block; width: var(--skxv-width, 30px); max-width: 100%; vertical-align: middle; }
    :host([hidden]) { display: none; }
    .watermark-frame {
      width: 100%;
      perspective: 1000px;
      perspective-origin: 50% 50%;
    }
    .watermark-tilt {
      transform-origin: 50% 50%;
      will-change: transform;
      pointer-events: none;
    }
    .watermark {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
      color: var(--skxv-color, inherit);
      user-select: none;
      pointer-events: none;
    }
</style>
<div class="watermark-frame">
  <div class="watermark-tilt">
  <!-- The pupil is a transparent cutout, so the mark also works on other backgrounds. -->
  <svg class="watermark" viewBox="-330 -150 660 300" role="img" aria-labelledby="eye-title">
    <title id="eye-title">SKXV animated eye watermark</title>
    <defs>
      <filter id="entrance-blur" filterUnits="userSpaceOnUse" x="-390" y="-240" width="780" height="480">
        <feGaussianBlur id="entrance-blur-amount" stdDeviation="6"/>
      </filter>
      <mask id="pupil-mask" x="-360" y="-210" width="720" height="420" maskUnits="userSpaceOnUse" style="mask-type: luminance">
        <rect x="-360" y="-210" width="720" height="420" fill="white"/>
        <path id="pupil" fill="black" d=""/>
      </mask>
    </defs>
    <g id="mark" opacity="0" filter="url(#entrance-blur)">
      <path id="eye" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" mask="url(#pupil-mask)" d="M -325 0 C -245 0 -105 0 0 0 C 105 0 245 0 325 0 C 245 0 105 0 0 0 C -105 0 -245 0 -325 0 Z"/>
      <path id="closed-line" d="M -325 0 H 325" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    </g>
  </svg>
  </div>
  </div>
`;

  function createAnimation(host, gsap) {
    const root = host.shadowRoot;
    const doc = host.ownerDocument;
    const win = doc.defaultView;
    const events = new win.AbortController();
    const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: events.signal });
      const eyeFrame = root.querySelector('.watermark-frame');
      const eyeTilt = root.querySelector('.watermark-tilt');
      const mark = root.querySelector('#mark');
      const eye = root.querySelector('#eye');
      const pupil = root.querySelector('#pupil');
      const line = root.querySelector('#closed-line');
      const entranceBlur = root.querySelector('#entrance-blur-amount');
      const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
      const settings = readOptions(host);
      const state = { draw: 0, opacity: 0, blur: 6, upper: 0, lower: 0, x: 0, y: 0 };
      const velocity = { x: 0, y: 0 };
      // Smoothed travel of the pupil, in SVG units per second. Stretch follows this.
      const travel = { x: 0, y: 0, px: 0, py: 0 };
      const fidget = { x: 0, y: 0, next: 0, active: false };
      const tilt = { x: 0, y: 0 };
      const headAim = { x: 0, y: 0 };
      const idle = { quiet: 0, x: 0, y: 0, glanceEnd: 0, nextGlance: 0,
        rest: 0, restTarget: 0, restEnd: 0, nextRest: 0, windup: 0, aimX: 0, aimY: 0 };
      // Full gaze is an eyeball turn, past the old flat slide, so the pupil can meet the lid.
      const gazeLimit = { x: 196, y: 68 };
      const hover = { amount: 0 };
      let hovered = false;
      let hoverTween;
      const pointer = { x: 0, y: 0, active: false };
      const random = (min, max) => min + Math.random() * (max - min);
      const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
      // Measure the stationary frame so perspective never shifts the gaze target.
      let bounds = eyeFrame.getBoundingClientRect();
      let intro;
      let blink;
      let blinkCall;
      let shapeTween;
      let tracking = false;
      const shape = { upperL: -92, upperM: -143, upperR: -92, lowerL: 92, lowerM: 143, lowerR: 92, pupil: 1, smile: 0, scowl: 0, slit: 0, love: 0 };
      Object.assign(shape, emotions[settings.emotion]);
      const pupilMotion = { scale: 1, target: 1, clock: 0, next: random(1.2, 3), hold: false };

      function render() {
        const strength = reducedMotion.matches ? 0 : settings.tilt;
        eyeTilt.style.transform = `rotateX(${tilt.x * strength}deg) rotateY(${tilt.y * strength}deg)`;
        // Blend the resting settings into the hover expression without changing
        // them. Lid animation still multiplies this value, so blinks fully close.
        const expression = settings.openness + (1.2 - settings.openness) * hover.amount;
        const upper = Math.max(0, state.upper * expression * (1 - idle.rest * (1 - hover.amount)));
        const lower = Math.max(0, state.lower * expression);
        const openness = Math.max(upper, lower);
        const progress = clamp(openness, 0, 1);
        // A round join adds a real circular radius to each tip. Taper its width
        // continuously from the closed line's 5px to zero at full opening.
        // Smoothstep keeps the radius from changing abruptly at either endpoint.
        const rounding = 1 - progress * progress * (3 - 2 * progress);
        eye.setAttribute('stroke-width', 5 * rounding);
        // The lids follow about a fifth of the pupil. Corners stay anchored.
        // Looking sideways opens the upper lid on that side and keeps the other heavier.
        const nx = clamp(state.x / gazeLimit.x, -1, 1);
        const ny = clamp(state.y / gazeLimit.y, -1, 1);
        const bias = 0.16 * nx;
        const followY = state.y * 0.2;
        const apex = state.x * 0.2 * Math.min(upper, 1);
        const uL = (shape.upperL * (1 - bias) + followY) * upper;
        const uM = (shape.upperM + followY) * upper;
        const uR = (shape.upperR * (1 + bias) + followY) * upper;
        const lL = (shape.lowerL + followY) * lower;
        const lM = (shape.lowerM + followY) * lower;
        const lR = (shape.lowerR + followY) * lower;
        const contour = [
          'M -325 0',
          `C -245 ${uL} ${apex - 105} ${uM} ${apex} ${uM}`,
          `C ${apex + 105} ${uM} 245 ${uR} 325 0`,
          `C 245 ${lR} ${apex + 105} ${lM} ${apex} ${lM}`,
          `C ${apex - 105} ${lM} -245 ${lL} -325 0 Z`,
        ].join(' ');
        eye.setAttribute('d', contour);
        // Sphere foreshortening, with the card tilt divided back out so the
        // pupil does not flatten on the same plane as the lids.
        const radius = settings.pupilSize * shape.pupil * pupilMotion.scale * (1 + 0.2 * hover.amount);
        const foreshorten = (amount, turn, card) => {
          const sphere = Math.cos(clamp(amount, -1, 1) * turn * Math.PI / 180);
          return sphere / Math.max(0.25, Math.cos(card * Math.PI / 180));
        };
        const sx = Math.max(0.04, (radius / 100) * foreshorten(nx, 42, tilt.y * strength));
        const sy = Math.max(0.04, (radius / 100) * foreshorten(ny, 18, tilt.x * strength));
        const speed = Math.hypot(travel.x, travel.y);
        // Slow drift stays round. Only a quick move stretches, and then only a little.
        const pace = clamp((speed - 260) / 740, 0, 1);
        const stretchAmount = pace * pace * 0.1;
        const stretch = 1 + stretchAmount;
        const squash = 1 - stretchAmount * 0.3;
        const angle = Math.atan2(travel.y, travel.x) * 180 / Math.PI;
        const moving = stretchAmount > 0.02
          ? ` rotate(${angle}) scale(${stretch} ${squash}) rotate(${-angle})`
          : '';
        pupil.setAttribute('d', pupilPath(shape.smile, shape.scowl, shape.slit, shape.love));
        pupil.setAttribute('transform', `translate(${state.x} ${state.y}) scale(${sx} ${sy})${moving}`);
        line.setAttribute('stroke-dashoffset', 1 - state.draw);
        line.setAttribute('opacity', state.draw > 0 ? 1 - clamp(openness / 0.035, 0, 1) : 0);
        // During the initial draw, only the line is visible. Once complete, the
        // stroked eye has identical end caps and can morph without a corner swap.
        eye.setAttribute('opacity', state.draw >= 1 ? 1 : 0);
        mark.setAttribute('opacity', state.opacity);
        entranceBlur.setAttribute('stdDeviation', state.blur);
        mark.setAttribute('filter', state.blur > 0 ? 'url(#entrance-blur)' : 'none');
      }

      // A blocked CDN still leaves a visible, static watermark.
      if (!gsap) {
        Object.assign(state, { draw: 1, opacity: 1, blur: 0, upper: 1, lower: 1 });
        render();
        return {
          update() { Object.assign(settings, readOptions(host)); Object.assign(shape, emotions[settings.emotion]); render(); },
          replay() {}, blink() {}, preview() {}, destroy() {},
        };
      }

      const expressions = ['happy', 'love', 'sad', 'angry', 'scared', 'skeptical'];
      const face = { name: 'neutral', clock: 0, until: 0, next: random(8, 16) };
      function activeEmotion() {
        return settings.emotion === 'neutral' ? face.name : settings.emotion;
      }
      function resetFace() {
        face.name = 'neutral';
        face.clock = 0;
        face.until = 0;
        face.next = random(8, 16);
        shapeTween?.kill();
        shapeTween = null;
        Object.assign(shape, emotions[settings.emotion]);
        pupilMotion.scale = pupilMotion.target = 1;
        pupilMotion.clock = 0;
        pupilMotion.hold = false;
        pupilMotion.next = random(1.2, 3);
      }
      // A real pupil constricts faster than it widens, and it settles rather than snapping.
      function updatePupil(dt) {
        if (reducedMotion.matches) {
          pupilMotion.scale = 1;
          return;
        }
        pupilMotion.clock += dt;
        if (!pupilMotion.hold && pupilMotion.clock >= pupilMotion.next) {
          const roll = Math.random();
          pupilMotion.target = roll < 0.34 ? random(0.84, 0.94) : roll < 0.67 ? random(1.06, 1.16) : random(0.96, 1.04);
          pupilMotion.next = pupilMotion.clock + random(1.6, 4.4);
        }
        const rate = pupilMotion.target < pupilMotion.scale ? 2.8 : 1.35;
        pupilMotion.scale += (pupilMotion.target - pupilMotion.scale) * (1 - Math.exp(-rate * dt));
      }
      // Neutral is the resting face. A chosen emotion stays put. Otherwise the
      // eye keeps neutral, then holds another face for several seconds.
      function updateFace(dt) {
        if (reducedMotion.matches || settings.emotion !== 'neutral') return;
        face.clock += dt;
        if (face.name !== 'neutral') {
          if (face.clock < face.until) return;
          face.name = 'neutral';
          face.next = face.clock + random(9, 18);
          applyEmotion();
          return;
        }
        if (face.clock < face.next) return;
        face.name = expressions[Math.floor(Math.random() * expressions.length)];
        face.until = face.clock + random(6, 10);
        applyEmotion();
      }
      function applyEmotion() {
        const next = emotions[activeEmotion()];
        shapeTween?.kill();
        if (reducedMotion.matches) {
          Object.assign(shape, next);
          render();
          return;
        }
        shapeTween = gsap.to(shape, {
          upperL: next.upperL,
          upperM: next.upperM,
          upperR: next.upperR,
          lowerL: next.lowerL,
          lowerM: next.lowerM,
          lowerR: next.lowerR,
          pupil: next.pupil,
          smile: next.smile,
          scowl: next.scowl,
          slit: next.slit,
          love: next.love,
          duration: 0.55,
          ease: 'power2.inOut',
          onUpdate: render,
        }).timeScale(playbackRate());
      }

      function setHovered(active) {
        hovered = active;
        if (active) wake();
        hoverTween?.kill();
        if (reducedMotion.matches) {
          hover.amount = active ? 1 : 0;
          render();
          return;
        }
        hoverTween = gsap.to(hover, {
          amount: active ? 1 : 0,
          duration: active ? 0.45 : 0.65,
          ease: 'power2.out',
          onUpdate: render,
        }).timeScale(playbackRate());
      }

      const mood = {
        follow: false, until: 0, clock: 0, lookX: 0, lookY: 0, holdUntil: 0,
        pending: false, pendingX: 0, pendingY: 0, pendingHold: 0,
      };
      const thought = { active: false, next: 0 };
      // The counter-target sits a little past the visible move. The spring covers
      // only a few units before the real look, then snaps across.
      function aim(nextX, nextY, hold) {
        const dx = nextX - state.x;
        const dy = nextY - state.y;
        if (Math.hypot(dx, dy) > 48) {
          const kick = random(4, 6);
          mood.lookX = state.x - Math.sign(dx) * kick;
          mood.lookY = state.y - (Math.abs(dy) > 8 ? Math.sign(dy) * kick * 0.45 : 0);
          mood.pending = true;
          mood.pendingX = nextX;
          mood.pendingY = nextY;
          mood.pendingHold = hold;
          mood.holdUntil = mood.clock + random(0.12, 0.16);
          return;
        }
        mood.pending = false;
        mood.lookX = nextX;
        mood.lookY = nextY;
        mood.holdUntil = mood.clock + hold;
      }
      function commitPending() {
        mood.lookX = mood.pendingX;
        mood.lookY = mood.pendingY;
        mood.pending = false;
        mood.holdUntil = mood.clock + mood.pendingHold;
      }
      function pickLook() {
        // A full glance, then occasionally a shorter look nearer the center.
        if (Math.random() < 0.22) {
          aim(random(-36, 36), random(-16, 16), random(1.8, 4));
          return;
        }
        const reach = Math.random() < 0.3 ? random(gazeLimit.x * 0.84, gazeLimit.x) : random(52, 132);
        const rise = Math.random() < 0.3
          ? -random(18, gazeLimit.y * 0.75)
          : random(-gazeLimit.y * 0.4, gazeLimit.y * 0.45);
        aim(reach * (Math.random() < 0.5 ? -1 : 1), rise, random(2.4, 6));
      }
      function beginThought() {
        thought.active = true;
        pupilMotion.hold = true;
        pupilMotion.target = random(0.8, 0.88);
        const side = Math.random() < 0.5 ? -1 : 1;
        aim(random(86, 132) * side, -random(gazeLimit.y * 0.55, gazeLimit.y * 0.9), random(2.4, 4));
      }
      function endThought() {
        thought.active = false;
        pupilMotion.hold = false;
        pupilMotion.target = 1;
        pupilMotion.next = pupilMotion.clock + random(0.9, 2.2);
        thought.next = mood.clock + random(20, 34);
        aim(random(-22, 22), random(-8, 10), random(2, 3.6));
      }
      function cancelThought() {
        if (!thought.active && !pupilMotion.hold) return;
        thought.active = false;
        pupilMotion.hold = false;
        pupilMotion.target = 1;
        pupilMotion.next = pupilMotion.clock + random(1.2, 2.6);
        thought.next = mood.clock + random(18, 30);
        mood.pending = false;
      }
      function advanceLook(force = false) {
        if (!force && mood.pending && mood.clock >= mood.holdUntil) {
          commitPending();
          return;
        }
        if (!force && mood.clock < mood.holdUntil) return;
        mood.pending = false;
        if (thought.active) {
          endThought();
          return;
        }
        const busy = reaction.close >= 0.15 || reaction.far >= 0.15
          || (settings.emotion === 'neutral' && face.name !== 'neutral');
        if (settings.idleGlances && !busy && !hovered && !mood.follow && mood.clock >= thought.next) beginThought();
        else pickLook();
      }
      const trail = [];
      const reaction = { close: 0, far: 0 };
      function beginMood() {
        mood.clock = 0;
        mood.follow = false;
        mood.until = random(8, 14);
        mood.pending = false;
        reaction.close = reaction.far = 0;
        trail.length = 0;
        thought.active = false;
        thought.next = random(18, 30);
        pupilMotion.hold = false;
        pickLook();
      }
      function notePointer(event) {
        const now = win.performance.now();
        const last = trail[trail.length - 1];
        if (last && now - last.t < 16) return;
        trail.push({ x: event.clientX, y: event.clientY, t: now });
        const cutoff = now - 460;
        while (trail.length && trail[0].t < cutoff) trail.shift();
      }
      function isShaking() {
        if (trail.length < 5) return false;
        let path = 0;
        let reversals = 0;
        let prevX = 0;
        let prevY = 0;
        for (let i = 1; i < trail.length; i++) {
          const dx = trail[i].x - trail[i - 1].x;
          const dy = trail[i].y - trail[i - 1].y;
          const step = Math.hypot(dx, dy);
          path += step;
          if (step > 5 && prevX * dx + prevY * dy < 0) reversals += 1;
          if (step > 5) { prevX = dx; prevY = dy; }
        }
        const net = Math.hypot(trail[trail.length - 1].x - trail[0].x, trail[trail.length - 1].y - trail[0].y);
        const span = (trail[trail.length - 1].t - trail[0].t) / 1000;
        return span > 0.16 && reversals >= 2 && path > 160 && path > net * 1.85;
      }
      function updateShake(dt) {
        const shaking = pointer.active && isShaking();
        if (!shaking) {
          reaction.close = Math.max(0, reaction.close - dt * 0.85);
          reaction.far = Math.max(0, reaction.far - dt * 0.85);
          return;
        }
        if (settings.followCursor) mood.until = Math.max(mood.until, mood.clock + 1.7);
        if (settings.followCursor) mood.follow = true;
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const near = Math.hypot(pointer.x - centerX, pointer.y - centerY) < Math.max(140, bounds.width * 2.6);
        if (near) {
          reaction.close += dt;
          reaction.far = Math.max(0, reaction.far - dt);
        } else {
          reaction.far += dt;
          reaction.close = Math.max(0, reaction.close - dt * 0.4);
        }
        if (reducedMotion.matches || settings.emotion !== 'neutral') return;
        // Scared can arrive quickly. Anger and skepticism need the shaking to continue.
        const next = reaction.close > 6 ? 'angry' : reaction.close > 0.35 ? 'scared' : reaction.far > 4.5 ? 'skeptical' : null;
        if (!next) return;
        if (face.name !== next) {
          face.name = next;
          applyEmotion();
        }
        face.until = face.clock + (next === 'angry' ? 1.7 : 1.25);
      }
      function updateMood(dt) {
        mood.clock += dt;
        updateShake(dt);
        updateFidget();
        if (!settings.followCursor) {
          advanceLook(false);
          if (hovered || mood.follow) cancelThought();
          return;
        }
        // Hovering the mark itself gets its attention. Otherwise the eye rarely
        // chooses the pointer, and a moving pointer does not pull it back.
        if (!hovered && mood.clock >= mood.until) {
          mood.follow = !mood.follow && Math.random() < 0.16;
          mood.until = mood.clock + (mood.follow ? random(1.1, 1.8) : random(8, 14));
          if (!mood.follow) advanceLook(!thought.active);
        } else if (!hovered && !mood.follow) {
          advanceLook(false);
        }
        if (hovered || mood.follow) cancelThought();
      }
      function cursorGaze() {
        if (!pointer.active) return null;
        const reach = Math.max(100, bounds.width * 0.65);
        const nx = (pointer.x - bounds.left - bounds.width / 2) / reach;
        const ny = (pointer.y - bounds.top - bounds.height / 2) / reach;
        const distance = Math.hypot(nx, ny);
        const scale = distance > 0 ? Math.tanh(distance) / distance : 0;
        return { x: nx * scale * gazeLimit.x, y: ny * scale * gazeLimit.y };
      }
      function updateFidget() {
        if (reducedMotion.matches || activeEmotion() !== 'scared') {
          fidget.active = false;
          fidget.x = fidget.y = 0;
          return;
        }
        fidget.active = true;
        if (mood.clock < fidget.next) return;
        const angle = Math.random() * Math.PI * 2;
        const radius = random(5, 14);
        fidget.x = Math.cos(angle) * radius;
        fidget.y = Math.sin(angle) * radius * 0.45;
        fidget.next = mood.clock + random(0.07, 0.2);
      }
      function targetGaze() {
        const watching = settings.followCursor && (hovered || mood.follow);
        if (watching) {
          const cursor = cursorGaze();
          if (cursor) return cursor;
        }
        return { x: mood.lookX, y: mood.lookY };
      }

      function wake() {
        idle.quiet = 0;
        idle.x = idle.y = 0;
        idle.glanceEnd = idle.restEnd = idle.windup = 0;
        idle.restTarget = 0;
        idle.nextGlance = random(6, 11);
        idle.nextRest = random(5, 9);
      }

      function updateIdle(dt) {
        if (hovered) {
          idle.quiet = 0;
          idle.x = idle.y = idle.restTarget = 0;
          if (idle.glanceEnd || idle.windup) idle.nextGlance = random(6, 11);
          idle.glanceEnd = idle.windup = 0;
        } else {
          idle.quiet += dt;
          if (!settings.idleGlances) {
            idle.x = idle.y = 0;
            idle.glanceEnd = idle.windup = 0;
            idle.nextGlance = idle.quiet + random(6, 11);
          } else if (idle.glanceEnd && idle.quiet >= idle.glanceEnd) {
            idle.x = idle.y = 0;
            idle.glanceEnd = idle.windup = 0;
            idle.nextGlance = idle.quiet + random(8, 15);
          } else if (idle.windup && idle.quiet >= idle.windup) {
            idle.x = idle.aimX;
            idle.y = idle.aimY;
            idle.windup = 0;
          } else if (!idle.glanceEnd && idle.quiet >= idle.nextGlance) {
            // Real eyes make clear, purposeful saccades even when they stay on
            // the same subject. A short move the other way, then the glance.
            const gx = random(24, 52) * (Math.random() < 0.5 ? -1 : 1);
            const gy = random(-11, 11);
            idle.aimX = gx;
            idle.aimY = gy;
            idle.x = -Math.sign(gx) * random(4, 6);
            idle.y = Math.abs(gy) < 1 ? 0 : -Math.sign(gy) * random(2, 3);
            idle.windup = idle.quiet + random(0.12, 0.16);
            idle.glanceEnd = idle.quiet + random(0.85, 1.5);
          }
          if (!settings.restingExpression) {
            idle.restTarget = 0;
            idle.restEnd = 0;
            idle.nextRest = idle.quiet + random(5, 9);
          } else if (idle.restEnd && idle.quiet >= idle.restEnd) {
            idle.restTarget = 0;
            idle.restEnd = 0;
            idle.nextRest = idle.quiet + random(5, 10);
          } else if (!idle.restEnd && idle.quiet >= idle.nextRest) {
            idle.restTarget = random(0.08, 0.14);
            idle.restEnd = idle.quiet + random(2, 4);
          }
        }
        // Relax slowly; become attentive more quickly when the pointer moves.
        const rate = idle.restTarget > idle.rest ? 1.5 : 9;
        idle.rest += (idle.restTarget - idle.rest) * (1 - Math.exp(-rate * dt));
      }

      function follow(dt) {
        updateMood(dt);
        const target = targetGaze();
        const watching = settings.followCursor && (hovered || mood.follow);
        if (watching) {
          target.x += idle.x;
          target.y += idle.y;
        }
        if (fidget.active) {
          target.x += fidget.x;
          target.y += fidget.y;
        }
        target.x = clamp(target.x, -gazeLimit.x, gazeLimit.x);
        target.y = clamp(target.y, -gazeLimit.y, gazeLimit.y);
        // Sad, happy, and angry keep the pupil in the part of the eye the expression opens.
        if (activeEmotion() === 'sad') {
          target.x *= 0.62;
          target.y = 36 + target.y * 0.12;
        } else if (activeEmotion() === 'happy') {
          target.x *= 0.55;
          target.y = -4 + target.y * 0.1;
        } else if (activeEmotion() === 'angry') {
          target.x *= 0.55;
          target.y = 4 + target.y * 0.1;
        }
        // An underdamped spring preserves momentum on direction changes. GSAP's
        // ticker supplies the clock; the exact solution behaves the same at any Hz.
        const damping = 10.8 / settings.inertia;
        const frequency = 8.1 / settings.inertia;
        const decay = Math.exp(-damping * dt);
        const cosine = Math.cos(frequency * dt);
        const sine = Math.sin(frequency * dt);
        for (const axis of ['x', 'y']) {
          const offset = state[axis] - target[axis];
          const momentum = (velocity[axis] + damping * offset) / frequency;
          const displacement = offset * cosine + momentum * sine;
          state[axis] = target[axis] + decay * displacement;
          velocity[axis] = decay * (
            -damping * displacement + frequency * (-offset * sine + momentum * cosine)
          );
        }
      }

      function playbackRate() {
        return settings.speed * (!reducedMotion.matches && activeEmotion() === 'scared' ? 2.5 : 1);
      }

      function tick(time, deltaTime) {
        const rate = playbackRate();
        const dt = Math.min(deltaTime / 1000, 0.05) * rate;
        for (const animation of [intro, blink, blinkCall, hoverTween, shapeTween]) animation?.timeScale(rate);
        if (tracking) { updateIdle(dt); updateFace(dt); follow(dt); }
        updatePupil(dt);
        // Two stages of follow-through let the pupil arrive first, then the
        // whole eye catches up. This also applies to the scripted intro gaze.
        const aimBlend = settings.pupilLead ? 1 - Math.exp(-10 * dt) : 1;
        headAim.x += (-clamp(state.y / gazeLimit.y, -1, 1) * 0.7 - headAim.x) * aimBlend;
        headAim.y += (clamp(state.x / gazeLimit.x, -1, 1) - headAim.y) * aimBlend;
        const blend = 1 - Math.exp(-(settings.pupilLead ? 5 : 8) * dt);
        tilt.x += (headAim.x - tilt.x) * blend;
        tilt.y += (headAim.y - tilt.y) * blend;
        if (dt > 0) {
          const vx = (state.x - travel.px) / dt;
          const vy = (state.y - travel.py) / dt;
          travel.px = state.x;
          travel.py = state.y;
          const rate = Math.hypot(vx, vy) > Math.hypot(travel.x, travel.y) ? 12 : 18;
          const blendTravel = 1 - Math.exp(-rate * dt);
          travel.x += (vx - travel.x) * blendTravel;
          travel.y += (vy - travel.y) * blendTravel;
        }
        render();
      }

      function addBlink(timeline, at, speed = 1, hold = 0) {
        // Close decisively, linger closed, then reopen with a longer, softer tail.
        // The lower lid trails the upper lid instead of scaling the whole eye.
        // A slow blink keeps the eye shut for about half a second.
        const reopen = at + (0.145 + hold) * speed;
        timeline.to(state, { upper: 0, duration: 0.105 * speed, ease: 'power2.in' }, at)
          .to(state, { lower: 0, duration: 0.085 * speed, ease: 'power2.in' }, at + 0.02 * speed)
          .to(state, { upper: 1, duration: (hold > 0 ? 0.5 : 0.38) * speed, ease: 'power3.out' }, reopen)
          .to(state, { lower: 1, duration: (hold > 0 ? 0.56 : 0.43) * speed, ease: 'power2.out' }, reopen + 0.015 * speed);
      }

      function playBlink(double = false, slow = false) {
        blink?.kill();
        blinkCall?.kill();
        if (reducedMotion.matches) return;
        blink = gsap.timeline({ onComplete: scheduleBlink });
        const speed = random(0.85, 1.12);
        addBlink(blink, 0, speed, slow ? 0.5 : 0);
        if (double) addBlink(blink, 0.67 * speed, speed * 0.86);
        blink.timeScale(playbackRate());
        if (doc.hidden) blink.pause();
      }

      function scheduleBlink() {
        blinkCall?.kill();
        if (!settings.autoBlink || !tracking || reducedMotion.matches) return;
        blinkCall = gsap.delayedCall(random(settings.interval * 0.6, settings.interval * 1.4), () => {
          const double = Math.random() < settings.doubleChance;
          playBlink(double, !double && Math.random() < 0.12);
        }).timeScale(playbackRate());
        if (doc.hidden) blinkCall.pause();
      }

      function preview() {
        wake();
        idle.rest = 0;
        intro?.kill();
        blink?.kill();
        blinkCall?.kill();
        intro = blink = blinkCall = null;
        Object.assign(state, { draw: 1, opacity: 1, blur: 0, upper: 1, lower: 1 });
        beginMood();
        tracking = !reducedMotion.matches;
        if (tracking && !doc.hidden) gsap.ticker.add(tick);
        render();
        scheduleBlink();
      }

      function startTracking() {
        wake();
        beginMood();
        tracking = true;
        scheduleBlink();
      }

      let entranceObserver;
      function cancelEntranceWait() {
        entranceObserver?.disconnect();
        entranceObserver = null;
      }
      // The entrance stays hidden until any part of the mark is on screen.
      // An explicit replay uses the same rule, so it does not play offscreen.
      function reset() {
        wake();
        idle.rest = 0;
        hoverTween?.kill();
        hoverTween = null;
        hover.amount = hovered ? 1 : 0;
        intro?.kill();
        blink?.kill();
        blinkCall?.kill();
        intro = blink = blinkCall = null;
        gsap.ticker.remove(tick);
        tracking = false;
        cancelEntranceWait();
        resetFace();
        Object.assign(state, { draw: 0, opacity: 0, blur: settings.blur, upper: 0, lower: 0, x: 0, y: 0 });
        Object.assign(velocity, { x: 0, y: 0 });
        Object.assign(travel, { x: 0, y: 0, px: state.x, py: state.y });
        Object.assign(tilt, { x: 0, y: 0 });
        Object.assign(headAim, { x: 0, y: 0 });
        if (settings.intro && !reducedMotion.matches) {
          const rect = host.getBoundingClientRect();
          const inView = rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth;
          if (!inView) {
            render();
            entranceObserver = new win.IntersectionObserver(entries => {
              if (!entries.some(entry => entry.isIntersecting)) return;
              cancelEntranceWait();
              reset();
            });
            entranceObserver.observe(host);
            return;
          }
        }
        if (reducedMotion.matches || !settings.intro) {
          Object.assign(state, { draw: 1, opacity: 1, blur: 0, upper: 1, lower: 1 });
          render();
          if (!reducedMotion.matches) {
            startTracking();
            if (!doc.hidden) gsap.ticker.add(tick);
          }
          return;
        }

        // Overlapping motion and asymmetric easing avoid a stop/start slideshow.
        intro = gsap.timeline({ onComplete: startTracking });
        intro.to(state, { draw: 1, duration: 1.15, ease: 'power3.inOut' }, 0.35)
          .to(state, { opacity: 1, duration: 1.15, ease: 'power2.out' }, 0.35)
          .to(state, { blur: 0, duration: 1.15, ease: 'power2.inOut' }, 0.35)
          .to(state, { upper: 1, duration: 1.25, ease: 'back.out(0.65)' }, 1.57)
          .to(state, { lower: 1, duration: 1.4, ease: 'power3.out' }, 1.65)
          .to(state, { x: 180, y: -14, duration: 0.85, ease: 'back.out(0.5)' }, 2.78)
          .to(state, { x: -180, y: 10, duration: 1.05, ease: 'power3.inOut' }, 4.02)
          .to(state, { x: 0, y: 0, duration: 0.95, ease: 'back.out(0.45)' }, 5.46);
        if (settings.autoBlink) {
          addBlink(intro, 6.65);
          addBlink(intro, 7.32, 0.88);
        }
        intro.timeScale(playbackRate());
        render();
        if (doc.hidden) intro.pause();
        else gsap.ticker.add(tick);
      }

      // Use the stationary frame as the hover target so 3D tilt and widening
      // eyelids cannot repeatedly move the hit area out from under the pointer.
      on(eyeFrame, 'pointerenter', event => {
        if (event.pointerType !== 'touch') setHovered(true);
      });
      on(eyeFrame, 'pointerleave', () => setHovered(false));
      on(win, 'pointermove', event => {
        if (!pointer.active || event.clientX !== pointer.x || event.clientY !== pointer.y) wake();
        Object.assign(pointer, { x: event.clientX, y: event.clientY, active: true });
        notePointer(event);
      }, { passive: true });
      const release = () => { pointer.active = false; wake(); setHovered(false); };
      on(doc.documentElement, 'pointerleave', release);
      on(win, 'blur', release);
      on(win, 'pointercancel', release);
      on(win, 'pointerup', event => {
        if (event.pointerType !== 'mouse') release();
      });
      const measure = () => { bounds = eyeFrame.getBoundingClientRect(); };
      const observer = new win.ResizeObserver(measure);
      observer.observe(eyeFrame);
      on(win, 'resize', measure, { passive: true });
      on(win, 'scroll', measure, { passive: true, capture: true });
      on(doc, 'visibilitychange', () => {
        if (reducedMotion.matches) return;
        for (const animation of [intro, blink, blinkCall, hoverTween]) {
          if (animation && animation.progress() < 1) animation.paused(doc.hidden);
        }
        if (doc.hidden) gsap.ticker.remove(tick);
        else gsap.ticker.add(tick);
      });
      on(reducedMotion, 'change', () => { reset(); host.dispatchEvent(new win.CustomEvent('watermark-motion-change')); });
      reset();

      return {
        update(name) {
          Object.assign(settings, readOptions(host));
          if (['openness', 'auto-blink', 'follow-cursor'].includes(name)) preview();
          if (name === 'intro') reset();
          if (name === 'emotion') {
            if (settings.emotion === 'neutral') {
              face.name = 'neutral';
              face.next = face.clock + random(8, 16);
            }
            applyEmotion();
          }
          if (name === 'blink-interval') scheduleBlink();
          if (name === 'speed') {
            for (const animation of [intro, blink, blinkCall, hoverTween, shapeTween]) animation?.timeScale(playbackRate());
          }
          measure();
          render();
        },
        replay: reset,
        preview,
        blink(double) { preview(); playBlink(double); },
        destroy() {
          events.abort();
          cancelEntranceWait();
          observer.disconnect();
          gsap.ticker.remove(tick);
          for (const animation of [intro, blink, blinkCall, hoverTween, shapeTween]) animation?.kill();
        },
      };
  }

  class SkxvWatermark extends HTMLElement {
    static get observedAttributes() { return attributes; }
    static get defaults() {
      return Object.fromEntries(Object.entries(schema).map(([name, definition]) => [name, definition[1]]));
    }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = template;
      this._generation = 0;
      this._animation = null;
      this.ready = Promise.resolve(false);
    }
    connectedCallback() {
      const generation = ++this._generation;
      this._applyAppearance();
      const initialize = (gsap, error) => {
        if (!this.isConnected || generation !== this._generation) return false;
        this._animation = createAnimation(this, gsap);
        this.dispatchEvent(new this.ownerDocument.defaultView.CustomEvent(error ? 'watermark-error' : 'watermark-ready', {
          detail: error ? { message: error.message } : null,
        }));
        return !error;
      };
      this.ready = loadGsap(this.ownerDocument).then(gsap => initialize(gsap), error => initialize(null, error));
    }
    disconnectedCallback() {
      ++this._generation;
      this._animation?.destroy();
      this._animation = null;
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      this._applyAppearance();
      this._animation?.update(name);
    }
    _applyAppearance() {
      this.style.setProperty('--skxv-width', `${readOptions(this).size}px`);
      const color = this.getAttribute('color');
      if (color) this.style.setProperty('--skxv-color', color);
      else this.style.removeProperty('--skxv-color');
    }
    get options() {
      const parsed = readOptions(this);
      const values = Object.fromEntries(Object.entries(schema).map(([name, [key, , , , divisor = 1]]) => [name, typeof parsed[key] === 'number' ? parsed[key] * divisor : parsed[key]]));
      values.emotion = parsed.emotion;
      return values;
    }
    // Methods return a promise so callers can use them immediately after mounting.
    async replay() { await this.ready; this._animation?.replay(); }
    async blink(double = false) { await this.ready; this._animation?.blink(double); }
    async preview() { await this.ready; this._animation?.preview(); }
    resetOptions() { for (const name of attributes) this.removeAttribute(name); return this.replay(); }
  }
  // React 19 assigns existing custom-element properties directly. Reflect them
  // to attributes so boolean false is explicit rather than a removed attribute
  // (which would restore our true default).
  Object.defineProperty(SkxvWatermark.prototype, 'emotion', {
    get() { return this.options.emotion; },
    set(value) {
      if (value === null || value === undefined || String(value).trim().toLowerCase() === 'neutral') this.removeAttribute('emotion');
      else this.setAttribute('emotion', String(value));
    },
  });
  for (const name of Object.keys(schema)) {
    Object.defineProperty(SkxvWatermark.prototype, name, {
      get() { return this.options[name]; },
      set(value) {
        if (value === null || value === undefined) this.removeAttribute(name);
        else this.setAttribute(name, String(value));
      },
    });
  }
  window.customElements.define('skxv-watermark', SkxvWatermark);
})();
