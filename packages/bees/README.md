# @mdcrty/bees 🐝

A performant, canvas-based animated bee swarm for React.

`@mdcrty/bees` renders a decorative, full-page bee animation using the HTML canvas.  
It is designed for use as a background or ambient visual effect and includes
cross-browser fixes, configurable layering, and sensible defaults for modern React apps.

---

## Features

- 🐝 Animated bee swarm rendered on canvas
- ⚡ Optimised for performance (requestAnimationFrame, idle handling)
- 🧠 Cross-browser fixes (Chrome / Safari / Windows quirks handled)
- 🧩 Works anywhere in the React tree
- 🎚 Configurable density, timing, and animation behaviour
- 🧱 Adjustable `zIndex` for flexible layering
- 🧼 No UI framework dependencies

---

## Installation

```bash
npm install @mdcrty/bees
```

## Peer dependencies:
- react >= 18
- react-dom >= 18

## Basic Usage

```tsx
import { Bees } from "@mdcrty/bees";

export default function Page() {
  return <Bees />;
}
```

By default, the animation will start immediately and run as a decorative background.

## Props
```ts
type BeesProps = {
  playAnimation?: boolean;
  pause?: boolean;
  fps?: number;
  beeSize?: number;
  beeDensityRatio?: number;
  targetHoneycombCoverage?: number;
  idleDelaySec?: number;
  clusterRampStartSec?: number;
  clusterRampStepSec?: number;
  zIndex?: number;
  closeButtonClassName?: string;
  closeButtonStyle?: React.CSSProperties;
};
```

### Notable Props
#### zIndex
Controls how the canvas layers relative to other content.
```tsx
<Bees zIndex={0} />      // blended with page elements
<Bees zIndex={1} />      // neutral (default)
<Bees zIndex={-1} />     // background
<Bees zIndex={1000} />   // overlay
```

#### closeButtonClassName / closeButtonStyle
Reposition or restyle the hex close button. By default it sits fixed at `2em` from the top-left of the viewport.
```tsx
// Move it to the top-right with a class...
<Bees closeButtonClassName="my-close-button" />

// ...or with inline styles
<Bees closeButtonStyle={{ top: "1em", left: "auto", right: "1em" }} />
```

#### idleDelaySec
Delay (in seconds) before the animation starts or returns after x button press.

```tsx
<Bees idleDelaySec={30} />
```

## Notes on Rendering
- The animation uses a full-document canvas internally.
- Canvas sizing includes defensive fixes for browser scrollbar and sub-pixel rounding issues.
- A small 1px width adjustment is applied intentionally to prevent horizontal overflow on Chrome on Windows.

These behaviours are deliberate and tested across environments.

## License
MIT © mdcrty

## Links
- Demo: https://mediocrity.media/beez/
- GitHub: https://github.com/mdcrty/mdcrty-packages
- npm: https://www.npmjs.com/package/@mdcrty/bees