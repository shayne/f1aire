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
    topic: 'SessionInfo',
    streamName: 'SessionInfo',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'Heartbeat',
    streamName: 'Heartbeat',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'ArchiveStatus',
    streamName: 'ArchiveStatus',
    availability: 'all-sessions',
    semantics: 'replace',
    notes: 'Archive lifecycle marker (e.g. Generating/Complete).',
  },
  {
    topic: 'SessionStatus',
    streamName: 'SessionStatus',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'SessionData',
    streamName: 'SessionData',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'ExtrapolatedClock',
    streamName: 'ExtrapolatedClock',
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
    topic: 'WeatherData',
    streamName: 'WeatherData',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'WeatherDataSeries',
    streamName: 'WeatherDataSeries',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'DriverList',
    streamName: 'DriverList',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TimingData',
    streamName: 'TimingData',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TimingDataF1',
    streamName: 'TimingDataF1',
    availability: 'all-sessions',
    semantics: 'patch',
    notes: 'Alternate timing feed variant used by F1 clients.',
  },
  {
    topic: 'TimingAppData',
    streamName: 'TimingAppData',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TyreStintSeries',
    streamName: 'TyreStintSeries',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'CurrentTyres',
    streamName: 'CurrentTyres',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TimingStats',
    streamName: 'TimingStats',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'TopThree',
    streamName: 'TopThree',
    availability: 'all-sessions',
    semantics: 'replace',
  },
  {
    topic: 'DriverTracker',
    streamName: 'DriverTracker',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'LapSeries',
    streamName: 'LapSeries',
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
    topic: 'TlaRcm',
    streamName: 'TlaRcm',
    availability: 'all-sessions',
    semantics: 'replace',
    notes: 'Track-limit and race-control ticker style message stream.',
  },
  {
    topic: 'ContentStreams',
    streamName: 'ContentStreams',
    availability: 'all-sessions',
    semantics: 'patch',
    notes: 'Metadata for interactive/broadcast content stream endpoints.',
  },
  {
    topic: 'AudioStreams',
    streamName: 'AudioStreams',
    availability: 'all-sessions',
    semantics: 'patch',
    notes: 'Metadata for available audio channels and stream URIs.',
  },
  {
    topic: 'TeamRadio',
    streamName: 'TeamRadio',
    availability: 'all-sessions',
    semantics: 'patch',
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
    topic: 'PitLaneTimeCollection',
    streamName: 'PitLaneTimeCollection',
    availability: 'all-sessions',
    semantics: 'patch',
  },
  {
    topic: 'SPFeed',
    streamName: 'SPFeed',
    availability: 'all-sessions',
    semantics: 'replace',
    notes: 'Legacy feed seen in older seasons; shape varies.',
  },
  {
    topic: 'LapCount',
    streamName: 'LapCount',
    availability: 'race-only',
    semantics: 'replace',
  },
  {
    topic: 'ChampionshipPrediction',
    streamName: 'ChampionshipPrediction',
    availability: 'race-only',
    semantics: 'replace',
  },
  {
    topic: 'DriverRaceInfo',
    streamName: 'DriverRaceInfo',
    availability: 'race-only',
    semantics: 'patch',
  },
  {
    topic: 'OvertakeSeries',
    streamName: 'OvertakeSeries',
    availability: 'race-only',
    semantics: 'patch',
  },
  {
    topic: 'PitStopSeries',
    streamName: 'PitStopSeries',
    availability: 'race-only',
    semantics: 'patch',
  },
  {
    topic: 'PitStop',
    streamName: 'PitStop',
    availability: 'race-only',
    semantics: 'replace',
  },
];

export function getStreamTopicsForSessionType(sessionType: string): string[] {
  const normalized = sessionType.trim().toLowerCase();
  const isRace = normalized === 'race' || normalized === 'sprint';
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
