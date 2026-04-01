declare const Bun:
  | {
      stringWidth?: (
        input: string,
        options?: { ambiguousIsNarrow?: boolean },
      ) => number;
      wrapAnsi?: (
        input: string,
        columns: number,
        options?: { hard?: boolean; wordWrap?: boolean; trim?: boolean },
      ) => string;
    }
  | undefined;

declare module 'bidi-js' {
  const bidiFactory: any;
  export default bidiFactory;
}

declare module 'stack-utils' {
  const StackUtils: any;
  export default StackUtils;
}

declare module 'lodash-es/noop.js' {
  export default function noop(...args: any[]): undefined;
}

declare module 'lodash-es/throttle.js' {
  const throttle: any;
  export default throttle;
}

declare module 'semver' {
  export function coerce(version: string): { version: string } | null;
  export function compare(
    a: string,
    b: string,
    options?: { loose?: boolean },
  ): number;
  export function gt(
    a: string,
    b: string,
    options?: { loose?: boolean },
  ): boolean;
  export function gte(
    a: string,
    b: string,
    options?: { loose?: boolean },
  ): boolean;
  export function lt(
    a: string,
    b: string,
    options?: { loose?: boolean },
  ): boolean;
  export function lte(
    a: string,
    b: string,
    options?: { loose?: boolean },
  ): boolean;
  export function satisfies(
    version: string,
    range: string,
    options?: { loose?: boolean },
  ): boolean;
}

declare module 'react-reconciler' {
  export type FiberRoot = any;
  const createReconciler: any;
  export default createReconciler;
}

declare module 'react-reconciler/constants.js' {
  export const ConcurrentRoot: number;
  export const ContinuousEventPriority: number;
  export const DefaultEventPriority: number;
  export const DiscreteEventPriority: number;
  export const IdleEventPriority: number;
  export const LegacyRoot: number;
}

declare namespace JSX {
  interface IntrinsicElements {
    'ink-box': any;
    'ink-link': any;
    'ink-raw-ansi': any;
    'ink-text': any;
  }
}
