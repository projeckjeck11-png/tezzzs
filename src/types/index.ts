// Mark/event recorded when sub channel is started/paused
export interface SubChannelMark {
  action: 'start' | 'pause';
  // Time relative to head channel (in ms)
  headTimeMs: number;
  // Absolute timestamp
  timestamp: number;
}

// Base timer state
export interface TimerState {
  accumulatedMs: number;
  running: boolean;
  startPerf: number | null;
  startEpochMs: number | null;
}

// Head Channel - main reference timer
export interface HeadChannel extends TimerState {
  id: string;
  name: string;
  subChannels: SubChannel[];
}

// Sub Channel - linked to a head channel
export interface SubChannel extends TimerState {
  id: string;
  name: string;
  parentId: string;
  // Records when sub channel was started/paused relative to head channel
  marks: SubChannelMark[];
}

// Stored versions for localStorage persistence
export interface StoredSubChannel {
  id: string;
  name: string;
  parentId: string;
  accumulatedMs: number;
  running: boolean;
  startEpochMs: number | null;
  marks: SubChannelMark[];
}

export interface StoredHeadChannel {
  id: string;
  name: string;
  accumulatedMs: number;
  running: boolean;
  startEpochMs: number | null;
  subChannels: StoredSubChannel[];
}

export interface Note {
  id: string;
  savedAt: number;
  lines: string[];
}

export interface StoredState {
  headChannels: StoredHeadChannel[];
  notes: Note[];
  channelCounter: number;
}

// Legacy types for backwards compatibility (can be removed after migration)
export interface Channel {
  id: string;
  name: string;
  accumulatedMs: number;
  running: boolean;
  startPerf: number | null;
  startEpochMs: number | null;
}

export interface StoredChannel {
  id: string;
  name: string;
  accumulatedMs: number;
  running: boolean;
  startEpochMs: number | null;
}
