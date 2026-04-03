import React, { createContext, useContext } from 'react';
import { darkTheme, type F1aireTheme } from './tokens.js';

const ThemeContext = createContext<F1aireTheme>(darkTheme);

export function ThemeProvider({
  value = darkTheme,
  children,
}: {
  value?: F1aireTheme;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): F1aireTheme {
  return useContext(ThemeContext);
}
