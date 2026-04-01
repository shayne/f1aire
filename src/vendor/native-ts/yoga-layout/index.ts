import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Wrap,
} from 'yoga-layout';

export {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Wrap,
};
export type { Node } from 'yoga-layout';
export default Yoga;

export function getYogaCounters() {
  return { visited: 0, measured: 0, cacheHits: 0, live: 0 };
}
