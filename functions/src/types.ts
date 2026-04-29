export type EventType = 'user_note' | 'user_deep' | 'system_generated';
export type EventSource = 'text' | 'voice' | 'photo';

export type JournalEvent = {
  id: string;
  timestamp: string;
  type: EventType;
  source: EventSource;
  user_input: string;
  media?: string[];
  modules_active: string[];
  structured_data: Record<string, Record<string, unknown>>;
  related_events?: string[];
  status?: 'pending' | 'processing' | 'processed' | 'failed' | 'archived';
};
