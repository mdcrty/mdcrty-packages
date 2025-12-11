"use client"; // Must be client, extensive use of client only functions in react

import { useCallback, useEffect, useRef, useState } from "react";
import { useSourceCode } from "./source-code/SourceCodeContext";

// Outside classes (module-level)
const KANJI = "日";
const KATAKANA = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";
// "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン";
const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZç";
const NUMS = "0123456789";
const SYMBOLS = ':・."=*+-<>!@#$%&?*♠♣♥♦★☎☹☺☯☮♻♚♛♜♝♞♟𓃾';

let CHAR_POOL = KANJI + KATAKANA + LATIN + NUMS;
// amplify pool so symbols are rarer
CHAR_POOL = CHAR_POOL.repeat(3) + SYMBOLS;
const CHAR_POOL_LEN = CHAR_POOL.length;

// Toggle for pixel-snapped text on low-DPI displays
let CRISP_TEXT = false;

// In Symbol: remove per-instance building; use CHAR_POOL/CHAR_POOL_LEN
// this.text = CHAR_POOL.charAt((Math.random() * CHAR_POOL_LEN) | 0);

/**
 * @property {boolean} autoRun True to run app on load
 * @property {number} fontSize Size of font in pixels
 * @property {number} fps Frames per second of animation
 * @property {number} alpha 0->1 level of alpha for fade
 * @property {number} variabilityOfStart 0->1
 * @property {number} numberOfColumnOverlaps Number of drops of code per column
 * @property {number} changeCharacterFrequency How many frames run before a character changes
 * @property {number} changeCharacterDuration How many characters after start should continue changing
 * @property {number} frequencyOfRandomCellsInColumns 0->1 Frequency of random cell columns
 * @property {number} numberOfRandomCellsInColumns Number of random cells that change per column
 */
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
  staticMessages?: Array<string>;
  onShowSourceCode?: () => void;
  onHideSourceCode?: () => void;
};

type ResolvedDigitalRainOptions = Required<
  Omit<
    DigitalRainOptions,
    "staticMessages" | "onShowSourceCode" | "onHideSourceCode"
  >
> & {
  staticMessages?: Array<string>;
};

type AnimationOptions = Omit<ResolvedDigitalRainOptions, "autoRun">;

/**
 * Default Component properties incase they are not supplied
 */
const staticDefaultComponentProps: ResolvedDigitalRainOptions = {
  autoRun: true,
  fontSize: 16,
  fps: 20, // Slower than you might think due to recent efficiency gains
  alpha: 0.02,
  variabilityOfStart: 0.98,
  numberOfColumnOverlaps: 2,
  changeCharacterFrequency: 4,
  changeCharacterDuration: 15,
  frequencyOfRandomCellsInColumns: 1,
  numberOfRandomCellsInColumns: 6,
};

/**
 * React node that runs the digital rain mini app
 *
 * @param {DigitalRainOptions} props The component properties
 * @returns React.ReactNode
 */
