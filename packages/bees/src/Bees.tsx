"use client";

/**
 * Bees.tsx — Honeybee + honeycomb canvas simulation (React + Canvas 2D)
 *
 * Author: Leon Anderson
 * Version: 1.0.1
 * Last updated: 2025‑08‑23 (Australia/Sydney)
 *
 * Overview:
 *   Full‑page visual of animated bees interacting with a procedurally generated
 *   pointy‑top hex grid (the “honeycomb”). Features include ground walking,
 *   takeoff/flight/landing, hovering in place, proximity avoidance with spatial
 *   hashing, footprints (“sticky feet”) with decay, user‑spawned clusters, and
 *   click‑to‑scare behavior.
 *
 * Public API (default export): <Bees /> (memoized, forwardRef)
 *   Props (optional):
 *     - playAnimation: boolean        // start/stop visuals (fade‑out when false)
 *     - pause: boolean                // pause the animation loop (pixels remain)
 *     - fps: number                   // target frames per second (fixed‑step)
 *     - beeSize: number               // nominal bee body size in px
 *     - beeDensityRatio: number       // each bee claims ~ratio * size^2 pixels
 *     - targetHoneycombCoverage: number // 0..1 fraction of grid active
 *     - idleDelaySec: number          // seconds of inactivity before auto‑start
 *     - clusterRampStartSec: number   // seconds before auto clusters begin
 *     - clusterRampStepSec: number    // cadence to allow more clusters
 *
 * Imperative API (via ref): BeesHandle
 *   - play(): void     // schedule start after idleDelaySec (respects idle)
 *   - playImmediate(): void // start immediately (ignore idleDelaySec)
 *   - pause(): void    // stop RAF, leave pixels for fade
 *   - stop(): void     // start fade‑out; clear on transition end
 *   - isRunning(): boolean // whether RAF is active
 *
 * Rendering & performance:
 *   - HiDPI: backing store sized from CSS size * devicePixelRatio; context is
 *     scaled via setTransform so drawing uses CSS pixels with crisp output.
 *   - Fixed‑step loop: timer accumulates delta and advances in steps of 1000/fps.
 *   - Spatial hash for proximity on the same z‑layer trims O(N^2) scans to ~O(N).
 *   - Hex geometry uses a unit Path2D scaled per cell; stroke width set in unit space.
 *
 * React notes:
 *   - StrictMode: internal first‑run guard avoids double start in dev.
 *   - Memoized component to prevent parent re‑renders from janking the canvas.
 *   - Global pointerdown is used so the canvas can keep pointer‑events: none.
 *
 * License: TODO (MIT/Proprietary). Add a LICENSE file and update this header.
 *
 * @module Bees
 */

//https://eperezcosano.github.io/hex-grid/

import {
  JSX,
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { createPortal } from "react-dom";
import { createNoise2D } from "simplex-noise";
import cx from "clsx";
import classes from "./Bees.module.css";

const noise2D = createNoise2D();

const DEV_DEBUG = false;

// --- Tunables (grouped constants for readability) ---
const PROX = {
  THRESH_MULT: 1.5, // beeSize * THRESH_MULT
  LAYER_SCALE_GROUND: 1.0,
  LAYER_SCALE_AIR: 0.8,
} as const;

const TRAILS = {
  MAX: 5000, // hard safety cap on footprints
  STICKY_SECONDS: 4, // sticky feet lifetime after stepping on dust
  MOVING_CADENCE: 6, // frames between prints while moving
  STATIONARY_DECAY: 0.5, // slower sticky decay per frame when not moving
  FADE_SECONDS: 20, // footprint lifetime (fade out)
} as const;

const WINGS = {
  FLAP_HZ: {
    // base flap frequency by state
    FLUTTER: 1.6,
    FLY: 3.6,
    TAKEOFF_LAND: 2.6,
  },
  DUTY: 0.35, // downstroke duty cycle
  FORE_RANGE: { MIN: 0.2, MAX: 1.5 },
  HIND_RANGE: { MIN: 0.2, MAX: 0.95 },
  LAG: 0.05, // hind wing phase lag (0..1) ~5% of cycle
} as const;

const LEGS = {
  FEMUR_LEN: 4, // in units of `scale`
  TIBIA_LEN: 4,
  GAIT_SPEED: 0.8, // radians per frame for gait phase
} as const;

const CLICK = {
  SCARE_RADIUS_MIN: 120, //pixel radius from click to bee
  SCARE_RADIUS_BEE_MULT: 4, //30 size bee x 4 = 120
  FLEE_MIN: 300, // pixel min flee distance
  FLEE_VAR: 300, // pixel multiplyer by random 0->1 -- 0 -> 300
  TAKEOFF_MIN_FRAMES: 1,
  TAKEOFF_VAR_FRAMES: 5,
} as const;

const SHAKE = {
  THRESHOLD_VELOCITY: 2000, // px/sec
  REQUIRED_SHAKES: 5,
  MAX_SHAKE_INTERVAL: 1000, // ms
} as const;

const HEX = { BORDER_LINE_WIDTH_UNIT: 0.05 } as const;

const CLUSTERS = {
  SAFETY_CAP: 12,
  DEFAULT_AVG_CELLS: 180,
} as const;

const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Imperative controller for the Bees component.
 * Obtained via `const ref = useRef<BeesHandle>(null); <Bees ref={ref} />`.
 * Use when you want to control animation without causing a React re‑render.
 *
 * Methods:
 *   - play(): Start/resume animation after the configured idle delay (respects idleDelaySec).
 *   - playImmediate(): Start/resume animation immediately (ignores idleDelaySec and mounts now).
 *   - pause(): Pause animation frames (keeps current pixels so fade can occur separately).
 *   - stop(): Begin fade-out and stop animation when fade completes.
 *   - isRunning(): boolean — Current running status (RAF active).
 */
export type BeesHandle = {
  /** Start/resume animation after the configured idle delay (respects idleDelaySec). */
  play(): void;
  /** Start/resume animation immediately (ignores idleDelaySec and mounts now). */
  playImmediate(): void;
  /** Pause animation frames (keeps current pixels so fade can occur separately). */
  pause(): void;
  /** Begin fade-out and stop animation when fade completes. */
  stop(): void;
  /** Current running status (RAF active). */
  isRunning(): boolean;
};

/**
 * Props accepted by the memoized, forwardRef‑enabled Bees component.
 * All props are optional; sensible defaults are applied.
 */
export type BeesProps = Readonly<{
  playAnimation?: boolean;
  pause?: boolean;
  beeSize?: number;
  fps?: number;
  beeDensityRatio?: number;
  targetHoneycombCoverage?: number;
  idleDelaySec?: number;
  clusterRampStartSec?: number;
  clusterRampStepSec?: number;
  zIndex?: number;
}>;

/**
 * Bees canvas effect (top-level React component).
 *
 * Renders an animated honeybee + honeycomb simulation on a full-page canvas.
 *
 * @component
 * @example
 * return (
 *   <Bees fps={30} idleDelaySec={30} />
 * )
 *
 * @param {object} props
 * @param {boolean} [props.playAnimation=true]        - Start animation activated (fades out when later set to false).
 * @param {boolean} [props.pause=false]               - Pause animation frames; keeps current pixels on screen.
 * @param {number}  [props.fps=30]                    - Target frames per second (fixed‑step loop).
 * @param {number}  [props.beeSize=30]                - Nominal body size for bee geometry (px).
 * @param {number}  [props.beeDensityRatio=50]        - Density control; each bee “claims” ~ratio*size^2 pixels.
 * @param {number}  [props.targetHoneycombCoverage=0.33] - Active cluster coverage cap (0..1 of grid).
 * @param {number}  [props.idleDelaySec=60]           - Seconds of inactivity before auto‑activate.
 * @param {number}  [props.clusterRampStartSec=20]    - Seconds before clusters begin auto-spawning.
 * @param {number}  [props.clusterRampStepSec=30]     - Seconds per additional cluster slot.
 * @returns {JSX.Element} The rendered Bee game element.
 */

const Bees = forwardRef<BeesHandle, BeesProps>(function Bees(
  {
    playAnimation = true,
    pause = false,
    fps = 30,
    beeSize = 30,
    beeDensityRatio = 50, // higher = fewer bees; each bee claims ~beeDensityRatio * beeSize^2 pixels
    targetHoneycombCoverage = 0.33, // percentage of grid to be covered by clusters
    idleDelaySec = 60, //s
    clusterRampStartSec = 20,
    clusterRampStepSec = 30,
    zIndex = 1, // 👈 default “neutral”
  }: BeesProps,
  ref
): JSX.Element {
  // Create all references
  const portalHostRef = useRef<HTMLDivElement | null>(null);
  const beeCanvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const hiveRef = useRef<Hive | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set states for application
  const [portalReady, setPortalReady] = useState(false);
  const [isRunning, setIsRunning] = useState<boolean>(false); // Animation is runing, frames are ticking over
  const [isFadingOut, setIsFadingOut] = useState<boolean>(true); // Fadeout is running or opacity is 0 state
  const [isCanvasActiveInDom, setIsCanvasActiveInDom] =
    useState<boolean>(false); // Canvas is active and on screen, animation is set to start
  const [firstRunComplete, setFirstRunComplete] = useState<boolean>(false); // Marked when first run is done, can help in animation logic for autorun trigger

  // Local control flags (imperative API). These mirror props but can be overridden via ref methods
  const [playFlag, setPlayFlag] = useState<boolean>(playAnimation);
  const [pausedFlag, setPausedFlag] = useState<boolean>(pause);

  // Keep local flags in sync if parent props change
  useEffect(() => setPlayFlag(playAnimation), [playAnimation]);
  useEffect(() => setPausedFlag(pause), [pause]);

  // Expose imperative API for parent control
  useImperativeHandle(
    ref,
    () => ({
      play() {
        // Respect idleDelaySec: schedule activation after inactivity period
        setPlayFlag(true);
        setPausedFlag(false);

        // Reset any existing idle timer, then schedule a new one
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = setTimeout(() => {
          setIsCanvasActiveInDom(true);
          setIsFadingOut(false);
        }, idleDelaySec * 1000);
      },
      playImmediate() {
        // Mount & show immediately, ignoring idleDelaySec
        setPlayFlag(true);
        setPausedFlag(false);
        setIsCanvasActiveInDom(true);
        setIsFadingOut(false);
      },
      pause() {
        setPausedFlag(true);
      },
      stop() {
        // Request fade out; actual stop happens on transition end
        setPlayFlag(false);
        setIsFadingOut(true);
      },
      isRunning() {
        return isRunning;
      },
    }),
    [idleDelaySec, isRunning]
  );

  // Start the animation cycle
  const startAnimation = useCallback(() => {
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Animation variables
    let lastTime = 0;
    // divide 1000 as ms is base time in JS/TS
    const nextFrame = 1000 / fps;
    let timer = 0;

    // HiDPI support: get devicePixelRatio and logical canvas size
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const logicalWidth = Math.floor(canvas.clientWidth);
    const logicalHeight = Math.floor(canvas.clientHeight);

    if (!hiveRef.current) {
      hiveRef.current = new Hive({
        canvasWidth: logicalWidth,
        canvasHeight: logicalHeight,
        fps,
        beeSize,
        beeDensityRatio,
        targetHoneycombCoverage,
        clusterRampStartSec,
        clusterRampStepSec,
      });
    }

    // Map logical CSS pixels to device pixels for HiDPI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /**
     * This function gets called each animation frame from JS engine
     *
     * @param {number} timeStamp Input timestamp
     * @returns {void}
     */
    function animate(timeStamp: number): void {
      // Verify context, canvas and effect.current
      if (!ctx || !canvas || !hiveRef.current) return;

      // Set last time to current time
      if (!lastTime) lastTime = timeStamp;
      // Get the difference between last time and current time stamp
      let deltaTime = timeStamp - lastTime;
      lastTime = timeStamp;

      // prevent huge catch-ups if tab was backgrounded
      if (deltaTime > 100) deltaTime = 100;

      // incease the timer by the delta
      timer += deltaTime;

      // fixed-step update/draw at target fps
      while (timer >= nextFrame) {
        hiveRef.current.draw(ctx);
        timer -= nextFrame;
      }

      // set the current request frame to the animation ref so it can be used outside this callback
      animationRef.current = requestAnimationFrame(animate);
    }

    // Start the animation
    animate(0);
    setIsRunning(true);

    //Provide the animation options to the callback
  }, [
    fps,
    beeSize,
    beeDensityRatio,
    targetHoneycombCoverage,
    clusterRampStartSec,
    clusterRampStepSec,
  ]);

  // Stop animation does what it says
  const cancelAnimationRefAndRunning = () => {
    // If we have an animation ref
    if (animationRef.current !== null) {
      // cancell the animation frame
      cancelAnimationFrame(animationRef.current);
      // remove the animation ref
      animationRef.current = null;
      // set running to false
      setIsRunning(false);
    }
  };

  // Clear the canvas of all animation drawings
  const clearCanvasRectAndRef = () => {
    // Validate the canvas ref and 2d context
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Clear the hive object
    if (hiveRef.current) {
      hiveRef.current = null;
    }
  };

  // Manual close button
  const handleCloseClick = () => {
    setIsFadingOut(true);
  };

  // Manage fading out the canvas and clearing the animation
  const handleFadeOutEnd = () => {
    if (isFadingOut) {
      cancelAnimationRefAndRunning();
      clearCanvasRectAndRef();
      setIsCanvasActiveInDom(false);
    }
  };

  // Set timer to wait for inactivity and activate
  useEffect(() => {
    if (isCanvasActiveInDom) {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      return;
    }

    // Callback for idleTimeoutRef setTimeout
    const handleIdleTimeout = () => {
      setIsCanvasActiveInDom(true);
      setIsFadingOut(false);
    };

    // Reset function on interaction
    const resetTimer = () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(
        handleIdleTimeout,
        idleDelaySec * 1000
      );
    };

    // Remove all event listeners and timers
    const cleanUp = () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      window.removeEventListener("scroll", resetTimer);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };

    // If idle is 0 then we never restart
    if (idleDelaySec === 0 || playFlag === false) {
      cleanUp();
      return;
    }

    // Start the timer
    idleTimeoutRef.current = setTimeout(handleIdleTimeout, idleDelaySec * 1000);

    // Listen for user activity
    window.addEventListener("scroll", resetTimer, { passive: true });
    window.addEventListener("click", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    window.addEventListener("keydown", resetTimer);

    // Cleanup
    return cleanUp;
  }, [isCanvasActiveInDom, idleDelaySec, playFlag]);

  // Effect to handle the canvas size and resizing window
  useEffect(() => {
    // Validate the canvas ref and
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;

    const setSize = () => {
      // Set the canvas to fit the entire window
      const body = document.body;
      const html = document.documentElement;

      const height = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
        window.innerHeight
      );
      // NOTE:
      // Chrome (especially on Windows) can report a layout width that is
      // fractionally wider than the actual paintable area due to scrollbar
      // width + sub‑pixel rounding (DPR, zoom, overlay scrollbars).
      // This can cause a persistent 1px horizontal overflow and scrollbar.
      // Subtracting 1px here is an intentional, defensive fix to guarantee
      // the canvas never overshoots the layout width.
      const width = document.documentElement.clientWidth - 1;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      // Backing store size in device pixels
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      // CSS size in logical pixels
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const beeCanvasContainer = beeCanvasContainerRef.current;
      if (beeCanvasContainer) {
        beeCanvasContainer.style.width = `${width}px`;
        beeCanvasContainer.style.height = `${height}px`;
      }
    };

    // Set the canvas to fit the entire window
    setSize();

    // Function to handle window resize
    const handleResize = () => {
      // Validate the canvas ref and the effect ref
      if (canvasRef.current === null || hiveRef.current === null) return;

      // Set the canvas to fit the entire window
      setSize();

      const canvas = canvasRef.current;

      // Set HiDPI on resize
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Update the Effect object with the resize method
      hiveRef.current.resize(canvas.clientWidth, canvas.clientHeight);
    };

    // Add the handler to the resize event
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      // remove the event listner
      window.removeEventListener("resize", handleResize);
    };
    // Make the animation restart on any of the following changes
  }, [isCanvasActiveInDom]);

  // Effect to handle clicking on the canvas,
  // Due to css pointer-events: none; must transpose window clicks
  // to the canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const handleGlobalClick = (e: MouseEvent) => {
      // Don't interfere with selections: if text is selected, skip
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;

      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();

      // Tarnspose pointerdown to position on canvas
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Only react if the pointerdown is within the canvas bounds
      if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
        // DO NOT call preventDefault — let the page keep the pointerdown
        hiveRef.current?.handleClick(x, y);
      }
    };

    // Capture phase so we see the event without blocking the target
    window.addEventListener("pointerdown", handleGlobalClick, {
      capture: true,
    });

    // Clean up
    return () => {
      window.removeEventListener("pointerdown", handleGlobalClick, {
        capture: true,
      } as any);
    };
  }, [isCanvasActiveInDom]);

  // Setup references for shake feature
  const lastScrollY = useRef<number>(0);
  const lastTime = useRef(Date.now());
  const history = useRef<number[]>([]);
  const shakeCount = useRef(0);
  const lastDirection = useRef(0);

  // Effect to handle "page shake" by way of scroll window
  useEffect(() => {
    // Page shake check function
    const pageShake = () => {
      // Get position and time
      const now = Date.now();
      const newY = window.scrollY;
      const deltaY = newY - lastScrollY.current;
      const deltaTime = now - lastTime.current;

      // Time is the same, exit
      if (deltaTime === 0) return;

      // Get veolicity and direction of page move
      const velocity = Math.abs((deltaY / deltaTime) * 1000);
      const direction = Math.sign(deltaY);

      // If velocity is over threshold then add the shake to the counter
      if (velocity > SHAKE.THRESHOLD_VELOCITY) {
        // Check direction change
        if (direction !== 0 && direction !== lastDirection.current) {
          // Add counter, last direction and history
          shakeCount.current++;
          lastDirection.current = direction;
          history.current.push(now);

          // Remove old entries
          history.current = history.current.filter(
            (t) => now - t < SHAKE.MAX_SHAKE_INTERVAL
          );

          // If we meet the required shakes then fade out
          // clean up
          if (history.current.length >= SHAKE.REQUIRED_SHAKES) {
            setIsFadingOut(true);
            history.current = [];
          }
        }
      }

      // Set new Y and Time to current
      lastScrollY.current = newY;
      lastTime.current = now;
    };

    // Add the page shake event handler
    window.addEventListener("scroll", pageShake, { passive: true });

    // Cleanup
    return () => {
      // remove the event listner
      window.removeEventListener("scroll", pageShake);
    };
  }, []);

  // React to playFlag toggles. Do **not** auto-mount on true; let idle timer or imperative play() mount.
  useEffect(() => {
    if (playFlag === false) {
      // When disabled, request fade-out; actual stop occurs on transition end
      setIsFadingOut(true);
    }
    // When playFlag becomes true we intentionally do nothing here.
    // If the canvas is not mounted, the idle-delay effect (or BeesHandle.play()) will activate it.
  }, [playFlag]);

  // Central run/pause controller. Respects pause even if playFlag=true and avoids double-start in StrictMode.
  useEffect(() => {
    const shouldRun = isCanvasActiveInDom && playFlag && !pausedFlag;

    if (shouldRun && !isRunning) {
      // Guard against double invoke on mount in StrictMode (first pass only)
      if (!firstRunComplete) {
        startAnimation();
        setFirstRunComplete(true);
      } else {
        startAnimation();
      }
    } else if (!shouldRun && isRunning) {
      // Stop ticking but leave pixels intact for fade-out; clear occurs on transition end
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setIsRunning(false);
    }

    // No cleanup here; we do unmount cleanup below
  }, [isCanvasActiveInDom, playFlag, pausedFlag, isRunning, firstRunComplete, startAnimation]);

  // Unmount-only cleanup (prevents instant disappear on prop changes)
  useEffect(() => {
    return () => {
      cancelAnimationRefAndRunning();
      clearCanvasRectAndRef();
    };
  }, []);

  useEffect(() => {
    // Only run client-side (you already have "use client")
    const host = document.createElement("div");
    host.setAttribute("data-mdcrty", "bees-host");

    // This host should not affect layout at all
    host.style.position = "absolute";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.pointerEvents = "none";

    document.body.prepend(host);
    portalHostRef.current = host;
    setPortalReady(true);

    return () => {
      portalHostRef.current = null;
      host.remove();
    };
  }, []);

  const overlay = (
    <div
      className={classes.beeCanvasContainer}
      style={{ zIndex }}
      ref={beeCanvasContainerRef}
    >
      <div
        className={cx(
          classes.fadeWrapper,
          isFadingOut ? classes.opacity0 : classes.opacity1
        )}
        onTransitionEnd={handleFadeOutEnd}
      >
        {isCanvasActiveInDom && (
          <>
            <canvas
              className={classes.beeCanvas}
              ref={canvasRef}
              style={
                DEV_DEBUG ? { backgroundColor: "rgb(50 10 200 / 15%)" } : {}
              }
            />
            <HexCloseButton
              className={classes.closeButton}
              onClick={handleCloseClick}
              style={{ zIndex: zIndex + 1 }}
            />
          </>
        )}
      </div>
    </div>
  );

  if (!portalReady || !portalHostRef.current) return <></>;

  return createPortal(overlay, portalHostRef.current);
});

