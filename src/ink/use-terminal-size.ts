import { useContext } from 'react';
import {
  TerminalSizeContext,
  type TerminalSize,
} from '../vendor/ink/components/TerminalSizeContext.js';

export function useTerminalSize(): TerminalSize {
  return (
    useContext(TerminalSizeContext) ?? {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    }
  );
}
