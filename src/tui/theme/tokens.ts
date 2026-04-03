import type { Color } from '../../vendor/ink/styles.js';

export type F1aireTheme = {
  name: 'dark' | 'light';
  text: {
    primary: Color;
    secondary: Color;
    muted: Color;
    brand: Color;
  };
  chrome: {
    border: Color;
    panelTitle: Color;
    selected: Color;
    subtle: Color;
  };
  transcript: {
    user: Color;
    assistant: Color;
    auxiliary: Color;
  };
  composer: {
    caret: Color;
    activeMarker: Color;
    inactiveMarker: Color;
    placeholder: Color;
  };
  status: {
    thinking: Color;
    thinkingShimmer: Color;
    tool: Color;
    toolShimmer: Color;
    error: Color;
    errorShimmer: Color;
    ok: Color;
    idle: Color;
  };
};

export const darkTheme: F1aireTheme = {
  name: 'dark',
  text: {
    primary: 'rgb(248,247,240)',
    secondary: 'rgb(224,220,211)',
    muted: 'rgb(168,163,152)',
    brand: 'rgb(255,43,30)',
  },
  chrome: {
    border: 'rgb(124,120,112)',
    panelTitle: 'rgb(248,247,240)',
    selected: 'rgb(74,182,255)',
    subtle: 'rgb(168,163,152)',
  },
  transcript: {
    user: 'rgb(74,182,255)',
    assistant: 'rgb(255,74,108)',
    auxiliary: 'rgb(168,163,152)',
  },
  composer: {
    caret: 'rgb(74,182,255)',
    activeMarker: 'rgb(74,182,255)',
    inactiveMarker: 'rgb(168,163,152)',
    placeholder: 'rgb(168,163,152)',
  },
  status: {
    thinking: 'rgb(255,74,108)',
    thinkingShimmer: 'rgb(255,132,156)',
    tool: 'rgb(74,182,255)',
    toolShimmer: 'rgb(152,221,255)',
    error: 'rgb(255,69,58)',
    errorShimmer: 'rgb(255,122,116)',
    ok: 'rgb(91,212,121)',
    idle: 'rgb(168,163,152)',
  },
};

export const lightTheme: F1aireTheme = {
  name: 'light',
  text: {
    primary: 'rgb(17,17,17)',
    secondary: 'rgb(46,44,40)',
    muted: 'rgb(91,88,80)',
    brand: 'rgb(203,14,38)',
  },
  chrome: {
    border: 'rgb(124,120,112)',
    panelTitle: 'rgb(17,17,17)',
    selected: 'rgb(0,98,179)',
    subtle: 'rgb(124,120,112)',
  },
  transcript: {
    user: 'rgb(0,98,179)',
    assistant: 'rgb(176,0,52)',
    auxiliary: 'rgb(91,88,80)',
  },
  composer: {
    caret: 'rgb(0,98,179)',
    activeMarker: 'rgb(0,98,179)',
    inactiveMarker: 'rgb(91,88,80)',
    placeholder: 'rgb(91,88,80)',
  },
  status: {
    thinking: 'rgb(176,0,52)',
    thinkingShimmer: 'rgb(220,68,64)',
    tool: 'rgb(0,98,179)',
    toolShimmer: 'rgb(82,133,214)',
    error: 'rgb(179,31,45)',
    errorShimmer: 'rgb(224,89,84)',
    ok: 'rgb(31,122,56)',
    idle: 'rgb(91,88,80)',
  },
};
