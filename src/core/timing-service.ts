import type { SessionStore } from './session-store.js';
import type { RawPoint } from './processors/types.js';
import { CarDataProcessor } from './processors/car-data.js';
import { DriverTrackerProcessor } from './processors/driver-tracker.js';
import { DriverRaceInfoProcessor } from './processors/driver-race-info.js';
import { DriverListProcessor } from './processors/driver-list.js';
import { ExtrapolatedClockProcessor } from './processors/extrapolated-clock.js';
import { MergeProcessor } from './processors/merge-processor.js';
import { normalizePoint } from './processors/normalize.js';
import { PitLaneTimeCollectionProcessor } from './processors/pit-lane-time-collection.js';
import { PositionDataProcessor } from './processors/position-data.js';
import { SessionInfoProcessor } from './processors/session-info.js';
import { RaceControlMessagesProcessor } from './processors/race-control-messages.js';
import { ReplaceProcessor } from './processors/replace-processor.js';
import { TeamRadioProcessor } from './processors/team-radio.js';
import { TimingDataProcessor } from './processors/timing-data.js';
import { TimingStatsProcessor } from './processors/timing-stats.js';
import { TrackStatusProcessor } from './processors/track-status.js';
import { getTopicDefinition, TOPIC_REGISTRY } from './topic-registry.js';

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
  'DriverTracker',
  'RaceControlMessages',
  'TeamRadio',
  'ChampionshipPrediction',
  'DriverRaceInfo',
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function canonicalizeTopicName(topic: string) {
  return (
    getTopicDefinition(topic)?.topic ??
    (topic.endsWith('.z') ? topic.slice(0, -2) : topic)
  );
}

function getKnownTopicNames(topic: string) {
  const definition = getTopicDefinition(topic);
  const names = new Set<string>([topic, canonicalizeTopicName(topic)]);
  if (!definition) {
    if (topic.endsWith('.z')) {
      names.add(topic.slice(0, -2));
    }
    return names;
  }

  names.add(definition.topic);
  names.add(definition.streamName);
  definition.aliases?.forEach((alias) => names.add(alias));
  return names;
}

function getHydrationDateTime(store: SessionStore): Date {
  let latestLive: Date | null = null;
  for (const point of store.raw.live) {
    if (!latestLive || point.dateTime.getTime() > latestLive.getTime()) {
      latestLive = point.dateTime;
    }
  }
  if (latestLive) {
    return latestLive;
  }

  const heartbeatDate =
    toValidDate(
      (store.raw.subscribe as { Heartbeat?: { Utc?: unknown } })?.Heartbeat
        ?.Utc,
    ) ??
    toValidDate(
      (store.raw.keyframes as { Heartbeat?: { Utc?: unknown } })?.Heartbeat
        ?.Utc,
    );
  if (heartbeatDate) {
    return heartbeatDate;
  }

  return new Date(0);
}

export type TimingServiceHydrationResult = {
  subscribeTopics: string[];
  keyframeTopics: string[];
  livePoints: number;
};

export class TimingService {
  processors = {
    heartbeat: new ReplaceProcessor('Heartbeat'),
    driverList: new DriverListProcessor(),
    timingData: new TimingDataProcessor(),
    timingAppData: new MergeProcessor('TimingAppData'),
    timingStats: new TimingStatsProcessor(),
    trackStatus: new TrackStatusProcessor(),
    lapCount: new ReplaceProcessor('LapCount'),
    weatherData: new ReplaceProcessor('WeatherData'),
    sessionInfo: new SessionInfoProcessor(),
    sessionData: new MergeProcessor('SessionData'),
    extrapolatedClock: new ExtrapolatedClockProcessor(),
    topThree: new ReplaceProcessor('TopThree'),
    driverTracker: new DriverTrackerProcessor(),
    raceControlMessages: new RaceControlMessagesProcessor(),
    teamRadio: new TeamRadioProcessor(),
    championshipPrediction: new MergeProcessor('ChampionshipPrediction'),
    driverRaceInfo: new DriverRaceInfoProcessor(),
    pitStopSeries: new MergeProcessor('PitStopSeries'),
    pitStop: new ReplaceProcessor('PitStop'),
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
      this.processors.driverTracker,
      this.processors.raceControlMessages,
      this.processors.teamRadio,
      this.processors.championshipPrediction,
      this.processors.driverRaceInfo,
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

export function hydrateTimingServiceFromStore(opts: {
  service: TimingService;
  store: SessionStore;
}): TimingServiceHydrationResult {
  const { service, store } = opts;
  const fallbackDateTime = getHydrationDateTime(store);
  const subscribeTopics: string[] = [];
  const keyframeTopics: string[] = [];
  const seenTopics = new Set<string>();

  if (isPlainObject(store.raw.subscribe)) {
    for (const [topic, json] of Object.entries(store.raw.subscribe)) {
      const canonicalTopic = canonicalizeTopicName(topic);
      service.enqueue({
        type: topic,
        json,
        dateTime: fallbackDateTime,
      });
      subscribeTopics.push(canonicalTopic);
      for (const name of getKnownTopicNames(topic)) {
        seenTopics.add(name);
      }
    }
  }

  for (const point of store.raw.live) {
    for (const name of getKnownTopicNames(point.type)) {
      seenTopics.add(name);
    }
  }

  if (isPlainObject(store.raw.keyframes)) {
    for (const [topic, json] of Object.entries(store.raw.keyframes)) {
      const names = getKnownTopicNames(topic);
      const hasTimelineData = [...names].some((name) => seenTopics.has(name));
      if (hasTimelineData) {
        continue;
      }

      const canonicalTopic = canonicalizeTopicName(topic);
      service.enqueue({
        type: topic,
        json,
        dateTime: fallbackDateTime,
      });
      keyframeTopics.push(canonicalTopic);
      names.forEach((name) => seenTopics.add(name));
    }
  }

  for (const point of store.raw.live) {
    service.enqueue(point);
  }

  return {
    subscribeTopics,
    keyframeTopics,
    livePoints: store.raw.live.length,
  };
}
