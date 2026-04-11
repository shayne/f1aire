import { PassThrough } from 'node:stream';
import React from 'react';
import { renderSync } from './index.js';

export async function renderTui(
  node: React.ReactNode,
  { columns = 80, rows = 24 } = {},
) {
  const stdout = new PassThrough() as PassThrough & NodeJS.WriteStream;
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
  const stderr = new PassThrough() as PassThrough & NodeJS.WriteStream;

  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = true;

  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;

  const app = renderSync(node, {
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    ...app,
    stdin,
    stdout,
    stderr,
    lastFrame: () => app.getFrameSnapshot(),
    resize(nextColumns: number, nextRows: number) {
      stdout.columns = nextColumns;
      stdout.rows = nextRows;
      stdout.emit('resize');
    },
  };
}
