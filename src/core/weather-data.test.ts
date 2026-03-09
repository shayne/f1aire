import { describe, expect, it } from 'vitest';
import {
  getWeatherSnapshot,
  replaceWeatherDataState,
} from './weather-data.js';

describe('weather-data', () => {
  it('builds a typed snapshot from flat WeatherData payloads', () => {
    expect(
      getWeatherSnapshot({
        AirTemp: '20.4',
        Humidity: '67.7',
        Pressure: '1013.7',
        Rainfall: '1',
        TrackTemp: '36.9',
        WindDirection: '94',
        WindSpeed: '2.7',
      }),
    ).toEqual({
      timestamp: null,
      airTempC: 20.4,
      humidityPct: 67.7,
      pressureHpa: 1013.7,
      rainfall: 1,
      trackTempC: 36.9,
      windDirectionDeg: 94,
      windSpeed: 2.7,
    });
  });

  it('normalizes replace-style WeatherData state while preserving unknown keys', () => {
    expect(
      replaceWeatherDataState({
        AirTemp: '20.4',
        TrackTemp: '',
        WindSpeed: 'windy',
        Notes: 'gusty',
      }),
    ).toEqual({
      AirTemp: 20.4,
      Notes: 'gusty',
    });
  });

  it('supports nested Weather payloads with canonical timestamps', () => {
    expect(
      replaceWeatherDataState({
        Timestamp: '2026-03-07T04:50:11.926Z',
        Weather: {
          AirTemp: '20.4',
          Rainfall: '0',
          WindDirection: '94',
        },
      }),
    ).toEqual({
      Timestamp: '2026-03-07T04:50:11.926Z',
      Weather: {
        AirTemp: 20.4,
        Rainfall: 0,
        WindDirection: 94,
      },
    });

    expect(
      getWeatherSnapshot({
        Timestamp: '2026-03-07T04:50:11.926Z',
        Weather: {
          AirTemp: '20.4',
          Rainfall: '0',
          WindDirection: '94',
        },
      }),
    ).toEqual({
      timestamp: '2026-03-07T04:50:11.926Z',
      airTempC: 20.4,
      humidityPct: null,
      pressureHpa: null,
      rainfall: 0,
      trackTempC: null,
      windDirectionDeg: 94,
      windSpeed: null,
    });
  });
});
