import type { Color } from '../../vendor/ink/styles.js';

export type F1aireTheme = {
  name: 'dark';
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