export default memo(Bees);

/**
 * A standalone React component that renders a hexagon-shaped close button.
 * The hexagon has a flat top and bottom, transparent fill, and a subtle grey stroke with an “×” in the middle.
 * On hover, it shows a translucent red fill and red “×”.
 *
 * No external CSS or libraries are required; all styles are embedded in the component.
 *
 * @component
 * @example
 * return (
 *   <HexCloseButton onClick={() => console.log('Closed')} />
 * )
 *
 * @param {object} props - The component props.
 * @param {number} [props.size=48] - The width and height of the button in pixels.
 * @param {function} [props.onClick] - Callback function to handle click events.
 * @param {string} [props.title="Close"] - Accessible label for the button.
 * @param {string} [props.className] - Optional additional classes for the root <button>.
 * @param {('default'|'dark'|'disabled'|'solid')} [props.variant='default'] - Visual style variant of the button.
 * @returns {JSX.Element} The rendered hexagon close button.
 */
export function HexCloseButton({
  size = 36,
  onClick,
  title = "Close",
  className = "",
  variant = "default",
  style = {},
}: {
  size?: number;
  onClick?: () => void;
  title?: string;
  className?: string;
  variant?: "default" | "dark" | "disabled" | "solid";
  style?: React.CSSProperties;
}): JSX.Element {
  const isDisabled = variant === "disabled";

  return (
    <button
      type="button"
      aria-label={title}
      onClick={!isDisabled ? onClick : undefined}
      disabled={isDisabled}
      className={`hexclose ${className}`}
      data-variant={variant}
      style={{ width: size, height: size, ...style }}
    >
      {/* Embedded, scoped styles — no external CSS or libraries */}
      <style>{`
        .hexclose {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          cursor: pointer;
          border-radius: 12px; /* focus ring aesthetics */
          outline: none;
        }
        .hexclose:focus-visible {
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.4); /* red-500/40 */
        }
        .hexclose[disabled] { cursor: not-allowed; opacity: 0.6; }

        /* SVG sizing & transition */
        .hexclose svg { display: block; transition: color 200ms ease, fill 200ms ease, stroke 200ms ease; }

        /* Base colors (default variant) */
        .hexclose[data-variant="default"] .hex-path { fill: transparent; stroke: #9CA3AF; /* gray-400 */ }
        .hexclose[data-variant="default"] .hex-x { stroke: #6B7280; /* gray-500 */ }
        .hexclose[data-variant="default"]:hover .hex-path { stroke: #DC2626; fill: rgba(239, 68, 68, 0.15); /* red-500/15 */ }
        .hexclose[data-variant="default"]:hover .hex-x { stroke: #DC2626; /* red-600 */ }

        /* Dark variant */
        .hexclose[data-variant="dark"] .hex-path { fill: transparent; stroke: #D1D5DB; /* gray-300 */ }
        .hexclose[data-variant="dark"] .hex-x { stroke: #D1D5DB; }
        .hexclose[data-variant="dark"]:hover .hex-path { fill: rgba(248, 113, 113, 0.20); /* red-400/20 */ }
        .hexclose[data-variant="dark"]:hover .hex-x { stroke: #EF4444; /* red-500 */ }

        /* Disabled variant */
        .hexclose[data-variant="disabled"] .hex-path { fill: #E5E7EB; stroke: #D1D5DB; }
        .hexclose[data-variant="disabled"] .hex-x { stroke: #9CA3AF; }

        /* Solid variant */
        .hexclose[data-variant="solid"] .hex-path { fill: #6B7280; stroke: #FFFFFF; }
        .hexclose[data-variant="solid"] .hex-x { stroke: #FFFFFF; }
        .hexclose[data-variant="solid"]:hover .hex-path { fill: #EF4444; }

        /* Reduce motion preference */
        @media (prefers-reduced-motion: reduce) {
          .hexclose svg { transition: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-hidden
      >
        <title>{title}</title>
        {/* Hexagon outline */}
        <path
          d="M26.5 9.315 L73.5 9.315 L97 50 L73.5 90.685 L26.5 90.685 L3 50 Z"
          className="hex-path"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
        />
        {/* “X” glyph */}
        <g
          className="hex-x"
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <line x1="35" y1="35" x2="65" y2="65" />
          <line x1="65" y1="35" x2="35" y2="65" />
        </g>
      </svg>
    </button>
  );
}

/** Simulation core: manages grid, clusters, bees and frame lifecycle. */
class Hive {
  // Canvas
  canvasWidth: number;
  canvasHeight: number;

  // Timing
  fps: number;
  frameCounter: number;
  lastClusterSpawnFrame: number;
  clusterRampStartSec: number;
  clusterRampStepSec: number;

  // The Grid
  honeyCombGrid: HoneycombMap;
  honeyCombSize: number;

  // Honeycomb
  targetHoneycombCoverage: number;
  honeyCombClusters: Array<HoneycombCluster>;

  //Bees
  bees: Array<Bee> = [];
  beeSize: number;
  beeDensityRatio: number;
  numberOfBees: number = 0;
  proximityThreshold: number;

  // Bee Trails
  trails: Array<{
    x: number;
    y: number;
    theta: number;
    kind: "pollen" | "honey";
    age: number;
    maxAge: number;
    side: -1 | 1;
    scale: number;
  }>;

  /**
   * Generate a new Hive object
   *
   * @param {object} props
   * @param {number} [props.canvasWidth] - Width of the canvas in pixels
   * @param {number} [props.canvasHeight] - Height of the canvas in pixels
   * @param {number} [props.fps=30] - Frames per second for the animation
   * @param {number} [props.beeSize=30] - Size of the bees in pixels
   * @param {number} [props.beeDensityRatio=50] - Density ratio for bees (higher = fewer bees)
   * @param {number} [props.targetHoneycombCoverage=0.33] - Target coverage of honeycomb cells by clusters (0..1)
   * @param {number} [props.clusterRampStartSec=20] - Seconds before clusters start auto-spawning
   * @param {number} [props.clusterRampStepSec=30] - Seconds per additional cluster slot
   */
  constructor({
    canvasWidth,
    canvasHeight,
    fps = 30,
    beeSize = 30,
    beeDensityRatio = 50,
    targetHoneycombCoverage = 0.33,
    clusterRampStartSec = 20,
    clusterRampStepSec = 30,
  }: {
    canvasWidth: number;
    canvasHeight: number;
    fps: number;
    beeSize: number;
    beeDensityRatio?: number;
    targetHoneycombCoverage: number;
    clusterRampStartSec: number;
    clusterRampStepSec: number;
  }) {
    // Canvas
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Honeycomb
    this.targetHoneycombCoverage = targetHoneycombCoverage;
    this.honeyCombSize = beeSize / 2; //15 for 30 bee
    this.honeyCombGrid = new HoneycombMap();
    this.honeyCombClusters = [];

    // Bees
    this.beeSize = beeSize;
    this.beeDensityRatio = beeDensityRatio;
    this.proximityThreshold = beeSize * PROX.THRESH_MULT;

    // Bee Trails
    this.trails = [];

    // Timing
    this.fps = fps;
    this.frameCounter = 0;
    this.lastClusterSpawnFrame = -Infinity;
    this.clusterRampStartSec = clusterRampStartSec;
    this.clusterRampStepSec = clusterRampStepSec;

    // Start
    this.#initialiser();
  }

  /**
   * Build initial state for the simulation: bees, grid, and derived counts.
   *
   * Computes the number of bees from canvas area and density, instantiates
   * them with staggered off‑screen positions, and populates the honeycomb grid.
   *
   * @private
   */
  #initialiser() {
    // Each bee "claims" ~beeDensityRatio * beeSize^2 pixels of canvas area.
    // Higher beeDensityRatio => fewer bees; lower => more bees.
    const canvasArea = this.canvasWidth * this.canvasHeight;
    const perBeeArea = Math.max(
      1,
      this.beeDensityRatio * this.beeSize * this.beeSize
    );
    const estimated = Math.floor(canvasArea / perBeeArea);
    // Clamp to sensible bounds so tiny screens/huge bees don't hit 0 or explode
    this.numberOfBees = Math.max(1, Math.min(estimated, 500));
    this.bees = [];
    for (let i = 0; i < this.numberOfBees; i++) {
      this.bees.push(new Bee(-30 * i, -30, this.beeSize));
    }
    this.#initialiseGrid();
  }

  /**
   * Populates the axial hex grid sized to the canvas with inactive cells.
   * Spares off‑screen rows/cols and stores cells in `this.honeyCombGrid`.
   *
   * @private
   */
  #initialiseGrid() {
    const hexSize = this.honeyCombSize;
    const hexWidth = hexSize * 2;
    const hexHeight = Math.sqrt(3) * hexSize;
    // GRID SIZE
    const cols = Math.ceil(this.canvasWidth / (hexWidth * 0.75)) + 10;
    const rows = Math.ceil(this.canvasHeight / hexHeight) + 10;

    // CREATE GRID
    for (let q = -rows; q < rows; q++) {
      for (let r = -cols; r < cols; r++) {
        const y = hexHeight * (q + r / 2);
        const x = hexWidth * 0.75 * r;

        if (x + hexWidth < 0 || x > this.canvasWidth) continue;
        if (y < 0 || y - hexHeight > this.canvasHeight) continue;

        // Create random cells for testing purposes
        // const randomCellType = this.#getRandomEnumValue(cellType);
        // Get a random cell type from cellType enum

        // const tempComb = new Honeycomb(
        //   q,
        //   r,
        //   x,
        //   y,
        //   this.honeyCombSize,
        //   1,
        //   cellType.pollen
        // );
        // tempComb.active = true;
        // this.honeyCombGrid.push(tempComb);

        this.honeyCombGrid.setHC(new Honeycomb(q, r, x, y, this.honeyCombSize));
      }
    }
  }

  /**
   * Picks a random value from an enum (string or numeric).
   *
   * @private
   * @template T
   * @param {T} enumObj - Enum object to sample from.
   * @returns {T[keyof T]} One of the enum's values chosen uniformly at random.
   */
  #getRandomEnumValue<T extends object>(enumObj: T): T[keyof T] {
    const values = Object.values(enumObj) as T[keyof T][];
    const randomIndex = Math.floor(Math.random() * values.length);
    return values[randomIndex];
  }

  /**
   * Main per-frame draw/update tick.
   * Clears the canvas, advances clusters, draws grid & trails, updates each bee,
   * resolves proximity, and renders bees sorted by flight layer.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.frameCounter++;
    // Decrement per-bee min dwell frames and cooldown each frame
    for (const bee of this.bees) {
      if (bee.minStateFrames > 0) bee.minStateFrames--;
      if (bee.proximityCooldown > 0) bee.proximityCooldown--;
    }
    if (DEV_DEBUG) this.#devStats(ctx);

    // Time-driven cluster activation (sequential, capped)
    this.#spawnOneClusterIfAllowed();

    this.honeyCombClusters.forEach((cluster) => {
      if (cluster.active) {
        cluster.updateCellLifecycle();
      } else {
        cluster.tickCooldown();
      }
    });
    this.honeyCombGrid.forEach((honeycomb) => honeycomb.draw(ctx));

    // Trails under bees
    this.#drawAndCullTrails(ctx);

    // Cache active sets once per frame to avoid rebuilding per bee
    const activeHoneyCells = this.#getActiveHoneyCells();

    // Draw bees (also updates their positions)
    this.bees.sort((a, b) => a.z - b.z).forEach((beeA) => beeA.draw(ctx));

    // After bees have moved this frame, add any new footprints for next frame
    this.#addFootprintsForBees();

    // --- Update pass: assign/refresh targets & bounds ---
    for (let i = 0; i < this.bees.length; i++) {
      const beeA = this.bees[i];

      // Assign a target if none, or force retarget if bee decides
      if (!beeA.hasTarget() || beeA.shouldRetarget()) {
        const picked = this.#pickTargetForBee(beeA, activeHoneyCells);
        if (picked)
          beeA.setTarget(picked.x, picked.y, `${picked.q},${picked.r}`);
      }

      this.#considerTakeoffToDistantTarget(beeA);

      // Walked off the page?
      if (this.#isOutOfBounds(beeA)) {
        this.#resetBeeLocation(beeA);
        this.#resetBeeInitialDirection(beeA);
        const picked = this.#pickTargetForBee(beeA, activeHoneyCells);
        if (picked)
          beeA.setTarget(picked.x, picked.y, `${picked.q},${picked.r}`);
      }

      // Prefer being on the ground when over an active cluster area (outside collisions)
      if (Math.round(Math.min(2, Math.max(0, beeA.z))) > 0) {
        if (this.#isOverActiveCluster(beeA.x, beeA.y)) {
          if (
            beeA.minStateFrames <= 0 &&
            beeA.animation !== animationType.land &&
            beeA.animation !== animationType.takeoff &&
            beeA.animation !== animationType.hover
          ) {
            beeA.enterState(
              animationType.land,
              Math.floor(25 + Math.random() * 35)
            );
            beeA.proximityCooldown = Math.floor(this.fps * 0.5);
            beeA.minStateFrames = 10;
          }
        }
      }
    }

    // --- Proximity handling (collision/hover/blocked) ---

    /*
     * Proximity resolution overview (performance-friendly):
     * 1) Build a simple spatial hash ("bins") keyed by (binX, binY, z-layer).
     *    Each bin collects indices of bees whose positions fall inside it.
     * 2) For each bee, compare only against bees from its own bin and the 8
     *    neighbouring bins on the SAME z-layer. This trims the naive O(N^2)
     *    pairwise checks to roughly O(N) on average.
     * 3) If two bees are within the threshold and beeA is facing beeB:
     *      - In air: prefer LAND (stronger if over a cluster) else short HOVER.
     *                Apply a short proximityCooldown and minStateFrames to avoid
     *                state thrashing while descending.
     *      - On ground: set BLOCKED (turn-in-place handled by Bee logic).
     */
    const BIN = this.proximityThreshold;
    // Map bin-key -> array of indices into this.bees (avoids storing objects per frame)
    const bins = new Map<string, number[]>(); // key -> indices into this.bees

    // Populate bins for this frame (single pass over bees)
    for (let i = 0; i < this.bees.length; i++) {
      const b = this.bees[i];
      // Get layer
      const layer = Math.round(Math.min(2, Math.max(0, b.z)));
      // Get bee location key
      const key = this.#keyForBin(b.x, b.y, layer);

      // Upsert the bin: create an array if missing, then push index
      const existing = bins.get(key);
      if (existing) {
        existing.push(i);
      } else {
        bins.set(key, [i]);
      }
    }

    // 8-neighbourhood around the current bin (plus the bin itself at [0,0])
    const neighbourOffsets = NEIGHBOUR_OFFSETS;

    // For each bee, inspect candidates from its bin plus neighbours (same z-layer)
    for (let i = 0; i < this.bees.length; i++) {
      const beeA = this.bees[i];

      // Skip if still within dwell/cooldown windows or already turning this frame
      if (beeA.minStateFrames > 0) continue;
      if (beeA.proximityCooldown > 0) continue;
      if (beeA.animation === animationType.turn) continue; // let it finish

      const layerA = Math.round(Math.min(2, Math.max(0, beeA.z)));
      const cx = Math.floor(beeA.x / BIN);
      const cy = Math.floor(beeA.y / BIN);
      const layerScale =
        layerA === 0 ? PROX.LAYER_SCALE_GROUND : PROX.LAYER_SCALE_AIR;

      let handled = false;

      for (const [dx, dy] of neighbourOffsets) {
        if (handled) break;
        const key = `${cx + dx},${cy + dy},${layerA}`;
        const arr = bins.get(key);
        if (!arr) continue;

        for (const j of arr) {
          if (i === j) continue;
          const beeB = this.bees[j];
          const dist = this.#getDistance(beeA, beeB);

          if (
            dist < this.proximityThreshold * layerScale &&
            this.#isFacingTarget(beeA, beeB)
          ) {
            if (layerA > 0) {
              const overCluster = this.#isOverActiveCluster(beeA.x, beeA.y);
              const preferLand = overCluster || Math.random() < 0.65;

              if (
                preferLand &&
                beeA.animation !== animationType.land &&
                beeA.animation !== animationType.takeoff
              ) {
                beeA.enterState(
                  animationType.land,
                  Math.floor(30 + Math.random() * 45)
                );
                beeA.proximityCooldown = Math.floor(this.fps * 0.5);
                beeA.minStateFrames = 12;
              } else if (beeA.animation !== animationType.hover) {
                beeA.enterState(
                  animationType.hover,
                  Math.floor(20 + Math.random() * 25)
                );
                beeA.minStateFrames = 10;
              }
            } else {
              if (beeA.animation !== animationType.blocked) {
                beeA.enterState(
                  animationType.blocked,
                  Math.floor(40 + Math.random() * 60)
                );
              }
            }
            handled = true;
            break;
          }
        }
      }
    }
  }
  // --- End proximity section ---

  /**
   * Repositions an off-screen bee just beyond a random canvas edge.
   * Useful after wrap/teleport or when newly spawned.
   *
   * @private
   * @param {Bee} bee - Bee to move to an entry point just outside the viewport.
   */
  #resetBeeLocation(bee: Bee) {
    const buffer = 1.5 * bee.size;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: // top
        bee.x = Math.random() * this.canvasWidth;
        bee.y = -buffer;
        break;
      case 1: // right
        bee.x = this.canvasWidth + buffer;
        bee.y = Math.random() * this.canvasHeight;
        break;
      case 2: // bottom
        bee.x = Math.random() * this.canvasWidth;
        bee.y = this.canvasHeight + buffer;
        break;
      case 3: // left
        bee.x = -buffer;
        bee.y = Math.random() * this.canvasHeight;
        break;
    }
  }

  /**
   * Points a reset bee roughly toward the canvas center so it moves inward.
   *
   * @private
   * @param {Bee} bee - Bee whose heading will be re-initialized.
   */
  #resetBeeInitialDirection(bee: Bee) {
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    const dx = centerX - bee.x;
    const dy = centerY - bee.y;
    bee.theta = Math.atan2(dy, dx);
  }

  /**
   * Checks whether a bee has moved beyond the canvas with a small buffer.
   *
   * @private
   * @param {Bee} bee - Bee to test.
   * @returns {boolean} True if the bee is outside the drawable area and should be reset.
   */
  #isOutOfBounds(bee: Bee): boolean {
    const buffer = 1.5 * bee.size;
    return (
      bee.x < -buffer ||
      bee.x > this.canvasWidth + buffer ||
      bee.y < -buffer ||
      bee.y > this.canvasHeight + buffer
    );
  }

  /**
   * Euclidean distance between two bees.
   *
   * @private
   * @param {Bee} b1 - Bee 1
   * @param {Bee} b2 - Bee 2
   * @returns {number} Distance in canvas pixels.
   */
  #getDistance(b1: Bee, b2: Bee): number {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    return Math.hypot(dx, dy);
  }

  // Axial coordinate helpers for O(1) nearest-cell lookup

  /**
   * Convert canvas (x,y) to fractional axial (q,r) for pointy-top layout.
   *
   * @private
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {{number, number}} Axial coordinates object with q and r
   */
  #xyToAxial(x: number, y: number): { q: number; r: number } {
    const s = this.honeyCombSize;
    const hexWidth = s * 2; // w = 2R
    const hexHeight = Math.sqrt(3) * s; // h = √3 R
    // forward transform used to place: x = 0.75*w * r, y = h * (q + r/2)
    const r = x / (hexWidth * 0.75);
    const q = y / hexHeight - r / 2;
    return { q, r };
  }

  /**
   * Rounds fractional axial coordinates (qf, rf) to the nearest hex using cube rounding.
   *
   * Inputs come from {@link #xyToAxial}, which projects canvas (x,y) into a
   * continuous axial space where q and r are not necessarily integers.
   *
   * Steps:
   *  1) Convert axial (qf, rf) to cube (x, y, z) with x = r, z = q, y = -x - z
   *     (cube coords always satisfy x + y + z = 0).
   *  2) Round each component to the nearest integer → (rx, ry, rz).
   *  3) Pick the component with the largest rounding error and correct it so that
   *     rx + ry + rz = 0 again. This ensures a valid hex index on the cube lattice.
   *  4) Convert the corrected cube back to axial: q = rz, r = rx.
   *
   * ASCII mental model (cube + axial mapping, pointy-top):
   *
   *           z-axis (q)
   *             ^
   *            / \
   *           /   \
   *   y-axis <  0  > x-axis (r)
   *           \   /
   *            \ /
   *             v
   *
   *  - Cube coordinates (x, y, z) lie on the plane x + y + z = 0.
   *  - For pointy-top axial, we map:  x = r,  z = q,  y = -x - z.
   *  - Rounding must keep us on that plane → adjust the component with
   *    the largest rounding error so rx + ry + rz = 0 exactly.
   *
   * @private
   * @param {number} qf - Fractional axial q from {@link #xyToAxial} (non-integer allowed).
   * @param {number} rf - Fractional axial r from {@link #xyToAxial} (non-integer allowed).
   * @returns {{ q: number; r: number }} Nearest integer axial coordinates (hex index).
   */
  #axialRound(qf: number, rf: number): { q: number; r: number } {
    // Convert fractional axial (qf, rf) to cube coordinates.
    // Mapping for pointy-top axial: x = r, z = q, y = -x - z so x + y + z = 0.
    const x = rf;
    const z = qf;
    const y = -x - z;

    // Round each component independently.
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    // Measure rounding error on each component.
    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    // Fix the component with the largest error to restore x + y + z = 0 exactly.
    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    // Convert back to axial: q = z, r = x.
    return { q: rz, r: rx };
  }

  /**
   *  Fast nearest-cell search: check rounded axial and six neighbours instead of scanning the whole grid
   *
   * @private
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {{Honeycomb | undefined, number}} The cell and it's distance to the input point
   */
  #getNearestCellToPointFast(
    x: number,
    y: number
  ): { cell: Honeycomb | undefined; dist: number } {
    const { q: qf, r: rf } = this.#xyToAxial(x, y);
    const { q, r } = this.#axialRound(qf, rf);
    const candidates: Array<Honeycomb | undefined> = [
      this.honeyCombGrid.getAt(q, r),
      this.honeyCombGrid.getAt(q + 1, r),
      this.honeyCombGrid.getAt(q - 1, r),
      this.honeyCombGrid.getAt(q, r + 1),
      this.honeyCombGrid.getAt(q, r - 1),
      this.honeyCombGrid.getAt(q + 1, r - 1),
      this.honeyCombGrid.getAt(q - 1, r + 1),
    ];
    let best: Honeycomb | undefined;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (!c) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return { cell: best, dist: bestDist };
  }

  /**
   * Finds the nearest honeycomb cell to a canvas point.
   *
   * @private
   * @param {number} x - Canvas-space X.
   * @param {number} y - Canvas-space Y.
   * @returns {{ cell: Honeycomb | undefined; dist: number }} The nearest cell (if any) and its distance.
   */
  #getNearestCellToPoint(
    x: number,
    y: number
  ): { cell: Honeycomb | undefined; dist: number } {
    //O(1) nearest‑cell lookup (ditch O(Ncells) scans)
    return this.#getNearestCellToPointFast(x, y);

    // Old slow way
    // O(Ncells) scans
    // let best: Honeycomb | undefined = undefined;
    // let bestDist = Infinity;
    // for (const cell of this.honeyCombGrid.values()) {
    //   const d = Math.hypot(cell.x - x, cell.y - y);
    //   if (d < bestDist) {
    //     best = cell;
    //     bestDist = d;
    //   }
    // }
    // return { cell: best, dist: bestDist };
  }

  /**
   * Whether a canvas point lies over an active honeycomb cell (within one hex radius).
   * @private
   * @param {number} x
   * @param {number} y
   * @returns {boolean} True if the nearest cell is active and within one hex radius.
   */
  #isOverActiveCluster(x: number, y: number): boolean {
    const { cell, dist } = this.#getNearestCellToPoint(x, y);
    if (!cell) return false;
    if (!cell.active) return false;
    if (cell.type === cellType.empty) return false;
    return dist <= this.honeyCombSize; // inside the hex footprint
  }

  /**
   * Return an inactive cluster we can reuse, if one exists.
   *
   * @private
   * @returns {HoneycombCluster | undefined} A pool entry ready to reset, or undefined if all are active/cooling down.
   */
  #getInactiveCluster(): HoneycombCluster | undefined {
    return this.honeyCombClusters.find((c) => !c.active);
  }

  /**
   * Bearing from one point to another.
   *
   * @private
   * @param {{x:number,y:number}} from - Start point.
   * @param {{x:number,y:number}} to - End point.
   * @returns {number} Angle in radians in the range (-π, π].
   */
  #getAngleToTarget(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  /**
   * Tests if a bee is oriented toward a target within a cone.
   *
   * @private
   * @param {Bee} bee - The reference bee.
   * @param {Bee} target - The other bee to face.
   * @param {number} [maxAngle=Math.PI/4] - Half-angle of the acceptance cone.
   * @returns {boolean} True if the absolute heading difference ≤ maxAngle.
   */
  #isFacingTarget(
    bee: Bee,
    target: Bee,
    maxAngle: number = Math.PI / 4
  ): boolean {
    const angleToTarget = this.#getAngleToTarget(bee, target);
    const diff = Math.abs(this.normaliseAngle(angleToTarget - bee.theta));
    return diff < maxAngle;
  }

  /**
   * Normalizes any angle to the interval [-π, π].
   *
   * @param {number} angle - Angle in radians.
   * @returns {number} Equivalent angle wrapped into [-π, π].
   */
  normaliseAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  /**
   * Collects all grid cells that are currently active (any type).
   *
   * @private
   * @returns {HoneycombMap} Map of active cells keyed by axial coordinates.
   */
  #getActiveCells(): HoneycombMap {
    const out = new HoneycombMap();
    this.honeyCombGrid.forEach((cell) => {
      if (cell.active) {
        out.setHC(cell);
      }
    });
    return out;
  }

  /**
   * Collects all active cells containing honey (filled or capped).
   *
   * @private
   * @returns {HoneycombMap} Map of honey cells keyed by axial coordinates.
   */
  #getActiveHoneyCells(): HoneycombMap {
    const out = new HoneycombMap();
    this.honeyCombGrid.forEach((cell) => {
      if (
        cell.active &&
        (cell.type === cellType.honeyFilled ||
          cell.type === cellType.honeyCapped)
      ) {
        out.setHC(cell);
      }
    });
    return out;
  }

  /**
   * Finds the closest active honey cell to a given bee.
   *
   * @private
   * @param {Bee} bee
   * @param {HoneycombMap} activeHoneyCells Predefined active honey cells optional passed in
   * @returns {Honeycomb | undefined} Nearest honey cell, or undefined if none are active.
   */
  #findNearestHoneycombCell(
    bee: Bee,
    activeHoneyCells?: HoneycombMap
  ): Honeycomb | undefined {
    const honey = activeHoneyCells ?? this.#getActiveHoneyCells();
    const it = honey.values();
    const first = it.next();
    if (first.done) return undefined;

    let closest: Honeycomb = first.value;
    let minDist = Math.hypot(closest.x - bee.x, closest.y - bee.y);

    for (const cell of it) {
      const d = Math.hypot(cell.x - bee.x, cell.y - bee.y);
      if (d < minDist) {
        closest = cell;
        minDist = d;
      }
    }
    return closest;
  }

  /**
   * Chooses a honeycomb target for a bee, biased toward the nearest honey cell
   * with occasional randomization to reduce congestion.
   *
   * @private
   * @param {Bee} bee
   * @param {HoneycombMap} activeHoney Optional map of active honey cells to pass in
   * @returns {Honeycomb | undefined} Picked cell to pursue, or undefined if no active cells.
   */
  #pickTargetForBee(
    bee: Bee,
    activeHoney?: HoneycombMap
  ): Honeycomb | undefined {
    const activeCells = activeHoney ?? this.#getActiveHoneyCells();
    if (activeCells.size === 0) return undefined;

    const nearest = this.#findNearestHoneycombCell(bee, activeHoney);
    if (!nearest) return undefined;

    // Occasionally pick a nearby alternative to avoid congestion
    // if you want to keep keys, filter entries, then map back to values when choosing
    if (Math.random() < 0.15) {
      const nearEntries = Array.from(activeCells.entries()).filter(
        ([, c]) =>
          Math.hypot(c.x - nearest.x, c.y - nearest.y) < this.honeyCombSize * 6
      );
      if (nearEntries.length > 0) {
        const [, picked] =
          nearEntries[Math.floor(Math.random() * nearEntries.length)];
        return picked;
      }
    }

    return nearest;
  }

  /**
   * Global click handler (canvas is pointer-events:none; we forward window clicks).
   * Scares nearby bees and optionally spawns a user cluster under the current cap.
   *
   * @param {number} x - Canvas-space X
   * @param {number} y - Canvas-space Y
   */
  handleClick(x: number, y: number) {
    // if (DEV_DEBUG) alert(`x:${x} y:${y}`);

    // 1) Scare nearby bees: turn away and take off
    const scareRadius = Math.max(
      CLICK.SCARE_RADIUS_MIN,
      this.beeSize * CLICK.SCARE_RADIUS_BEE_MULT
    );
    for (const bee of this.bees) {
      const d = Math.hypot(bee.x - x, bee.y - y);
      if (d <= scareRadius) {
        // Angle away from click point
        const away = Math.atan2(bee.y - y, bee.x - x);
        bee.theta = away + (Math.random() - 0.5) * 0.3; // tiny jitter so they don't align perfectly
        // Clear any current target and set a flee target further away
        bee.clearTarget();
        const fleeDist = CLICK.FLEE_MIN + Math.random() * CLICK.FLEE_VAR;
        const fleeX = bee.x + Math.cos(away) * fleeDist;
        const fleeY = bee.y + Math.sin(away) * fleeDist;
        bee.setTarget(fleeX, fleeY);
        // Take off (or keep flying) for a reasonable duration
        if (
          bee.animation !== animationType.fly &&
          bee.animation !== animationType.takeoff
        ) {
          bee.enterState(
            animationType.takeoff,
            Math.floor(
              CLICK.TAKEOFF_MIN_FRAMES +
                Math.random() * CLICK.TAKEOFF_VAR_FRAMES
            ) //Super fast take off
          );
        }
      }
    }

    // 2) User-triggered cluster spawn (respect global cap)
    {
      const remaining = Math.max(
        0,
        this.#getClusterCap() - this.#getActiveClusterCount()
      );
      if (remaining > 0) {
        const { cell } = this.#getNearestCellToPoint(x, y);
        if (cell && !cell.active) {
          this.#ensureClusterPool(this.#getClusterCap());
          const inactive = this.#getInactiveCluster();
          if (inactive) {
            inactive.resetCluster(cell, { userSpawned: true });
            this.lastClusterSpawnFrame = this.frameCounter; // also stagger auto spawns
          }
        }
      }
      // Clicking an active cell has no impact by design
    }
  }

  /**
   * --- Cluster cap and cluster pool management ---
   * How many clusters are allowed concurrently at the current time since start, ramping up to a coverage-based cap
   *
   * @private
   * @returns {number} The maximum number of clusters the Hive is currently allowed
   */
  #getClusterCap(): number {
    const CLUSTER_SAFETY_CAP = CLUSTERS.SAFETY_CAP;
    // --- Coverage-based cap ---
    const gridCells = this.honeyCombGrid.size || 1;

    // Estimate average active cluster size (prefer real, else default)
    let avgClusterCells = 0;
    let count = 0;
    for (const c of this.honeyCombClusters) {
      if (c.active && c.cluster) {
        avgClusterCells += c.cluster.size;
        count++;
      }
    }
    if (count > 0) avgClusterCells /= count;
    else avgClusterCells = CLUSTERS.DEFAULT_AVG_CELLS; // sensible default including outline/edges

    // Target at most this fraction of the grid covered by active clusters
    const targetCoverage = this.targetHoneycombCoverage; // tweak to taste
    const desiredActiveCells = gridCells * targetCoverage;

    let coverageCap = Math.max(
      1,
      Math.floor(desiredActiveCells / Math.max(1, avgClusterCells))
    );

    coverageCap = Math.min(coverageCap, CLUSTER_SAFETY_CAP); // safety upper bound

    // --- Time ramp: gradually allow more clusters up to the coverage cap ---
    const seconds = this.frameCounter / this.fps;
    const rampStartSec = this.clusterRampStartSec; // start allowing clusters at 1:00 (tweak)
    const rampStepSec = this.clusterRampStepSec; // add one slot each 30s (tweak)

    let timeCap = 0;
    if (seconds >= rampStartSec) {
      timeCap = 1 + Math.floor((seconds - rampStartSec) / rampStepSec);
    }

    // Final cap is the smaller of the two: time‑ramp vs coverage
    // (so the count increases over time but never exceeds the coverage budget)
    return Math.max(0, Math.min(coverageCap, timeCap));
  }

  /**
   * Calculate the current number of active honeycomb clusters
   *
   * @private
   * @returns {number} The number of active honeycomb clusters
   */
  #getActiveClusterCount(): number {
    let n = 0;
    for (const c of this.honeyCombClusters) if (c.active) n++;
    return n;
  }

  /**
   * Create new randomly located, innactive new HoneycombClusters
   * The input number determines the amount to create.
   *
   * @private
   * @param {number} size Number of clusters to create
   */
  #ensureClusterPool(size: number) {
    while (this.honeyCombClusters.length < size) {
      this.honeyCombClusters.push(
        new HoneycombCluster(
          this.honeyCombGrid.getRandom(),
          this.honeyCombGrid,
          false,
          this.fps * 20, // 20 seconds time alive
          this.fps * 15 // 15 seconds cool down time
        )
      );
    }
  }

  /**
   * Function checks on avaiailbe cluster cap limit and generates a new cluster
   * if the cap is higher than the current number of clusters
   *
   * @private
   * @returns {void}
   */
  #spawnOneClusterIfAllowed(): void {
    const cap = this.#getClusterCap();
    const active = this.#getActiveClusterCount();
    if (active >= cap) return;

    // stagger spawns so they don't all appear on the same frame
    const minIntervalFrames = Math.floor(this.fps * 5); // at most one every 5s
    if (this.frameCounter - this.lastClusterSpawnFrame < minIntervalFrames)
      return;

    // Ensure pool has room to activate one more
    this.#ensureClusterPool(cap);

    const inactive = this.#getInactiveCluster();
    if (inactive && inactive.cooldownCounter <= 0) {
      // pick a random inactive cell away from edges
      const cell = this.honeyCombGrid.getRandom();
      if (cell && !cell.active) {
        inactive.resetCluster(cell, { userSpawned: false });
        this.lastClusterSpawnFrame = this.frameCounter;
      }
    }
  }

  /**
   * Function runs over each bee, checks if it has stepped on a 'dusty' cell
   * adds footprints to the footprint array with each step set to cadence
   * location and timing.
   * Limited to a maximum number of trails for performance
   *
   * @private
   */
  #addFootprintsForBees() {
    const MAX_TRAILS = TRAILS.MAX; // safety cap

    for (const bee of this.bees) {
      if (!bee.onGround) {
        // Airborne: no footprints and clear stickiness
        bee.trailTick = 0;
        bee.stickyAge = 0;
        bee.stickyKind = null;
        continue;
      }

      // Refresh stickiness when stepping on pollen/honey (even if stationary)
      const { cell } = this.#getNearestCellToPoint(bee.x, bee.y);
      let refreshed = false;

      // If we have a cell
      if (cell) {
        // Check if bee is 'inside' the cell
        const within =
          Math.hypot(cell.x - bee.x, cell.y - bee.y) <= this.honeyCombSize;

        // Check if the cell is 'dusty', is active, has open honey or polen
        const isDusty =
          within &&
          cell.active &&
          (cell.type === cellType.honeyFilled || cell.type === cellType.pollen);

        // If it's dusty add sticky age and kind and mark refreshed
        if (isDusty) {
          bee.stickyAge = Math.floor(this.fps * TRAILS.STICKY_SECONDS);
          bee.stickyKind =
            cell.type === cellType.honeyFilled ? "honey" : "pollen";
          refreshed = true;
        }
      }

      // Only emit *new* prints if there is actual ground motion
      const moving = !!bee.groundMotion; // set in Bee.#updateBee()
      const cadence = TRAILS.MOVING_CADENCE;

      bee.trailTick++;

      if (!moving) {
        // Pause emission; keep sticky a bit longer while stationary
        if (!refreshed && bee.stickyAge > 0)
          bee.stickyAge -= TRAILS.STATIONARY_DECAY; // slower decay on ground
        continue;
      }

      // Need stickiness & cadence to drop a print
      if (bee.stickyAge <= 0 || !bee.stickyKind) {
        if (!refreshed && bee.stickyAge > 0) bee.stickyAge--;
        continue;
      }

      // Need stickiness & cadence to drop a print every cadence amount
      if (bee.trailTick % cadence !== 0) {
        if (!refreshed && bee.stickyAge > 0) bee.stickyAge--;
        continue;
      }

      // Alternate feet left/right relative to heading
      bee.trailSide = !bee.trailSide;
      const side = bee.trailSide ? 1 : (-1 as 1 | -1);

      // Get scale and offset
      const baseScale = bee.size / 15;
      const footOffset = baseScale * 1.4; // lateral distance from midline
      const along = baseScale * 0.6; // slight fore-aft spacing

      // Coordinates setup
      const nx = Math.cos(bee.theta);
      const ny = Math.sin(bee.theta);
      const px = -ny; // perpendicular left
      const py = nx;

      // Alternate x and y positions
      const x =
        bee.x + px * footOffset * side + nx * along * (side > 0 ? 0.5 : -0.5);
      const y =
        bee.y + py * footOffset * side + ny * along * (side > 0 ? 0.5 : -0.5);

      const scale = baseScale * 0.7;

      // Push individual print
      this.trails.push({
        x,
        y,
        theta: bee.theta,
        kind: bee.stickyKind,
        age: 0,
        maxAge: Math.floor(this.fps * TRAILS.FADE_SECONDS),
        side: side as -1 | 1,
        scale,
      });

      // Decay sticky after dropping a print when moving
      if (!refreshed && bee.stickyAge > 0) bee.stickyAge--;
      if (this.trails.length > MAX_TRAILS)
        this.trails.splice(0, this.trails.length - MAX_TRAILS);
    }
  }

  /**
   * Function draws the individual trails and foot prints from the trails array.
   * Removes any that have outlived their welcome
   *
   * @private
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   * @returns {void}
   */
  #drawAndCullTrails(ctx: CanvasRenderingContext2D): void {
    if (this.trails.length === 0) return;

    // Check for trails length
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.age++;
      const a = 1 - t.age / t.maxAge;
      if (a <= 0) {
        this.trails.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t.x, t.y);
      ctx.rotate(t.theta);
      ctx.fillStyle =
        t.kind === "honey"
          ? "rgba(255, 204, 0, 0.9)"
          : "rgba(255, 165, 0, 0.9)";
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.3 * t.scale;

      // Two small overlapping ellipses = smeared footprint + lateral toe
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.9 * t.scale, 0.5 * t.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(
        1.0 * t.scale,
        0.2 * t.scale * t.side,
        0.7 * t.scale,
        0.4 * t.scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Function calculates the likelihood of taking off based on location to cluster
   * If take off likely then set's the bee to takeoff
   *
   * Bees prefer to remain on ground when walking over active clusters; takeoff threshold and probability are reduced.
   *
   * @private
   * @param bee
   * @returns {void}
   */
  #considerTakeoffToDistantTarget(bee: Bee): void {
    // Only check roughly once per second to avoid spamming random()
    if (this.frameCounter % this.fps !== 0) return;

    // Must be on the ground and in a ground state
    const groundState =
      bee.animation === animationType.idle ||
      bee.animation === animationType.blocked ||
      bee.animation === animationType.walk ||
      bee.animation === animationType.turn;
    if (!bee.onGround || !groundState || !bee.hasTarget()) return;

    const tx = bee.targetX as number;
    const ty = bee.targetY as number;
    const dist = Math.hypot(tx - bee.x, ty - bee.y);

    // Base distance threshold where flying becomes attractive
    const flyDistanceThreshold = 16 * bee.size; // e.g., 240px for size=30

    // NEW: reduce takeoff bias when walking over an active cluster cell
    const overCluster = this.#isOverActiveCluster(bee.x, bee.y);

    // Raise the distance threshold if over a cluster (prefer to stay on ground)
    const threshold = overCluster
      ? flyDistanceThreshold * 1.75
      : flyDistanceThreshold;

    if (dist < threshold) return;

    // Probability increases with distance beyond the (possibly raised) threshold
    const t = Math.min(1, (dist - threshold) / (3 * flyDistanceThreshold));
    const baseP = 0.1 + 0.25 * t;

    // Damp probability strongly when over a cluster
    const p = overCluster ? baseP * 0.3 : baseP;

    if (Math.random() < p) {
      // Face the target a bit before takeoff
      const angleToTarget = Math.atan2(ty - bee.y, tx - bee.x);
      bee.theta =
        bee.theta +
        Math.atan2(
          Math.sin(angleToTarget - bee.theta),
          Math.cos(angleToTarget - bee.theta)
        ) *
          0.6;

      // Lift off; short snappy takeoff
      bee.enterState(
        animationType.takeoff,
        Math.floor(30 + Math.random() * 30)
      );
    }
  }

  /**
   * Function used to recalculate the entire effect based on new canvas size
   *
   * @param width The width of the new canvas to be resized to
   * @param height The height of the new canvas to be resized to
   */
  resize(width: number, height: number) {
    // Set inputs
    this.canvasWidth = width;
    this.canvasHeight = height;

    // Clear columns
    this.honeyCombGrid = new HoneycombMap();
    //Run private initialiser method
    this.#initialiser();
  }

  // Compose a bin key from integer bin coordinates and z-layer
  #keyForBin(x: number, y: number, layer: number) {
    // Bin size ~ proximity threshold so that neighbours likely fall into the same or adjacent bins.
    const BIN = this.proximityThreshold;
    return `${Math.floor(x / BIN)},${Math.floor(y / BIN)},${layer}`;
  }

  /**
   * Renders developer diagnostics overlay (counts, timing) to the canvas.
   *
   * @private
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  #devStats(ctx: CanvasRenderingContext2D) {
    ctx.save();

    ctx.font = "32px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Bees: ${this.bees.length}`, this.canvasWidth - 40, 120);
    const cluster1 = this.honeyCombClusters.values().next().value;
    if (cluster1) {
      if (
        cluster1.animationFrameCounter >= cluster1.maximumLifeTime ||
        cluster1.animationFrameCounter === 0
      ) {
        ctx.fillStyle = "green";
      } else {
        ctx.fillStyle = "black";
      }
      ctx.fillText(
        `Cluster 1 Max Frames: ${cluster1.maximumLifeTime}`,
        this.canvasWidth - 40,
        160
      );
      if (
        cluster1.animationFrameCounter >=
        cluster1.fadeInTime +
          cluster1.maximumDistanceAndBorder * cluster1.delayTime
      ) {
        ctx.fillStyle = "green";
      } else {
        ctx.fillStyle = "black";
      }
      ctx.fillText(
        `Cluster 1 Faded In Frames: ${
          cluster1.fadeInTime +
          cluster1.maximumDistanceAndBorder * cluster1.delayTime
        }`,
        this.canvasWidth - 40,
        200
      );
      if (
        cluster1.animationFrameCounter >=
        cluster1.fadeInTime +
          cluster1.visibleTime -
          cluster1.maximumDistanceAndBorder * cluster1.delayTime
      ) {
        ctx.fillStyle = "green";
      } else {
        ctx.fillStyle = "black";
      }
      ctx.fillText(
        `Cluster 1 Faded Out Start Frames: ${
          cluster1.fadeInTime +
          cluster1.visibleTime -
          cluster1.maximumDistanceAndBorder * cluster1.delayTime
        }`,
        this.canvasWidth - 40,
        240
      );
      ctx.fillStyle = "black";
      ctx.fillText(
        `Cluster 1 Max Distance and Border: ${cluster1.maximumDistanceAndBorder}`,
        this.canvasWidth - 40,
        280
      );
      ctx.fillStyle = "black";
      ctx.fillText(
        `Cluster 1 Visible Time: ${
          cluster1.visibleTime -
          cluster1.maximumDistanceAndBorder * cluster1.delayTime
        }`,
        this.canvasWidth - 40,
        320
      );
      ctx.fillStyle = "black";
      ctx.fillText(
        `Cluster 1 Frame: ${cluster1.animationFrameCounter}`,
        this.canvasWidth - 40,
        360
      );
    }
    ctx.fillStyle = "black";
    ctx.fillText(
      `User generated clusters: ${
        this.honeyCombClusters.filter((c) => c.userSpawned).length
      }`,
      this.canvasWidth - 40,
      400
    );
    ctx.fillStyle = "black";
    ctx.fillText(
      `Cluster buget : ${this.#getClusterCap()}`,
      this.canvasWidth - 40,
      440
    );
    ctx.fillStyle = "black";
    ctx.fillText(
      `Animation frames : ${this.frameCounter}`,
      this.canvasWidth - 40,
      480
    );
    ctx.fillStyle = "black";
    ctx.fillText(
      `Seconds : ${Math.floor(this.frameCounter / this.fps)}`,
      this.canvasWidth - 40,
      520
    );
    ctx.restore();
  }
}

