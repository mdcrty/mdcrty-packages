"use client";

import {
  forwardRef,
  ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import classes from "./Paint.module.css";
import colorBrightness from "./colorBrightness";

const cx = (...args: (string | undefined)[]) => args.filter(Boolean).join(" ");

export const PAINT_MOCKDATA = ["#000", "#EF626C", "#FDEC03", "#24D102", "#FFF"];

// ─── Public types ────────────────────────────────────────────────────────────

/** Imperative handle exposed via ref. */
export type PaintHandle = {
  clearCanvas(): void;
  saveImage(): void;
};

/**
 * State and actions passed to the `renderControls` render prop.
 * Use this to build fully custom control UIs while the canvas logic stays in Paint.
 */
export type PaintState = {
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

/** Override class names for individual slots in the built-in control UI. */
export type PaintClassNames = {
  control?: string;
  /** The tools container (brush / eraser / bucket buttons). */
  tools?: string;
  brushSize?: string;
  colors?: string;
  clr?: string;
  customClr?: string;
  /** Applied to the brush tool button. */
  brush?: string;
  bucket?: string;
  eraser?: string;
  bottomControl?: string;
  /** Applied to both action buttons. */
  btn?: string;
  /** Applied to the clear button (in addition to `btn`). */
  btnClear?: string;
  /** Applied to the save button (in addition to `btn`). */
  btnSave?: string;
};

export type PaintProps = {
  /** Show the built-in controls bar. Ignored when `renderControls` is provided. */
  controls?: boolean;
  /** Preset colour swatches shown in the built-in palette. */
  colors?: string[];
  /**
   * Initial fill tolerance for the bucket tool. Raw per-channel delta on the
   * 0–255 RGBA scale (0 = exact match, 128 = ~50% — the built-in slider ceiling).
   * Displayed as a percentage of 255 in the built-in UI.
   * @default 80
   */
  fillTolerance?: number;
  /**
   * Vary stroke width with pen pressure. When enabled and a pen/stylus (e.g.
   * Apple Pencil) is used, width is mapped between `markerWidth * minWidthRatio`
   * and `markerWidth` by `PointerEvent.pressure`. Mouse and touch input always
   * draw at `markerWidth`.
   * @default true
   */
  pressure?: boolean;
  /**
   * Floor for the pressure→width mapping, as a fraction of `markerWidth` (only
   * used when `pressure` is on and a pen is used). The lightest stroke is
   * `markerWidth * minWidthRatio`; full pressure is `markerWidth`. Scaling the
   * floor to the slider keeps the light/heavy feel consistent across sizes.
   * @default 0.15
   */
  minWidthRatio?: number;
  /**
   * Replace the built-in controls entirely with your own UI.
   * Receives all canvas state and action callbacks.
   */
  renderControls?: (state: PaintState) => ReactNode;
  /** Override individual class names on the built-in control slots. */
  classNames?: PaintClassNames;
};

// ─── Inline SVG icons (no external dependency) ───────────────────────────────

function IconEraser({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 20H7l-4-4 9.5-9.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L10 20" />
      <path d="M6.5 12.5l5 5" />
    </svg>
  );
}

function IconPalette({
  size = 22,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.582 9 8 0 1.06-.474 2.078-1.318 2.828-.844.75-1.989 1.172-3.182 1.172H15a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21" />
      <circle cx="8.5" cy="10.5" r="1" fill={color} />
      <circle cx="12.5" cy="7.5" r="1" fill={color} />
      <circle cx="16.5" cy="10.5" r="1" fill={color} />
    </svg>
  );
}

function IconBrush({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 21v-4a4 4 0 1 1 4 4h-4" />
      <path d="M21 3a16 16 0 0 0 -12.8 10.2" />
      <path d="M21 3a16 16 0 0 1 -10.2 12.8" />
      <path d="M10.6 9a9 9 0 0 1 4.4 4.4" />
    </svg>
  );
}

function IconBucket({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M5 16l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737" />
      <path d="M13.737 9.737c2.299 -2.3 3.23 -5.095 2.081 -6.245c-1.15 -1.15 -3.945 -.217 -6.244 2.082c-2.3 2.299 -3.231 5.095 -2.082 6.244c1.15 1.15 3.946 .218 6.245 -2.081" />
      <path d="M7.492 11.818c.362 .362 .768 .676 1.208 .934l6.895 4.047c1.078 .557 2.255 -.075 3.692 -1.512c1.437 -1.437 2.07 -2.614 1.512 -3.692c-.372 -.718 -1.72 -3.017 -4.047 -6.895a6.015 6.015 0 0 0 -.934 -1.208" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Draws a smooth bezier path through accumulated points onto the given context.
 * Falls back to a filled dot for fewer than 3 points.
 */
function drawBezierPath(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
) {
  if (pts.length < 3) {
    const b = pts[0];
    ctx.beginPath();
    ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.closePath();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  let i;
  for (i = 1; i < pts.length - 2; i++) {
    const c = (pts[i].x + pts[i + 1].x) / 2;
    const d = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, c, d);
  }
  ctx.quadraticCurveTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  ctx.stroke();
}

/**
 * Draws a variable-width stroke where each point carries its own width `w`
 * (from pointer pressure). Because a single canvas path can only have one
 * `lineWidth`, each midpoint-smoothed segment is stroked individually with the
 * average width of its endpoints; round caps/joins keep the segments continuous.
 * Falls back to a filled dot for fewer than 3 points.
 */
function drawVariablePath(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number; w: number }>,
) {
  if (pts.length < 3) {
    const b = pts[0];
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.w / 2, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.closePath();
    return;
  }

  let i;
  for (i = 1; i < pts.length - 2; i++) {
    const cx0 = (pts[i].x + pts[i + 1].x) / 2;
    const cy0 = (pts[i].y + pts[i + 1].y) / 2;
    const px = (pts[i - 1].x + pts[i].x) / 2;
    const py = (pts[i - 1].y + pts[i].y) / 2;
    ctx.beginPath();
    ctx.lineWidth = (pts[i].w + pts[i + 1].w) / 2;
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx0, cy0);
    ctx.stroke();
  }
  // Final segment to the last point
  ctx.beginPath();
  ctx.lineWidth = (pts[i].w + pts[i + 1].w) / 2;
  ctx.moveTo((pts[i - 1].x + pts[i].x) / 2, (pts[i - 1].y + pts[i].y) / 2);
  ctx.quadraticCurveTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  ctx.stroke();
}

/**
 * Scanline flood fill on a canvas context.
 *
 * Snapshots the pixel data, fills all connected pixels whose colour is within
 * `tolerance` of the target (the pixel at startX/startY), then writes back.
 * The scanline approach processes full horizontal runs at once, making it
 * significantly faster than naive BFS for large fills.
 *
 * A `visited` bitfield prevents infinite loops when `tolerance > 0` causes
 * newly-filled pixels to still match the target colour.
 */
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string,
  tolerance: number,
) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;

  const x0 = Math.round(startX);
  const y0 = Math.round(startY);
  if (x0 < 0 || x0 >= w || y0 < 0 || y0 >= h) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Parse fill colour to RGBA via a tiny offscreen canvas — works with any
  // valid CSS colour string (hex, rgb, named, etc.)
  const tiny = document.createElement("canvas");
  tiny.width = tiny.height = 1;
  const tc = tiny.getContext("2d")!;
  tc.fillStyle = fillColor;
  tc.fillRect(0, 0, 1, 1);
  const fill = tc.getImageData(0, 0, 1, 1).data;
  const [fr, fg, fb, fa] = [fill[0], fill[1], fill[2], fill[3]];

  // Target colour at the clicked pixel (using pixel index throughout)
  const si = y0 * w + x0;
  const bi = si * 4;
  const [tr, tg, tb, ta] = [data[bi], data[bi + 1], data[bi + 2], data[bi + 3]];

  // Already the fill colour — nothing to do
  if (tr === fr && tg === fg && tb === fb && ta === fa) return;

  // matches / setPixel both take a pixel index (not byte offset) for clarity
  const matches = (pi: number) => {
    const i = pi * 4;
    return (
      Math.abs(data[i] - tr) <= tolerance &&
      Math.abs(data[i + 1] - tg) <= tolerance &&
      Math.abs(data[i + 2] - tb) <= tolerance &&
      Math.abs(data[i + 3] - ta) <= tolerance
    );
  };

  // Track filled pixels so the post-fill boundary pass can find them
  const filled = new Uint8Array(w * h);

  const setPixel = (pi: number) => {
    const i = pi * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;
    filled[pi] = 1;
  };

  // One byte per pixel — prevents duplicate stack pushes (needed when
  // tolerance > 0 means filled pixels can still satisfy `matches`)
  const visited = new Uint8Array(w * h);

  const stack: Array<[number, number]> = [[x0, y0]];
  visited[si] = 1;

  while (stack.length > 0) {
    const [sx, sy] = stack.pop()!;

    if (!matches(sy * w + sx)) continue;

    // Scan left to the boundary of the matching region
    let lx = sx;
    while (lx > 0 && matches(sy * w + lx - 1)) lx--;

    // Scan right: fill the span and push unvisited neighbours above/below
    let spanAbove = false;
    let spanBelow = false;
    let rx = lx;

    while (rx < w && matches(sy * w + rx)) {
      setPixel(sy * w + rx);

      if (sy > 0) {
        const above = (sy - 1) * w + rx;
        if (!spanAbove && matches(above) && !visited[above]) {
          visited[above] = 1;
          stack.push([rx, sy - 1]);
          spanAbove = true;
        } else if (spanAbove && !matches(above)) {
          spanAbove = false;
        }
      }

      if (sy < h - 1) {
        const below = (sy + 1) * w + rx;
        if (!spanBelow && matches(below) && !visited[below]) {
          visited[below] = 1;
          stack.push([rx, sy + 1]);
          spanBelow = true;
        } else if (spanBelow && !matches(below)) {
          spanBelow = false;
        }
      }

      rx++;
    }
  }

  // Post-fill pass: eliminate the 1-pixel anti-aliased fringe that scanline
  // fill leaves at stroke edges. Any semi-transparent pixel (alpha < 200)
  // directly adjacent to a filled pixel is also filled.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const pi = py * w + px;
      if (!filled[pi]) continue;
      if (px > 0 && !filled[pi - 1] && data[(pi - 1) * 4 + 3] < 200)
        setPixel(pi - 1);
      if (px < w - 1 && !filled[pi + 1] && data[(pi + 1) * 4 + 3] < 200)
        setPixel(pi + 1);
      if (py > 0 && !filled[pi - w] && data[(pi - w) * 4 + 3] < 200)
        setPixel(pi - w);
      if (py < h - 1 && !filled[pi + w] && data[(pi + w) * 4 + 3] < 200)
        setPixel(pi + w);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

const Paint = forwardRef<PaintHandle, PaintProps>(function Paint(
  {
    controls,
    colors = PAINT_MOCKDATA,
    fillTolerance: fillToleranceProp = 80,
    pressure = true,
    minWidthRatio = 0.15,
    renderControls,
    classNames = {},
  },
  ref,
) {
  const [marker, setMarker] = useState(colors[0]);
  const [markerWidth, setMarkerWidth] = useState(5);
  // "brush" | "bucket" | "eraser" — tool is independent of colour choice
  const [toolSelection, setToolSelection] = useState("brush");
  const [customColor, setCustomColor] = useState("#A020F0");
  const [fillTolerance, setFillTolerance] = useState(fillToleranceProp);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [tmp_context, setTmpContext] =
    useState<CanvasRenderingContext2D | null>(null);

  const cursorRef = useRef({ x: 0, y: 0, w: markerWidth });
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const tmp_canvas_ref = useRef<HTMLCanvasElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);
  const pptsRef = useRef<Array<{ x: number; y: number; w: number }>>([]);
  // A stroke is in progress (pointer captured). Replaces the old add/remove of
  // the move listener — the persistent pointermove handler checks this.
  const drawingRef = useRef(false);
  // Whether the current stroke varies width with pressure (pen + `pressure`).
  const strokeVariableRef = useRef(false);
  // Captured once on eraser mousedown; restored before each paint frame so
  // the eraser stroke is drawn directly on ctx with destination-out live.
  const eraserSnapshotRef = useRef<ImageData | null>(null);
  // Sized circle that follows the cursor for brush/eraser — updated via direct
  // DOM manipulation so mousemove doesn't trigger React re-renders.
  const cursorCircleRef = useRef<HTMLDivElement>(null);

  function setupCanvas(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    const rect = { width: window.innerWidth, height: window.innerHeight };
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    canvas.width = rect.width;
    canvas.height = rect.height;
    return ctx;
  }

  function clearCanvas() {
    if (!context || !canvas_ref.current) return;
    context.clearRect(
      0,
      0,
      canvas_ref.current.width,
      canvas_ref.current.height,
    );
  }

  function saveImage() {
    if (!canvas_ref.current) return;
    const data = canvas_ref.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = data;
    a.download = "sketch.png";
    a.click();
    a.remove();
  }

  useImperativeHandle(ref, () => ({ clearCanvas, saveImage }));

  useEffect(() => {
    if (!canvas_ref.current || !tmp_canvas_ref.current) return;

    const canvas = canvas_ref.current;
    const tmp_canvas = tmp_canvas_ref.current;

    let ctx: CanvasRenderingContext2D | null = null;
    let tmp_ctx: CanvasRenderingContext2D | null = null;

    if (tmp_context !== null) {
      ctx = context;
      tmp_ctx = tmp_context;
    } else {
      ctx = setupCanvas(canvas);
      setContext(ctx);
      tmp_ctx = setupCanvas(tmp_canvas);
      setTmpContext(tmp_ctx);
      tmp_ctx.lineJoin = "round";
      tmp_ctx.lineCap = "round";
    }

    if (tmp_ctx) {
      tmp_ctx.lineWidth = markerWidth;
      tmp_ctx.strokeStyle = marker;
      tmp_ctx.fillStyle = marker;
    }

    // Map a pointer event to a stroke width. Only pen input with `pressure`
    // enabled varies width; mouse/touch always draw at markerWidth.
    const widthFor = (ev: PointerEvent) => {
      if (!pressure || ev.pointerType !== "pen") return markerWidth;
      const floor = markerWidth * minWidthRatio;
      return floor + ev.pressure * (markerWidth - floor);
    };

    const cursorStart = (ev: PointerEvent) => {
      // Ignore secondary pointers (e.g. a second finger) mid-stroke
      if (!ev.isPrimary) return;

      const x = ev.offsetX;
      const y = ev.offsetY;

      // Bucket fill is a single click — don't start a stroke
      if (toolSelection === "bucket" && ctx) {
        floodFill(ctx, x, y, marker, fillTolerance);
        return;
      }

      ev.preventDefault();
      tmp_canvas.setPointerCapture(ev.pointerId);
      drawingRef.current = true;
      strokeVariableRef.current = pressure && ev.pointerType === "pen";

      const w = widthFor(ev);
      cursorRef.current.x = x;
      cursorRef.current.y = y;
      cursorRef.current.w = w;

      // Snapshot once per eraser stroke so onPaint can restore + redraw live
      if (toolSelection === "eraser" && ctx) {
        eraserSnapshotRef.current = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }

      pptsRef.current.push({ x, y, w });
      onPaint();
    };

    const cursorMove = (ev: PointerEvent) => {
      cursorRef.current.x = ev.offsetX;
      cursorRef.current.y = ev.offsetY;
      cursorRef.current.w = widthFor(ev);
      if (cursorCircleRef.current) {
        cursorCircleRef.current.style.left = `${ev.clientX}px`;
        cursorCircleRef.current.style.top = `${ev.clientY}px`;
      }
      if (drawingRef.current) onPaint();
    };

    const showCursorCircle = (ev: PointerEvent) => {
      // Only a hovering pointer (mouse/pen) gets the size-preview circle; a
      // touch would just park it under the finger.
      if (ev.pointerType === "touch") return;
      if (cursorCircleRef.current && toolSelection !== "bucket") {
        cursorCircleRef.current.style.opacity = "1";
      }
    };
    const hideCursorCircle = () => {
      if (cursorCircleRef.current) cursorCircleRef.current.style.opacity = "0";
    };

    const cursorEnd = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (tmp_canvas.hasPointerCapture(ev.pointerId)) {
        tmp_canvas.releasePointerCapture(ev.pointerId);
      }

      if (!tmp_ctx || !ctx) return;

      if (toolSelection === "eraser") {
        // Erasure was already committed live in onPaint; just clean up
        eraserSnapshotRef.current = null;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(tmp_canvas, 0, 0);
        tmp_ctx.clearRect(0, 0, tmp_canvas.width, tmp_canvas.height);
      }

      pptsRef.current = [];
      cursorRef.current = { x: 0, y: 0, w: markerWidth };
    };

    const onPaint = () => {
      if (!tmp_ctx || !ctx) return;
      pptsRef.current.push({
        x: cursorRef.current.x,
        y: cursorRef.current.y,
        w: cursorRef.current.w,
      });

      if (toolSelection === "eraser") {
        // Restore the pre-stroke snapshot then redraw the full accumulated path
        // with destination-out directly on ctx — live transparent erasure.
        if (eraserSnapshotRef.current) {
          ctx.putImageData(eraserSnapshotRef.current, 0, 0);
        }
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = markerWidth;
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        drawBezierPath(ctx, pptsRef.current);
        ctx.restore();
        return;
      }

      // Variable-width pen stroke: redraw the whole path with per-segment widths
      if (strokeVariableRef.current) {
        tmp_ctx.clearRect(0, 0, tmp_canvas.width, tmp_canvas.height);
        drawVariablePath(tmp_ctx, pptsRef.current);
        return;
      }

      // Fixed-width stroke: reassert lineWidth every frame so it doesn't inherit
      // the small per-segment value a preceding variable-width pen stroke left behind.
      tmp_ctx.lineWidth = markerWidth;

      if (pptsRef.current.length < 3) {
        const b = pptsRef.current[0];
        tmp_ctx.beginPath();
        tmp_ctx.arc(b.x, b.y, tmp_ctx.lineWidth / 2, 0, Math.PI * 2, true);
        tmp_ctx.fill();
        tmp_ctx.closePath();
        return;
      }

      tmp_ctx.clearRect(0, 0, tmp_canvas.width, tmp_canvas.height);
      drawBezierPath(tmp_ctx, pptsRef.current);
    };

    const handleResize = () => {
      if (!tmp_ctx || !ctx) return;
      tmp_ctx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.drawImage(tmp_canvas, 0, 0);
      tmp_ctx.clearRect(0, 0, tmp_canvas.width, tmp_canvas.height);
      tmp_canvas.width = canvas.width;
      tmp_canvas.height = canvas.height;
      tmp_ctx.lineWidth = markerWidth;
      tmp_ctx.strokeStyle = marker;
      tmp_ctx.fillStyle = marker;
      tmp_ctx.lineJoin = "round";
      tmp_ctx.lineCap = "round";
    };

    // Pointer Events unify mouse / touch / pen. Capture keeps pointermove
    // firing outside the canvas, so a single move listener replaces the old
    // add/remove-on-drag trick.
    window.addEventListener("resize", handleResize);
    tmp_canvas.addEventListener("pointerdown", cursorStart, false);
    tmp_canvas.addEventListener("pointermove", cursorMove, false);
    tmp_canvas.addEventListener("pointerup", cursorEnd, false);
    tmp_canvas.addEventListener("pointercancel", cursorEnd, false);
    tmp_canvas.addEventListener("pointerenter", showCursorCircle, false);
    tmp_canvas.addEventListener("pointerleave", hideCursorCircle, false);

    return () => {
      window.removeEventListener("resize", handleResize, false);
      tmp_canvas.removeEventListener("pointerdown", cursorStart, false);
      tmp_canvas.removeEventListener("pointermove", cursorMove, false);
      tmp_canvas.removeEventListener("pointerup", cursorEnd, false);
      tmp_canvas.removeEventListener("pointercancel", cursorEnd, false);
      tmp_canvas.removeEventListener("pointerenter", showCursorCircle, false);
      tmp_canvas.removeEventListener("pointerleave", hideCursorCircle, false);
    };
  }, [
    marker,
    markerWidth,
    fillTolerance,
    toolSelection,
    pressure,
    minWidthRatio,
    context,
    tmp_context,
  ]);

  // ─── Shared state object for renderControls ─────────────────────────────────

  const paintState: PaintState = {
    marker,
    setMarker,
    markerWidth,
    setMarkerWidth,
    toolSelection,
    setToolSelection,
    customColor,
    setCustomColor,
    fillTolerance,
    setFillTolerance,
    colors,
    clearCanvas,
    saveImage,
  };

  // ─── Built-in controls ───────────────────────────────────────────────────────

  // Active-colour outline disappears when eraser is selected (colour is irrelevant then)
  // const colorActive = toolSelection !== "eraser";
  const colorActive = true;
  // Custom picker is active when the current marker isn't one of the preset swatches
  const isCustomActive = colorActive && !colors.includes(marker);

  const builtInTopControls = (
    <div className={cx(classes.control, classNames.control)}>
      {/* Tool selector — independent of colour choice */}
      <div className={cx(classes.tools, classNames.tools)}>
        <button
          className={cx(classes.tool, classNames.brush)}
          style={{ borderColor: toolSelection === "brush" ? "#000" : "#CCC" }}
          onClick={() => setToolSelection("brush")}
          title="Brush"
        >
          <IconBrush size={20} />
        </button>
        <button
          className={cx(classes.tool, classNames.bucket)}
          style={{ borderColor: toolSelection === "bucket" ? "#000" : "#CCC" }}
          onClick={() => setToolSelection("bucket")}
          title="Fill"
        >
          <IconBucket size={20} />
        </button>
        <button
          className={cx(classes.tool, classNames.eraser)}
          style={{ borderColor: toolSelection === "eraser" ? "#000" : "#CCC" }}
          onClick={() => setToolSelection("eraser")}
          title="Eraser"
        >
          <IconEraser size={20} />
        </button>
      </div>

      {/* Dynamic slider: size for brush/eraser, tolerance for bucket */}
      <div className={cx(classes.brushSize, classNames.brushSize)}>
        {toolSelection === "bucket" ? (
          <>
            <input
              type="range"
              id="fillTolerance"
              name="fillTolerance"
              min="0"
              max="128"
              value={fillTolerance}
              step="1"
              onChange={(e) => setFillTolerance(Number(e.target.value))}
            />
            <label htmlFor="fillTolerance">
              {Math.round((fillTolerance / 255) * 100)}%
            </label>
          </>
        ) : (
          <>
            <input
              type="range"
              id="brushSize"
              name="brushSize"
              min="4"
              max="100"
              value={markerWidth}
              step="2"
              onChange={(e) => setMarkerWidth(Number(e.target.value))}
            />
            <label htmlFor="brushSize">{markerWidth}px</label>
          </>
        )}
      </div>

      {/* Colour palette */}
      <div className={cx(classes.colors, classNames.colors)}>
        {colors.map((color, i) => (
          <button
            key={i}
            className={cx(classes.clr, classNames.clr)}
            style={{
              borderColor: colorActive && marker === color ? "#000" : "#CCC",
              backgroundColor: color,
            }}
            onClick={() => setMarker(color)}
          />
        ))}

        <div className={cx(classes.customClr, classNames.customClr)}>
          <input
            ref={customColorInputRef}
            type="color"
            name="custClr"
            defaultValue={customColor}
            style={{ borderColor: isCustomActive ? "#000" : "#CCC" }}
            onChange={(e) => {
              setMarker(e.target.value);
              setCustomColor(e.target.value);
            }}
          />
          <IconPalette
            size={22}
            color={colorBrightness(customColor) === "dark" ? "white" : "black"}
          />
        </div>
      </div>
    </div>
  );

  const builtInBottomControls = (
    <div className={cx(classes.bottomControl, classNames.bottomControl)}>
      <button
        className={cx(
          classes.btn,
          classes.btnClear,
          classNames.btn,
          classNames.btnClear,
        )}
        onClick={clearCanvas}
      >
        clear
      </button>
      <button
        className={cx(
          classes.btn,
          classes.btnSave,
          classNames.btn,
          classNames.btnSave,
        )}
        onClick={saveImage}
      >
        save
      </button>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  const showBuiltInControls = controls && !renderControls;

  return (
    <>
      {renderControls
        ? renderControls(paintState)
        : showBuiltInControls && builtInTopControls}

      <canvas className={classes.canvas} ref={canvas_ref} />
      <canvas
        className={classes.canvas}
        ref={tmp_canvas_ref}
        style={{ cursor: toolSelection === "bucket" ? "crosshair" : "none" }}
      />
      {/* Brush/eraser size preview — position updated via DOM, no re-renders */}
      <div
        ref={cursorCircleRef}
        className={classes.cursorCircle}
        style={{ width: markerWidth, height: markerWidth }}
      />

      {showBuiltInControls && builtInBottomControls}
    </>
  );
});

export default Paint;
