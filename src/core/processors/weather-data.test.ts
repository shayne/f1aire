import { describe, expect, it } from 'vitest';
import { WeatherDataProcessor } from './weather-data.js';

describe('WeatherDataProcessor', () => {
  it('replaces latest weather state with normalized numeric fields', () => {
    const processor = new WeatherDataProcessor();

    processor.process({
      type: 'WeatherData',
      json: {
        AirTemp: '20.4',
        TrackTemp: '36.9',
        Rainfall: '1',
      },
      dateTime: new Date('2026-03-07T04:50:11.926Z'),
    });

    expect(processor.state).toEqual({
      AirTemp: 20.4,
      TrackTemp: 36.9,
      Rainfall: 1,
    });

    processor.process({
      type: 'WeatherData',
      json: {
        AirTemp: '21.1',
      },
      dateTime: new Date('2026-03-07T04:51:11.926Z'),
    });

    expect(processor.state).toEqual({
      AirTemp: 21.1,
    });
  });
});