/** Types of honeycomb cells used for coloring and lifecycle rules. */
enum cellType {
  empty = "empty",
  pollen = "pollen",
  honeyFilled = "honey filled",
  honeyCapped = "honey capped",
  broodCell = "brood cell",
  broodCellCapped = "brood cell capped",
  broodHatching = "brood hatching",
}

/**
 * Single hex cell in the comb grid with axial (q,r) coordinates and canvas position.
 * Holds activation state, type, opacity and geometric metadata for cluster animations.
 */
class Honeycomb {
  static unitHexPath: Path2D | null = null;

  q: number; // col
  r: number; // row
  x: number; // canvas x
  y: number; // canvas y
  size: number;

  type: cellType;

  opacity: number;

  active: boolean;
  border: number;
  edge: number;
  distanceFromCentrePiece: number;

  age: number; // frames since activation

  /**
   * @param {number} q - Axial q (column) index.
   * @param {number} r - Axial r (row) index.
   * @param {number} x - Canvas-space x coordinate of cell center.
   * @param {number} y - Canvas-space y coordinate of cell center.
   * @param {number} size - Hex radius in pixels.
   * @param {boolean} [active=false] - Whether the cell starts active.
   * @param {number} [border=0] - Border ring index (0 for interior).
   * @param {number} [edge=0] - Edge ring index used by outline logic.
   * @param {number} [opacity=1] - Initial opacity (0..1).
   * @param {cellType} [type=cellType.empty] - Initial cell content type.
   * @param {number} [distanceFromCentrePiece=0] - Distance from cluster center (axial metric).
   * @param {number} [age=0] - Frames since last activation.
   */
  constructor(
    q: number,
    r: number,
    x: number,
    y: number,
    size: number,
    active: boolean = false,
    border: number = 0,
    edge: number = 0,
    opacity: number = 1,
    type: cellType = cellType.empty,
    distanceFromCentrePiece: number = 0,
    age: number = 0
  ) {
    this.q = q;
    this.r = r;
    this.x = x;
    this.y = y;
    this.size = size;
    this.opacity = opacity;
    this.type = type;
    this.active = active;
    this.age = age;
    this.border = border;
    this.edge = edge;
    this.distanceFromCentrePiece = distanceFromCentrePiece;
  }

