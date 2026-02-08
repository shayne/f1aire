import type { DataBookTopic } from './types.js';

function canonicalizeTopic(input: string): string {
  const trimmed = input.trim();
  if (trimmed.endsWith('.z')) return trimmed.slice(0, -2);
  return trimmed;
}

export const DATA_BOOK_TOPICS: DataBookTopic[] = [
  {
    topic: 'SessionInfo',
    aliases: ['SessionInfo'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Session metadata (event, circuit, session name/type, path). Use this to orient the analysis and to interpret session-specific rules.',
    engineerUse: [
      'Identify the session (Race/Quali/Practice/Sprint) and venue.',
      'Use Path/Name for linking radio clips and for labeling outputs.',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Name', description: 'Session name (e.g. Race, Qualifying).' },
      { path: 'Type', description: 'Session type string (Race, Qualifying, Practice, Sprint).' },
      { path: 'Path', description: 'Static data path prefix used to download session streams and assets.' },
      { path: 'Meeting.Location', description: 'Event location.' },
    ],
    pitfalls: [
      'SessionInfo is typically loaded once (subscription snapshot) and may not appear as a rich timeline.',
    ],
    relatedTopics: ['SessionData', 'Heartbeat'],
    bestTools: ['get_session_info', 'get_session_data', 'get_heartbeat'],
  },
  {
    topic: 'Heartbeat',
    aliases: ['Heartbeat'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Time anchor for the live timing feed. Heartbeat includes a UTC timestamp used to align stream offsets to real timestamps.',
    engineerUse: [
      'Align timeline events to real UTC timestamps.',
      'Determine the session start anchor (startUtc = firstHeartbeatUtc - firstHeartbeatOffset).',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Utc', description: 'UTC timestamp string for the message.' },
      { path: 'UtcTime', description: 'Alternate field sometimes used instead of Utc.' },
    ],
    pitfalls: [
      'Offset timestamps in jsonStream lines are relative to the session start; Heartbeat is used to derive the absolute start.',
      'Some payloads use UtcTime or utc instead of Utc.',
    ],
    relatedTopics: ['ExtrapolatedClock', 'SessionData'],
    bestTools: ['get_heartbeat', 'set_time_cursor', 'get_topic_timeline'],
  },
  {
    topic: 'ExtrapolatedClock',
    aliases: ['ExtrapolatedClock'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Session clock information (remaining time, whether the clock is extrapolating). Useful for time-based sessions and paused periods.',
    engineerUse: [
      'Reason about session time remaining and pauses.',
      'Correlate with Heartbeat to understand timing of neutralizations and stoppages.',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Utc', description: 'UTC timestamp for the clock state.' },
      { path: 'Remaining', description: 'Time remaining (HH:MM:SS).' },
      { path: 'Extrapolating', description: 'Whether the clock is being extrapolated.' },
    ],
    pitfalls: ['Remaining is a string; do not assume numeric seconds without parsing.'],
    relatedTopics: ['Heartbeat', 'TrackStatus'],
    bestTools: ['get_extrapolated_clock', 'get_latest', 'get_topic_timeline'],
  },
  {
    topic: 'TrackStatus',
    aliases: ['TrackStatus'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Track condition/flag state (green/yellow/SC/VSC/red, etc). Often represented as a numeric Status plus a human Message.',
    engineerUse: [
      'Filter pace analysis to green-flag laps.',
      'Explain lap time anomalies during yellow/SC/VSC periods.',
    ],
    normalization: [
      '_kf is stripped during normalization when present.',
      'TrackStatusProcessor keeps a change history with timestamps.',
    ],
    keyFields: [
      { path: 'Status', description: 'Status code (commonly stringified numeric codes).' },
      { path: 'Message', description: 'Human-readable state (e.g. Yellow, AllClear).' },
    ],
    pitfalls: [
      'Status is often a stringified number (e.g. "2").',
      'Message conventions vary; prefer using both Status and Message when filtering.',
    ],
    relatedTopics: ['RaceControlMessages', 'TimingData'],
    bestTools: ['get_track_status', 'get_track_status_history', 'get_sc_vsc_deltas', 'get_lap_table'],
  },
  {
    topic: 'WeatherData',
    aliases: ['WeatherData'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Weather and track conditions (temperatures, wind, rain, etc). Use this for explaining pace shifts, tyre warmup, and strategy risk.',
    engineerUse: [
      'Track evolution context: track temp, air temp, wind changes.',
      'Rain risk and tyre choice discussion.',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'AirTemp', description: 'Ambient temperature.', units: 'C (typically)' },
      { path: 'TrackTemp', description: 'Track surface temperature.', units: 'C (typically)' },
      { path: 'WindSpeed', description: 'Wind speed.', units: 'm/s or km/h (varies)' },
      { path: 'Rainfall', description: 'Rainfall indicator/amount (varies by feed).' },
    ],
    pitfalls: [
      'Units and field names vary by season/feed; inspect topic shape if fields are missing.',
      'Many values are strings; parse carefully.',
    ],
    relatedTopics: ['TimingAppData', 'TimingData'],
    bestTools: ['get_weather', 'inspect_topic', 'get_topic_timeline'],
  },
  {
    topic: 'DriverList',
    aliases: ['DriverList'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Driver metadata keyed by racing number (names, team, colours, abbreviations). This is the join key for most other topics.',
    engineerUse: [
      'Map driver numbers to names/teams in explanations.',
      'Resolve user mentions ("Norris") to driver number.',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: '<driver>.BroadcastName', description: 'Broadcast name string.' },
      { path: '<driver>.Tla', description: 'Three-letter abbreviation.' },
      { path: '<driver>.FullName', description: 'Full driver name.' },
      { path: '<driver>.TeamName', description: 'Team name.' },
      { path: '<driver>.TeamColour', description: 'Team colour hex string.' },
    ],
    pitfalls: ['Driver numbers are strings (e.g. "4"), not integers.'],
    relatedTopics: ['TimingData', 'TimingAppData', 'CarData', 'Position'],
    bestTools: ['get_driver_list', 'get_lap_table'],
  },
  {
    topic: 'TimingData',
    aliases: ['TimingData'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Primary timing feed: positions, gaps, lap counts, lap times, sector splits, and mini-sector flags, keyed by driver number.',
    engineerUse: [
      'Positions and gaps: who is leading, intervals, traffic context.',
      'Lap/sector pace: compare drivers, build stints/pace windows, analyze deltas.',
      'Mini-sectors: spot where time is gained/lost.',
    ],
    normalization: [
      'Incremental patches are deep-merged into a persistent state.',
      'Sectors and Segments arrays are normalized to indexed dictionaries.',
      'Derived field IsPitLap may be set when InPit/PitOut/PitIn appear.',
    ],
    keyFields: [
      { path: 'Lines.<driver>.Position|Line', description: 'Race position (string/number; sometimes both keys exist).' },
      { path: 'Lines.<driver>.NumberOfLaps', description: 'Current lap number for that driver.' },
      { path: 'Lines.<driver>.GapToLeader', description: 'Gap to leader; leader may show "LAP 54".' },
      { path: 'Lines.<driver>.IntervalToPositionAhead.Value', description: 'Interval to car ahead; may be time or "5L".' },
      { path: 'Lines.<driver>.LastLapTime.Value', description: 'Last completed lap time.', units: 'mm:ss.mmm' },
      { path: 'Lines.<driver>.Sectors.<idx>.Value', description: 'Sector time by index (usually idx = "0","1","2").', units: 'mm:ss.mmm' },
      { path: 'Lines.<driver>.Sectors.<idx>.Segments.<idx>.Status', description: 'Mini-sector status bitmask.' },
      { path: 'Lines.<driver>.Speeds.(I1|I2|FL|ST).Value', description: 'Speed trap values.', units: 'km/h (typically)' },
    ],
    pitfalls: [
      'GapToLeader for the leader can be "LAP N" rather than "+0.000".',
      'Intervals can be lap-based ("5L") and are not parseable as seconds.',
      'Sectors/Segments may be missing or incomplete; do not assume 3 sectors always exist.',
      'TimingData is a patch stream; you must merge state (do not treat each line as full state).',
    ],
    relatedTopics: ['TimingAppData', 'TrackStatus', 'RaceControlMessages', 'Position', 'CarData'],
    bestTools: ['get_timing_state', 'get_lap_table', 'get_drs_trains', 'compare_drivers', 'get_clean_lap_pace', 'inspect_topic'],
  },
  {
    topic: 'TimingAppData',
    aliases: ['TimingAppData'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Tyre/stint information (compound, new/used, stint lengths). Primary source for stint boundaries and tyre compound context.',
    engineerUse: [
      'Current and historical tyre compounds and stint lengths.',
      'Strategy context (who is on what compound, stint age).',
    ],
    normalization: ['Stints can arrive as arrays; normalized to indexed dictionaries for consistent access.'],
    keyFields: [
      { path: 'Lines.<driver>.GridPos', description: 'Starting grid position (race sessions only).' },
      { path: 'Lines.<driver>.Stints.<n>.Compound', description: 'Tyre compound (SOFT/MEDIUM/HARD/INTER/WET).' },
      { path: 'Lines.<driver>.Stints.<n>.New', description: 'Whether the tyres were new in that stint.' },
      { path: 'Lines.<driver>.Stints.<n>.TotalLaps', description: 'Stint length in laps.' },
      { path: 'Lines.<driver>.Stints.<n>.StartLaps', description: 'Start lap offset for the stint.' },
    ],
    pitfalls: [
      'Not all sessions have rich stint data (Practice/Quali may be sparse).',
      'New may appear as a string in some feeds; treat it as boolean carefully.',
    ],
    relatedTopics: ['TimingData', 'PitStopSeries', 'PitLaneTimeCollection'],
    bestTools: ['get_timing_app_data', 'get_lap_table', 'inspect_topic'],
  },
  {
    topic: 'TimingStats',
    aliases: ['TimingStats'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Timing aggregates and bests (best sectors, best speeds, etc). Useful for quickly answering “who has the best S1/FL speed” style questions.',
    engineerUse: [
      'Best sectors and speed trap comparisons.',
      'Quick performance indicators without iterating every lap.',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Lines.<driver>.*', description: 'Per-driver stats (structure varies; inspect if needed).' },
    ],
    pitfalls: ['Structure can vary; if unsure, call inspect_topic(TimingStats).'],
    relatedTopics: ['TimingData'],
    bestTools: ['get_timing_stats', 'inspect_topic'],
  },
  {
    topic: 'TopThree',
    aliases: ['TopThree'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Broadcast-oriented top three summary (positions, names, diffs). Useful for a quick “headline” view.',
    engineerUse: ['Quickly report top 3 and their deltas without building ordering from TimingData.'],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Withheld', description: 'Whether TopThree is withheld.' },
      { path: 'Lines[0..2].(RacingNumber|FullName|Team|DiffToLeader)', description: 'Top 3 driver summary.' },
    ],
    pitfalls: ['TopThree is not a complete classification; use TimingData for full order.'],
    relatedTopics: ['TimingData', 'DriverList'],
    bestTools: ['get_top_three', 'get_timing_state'],
  },
  {
    topic: 'SessionData',
    aliases: ['SessionData'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Session-series timeline (lap series and status series). Useful for coarse session phase changes and correlating with other events.',
    engineerUse: [
      'Correlate lap number changes over time.',
      'Cross-check track status changes (StatusSeries).',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Series[].(Utc|Lap)', description: 'Timestamped lap series.' },
      { path: 'StatusSeries[].(Utc|TrackStatus)', description: 'Timestamped status markers.' },
    ],
    pitfalls: ['Series arrays can be short at subscription time; rely on timelines when available.'],
    relatedTopics: ['TrackStatus', 'TimingData', 'Heartbeat'],
    bestTools: ['get_session_data', 'get_topic_timeline', 'inspect_topic'],
  },
  {
    topic: 'RaceControlMessages',
    aliases: ['RaceControlMessages'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Race control messages (flags, incidents, SC/VSC, notes). Primary source for “what happened” event narration.',
    engineerUse: [
      'Incident timeline: yellow, SC/VSC, red flags, investigations, penalties.',
      'Explain sudden pace/position changes with official messaging.',
    ],
    normalization: ['Messages may arrive as an array; normalized to an indexed dictionary.'],
    keyFields: [
      { path: 'Messages.<id>.Utc', description: 'Message timestamp (may be partial ISO).' },
      { path: 'Messages.<id>.Category', description: 'Category (Flag, Incident, Other, etc).' },
      { path: 'Messages.<id>.Message', description: 'Human-readable message text.' },
      { path: 'Messages.<id>.Lap', description: 'Lap number reference when present.' },
    ],
    pitfalls: [
      'Messages can be partial ISO timestamps or lack timezone; treat as informational unless aligned with Heartbeat.',
      'Do not assume Messages is already a dictionary; normalize first.',
    ],
    relatedTopics: ['TrackStatus', 'TimingData'],
    bestTools: ['get_race_control_messages', 'inspect_topic', 'get_topic_timeline'],
  },
  {
    topic: 'TeamRadio',
    aliases: ['TeamRadio'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Team radio capture metadata (timestamp, driver, asset path). Useful for linking to audio and understanding team comms timing.',
    engineerUse: [
      'List recent radio events for a driver and correlate with track events.',
      'Download/playback is out of scope, but Paths can be used to fetch assets.',
    ],
    normalization: ['Captures may arrive as an array; normalized to an indexed dictionary.'],
    keyFields: [
      { path: 'Captures.<id>.Utc', description: 'Capture timestamp.' },
      { path: 'Captures.<id>.RacingNumber', description: 'Driver number.' },
      { path: 'Captures.<id>.Path', description: 'Relative asset path (mp3).' },
    ],
    pitfalls: ['Captures often lack transcription; treat as metadata unless you download and transcribe separately.'],
    relatedTopics: ['RaceControlMessages', 'TimingData', 'SessionInfo'],
    bestTools: ['get_team_radio', 'inspect_topic'],
  },
  {
    topic: 'CarData',
    aliases: ['CarData.z', 'CarData'],
    availability: 'all-sessions',
    semantics: 'batched',
    purpose:
      'Per-car telemetry channels (rpm/speed/gear/throttle/brake/DRS) in time-batched Entries. This is a low-latency view, not full telemetry.',
    engineerUse: [
      'Quick checks: speed/gear/throttle/brake/DRS state at the latest known timestamp.',
      'Correlate throttle/brake patterns with lap time deltas qualitatively.',
    ],
    normalization: ['Downloaded as CarData.z (base64+deflate) and inflated during normalization.'],
    keyFields: [
      { path: 'Entries[-1].Utc', description: 'UTC timestamp for the batch.' },
      { path: 'Entries[-1].Cars.<driver>.Channels.2', description: 'Speed channel.', units: 'km/h (typically)' },
      { path: 'Entries[-1].Cars.<driver>.Channels.3', description: 'Gear channel.' },
      { path: 'Entries[-1].Cars.<driver>.Channels.4', description: 'Throttle channel.', units: '%' },
      { path: 'Entries[-1].Cars.<driver>.Channels.5', description: 'Brake channel.', units: '%' },
      { path: 'Entries[-1].Cars.<driver>.Channels.45', description: 'DRS channel (0-14 style codes).' },
    ],
    pitfalls: [
      'CarData is time-batched; it is not per-lap telemetry and can have gaps.',
      'DRS is an encoded integer; treat it as “off/eligible/on-ish” unless you have a confirmed mapping.',
    ],
    relatedTopics: ['Position', 'TimingData'],
    bestTools: ['get_drs_state', 'get_drs_usage', 'get_car_telemetry', 'get_car_data', 'inspect_topic'],
  },
  {
    topic: 'Position',
    aliases: ['Position.z', 'Position'],
    availability: 'all-sessions',
    semantics: 'batched',
    purpose:
      'On-track XYZ position updates for each car (time-batched). Use this for traffic/track-position context and rough gap visualization.',
    engineerUse: [
      'Traffic context: who is near whom on track.',
      'Qualitative explanations: battling, catching, spacing on circuit.',
    ],
    normalization: ['Downloaded as Position.z (base64+deflate) and inflated during normalization.'],
    keyFields: [
      { path: 'Position[-1].Timestamp', description: 'Timestamp for the batch.' },
      { path: 'Position[-1].Entries.<driver>.X|Y|Z', description: 'Car position coordinates.', units: 'cm (typically)' },
      { path: 'Position[-1].Entries.<driver>.Status', description: 'OnTrack/OffTrack status.' },
    ],
    pitfalls: [
      'Coordinates are in a track-specific coordinate system; do not interpret as GPS lat/long.',
      'Batched updates can be stale for some cars.',
    ],
    relatedTopics: ['TimingData', 'CarData'],
    bestTools: ['get_position', 'inspect_topic'],
  },
  {
    topic: 'LapCount',
    aliases: ['LapCount'],
    availability: 'race-only',
    semantics: 'replace',
    purpose:
      'Race lap count information. Useful for quickly answering current lap / total laps context when available.',
    engineerUse: ['Race context: current lap and total scheduled laps (when present).'],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'CurrentLap', description: 'Current lap number (when present).' },
      { path: 'TotalLaps', description: 'Total scheduled laps (when present).' },
    ],
    pitfalls: ['Field names vary; inspect topic if CurrentLap/TotalLaps are missing.'],
    relatedTopics: ['TimingData'],
    bestTools: ['get_lap_count', 'inspect_topic'],
  },
  {
    topic: 'ChampionshipPrediction',
    aliases: ['ChampionshipPrediction'],
    availability: 'race-only',
    semantics: 'replace',
    purpose:
      'Standings prediction snapshot (driver/team current vs predicted positions/points). Useful for championship context during races.',
    engineerUse: [
      'Answer “if it finishes like this, what happens to the championship?” style questions (high-level).',
    ],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [
      { path: 'Drivers.<driver>.CurrentPoints', description: 'Current points in championship.' },
      { path: 'Drivers.<driver>.PredictedPoints', description: 'Predicted points if current result holds.' },
      { path: 'Drivers.<driver>.PredictedPosition', description: 'Predicted championship position.' },
      { path: 'Teams.<team>.*', description: 'Team-side equivalents (structure varies).' },
    ],
    pitfalls: ['This is a snapshot/prediction; do not treat as official final standings.'],
    relatedTopics: ['TimingData'],
    bestTools: ['get_championship_prediction', 'inspect_topic'],
  },
  {
    topic: 'PitLaneTimeCollection',
    aliases: ['PitLaneTimeCollection'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Pit lane time collection snapshots (pit lane traversal durations by driver). Useful for estimating pit loss and validating pit events.',
    engineerUse: [
      'Estimate pit loss (pit lane traversal time) and compare between teams/drivers.',
      'Validate pit entry/exit timing against TimingData pit flags.',
    ],
    normalization: ['PitTimes._deleted key is removed when present.'],
    keyFields: [
      { path: 'PitTimes.<driver>.Duration', description: 'Pit lane duration (string; format varies).' },
      { path: 'PitTimes.<driver>.Lap', description: 'Lap number associated with the pit lane time.' },
    ],
    pitfalls: [
      'PitTimes may be sparse or absent in some sessions.',
      'Duration formatting varies; parse carefully.',
    ],
    relatedTopics: ['PitStopSeries', 'TimingData', 'TimingAppData'],
    bestTools: ['get_pit_lane_times', 'get_pit_loss_estimate', 'inspect_topic'],
  },
  {
    topic: 'PitStopSeries',
    aliases: ['PitStopSeries'],
    availability: 'all-sessions',
    semantics: 'patch',
    purpose:
      'Pit stop timing details (pit stop time, pit lane time, lap) keyed by driver and stop index. Useful for detailed strategy recap.',
    engineerUse: [
      'List pit stops and stop durations by driver.',
      'Strategy review: stop timing and pit lane time vs competitors.',
    ],
    normalization: ['PitTimes.<driver> may arrive as arrays; normalized to indexed dictionaries.'],
    keyFields: [
      { path: 'PitTimes.<driver>.<stop>.PitStop.PitStopTime', description: 'Stationary pit stop time.', units: 's (string)' },
      { path: 'PitTimes.<driver>.<stop>.PitStop.PitLaneTime', description: 'Pit lane time.', units: 's (string)' },
      { path: 'PitTimes.<driver>.<stop>.PitStop.Lap', description: 'Lap number of the stop.' },
    ],
    pitfalls: [
      'Often empty until later in the session or post-session.',
      'Times are strings; parse carefully and expect missing fields.',
    ],
    relatedTopics: ['PitLaneTimeCollection', 'TimingAppData', 'TimingData'],
    bestTools: ['get_pit_stop_series', 'inspect_topic'],
  },
  {
    topic: 'PitStop',
    aliases: ['PitStop'],
    availability: 'all-sessions',
    semantics: 'replace',
    purpose:
      'Pit stop related snapshot. The shape can vary by season; treat as a raw blob and inspect when needed.',
    engineerUse: ['Supplement pit stop analysis when PitStopSeries is missing or incomplete.'],
    normalization: ['_kf is stripped during normalization when present.'],
    keyFields: [{ path: '*', description: 'Shape is not guaranteed; inspect_topic is recommended.' }],
    pitfalls: ['This topic is not consistently modelled; prefer PitStopSeries/PitLaneTimeCollection for structured pit data.'],
    relatedTopics: ['PitStopSeries', 'PitLaneTimeCollection'],
    bestTools: ['get_pit_stop', 'inspect_topic'],
  },
];

export function getDataBookIndex() {
  return DATA_BOOK_TOPICS.map((topic) => ({
    topic: topic.topic,
    aliases: topic.aliases,
    availability: topic.availability,
    semantics: topic.semantics,
    purpose: topic.purpose,
    bestTools: topic.bestTools,
  }));
}

export function getDataBookTopic(topicOrAlias: string): DataBookTopic | null {
  const needle = canonicalizeTopic(topicOrAlias);
  for (const entry of DATA_BOOK_TOPICS) {
    if (entry.topic === needle) return entry;
    if (entry.aliases.some((alias) => canonicalizeTopic(alias) === needle)) return entry;
  }
  return null;
}
