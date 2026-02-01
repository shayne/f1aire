import type { RawPoint } from './processors/types.js';
import { CarDataProcessor } from './processors/car-data.js';
import { DriverListProcessor } from './processors/driver-list.js';
import { MergeProcessor } from './processors/merge-processor.js';
import { normalizePoint } from './processors/normalize.js';
import { PitLaneTimeCollectionProcessor } from './processors/pit-lane-time-collection.js';
import { PositionDataProcessor } from './processors/position-data.js';
import { TimingDataProcessor } from './processors/timing-data.js';
import { TrackStatusProcessor } from './processors/track-status.js';

export class TimingService {
  processors = {
    heartbeat: new MergeProcessor('Heartbeat'),
    driverList: new DriverListProcessor(),
    timingData: new TimingDataProcessor(),
    timingAppData: new MergeProcessor('TimingAppData'),
    timingStats: new MergeProcessor('TimingStats'),
    trackStatus: new TrackStatusProcessor(),
    lapCount: new MergeProcessor('LapCount'),
    weatherData: new MergeProcessor('WeatherData'),
    sessionInfo: new MergeProcessor('SessionInfo'),
    sessionData: new MergeProcessor('SessionData'),
    extrapolatedClock: new MergeProcessor('ExtrapolatedClock'),
    topThree: new MergeProcessor('TopThree'),
    raceControlMessages: new MergeProcessor('RaceControlMessages'),
    teamRadio: new MergeProcessor('TeamRadio'),
    championshipPrediction: new MergeProcessor('ChampionshipPrediction'),
    pitStopSeries: new MergeProcessor('PitStopSeries'),
    pitStop: new MergeProcessor('PitStop'),
    pitLaneTimeCollection: new PitLaneTimeCollectionProcessor(),
    carData: new CarDataProcessor(),
    position: new PositionDataProcessor(),
  };

  enqueue(point: RawPoint) {
    const normalized = normalizePoint(point);
    for (const processor of Object.values(this.processors)) {
      processor.process(normalized);
    }
  }
}