  /**
   * Resets this cell to an inactive, empty state and clears animation metadata.
   */
  resetCell() {
    this.border = 0;
    this.edge = 0;
    this.type = cellType.empty;
    this.distanceFromCentrePiece = 0;
    this.active = false;
    this.age = 0;
  }

  /**
   *
   * @returns
   */
  static getUnitHexPath(): Path2D {
    if (this.unitHexPath) return this.unitHexPath;
    const p = new Path2D();
    const ang = (2 * Math.PI) / 6;
    p.moveTo(Math.cos(0), Math.sin(0));
    for (let i = 1; i < 6; i++) p.lineTo(Math.cos(ang * i), Math.sin(ang * i));
    p.closePath();
    this.unitHexPath = p;

    return p;
  }

  /**
   * Paints this hex cell at its canvas position using its current type and opacity.
   * Skips work when inactive or fully transparent.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) {
      this.age = 0;
      return;
    }
    if (this.opacity === 0) return;
    if (this.active) this.age++;

    ctx.save();

    ctx.translate(this.x, this.y);
    ctx.scale(this.size, this.size); // draw unit hex at cell size
    const unit = Honeycomb.getUnitHexPath();

    //set stroke width and color
    switch (this.type) {
      case cellType.broodCell:
        ctx.fillStyle = "white";
        break;
      case cellType.broodCellCapped:
        ctx.fillStyle = "brown";
        break;
      case cellType.broodHatching:
        ctx.fillStyle = "grey";
        break;
      case cellType.honeyCapped:
        ctx.fillStyle = "#FF8C00";
        break;
      case cellType.honeyFilled:
        ctx.fillStyle = "#ffFc00";
        break;
      case cellType.pollen:
        ctx.fillStyle = "orange";
        break;
      case cellType.empty:
      default:
        ctx.fillStyle = "#000";
        break;
    }
    //If border cell then the maximum opacity is 1/3 the full opacity number of borders
    ctx.globalAlpha = this.opacity / (this.border > 0 ? 3 * this.border : 1);
    ctx.fill(unit);

    // Outline
    ctx.strokeStyle = "orange";
    // lineWidth in *unit space* so it stays consistent regardless of transform
    ctx.lineWidth = HEX.BORDER_LINE_WIDTH_UNIT; // ≈ this.size / 67 in pixel space after scaling
    if (this.border < 1) ctx.stroke(unit);

    // DevStats
    // if(DEV_DEBUG) this.#devStats(ctx);

    ctx.restore();
  }

  /**
   * Debug overlay for an individual cell (distance/indices).
   *
   * @private
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  #devStats(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = "8px arial";
    ctx.fillStyle = "black";
    // ctx.fillText(`${this.q}, ${this.r}`, this.x + 12, this.y);
    ctx.fillText(`${this.distanceFromCentrePiece}`, this.x + 4, this.y);
    // ctx.fillText(`${this.edge}`, this.x + 4, this.y);
    // ctx.fillText(`${this.age}`, this.x + 4, this.y);
    // ctx.fillText(`${this.opacity}`, this.x + 4, this.y);
    ctx.restore();
  }
}

/**
 * A time-sculpted cluster of active honeycomb cells that grows, idles, then fades.
 * Applies per-cell delays so outer rings light up later and fade earlier.
 */
class HoneycombCluster {
  centreCell!: Honeycomb;
  grid: HoneycombMap;
  cluster!: HoneycombMap;

