import { describe, expect, it } from 'vitest';
import {
  getWeatherSeriesRecords,
  summarizeWeatherSeries,
} from './weather-series.js';

describe('weather-series', () => {
  it('builds typed weather records from WeatherDataSeries snapshots', () => {
    const records = getWeatherSeriesRecords({
      weatherDataSeriesState: {
        Series: {
          '1': {
            Timestamp: '2026-03-07T04:49:11.917Z',
            Weather: {
              AirTemp: '20.5',
              Humidity: '67.5',
              Pressure: '1013.5',
              Rainfall: '0',
              TrackTemp: '37.3',
              WindDirection: '85',
              WindSpeed: '2.2',
            },
          },
          '2': {
            Timestamp: '2026-03-07T04:50:11.926Z',
            Weather: {
              AirTemp: '20.4',
              Humidity: '67.7',
              Pressure: '1013.7',
              Rainfall: '1',
              TrackTemp: '36.9',
              WindDirection: '94',
              WindSpeed: '2.7',
            },
          },
        },
      },
    });

    expect(records).toEqual([
      {
        sampleId: '1',
        timestamp: '2026-03-07T04:49:11.917Z',
        airTempC: 20.5,
        humidityPct: 67.5,
        pressureHpa: 1013.5,
        rainfall: 0,
        trackTempC: 37.3,
        windDirectionDeg: 85,
        windSpeed: 2.2,
        source: 'WeatherDataSeries',
      },
      {
        sampleId: '2',
        timestamp: '2026-03-07T04:50:11.926Z',
        airTempC: 20.4,
        humidityPct: 67.7,
        pressureHpa: 1013.7,
        rainfall: 1,
        trackTempC: 36.9,
        windDirectionDeg: 94,
        windSpeed: 2.7,
        source: 'WeatherDataSeries',
      },
    ]);

    expect(summarizeWeatherSeries(records)).toEqual({
      samples: 2,
      fromTime: '2026-03-07T04:49:11.917Z',
      toTime: '2026-03-07T04:50:11.926Z',
      airTempStartC: 20.5,
      airTempEndC: 20.4,
      airTempDeltaC: -0.10000000000000142,
      trackTempStartC: 37.3,
      trackTempEndC: 36.9,
      trackTempDeltaC: -0.3999999999999986,
      minAirTempC: 20.4,
      maxAirTempC: 20.5,
      minTrackTempC: 36.9,
      maxTrackTempC: 37.3,
      rainfallSamples: 1,
      maxWindSpeed: 2.7,
    });
  });

  it('falls back to latest WeatherData when the series feed is unavailable', () => {
    const records = getWeatherSeriesRecords({
      weatherDataState: {
        AirTemp: '19.8',
        Humidity: '63.1',
        Pressure: '1012.6',
        Rainfall: '0',
        TrackTemp: '28.4',
        WindDirection: '144',
        WindSpeed: '3.1',
      },
      weatherDataTimestamp: '2026-03-07T06:22:14.658Z',
    });

    expect(records).toEqual([
      {
        sampleId: 'latest',
        timestamp: '2026-03-07T06:22:14.658Z',
        airTempC: 19.8,
        humidityPct: 63.1,
        pressureHpa: 1012.6,
        rainfall: 0,
        trackTempC: 28.4,
        windDirectionDeg: 144,
        windSpeed: 3.1,
        source: 'WeatherData',
      },
    ]);
  });
});
