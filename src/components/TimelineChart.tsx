import { useMemo } from 'react';
import { HeadChannel, SubChannelMark } from '@/types';
import { formatTimeShort, getElapsedMs } from '@/lib/timeFormat';
import { CursorTooltip } from '@/components/CursorTooltip';

interface TimelineChartProps {
  headChannel: HeadChannel;
}

interface TimelineInterval {
  startMs: number;
  endMs: number;
}

function calculateIntervals(marks: SubChannelMark[], currentlyRunning: boolean, headElapsedMs: number): TimelineInterval[] {
  const intervals: TimelineInterval[] = [];
  let startMs: number | null = null;

  for (const mark of marks) {
    if (mark.action === 'start') {
      startMs = mark.headTimeMs;
    } else if (mark.action === 'pause' && startMs !== null) {
      if (mark.headTimeMs > startMs) intervals.push({ startMs, endMs: mark.headTimeMs });
      startMs = null;
    }
  }

  if (currentlyRunning && startMs !== null) {
    if (headElapsedMs > startMs) intervals.push({ startMs, endMs: headElapsedMs });
  }

  return intervals;
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const secs = Math.floor((ms % 60000) / 1000);

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function msToTimeString(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function TimelineChart({ headChannel }: TimelineChartProps) {
  const headElapsedMs = getElapsedMs(headChannel);
  const timelineDuration = Math.max(headElapsedMs, 60000);

  const subChannelData = useMemo(() => {
    return headChannel.subChannels.map(sub => {
      const intervals = calculateIntervals(sub.marks, sub.running, headElapsedMs);
      const elapsed = getElapsedMs(sub);
      return { sub, intervals, elapsed };
    });
  }, [headChannel.subChannels, headElapsedMs]);

  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    const step = 30 * 60 * 1000; // Fixed 30 minute intervals (in ms)
    for (let i = 0; i <= timelineDuration; i += step) markers.push(i);
    // Add final marker if not on 30min boundary
    if (markers[markers.length - 1] !== timelineDuration) markers.push(timelineDuration);
    return markers;
  }, [timelineDuration]);

  if (headChannel.subChannels.length === 0) return null;

  return (
    <div className="mt-2 bg-gradient-to-b from-card to-card/80 rounded-xl p-2 shadow-lg border border-border/50 backdrop-blur-sm">
      {/* Compact header (match ImportTimelineOClock vibe) */}
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-xs font-semibold text-foreground tracking-tight">
          {headChannel.name}{' '}
          <span className="text-muted-foreground font-normal">|</span>{' '}
          <span className="text-[10px] font-normal text-muted-foreground">
            00:00 – {msToTimeString(headElapsedMs).substring(0, 5)}
          </span>
        </h3>
        <div className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
          <span className="text-[9px] font-medium text-primary">{formatDuration(headElapsedMs)}</span>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="relative">
        {/* Time markers */}
        <div className="flex items-end mb-0.5 ml-12 mr-8">
          <div className="flex-1 relative h-4">
            {timeMarkers.map((ms, idx) => {
              const pct = (ms / timelineDuration) * 100;
              const isFirst = idx === 0;
              const isLast = idx === timeMarkers.length - 1;
              return (
                <div
                  key={idx}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: `${pct}%`,
                    transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  <span className="text-[9px] font-medium text-muted-foreground tabular-nums">{formatTimeShort(ms)}</span>
                  <div className="w-px h-1 bg-border/60 mt-0.5" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Bars */}
        <div className="space-y-0.5">
          {/* Head bar */}
          <div className="flex items-center gap-1">
            <div className="w-10 text-right pr-1 flex-shrink-0">
              <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
            </div>

            <CursorTooltip
              content={
                <>
                  <p className="font-medium">{headChannel.name}</p>
                  <p>00:00 → {msToTimeString(headElapsedMs).substring(0, 8)}</p>
                  <p className="text-muted-foreground">Duration: {formatDuration(headElapsedMs)}</p>
                </>
              }
            >
              <div className="h-6 bg-gradient-to-r from-primary/20 to-primary/10 rounded relative overflow-hidden border border-primary/20">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-primary/20" />
              </div>
            </CursorTooltip>

            <div className="w-8 text-right flex-shrink-0">
              <span className="text-[9px] font-semibold text-foreground tabular-nums">{formatDuration(headElapsedMs)}</span>
            </div>
          </div>

          {/* Sub bars */}
          {subChannelData.map(({ sub, intervals, elapsed }) => {
            const firstInt = intervals[0];
            const lastInt = intervals[intervals.length - 1];

            return (
              <div key={sub.id} className="flex items-center gap-1">
                <div className="w-10 text-right pr-1 flex-shrink-0">
                  <span className="text-[8px] text-muted-foreground truncate block">{sub.name}</span>
                </div>

                <CursorTooltip
                  content={
                    <>
                      <p className="font-medium">{sub.name}</p>
                      <p>
                        {firstInt ? formatTimeShort(firstInt.startMs) : '-'} → {lastInt ? formatTimeShort(lastInt.endMs) : '-'}
                      </p>
                      <p className="text-muted-foreground">Active: {formatDuration(elapsed)}</p>
                    </>
                  }
                >
                  <div className="h-5 relative cursor-pointer">
                    {intervals.map((interval, idx) => {
                      const left = (interval.startMs / timelineDuration) * 100;
                      const width = ((interval.endMs - interval.startMs) / timelineDuration) * 100;
                      const durationMs = interval.endMs - interval.startMs;

                      return (
                        <CursorTooltip
                          key={idx}
                          asChild
                          content={
                            <>
                              <p className="font-medium">{sub.name}</p>
                              <p>
                                {formatTimeShort(interval.startMs)} → {formatTimeShort(interval.endMs)}
                              </p>
                              <p className="text-muted-foreground">{formatDuration(durationMs)}</p>
                            </>
                          }
                        >
                          <div
                            className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded shadow-sm border border-emerald-500/30"
                            style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 0.5)}%` }}
                          />
                        </CursorTooltip>
                      );
                    })}

                    {/* Mark points */}
                    {sub.marks.map((mark, idx) => {
                      const left = (mark.headTimeMs / timelineDuration) * 100;
                      return (
                        <CursorTooltip
                          key={idx}
                          asChild
                          content={
                            <>
                              <p className="font-medium">{sub.name}</p>
                              <p>
                                {mark.action === 'start' ? 'Start' : 'Pause'} @ {formatTimeShort(mark.headTimeMs)}
                              </p>
                            </>
                          }
                        >
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-background ${
                              mark.action === 'start' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ left: `${left}%` }}
                          />
                        </CursorTooltip>
                      );
                    })}

                    {/* Currently running indicator */}
                    {sub.running && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-emerald-500 animate-pulse"
                        style={{ left: `${Math.min((headElapsedMs / timelineDuration) * 100, 100)}%` }}
                      />
                    )}
                  </div>
                </CursorTooltip>

                <div className="w-8 text-right flex-shrink-0">
                  <span className="text-[8px] text-muted-foreground tabular-nums">{formatDuration(elapsed)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Compact legend */}
        <div className="flex items-center gap-2 mt-1.5 pt-1 border-t border-border/20">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-primary/40 to-primary/30" />
            <span className="text-[7px] text-muted-foreground">Total</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-emerald-500 to-emerald-400" />
            <span className="text-[7px] text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[7px] text-muted-foreground">Pause Mark</span>
          </div>
        </div>
      </div>
    </div>
  );
}
