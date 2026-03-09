import { describe, expect, it } from 'vitest';
import { TimingDataProcessor } from './timing-data.js';

describe('TimingDataProcessor', () => {
  it('records lap snapshots only when NumberOfLaps is present in the update', () => {
    const processor = new TimingDataProcessor();

    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            NumberOfLaps: 11,
            Position: '2',
            LastLapTime: { Value: '1:31.500' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11Z'),
    });

    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Position: '1',
            GapToLeader: '+0.000',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    });

    expect(processor.getLapSnapshot('4', 11)).toMatchObject({
      NumberOfLaps: 11,
      Position: '2',
      LastLapTime: { Value: '1:31.500' },
    });
    expect(processor.getLapSnapshot('4', 11)).not.toMatchObject({
      GapToLeader: '+0.000',
    });
    expect(processor.state).toMatchObject({
      Lines: {
        '4': {
          NumberOfLaps: 11,
          Position: '1',
          GapToLeader: '+0.000',
        },
      },
    });
  });

  it('stores a fresh snapshot when a later update advances the lap', () => {
    const processor = new TimingDataProcessor();

    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            NumberOfLaps: 11,
            Position: '2',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11Z'),
    });
    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Position: '1',
            GapToLeader: '+0.000',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    });
    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            NumberOfLaps: 12,
            LastLapTime: { Value: '1:30.100' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:13Z'),
    });

    expect(processor.getLapNumbers()).toEqual([11, 12]);
    expect(processor.getLapSnapshot('4', 11)).toMatchObject({
      NumberOfLaps: 11,
      Position: '2',
    });
    expect(processor.getLapSnapshot('4', 12)).toMatchObject({
      NumberOfLaps: 12,
      Position: '1',
      GapToLeader: '+0.000',
      LastLapTime: { Value: '1:30.100' },
    });
  });

  it('tracks best lap numbers from the typed best-lap payload', () => {
    const processor = new TimingDataProcessor();

    processor.process({
      type: 'TimingData',
      json: {
        SessionPart: '2',
        Lines: {
          '4': {
            NumberOfLaps: '15',
            InPit: '0',
            BestLapTime: { Value: '1:29.999', Lap: '14' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:15Z'),
    });

    expect(processor.bestLaps.get('4')).toMatchObject({
      time: '1:29.999',
      lap: 14,
      snapshot: {
        SessionPart: 2,
      },
    });
  });

  it('keeps IsPitLap set through the lap snapshot, then clears it for the next lap', () => {
    const processor = new TimingDataProcessor();

    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            NumberOfLaps: 11,
            InPit: true,
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11Z'),
    });

    processor.process({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            InPit: false,
            NumberOfLaps: 12,
            LastLapTime: { Value: '1:41.000' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    });

    expect(processor.getLapSnapshot('4', 12)).toMatchObject({
      NumberOfLaps: 12,
      InPit: false,
      IsPitLap: true,
      LastLapTime: { Value: '1:41.000' },
    });
    expect(processor.state).toMatchObject({
      Lines: {
        '4': {
          NumberOfLaps: 12,
          InPit: false,
          IsPitLap: false,
        },
      },
    });
  });
});
