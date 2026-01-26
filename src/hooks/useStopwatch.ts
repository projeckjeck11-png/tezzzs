import { useState, useEffect, useCallback, useRef } from 'react';
import { HeadChannel, SubChannel, SubChannelMark, Note, StoredHeadChannel, StoredSubChannel, StoredState } from '@/types';

const STORAGE_KEY = 'stopwatch-state-v2';

/**
 * TIMING STRATEGY:
 *
 * 1. Runtime: Use performance.now() for sub-millisecond accuracy during session
 * 2. Persistence: Store Date.now() (startEpochMs) for recovery across page reloads
 * 3. Recovery: On load, if channel was running, calculate delta from startEpochMs
 *    and add to accumulatedMs, then resume with fresh performance.now()
 *
 * HEAD CHANNEL vs SUB CHANNEL:
 * - Head Channel: Main reference timer
 * - Sub Channel: Linked to head, records marks (start/pause) relative to head's time
 *
 * ANTI-DRIFT: We never increment counters. We always calculate from timestamps.
 */

function generateId(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;

  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds
    .toString()
    .padStart(2, '0')}`;
}

export function formatTimeShort(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate elapsed milliseconds for any timer.
 * Uses performance.now() for sub-millisecond accuracy.
 */
export function getElapsedMs(timer: { accumulatedMs: number; running: boolean; startPerf: number | null }): number {
  if (timer.running && timer.startPerf !== null) {
    return Math.floor(timer.accumulatedMs + (performance.now() - timer.startPerf));
  }
  return Math.floor(timer.accumulatedMs);
}

function loadState(): StoredState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredState;
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return { headChannels: [], notes: [], channelCounter: 0 };
}

function saveState(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

function recoverSubChannel(stored: StoredSubChannel, now: number): SubChannel {
  if (stored.running && stored.startEpochMs !== null) {
    const elapsedWhileAway = now - stored.startEpochMs;
    return {
      id: stored.id,
      name: stored.name,
      parentId: stored.parentId,
      accumulatedMs: stored.accumulatedMs + elapsedWhileAway,
      running: true,
      startPerf: performance.now(),
      startEpochMs: now,
      marks: stored.marks,
    };
  }

  return {
    id: stored.id,
    name: stored.name,
    parentId: stored.parentId,
    accumulatedMs: stored.accumulatedMs,
    running: false,
    startPerf: null,
    startEpochMs: null,
    marks: stored.marks,
  };
}

function recoverHeadChannels(stored: StoredHeadChannel[]): HeadChannel[] {
  const now = Date.now();

  return stored.map(ch => {
    const subChannels = ch.subChannels.map(sub => recoverSubChannel(sub, now));

    if (ch.running && ch.startEpochMs !== null) {
      const elapsedWhileAway = now - ch.startEpochMs;
      return {
        id: ch.id,
        name: ch.name,
        accumulatedMs: ch.accumulatedMs + elapsedWhileAway,
        running: true,
        startPerf: performance.now(),
        startEpochMs: now,
        subChannels,
      };
    }

    return {
      id: ch.id,
      name: ch.name,
      accumulatedMs: ch.accumulatedMs,
      running: false,
      startPerf: null,
      startEpochMs: null,
      subChannels,
    };
  });
}

function prepareSubChannelForStorage(sub: SubChannel): StoredSubChannel {
  if (sub.running && sub.startPerf !== null) {
    const currentElapsed = sub.accumulatedMs + (performance.now() - sub.startPerf);
    return {
      id: sub.id,
      name: sub.name,
      parentId: sub.parentId,
      accumulatedMs: currentElapsed,
      running: true,
      startEpochMs: Date.now(),
      marks: sub.marks,
    };
  }

  return {
    id: sub.id,
    name: sub.name,
    parentId: sub.parentId,
    accumulatedMs: sub.accumulatedMs,
    running: false,
    startEpochMs: null,
    marks: sub.marks,
  };
}

function prepareForStorage(headChannels: HeadChannel[]): StoredHeadChannel[] {
  return headChannels.map(ch => {
    const subChannels = ch.subChannels.map(prepareSubChannelForStorage);

    if (ch.running && ch.startPerf !== null) {
      const currentElapsed = ch.accumulatedMs + (performance.now() - ch.startPerf);
      return {
        id: ch.id,
        name: ch.name,
        accumulatedMs: currentElapsed,
        running: true,
        startEpochMs: Date.now(),
        subChannels,
      };
    }

    return {
      id: ch.id,
      name: ch.name,
      accumulatedMs: ch.accumulatedMs,
      running: false,
      startEpochMs: null,
      subChannels,
    };
  });
}

export function useStopwatch() {
  const [headChannels, setHeadChannels] = useState<HeadChannel[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [channelCounter, setChannelCounter] = useState(0);
  const [, setTick] = useState(0);

  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  // Load and recover state on mount
  useEffect(() => {
    if (!initializedRef.current) {
      const state = loadState();
      const recoveredChannels = recoverHeadChannels(state.headChannels);
      setHeadChannels(recoveredChannels);
      setNotes(state.notes);
      setChannelCounter(state.channelCounter);
      initializedRef.current = true;
    }
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    if (initializedRef.current) {
      const storedChannels = prepareForStorage(headChannels);
      saveState({ headChannels: storedChannels, notes, channelCounter });
    }
  }, [headChannels, notes, channelCounter]);

  // Check if any timer is running (head or sub)
  const hasRunning = headChannels.some(
    ch => ch.running || ch.subChannels.some(sub => sub.running)
  );

  // OPTIMIZED rAF LOOP: Only runs when at least one timer is running
  useEffect(() => {
    if (!hasRunning) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      setTick(t => t + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [hasRunning]);

  // API: Add new head channel
  const addHeadChannel = useCallback(() => {
    setChannelCounter(prev => {
      const newCounter = prev + 1;
      const newChannel: HeadChannel = {
        id: generateId(),
        name: `Head ${newCounter}`,
        accumulatedMs: 0,
        running: false,
        startPerf: null,
        startEpochMs: null,
        subChannels: [],
      };
      setHeadChannels(prevChannels => [...prevChannels, newChannel]);
      return newCounter;
    });
  }, []);

  // API: Add new sub channel to a head channel
  const addSubChannel = useCallback((headId: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== headId) return ch;
        const subCount = ch.subChannels.length + 1;
        const newSub: SubChannel = {
          id: generateId(),
          name: `Sub ${subCount}`,
          parentId: headId,
          accumulatedMs: 0,
          running: false,
          startPerf: null,
          startEpochMs: null,
          marks: [],
        };
        return { ...ch, subChannels: [...ch.subChannels, newSub] };
      })
    );
  }, []);

  // API: Update head channel name
  const updateHeadChannelName = useCallback((id: string, name: string) => {
    setHeadChannels(prev =>
      prev.map((ch, idx) => {
        if (ch.id === id) {
          const safeName = name.trim() || `Head ${idx + 1}`;
          return { ...ch, name: safeName };
        }
        return ch;
      })
    );
  }, []);

  // API: Update sub channel name
  const updateSubChannelName = useCallback((headId: string, subId: string, name: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== headId) return ch;
        const subChannels = ch.subChannels.map((sub, idx) => {
          if (sub.id === subId) {
            const safeName = name.trim() || `Sub ${idx + 1}`;
            return { ...sub, name: safeName };
          }
          return sub;
        });
        return { ...ch, subChannels };
      })
    );
  }, []);

  // API: Toggle head channel (pausing head auto-pauses all subs)
  const toggleHeadChannel = useCallback((id: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== id) return ch;

        if (ch.running && ch.startPerf !== null) {
          // Pause head - also pause all running sub channels
          const headElapsedMs = getElapsedMs(ch);
          const now = Date.now();
          
          const pausedSubChannels = ch.subChannels.map(sub => {
            if (!sub.running || sub.startPerf === null) return sub;
            
            // Auto-pause this sub channel
            const mark: SubChannelMark = {
              action: 'pause',
              headTimeMs: headElapsedMs,
              timestamp: now,
            };
            return {
              ...sub,
              accumulatedMs: sub.accumulatedMs + (performance.now() - sub.startPerf),
              running: false,
              startPerf: null,
              startEpochMs: null,
              marks: [...sub.marks, mark],
            };
          });
          
          return {
            ...ch,
            accumulatedMs: ch.accumulatedMs + (performance.now() - ch.startPerf),
            running: false,
            startPerf: null,
            startEpochMs: null,
            subChannels: pausedSubChannels,
          };
        } else {
          return {
            ...ch,
            running: true,
            startPerf: performance.now(),
            startEpochMs: Date.now(),
          };
        }
      })
    );
  }, []);

  // API: Toggle sub channel (records mark relative to head channel time)
  // ANTI-BUG: Sub channel cannot start if head is not running
  const toggleSubChannel = useCallback((headId: string, subId: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== headId) return ch;

        const headElapsedMs = getElapsedMs(ch);

        const subChannels = ch.subChannels.map(sub => {
          if (sub.id !== subId) return sub;

          const now = Date.now();

          if (sub.running && sub.startPerf !== null) {
            // Pause sub channel - always allowed
            const mark: SubChannelMark = {
              action: 'pause',
              headTimeMs: headElapsedMs,
              timestamp: now,
            };
            return {
              ...sub,
              accumulatedMs: sub.accumulatedMs + (performance.now() - sub.startPerf),
              running: false,
              startPerf: null,
              startEpochMs: null,
              marks: [...sub.marks, mark],
            };
          } else {
            // Start sub channel - ONLY if head is running
            if (!ch.running) {
              // Head not running, don't start sub
              return sub;
            }
            
            const mark: SubChannelMark = {
              action: 'start',
              headTimeMs: headElapsedMs,
              timestamp: now,
            };
            return {
              ...sub,
              running: true,
              startPerf: performance.now(),
              startEpochMs: now,
              marks: [...sub.marks, mark],
            };
          }
        });

        return { ...ch, subChannels };
      })
    );
  }, []);

  // API: Reset head channel (and all its sub channels)
  const resetHeadChannel = useCallback((id: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== id) return ch;
        const resetSubChannels = ch.subChannels.map(sub => ({
          ...sub,
          accumulatedMs: 0,
          running: false,
          startPerf: null,
          startEpochMs: null,
          marks: [],
        }));
        return {
          ...ch,
          accumulatedMs: 0,
          running: false,
          startPerf: null,
          startEpochMs: null,
          subChannels: resetSubChannels,
        };
      })
    );
  }, []);

  // API: Reset sub channel
  const resetSubChannel = useCallback((headId: string, subId: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== headId) return ch;
        const subChannels = ch.subChannels.map(sub => {
          if (sub.id !== subId) return sub;
          return {
            ...sub,
            accumulatedMs: 0,
            running: false,
            startPerf: null,
            startEpochMs: null,
            marks: [],
          };
        });
        return { ...ch, subChannels };
      })
    );
  }, []);

  // API: Delete head channel
  const deleteHeadChannel = useCallback((id: string) => {
    setHeadChannels(prev => prev.filter(ch => ch.id !== id));
  }, []);

  // API: Delete sub channel
  const deleteSubChannel = useCallback((headId: string, subId: string) => {
    setHeadChannels(prev =>
      prev.map(ch => {
        if (ch.id !== headId) return ch;
        return {
          ...ch,
          subChannels: ch.subChannels.filter(sub => sub.id !== subId),
        };
      })
    );
  }, []);

  // API: Reset all timers
  const resetAllTimers = useCallback(() => {
    setHeadChannels(prev =>
      prev.map(ch => ({
        ...ch,
        accumulatedMs: 0,
        running: false,
        startPerf: null,
        startEpochMs: null,
        subChannels: ch.subChannels.map(sub => ({
          ...sub,
          accumulatedMs: 0,
          running: false,
          startPerf: null,
          startEpochMs: null,
          marks: [],
        })),
      }))
    );
  }, []);

  // API: Close all channels
  const closeAllChannels = useCallback(() => {
    setHeadChannels([]);
  }, []);

  // API: Save snapshot
  const saveSnapshot = useCallback(() => {
    const lines: string[] = [];

    headChannels.forEach(ch => {
      const headElapsed = getElapsedMs(ch);
      lines.push(`📌 ${ch.name} = ${formatTime(headElapsed)}`);

      ch.subChannels.forEach(sub => {
        const subElapsed = getElapsedMs(sub);
        lines.push(`  └─ ${sub.name} = ${formatTime(subElapsed)}`);

        // Add marks info
        if (sub.marks.length > 0) {
          sub.marks.forEach(mark => {
            const icon = mark.action === 'start' ? '▶' : '⏸';
            lines.push(`      ${icon} @${formatTimeShort(mark.headTimeMs)}`);
          });
        }
      });
    });

    if (lines.length === 0) return;

    const newNote: Note = {
      id: generateId(),
      savedAt: Date.now(),
      lines,
    };
    setNotes(prev => [...prev, newNote]);
  }, [headChannels]);

  // API: Delete note
  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(note => note.id !== id));
  }, []);

  // API: Delete all data
  const deleteAll = useCallback(() => {
    setHeadChannels([]);
    setNotes([]);
    setChannelCounter(0);
  }, []);

  // API: Import head channels from JSON data
  const importHeadChannels = useCallback((data: {
    name: string;
    totalMs: number;
    subChannels: {
      name: string;
      intervals: { startMs: number; endMs: number }[];
    }[];
  }[]) => {
    const newHeads: HeadChannel[] = data.map((headData, headIdx) => {
      const headId = generateId();
      
      const subChannels: SubChannel[] = headData.subChannels.map((subData, subIdx) => {
        const subId = generateId();
        
        // Convert intervals to marks
        const marks: SubChannelMark[] = [];
        let accumulatedMs = 0;
        
        subData.intervals.forEach(interval => {
          marks.push({
            action: 'start',
            headTimeMs: interval.startMs,
            timestamp: Date.now(),
          });
          marks.push({
            action: 'pause',
            headTimeMs: interval.endMs,
            timestamp: Date.now(),
          });
          accumulatedMs += interval.endMs - interval.startMs;
        });

        return {
          id: subId,
          name: subData.name || `Sub ${subIdx + 1}`,
          parentId: headId,
          accumulatedMs,
          running: false,
          startPerf: null,
          startEpochMs: null,
          marks,
        };
      });

      return {
        id: headId,
        name: headData.name || `Head ${headIdx + 1}`,
        accumulatedMs: headData.totalMs,
        running: false,
        startPerf: null,
        startEpochMs: null,
        subChannels,
      };
    });

    setHeadChannels(prev => [...prev, ...newHeads]);
    setChannelCounter(prev => prev + data.length);
  }, []);

  // API: Get display time for any timer
  const getDisplayTime = useCallback((timer: { accumulatedMs: number; running: boolean; startPerf: number | null }): string => {
    return formatTime(getElapsedMs(timer));
  }, []);

  // API: Get button label for any timer
  const getButtonLabel = useCallback((timer: { running: boolean; accumulatedMs: number }): string => {
    if (timer.running) return 'Pause';
    if (timer.accumulatedMs > 0) return 'Resume';
    return 'Start';
  }, []);

  return {
    headChannels,
    notes,
    addHeadChannel,
    addSubChannel,
    updateHeadChannelName,
    updateSubChannelName,
    toggleHeadChannel,
    toggleSubChannel,
    resetHeadChannel,
    resetSubChannel,
    deleteHeadChannel,
    deleteSubChannel,
    resetAllTimers,
    closeAllChannels,
    saveSnapshot,
    deleteNote,
    deleteAll,
    getDisplayTime,
    getButtonLabel,
    importHeadChannels,
  };
}
