# @mdcrty/color

A zero-dependency React colour picker and converter. Converts between hex, RGB, HSL, HSV, LAB, LCH, OKLCH, HWB, and CMYK. Includes a visual picker (gradient square + hue + alpha bars), per-format text inputs with copy buttons, and an optional full-page ripple background mode.

## Demo

[mediocrity.media/color](https://mediocrity.media/color/)

## Installation

```bash
npm install @mdcrty/color
```

Peer dependencies: `react >= 18`, `react-dom >= 18`

## Usage

```tsx
import { Color } from "@mdcrty/color";

// Colour converter with input fields and picker
<Color input defaultColor="#E6D6B8" maxWidth={500} />

// Touch ripple only — no input UI, clicking the background cycles random colours
<Color touch />

// Both together
<Color touch input defaultColor="#E6D6B8" maxWidth={500} />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `input` | `boolean` | `false` | Render the input fields and picker UI |
| `touch` | `boolean` | `false` | Enable background ripple on page click |
| `defaultColor` | `string` | `"#FFFFFF"` | Starting colour (any valid CSS colour) |
| `inputs` | `string[]` | all formats | Which format inputs to show. Subset of `MOCKDATA` |
| `maxWidth` | `number \| string` | `500` | Max width of the content panel |
| `className` | `string` | — | Extra class on the outer wrapper |
| `classNames` | `ColorClassNames` | — | Per-slot class overrides (see below) |

### `inputs` values

The `MOCKDATA` export lists all supported formats in default order:

```ts
import { MOCKDATA } from "@mdcrty/color";
// ["hex", "rgb", "hsl", "hsv", "lab", "lch", "oklch", "hwb", "cmyk"]
```

Pass a subset to show only specific formats:

```tsx
<Color input inputs={["hex", "rgb", "hsl"]} />
```

## Slot overrides (`classNames`)

Use `classNames` to apply additional CSS classes to specific parts of the component without fighting `:global()` overrides:

```tsx
import type { ColorClassNames } from "@mdcrty/color";

const myClasses: ColorClassNames = {
  inner: styles.myPanel,
  trigger: styles.myTrigger,
  input: styles.myInput,
};

<Color input classNames={myClasses} />
```

| Slot | Element |
|------|---------|
| `inner` | Outer content wrapper (supplements `className`) |
| `trigger` | The rainbow/colour trigger button |
| `picker` | The collapsible picker panel |
| `inputGrid` | Grid wrapping all format inputs |
| `input` | Each format text input |
| `copyBtn` | Copy-to-clipboard button beside each input |

## Dark / light mode

The component sets `body.light` or `body.dark` based on the perceived brightness of the current colour and includes built-in CSS rules for both states. In `touch` mode this also updates `document.body.style.backgroundColor` and the `<meta name="theme-color">` tag on each ripple.

## `ColorObject`

The underlying colour conversion class is also exported for direct use:

```ts
import { ColorObject } from "@mdcrty/color";

const color = new ColorObject("#E6D6B8");
console.log(color.rgb.print()); // rgb(230, 214, 184)
console.log(color.hsl.print()); // hsl(38, 44%, 81%)
console.log(color.lab.print()); // lab(87, 2, 16)
```

## Links

- Demo: https://mediocrity.media/color/
- GitHub: https://github.com/mdcrty/mdcrty-packages
- npm: https://www.npmjs.com/package/@mdcrty/color
