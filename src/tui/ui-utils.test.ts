import { describe, expect, it } from 'vitest';
import { formatBreadcrumb } from './ui-utils.js';

describe('formatBreadcrumb', () => {
  it('renders breadcrumb parts with arrows', () => {
    expect(formatBreadcrumb(['2024', 'Silverstone', 'Race'])).toBe(
      '2024 → Silverstone → Race',
    );
  });
});
