"use client"; // Must be client, extensive use of client only functions in react

export { default as DigitalRain } from "./DigitalRain";
export {
  SourceCodeProvider,
  useSourceCode,
  type SourceCodeContextType,
} from "./source-code/SourceCodeContext";

// Re-export your options type so apps can type props
export type { DigitalRainOptions } from "./DigitalRain";
