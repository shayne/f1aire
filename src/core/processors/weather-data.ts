import {
  replaceWeatherDataState,
  type WeatherDataState,
} from '../weather-data.js';
import type { Processor, RawPoint } from './types.js';

export class WeatherDataProcessor implements Processor<WeatherDataState> {
  latest: WeatherDataState | null = null;
  state: WeatherDataState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'WeatherData') {
      return;
    }

    const next = replaceWeatherDataState(point.json);
    this.state = next;
    this.latest = next;
  }
}
