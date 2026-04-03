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
    primary: 'rgb(255,255,255)',
    secondary: 'rgb(255,255,255)',
    muted: 'rgb(153,153,153)',
    brand: 'rgb(215,119,87)',
  },
  chrome: {
    border: 'rgb(136,136,136)',
    panelTitle: 'rgb(255,255,255)',
    selected: 'rgb(122,180,232)',
    subtle: 'rgb(153,153,153)',
  },
  transcript: {
    user: 'rgb(122,180,232)',
    assistant: 'rgb(215,119,87)',
    auxiliary: 'rgb(153,153,153)',
  },
  composer: {
    caret: 'rgb(122,180,232)',
    activeMarker: 'rgb(122,180,232)',
    inactiveMarker: 'rgb(153,153,153)',
    placeholder: 'rgb(153,153,153)',
  },
  status: {
    thinking: 'rgb(215,119,87)',
    thinkingShimmer: 'rgb(235,159,127)',
    tool: 'rgb(122,180,232)',
    toolShimmer: 'rgb(183,224,255)',
    error: 'rgb(255,107,128)',
    errorShimmer: 'rgb(255,145,162)',
    ok: 'rgb(78,186,101)',
    idle: 'rgb(153,153,153)',
  },
};

export const lightTheme: F1aireTheme = {
  name: 'light',
  text: {
    primary: 'rgb(0,0,0)',
    secondary: 'rgb(0,0,0)',
    muted: 'rgb(102,102,102)',
    brand: 'rgb(215,119,87)',
  },
  chrome: {
    border: 'rgb(153,153,153)',
    panelTitle: 'rgb(0,0,0)',
    selected: 'rgb(37,99,235)',
    subtle: 'rgb(175,175,175)',
  },
  transcript: {
    user: 'rgb(37,99,235)',
    assistant: 'rgb(215,119,87)',
    auxiliary: 'rgb(102,102,102)',
  },
  composer: {
    caret: 'rgb(37,99,235)',
    activeMarker: 'rgb(37,99,235)',
    inactiveMarker: 'rgb(102,102,102)',
    placeholder: 'rgb(102,102,102)',
  },
  status: {
    thinking: 'rgb(215,119,87)',
    thinkingShimmer: 'rgb(245,149,117)',
    tool: 'rgb(37,99,235)',
    toolShimmer: 'rgb(137,155,255)',
    error: 'rgb(171,43,63)',
    errorShimmer: 'rgb(220,88,105)',
    ok: 'rgb(44,122,57)',
    idle: 'rgb(102,102,102)',
  },
};