  maximumDistance: number = 0;
  maximumDistanceAndBorder: number = 0;

  fadeInTime: number = 60; // frames
  fadeOutTime: number = 180; // frames
  visibleTime: number = 600; // frames
  delayTime: number = 30; // frames

  maximumLifeTime: number = 0;

  animationFrameCounter!: number;

  active!: boolean;
  userSpawned: boolean = false;

  // Cooldown before this cluster can be auto-reset once inactive (in frames)
  cooldownFrames: number = 900; // frames
  cooldownCounter: number = 0;

  /**
   * @param {Honeycomb} centreCell - Starting center cell for this cluster.
   * @param {HoneycombMap} grid - Reference to the global grid.
   * @param {boolean} [active=true] - Whether to activate immediately.
   * @param {number} [visibleTime=600] - Base steady-state visible time (center cell), in frames.
   */
  constructor(
    centreCell: Honeycomb,
    grid: HoneycombMap,
    active: boolean = true,
    visibleTime: number = 600,
    cooldownFrames: number = 900
  ) {
    this.grid = grid;
    this.active = active;
    this.visibleTime = this.#randomWithin20Percent(visibleTime);
    this.centreCell = centreCell;
    this.cooldownFrames = cooldownFrames;
    if (this.active) {
      this.#initialiser();
    }
  }

