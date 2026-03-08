import type { RawPoint } from './processors/types.js';
import { CarDataProcessor } from './processors/car-data.js';
import { DriverListProcessor } from './processors/driver-list.js';
import { ExtrapolatedClockProcessor } from './processors/extrapolated-clock.js';
import { MergeProcessor } from './processors/merge-processor.js';
import { normalizePoint } from './processors/normalize.js';
import { PitLaneTimeCollectionProcessor } from './processors/pit-lane-time-collection.js';
import { PositionDataProcessor } from './processors/position-data.js';
import { ReplaceProcessor } from './processors/replace-processor.js';
import { TimingDataProcessor } from './processors/timing-data.js';
import { TrackStatusProcessor } from './processors/track-status.js';
import { TOPIC_REGISTRY } from './topic-registry.js';

const EXPLICIT_PROCESSOR_TOPICS = new Set([
  'Heartbeat',
  'DriverList',
  'TimingData',
  'TimingAppData',
  'TimingStats',
  'TrackStatus',
  'LapCount',
  'WeatherData',
  'SessionInfo',
  'SessionData',
  'ExtrapolatedClock',
  'TopThree',
  'RaceControlMessages',
  'TeamRadio',
  'ChampionshipPrediction',
  'PitStopSeries',
  'PitStop',
  'PitLaneTimeCollection',
  'CarData',
  'Position',
]);

function createAuxiliaryTopicProcessors() {
  const processors: Record<string, MergeProcessor | ReplaceProcessor> = {};
  for (const def of TOPIC_REGISTRY) {
    if (
      EXPLICIT_PROCESSOR_TOPICS.has(def.topic) ||
      def.semantics === 'batched'
    ) {
      continue;
    }
    processors[def.topic] =
      def.semantics === 'replace'
        ? new ReplaceProcessor(def.topic)
        : new MergeProcessor(def.topic);
  }
  return processors;
}

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
    extrapolatedClock: new ExtrapolatedClockProcessor(),
    topThree: new MergeProcessor('TopThree'),
    raceControlMessages: new MergeProcessor('RaceControlMessages'),
    teamRadio: new MergeProcessor('TeamRadio'),
    championshipPrediction: new MergeProcessor('ChampionshipPrediction'),
    pitStopSeries: new MergeProcessor('PitStopSeries'),
    pitStop: new MergeProcessor('PitStop'),
    pitLaneTimeCollection: new PitLaneTimeCollectionProcessor(),
    carData: new CarDataProcessor(),
    position: new PositionDataProcessor(),
    extraTopics: createAuxiliaryTopicProcessors(),
  };

  enqueue(point: RawPoint) {
    const normalized = normalizePoint(point);
    const baseProcessors = [
      this.processors.heartbeat,
      this.processors.driverList,
      this.processors.timingData,
      this.processors.timingAppData,
      this.processors.timingStats,
      this.processors.trackStatus,
      this.processors.lapCount,
      this.processors.weatherData,
      this.processors.sessionInfo,
      this.processors.sessionData,
      this.processors.extrapolatedClock,
      this.processors.topThree,
      this.processors.raceControlMessages,
      this.processors.teamRadio,
      this.processors.championshipPrediction,
      this.processors.pitStopSeries,
      this.processors.pitStop,
      this.processors.pitLaneTimeCollection,
      this.processors.carData,
      this.processors.position,
    ];

    for (const processor of baseProcessors) {
      processor.process(normalized);
    }
    for (const processor of Object.values(this.processors.extraTopics)) {
      processor.process(normalized);
    }
  }
}
