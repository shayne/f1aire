import { useMemo } from 'react';
import { useAnimationFrame } from '../../../vendor/ink/hooks/use-animation-frame.js';
import { stringWidth } from '../../../vendor/ink/stringWidth.js';
import type { DOMElement } from '../../../vendor/ink/dom.js';
import type { EngineerStatusMode } from './engineer-status-animation.js';

const REQUESTING_GLIMMER_SPEED_MS = 50;
const DEFAULT_GLIMMER_SPEED_MS = 200;

export function useEngineerShimmerAnimation(
  mode: EngineerStatusMode,
  message: string,
  isIdle: boolean,
): [
  ref: (element: DOMElement | null) => void,
  glimmerIndex: number,
  time: number,
] {
  const glimmerSpeed =
    mode === 'requesting'
      ? REQUESTING_GLIMMER_SPEED_MS
      : DEFAULT_GLIMMER_SPEED_MS;
  const [ref, time] = useAnimationFrame(isIdle ? null : glimmerSpeed);
  const messageWidth = useMemo(() => stringWidth(message), [message]);

  if (isIdle) {
    return [ref, -100, time];
  }

  return [
    ref,
    Math.floor(time / glimmerSpeed) % Math.max(1, messageWidth),
    time,
  ];
}