  /**
   * Initialise the HoneycombCluster
   *
   * @private
   */
  #initialiser() {
    this.animationFrameCounter = 0;
    this.cluster = this.#growCluster(this.centreCell, this.grid);
    this.#fillHoles(this.grid, this.cluster);
    this.#addOutline(this.grid, this.cluster, 1);
    this.#addOutline(this.grid, this.cluster, 2);
    this.#setEdgeCells(this.grid, this.cluster, 1);
    this.#setEdgeCells(this.grid, this.cluster, 2);
    this.#setEdgeCells(this.grid, this.cluster, 3);
    this.#setEdgeCells(this.grid, this.cluster, 4);
    this.#setDistanceValue(this.centreCell, this.cluster);
    this.visibleTime = this.#generateVisibleTime(
      this.maximumDistanceAndBorder,
      this.visibleTime,
      this.fadeInTime,
      this.fadeOutTime,
      this.delayTime
    );
    this.maximumLifeTime = this.#getMaximumLifeTime();
    this.#setCellType(this.cluster, this.centreCell);
    // console.log({
    //   inputVisibleTime: this.visibleTime,
    //   maxLifeTimeFrames: this.maximumLifeTime,
    //   maxDistanceFromCentre: this.maximumDistance,
    //   maxDistanceFromCentreAndBorder: this.maximumDistanceAndBorder,
    //   visibleTimeFrames: this.visibleTime,
    //   fadeInTimeFrames: this.fadeInTime,
    //   fadeOutTimeFrames: this.fadeOutTime,
    //   delayTimeFrames: this.delayTime,
    // });
  }

  /**
   * Resets this instance to begin a new animated lifecycle at a new centre cell.
   *
   * @param {Honeycomb} centreCell
   * @param {{ visibleTime?: number; userSpawned?: boolean }} [opts] Visible Time and boolean for if cluster is user spawned
   */
  resetCluster(
    centreCell: Honeycomb,
    opts: { visibleTime?: number; userSpawned?: boolean } = { visibleTime: 600 }
  ) {
    const visibleTime = opts.visibleTime ? opts.visibleTime : 600;
    this.visibleTime = this.#randomWithin20Percent(visibleTime);
    this.centreCell = centreCell;
    this.active = true;
    this.userSpawned = !!opts.userSpawned;
    this.#initialiser();
  }

  /**
   * Randomly grows a connected region outward from the center using a queue and
   * distance-biased inclusion, skipping already-active cells.
   *
   * @private
   * @param {Honeycomb} center
   * @param {HoneycombMap} grid
   * @param {number} [size=120] - Target number of cells for the cluster core.
   * @returns {HoneycombMap} Map of cells comprising this cluster (all set active with opacity 0).
   */
  #growCluster(
    center: Honeycomb,
    grid: HoneycombMap,
    size: number = 120
  ): HoneycombMap {
    const visited = new HoneycombMap();
    const result = new HoneycombMap();
    const queue: Array<Honeycomb> = [center];

    while (queue.length > 0 && result.size < size) {
      const current = queue.shift()!;
      if (visited.hasAt(current.q, current.r)) continue;

      visited.setHC(current);
      result.setHC(current);

      const neighbours = this.#getNeighbours(current, grid);
      neighbours.forEach((n) => {
        // Don't touch neighbours that are already active.
        if (n.active) return true;

        const distFromCenter = this.#axialDistance(center, n);
        // const screenDist = Math.round(
        //   Math.hypot(n.x - center.x, n.y - center.y) / 10
        // );
        // console.log(screenDist);
        const inclusionChance = Math.max(0.3, 1 - distFromCenter * 0.1);
        if (!visited.hasAt(n.q, n.r) && Math.random() < inclusionChance) {
          queue.push(n);
        }
      });
    }

    result.forEach((cell) => {
      cell.active = true;
      cell.opacity = 0;
    });

    return result;
  }

  /**
   * Fills interior holes by flood-filling from the bounding box edges and
   * activating enclosed inactive cells.
   *
   * @private
   * @param {HoneycombMap} grid
   * @param {HoneycombMap} cluster
   */
  #fillHoles(grid: HoneycombMap, cluster: HoneycombMap) {
    // Compute cluster bounds with buffer
    let minQ = Infinity,
      maxQ = -Infinity;
    let minR = Infinity,
      maxR = -Infinity;
    cluster.forEach((cell) => {
      if (cell.q < minQ) minQ = cell.q;
      if (cell.q > maxQ) maxQ = cell.q;
      if (cell.r < minR) minR = cell.r;
      if (cell.r > maxR) maxR = cell.r;
    });
    minQ -= 1;
    maxQ++;
    minR -= 1;
    maxR++;

    const inactiveSet = new HoneycombMap();
    for (let q = minQ; q <= maxQ; q++) {
      for (let r = minR; r <= maxR; r++) {
        const cell = grid.getAt(q, r);
        if (cell && !cell.active) {
          inactiveSet.setHC(cell);
        }
      }
    }

    const safeSet = new HoneycombMap();
    const queue: [number, number][] = [];

    // Enqueue all outer edge inactive cells
    for (let q = minQ; q <= maxQ; q++) {
      for (const r of [minR, maxR]) {
        if (inactiveSet.hasAt(q, r)) {
          queue.push([q, r]);
          safeSet.setHC(grid.getAt(q, r)!);
        }
      }
    }
    for (let r = minR; r <= maxR; r++) {
      for (const q of [minQ, maxQ]) {
        if (inactiveSet.hasAt(q, r)) {
          queue.push([q, r]);
          safeSet.setHC(grid.getAt(q, r)!);
        }
      }
    }

    // BFS flood fill
    while (queue.length > 0) {
      const [q, r] = queue.shift()!;
      const neighbours = this.#getNeighbours(grid.getAt(q, r)!, grid);

      neighbours.forEach((n) => {
        if (inactiveSet.hasAt(n.q, n.r) && !safeSet.hasAt(n.q, n.r)) {
          safeSet.setHC(n);
          queue.push([n.q, n.r]);
        }
      });
    }

    inactiveSet.forEach((cell, key) => {
      if (!safeSet.has(key)) {
        if (cell) {
          cell.active = true;
          cell.opacity = 0;
          cluster.setHC(cell);
        }
      }
    });
  }

  /**
   * Adds an outline ring of inactive neighbours around the cluster and marks
   * them with the given border index.
   *
   * @private
   * @param {HoneycombMap} grid
   * @param {HoneycombMap} cluster
   * @param {number} [border=1] - Border ring index to assign.
   */
  #addOutline(grid: HoneycombMap, cluster: HoneycombMap, border: number = 1) {
    const toAdd: Array<Honeycomb> = [];

    // Compute cluster bounds with buffer
    let minQ = Infinity,
      maxQ = -Infinity;
    let minR = Infinity,
      maxR = -Infinity;

    cluster.forEach((cell) => {
      minQ = Math.min(minQ, cell.q);
      maxQ = Math.max(maxQ, cell.q);
      minR = Math.min(minR, cell.r);
      maxR = Math.max(maxR, cell.r);
    });
    minQ -= 2;
    maxQ += 2;
    minR -= 2;
    maxR += 2;

    for (let q = minQ; q <= maxQ; q++) {
      for (let r = minR; r <= maxR; r++) {
        const cell = grid.getAt(q, r);
        if (!cell) continue;
        if (cell.active) continue;

        const neighbours = this.#getNeighbours(cell, grid);
        let touchesCluster = false;

        neighbours.forEach((neighbour) => {
          if (neighbour.active) {
            touchesCluster = true;
            return true;
          }
        });

        if (touchesCluster) {
          toAdd.push(cell);
        }
      }
    }

    toAdd.forEach((c) => {
      c.active = true;
      c.opacity = 0;
      c.border = border;
      cluster.setHC(c);
    });
  }

  /**
   * Marks interior cells that touch the outer border (or successive edge rings)
   * to enable layered styling.
   *
   * @private
   * @param {HoneycombMap} grid
   * @param {HoneycombMap} cluster
   * @param {number} [edge=1] - Edge ring depth to set.
   */
  #setEdgeCells(grid: HoneycombMap, cluster: HoneycombMap, edge: number = 1) {
    cluster.forEach((cell) => {
      if (cell.border > 0) return true;
      if (edge > 1 && cell.edge >= 1) return true;

      const neighbours = this.#getNeighbours(cell, grid);
      neighbours.forEach((neighbour) => {
        if (edge > 1) {
          if (neighbour.edge + 1 === edge) {
            cell.edge = edge;
          }
        } else {
          if (!neighbour.active || neighbour.border > 0) {
            cell.edge = edge;
          }
        }
      });
    });
  }

  /**
   * Computes axial distance from the center and updates cluster-wide maxima.
   *
   * @private
   * @param {Honeycomb} centre
   * @param {HoneycombMap} cluster
   */
  #setDistanceValue(centre: Honeycomb, cluster: HoneycombMap) {
    cluster.forEach((cell) => {
      cell.distanceFromCentrePiece = this.#axialDistance(centre, cell);
      this.maximumDistance = Math.max(
        this.maximumDistance,
        cell.distanceFromCentrePiece
      );
      this.maximumDistanceAndBorder = Math.max(
        this.maximumDistanceAndBorder,
        cell.distanceFromCentrePiece + cell.border
      );
    });
  }

  axialDirections = [
    { q: 0, r: -1 }, // North
    { q: +1, r: -1 }, // NorthEast
    { q: +1, r: 0 }, // SouthEast
    { q: 0, r: +1 }, // South
    { q: -1, r: +1 }, // SouthWest
    { q: -1, r: 0 }, // NorthWest
  ];

  /**
   * Computes a cluster-level visible time by adding the time to load/fade and
   * the maximum propagation delay. (Legacy helper used by current timing model.)
   *
   * @private
   * @param {number} maximumDistanceAndBorder - Furthest ring index used for max delay.
   * @param {number} visibleTime - Base steady-state time before delays.
   * @param {number} fadeInTime - Frames spent fading in per cell.
   * @param {number} fadeOutTime - Frames spent fading out per cell.
   * @param {number} delayTime - Per-ring delay in frames.
   * @returns {number} The visible time adjusted to ensure farthest cells complete.
   */
  #generateVisibleTime(
    maximumDistanceAndBorder: number,
    visibleTime: number,
    fadeInTime: number,
    fadeOutTime: number,
    delayTime: number
  ): number {
    const maxDelay = delayTime * maximumDistanceAndBorder;
    const timeToLoad = fadeInTime + fadeOutTime + maxDelay;
    return visibleTime + timeToLoad;
  }

  /**
   * Total cluster lifetime from first fade-in to complete fade-out (center basis).
   *
   * @private
   * @returns {number} Frames until the animation is fully finished.
   */
  #getMaximumLifeTime(): number {
    return this.visibleTime + this.fadeInTime + this.fadeOutTime;
  }

  /**
   * Returns the six axial neighbours of a cell that exist in the grid.
   *
   * @private
   * @param {Honeycomb} cell
   * @param {HoneycombMap} grid
   * @returns {HoneycombMap} Map of neighbour cells keyed by axial coordinates.
   */
  #getNeighbours(cell: Honeycomb, grid: HoneycombMap): HoneycombMap {
    return new HoneycombMap(
      this.axialDirections
        .map((d) => {
          const neighbourQ = cell.q + d.q;
          const neighbourR = cell.r + d.r;
          const neighbour = grid.getAt(neighbourQ, neighbourR);
          return neighbour ? [`${neighbourQ},${neighbourR}`, neighbour] : null;
          // return grid.getAt(neighbourQ, neighbourR);
        })
        .filter((entry): entry is [string, Honeycomb] => !!entry)
    );
  }

  /**
   * Assigns a content type to each cell based on edge depth to mimic realistic comb patterns.
   *
   * @private
   * @param {HoneycombMap} cluster
   * @param {Honeycomb} centerCell
   */
  #setCellType(cluster: HoneycombMap, centerCell: Honeycomb) {
    cluster.forEach((cell) => {
      if (cell.border > 0) return true;
      if (cell.edge >= 1 && cell.edge < 3) {
        const rand = Math.random();
        if (rand > 0.8) {
          cell.type = cellType["empty"];
        } else if (rand > 0.6) {
          cell.type = cellType["honeyFilled"];
        } else {
          cell.type = cellType["honeyCapped"];
        }
      } else if (cell.edge >= 3 && cell.edge < 4) {
        const rand = Math.random();
        if (rand > 0.8) {
          cell.type = cellType["empty"];
        } else {
          cell.type = cellType["pollen"];
        }
      } else {
        const rand = Math.random();
        if (rand > 0.9) {
          cell.type = cellType["broodHatching"];
        } else if (rand > 0.8) {
          cell.type = cellType["empty"];
        } else if (rand > 0.7) {
          cell.type = cellType["broodCell"];
        } else {
          cell.type = cellType["broodCellCapped"];
        }
      }
    });
    centerCell.type = cellType["broodCellCapped"];
  }

  /**
   * Samples a random integer within ±20% of a base value.
   *
   * @private
   * @param {number} value - Base value.
   * @returns {number} Random integer in [0.8×value, 1.2×value].
   */
  #randomWithin20Percent(value: number): number {
    const low = Math.max(1, Math.floor(value * 0.8));
    const high = Math.ceil(value * 1.2);
    return Math.floor(this.#randomNumberBetween(low, high));
  }

  /**
   * Uniform random float within [min, max).
   *
   * @param {number} min
   * @param {number} max
   * @returns {number} Random number ≥ min and < max.
   */
  #randomNumberBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Axial hex distance (q,r) between two cells.
   *
   * @private
   * @param {Honeycomb} centre
   * @param {Honeycomb} cell
   * @returns {number} Ring distance (0 at the same cell).
   */
  #axialDistance(centre: Honeycomb, cell: Honeycomb) {
    return (
      (Math.abs(centre.q - cell.q) +
        Math.abs(centre.q + centre.r - cell.q - cell.r) +
        Math.abs(centre.r - cell.r)) /
      2
    );
  }

  /**
   * Advances the cluster animation by one frame. Updates per-cell opacity based on
   * delay, fade in/out and remaining visible time, and deactivates the cluster when done.
   *
   * @returns {void}
   */
  updateCellLifecycle(): void {
    if (!this.active) return;

    this.animationFrameCounter++;

    this.cluster.forEach((cell) => {
      const delay =
        this.delayTime * (cell.distanceFromCentrePiece + cell.border);
      const fadeInTime = this.fadeInTime;
      const fadeOutTime = this.fadeOutTime;
      const visibleTime = this.visibleTime - delay * 2;
      const currentRelativeFrame = this.animationFrameCounter - delay;

      if (currentRelativeFrame < 0) {
        cell.opacity = 0;
      } else if (currentRelativeFrame <= fadeInTime) {
        cell.opacity = currentRelativeFrame / fadeInTime;
      } else if (currentRelativeFrame > fadeInTime + visibleTime) {
        cell.opacity =
          1 - (currentRelativeFrame - (fadeInTime + visibleTime)) / fadeOutTime;

        if (cell.opacity <= 0) {
          cell.opacity = 0;
          cell.resetCell();
        }
      }
    });

    if (this.animationFrameCounter > this.maximumLifeTime) {
      this.active = false;
      this.animationFrameCounter = 0;

      // start cooldown; Hive will decrement per frame
      this.cooldownCounter = this.cooldownFrames;
      if (this.userSpawned) {
        this.userSpawned = false; // clear flag for reuse
      }
    }
  }

  /**
   * Decrements the cluster's reuse cooldown by one frame if active.
   */
  tickCooldown() {
    if (this.cooldownCounter > 0) this.cooldownCounter--;
  }
}

/** Bee caste (worker / queen / drone). */
enum beeType {
  worker = "worker",
  queen = "queen",
  drone = "drone",
}

/** Bee animation/state machine modes. */
enum animationType {
  idle = "idle", // Bee is still or standing
  blocked = "blocked", // Similar to idle but denotes the bee is blocked
  walk = "walk", // Bee is moving on ground
  turn = "turn", //Bee is pivoting in place
  flutter = "flutter", // Wings flutter, not full flight
  takeoff = "takeoff", // Transitioning to fying
  fly = "fly", //Acttively flying
  land = "land", //Transition to ground
  hover = "hover", //Fling in place
}

/**
 * Single bee agent handling movement, targeting, animation state machine and drawing.
 * Bees exist in a pseudo‑3D space with z‑layers (0..2) that influence proximity and shadows.
 */
class Bee {
  x: number;
  y: number;
  z: number; // height off the page
  theta: number; //radians
  size: number;
  speed: number;
  noiseOffset: number;
  // headOffset: number;
  gaitOffset: number;
  flapOffset: number;

  hoverAnchorX: number;
  hoverAnchorY: number;
  hoverRadius: number;
  hoverAngleOffset: number;
  hoverDirection: number;

  // Motion tracking for gait
  prevX: number;
  prevY: number;
  prevTheta: number;
  legsShouldAnimate: boolean;
  onGround: boolean;
  groundMotion: boolean; // true when on ground and actually translating or turning

  // Targeting
  targetX?: number;
  targetY?: number;
  targetKey?: string; // e.g. `${q},${r}`
  targetAge: number; // frames since target was set
  targetMaxAge: number; // frames before we force retarget
  arrivedFrames: number; // frames spent close to target

  type?: beeType;
  animation: animationType;

  // Timing
  animationFrameCounter: number;
  legGaitCounter: number;
  wingFlapCounter: number;
  stateCounter: number;
  stateDuration: number; // frames to remain in current state
  minStateFrames: number = 0;

  // Trails
  trailTick: number;
  trailSide: boolean; // false = left, true = right
  // Sticky trail state
  stickyAge: number; // frames remaining of “sticky feet”
  stickyKind: "pollen" | "honey" | null;

  // Temporary immunity from proximity-based re-blocking (in frames)
  proximityCooldown: number;

  constructor(
    x: number,
    y: number,
    size: number,
    type = beeType.worker,
    animation = animationType.walk
  ) {
    this.x = x;
    this.y = y;
    this.z = 0;

    this.size = size;
    this.type = type;
    this.animation = animation;

    this.theta = 0;
    this.speed = 1;

    this.noiseOffset = Math.random() * 1000;

    this.gaitOffset = Math.random() * Math.PI * 2;
    this.flapOffset = Math.random() * Math.PI * 2;

    this.hoverAnchorX = this.x;
    this.hoverAnchorY = this.y;
    this.hoverRadius = 0;
    this.hoverAngleOffset = Math.random() * Math.PI * 2;
    this.hoverDirection = 1;

    // Targeting defaults
    this.targetX = undefined;
    this.targetY = undefined;
    this.targetKey = undefined;
    this.targetAge = 0;
    this.targetMaxAge = Math.floor(240 + Math.random() * 360); // 4–10s
    this.arrivedFrames = 0;

    this.prevX = this.x;
    this.prevY = this.y;
    this.prevTheta = this.theta;
    this.legsShouldAnimate = false;
    this.onGround = true;
    this.groundMotion = false;

    this.animationFrameCounter = 0;
    this.legGaitCounter = 0;
    this.wingFlapCounter = 0;
    this.stateCounter = 0;
    this.stateDuration = 0;

    // Trails
    this.trailTick = 0;
    this.trailSide = false;
    this.stickyAge = 0;
    this.stickyKind = null;

    this.proximityCooldown = 0;

    // this.headOffset = 0;
  }

