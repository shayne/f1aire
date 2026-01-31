export type MeetingsIndex = {
  Year: number;
  Meetings: Meeting[];
};

export type Meeting = {
  Key: number;
  Name: string;
  Location: string;
  Sessions: Session[];
};

export type Session = {
  Key: number;
  Name: string;
  Type: string;
  StartDate: string;
  EndDate: string;
  GmtOffset: string;
  Path?: string | null;
};
