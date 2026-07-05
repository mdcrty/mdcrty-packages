"use client";

import { useEffect, useRef, useState } from "react";
import classes from "./Color.module.css";
import { ColorObject } from "./colorObject";
import colorBrightness from "./colorBrightness";

const cx = (...args: (string | undefined)[]) => args.filter(Boolean).join(" ");

function parseNums(str: string): number[] {
  return (str.match(/[\d.]+/g) ?? []).map(Number);
}

function parseSignedNums(str: string): number[] {
  return (str.match(/-?[\d.]+/g) ?? []).map(Number);
}

function stripAlpha(str: string): string {
  // Only remove the trailing alpha channel from known alpha-format functions (rgba, hsla, lcha, etc.)
  const alphaFn = str.match(/^([a-z]+)a\s*\((.*)\)$/i);
  if (alphaFn) {
    return `${alphaFn[1]}(${alphaFn[2].replace(/,\s*[\d.]+\s*$/, "")})`;
  }
  return str.replace(/#([0-9a-f]{6})[0-9a-f]{2}$/i, "#$1");
}

function withAlpha(str: string, a: number): string {
  if (a >= 100 || !str) return str;
  const frac = (a / 100).toFixed(2);
  if (str.startsWith("#")) {
    const aa = Math.round((a / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    return str + aa;
  }
  return str.replace(/^([a-z]+)\(/, "$1a(").replace(/\)$/, `,${frac})`);
}

// ─── Slider sub-component ─────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  unit = "",
  gradient,
  formatter,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  gradient: string;
  formatter?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const safe = isNaN(value) ? 0 : value;
  const pct = ((safe - min) / (max - min)) * 100;
  return (
    <div className={classes.sliderRow}>
      <span className={classes.sliderLabel}>{label}</span>
      <div className={classes.sliderTrackWrap}>
        <div className={classes.sliderTrack} style={{ background: gradient }} />
        <div className={classes.sliderThumbEl} style={{ left: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={safe}
          className={classes.sliderNative}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <span className={classes.sliderValue}>
        {formatter ? formatter(safe) : `${safe}${unit}`}
      </span>
    </div>
  );
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function randomHexColorValue() {
  const colorRange = 16777215;
  return (
    "#" +
    Math.floor(Math.random() * colorRange)
      .toString(16)
      .toUpperCase()
  );
}

export const MOCKDATA = [
  "hex",
  "rgb",
  "hsl",
  "hsv",
  "lab",
  "lch",
  "oklch",
  "hwb",
  "cmyk",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColorClassNames = {
  /** Outer content wrapper — supplements the `className` prop. */
  inner?: string;
  /** The rainbow/colour trigger button. */
  trigger?: string;
  /** The collapsible picker panel. */
  picker?: string;
  /** Grid wrapping all format inputs. */
  inputGrid?: string;
  /** Each format text input. */
  input?: string;
  /** Copy-to-clipboard button beside each input. */
  copyBtn?: string;
};

export type ColorProps = {
  inputs?: string[];
  touch?: boolean;
  input?: boolean;
  defaultColor?: string;
  className?: string;
  maxWidth?: number | string;
  classNames?: ColorClassNames;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Color({
  inputs = MOCKDATA,
  touch = false,
  input = false,
  defaultColor = "#FFFFFF",
  className,
  maxWidth = 500,
  classNames = {},
}: Readonly<ColorProps>) {
  const colorObjectRef = useRef<ColorObject>(new ColorObject(""));
  const rippleSpanRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [val, setVal] = useState(100);
  const [alpha, setAlpha] = useState(100);
  const [sliderFormat, setSliderFormat] = useState<string>(() => inputs[0]);

  const [processedData, setProcessedData] = useState({
    hex: "",
    rgb: "",
    hsl: "",
    hsv: "",
    lab: "",
    lch: "",
    oklch: "",
    hwb: "",
    cmyk: "",
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function setBrightness(color: string) {
    if (colorBrightness(color) === "light") {
      document.body.classList.remove("dark");
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
      document.body.classList.add("dark");
    }
  }

  function applyColorToPage(hex: string) {
    document.body.style.backgroundColor = hex;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", hex);
    setBrightness(hex);
  }

  function syncPickerState(color: ColorObject) {
    if (color.validColor && color.hsv.h !== undefined) {
      setHue(color.hsv.h);
      setSat(color.hsv.s ?? 0);
      setVal(color.hsv.v ?? 100);
    }
  }

  function applyHSV(h: number, s: number, v: number) {
    setHue(h);
    setSat(s);
    setVal(v);
    const color = colorObjectRef.current;
    color.processInput(`hsv(${h},${s}%,${v}%)`);
    if (color.validColor) {
      setProcessedData({
        hex: color.hex.print(),
        rgb: color.rgb.print(),
        hsl: color.hsl.print(),
        hsv: color.hsv.print(),
        lab: color.lab.print(),
        lch: color.lch.print(),
        oklch: color.oklch.print(),
        hwb: color.hwb.print(),
        cmyk: color.cmyk.print(),
      });
      applyColorToPage(color.hex.print());
    }
  }

  // ─── Picker drag handlers ────────────────────────────────────────────────────

  function handleSquarePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    function onMove(me: PointerEvent) {
      const rect = squareRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = Math.round(
        Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width)) * 100,
      );
      const v = Math.round(
        Math.max(0, Math.min(1, 1 - (me.clientY - rect.top) / rect.height)) *
          100,
      );
      applyHSV(colorObjectRef.current.hsv.h ?? 0, s, v);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    onMove(e.nativeEvent);
  }

  function handleHuePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    function onMove(me: PointerEvent) {
      const rect = hueBarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const h = Math.round(
        Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width)) * 360,
      );
      applyHSV(
        h,
        colorObjectRef.current.hsv.s ?? 0,
        colorObjectRef.current.hsv.v ?? 100,
      );
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    onMove(e.nativeEvent);
  }

  // ─── Channel slider handlers ─────────────────────────────────────────────────

  function handleChannelSlider(format: string, channel: string, value: number) {
    const fmt = format === "hex" ? "rgb" : format;
    if (fmt === "rgb") {
      const [r = 0, g = 0, b = 0] = parseNums(processedData.rgb);
      const n = { r, g, b, [channel]: value };
      processColorInput(`rgb(${n.r},${n.g},${n.b})`, "rgb");
    } else if (fmt === "hsl") {
      const [h = 0, s = 0, l = 0] = parseNums(processedData.hsl);
      const n = { h, s, l, [channel]: value };
      processColorInput(`hsl(${n.h},${n.s}%,${n.l}%)`, "hsl");
    } else if (fmt === "hsv") {
      const [h = 0, s = 0, v = 0] = parseNums(processedData.hsv);
      const n = { h, s, v, [channel]: value };
      processColorInput(`hsv(${n.h},${n.s}%,${n.v}%)`, "hsv");
    } else if (fmt === "lab") {
      const [l = 0, a = 0, b = 0] = parseSignedNums(processedData.lab);
      const n = { l, a, b, [channel]: value };
      processColorInput(`lab(${n.l},${n.a},${n.b})`, "lab");
    } else if (fmt === "lch") {
      const [l = 0, c = 0, h = 0] = parseNums(processedData.lch);
      const n = { l, c, h, [channel]: value };
      processColorInput(`lch(${n.l},${n.c},${n.h})`, "lch");
    } else if (fmt === "oklch") {
      const [l = 0, c = 0, h = 0] = parseNums(processedData.oklch);
      const newC = channel === "c" ? value / 100 : c;
      const newL = channel === "l" ? value : l;
      const newH = channel === "h" ? value : h;
      processColorInput(`oklch(${newL}%,${newC.toFixed(3)},${newH})`, "oklch");
    } else if (fmt === "hwb") {
      const [h = 0, w = 0, b = 0] = parseNums(processedData.hwb);
      const n = { h, w, b, [channel]: value };
      processColorInput(`hwb(${n.h},${n.w}%,${n.b}%)`, "hwb");
    } else if (fmt === "cmyk") {
      const [c = 0, m = 0, y = 0, k = 0] = parseNums(processedData.cmyk);
      const n = { c, m, y, k, [channel]: value };
      processColorInput(`cmyk(${n.c}%,${n.m}%,${n.y}%,${n.k}%)`, "cmyk");
    }
  }

  const toHex = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");

  function renderSliders() {
    const fmt = sliderFormat;
    if (fmt === "hex" || fmt === "rgb") {
      const [r = 0, g = 0, b = 0] = parseNums(processedData.rgb);
      const hexFmt = fmt === "hex" ? toHex : undefined;
      return (
        <>
          <SliderRow
            label="R"
            value={r}
            max={255}
            gradient={`linear-gradient(to right, rgb(0,${g},${b}), rgb(255,${g},${b}))`}
            formatter={hexFmt}
            onChange={(v) => handleChannelSlider("rgb", "r", v)}
          />
          <SliderRow
            label="G"
            value={g}
            max={255}
            gradient={`linear-gradient(to right, rgb(${r},0,${b}), rgb(${r},255,${b}))`}
            formatter={hexFmt}
            onChange={(v) => handleChannelSlider("rgb", "g", v)}
          />
          <SliderRow
            label="B"
            value={b}
            max={255}
            gradient={`linear-gradient(to right, rgb(${r},${g},0), rgb(${r},${g},255))`}
            formatter={hexFmt}
            onChange={(v) => handleChannelSlider("rgb", "b", v)}
          />
        </>
      );
    }
    if (fmt === "hsl") {
      const [h = 0, s = 0, l = 0] = parseNums(processedData.hsl);
      return (
        <>
          <SliderRow
            label="H"
            value={h}
            max={360}
            unit="°"
            gradient="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
            onChange={(v) => handleChannelSlider("hsl", "h", v)}
          />
          <SliderRow
            label="S"
            value={s}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`}
            onChange={(v) => handleChannelSlider("hsl", "s", v)}
          />
          <SliderRow
            label="L"
            value={l}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, #000, hsl(${h},${s}%,50%), #fff)`}
            onChange={(v) => handleChannelSlider("hsl", "l", v)}
          />
        </>
      );
    }
    if (fmt === "hsv") {
      const [h = 0, s = 0, v = 0] = parseNums(processedData.hsv);
      return (
        <>
          <SliderRow
            label="H"
            value={h}
            max={360}
            unit="°"
            gradient="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
            onChange={(v) => handleChannelSlider("hsv", "h", v)}
          />
          <SliderRow
            label="S"
            value={s}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, hsl(${h},0%,50%), hsl(${h},100%,50%))`}
            onChange={(v) => handleChannelSlider("hsv", "s", v)}
          />
          <SliderRow
            label="V"
            value={v}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, #000, hsl(${h},100%,50%))`}
            onChange={(v) => handleChannelSlider("hsv", "v", v)}
          />
        </>
      );
    }
    if (fmt === "lab") {
      const [l = 0, a = 0, b = 0] = parseSignedNums(processedData.lab);
      return (
        <>
          <SliderRow
            label="L"
            value={l}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, #000, hsl(0,0%,${l}%), #fff)`}
            onChange={(v) => handleChannelSlider("lab", "l", v)}
          />
          <SliderRow
            label="A"
            value={a}
            min={-128}
            max={127}
            gradient={`linear-gradient(to right, hsl(150,100%,40%), hsl(0,0%,${l}%), hsl(0,100%,40%))`}
            onChange={(v) => handleChannelSlider("lab", "a", v)}
          />
          <SliderRow
            label="B"
            value={b}
            min={-128}
            max={127}
            gradient={`linear-gradient(to right, hsl(240,100%,40%), hsl(0,0%,${l}%), hsl(60,100%,40%))`}
            onChange={(v) => handleChannelSlider("lab", "b", v)}
          />
        </>
      );
    }
    if (fmt === "lch") {
      const [l = 0, c = 0, h = 0] = parseNums(processedData.lch);
      return (
        <>
          <SliderRow
            label="L"
            value={l}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#000,#fff)"
            onChange={(v) => handleChannelSlider("lch", "l", v)}
          />
          <SliderRow
            label="C"
            value={c}
            max={150}
            gradient={`linear-gradient(to right, hsl(${h},0%,50%), hsl(${h},100%,50%))`}
            onChange={(v) => handleChannelSlider("lch", "c", v)}
          />
          <SliderRow
            label="H"
            value={h}
            max={360}
            unit="°"
            gradient="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
            onChange={(v) => handleChannelSlider("lch", "h", v)}
          />
        </>
      );
    }
    if (fmt === "oklch") {
      const [l = 0, c = 0, h = 0] = parseNums(processedData.oklch);
      const cSlider = Math.round(c * 100);
      return (
        <>
          <SliderRow
            label="L"
            value={l}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#000,#fff)"
            onChange={(v) => handleChannelSlider("oklch", "l", v)}
          />
          <SliderRow
            label="C"
            value={cSlider}
            max={40}
            formatter={(v) => (v / 100).toFixed(3)}
            gradient={`linear-gradient(to right, hsl(${h},0%,50%), hsl(${h},100%,50%))`}
            onChange={(v) => handleChannelSlider("oklch", "c", v)}
          />
          <SliderRow
            label="H"
            value={h}
            max={360}
            unit="°"
            gradient="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
            onChange={(v) => handleChannelSlider("oklch", "h", v)}
          />
        </>
      );
    }
    if (fmt === "hwb") {
      const [h = 0, w = 0, b = 0] = parseNums(processedData.hwb);
      return (
        <>
          <SliderRow
            label="H"
            value={h}
            max={360}
            unit="°"
            gradient="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
            onChange={(v) => handleChannelSlider("hwb", "h", v)}
          />
          <SliderRow
            label="W"
            value={w}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, hsl(${h},100%,50%), #fff)`}
            onChange={(v) => handleChannelSlider("hwb", "w", v)}
          />
          <SliderRow
            label="B"
            value={b}
            max={100}
            unit="%"
            gradient={`linear-gradient(to right, hsl(${h},100%,50%), #000)`}
            onChange={(v) => handleChannelSlider("hwb", "b", v)}
          />
        </>
      );
    }
    if (fmt === "cmyk") {
      const [c = 0, m = 0, y = 0, k = 0] = parseNums(processedData.cmyk);
      return (
        <>
          <SliderRow
            label="C"
            value={c}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#fff,#0ff)"
            onChange={(v) => handleChannelSlider("cmyk", "c", v)}
          />
          <SliderRow
            label="M"
            value={m}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#fff,#f0f)"
            onChange={(v) => handleChannelSlider("cmyk", "m", v)}
          />
          <SliderRow
            label="Y"
            value={y}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#fff,#ff0)"
            onChange={(v) => handleChannelSlider("cmyk", "y", v)}
          />
          <SliderRow
            label="K"
            value={k}
            max={100}
            unit="%"
            gradient="linear-gradient(to right,#fff,#000)"
            onChange={(v) => handleChannelSlider("cmyk", "k", v)}
          />
        </>
      );
    }
    return null;
  }

  // ─── Ripple ───────────────────────────────────────────────────────────────────

  function doRipple(clientX: number, clientY: number) {
    const rippleSpan = rippleSpanRef.current;
    if (!rippleSpan) return;

    const color = colorObjectRef.current;
    color.processInput(randomHexColorValue());

    const size = Math.max(window.innerWidth, window.innerHeight);

    setProcessedData({
      hex: color.hex.print(),
      rgb: color.rgb.print(),
      hsl: color.hsl.print(),
      hsv: color.hsv.print(),
      lab: color.lab.print(),
      lch: color.lch.print(),
      oklch: color.oklch.print(),
      hwb: color.hwb.print(),
      cmyk: color.cmyk.print(),
    });
    setBrightness(color.hex.print());
    syncPickerState(color);

    rippleSpan.style.backgroundColor = color.rgb.print();
    rippleSpan.style.height = `${size}px`;
    rippleSpan.style.width = `${size}px`;
    rippleSpan.style.left = `${clientX - size / 2}px`;
    rippleSpan.style.top = `${clientY - size / 2}px`;
    rippleSpan.classList.add(classes.ripple);

    setTimeout(function () {
      rippleSpan.style.display = "none";
      rippleSpan.style.backgroundColor = "";
      rippleSpan.style.height = "";
      rippleSpan.style.width = "";
      rippleSpan.style.left = "";
      rippleSpan.style.top = "";
      rippleSpan.classList.remove(classes.ripple);
      rippleSpan.style.display = "";

      document.body.classList.add("notransition");
      document.body.style.backgroundColor = color.hex.print();
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", color.hex.print());
    }, 500);

    setTimeout(() => document.body.classList.remove("notransition"), 600);
  }

  useEffect(() => {
    if (!touch) return;
    function handleClick(e: MouseEvent) {
      if (innerRef.current?.contains(e.target as Node)) return;
      let el = e.target as Element | null;
      while (el && el !== document.documentElement) {
        const tag = el.tagName.toLowerCase();
        if (
          ["a", "button", "input", "select", "textarea", "label"].includes(tag)
        )
          return;
        el = el.parentElement;
      }
      doRipple(e.clientX, e.clientY);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
    // doRipple only uses stable refs/setters — no dep needed beyond touch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touch]);

  function processColorInput(input: string, id: string) {
    const color: ColorObject = colorObjectRef.current!;

    if (/^[a-z]+a\s*\(/i.test(input)) {
      const alphaFrac = input.match(/,\s*([\d.]+)\s*\)$/);
      if (alphaFrac) {
        const a = parseFloat(alphaFrac[1]);
        if (!isNaN(a)) setAlpha(a <= 1 ? Math.round(a * 100) : Math.round(a));
      }
    } else if (/^#[0-9a-f]{8}$/i.test(input)) {
      setAlpha(Math.round((parseInt(input.slice(-2), 16) / 255) * 100));
    }
    const clean = stripAlpha(input);

    if (/^#/.test(clean)) {
      color.processInput(clean);
    } else if (id === "hex") {
      color.processInput("#" + clean);
    } else if (clean) {
      const match = clean.match(/^[a-z]{3,}?a?\((.*)\)$/i);
      const inputNumber = match && match[1] ? match[1] : clean;
      color.processInput(id + "(" + inputNumber + ")");
    }

    setProcessedData(() => ({
      hex: "",
      rgb: "",
      hsl: "",
      hsv: "",
      lab: "",
      lch: "",
      oklch: "",
      hwb: "",
      cmyk: "",
      [id]: input,
    }));

    if (color.validColor) {
      setProcessedData({
        hex: color.hex.print(),
        rgb: color.rgb.print(),
        hsl: color.hsl.print(),
        hsv: color.hsv.print(),
        lab: color.lab.print(),
        lch: color.lch.print(),
        oklch: color.oklch.print(),
        hwb: color.hwb.print(),
        cmyk: color.cmyk.print(),
        [id]: input,
      });

      document.body.style.backgroundColor = color.hex.print();
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", color.hex.print());
      setBrightness(color.hex.print());
      syncPickerState(color);
    } else {
      document.body.style.backgroundColor = defaultColor;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", defaultColor);
      setBrightness(defaultColor);
    }
  }

  // ─── Picker panel ──────────────────────────────────────────────────────────

  const hueRainbow =
    "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
  const [curR = 0, curG = 0, curB = 0] = parseNums(processedData.rgb);

  const tabPerRow =
    inputs.length <= 5
      ? inputs.length
      : inputs.length <= 10
        ? Math.ceil(inputs.length / 2)
        : Math.ceil(inputs.length / 3);
  const tabRows: string[][] = [];
  for (let i = 0; i < inputs.length; i += tabPerRow) {
    tabRows.push(inputs.slice(i, i + tabPerRow));
  }

  const pickerPanel = (
    <div
      className={cx(
        classes.pickerWrap,
        pickerOpen ? classes.pickerOpen : undefined,
        classNames.picker,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={classes.pickerInner}>
        <div className={classes.pickerSquareWrap}>
          <div
            ref={squareRef}
            className={classes.pickerSquare}
            style={{ background: `hsl(${hue},100%,50%)`, opacity: alpha / 100 }}
            onPointerDown={handleSquarePointerDown}
          >
            <div className={classes.pickerSquareWhite} />
            <div className={classes.pickerSquareBlack} />
            <div
              className={classes.pickerCursor}
              style={{ left: `${sat}%`, top: `${100 - val}%` }}
            />
          </div>
        </div>

        <div
          ref={hueBarRef}
          className={classes.hueBar}
          style={{ background: hueRainbow }}
          onPointerDown={handleHuePointerDown}
        >
          <div
            className={classes.hueThumb}
            style={{ left: `${(hue / 360) * 100}%` }}
          />
        </div>

        <div className={classes.alphaBarWrap}>
          <div
            className={classes.alphaBar}
            style={{
              background: `linear-gradient(to right, rgba(${curR},${curG},${curB},0), rgb(${curR},${curG},${curB}))`,
            }}
          />
          <div className={classes.hueThumb} style={{ left: `${alpha}%` }} />
          <input
            type="range"
            min={0}
            max={100}
            value={alpha}
            className={classes.alphaRangeInput}
            onChange={(e) => setAlpha(Number(e.target.value))}
          />
        </div>

        <div className={classes.sliderTabs}>
          {tabRows.map((row, ri) => (
            <div key={ri} className={classes.sliderTabRow}>
              {row.map((fmt) => (
                <button
                  key={fmt}
                  className={cx(
                    classes.sliderTab,
                    sliderFormat === fmt ? classes.sliderTabActive : undefined,
                  )}
                  onClick={() => setSliderFormat(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className={classes.sliders}>{renderSliders()}</div>
      </div>
    </div>
  );

  // ─── Input list ────────────────────────────────────────────────────────────

  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  function copyToClipboard(type: string, value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopiedFormat(type);
      setTimeout(() => setCopiedFormat(null), 1200);
    });
  }

  const inputEls = inputs.map((type) => {
    const value = withAlpha(
      processedData[type as keyof typeof processedData],
      alpha,
    );
    const copied = copiedFormat === type;
    return (
      <div
        key={type}
        className={cx(
          classes.inputItem,
          type === "hex" ? classes.inputItemWide : undefined,
        )}
      >
        <input
          onChange={(e) => processColorInput(e.target.value, e.target.id)}
          onClick={(e) => e.stopPropagation()}
          className={cx(classes.input, classNames.input)}
          value={value}
          id={type}
          type="text"
          placeholder={type}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className={cx(
            classes.copyBtn,
            copied ? classes.copyBtnDone : undefined,
            classNames.copyBtn,
          )}
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(type, value);
          }}
          aria-label={`Copy ${type}`}
          disabled={!value}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
          )}
        </button>
      </div>
    );
  });

  // ─── Rainbow trigger ───────────────────────────────────────────────────────

  const swatchBtn = (
    <div
      className={cx(
        classes.pickerTriggerWrap,
        pickerOpen ? classes.pickerTriggerWrapOpen : undefined,
      )}
    >
      <button
        className={cx(
          classes.pickerTrigger,
          pickerOpen ? classes.pickerTriggerOpen : undefined,
          classNames.trigger,
        )}
        onClick={(e) => {
          e.stopPropagation();
          setPickerOpen((o) => !o);
        }}
        aria-label={pickerOpen ? "Close color picker" : "Open color picker"}
      >
        <svg
          className={cx(
            classes.pickerChevron,
            pickerOpen ? classes.pickerChevronOpen : undefined,
          )}
          width="14"
          height="8"
          viewBox="0 0 14 8"
          fill="none"
        >
          <path
            d="M1 1l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {input && (
        <div
          ref={innerRef}
          className={cx(classes.inner, className, classNames.inner)}
          style={{ maxWidth }}
        >
          {swatchBtn}
          {pickerPanel}
          <div className={cx(classes.inputGrid, classNames.inputGrid)}>{inputEls}</div>
        </div>
      )}
      {touch && <span ref={rippleSpanRef} />}
    </>
  );
}
