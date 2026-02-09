import { describe, expect, it } from 'vitest';
import { getDataBookIndex, getDataBookTopic } from './data-book.js';

describe('data-book', () => {
  it('includes expanded modern feed references', () => {
    const index = getDataBookIndex();
    expect(index.find((entry) => entry.topic === 'CurrentTyres')).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'TyreStintSeries')).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'TimingDataF1')).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'DriverRaceInfo')).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'WeatherDataSeries')).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'ArchiveStatus')).toBeTruthy();
  });

  it('resolves topics and aliases', () => {
    expect(getDataBookTopic('TimingDataF1')?.topic).toBe('TimingDataF1');
    expect(getDataBookTopic('CarData.z')?.topic).toBe('CarData');
    expect(getDataBookTopic('Position.z')?.topic).toBe('Position');
  });
});
