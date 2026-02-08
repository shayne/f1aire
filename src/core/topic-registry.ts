export type TopicAvailability = 'race-only' | 'all-sessions';
export type TopicUpdateSemantics = 'patch' | 'replace' | 'batched';

export type TopicDefinition = {
  // Canonical topic name (after normalization). For `.z` topics this excludes `.z`.
  topic: string;
  // Name used in `{topic}.jsonStream` downloads. Includes `.z` for compressed topics.
  streamName: string;
  // Alternate names users might refer to; also useful for lookup.
  aliases?: string[];
  availability: TopicAvailability;
  semantics: TopicUpdateSemantics;
  notes?: string;
};

export const TOPIC_REGISTRY: TopicDefinition[] = [
  {
    topic: 'Heartbeat',
    streamName: 'Heartbeat',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'CarData',
    streamName: 'CarData.z',
    aliases: ['CarData.z'],
    availability: 'all-sessions',
    semantics: 'batched',
    notes: 'Compressed (base64+deflate). Contains Entries[] batches of per-car channels.',
  },
  {
    topic: 'Position',
    streamName: 'Position.z',
    aliases: ['Position.z'],
    availability: 'all-sessions',
    semantics: 'batched',
    notes: 'Compressed (base64+deflate). Contains Position[] batches of per-car XYZ.',
  },
  {
    topic: 'ExtrapolatedClock',
    streamName: 'ExtrapolatedClock',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'TopThree',
    streamName: 'TopThree',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'TimingStats',
    streamName: 'TimingStats',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TimingAppData',
    streamName: 'TimingAppData',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'WeatherData',
    streamName: 'WeatherData',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'TrackStatus',
    streamName: 'TrackStatus',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'DriverList',
    streamName: 'DriverList',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'RaceControlMessages',
    streamName: 'RaceControlMessages',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'SessionData',
    streamName: 'SessionData',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'LapCount',
    streamName: 'LapCount',
    availability: 'race-only',
    semantics: 'replace',
  },
  {
    topic: 'TimingData',
    streamName: 'TimingData',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'ChampionshipPrediction',
    streamName: 'ChampionshipPrediction',
    availability: 'race-only',
    semantics: 'replace',
  },
  {
    topic: 'TeamRadio',
    streamName: 'TeamRadio',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'PitLaneTimeCollection',
    streamName: 'PitLaneTimeCollection',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'PitStopSeries',
    streamName: 'PitStopSeries',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'PitStop',
    streamName: 'PitStop',
    availability: 'all-sessions',
    semantics: 'replace',
  },
];

export function getStreamTopicsForSessionType(sessionType: string): string[] {
  const isRace = sessionType === 'Race';
  return TOPIC_REGISTRY
    .filter((def) => def.availability === 'all-sessions' || (isRace && def.availability === 'race-only'))
    .map((def) => def.streamName);
}

export function getTopicDefinition(topicOrStreamName: string): TopicDefinition | null {
  const normalized = topicOrStreamName.endsWith('.jsonStream')
    ? topicOrStreamName.slice(0, -'.jsonStream'.length)
    : topicOrStreamName;
  for (const def of TOPIC_REGISTRY) {
    if (def.topic === normalized) return def;
    if (def.streamName === normalized) return def;
    if (def.aliases?.includes(normalized)) return def;
  }
  return null;
}

