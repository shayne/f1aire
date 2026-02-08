export type DataBookAvailability = 'race-only' | 'all-sessions';
export type DataBookSemantics = 'patch' | 'replace' | 'batched';

export type DataBookKeyField = {
  path: string;
  description: string;
  units?: string;
};

export type DataBookTopic = {
  topic: string;
  aliases: string[];
  availability: DataBookAvailability;
  semantics: DataBookSemantics;
  purpose: string;
  engineerUse: string[];
  normalization: string[];
  keyFields: DataBookKeyField[];
  pitfalls: string[];
  relatedTopics: string[];
  bestTools: string[];
};