export default function DigitalRain(props: Readonly<DigitalRainOptions> = {}) {
  const { onShowSourceCode, onHideSourceCode, ...componentProps } = props;
  const { showSourceCode, hideSourceCode } = useSourceCode();

  const showSource = onShowSourceCode ?? showSourceCode;
  const hideSource = onHideSourceCode ?? hideSourceCode;

  // Merge provided props with defaults
  const mergedProps: ResolvedDigitalRainOptions = {
    ...staticDefaultComponentProps,
    ...componentProps,
  };

  // Default animation options provided from React Node
  const { autoRun, ...defaultAnimationOptions } = mergedProps;

  //Default display items are all hidden
  const defaultDisplayItems = {
    systemFailure: false,
    animationOptionsDefault: false,
    animationOptions: false,
    help: false,
    helpHelp: false,
  };

  // Create all references
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | null>(null);
  const effectRef = useRef<Effect | null>(null);

  const themeColorRef = useRef<string | null>(null);

  // Set states for application
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [firstRunComplete, setFirstRunComplete] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(autoRun);
  const [inputOpen, setInputOpen] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("~ % ");
  const [displayItems, setDisplayItems] = useState(defaultDisplayItems);
  const [animationOptions, setAnimationOptions] = useState<AnimationOptions>(
    defaultAnimationOptions
  );

  // Set default CSS Properties for display items
  const centreBoxStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: " translate(-50%, -50%)",
    color: "#0aff0a",
    fontFamily: "monospace",
    fontSize: animationOptions.fontSize,
    padding: "0.5em",
    backgroundColor: "#000",
    border: "2px solid #0aff0a",
  };

  // Helper to set theme-color to black and remember previous
  const setThemeColorToBlack = () => {
    if (typeof document === "undefined") return;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
      if (themeColorRef.current === null) themeColorRef.current = "";
    } else {
      if (themeColorRef.current === null) {
        themeColorRef.current = meta.getAttribute("content");
      }
    }
    // set body background color to black
    if (document.querySelector("body") !== null) {
      document.querySelector("body")!.style.backgroundColor = "#000000";
    }
    meta.setAttribute("content", "#000000");
  };

  // Helper to set theme-color back to original
  const restoreThemeColor = () => {
    if (typeof document === "undefined") return;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    const prev = themeColorRef.current;
    if (prev === null) return; // nothing to restore or we weren't the ones to change it
    if (meta) {
      if (prev === "") {
        // We created the tag originally; remove it.
        meta.parentElement?.removeChild(meta);
      } else {
        meta.setAttribute("content", prev);
      }
    }
    // remove background color on body element
    if (document.querySelector("body") !== null) {
      document.querySelector("body")!.style.backgroundColor = "";
    }

    themeColorRef.current = null;
  };

  // Update one field in the state
  const optionChange = (field: string, value: number) => {
    setAnimationOptions((prevState) => {
      return { ...prevState, [field]: value };
    });
  };

  // Update display items, set all others to false by default
  const displayItemChange = (item: string, show: boolean) => {
    setDisplayItems((prev) => {
      const next: typeof prev = { ...prev };
      for (const key in next)
        next[key as keyof typeof next] = key === item ? show : false;
      return next;
    });
  };

  // Set all display items to false
  const displayItemClear = () => {
    setDisplayItems(defaultDisplayItems);
  };

  // Animation function as callback
  const startAnimation = useCallback(() => {
    // Get the canvas reference and 2d context and verify they exist
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Unpack the FPS from all other animation options passed to the Effect object constructor
    const { fps, ...allOptions } = animationOptions;

    // Animation variables
    let lastTime = 0;
    // divide 1000 as ms is base time in JS/TS
    const nextFrame = 1000 / fps;
    let timer = 0;

    // HiDPI support: get devicePixelRatio and logical canvas size
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.floor(canvas.width / dpr);
    const logicalHeight = Math.floor(canvas.height / dpr);

    // Enable crisp text snapping on standard DPI; keep off on HiDPI to avoid wobble
    CRISP_TEXT = dpr === 1;

    // Set the effect object as a reference variable so it can be referenced outside this callback
    effectRef.current = new Effect({
      canvasWidth: logicalWidth,
      canvasHeight: logicalHeight,
      ...allOptions,
    });

    // Stable ctx state (unchanged until options change)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = effectRef.current.fontSize + "px monospace";

    setThemeColorToBlack();

    // Map logical CSS pixels to device pixels for HiDPI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Animation function runs each animation cycle in JS. Runs more frequently than the FPS
    function animate(timeStamp: number) {
      // Verify context, canvas and effect.current
      if (ctx === null || canvas === null || effectRef.current === null) return;

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
        // Draw the next frame
        ctx.save();
        ctx.scale(-1, 1);
        effectRef.current.draw(ctx);
        ctx.restore();
        timer -= nextFrame;
      }

      // set the current request frame to the animation ref so it can be used outside this callback
      animationRef.current = requestAnimationFrame(animate);
    }

    // Start the animation
    animate(0);
    setIsRunning(true);

    //Provide the animation options to the callback
  }, [animationOptions]);

  // Stop animation does what it says
  const stopAnimation = () => {
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
  const clearAnimation = () => {
    // Validate the canvas ref and 2d context
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Effect to handle the canvas size and resizing window
  useEffect(() => {
    // Validate the canvas ref and
    if (canvasRef.current === null) return;
    const canvas = canvasRef.current;

    const setSize = () => {
      // Set the canvas to fit the entire window (HiDPI aware)
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    // Set the canvas to fit the entire window
    setSize();

    // Function to handle window resize
    const handleResize = () => {
      // Validate the canvas ref and the effect ref
      if (canvasRef.current === null || effectRef.current === null) return;

      // Set the canvas to fit the entire window
      setSize();

      const canvas = canvasRef.current;

      // Set HiDPI on resize
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Set font size again so characters don't shrink to half size
        ctx.font = effectRef.current.fontSize + "px monospace";

        // Transform the context to match DPR scale
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Call resize with logical CSS pixel dimensions
      effectRef.current.resize(window.innerWidth, window.innerHeight);
    };

    // Add the handler to the resize event
    window.addEventListener("resize", handleResize);

    return () => {
      // remove the event listner and stop and clear the animation on cleanup
      window.removeEventListener("resize", handleResize);
    };
    // Make the animation restart on any of the following changes
  }, []);

  // Effect: first run and option-change restarts (no cleanup here)
  useEffect(() => {
    // First run
    if (autoRun && !isRunning && !firstRunComplete) {
      startAnimation();
      setFirstRunComplete(true);
      return;
    }
    // Option changes while running => restart, but do not clear meta/canvas here
    if (isRunning) {
      stopAnimation();
      // NOTE: intentionally do NOT call clearAnimation(); preserves current frame if caller wants to freeze
      startAnimation();
    }
  }, [firstRunComplete, isRunning, startAnimation, autoRun]);

  // Effect: unmount-only cleanup
  useEffect(() => {
    return () => {
      // clear the animation when the node is deloaded (unmount)
      stopAnimation();
      clearAnimation();
      restoreThemeColor();
    };
  }, []);

  // Effect to toggle meta tag based on visibility
  useEffect(() => {
    if (isVisible) {
      setThemeColorToBlack();
    } else {
      restoreThemeColor();
    }
    // no cleanup needed; restoration happens when visibility flips or on unmount below
  }, [isVisible]);

  // Handle when enter or escape is pressed on the input element
  const handleInputKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    // Validate input ref
    const input = inputRef.current;
    if (!input) return;

    // Enter to submit the input code
    if (ev.key === "Enter") {
      input.blur();
      handleInput();
    }

    // Escape hides the input
    if (ev.key === "Escape") {
      input.blur();
    }
  };

  //Handle the input and verify the code is correct before calling the function
  const handleInput = () => {
    // Validate the input ref
    const input = inputRef.current;
    if (!input) return;

    // Get the value, must match ~ % to be valid
    const value = input.value.match(/^~ % (.*)$/i);

    // Trim the values[1] of all head and tail white space
    const trimmedValue = value && value[1].trim();

    // If no valid input found reset the input and end here
    if (!trimmedValue) {
      setInputValue("~ % ");
      return;
    }

    // Validate the command using regex .test
    switch (true) {
      // Quit command
      case /^quit$/i.test(trimmedValue):
        // if running, stop animation
        if (isRunning) {
          stopAnimation();
        }
        // hide the code, clear the animation, hide all items
        setIsVisible(false);
        clearAnimation();
        displayItemClear();

        // Set the input to default
        setInputValue("~ % ");
        break;
      // SYSTEM FAILURE command
      case /^system failure$/i.test(trimmedValue):
        // if running, stop animation
        if (isRunning) {
          stopAnimation();
          // display the SYSTEM FAILURE item
          displayItemChange("systemFailure", true);
        }

        // Set the input to default
        setInputValue("~ % ");
        break;
      // set command for option
      case /^set/i.test(trimmedValue):
        setOptionCommand(trimmedValue);

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Show command for show item
      case /^show/i.test(trimmedValue):
        showItemCommand(trimmedValue);

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Help command
      case /^help$/i.test(trimmedValue):
        displayItemChange("help", true);

        // Set the input to default
        setInputValue("~ % ");
        break;
      // HELP HELP command
      case /^HELP HELP$/.test(trimmedValue):
        displayItemChange("helpHelp", true);

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Hide command
      case /^hide$/i.test(trimmedValue):
        displayItemClear();
        hideSource();

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Dipsplay the source code
      case /^sauce$/i.test(trimmedValue):
        // call context function to display source code in other ReactNode
        showSource();

        //Stop the animation
        if (isRunning) {
          stopAnimation();
        }
        // Hide the entire animation and all items
        setIsVisible(false);
        displayItemClear();
        clearAnimation();

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Reset command to reset all animation options, starts animation again
      case /^reset$/i.test(trimmedValue):
        setAnimationOptions(defaultAnimationOptions);

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Run command starts the animation again
      case /^run$/i.test(trimmedValue):
        // call context function to hide the source code in other ReactNode
        hideSource();

        // Start the animation
        if (!isRunning) {
          // Clear display items
          displayItemClear();
          // Make sure code is visible
          setIsVisible(true);
          // start the animation
          startAnimation();
        }

        // Set the input to default
        setInputValue("~ % ");
        break;
      // Any input that isn't matched just clear
      default:
        // Set the input to default
        setInputValue("~ % ");
        break;
    }
  };

  // Function sets the animation option if valid
  const setOptionCommand = (option: string) => {
    // Split out all input commands
    const [command, key, value, ...other] = option.split(" ");

    // if there are too many inputs, no command, no key, no value end here
    if (other.length > 0 || !command || !key || !value) return;

    // Check if command is `set`
    if (/^set$/.test(command) === false) return;

    // Check if key existis on animationOptions object and
    // returns if it doesn't
    if (!Object.keys(animationOptions).includes(key)) return;

    // Parse the input to a number
    const parsedValue = parseInt(value, 10);
    // If not a number end here
    if (isNaN(parsedValue)) return;

    // All checked, now you can change the value
    optionChange(key, parsedValue);
  };

  // Function sets which item to display if valid
  const showItemCommand = (item: string) => {
    // Split out all input commands
    const [command, value, ...other] = item.split(" ");

    // if there are too many inputs, no command, no value end here
    if (other.length > 0 || !command || !value) return;

    // Check if command is `show`
    if (/^show$/.test(command) === false) return;

    // Check if key existis on animationOptions object and
    // returns if it doesn't
    if (!Object.keys(displayItems).includes(value)) return;

    // All checked, now show the item
    displayItemChange(value, true);
  };

  // Effect used to adjust the width of the input to match the text
  useEffect(() => {
    // Validate input ref
    const input = inputRef.current;
    if (!input) return;

    // Create measuring span element and hide it
    const measureSpan = document.createElement("span");
    measureSpan.style.visibility = "hidden";
    measureSpan.style.position = "absolute";
    measureSpan.style.whiteSpace = "pre";
    measureSpan.style.fontFamily = "monospace";
    measureSpan.style.fontSize = `${animationOptions.fontSize}px`;
    document.body.appendChild(measureSpan);

    // Update width function
    function updateWidth() {
      // Validate input ref
      if (!input) return;

      // Use input value or placeholder
      measureSpan.textContent = input.value || "x";

      // Get width of element
      const textWidth = measureSpan.getBoundingClientRect().width;

      // Add padding (1em) to the text width + border width
      const paddingWidth = animationOptions.fontSize * 1; // 0.5em on each side
      const borderWidth = 4; //4px for border width

      // Apply widths to input
      input.style.width = `${textWidth + paddingWidth + borderWidth}px`;
    }

    // Initial adjustment
    updateWidth();

    // Add event listeners
    input.addEventListener("input", updateWidth);

    return () => {
      // Remove event listner and measurement span on cleanup
      input.removeEventListener("input", updateWidth);
      document.body.removeChild(measureSpan);
    };
  }, [animationOptions.fontSize, inputRef, inputOpen]);

  // Effect used to detect ~ key on the entire window
  useEffect(() => {
    // function for key down handling
    const handleKeyDown = (ev: KeyboardEvent) => {
      // Check if input is open and ~ is pressed then open input
      if (ev.key === "~" && !inputOpen) {
        setInputOpen(true);
      }
    };

    // Add event listner to entire window
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      // Remove event listner on cleanup
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputOpen]);

  // Effect is used focus the input on opening,
  // seperate and with 0 sec delay due to strange behaviour in some browsers
  useEffect(() => {
    // Timer reference for clean up
    let timer: number;

    //Validate input ref
    const input = inputRef.current;
    if (inputOpen && input) {
      // Use setTimeout to ensure the DOM has updated
      timer = window.setTimeout(() => {
        // Focus the input and set cursor to end by default
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    }
    return () => {
      // Clear the timer just in case on cleanup
      clearTimeout(timer);
    };
  }, [inputOpen, inputRef]);

  // Output the ReactNode HTML
  return (
    <>
      {/* Div to encompas entire window for digital rain effect */}
      <div
        style={{
          display: isVisible ? "block" : "none",
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
          position: "fixed",
          top: "0",
          left: "0",
          zIndex: 9999998,
        }}
      >
        {/* SYSTEM FAILURE ITEM */}
        {displayItems.systemFailure && (
          <div style={centreBoxStyle}>SYSTEM FAILURE</div>
        )}
        {/* Default animation options item */}
        {displayItems.animationOptionsDefault && (
          <div style={centreBoxStyle}>
            <table style={{ borderSpacing: "0.5em" }}>
              <tbody>
                {Object.keys(defaultAnimationOptions).map((key) => {
                  return (
                    <tr key={key}>
                      <td style={{ borderBottom: "1px solid #0aff0a" }}>
                        {key}
                      </td>
                      <td>:</td>
                      <td
                        style={{
                          textAlign: "right",
                          borderBottom: "1px solid #0aff0a",
                        }}
                      >
                        {
                          defaultAnimationOptions[
                            key as keyof typeof defaultAnimationOptions
                          ]
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Current animation options item */}
        {displayItems.animationOptions && (
          <div style={centreBoxStyle}>
            <table style={{ borderSpacing: "0.5em" }}>
              <tbody>
                {Object.keys(animationOptions).map((key) => {
                  return (
                    <tr key={key}>
                      <td style={{ borderBottom: "1px solid #0aff0a" }}>
                        {key}
                      </td>
                      <td>:</td>
                      <td
                        style={{
                          textAlign: "right",
                          borderBottom: "1px solid #0aff0a",
                          color:
                            animationOptions[
                              key as keyof typeof animationOptions
                            ] !==
                            defaultAnimationOptions[
                              key as keyof typeof defaultAnimationOptions
                            ]
                              ? "#FFF"
                              : "inherit",
                        }}
                      >
                        {animationOptions[key as keyof typeof animationOptions]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Joke help menu item */}
        {displayItems.help && (
          <div style={centreBoxStyle}>THERE IS NO HELP!</div>
        )}
        {/* Actual help menu item */}
        {displayItems.helpHelp && (
          <div style={centreBoxStyle}>
            Usage:
            <br />
            <br />
            <table>
              <tbody style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                <tr>
                  <td>~ % run</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Run the digital rain code
                  </td>
                </tr>
                <tr>
                  <td>~ % help</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Display message &quot;THERE IS NO HELP!&quot;
                  </td>
                </tr>
                <tr>
                  <td>~ % HELP&nbsp;HELP</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Display this current menu
                  </td>
                </tr>
                <tr>
                  <td>~ % set &lt;option&gt; &lt;value&gt;</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Set specific animation &lt;option&gt;
                  </td>
                </tr>
                <tr>
                  <td>~ % show &lt;item&gt;</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Show specific dialogue &lt;item&gt;
                  </td>
                </tr>
                <tr>
                  <td>~ % show animationOptions</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Show current set animation options
                  </td>
                </tr>
                <tr>
                  <td>~ % show animationOptionsDefault</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Show default set animation options that
                    <br />
                    are set when ~ % reset command is used
                  </td>
                </tr>
                <tr>
                  <td>~ % hide</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Hide any open dialogue &lt;item&gt;
                  </td>
                </tr>
                <tr>
                  <td>~ % reset</td>
                  <td style={{ paddingLeft: "1em" }}>
                    Reset all animation options to default
                  </td>
                </tr>
                <tr>
                  <td>~ % quit</td>
                  <td style={{ paddingLeft: "1em" }}>Quit the code</td>
                </tr>
                <tr>
                  <td>~ % system failure</td>
                  <td style={{ paddingLeft: "1em" }}>Cause system to fail!</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {/* The canvas element used to draw the digital rain */}
        <canvas
          style={{ display: "block", width: "100%", height: "100%" }}
          ref={canvasRef}
          className="digitalRain"
        />
      </div>
      {/* The code input element, outside the div and 
      can be displayed even when the animation isn't visible */}
      <input
        ref={inputRef}
        onBlur={() => setInputOpen(false)}
        value={inputValue}
        onKeyDown={handleInputKeyDown}
        onChange={(ev) => setInputValue(ev.currentTarget.value)}
        style={{
          outline: "none",
          minWidth: "1px",
          color: "#0aff0a",
          fontFamily: "monospace",
          fontSize: animationOptions.fontSize,
          position: "fixed",
          display: inputOpen ? "inherit" : "none",
          top: "50%",
          left: "50%",
          transform: " translate(-50%, -50%)",
          padding: "0.5em",
          backgroundColor: "#000",
          border: "2px solid #0aff0a",
          zIndex: 9999999,
        }}
      />
    </>
  );
}

/**
 * Symbol class represents 1 symbol on the page
 */
class Symbol {
  x: number;
  y: number;
  fontSize: number;
  text: string;
  alpha: number;
  changeCharacterFrequency: number;
  changeCharacterDuration: number;
  fixedChar?: string;

  constructor(
    x: number,
    y: number,
    fontSize: number,
    alpha: number,
    changeCharacterFrequency: number,
    changeCharacterDuration: number,
    fixedChar?: string
  ) {
    // Set all inputs to the local properties
    this.x = x;
    this.y = y;
    this.fontSize = fontSize;
    this.text = "";
    this.alpha = alpha;
    this.changeCharacterFrequency = changeCharacterFrequency;
    this.changeCharacterDuration = changeCharacterDuration;
    this.fixedChar = fixedChar;
  }

  /**
   * Draws a frame for each symbol upon call based on the objects input parameters
   *
   * @param {CanvasRenderingContext2D} ctx The canvas context used to draw the symbol
   * @param {number} currentCell The current active cell in the column for the purpose of the rain drop
   * @param {boolean} changeCharacter Whether the character should change at the input change rate or remain static
   */
  draw(
    ctx: CanvasRenderingContext2D,
    currentCell: number = 0,
    changeCharacter: boolean = false
  ) {
    // Ensure fixed characters are always set and never randomised
    if (this.fixedChar !== undefined && this.text !== this.fixedChar) {
      this.text = this.fixedChar;
    }

    // If drawing the current cell in the column, or the symbol is a change character
    // and we have reached the frequency of change number
    // get a random character from the set dicitonary of characters
    // Only randomise if this is NOT a fixed character
    if (
      (this.fixedChar === undefined && currentCell === this.y) ||
      (changeCharacter && currentCell % this.changeCharacterFrequency === 0)
    ) {
      // Random character selection
      this.text = CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL_LEN));
    }

    // Set color based on whether it's the first frame
    if (currentCell === this.y) {
      // fill the cell with black background
      ctx.fillStyle = `rgb(0,0,0)`;
      ctx.fillRect(
        -(this.x + 0.5) * this.fontSize, // Negative as canvas is flipped horrizontally each frame
        (this.y - 0.5) * this.fontSize,
        this.fontSize,
        this.fontSize
      );

      // Set first character to white
      ctx.fillStyle = "#FFF";
      // Draw the character
      if (this.fixedChar !== undefined) {
        drawCharacterUnflipped(
          ctx,
          this.text,
          this.x * this.fontSize,
          this.y * this.fontSize
        );
      } else {
        drawCharacter(
          ctx,
          this.text,
          this.x * this.fontSize,
          this.y * this.fontSize
        );
      }
    } else if (currentCell === this.y + 1) {
      if (this.fixedChar !== undefined) {
        // If cell is fixecd character then it stays white
        ctx.fillStyle = "#FFF";
        drawCharacterUnflipped(
          ctx,
          this.text,
          this.x * this.fontSize,
          this.y * this.fontSize
        );
      } else {
        // If cell is 1 after the current cell draw green
        // Set the character to green
        ctx.fillStyle = "#0aff0a";
        // Draw the symbol
        drawCharacter(
          ctx,
          this.text,
          this.x * this.fontSize,
          this.y * this.fontSize
        );
      }
    } else if (
      this.fixedChar === undefined &&
      // CHANGE CHARACTER DRAW
      changeCharacter && // if the symbol is set to change character, and
      currentCell > this.y && // it's more than 2 after the current cell, and
      currentCell < this.y + this.changeCharacterDuration && // current cell is isn't further ahead than changeCharacterDuration and
      currentCell % this.changeCharacterFrequency === 0 // the current change frequency count has been met
    ) {
      // Draw a change character
      // fill the cell with black background
      ctx.fillStyle = `rgb(0,0,0)`;
      ctx.fillRect(
        -(this.x + 0.5) * this.fontSize, // Negative as canvas is flipped horrizontally each frame
        (this.y - 0.5) * this.fontSize,
        this.fontSize,
        this.fontSize
      );

      // Set the character to green
      ctx.fillStyle = "#0aff0a";
      // Draw the symbol
      drawCharacter(
        ctx,
        this.text,
        this.x * this.fontSize,
        this.y * this.fontSize
      );
    } else {
      // All remaining cells behind and infront of current
      // Draw over with a rectangle of black at set alpha amount
      ctx.fillStyle = `rgba(0, 0, 0, ${this.alpha})`;
      ctx.fillRect(
        -(this.x + 0.5) * this.fontSize, // Negative as canvas is flipped horrizontally each frame
        (this.y - 0.5) * this.fontSize,
        this.fontSize,
        this.fontSize
      );
    }
  }
}

/**
 * Column class represents a column of symbols
 */
class Column {
  x: number;
  fontSize: number;
  canvasHeight: number;
  alpha: number;
  variabilityOfStart: number;
  changeCharacterFrequency: number;
  changeCharacterDuration: number;
  frequencyOfRandomCellsInColumns: number;
  numberOfRandomCellsInColumns: number;
  currentCell: number;
  symbols: Array<Symbol>;
  randomCells: Set<number>;
  fixedCharacterMap?: Map<string, string>;

  constructor(
    x: number,
    fontSize: number,
    canvasHeight: number,
    alpha: number,
    variabilityOfStart: number,
    changeCharacterFrequency: number,
    changeCharacterDuration: number,
    frequencyOfRandomCellsInColumns: number,
    numberOfRandomCellsInColumns: number,
    fixedCharacterMap?: Map<string, string>
  ) {
    // Set all inputs to local properties
    this.x = x;
    this.fontSize = fontSize;
    this.canvasHeight = canvasHeight;
    this.alpha = alpha;
    this.variabilityOfStart = variabilityOfStart;
    this.changeCharacterFrequency = changeCharacterFrequency;
    this.changeCharacterDuration = changeCharacterDuration;
    this.frequencyOfRandomCellsInColumns = frequencyOfRandomCellsInColumns;
    this.numberOfRandomCellsInColumns = numberOfRandomCellsInColumns;
    this.currentCell = 0;
    this.symbols = [];
    this.randomCells = new Set<number>();
    this.fixedCharacterMap = fixedCharacterMap;

    //Run private initialiser method
    this.#initialiser();
  }

  /**
   * Private function to initialise the column
   */
  #initialiser() {
    // calculate the canvas height and number of require symbols in the column
    for (let i = 0; i < this.canvasHeight / this.fontSize + 1; i++) {
      // Set to 1 more than the height divided by font size for a slight overlap

      // Get the key of this character.
      const key = `${this.x},${i}`;
      // Test it against the fixed character map
      const fixedChar = this.fixedCharacterMap?.get(key) ?? undefined;

      // add the Symbol Object to the column
      this.symbols[i] = new Symbol(
        this.x,
        i, // the Y coordinate
        this.fontSize,
        this.alpha,
        this.changeCharacterFrequency,
        this.changeCharacterDuration,
        fixedChar
      );
    }
  }

  /**
   * Draws a frame for each column upon call based on the objects input parameters
   *
   * @param {CanvasRenderingContext2D} ctx The canvas context used to draw the symbol
   */
  draw(ctx: CanvasRenderingContext2D) {
    // Loop over all symbols in column
    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      // If there are random cells in the column and the current cell is a random cell
      if (this.randomCells.has(i)) {
        // Trigger the Symbols draw method and mark it's character for randomisation
        symbol.draw(ctx, this.currentCell, true);
      } else {
        // Trigger the Symbols draw method
        symbol.draw(ctx, this.currentCell, false);
      }
    }

    // If the if the current cell is beyond the edge of the canvas
    // And a random number is triggered (variabilityOfStart)
    // Reset the column
    if (
      this.currentCell * this.fontSize > this.canvasHeight &&
      Math.random() > this.variabilityOfStart
    ) {
      // Set current cell as 0
      this.currentCell = 0;

      // Generate a new alotment of random cells or none at all
      this.randomCells = new Set(
        getRandomNumbersOrNull(
          this.frequencyOfRandomCellsInColumns,
          this.symbols.length,
          this.numberOfRandomCellsInColumns
        )
      );
    } else {
      // Otherwise progress the current cell by 1
      this.currentCell += 1;
    }
  }
}

/**
 * Effect class represents the effect of the digital rain in it's entirety
 * All columns are contained within this class and all symbols are contained in each column
 */
class Effect {
  canvasWidth: number;
  canvasHeight: number;
  fontSize: number;
  alpha: number;
  variabilityOfStart: number;
  numberOfColumnOverlaps: number;
  changeCharacterFrequency: number;
  changeCharacterDuration: number;
  frequencyOfRandomCellsInColumns: number;
  numberOfRandomCellsInColumns: number;
  columns: Array<Column>;
  staticMessages?: Array<string>;
  fixedCharacterMap?: Map<string, string>;

  constructor({
    canvasWidth,
    canvasHeight,
    fontSize,
    alpha,
    variabilityOfStart,
    numberOfColumnOverlaps,
    changeCharacterFrequency,
    changeCharacterDuration,
    frequencyOfRandomCellsInColumns,
    numberOfRandomCellsInColumns,
    staticMessages,
  }: {
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    alpha: number;
    variabilityOfStart: number;
    numberOfColumnOverlaps: number;
    changeCharacterFrequency: number;
    changeCharacterDuration: number;
    frequencyOfRandomCellsInColumns: number;
    numberOfRandomCellsInColumns: number;
    staticMessages?: Array<string>;
  }) {
    // Set all inputs to local properties
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.fontSize = fontSize;
    this.alpha = alpha;
    this.variabilityOfStart = variabilityOfStart;
    this.numberOfColumnOverlaps = numberOfColumnOverlaps;
    this.changeCharacterFrequency = changeCharacterFrequency;
    this.changeCharacterDuration = changeCharacterDuration;
    this.frequencyOfRandomCellsInColumns = frequencyOfRandomCellsInColumns;
    this.numberOfRandomCellsInColumns = numberOfRandomCellsInColumns;
    this.columns = [];
    this.staticMessages = staticMessages;

    //Run private initialiser method
    this.#initialiser();
  }

  /**
   * Private function to initialise the effect
   */
  #initialiser() {
    // Rebuild the fixed-character map for the current canvas size
    this.#buildFixedCharMap();
    // Loop over the number of overlaps of columns, how many drops per collumn
    for (let j = 0; j < this.numberOfColumnOverlaps; j++) {
      // Calculate the width of the window based on font size and create a column for each
      // Add + 1 to the columns to cover edge on x axis
      for (
        let i = 0;
        i < Math.ceil(this.canvasWidth / this.fontSize) + 1;
        i++
      ) {
        // Add the column to the array, not numbered as we have overlaps
        this.columns.push(
          new Column(
            i, // X axis
            this.fontSize,
            this.canvasHeight,
            this.alpha,
            this.variabilityOfStart,
            this.changeCharacterFrequency,
            this.changeCharacterDuration,
            this.frequencyOfRandomCellsInColumns,
            this.numberOfRandomCellsInColumns,
            this.fixedCharacterMap
          )
        );
      }
    }
  }

  /**
   * Builds the fixed-character map based on the current canvas size and font size.
   * Characters from staticMessages are positioned on the logical grid so that
   * they are centered. Spaces are treated as blank cells.
   */
  #buildFixedCharMap() {
    // If no messages provided (undefined or empty), clear the fixed map and bail out
    if (!this.staticMessages || this.staticMessages.length === 0) {
      this.fixedCharacterMap = undefined;
      return;
    }

    const fixedCharacterMap = new Map<string, string>();

    const totalCols = Math.max(1, Math.ceil(this.canvasWidth / this.fontSize));
    const totalRows = Math.max(1, Math.ceil(this.canvasHeight / this.fontSize));
    const centerRow = Math.floor(totalRows / 2);

    this.staticMessages.forEach((rawMessage, rowOffset) => {
      const chars = rawMessage.toUpperCase().split("");
      if (!chars.length) return;

      const startCol = Math.max(0, Math.floor((totalCols - chars.length) / 2));
      const rowIndex = centerRow + rowOffset * 2; // space the rows a bit

      chars.forEach((ch, index) => {
        if (ch === " ") return; // leave spaces blank (no glyph)
        const colIndex = startCol + index;
        fixedCharacterMap.set(`${colIndex},${rowIndex}`, ch);
      });
    });

    this.fixedCharacterMap = fixedCharacterMap;
  }

  /**
   * Draws a frame for the effect based on the objects input parameters
   *
   * @param {CanvasRenderingContext2D} ctx The canvas ctx used to draw the symbol
   */
  draw(ctx: CanvasRenderingContext2D) {
    // Trigger each columns draw method
    for (let i = 0; i < this.columns.length; i++) {
      this.columns[i].draw(ctx);
    }
  }

  /**
   * Function used to recalculate the entire effect based on new canvas size
   *
   * @param {number} width The width of the new canvas to be resized to
   * @param {number} height The height of the new canvas to be resized to
   */
  resize(width: number, height: number) {
    // Set inputs
    this.canvasWidth = width;
    this.canvasHeight = height;

    // Clear columns
    this.columns = [];

    //Run private initialiser method
    this.#initialiser();
  }
}

/**
 * Function generates an array of random numbers of random length or an empty array
 *
 * @param {number} probabilityOfNumber 0->1 How likely to return numbers as oposed to empty
 * @param {number} multiplier The upper limit of the numbers, 255 would be 0->255
 * @param {number} maxLength The maximum length of the array of numbers
 *
 * @returns Array of numbers or empty array
 */
function getRandomNumbersOrNull(
  probabilityOfNumber: number = 1,
  multiplier: number = 1,
  maxLength: number = 1
): Array<number> {
  if (Math.random() > probabilityOfNumber) {
    return [];
  } else {
    const length = Math.floor(Math.random() * maxLength) + 1;
    const array: Array<number> = [];
    for (let i = 0; i < length; i++) {
      array.push(Math.floor(Math.random() * multiplier));
    }
    return array;
  }
}

/**
 * Function draws characters
 *
 * @param {CanvasRenderingContext2D} ctx The canvas context used to draw the symbol
 * @param {string} text The text to be drawn
 * @param {number} x The x coordinate of the text
 * @param {number} y The y coordinate of the text
 */
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
) {
  const px = CRISP_TEXT ? Math.round(x) + 0.5 : x; //Crispness tweak
  const py = CRISP_TEXT ? Math.round(y) + 0.5 : y; //Crispness tweak
  ctx.fillText(text, -px, py); // Draw text (adjust x position)
}

/**
 * Function draws characters without being mirrored, used for fixed message characters.
 * It cancels the global horizontal flip by applying another scale(-1, 1) and then
 * draws the text without negating the x-coordinate.
 */
function drawCharacterUnflipped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
) {
  const px = CRISP_TEXT ? Math.round(x) + 0.5 : x;
  const py = CRISP_TEXT ? Math.round(y) + 0.5 : y;

  // Cancel the global scale(-1, 1) so fixed text is not mirrored
  ctx.save();
  ctx.scale(-1, 1); // -1 * -1 = 1 → net no flip
  ctx.fillText(text, px, py);
  ctx.restore();
}
