"use client"; // Must be client, extensive use of client only functions in react

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type SourceCodeContextType = {
  isVisible: boolean;
  showSourceCode: () => void;
  hideSourceCode: () => void;
  toggleSourceCode: () => void;
};

const defaultValue: SourceCodeContextType = {
  isVisible: false,
  showSourceCode: () => {},
  hideSourceCode: () => {},
  toggleSourceCode: () => {},
};

const SourceCodeContext = createContext<SourceCodeContextType>(defaultValue);

export function SourceCodeProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);

  const showSourceCode = useCallback(() => setIsVisible(true), []);
  const hideSourceCode = useCallback(() => setIsVisible(false), []);
  const toggleSourceCode = useCallback(() => setIsVisible((prev) => !prev), []);

  return (
    <SourceCodeContext.Provider
      value={{ isVisible, showSourceCode, hideSourceCode, toggleSourceCode }}
    >
      {children}
    </SourceCodeContext.Provider>
  );
}

export function useSourceCode() {
  return useContext(SourceCodeContext);
}
