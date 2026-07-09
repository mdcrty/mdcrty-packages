# @mdcrty/digital-rain

A React-powered Matrix-style digital rain effect with:

- High-performance canvas animation
- Interactive console commands (run, quit, sauce, set, etc.)
- Optional fixed/static messages appearing inside the rain
- QR code overlay — encode any value as a live mask over the rain
- Delay-based reveal for QR and static messages (sweep in with the rain head)
- A framework-agnostic SourceCodeProvider for toggling your own source-code viewer

Perfect for portfolio sites, Easter eggs, hacker aesthetics, or interactive visuals.

---

## Installation

```
npm install @mdcrty/digital-rain
```

---

## Usage

```tsx
"use client";

import { DigitalRain } from "@mdcrty/digital-rain";

export default function DigitalRainPage() {
  return (
    <DigitalRain staticMessages={["WELCOME", "TO THE DESERT", "OF THE REAL"]} />
  );
}
```

With QR code overlay:

```tsx
<DigitalRain
  qrValue="https://leonanderson.me/"
  qrOffAlpha={0.5}
  qrColor="#ffffff"
  qrDelaySec={5}
/>
```

With hidden text revealed via source code toggle:

```tsx
"use client";

import {
  DigitalRain,
  SourceCodeProvider,
  useSourceCode,
} from "@mdcrty/digital-rain";

export default function DigitalRainPage() {
  const { isVisible } = useSourceCode();
  return (
    <SourceCodeProvider>
      <DigitalRain
        staticMessages={["WELCOME", "TO THE DESERT", "OF THE REAL"]}
      />
      {isVisible && <div>Source Code</div>}
    </SourceCodeProvider>
  );
}
```

---

## Props

All props are optional.

```ts
export type DigitalRainOptions = {
  // Core
  autoRun?: boolean;               // Start animation on mount (default true)
  fontSize?: number;               // Font size in pixels (default 16)
  fps?: number;                    // Frames per second (default 20)
  alpha?: number;                  // Per-frame fade alpha 0–1 (default 0.02)
  variabilityOfStart?: number;     // Column reset randomness 0–1 (default 0.98)
  numberOfColumnOverlaps?: number; // Rain drops per column (default 2)
  changeCharacterFrequency?: number;  // Frames between character changes (default 4)
  changeCharacterDuration?: number;   // How many cells behind head keep changing (default 15)
  frequencyOfRandomCellsInColumns?: number; // 0–1 chance of random cells (default 1)
  numberOfRandomCellsInColumns?: number;    // Max random cells per column (default 6)

  // Static messages
  staticMessages?: string[];         // Lines of text rendered fixed and centred in the rain
  staticMessagesDelaySec?: number;      // Seconds before messages reveal (sweep in with rain head, default 0)

  // QR overlay
  qrValue?: string;          // Content to encode as a QR mask
  qrDelaySec?: number;     // Seconds before QR reveals (sweep in with rain head, default 0)
  qrScale?: number;          // Characters per QR module; 0 = auto-fit (default 1)
  qrOffAlpha?: number;       // Per-frame black overlay on off-modules: 1 = solid black, 0.1 = dimmed (default 0.95)
  qrQuietZone?: number;      // Quiet-zone width in modules, applied before scale (default 1)
  qrColor?: string;          // Colour for on-module characters (default "#0aff0a")
  qrStaticChar?: boolean;    // Render on-module cells as "■" instead of random glyphs (default false)

  // Source code toggle overrides
  onShowSourceCode?: () => void;
  onHideSourceCode?: () => void;
};
```

---

## Static Messages

Add text to appear inside the rain:

```tsx
<DigitalRain staticMessages={["HELLO WORLD", "NEO"]} />
```

Characters render white, fixed, and unmirrored. Optionally delay their reveal:

```tsx
<DigitalRain
  staticMessages={["SYSTEM ONLINE"]}
  staticMessagesDelaySec={8}
/>
```

The text sweeps in with the rain head after the delay elapses — no instant flash.

---

## QR Code Overlay

Encode any string as a QR mask over the rain. On-module cells stay bright; off-module cells receive a per-frame black overlay controlled by `qrOffAlpha`.

```tsx
<DigitalRain
  qrValue="https://example.com"
  qrOffAlpha={0.5}   // near-solid suppression of off-module rain
  qrColor="#ffffff"   // on-module characters in white
  qrStaticChar        // lock on-modules to "■" for a clean solid QR shape
  qrQuietZone={2}     // wider border around the QR
  qrDelaySec={10}   // reveal after 10 seconds, sweeping in with the rain
/>
```

`qrOffAlpha` controls how aggressively off-module cells are dimmed each frame.
Because the overlay compounds on every frame, the effect is geometric — small
increases in alpha produce large jumps in perceived darkness. Useful ranges:

| qrOffAlpha | Effect |
|---|---|
| `0.01 – 0.05` | Subtle dimming, rain clearly visible in off zones |
| `0.1 – 0.3` | Heavy suppression, rain barely visible |
| `0.5+` | Effectively solid black within a fraction of a second |
| `1.0` | Instant solid black, no rain visible in off zones |

Values between `0.01` and `0.05` give the most control over visible contrast.

---

## Console Commands

Press `~` to open the mini console. Commands must be prefixed with `~ % `.

### Available Commands

| Command | Description |
|---|---|
| `~ % run` | Start the animation |
| `~ % quit` | Stop and hide the animation |
| `~ % sauce` | Stop animation and trigger `onShowSourceCode` |
| `~ % help` | Display "THERE IS NO HELP!" |
| `~ % HELP HELP` | Show the full command reference |
| `~ % reset` | Reset all options to defaults |
| `~ % hide` | Close any open panel |
| `~ % system failure` | Trigger the SYSTEM FAILURE screen |
| `~ % show animationOptions` | Show current option values |
| `~ % show animationOptionsDefault` | Show default option values |
| `~ % set <option> <value>` | Set a numeric, string, or boolean option |
| `~ % set staticMessages w1 w2 w3` | Set static messages (space-separated words) |
| `~ % set staticMessages "msg one" "msg two"` | Set static messages (quoted strings) |
| `~ % set qrValue https://example.com` | Set QR code value live |
| `~ % set qrOffAlpha 0.5` | Adjust off-module dimming live |
| `~ % set qrStaticChar true` | Switch on-modules to "■" live |

All QR and static message props are settable at runtime via `~ % set`.

---

## Source Code Toggle

Use the provided context to wire in your own source-code viewer:

```tsx
import { useSourceCode } from "@mdcrty/digital-rain";

const { isVisible, showSourceCode, hideSourceCode, toggleSourceCode } =
  useSourceCode();
```

Display your own UI when `isVisible` is true:

```tsx
return isVisible ? <MySourceCodePanel /> : null;
```

---

## License

MIT © mdcrty

## Links

- Demo: https://mediocrity.media/digital-rain/
- GitHub: https://github.com/mdcrty/mdcrty-packages
- npm: https://www.npmjs.com/package/@mdcrty/digital-rain
