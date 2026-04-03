export type SystemThemeName = 'dark' | 'light';

let cachedSystemTheme: SystemThemeName | undefined;

export function getSystemThemeName(): SystemThemeName {
  if (cachedSystemTheme === undefined) {
    cachedSystemTheme = parseColorfgbgTheme(process.env.COLORFGBG) ?? 'dark';
  }

  return cachedSystemTheme;
}

export function setCachedSystemTheme(themeName: SystemThemeName): void {
  cachedSystemTheme = themeName;
}

export function resolveAutoThemeName(): SystemThemeName {
  return getSystemThemeName();
}

export function resetCachedSystemThemeForTests(): void {
  cachedSystemTheme = undefined;
}

export function parseColorfgbgTheme(
  colorfgbg: string | undefined,
): SystemThemeName | undefined {
  if (!colorfgbg) return undefined;

  const parts = colorfgbg.split(';');
  const bg = parts[parts.length - 1];
  if (bg === undefined || bg === '') return undefined;

  const bgNum = Number(bg);
  if (!Number.isInteger(bgNum) || bgNum < 0 || bgNum > 15) {
    return undefined;
  }

  return bgNum <= 6 || bgNum === 8 ? 'dark' : 'light';
}

export function themeFromOscColor(data: string): SystemThemeName | undefined {
  const rgb = parseOscRgb(data);
  if (!rgb) return undefined;

  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luminance > 0.5 ? 'light' : 'dark';
}

type Rgb = { r: number; g: number; b: number };

function parseOscRgb(data: string): Rgb | undefined {
  const rgbMatch =
    /^rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(
      data,
    );
  if (rgbMatch) {
    return {
      r: hexComponent(rgbMatch[1]!),
      g: hexComponent(rgbMatch[2]!),
      b: hexComponent(rgbMatch[3]!),
    };
  }

  const hashMatch = /^#([0-9a-f]+)$/i.exec(data);
  if (hashMatch && hashMatch[1]!.length % 3 === 0) {
    const hex = hashMatch[1]!;
    const width = hex.length / 3;
    return {
      r: hexComponent(hex.slice(0, width)),
      g: hexComponent(hex.slice(width, 2 * width)),
      b: hexComponent(hex.slice(2 * width)),
    };
  }

  return undefined;
}

function hexComponent(hex: string): number {
  return parseInt(hex, 16) / (16 ** hex.length - 1);
}
