# @mdcrty/digital-rain

A React-powered Matrix-style digital rain effect with:

- High-performance canvas animation
- Interactive console commands (run, quit, sauce, etc.)
- Optional fixed/static messages appearing inside the rain
- A framework-agnostic SourceCodeProvider for toggling your own source-code viewer

Perfect for portfolio sites, Easter eggs, hacker aesthetics, or interactive visuals.

---

## Installation

npm install @mdcrty/digital-rain

During development (local linking), you can use:

```jsonc
{
  "dependencies": {
    "@mdcrty/digital-rain": "file:../mdcrty-packages/packages/digital-rain"
  }
}
```

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

With hidden text, only reavealed with source code

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

## Console Commands

Press ~ to open the mini console.

Commands must be entered as:

```
~ % command
```

### Available Commands

- run — start animation
- quit — stop/hide animation
- sauce — stop/hide animation & trigger SourceCodeProvider.show()
- help — joke help message
- HELP HELP — real help menu
- reset — reset options
- set \<option\> \<value\> — update numeric option
- show \<item\> — show settings panel
- hide — hide panel

## Props

All props are optional.

```ts
export type DigitalRainOptions = {
  autoRun?: boolean;
  fontSize?: number;
  fps?: number;
  alpha?: number;
  variabilityOfStart?: number;
  numberOfColumnOverlaps?: number;
  changeCharacterFrequency?: number;
  changeCharacterDuration?: number;
  frequencyOfRandomCellsInColumns?: number;
  numberOfRandomCellsInColumns?: number;
  staticMessages?: string[];
};
```

Defaults are built-in.

## Static Messages

Add text to appear inside the rain:

```tsx
<DigitalRain staticMessages={["HELLO WORLD", "NEO"]} />
```

Characters remain white, fixed, and readable even though the canvas characters are mirrored.

## Source Code Toggle

Use the provided context:

```tsx
import { useSourceCode } from "@mdcrty/digital-rain";

const { isVisible, showSourceCode, hideSourceCode, toggleSourceCode } =
  useSourceCode();
```

Display your own UI when isVisible is true:

```tsx
return isVisible ? <MySourceCodePanel /> : null;
```

## File structure
```
src/
  DigitalRain.tsx
  index.ts
  source-code/
    SourceCodeContext.tsx
dist/
README.md
package.json
```

## Build

```
npm run build
```

Outputs to dist/:
- ES module: index.js
- CommonJS: index.cjs
- Type declarations: index.d.ts

## License

MIT © mdcrty
