# @mdcrty/paint

A zero-dependency React canvas paint component with built-in brush, eraser, and bucket fill tools.

---

## Features

- Brush, eraser, and bucket fill tools
- Dynamic slider — size in px for brush/eraser, tolerance % for bucket
- Colour palette with custom colour picker
- Brush/eraser size preview cursor (visible on light and dark backgrounds)
- Built-in save (PNG download) and clear actions
- Fully customisable via `classNames` or a `renderControls` render prop
- No runtime dependencies beyond React

---

## Installation

```bash
npm install @mdcrty/paint
```

Peer dependencies: `react >= 18`, `react-dom >= 18`

---

## Basic Usage

```tsx
import { Paint } from "@mdcrty/paint";

export default function Page() {
  return <Paint controls />;
}
```

`controls` enables the built-in toolbar (tools, slider, palette, save/clear buttons).

---

## Props

```ts
type PaintProps = {
  controls?: boolean;
  colors?: string[];
  fillTolerance?: number;
  renderControls?: (state: PaintState) => ReactNode;
  classNames?: PaintClassNames;
};
```

| Prop | Default | Description |
|---|---|---|
| `controls` | `false` | Show the built-in toolbar |
| `colors` | `["#000", "#EF626C", "#FDEC03", "#24D102", "#FFF"]` | Preset colour swatches |
| `fillTolerance` | `80` | Initial bucket tolerance (0–128, raw per-channel RGBA delta) |
| `renderControls` | — | Replace the built-in toolbar entirely with your own UI |
| `classNames` | — | Override class names on individual toolbar slots |

---

## Imperative API

Access via `ref` to trigger actions from outside the component:

```tsx
import { useRef } from "react";
import { Paint, PaintHandle } from "@mdcrty/paint";

export default function Page() {
  const paintRef = useRef<PaintHandle>(null);

  return (
    <>
      <Paint ref={paintRef} controls />
      <button onClick={() => paintRef.current?.clearCanvas()}>Clear</button>
      <button onClick={() => paintRef.current?.saveImage()}>Save</button>
    </>
  );
}
```

```ts
type PaintHandle = {
  clearCanvas(): void;
  saveImage(): void;
};
```

---

## Custom Controls

Use `renderControls` to replace the built-in toolbar with your own UI. All canvas state and actions are passed in:

```tsx
<Paint
  renderControls={({ marker, setMarker, toolSelection, setToolSelection, clearCanvas }) => (
    <div>
      <button onClick={() => setToolSelection("brush")}>Brush</button>
      <button onClick={() => setToolSelection("eraser")}>Eraser</button>
      <button onClick={() => setMarker("#ff0000")}>Red</button>
      <button onClick={clearCanvas}>Clear</button>
    </div>
  )}
/>
```

```ts
type PaintState = {
  marker: string;
  setMarker: (color: string) => void;
  markerWidth: number;
  setMarkerWidth: (width: number) => void;
  toolSelection: string;
  setToolSelection: (tool: string) => void;
  customColor: string;
  setCustomColor: (color: string) => void;
  fillTolerance: number;
  setFillTolerance: (v: number) => void;
  colors: string[];
  clearCanvas: () => void;
  saveImage: () => void;
};
```

---

## Styling Slots

Pass `classNames` to override individual elements in the built-in toolbar:

```tsx
<Paint
  controls
  classNames={{
    tools: styles.tools,
    colors: styles.colors,
  }}
/>
```

```ts
type PaintClassNames = {
  control?: string;
  tools?: string;
  brushSize?: string;
  colors?: string;
  clr?: string;
  customClr?: string;
  brush?: string;
  bucket?: string;
  eraser?: string;
  bottomControl?: string;
  btn?: string;
  btnClear?: string;
  btnSave?: string;
};
```

---

## License

MIT © mdcrty

## Links

- GitHub: https://github.com/mdcrty/mdcrty-packages
- npm: https://www.npmjs.com/package/@mdcrty/paint
