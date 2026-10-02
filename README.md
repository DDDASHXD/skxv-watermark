# SKXV watermark

`skxv-watermark.js` is the reusable component. It contains the SVG, isolated styles,
and animation. `index.html` imports that file and provides the test controls.
Edit the component to change the watermark everywhere, including the test page.

## Plain HTML

Load the hosted file once. No local copy of the script is required:

```html
<script src="https://cdn.jsdelivr.net/gh/DDDASHXD/skxv-watermark@1.0.7/skxv-watermark.js" defer></script>

<skxv-watermark width="30" tilt="20" speed="1.5"></skxv-watermark>
```

The public repository is [DDDASHXD/skxv-watermark](https://github.com/DDDASHXD/skxv-watermark). Pin a tag, as in `@1.0.7`, so a later push does not change pages that already use the watermark.

To work from this folder instead, load the local file:

```html
<script src="./skxv-watermark.js" defer></script>
```

The component automatically loads GSAP 3.13.0 from jsDelivr once per document,
unless `window.gsap` is already available. To avoid the CDN or comply with a site's
content security policy, load your own GSAP script before this component.
If GSAP cannot load, the component displays a static eye and emits `watermark-error`.

No separate stylesheet or build step is needed. The test page can also be opened
directly as a local HTML file, with an internet connection for GSAP.

## React

Import the file for its registration side effect, then use the custom tag:

```jsx
import './skxv-watermark.js';

export function Signature() {
  return (
    <skxv-watermark
      width="30"
      tilt="20"
      speed="1.5"
      auto-blink="true"
      style={{ color: '#222' }}
    />
  );
}
```

Changing attributes through React props updates the same instance. Multiple
watermarks have independent animations. Removing an instance stops its animations
and removes its event listeners and resize observer. Remounting replays its entrance.

For TypeScript, copy `skxv-watermark.d.ts` and `react.d.ts` beside the JavaScript
file and include `react.d.ts` in your TypeScript project. This declares the JSX tag
and the element's methods for refs. The declarations target React 19.

For Next.js or another server-rendered app, import in a client effect:

```jsx
'use client';

import { useEffect } from 'react';

export default function Signature() {
  useEffect(() => { import('./skxv-watermark.js'); }, []);
  return <skxv-watermark width="30" tilt="20" speed="1.5" />;
}
```

## Options

All attributes are optional and update live. Removing an attribute restores its
default. Numeric values are unitless; invalid numbers use the default and values
outside the supported range are clamped.

| Attribute | Default | Meaning / range |
| --- | --- | --- |
| `width` | `30` | Width in CSS pixels, 10–10000; limited by available parent width |
| `openness` | `100` | Resting eye openness, 0–120% |
| `pupil-size` | `100` | Pupil radius in SVG units, 1–140. Around that size, the pupil slowly widens and narrows on its own |
| `speed` | `1.5` | Animation speed multiplier, 0.1–5 |
| `tilt` | `20` | Maximum horizontal 3D tilt in degrees, 0–45; vertical tilt is gentler |
| `inertia` | `1` | Cursor response, 0.1–5; higher values respond more slowly |
| `auto-blink` | `true` | Enables entrance blinks and random idle blinking |
| `follow-cursor` | `true` | After the entrance, the eye alternates between watching the pointer and looking around on its own |
| `pupil-lead` | `true` | Lets the pupil lead, with slower follow-through of the whole eye |
| `idle-glances` | `true` | Occasional expressive glances when the cursor stops moving |
| `resting-expression` | `true` | Occasionally relaxes the upper lid during inactivity |
| `blink-interval` | `5.5` | Base interval in seconds, 0.5–60; randomized between 60% and 140%, then adjusted by `speed` |
| `double-blink-chance` | `24` | Probability of an idle double blink, 0–100% |
| `entrance-blur` | `6` | Starting blur in SVG units, 0–30; applies on replay |
| `intro` | `true` | Set to `false` to start with an open, interactive eye. The entrance waits until the element is in view |
| `emotion` | `neutral` | `neutral`, `happy`, `angry`, `scared`, or `skeptical`. A named emotion stays on. Neutral keeps the original eye, then briefly shows one of the other faces at random. Skeptical is half closed, with one side narrower |
| `color` | inherited | Eye color; also accepts ordinary CSS `color` on the element |

For toggles, use `="false"` to disable. Removing the attribute restores `true`.
An empty toggle attribute enables it. `"0"` and `"off"` also disable it.

Hover smoothly changes openness to 120% and increases pupil radius by 20%, then
restores the selected values on leave. Blinking still fully closes the eye.
The pupil is transparent, allowing the background to show through.

After the entrance, attention comes and goes. For a few seconds the eye watches
the pointer. Then it looks around on its own, holding each glance before choosing
another, and a moving pointer does not pull it back. Hovering the mark makes it
watch the pointer until the pointer leaves. While it is watching and the pointer
is still, idle glances shift around that point and then return. Longer idle
periods occasionally relax the upper lid by 8–14%. These
behaviors begin after the entrance and pause while the page is hidden. Their
pace follows `speed`; reduced motion disables them. The test panel has separate
toggles for all three behaviors.

Changing openness or either behavior toggle switches to a live preview. Other
options keep the current animation running. A device's reduced-motion preference
disables animation and tracking; appearance controls remain available.

## JavaScript methods and events

```js
await customElements.whenDefined('skxv-watermark');
const eye = document.querySelector('skxv-watermark');
const animated = await eye.ready; // false if loading failed or this mount was canceled

eye.setAttribute('openness', '75');
await eye.blink();        // trigger one blink
await eye.blink(true);    // trigger two blinks
await eye.replay();       // replay entrance with the current options
await eye.preview();      // skip to an open, interactive eye
await eye.resetOptions(); // restore defaults and replay

console.log(eye.options); // parsed values, using the attribute names and units
```

Methods wait for initialization before triggering their action. They do not wait
for the resulting animation to finish. Call them after the element is mounted.
`ready` is renewed on each mount. Events are dispatched on the component:

- `watermark-ready`: GSAP loaded and the instance initialized.
- `watermark-error`: static fallback is active; `event.detail.message` describes the failure.
- `watermark-motion-change`: the device's reduced-motion preference changed.

The component uses [standard custom element lifecycle callbacks](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
and the [custom HTML element support in React](https://react.dev/reference/react-dom/components#custom-html-elements).