  /**
   * Updates kinematics/animation state and renders the bee at its current pose.
   * Advances counters/positions and paints the bee.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  draw(ctx: CanvasRenderingContext2D) {
    this.#updateBee();

    if (DEV_DEBUG) this.#devStats(ctx);

    //Save the context ahead of changes
    ctx.save();

    ctx.translate(this.x, this.y);
    ctx.rotate(this.theta);

    // Scaling factor
    const baseScale = this.size / 15;
    const scale = baseScale * (1 + 0.08 * this.z); // slight growth with height (z=2 -> +16%)

    // Colors
    const eyeColor = "#111";
    const abdomenColor = "#ffcc00";
    const wingColor = "#EDF2F7";
    const legColor = "black";
    const shadowColor = "rgba(0,0,0,0.6)";

    function shadowBlurForZ(baseScale: number, z: number) {
      return 20 * baseScale * z;
    }
    function shadowAlphaForZ(z: number) {
      return Math.max(0.08, 0.22 - 0.06 * z);
    }

    // ---- Draw Shadow (under bee) ----
    {
      const shadowScale = 1 + 0.3 * this.z; // larger when higher
      const shadowAlpha = shadowAlphaForZ(this.z); // lighter when higher
      const blur = shadowBlurForZ(baseScale, this.z); // blur increases with height

      ctx.save();
      ctx.globalAlpha = shadowAlpha; // overall darkness
      ctx.shadowColor = shadowColor; // shadow color & alpha
      ctx.shadowBlur = blur; // softness by height

      ctx.beginPath();
      ctx.ellipse(
        -4.5 * baseScale,
        0,
        10 * baseScale * shadowScale,
        5 * baseScale * shadowScale,
        0,
        0,
        Math.PI * 2
      );

      // Lighter fill so the actual shape doesn’t completely mask the shadow halo
      ctx.fillStyle = shadowColor;
      ctx.fill();

      ctx.restore();
    }

    // ---- Draw Legs with animated tripod gait ----
    ctx.strokeStyle = legColor;
    ctx.lineWidth = 1.5 * scale;

    // --- LEG FOLD LOGIC (takeoff, fly, land) ---
    // Legs fold factor: 0 = on ground (splayed), 1 = hanging straight down (in air)
    let legFold = 0;
    if (
      this.animation === animationType.fly ||
      this.animation === animationType.hover
    ) {
      legFold = 1;
    } else if (
      this.animation === animationType.takeoff ||
      this.animation === animationType.land
    ) {
      // as z approaches 0.5 make legfold approach 1
      // as z approaches 0.0 make legfold approach 0 starting at 0.5

      const t = this.#clamp(this.z * 2); // clamp between 0 and 1
      legFold = t * t * (3 - 2 * t); // smoothstep 0..1
    } else {
      legFold = 0; // idle/walk/turn/flutter default
    }

    const femurLength = LEGS.FEMUR_LEN * scale;
    const tibiaLength = LEGS.TIBIA_LEN * scale;

    // Oscillating gait phase (smooth swing)
    const gaitPhase = Math.sin(
      this.legGaitCounter * LEGS.GAIT_SPEED + this.gaitOffset
    );

    // Tripod logic: A and B alternate
    const tripodA = gaitPhase > 0;
    const tripodB = !tripodA;

    // Helper to draw segmented leg, with dynamic lengths
    function drawLeg(
      baseX: number,
      baseY: number,
      femurA: number,
      tibiaA: number,
      femurLen: number,
      tibiaLen: number
    ) {
      const jointX = baseX + Math.cos(femurA) * femurLen;
      const jointY = baseY + Math.sin(femurA) * femurLen;
      ctx.beginPath();
      ctx.lineWidth = 0.5 * scale;
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(jointX, jointY);
      ctx.lineTo(
        jointX + Math.cos(tibiaA) * tibiaLen,
        jointY + Math.sin(tibiaA) * tibiaLen
      );
      ctx.stroke();
    }

    // Define legs: position, angles for tripod swing
    const legs = [
      {
        x: 0 * scale,
        y: -2 * scale,
        phase: tripodA,
        femurBase: -1.2,
        tibiaBase: -0.5,
      }, // FL
      {
        x: -1 * scale,
        y: -2 * scale,
        phase: tripodB,
        femurBase: -1.7,
        tibiaBase: -2.2,
      }, // ML
      {
        x: -3 * scale,
        y: -2 * scale,
        phase: tripodA,
        femurBase: -2.3,
        tibiaBase: -2.8,
      }, // HL
      {
        x: 0 * scale,
        y: 2 * scale,
        phase: tripodB,
        femurBase: 1.2,
        tibiaBase: 0.5,
      }, // FR
      {
        x: -1 * scale,
        y: 2 * scale,
        phase: tripodA,
        femurBase: 1.7,
        tibiaBase: 2.2,
      }, // MR
      {
        x: -3 * scale,
        y: 2 * scale,
        phase: tripodB,
        femurBase: 2.3,
        tibiaBase: 2.8,
      }, // HR
    ];

    // Thorax center used as retraction target (top‑down anchor)
    const thoraxAnchorX = -2 * scale;
    const thoraxAnchorY = 0;

    // Amount to shorten segments when folded (e.g., to 60% at full fold)
    const femurLenFolded = femurLength * 0.6;
    const tibiaLenFolded = tibiaLength * 0.6;

    // Draw each leg, with folding, retraction and swing logic
    for (const leg of legs) {
      // Legs animate only when walking or turning on ground; reduce swing as they fold
      const legsActive = this.legsShouldAnimate;

      const swingAmp = (legsActive ? 1 : 0) * (1 - legFold); // no swing when folded
      const swing = leg.phase
        ? Math.sin(this.legGaitCounter * 0.8 + this.gaitOffset) * swingAmp
        : 0;

      const femurAngle = leg.femurBase + swing * 0.3;
      const tibiaAngle = leg.tibiaBase + swing * 0.2;

      // Retract the leg base toward thorax anchor as it folds (top‑down look)
      const baseX = this.#lerp(leg.x, thoraxAnchorX, legFold * 0.8);
      const baseY = this.#lerp(leg.y, thoraxAnchorY, legFold * 0.8);

      // Shorten segments as they fold so tips pull closer to body
      const femurLen = this.#lerp(femurLength, femurLenFolded, legFold);
      const tibiaLen = this.#lerp(tibiaLength, tibiaLenFolded, legFold);

      drawLeg(baseX, baseY, femurAngle, tibiaAngle, femurLen, tibiaLen);
    }

    // ---- Draw Abdomen ----
    ctx.fillStyle = legColor;
    ctx.strokeStyle = abdomenColor;
    ctx.lineWidth = 0.6 * scale;
    ctx.beginPath();
    ctx.ellipse(-8 * scale, 0, 6 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ---- Draw Bands ----
    const segmentCount = 4;
    const wiggle = this.#phase(0.3) * 0.8 * scale;

    for (let i = 0; i < segmentCount; i++) {
      const offsetX = -9 * scale + i * 2 * scale + wiggle;
      ctx.fillStyle = legColor;
      ctx.strokeStyle = abdomenColor;
      ctx.beginPath();
      ctx.ellipse(offsetX, 0, 3 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // ---- Draw Head ----
    ctx.fillStyle = abdomenColor;
    ctx.beginPath();
    ctx.ellipse(3 * scale, 0, 2.5 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- Draw Compound Eyes ----
    ctx.fillStyle = eyeColor; // deep black
    ctx.beginPath();
    ctx.ellipse(
      3.7 * scale,
      -1.6 * scale,
      2 * scale,
      1.2 * scale,
      0.4,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(
      3.7 * scale,
      1.6 * scale,
      2 * scale,
      1.2 * scale,
      -0.4,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Optional: highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(4.6 * scale, -1.6 * scale, 0.4 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(4.6 * scale, 1.6 * scale, 0.4 * scale, 0, Math.PI * 2);
    ctx.fill();

    // ---- Draw Antennae ----
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 0.3 * scale;

    ctx.beginPath();
    ctx.moveTo(4 * scale, -1.2 * scale);
    ctx.quadraticCurveTo(2 * scale, 2 * scale, 7 * scale, -3 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(4 * scale, 1.2 * scale);
    ctx.quadraticCurveTo(2 * scale, -2 * scale, 7 * scale, 3 * scale);
    ctx.stroke();

    // ---- Draw Thorax ----
    ctx.fillStyle = legColor;
    ctx.strokeStyle = abdomenColor;
    ctx.lineWidth = scale * 0.8;
    ctx.beginPath();
    ctx.ellipse(-2 * scale, 0, 3.5 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ---- Wing Kinematics (rest vs flapping) ----
    // Resting states: idle, blocked, walk, turn → wings tucked, no motion or blur.
    // Flapping states: flutter, takeoff, fly, land, hover → asymmetric stroke with hamuli coupling.

    // Resting in-body orientations (very slight forward pitch)
    const foreRest = -0.05;
    const hindRest = 0.025;

    // Wing geometry (scales with bee size)
    const foreRX = 8 * scale,
      foreRY = 3 * scale;
    const hindRX = 6 * scale,
      hindRY = 2 * scale;

    // Anchor positions (relative to thorax), tuned earlier
    const foreCX = -7 * scale,
      foreCY = 1.5 * scale;
    const hindCX = -5 * scale,
      hindCY = 1.5 * scale;

    // Simple drawer used for resting wings (no ghosts, no pitch modulation)
    function drawWingAt(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      restingAngle: number,
      sweepAngle: number,
      sideSign: 1 | -1,
      alpha: number
    ) {
      const flapAngle = sideSign > 0 ? sweepAngle : -sweepAngle;
      const rest = sideSign > 0 ? restingAngle : -restingAngle;
      const hingeX = cx + Math.cos(rest) * rx;
      const hingeY = cy + Math.sin(rest) * ry;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = wingColor;
      ctx.strokeStyle = legColor;
      ctx.lineWidth = 0.2 * scale;
      ctx.translate(hingeX, hingeY);
      ctx.rotate(flapAngle);
      ctx.beginPath();
      ctx.ellipse(
        -Math.cos(rest) * rx,
        -Math.sin(rest) * ry,
        rx,
        ry,
        rest,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    const isFlapping =
      this.animation === animationType.flutter ||
      this.animation === animationType.takeoff ||
      this.animation === animationType.fly ||
      this.animation === animationType.land ||
      this.animation === animationType.hover;

    if (!isFlapping) {
      // --- RESTING WINGS ---
      // Small static sweep angles that look tucked near the thorax.
      const foreRestSweep = foreRest; // radians from body axis
      const hindRestSweep = hindRest;

      // LEFT hind & fore (drawn first)
      drawWingAt(
        hindCX,
        hindCY,
        hindRX,
        hindRY,
        hindRest,
        hindRestSweep,
        -1,
        0.3
      );
      drawWingAt(
        foreCX,
        foreCY,
        foreRX,
        foreRY,
        foreRest,
        foreRestSweep,
        -1,
        0.5
      );
      // RIGHT hind & fore
      drawWingAt(
        hindCX,
        -hindCY,
        hindRX,
        hindRY,
        hindRest,
        hindRestSweep,
        1,
        0.3
      );
      drawWingAt(
        foreCX,
        -foreCY,
        foreRX,
        foreRY,
        foreRest,
        foreRestSweep,
        1,
        0.5
      );
    } else {
      // --- FLAPPING WINGS (asymmetric stroke + hamuli coupling) ---
      // Normalized flap phase in [0,1)
      // Use a base speed that varies by state (flutter < fly < takeoff/land)
      const baseFlapHz =
        this.animation === animationType.flutter
          ? WINGS.FLAP_HZ.FLUTTER
          : this.animation === animationType.fly ||
            this.animation === animationType.hover
          ? WINGS.FLAP_HZ.FLY
          : WINGS.FLAP_HZ.TAKEOFF_LAND;
      const t =
        (this.wingFlapCounter * baseFlapHz + this.flapOffset) % (Math.PI * 2);
      const phase01 = t / (Math.PI * 2); // 0..1

      // Asymmetric sweep mapping: fast downstroke (duty ~0.35), slower upstroke
      const duty = WINGS.DUTY;
      const sweep01 =
        phase01 < duty
          ? phase01 / duty // 0→1 during downstroke (fast)
          : 1 - (phase01 - duty) / (1 - duty); // 1→0 during upstroke (slow)

      // Stroke velocity sign: +1 on downstroke, -1 on upstroke (for opacity/blur orientation)
      const strokeDir = phase01 < duty ? 1 : -1;

      // Fore/hind stroke ranges (radians)
      const foreMin = WINGS.FORE_RANGE.MIN,
        foreMax = WINGS.FORE_RANGE.MAX;
      const hindMin = WINGS.HIND_RANGE.MIN,
        hindMax = WINGS.HIND_RANGE.MAX;

      // Hind wing lag & reduced amplitude to mimic hamuli coupling
      const lag = WINGS.LAG;
      const phase01H = (phase01 + lag) % 1;
      const sweep01H =
        phase01H < duty ? phase01H / duty : 1 - (phase01H - duty) / (1 - duty);

      // Map sweep to angles
      const foreWingAngle = this.#lerp(foreMin, foreMax, sweep01);
      const hindWingAngle = this.#lerp(hindMin, hindMax, sweep01H);

      // Visual pitch/shape tweak: wings appear broader on downstroke; thinner & more translucent on upstroke
      const widthMod = strokeDir > 0 ? 1.0 : 0.9; // minor radius scale
      const alphaMod = strokeDir > 0 ? 0.85 : 0.55; // opacity bias

      // Generic wing drawer with hinge rotation + tiny arc blur
      function drawWingSwept(
        cx: number,
        cy: number,
        rx: number,
        ry: number,
        restingAngle: number, // ellipse resting orientation
        sweepAngle: number, // current stroke angle (0.2..1.5, etc.)
        sideSign: 1 | -1, // +1 right, -1 left (mirrors)
        baseAlpha: number
      ) {
        // Current angle for this mirrored side
        const flapAngle = sideSign > 0 ? sweepAngle : -sweepAngle;
        const rest = sideSign > 0 ? restingAngle : -restingAngle;

        // Hinge point on the ellipse rim at the resting orientation
        const hingeX = cx + Math.cos(rest) * rx;
        const hingeY = cy + Math.sin(rest) * ry;

        // Motion blur: draw 2 faint ghosts trailing along the stroke direction
        const ghosts = 2;
        for (let g = ghosts; g >= 0; g--) {
          const ghostT = g / (ghosts + 1); // 2/3, 1/3, 0
          const ghostAlpha = baseAlpha * alphaMod * (1 - ghostT) * 0.6;
          const ghostAngle = flapAngle - strokeDir * ghostT * 0.08; // small behind trail

          ctx.save();
          ctx.globalAlpha = ghostAlpha;
          ctx.fillStyle = wingColor;
          ctx.strokeStyle = legColor;
          ctx.lineWidth = 0.2 * scale;

          // Transform to hinge and rotate by current stroke
          ctx.translate(hingeX, hingeY);
          ctx.rotate(ghostAngle);
          // Simulate pitch by modulating minor radius
          ctx.scale(1, widthMod);

          ctx.beginPath();
          ctx.ellipse(
            -Math.cos(rest) * rx,
            -Math.sin(rest) * ry,
            rx,
            ry,
            rest,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.fill();
          ctx.restore();
        }
      }

      // LEFT hind & fore (behind right side in draw order)
      drawWingSwept(
        hindCX,
        hindCY,
        hindRX,
        hindRY,
        hindRest,
        hindWingAngle,
        -1,
        0.45
      );
      drawWingSwept(
        foreCX,
        foreCY,
        foreRX,
        foreRY,
        foreRest,
        foreWingAngle,
        -1,
        0.55
      );
      // RIGHT hind & fore
      drawWingSwept(
        hindCX,
        -hindCY,
        hindRX,
        hindRY,
        hindRest,
        hindWingAngle,
        1,
        0.35
      );
      drawWingSwept(
        foreCX,
        -foreCY,
        foreRX,
        foreRY,
        foreRest,
        foreWingAngle,
        1,
        0.55
      );
    }

    // ---- Dev Marker ----
    ctx.fillStyle = legColor;
    ctx.fillRect(-1, -1, 2, 2);

    // Return context to whatever it was when we started
    ctx.restore();
  }

  /**
   * Legacy simple renderer kept for reference/testing.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  drawORIGINAL(ctx: CanvasRenderingContext2D) {
    this.#updateBee();

    // Save the context for future reset
    ctx.save();

    // Body (yellow circle)
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffcc00";
    ctx.strokeStyle = "black";
    ctx.fill();
    ctx.stroke();

    // Head segment (black wedge at "top")
    ctx.moveTo(this.x, this.y);
    ctx.beginPath();
    ctx.arc(
      this.x,
      this.y,
      this.size,
      -0.3 + this.theta, // + this.headOffset,
      0.3 + this.theta // + this.headOffset
    ); // head segment (small arc)
    ctx.strokeStyle = "red";
    ctx.stroke();

    // Draw the x y coordinate for testing purposes
    ctx.fillStyle = "black";
    ctx.fillRect(this.x - 1, this.y - 1, 2, 2);

    // Return context to whatever it was when we started
    ctx.restore();
  }

  /**
   * Whether this bee currently has a target point assigned.
   *
   * @returns {boolean} True if both targetX and targetY are defined.
   */
  hasTarget(): boolean {
    return this.targetX !== undefined && this.targetY !== undefined;
  }

