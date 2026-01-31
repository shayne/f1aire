export function getSeasonOptions(currentYear: number): number[] {
  return Array.from({ length: 10 }, (_, index) => currentYear - index);
}
