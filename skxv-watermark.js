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
  const attributes = [...Object.keys(schema), 'color'];
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
        <circle id="pupil" cx="0" cy="0" r="100" fill="black"/>
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
      const tilt = { x: 0, y: 0 };
      const headAim = { x: 0, y: 0 };
      const idle = { quiet: 0, x: 0, y: 0, glanceEnd: 0, nextGlance: 0,
        rest: 0, restTarget: 0, restEnd: 0, nextRest: 0 };
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
      let tracking = false;

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
        // The lids follow the gaze very slightly, while their corners stay anchored.
        const apex = state.x * 0.055;
        const contour = [
          'M -325 0',
          `C -245 ${-92 * upper} ${apex - 105} ${-143 * upper} ${apex} ${-143 * upper}`,
          `C ${apex + 105} ${-143 * upper} 245 ${-92 * upper} 325 0`,
          `C 245 ${92 * lower} ${apex + 105} ${143 * lower} ${apex} ${143 * lower}`,
          `C ${apex - 105} ${143 * lower} -245 ${92 * lower} -325 0 Z`,
        ].join(' ');
        eye.setAttribute('d', contour);
        pupil.setAttribute('r', settings.pupilSize * (1 + 0.2 * hover.amount));
        pupil.setAttribute('cx', state.x);
        pupil.setAttribute('cy', state.y);
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
          update() { Object.assign(settings, readOptions(host)); render(); },
          replay() {}, blink() {}, preview() {}, destroy() {},
        };
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
        }).timeScale(settings.speed);
      }

      const mood = { follow: false, until: 0, clock: 0, lookX: 0, lookY: 0, holdUntil: 0 };
      function pickLook() {
        // A full glance, then occasionally a shorter look nearer the center.
        if (Math.random() < 0.22) {
          mood.lookX = random(-36, 36);
          mood.lookY = random(-14, 14);
        } else {
          mood.lookX = random(40, 120) * (Math.random() < 0.5 ? -1 : 1);
          mood.lookY = random(-28, 28);
        }
        mood.holdUntil = mood.clock + random(0.9, 2.4);
      }
      function beginMood() {
        mood.clock = 0;
        mood.follow = Math.random() < 0.5;
        mood.until = mood.clock + (mood.follow ? random(2.2, 4.8) : random(3, 6.5));
        pickLook();
      }
      function updateMood(dt) {
        mood.clock += dt;
        if (!settings.followCursor) {
          if (mood.clock >= mood.holdUntil) pickLook();
          return;
        }
        // Hovering the mark itself gets its attention. A moving pointer elsewhere
        // does not interrupt a period of looking around.
        if (hovered) return;
        if (mood.clock >= mood.until) {
          mood.follow = !mood.follow;
          mood.until = mood.clock + (mood.follow ? random(2.6, 5.5) : random(3.2, 7));
          if (!mood.follow) pickLook();
        } else if (!mood.follow && mood.clock >= mood.holdUntil) {
          pickLook();
        }
      }
      function cursorGaze() {
        if (!pointer.active) return null;
        const reach = Math.max(100, bounds.width * 0.65);
        const nx = (pointer.x - bounds.left - bounds.width / 2) / reach;
        const ny = (pointer.y - bounds.top - bounds.height / 2) / reach;
        const distance = Math.hypot(nx, ny);
        const scale = distance > 0 ? Math.tanh(distance) / distance : 0;
        return { x: nx * scale * 126, y: ny * scale * 32 };
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
        idle.glanceEnd = idle.restEnd = 0;
        idle.restTarget = 0;
        idle.nextGlance = random(2.8, 5);
        idle.nextRest = random(5, 9);
      }

      function updateIdle(dt) {
        if (hovered) {
          idle.quiet = 0;
          idle.x = idle.y = idle.restTarget = 0;
        } else {
          idle.quiet += dt;
          if (!settings.idleGlances) {
            idle.x = idle.y = 0;
            idle.glanceEnd = 0;
            idle.nextGlance = idle.quiet + random(2.8, 5);
          } else if (idle.glanceEnd && idle.quiet >= idle.glanceEnd) {
            idle.x = idle.y = 0;
            idle.glanceEnd = 0;
            idle.nextGlance = idle.quiet + random(3.5, 7.5);
          } else if (!idle.glanceEnd && idle.quiet >= idle.nextGlance) {
            // Real eyes make clear, purposeful saccades even when they stay on
            // the same subject. The offset is large enough to read, then settles
            // back instead of wandering continuously.
            idle.x = random(24, 52) * (Math.random() < 0.5 ? -1 : 1);
            idle.y = random(-11, 11);
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
        if (!watching) {
          target.x = clamp(target.x, -126, 126);
          target.y = clamp(target.y, -32, 32);
        } else {
          target.x = clamp(target.x + idle.x, -126, 126);
          target.y = clamp(target.y + idle.y, -32, 32);
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

      function tick(time, deltaTime) {
        const dt = Math.min(deltaTime / 1000, 0.05) * settings.speed;
        if (tracking) { updateIdle(dt); follow(dt); }
        // Two stages of follow-through let the pupil arrive first, then the
        // whole eye catches up. This also applies to the scripted intro gaze.
        const aimBlend = settings.pupilLead ? 1 - Math.exp(-10 * dt) : 1;
        headAim.x += (-clamp(state.y / 32, -1, 1) * 0.7 - headAim.x) * aimBlend;
        headAim.y += (clamp(state.x / 126, -1, 1) - headAim.y) * aimBlend;
        const blend = 1 - Math.exp(-(settings.pupilLead ? 5 : 8) * dt);
        tilt.x += (headAim.x - tilt.x) * blend;
        tilt.y += (headAim.y - tilt.y) * blend;
        render();
      }

      function addBlink(timeline, at, speed = 1) {
        // Close decisively, linger closed, then reopen with a longer, softer tail.
        // The lower lid trails the upper lid instead of scaling the whole eye.
        timeline.to(state, { upper: 0, duration: 0.105 * speed, ease: 'power2.in' }, at)
          .to(state, { lower: 0, duration: 0.085 * speed, ease: 'power2.in' }, at + 0.02 * speed)
          .to(state, { upper: 1, duration: 0.38 * speed, ease: 'power3.out' }, at + 0.145 * speed)
          .to(state, { lower: 1, duration: 0.43 * speed, ease: 'power2.out' }, at + 0.16 * speed);
      }

      function playBlink(double = false) {
        blink?.kill();
        blinkCall?.kill();
        if (reducedMotion.matches) return;
        blink = gsap.timeline({ onComplete: scheduleBlink });
        const speed = random(0.85, 1.12);
        addBlink(blink, 0, speed);
        if (double) addBlink(blink, 0.67 * speed, speed * 0.86);
        blink.timeScale(settings.speed);
        if (doc.hidden) blink.pause();
      }

      function scheduleBlink() {
        blinkCall?.kill();
        if (!settings.autoBlink || !tracking || reducedMotion.matches) return;
        blinkCall = gsap.delayedCall(random(settings.interval * 0.6, settings.interval * 1.4),
          () => playBlink(Math.random() < settings.doubleChance)).timeScale(settings.speed);
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
        Object.assign(state, { draw: 0, opacity: 0, blur: settings.blur, upper: 0, lower: 0, x: 0, y: 0 });
        Object.assign(velocity, { x: 0, y: 0 });
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
          .to(state, { x: 126, y: -3, duration: 0.85, ease: 'back.out(0.5)' }, 2.78)
          .to(state, { x: -126, y: 2, duration: 1.05, ease: 'power3.inOut' }, 4.02)
          .to(state, { x: 0, y: 0, duration: 0.95, ease: 'back.out(0.45)' }, 5.46);
        if (settings.autoBlink) {
          addBlink(intro, 6.65);
          addBlink(intro, 7.32, 0.88);
        }
        intro.timeScale(settings.speed);
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
          if (name === 'blink-interval') scheduleBlink();
          if (name === 'speed') {
            for (const animation of [intro, blink, blinkCall, hoverTween]) animation?.timeScale(settings.speed);
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
          for (const animation of [intro, blink, blinkCall, hoverTween]) animation?.kill();
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
      return Object.fromEntries(Object.entries(schema).map(([name, [key, , , , divisor = 1]]) => [name, typeof parsed[key] === 'number' ? parsed[key] * divisor : parsed[key]]));
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
