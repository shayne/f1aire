import React, { createContext, useContext, useEffect, useState } from 'react';
import useStdin from '../../vendor/ink/hooks/use-stdin.js';
import {
  getSystemThemeName,
  type SystemThemeName,
} from './system-theme.js';
import { watchSystemTheme } from './system-theme-watcher.js';
import { darkTheme, lightTheme, type F1aireTheme } from './tokens.js';

function themeForSystemTheme(themeName: SystemThemeName): F1aireTheme {
  return themeName === 'light' ? lightTheme : darkTheme;
}

const ThemeContext = createContext<F1aireTheme>(darkTheme);

export function ThemeProvider({
  value,
  children,
}: {
  value?: F1aireTheme;
  children: React.ReactNode;
}): React.JSX.Element {
  const { internal_querier } = useStdin();
  const [systemTheme, setSystemTheme] = useState<SystemThemeName>(() =>
    value ? value.name : getSystemThemeName(),
  );

  useEffect(() => {
    if (value || !internal_querier) return;

    return watchSystemTheme(internal_querier, setSystemTheme);
  }, [internal_querier, value]);

  return (
    <ThemeContext.Provider value={value ?? themeForSystemTheme(systemTheme)}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): F1aireTheme {
  return useContext(ThemeContext);
}