  /**
   * Clears the current target and retarget timers.
   */
  clearTarget() {
    this.targetX = this.targetY = undefined;
    this.targetKey = undefined;
    this.targetAge = 0;
    this.arrivedFrames = 0;
    this.targetMaxAge = Math.floor(240 + Math.random() * 360);
  }

  /**
   * Assign a new world-space target for this bee to steer toward.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} [key] - Optional logical key (e.g., "q,r").
   */
  setTarget(x: number, y: number, key?: string) {
    this.targetX = x;
    this.targetY = y;
    this.targetKey = key;
    this.targetAge = 0;
    this.arrivedFrames = 0;
  }

  /**
   * Determines whether a bee should pick a new target due to staleness or loitering.
   *
   * @returns {boolean} True if targetAge exceeds max age or the bee has loitered near the target.
   */
  shouldRetarget(): boolean {
    // Too old or loitering near target too long
    return this.targetAge > this.targetMaxAge || this.arrivedFrames > 90; // ~1.5s
  }

  /**
   * Internal: small steering correction toward current target (ground or air).
   *
   * @private
   * @returns {void}
   */
  #steerTowardTarget(): void {
    if (!this.hasTarget()) return;
    const tx = this.targetX as number,
      ty = this.targetY as number;

    // steer gently toward target

    const angleToTarget = this.#getAngleToTarget(this, { x: tx, y: ty });
    const angleDiff = Math.atan2(
      Math.sin(angleToTarget - this.theta),
      Math.cos(angleToTarget - this.theta)
    );
    const grounded = this.z < 0.3;
    const k =
      grounded &&
      (this.animation === animationType.idle ||
        this.animation === animationType.blocked)
        ? 0
        : this.animation === animationType.fly ||
          this.animation === animationType.walk
        ? 0.02
        : 0.01;
    this.theta += angleDiff * k;

    // arrival tracking
    const dist = Math.hypot(tx - this.x, ty - this.y);
    if (dist < this.size * 1.2) this.arrivedFrames++;
    else this.arrivedFrames = Math.max(0, this.arrivedFrames - 1);

    this.targetAge++;
  }

  /**
   *
   * @private
   * @param from
   * @param to
   * @returns
   */
  #getAngleToTarget(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  /**
   *
   * @private
   */
  #updateBee() {
    this.animationFrameCounter++;
    // this.legGaitCounter++;
    this.wingFlapCounter++;
    this.stateCounter++;
    if (this.minStateFrames > 0) this.minStateFrames--;
    if (this.proximityCooldown > 0) this.proximityCooldown--;

    const wasX = this.x;
    const wasY = this.y;
    const wasTheta = this.theta;

    this.#steerTowardTarget();

    const r = Math.random();
    const rt = Math.random();
    switch (this.animation) {
      case animationType.idle: {
        // Force on ground if state changed quickly
        this.z = 0;

        // on entry: assign a duration if none set
        if (this.stateCounter === 1 || this.stateDuration === 0) {
          this.stateDuration = Math.floor(60 + rt * 120); // 1–3s @60fps
        }

        // small head bob while idle
        // const t = this.#phase(0.08); // slow
        // this.headOffset = t * 0.08;

        // legs parked
        this.legGaitCounter = 0;

        if (this.stateCounter >= this.stateDuration) {
          if (r > 0.15) {
            this.enterState(animationType.walk, Math.floor(180 + rt * 240));
          } else if (r > 0.85) {
            this.enterState(animationType.flutter, Math.floor(10 + rt * 5));
          } else {
            this.enterState(animationType.turn, Math.floor(45 + rt * 60));
          }
        }
        break;
      }

      case animationType.blocked: {
        // Force on ground if state changed quickly
        this.z = 0;

        // Bee is stuck – pause legs, wait a bit, then turn slowly
        if (this.stateCounter === 1) {
          this.stateDuration = Math.floor(40 + rt * 60); // ~0.7–1.6s
        }
        // Legs still while truly blocked
        // (don't advance leg gait extra; natural micro bob from head only)
        // this.headOffset = this.#phase(0.06) * 0.05;

        if (this.stateCounter >= this.stateDuration) {
          if (r > 0.4) {
            this.enterState(animationType.turn, Math.floor(45 + rt * 60));
          } else {
            this.enterState(animationType.takeoff, Math.floor(40 + rt * 40));
          }
        }
        break;
      }

      case animationType.walk: {
        // Force on ground if state changed quickly
        this.z = 0;

        if (this.stateCounter === 1) {
          // duration 3–7s
          this.stateDuration = Math.floor(180 + rt * 240);
        }
        // noise-steered walk
        const n = noise2D(this.noiseOffset, this.animationFrameCounter * 0.004);
        this.theta += n * 0.05;
        this.x += Math.cos(this.theta) * this.speed;
        this.y += Math.sin(this.theta) * this.speed;
        // this.headOffset = this.#phase(0.12) * 0.1;

        // occasional brief flutter during walk
        if (this.stateCounter > 30 && r < 0.005) {
          this.enterState(
            animationType.idle,
            Math.floor(300 + rt * 30) // duration 5-5.5s
          );
          break;
        }
        if (this.stateCounter >= this.stateDuration) {
          // choose idle or turn with small probability of takeoff
          if (r < 0.1) {
            this.enterState(
              animationType.turn,
              Math.floor(30 + rt * 60) //duration 0.5-1.5s
            );
          } else if (r < 0.15) {
            this.enterState(animationType.takeoff, Math.floor(40 + rt * 40));
          } else if (r < 0.35) {
            this.enterState(animationType.flutter, Math.floor(10 + rt * 5));
          } else {
            this.enterState(animationType.idle);
          }
        }
        break;
      }

      case animationType.turn: {
        // Force on ground if state changed quickly
        this.z = 0;

        // gentle noise-driven turn-in-place; legs move if on ground
        const n = noise2D(this.noiseOffset, this.animationFrameCounter * 0.003);
        const turnRate = 0.03 * (this.z < 0.3 ? 1 : 0.4); // slower if in air
        this.theta += n * turnRate;

        // Legs animate only when effectively on ground
        if (this.z < 0.3) {
          // let legGaitCounter advance naturally (already increments each frame)
        } else {
          // in air during turning – tuck legs
          this.legGaitCounter = 0;
        }

        // this.headOffset = this.#phase(0.1) * 0.08;
        if (this.stateCounter >= this.stateDuration) {
          this.enterState(animationType.walk, Math.floor(180 + rt * 240));
        }
        break;
      }

      case animationType.flutter: {
        // Force on ground if state changed quickly
        this.z = 0;

        // light wing motion, no locomotion
        this.legGaitCounter = 0;
        // this.headOffset = this.#phase(0.2) * 0.08;
        if (this.stateCounter >= this.stateDuration) {
          this.enterState(animationType.walk, Math.floor(120 + rt * 180));
        }
        break;
      }

      case animationType.takeoff: {
        // raise z smoothly
        this.z = Math.min(2, this.z + 0.05);
        const n = noise2D(this.noiseOffset, this.animationFrameCounter * 0.004);
        this.theta += n * 0.04;
        if (this.z >= 1.5 || this.stateCounter >= this.stateDuration) {
          this.enterState(animationType.fly, Math.floor(240 + rt * 360));
        }
        break;
      }

      case animationType.fly: {
        // faster motion, slight wander; speed scales with height
        // const n = noise2D(this.noiseOffset, this.animationFrameCounter * 0.006);
        // this.theta += n * 0.08;
        const airSpeed = this.speed * (4.5 + 1.5 * this.z); // ~3.3x at z=2
        this.x += Math.cos(this.theta) * airSpeed;
        this.y += Math.sin(this.theta) * airSpeed;
        // this.headOffset = this.#phase(0.18) * 0.12;

        // softly magnet z toward the nearest layer (1 or 2)
        const targetLayer = this.z < 1.25 ? 1 : 2;
        this.z += (targetLayer - this.z) * 0.05;

        if (this.stateCounter >= this.stateDuration) {
          if (r > 0.5) {
            this.enterState(animationType.hover, Math.floor(45 + rt * 45));
            this.minStateFrames = 10;
          } else {
            this.enterState(animationType.land, Math.floor(40 + rt * 40));
            this.minStateFrames = 12;
          }
        }
        break;
      }

      case animationType.land: {
        // descend smoothly
        this.z = Math.max(0, this.z - 0.05);
        if (this.z <= 0) this.animation = animationType.walk;
        break;
      }

      case animationType.hover: {
        // Move in a small circle around a fixed anchor; do NOT change heading
        const ang = this.stateCounter * 0.15 + this.hoverAngleOffset; // speed of circle

        // Ease-in radius over first 10 frames (0.3→1.0)
        const ease = Math.min(1, this.stateCounter / 10);
        const r = this.hoverRadius * (0.3 + 0.7 * ease);

        this.x = this.hoverAnchorX + Math.cos(ang) * r * this.hoverDirection;
        this.y = this.hoverAnchorY + Math.sin(ang) * r * this.hoverDirection;

        // keep altitude near the current layer (1 or 2) while hovering
        const targetLayer = this.z < 1.25 ? 1 : 2;
        this.z += (targetLayer - this.z) * 0.04;

        if (this.stateCounter >= (this.stateDuration || 120)) {
          if (r > 0.8) {
            this.enterState(animationType.fly, Math.floor(180 + rt * 240));
          } else {
            this.enterState(animationType.land, Math.floor(40 + rt * 40));
          }
        }
        break;
      }
    }

    // --- Gait activation based on actual ground motion ---
    const movedDist = Math.hypot(this.x - wasX, this.y - wasY);
    const turnedAmt = Math.abs(
      Math.atan2(
        Math.sin(this.theta - wasTheta),
        Math.cos(this.theta - wasTheta)
      )
    );

    this.onGround = this.z < 0.3;

    // Persist a boolean for trails and gait
    // this.groundMotion = onGround && (movedDist > 0.05); // ignore turning-only motion
    this.groundMotion = this.onGround && (movedDist > 0.05 || turnedAmt > 0.0);

    // this.legsShouldAnimate = this.onGround && (movedDist > 0.05 || turnedAmt > 0.02);
    this.legsShouldAnimate = this.groundMotion;

    if (this.legsShouldAnimate) {
      this.legGaitCounter++;
    }

    // update previous motion snapshot
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevTheta = this.theta;
  }

  // Helper to handle entering new states
  enterState(next: animationType, duration?: number) {
    // If we're already in this state, don't re-init anchors/counters every frame.
    if (next === this.animation) {
      // Optional: allow updating duration if you’ve passed one
      if (typeof duration === "number") this.stateDuration = duration;
      return;
    }

    this.animation = next;
    this.stateCounter = 0;
    if (typeof duration === "number") this.stateDuration = duration; //frames

    // Give a short grace period so proximity checks don't immediately re-block
    switch (next) {
      case animationType.flutter:
        this.proximityCooldown = 30; // ~0.5s at 60fps
        break;
      case animationType.takeoff:
        this.proximityCooldown = 45; // a bit longer to let z rise past ground threshold
        break;
      case animationType.hover: {
        this.proximityCooldown = 30;

        this.hoverAnchorX = this.x;
        this.hoverAnchorY = this.y;
        // small, size- and height-aware radius
        const baseR = Math.max(3, this.size * 0.15);
        this.hoverRadius = baseR * (1 + 0.3 * Math.min(2, Math.max(0, this.z)));
        //Generate 1 or -1 with 50% chance
        this.hoverDirection = Math.random() < 0.5 ? -1 : 1;
        this.hoverAngleOffset = Math.random() * Math.PI * 2;
        break;
      }
      case animationType.land:
        this.proximityCooldown = 20;
        break;
      default:
        // leave as-is
        break;
    }
  }

  /**
   * Return the phase of the current animation frame
   * Can be modified by inputs of multiplier and offset
   *
   * @private
   * @param {number} multiplier Multiply the frames
   * @param {number} offset Add frames offset
   * @returns {number} -1 -> 1 phase
   */
  #phase(multiplier: number, offset: number = 0): number {
    // frame-based phase for smooth sine waves
    return Math.sin(this.animationFrameCounter * multiplier + offset);
  }

  /**
   * Linear interpolation (lerp):
   * Smoothly blends from value `a` to value `b` by fraction `t` (0..1).
   *
   * t=0 returns a;
   * t=1 returns b;
   * values in between slide along the straight line between a and b.
   *
   * Used here to:
   *  - move leg bases toward the thorax as they fold (top-down look),
   *  - shorten femur/tibia lengths during fold,
   *  - blend angles from ground-splayed to hanging-down.
   * Formula: lerp(a,b,t) = a + (b - a) * t
   *
   * @private
   * @param {number} a First value
   * @param {number} b Second value
   * @param {number} t fraction 0->1 between the two values
   * @returns {number} the calulated linear value
   */
  #lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   *
   * @private
   * @param v
   * @returns {number}
   */
  #clamp(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  /**
   *
   * @private
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw into.
   */
  #devStats(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = `${this.size / 2}px Arial`;
    ctx.textAlign = "right";
    ctx.fillText(
      this.animation,
      this.x + this.size / 2,
      this.y + this.size * 1.5
    );
    ctx.restore();
  }
}

/**
 * Extends Map and provides methods for handling Honeycomb cells specifics
 * like axial coordinates
 */
class HoneycombMap extends Map<string, Honeycomb> {
  /**
   * Turn axial cooridnates into string key
   * @param {number} q - Q axial coordinate
   * @param {number} r - R axial coordinate
   * @returns {string} They key used for input axial coordinate
   */
  static toKey(q: number, r: number): string {
    return `${q},${r}`;
  }

  /**
   * Get a Honeycomb cell at specific axial coordinates
   *
   * @param {number} q - Q axial coordinate
   * @param {number} r - R axial coordinate
   * @returns {Honeycomb | undefined} Return a matching Honeycomb cell or undefined if not found
   */
  getAt(q: number, r: number): Honeycomb | undefined {
    return this.get(HoneycombMap.toKey(q, r));
  }

  /**
   * Adds a new Honeycomb cell to the Map. Automatically generates the key
   * based on Honeycomb cell axial coordinates.
   * If an element at the same coordinates already exists, the element will be updated.
   *
   * @param {Honeycomb} value A Honeycomb cell to add to the map
   * @returns {HoneycombMap} A reference to the map
   */
  setHC(value: Honeycomb): this {
    return this.setAt(value.q, value.r, value);
  }

  /**
   * Adds a new Honeycomb cell to the Map at input coordinates as the key.
   * If an element at the same coordinates already exists, the element will be updated.
   *
   * @param {number} q - Q axial coordinate
   * @param {number} r - R axial coordinate
   * @param {Honeycomb} value A Honeycomb cell to add to the map
   * @returns {HoneycombMap} A reference to the map
   */
  setAt(q: number, r: number, value: Honeycomb): this {
    return this.set(HoneycombMap.toKey(q, r), value);
  }

  /**
   * Check if a Honeycomb cell exists at specific axial coordinates
   *
   * @param {number} q - Q axial coordinate
   * @param {number} r - R axial coordinate
   * @returns {boolean} Return true if a matching Honeycomb cell or false if not found
   */
  hasAt(q: number, r: number): boolean {
    return this.has(HoneycombMap.toKey(q, r));
  }

  /**
   * Removes a Honeycomb cell from the map
   *
   * @param {number} q - Q axial coordinate
   * @param {number} r - R axial coordinate
   * @returns {boolean} true if an element in the Map existed and has been removed, or false if the element does not exist
   */
  deleteAt(q: number, r: number): boolean {
    return this.delete(HoneycombMap.toKey(q, r));
  }

  /**
   * Get a random Honeycomb cell from the map
   *
   * @returns {Honeycomb} Return a random Honeycomb cell from the map
   */
  getRandom(): Honeycomb {
    const index = Math.floor(Math.random() * this.size);
    return Array.from(this.values())[index];
  }
}
