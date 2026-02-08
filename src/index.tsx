#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './app.js';

if (process.stdout.isTTY) {
  process.stdout.write('\x1B[2J\x1B[H');
}

render(<App />);
