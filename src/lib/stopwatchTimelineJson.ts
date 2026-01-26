import { HeadChannel, SubChannelMark } from '@/types';
import { getElapsedMs } from '@/lib/timeFormat';

// New format: [{"n":"Head 1","t":60,"s":[{"n":"Sub 1","c":0,"i":[[0,5]]}]}]
export type StopwatchExportJson = Array<{
  n: string;    // name
  t: number;    // total duration in minutes
  s: Array<{
    n: string;  // sub name
    c: 0 | 1;   // color flag
    i: Array<[number, number]>;  // intervals in minutes [[start, end], ...]
  }>;
}>;

type IntervalMs = { startMs: number; endMs: number };

function calculateIntervalsFromMarks(
  marks: SubChannelMark[],
  currentlyRunning: boolean,
  headElapsedMs: number
): IntervalMs[] {
  const intervals: IntervalMs[] = [];
  let startMs: number | null = null;

  for (const mark of marks) {
    if (mark.action === 'start') {
      startMs = mark.headTimeMs;
    } else if (mark.action === 'pause' && startMs !== null) {
      const endMs = mark.headTimeMs;
      if (endMs > startMs) intervals.push({ startMs, endMs });
      startMs = null;
    }
  }

  if (currentlyRunning && startMs !== null) {
    const endMs = headElapsedMs;
    if (endMs > startMs) intervals.push({ startMs, endMs });
  }

  return intervals;
}

/**
 * Export stopwatch head channels into compact JSON format.
 * Format: [{"n":"Head 1","t":60,"s":[{"n":"Sub 1","c":0,"i":[[0,5]]}]}]
 * All time values are in minutes (with decimals for precision).
 */
export function buildStopwatchTimelineJson(headChannels: HeadChannel[]): string {
  const data: StopwatchExportJson = headChannels.map(h => {
    const headElapsedMs = getElapsedMs(h);
    // Use ceiling for total to ensure all intervals fit
    const totalMinutes = Math.ceil(headElapsedMs / 60000);

    return {
      n: h.name,
      t: Math.max(1, totalMinutes), // Minimum 1 minute
      s: h.subChannels.map(sc => {
        const intervals = calculateIntervalsFromMarks(sc.marks, sc.running, headElapsedMs);
        return {
          n: sc.name,
          c: 0 as const,
          // Convert intervals from ms to minutes with decimal precision
          i: intervals.map(int => {
            // Use 2 decimal places for sub-minute accuracy
            const startMin = Math.round((int.startMs / 60000) * 100) / 100;
            const endMin = Math.round((int.endMs / 60000) * 100) / 100;
            // Ensure end > start
            return [startMin, Math.max(startMin + 0.01, endMin)] as [number, number];
          }),
        };
      }).filter(sc => sc.i.length > 0), // Only include subs with intervals
    };
  });

  return JSON.stringify(data);
}
