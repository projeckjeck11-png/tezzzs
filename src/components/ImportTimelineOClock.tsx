import { useState, useRef } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Scissors, FileText, Clock, Save, Upload, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CursorTooltip } from '@/components/CursorTooltip';
import { saveTextFile, openTextFile } from '@/lib/textFile';
import { FullscreenChart } from '@/components/FullscreenChart';
import { VisualizationErrorBoundary } from '@/components/VisualizationErrorBoundary';
interface TimelineInterval {
  id: string;
  startTime: string; // Format: "HH:MM"
  endTime: string; // Format: "HH:MM"
}
interface ImportSubChannel {
  id: string;
  name: string;
  intervals: TimelineInterval[];
  expanded: boolean;
  isCutoff?: boolean; // Cutoff timer flag - non-operational time
}
interface ImportHeadChannel {
  id: string;
  name: string;
  startTime: string; // e.g. "07:00"
  endTime: string; // e.g. "14:00"
  subChannels: ImportSubChannel[];
  expanded: boolean;
}
interface ImportTimelineOClockProps {
  onClose: () => void;
}
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Convert "HH:MM" to minutes from midnight
function timeToMinutes(time?: string | number | null): number {
  if (typeof time === 'number') return Number.isFinite(time) ? time : 0;
  if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

// Convert minutes to "HH:MM" format
function minutesToTime(mins: number): string {
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Calculate duration between two times in minutes
function getDurationMinutes(startTime: string, endTime: string): number {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime));
}

// Format duration in minutes to readable string
function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// Calculate actual active time for a sub-channel after cutoff slicing
interface CutoffInterval {
  startMins: number;
  endMins: number;
}
function calculateSlicedDuration(intervals: {
  startTime: string;
  endTime: string;
}[], cutoffs: CutoffInterval[]): number {
  let totalMins = 0;
  for (const interval of intervals) {
    const intStart = timeToMinutes(interval.startTime);
    const intEnd = timeToMinutes(interval.endTime);

    // Create segments that are NOT cut by cutoffs
    let segments: {
      start: number;
      end: number;
    }[] = [{
      start: intStart,
      end: intEnd
    }];
    for (const cutoff of cutoffs) {
      const newSegments: {
        start: number;
        end: number;
      }[] = [];
      for (const seg of segments) {
        // If cutoff doesn't overlap, keep segment as-is
        if (cutoff.endMins <= seg.start || cutoff.startMins >= seg.end) {
          newSegments.push(seg);
        } else {
          // Cutoff overlaps - split segment
          if (cutoff.startMins > seg.start) {
            newSegments.push({
              start: seg.start,
              end: cutoff.startMins
            });
          }
          if (cutoff.endMins < seg.end) {
            newSegments.push({
              start: cutoff.endMins,
              end: seg.end
            });
          }
        }
      }
      segments = newSegments;
    }

    // Sum remaining segments
    for (const seg of segments) {
      totalMins += seg.end - seg.start;
    }
  }
  return totalMins;
}

// Get visual segments for sub-channel intervals after cutoff slicing
function getSlicedSegments(intervals: {
  id: string;
  startTime: string;
  endTime: string;
}[], cutoffs: CutoffInterval[], headStartMins: number, totalDurationMins: number): {
  id: string;
  left: number;
  width: number;
  startTime: string;
  endTime: string;
}[] {
  const result: {
    id: string;
    left: number;
    width: number;
    startTime: string;
    endTime: string;
  }[] = [];
  for (const interval of intervals) {
    const intStart = timeToMinutes(interval.startTime);
    const intEnd = timeToMinutes(interval.endTime);
    let segments: {
      start: number;
      end: number;
    }[] = [{
      start: intStart,
      end: intEnd
    }];
    for (const cutoff of cutoffs) {
      const newSegments: {
        start: number;
        end: number;
      }[] = [];
      for (const seg of segments) {
        if (cutoff.endMins <= seg.start || cutoff.startMins >= seg.end) {
          newSegments.push(seg);
        } else {
          if (cutoff.startMins > seg.start) {
            newSegments.push({
              start: seg.start,
              end: cutoff.startMins
            });
          }
          if (cutoff.endMins < seg.end) {
            newSegments.push({
              start: cutoff.endMins,
              end: seg.end
            });
          }
        }
      }
      segments = newSegments;
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const left = (seg.start - headStartMins) / totalDurationMins * 100;
      const width = (seg.end - seg.start) / totalDurationMins * 100;
      result.push({
        id: `${interval.id}-seg-${i}`,
        left,
        width,
        startTime: minutesToTime(seg.start),
        endTime: minutesToTime(seg.end)
      });
    }
  }
  return result;
}
interface TimelineVisualizationProps {
  headChannels: ImportHeadChannel[];
  showCutoff: boolean;
}
function TimelineVisualization({
  headChannels,
  showCutoff
}: TimelineVisualizationProps) {
  const safeHeadChannels = headChannels ?? [];
  if (safeHeadChannels.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">
        Add a Head Channel to view visualization
      </div>;
  }
  return <div className="space-y-6">
      {safeHeadChannels.map(head => {
      const subChannels = head.subChannels ?? [];
      const headStartMins = timeToMinutes(head.startTime);
      const headEndMins = timeToMinutes(head.endTime);
      const totalDurationMins = headEndMins - headStartMins;
      if (totalDurationMins <= 0) return null;

      // Calculate total cutoff time from cutoff sub-channels
      const cutoffSubs = subChannels.filter(s => s.isCutoff);
      const totalCutoffMins = cutoffSubs.reduce((acc, sub) => {
        const intervals = sub.intervals ?? [];
        return acc + intervals.reduce((intAcc, int) => {
          return intAcc + getDurationMinutes(int.startTime, int.endTime);
        }, 0);
      }, 0);

      // Net operational duration
      const netOperationalMins = totalDurationMins - totalCutoffMins;

      // Display duration depends on showCutoff: full if shown, net if hidden
      const displayDurationMins = showCutoff ? totalDurationMins : netOperationalMins;
      if (displayDurationMins <= 0) return null;

      // Generate time markers - always use 30 minute intervals with minutes as label
      const timeMarkers: {
        mins: number;
        label: string;
      }[] = [];
      const stepMinutes = 30; // Fixed 30 minute intervals
      for (let mins = 0; mins <= displayDurationMins; mins += stepMinutes) {
        timeMarkers.push({
          mins,
          label: mins.toString()
        });
      }
      // Add final marker if not on 30min boundary
      if (displayDurationMins % 30 !== 0) {
        timeMarkers.push({
          mins: displayDurationMins,
          label: Math.round(displayDurationMins).toString()
        });
      }
      return <FullscreenChart key={head.id} title={`${head.name} Timeline`}><div className="bg-gradient-to-b from-card to-card/80 rounded-xl p-2 shadow-lg border border-border/50 backdrop-blur-sm">
            {/* Compact Single-line Header */}
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-semibold text-foreground tracking-tight">
                {head.name} <span className="text-muted-foreground font-normal">|</span> <span className="text-[10px] font-normal text-muted-foreground">{head.startTime} – {head.endTime}</span>
              </h3>
              {totalCutoffMins > 0 && <div className="px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                  <span className="text-[9px] font-medium text-rose-400">-{formatDuration(totalCutoffMins)}</span>
                </div>}
            </div>

            {/* Timeline Container - Maximized space */}
            <div className="relative">
              {/* Time markers - 30 min intervals based on display duration */}
              <div className="flex items-end mb-0.5 ml-12 mr-8">
                <div className="flex-1 relative h-4">
                  {timeMarkers.map((marker, idx) => {
                const pct = marker.mins / displayDurationMins * 100;
                const isFirst = idx === 0;
                const isLast = idx === timeMarkers.length - 1;
                return <div key={idx} className="absolute flex flex-col items-center" style={{
                  left: `${pct}%`,
                  transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
                }}>
                        <span className="text-[9px] font-medium text-muted-foreground tabular-nums">
                          {marker.label}
                        </span>
                        <div className="w-px h-1 bg-border/60 mt-0.5" />
                      </div>;
              })}
                </div>
              </div>

              {/* Timeline Bars - Lean layout */}
              <div className="space-y-0.5">
                {/* Head channel bar */}
                <div className="flex items-center gap-1">
                  <div className="w-10 text-right pr-1 flex-shrink-0">
                    <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                  </div>
                  <CursorTooltip content={
                    <>
                      <p className="font-medium">{head.startTime} → {head.endTime}</p>
                      <p className="text-muted-foreground">Net: {formatDuration(netOperationalMins)} ({netOperationalMins} min)</p>
                    </>
                  }>
                    <div className="h-6 bg-gradient-to-r from-primary/20 to-primary/10 rounded relative overflow-hidden border border-primary/20 cursor-pointer">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-primary/20" />
                      
                      {/* Cutoff overlays */}
                      {showCutoff && cutoffSubs.map(sub => (sub.intervals ?? []).map(interval => {
                    const intStart = timeToMinutes(interval.startTime);
                    const intEnd = timeToMinutes(interval.endTime);
                    const left = (intStart - headStartMins) / totalDurationMins * 100;
                    const width = (intEnd - intStart) / totalDurationMins * 100;
                    return <div key={interval.id} className="absolute top-0 h-full bg-rose-500/50 backdrop-blur-sm" style={{
                      left: `${Math.max(0, left)}%`,
                      width: `${Math.max(width, 0.5)}%`,
                      backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)'
                    }} />;
                  }))}
                    </div>
                  </CursorTooltip>
                  <div className="w-8 text-right flex-shrink-0">
                    <span className="text-[9px] font-semibold text-foreground tabular-nums">{formatDuration(netOperationalMins)}</span>
                  </div>
                </div>

                {/* Sub channel bars - Lean style with tooltips */}
                {subChannels.filter(s => !s.isCutoff).map(sub => {
              const intervals = sub.intervals ?? [];
              if (intervals.length === 0) return null;
              const cutoffIntervals: CutoffInterval[] = cutoffSubs.flatMap(cs =>
                (cs.intervals ?? []).map(int => ({
                  startMins: timeToMinutes(int.startTime),
                  endMins: timeToMinutes(int.endTime)
                }))
              );
              const slicedActiveMins = calculateSlicedDuration(intervals, cutoffIntervals);
              const slicedSegments = getSlicedSegments(intervals, cutoffIntervals, headStartMins, totalDurationMins);
              const firstInt = intervals[0];
              const lastInt = intervals[intervals.length - 1];
              return <div key={sub.id} className="flex items-center gap-1">
                      <div className="w-10 text-right pr-1 flex-shrink-0 flex items-center justify-end gap-0.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                        <span className="text-[8px] text-muted-foreground truncate block">{sub.name}</span>
                      </div>
                      <CursorTooltip content={
                        <>
                          <p className="font-medium">{sub.name}</p>
                          <p>{firstInt?.startTime || '-'} → {lastInt?.endTime || '-'}</p>
                          <p className="text-muted-foreground">Active: {formatDuration(slicedActiveMins)} ({slicedActiveMins} min)</p>
                        </>
                      } flex={false}>
                        <div className="flex-1 h-5 relative cursor-pointer">
                          {slicedSegments.map(segment => {
                            const segmentDuration = getDurationMinutes(segment.startTime, segment.endTime);
                            return (
                              <CursorTooltip
                                key={segment.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium">{sub.name}</p>
                                    <p>{segment.startTime} → {segment.endTime}</p>
                                    <p className="text-muted-foreground">Active: {formatDuration(segmentDuration)} ({segmentDuration} min)</p>
                                  </>
                                }
                              >
                                <div 
                                  className="absolute top-0 bottom-0 rounded shadow-sm bg-gradient-to-r from-emerald-500 to-emerald-400 border border-emerald-500/30" 
                                  style={{
                                    left: `${Math.max(0, segment.left)}%`,
                                    width: `${Math.max(segment.width, 0.5)}%`
                                  }} />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div className="w-8 text-right flex-shrink-0">
                        <span className="text-[8px] text-muted-foreground tabular-nums">{formatDuration(slicedActiveMins)}</span>
                      </div>
                    </div>;
            })}

                {/* Cutoff sub channels - Lean with tooltips */}
                {showCutoff && cutoffSubs.map(sub => {
              const intervals = sub.intervals ?? [];
              if (intervals.length === 0) return null;
              const totalCutMins = intervals.reduce((acc, int) => {
                return acc + getDurationMinutes(int.startTime, int.endTime);
              }, 0);
              const firstCut = intervals[0];
              const lastCut = intervals[intervals.length - 1];
              return <div key={sub.id} className="flex items-center gap-1">
                      <div className="w-10 text-right pr-1 flex items-center justify-end gap-0.5 flex-shrink-0">
                        <Scissors className="w-2 h-2 text-rose-400" />
                        <span className="text-[8px] text-rose-400 truncate">{sub.name}</span>
                      </div>
                      <CursorTooltip content={
                        <>
                          <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                          <p>{firstCut?.startTime || '-'} → {lastCut?.endTime || '-'}</p>
                          <p className="text-muted-foreground">Deducted: {formatDuration(totalCutMins)} ({totalCutMins} min)</p>
                        </>
                      } flex={false}>
                        <div className="flex-1 h-5 relative cursor-pointer">
                          {intervals.map(interval => {
                            const intStart = timeToMinutes(interval.startTime);
                            const intEnd = timeToMinutes(interval.endTime);
                            const left = (intStart - headStartMins) / totalDurationMins * 100;
                            const width = (intEnd - intStart) / totalDurationMins * 100;
                            const intervalDuration = getDurationMinutes(interval.startTime, interval.endTime);
                            return (
                              <CursorTooltip
                                key={interval.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                                    <p>{interval.startTime} → {interval.endTime}</p>
                                    <p className="text-muted-foreground">Deducted: {formatDuration(intervalDuration)} ({intervalDuration} min)</p>
                                  </>
                                }
                              >
                                <div className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500 to-rose-400 rounded shadow-sm border border-rose-500/30" style={{
                                  left: `${Math.max(0, left)}%`,
                                  width: `${Math.max(width, 0.5)}%`,
                                  backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)'
                                }} />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div className="w-8 text-right flex-shrink-0">
                        <span className="text-[8px] text-rose-400 tabular-nums">-{formatDuration(totalCutMins)}</span>
                      </div>
                    </div>;
            })}
              </div>

              {/* Compact Legend */}
              <div className="flex items-center gap-2 mt-1.5 pt-1 border-t border-border/20">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-primary/40 to-primary/30" />
                  <span className="text-[7px] text-muted-foreground">Total</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-emerald-500 to-emerald-400" />
                  <span className="text-[7px] text-muted-foreground">Active</span>
                </div>
                {showCutoff && <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-rose-500 to-rose-400" />
                    <span className="text-[7px] text-rose-400">Cutoff</span>
                  </div>}
              </div>
            </div>
          </div></FullscreenChart>;
    })}
    </div>;
}
export function ImportTimelineOClock({
  onClose
}: ImportTimelineOClockProps) {
  const [headChannels, setHeadChannels] = useState<ImportHeadChannel[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showCutoffVisual, setShowCutoffVisual] = useState(false);
  const visualizationRef = useRef<HTMLDivElement>(null);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [copied, setCopied] = useState(false);

  // Merge overlapping intervals into non-overlapping segments
  const mergeIntervals = (intervals: { start: number; end: number }[]): { start: number; end: number }[] => {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      if (sorted[i].start <= last.end) {
        last.end = Math.max(last.end, sorted[i].end);
      } else {
        merged.push(sorted[i]);
      }
    }
    return merged;
  };

  // Calculate overlap between two sets of intervals
  const getOverlapBetweenIntervals = (
    intervals1: { start: number; end: number }[],
    intervals2: { start: number; end: number }[]
  ): number => {
    let totalOverlap = 0;
    for (const int1 of intervals1) {
      for (const int2 of intervals2) {
        const overlapStart = Math.max(int1.start, int2.start);
        const overlapEnd = Math.min(int1.end, int2.end);
        if (overlapEnd > overlapStart) {
          totalOverlap += overlapEnd - overlapStart;
        }
      }
    }
    return totalOverlap;
  };

  // Generate Summary Text Table - Clean ASCII format
  const generateSummaryText = () => {
    if (headChannels.length === 0) return;

    let text = '';
    const W = 78; // Consistent width for all tables

    const center = (str: string, width: number) => {
      const pad = Math.max(0, width - str.length);
      const left = Math.floor(pad / 2);
      return ' '.repeat(left) + str + ' '.repeat(pad - left);
    };

    const row = (cols: string[], widths: number[]) => {
      return '| ' + cols.map((c, i) => c.substring(0, widths[i]).padEnd(widths[i])).join(' | ') + ' |\n';
    };

    const divider = (widths: number[], char = '-') => {
      return '+' + widths.map(w => char.repeat(w + 2)).join('+') + '+\n';
    };

    // Full-width box helpers (consistent W)
    const fullWidthBorder = '+' + '-'.repeat(W) + '+\n';
    const fullWidthRow = (content: string) => '| ' + content.padEnd(W - 2) + ' |\n';

    // Header
    text += '+' + '='.repeat(W) + '+\n';
    text += '|' + center('TIMELINE SUMMARY REPORT', W) + '|\n';
    text += '|' + center('Generated: ' + new Date().toLocaleString(), W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n\n';

    headChannels.forEach((head, headIdx) => {
      const headStartMins = timeToMinutes(head.startTime);
      const headEndMins = timeToMinutes(head.endTime);
      const headDurationMins = headEndMins - headStartMins;
      
      const cutoffSubs = head.subChannels.filter(s => s.isCutoff);
      const cutoffIntervals: CutoffInterval[] = cutoffSubs.flatMap(cs => 
        cs.intervals.map(int => ({
          startMins: timeToMinutes(int.startTime),
          endMins: timeToMinutes(int.endTime)
        }))
      );
      const totalCutoffMins = cutoffIntervals.reduce((acc, c) => acc + (c.endMins - c.startMins), 0);
      const netHeadMins = headDurationMins - totalCutoffMins;

      // HEAD HEADER BOX - use consistent width W
      text += fullWidthBorder;
      text += fullWidthRow('HEAD ' + (headIdx + 1) + ': ' + head.name);
      text += fullWidthRow('Range: ' + head.startTime + ' -> ' + head.endTime + ' (' + formatDuration(headDurationMins) + ')');
      if (totalCutoffMins > 0) {
        text += fullWidthRow('Net Duration: ' + formatDuration(netHeadMins) + ' (Cutoff: -' + formatDuration(totalCutoffMins) + ')');
      }
      text += fullWidthBorder + '\n';

      // SUB CHANNELS TABLE with Raw, Net, Actual + Start-End columns
      const subs = head.subChannels.filter(s => !s.isCutoff);
      
      // Collect all intervals for actual calculation (merge overlaps)
      const allIntervalsForActual: { start: number; end: number; subName: string }[] = [];
      
      // Track individual actual per sub (after merging within sub) and sliced segments
      const subData: { 
        name: string; 
        rawMins: number; 
        netMins: number; 
        actualMins: number;
        rawIntervals: { startTime: string; endTime: string }[];
        slicedSegments: { start: number; end: number }[];
      }[] = [];

      // Format range as HH:MM-HH:MM
      const formatTimeRange = (segments: { start: number; end: number }[]): string => {
        if (segments.length === 0) return '-';
        return segments.map(s => `${minutesToTime(s.start)}-${minutesToTime(s.end)}`).join('; ');
      };

      const formatRawTimeRange = (intervals: { startTime: string; endTime: string }[]): string => {
        if (intervals.length === 0) return '-';
        return intervals.map(int => `${int.startTime}-${int.endTime}`).join('; ');
      };
      
      if (subs.length > 0) {
        // Pre-calculate all data to determine dynamic column widths
        const subDataRows: { name: string; cnt: string; raw: string; net: string; rawRange: string; actualRange: string; status: string }[] = [];
        
        subs.forEach(sub => {
          // Raw = sum of all intervals without any deduction
          const rawTotalMins = sub.intervals.reduce((acc, int) => 
            acc + getDurationMinutes(int.startTime, int.endTime), 0
          );
          
          // Net = after cutoff slicing
          const netMins = calculateSlicedDuration(sub.intervals, cutoffIntervals);
          
          // For actual: collect sliced segments with sub name
          const subSlicedSegments: { start: number; end: number }[] = [];
          
          sub.intervals.forEach(interval => {
            const intStart = timeToMinutes(interval.startTime);
            const intEnd = timeToMinutes(interval.endTime);
            let segments: { start: number; end: number }[] = [{ start: intStart, end: intEnd }];
            
            // Slice by cutoffs
            cutoffIntervals.forEach(cutoff => {
              const newSegs: { start: number; end: number }[] = [];
              segments.forEach(seg => {
                if (cutoff.endMins <= seg.start || cutoff.startMins >= seg.end) {
                  newSegs.push(seg);
                } else {
                  if (cutoff.startMins > seg.start) newSegs.push({ start: seg.start, end: cutoff.startMins });
                  if (cutoff.endMins < seg.end) newSegs.push({ start: cutoff.endMins, end: seg.end });
                }
              });
              segments = newSegs;
            });
            
            subSlicedSegments.push(...segments);
            allIntervalsForActual.push(...segments.map(s => ({ ...s, subName: sub.name })));
          });

          // Actual for this sub = merge overlaps within this sub's segments
          const mergedSubActual = mergeIntervals(subSlicedSegments);
          const subActualMins = mergedSubActual.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
          
          subData.push({ 
            name: sub.name, 
            rawMins: rawTotalMins, 
            netMins, 
            actualMins: subActualMins,
            rawIntervals: sub.intervals,
            slicedSegments: subSlicedSegments
          });

          const status = netMins < rawTotalMins ? 'Cut' : 'Full';
          const rawRange = formatRawTimeRange(sub.intervals);
          const actualRange = formatTimeRange(subSlicedSegments);
          
          subDataRows.push({
            name: sub.name,
            cnt: String(sub.intervals.length),
            raw: formatDuration(rawTotalMins),
            net: formatDuration(netMins),
            rawRange,
            actualRange,
            status
          });
        });

        // Calculate totals for dynamic width calculation
        const totalRawMins = subData.reduce((acc, s) => acc + s.rawMins, 0);
        const totalNetMins = subData.reduce((acc, s) => acc + s.netMins, 0);
        const mergedActual = mergeIntervals(allIntervalsForActual);
        const totalActualMins = mergedActual.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
        const sumOfIndividualActuals = subData.reduce((acc, s) => acc + s.actualMins, 0);
        const overlapMins = sumOfIndividualActuals - totalActualMins;
        const totalActualRange = formatTimeRange(mergedActual);

        // Calculate dynamic column widths based on content
        const headers = ['Name', 'Cnt', 'Raw', 'Net', 'Actual', 'Raw Start-End', 'Actual Start-End', 'Status'];
        const totalRow = ['TOTAL', '', formatDuration(totalRawMins), formatDuration(totalNetMins), formatDuration(totalActualMins), '', totalActualRange, ''];
        
        const dynColW = headers.map((h, i) => {
          let maxLen = h.length;
          subDataRows.forEach(row => {
            const vals = [row.name, row.cnt, row.raw, row.net, row.net, row.rawRange, row.actualRange, row.status];
            maxLen = Math.max(maxLen, vals[i].length);
          });
          maxLen = Math.max(maxLen, totalRow[i].length);
          // Add minimum widths for certain columns
          if (i === 0) maxLen = Math.max(maxLen, 10); // Name min
          if (i === 1) maxLen = Math.max(maxLen, 3);  // Cnt min
          if (i === 7) maxLen = Math.max(maxLen, 4);  // Status min
          return maxLen;
        });

        text += 'SUB CHANNELS\n';
        text += divider(dynColW);
        text += row(headers, dynColW);
        text += divider(dynColW);

        subDataRows.forEach(data => {
          text += row([data.name, data.cnt, data.raw, data.net, data.net, data.rawRange, data.actualRange, data.status], dynColW);
        });

        text += divider(dynColW);
        text += row(totalRow, dynColW);
        text += divider(dynColW, '=') + '\n';

        // Legend with overlap info
        if (overlapMins > 0) {
          text += 'Note: Raw = sum all, Net = after cutoff, Actual = merged overlaps (overlap: ' + formatDuration(overlapMins) + ')\n\n';
        } else {
          text += 'Note: Times in HH:MM format. Raw = sum all, Net = after cutoff, Actual = merged overlaps\n\n';
        }
        
        // REMARKS SECTION
        text += 'REMARKS\n';
        text += '-'.repeat(W) + '\n';
        
        if (totalCutoffMins > 0) {
          text += '• Total cutoff time: ' + formatDuration(totalCutoffMins) + '\n';
        }
        
        if (overlapMins > 0) {
          text += '• Overlapping time between sub-channels:\n';
          
          // Calculate pairwise overlaps
          const overlapDetails: { sub1: string; sub2: string; overlap: number }[] = [];
          
          for (let i = 0; i < subData.length; i++) {
            for (let j = i + 1; j < subData.length; j++) {
              const overlap = getOverlapBetweenIntervals(
                subData[i].slicedSegments,
                subData[j].slicedSegments
              );
              if (overlap > 0) {
                overlapDetails.push({
                  sub1: subData[i].name,
                  sub2: subData[j].name,
                  overlap
                });
              }
            }
          }
          
          // Show each overlap pair
          overlapDetails.forEach(detail => {
            text += '  - ' + detail.sub1 + ' ↔ ' + detail.sub2 + ': ' + formatDuration(detail.overlap) + '\n';
          });
          
          text += '  ─────────────────────────────────────\n';
          text += '  Total overlap: ' + formatDuration(overlapMins) + '\n';
          text += '  (Time counted only once in total actual)\n';
        }
        
        // Show merged actual segments
        if (mergedActual.length > 0) {
          text += '• Actual time segments (after merging overlaps):\n';
          mergedActual.forEach((seg, idx) => {
            text += '  ' + (idx + 1) + '. ' + minutesToTime(seg.start) + ' -> ' + minutesToTime(seg.end) + ' (' + formatDuration(seg.end - seg.start) + ')\n';
          });
        }
        
        text += '\n';
      }

      // CUTOFF TABLE - also use full width columns
      if (cutoffSubs.length > 0) {
        const cutW = [36, 22, 12];
        text += 'CUTOFF (Non-Operational)\n';
        text += divider(cutW);
        text += row(['Name', 'Time Range', 'Duration'], cutW);
        text += divider(cutW);

        cutoffSubs.forEach(sub => {
          sub.intervals.forEach((interval, idx) => {
            const cutDuration = getDurationMinutes(interval.startTime, interval.endTime);
            const name = sub.intervals.length > 1 ? sub.name + ' [' + (idx + 1) + ']' : sub.name;
            text += row([name, interval.startTime + ' -> ' + interval.endTime, formatDuration(cutDuration)], cutW);
          });
        });

        text += divider(cutW);
        text += row(['TOTAL CUTOFF', '', formatDuration(totalCutoffMins)], cutW);
        text += divider(cutW, '=') + '\n';
      }

      // INTERVAL DETAILS
      if (subs.length > 0) {
        text += 'INTERVAL DETAILS\n';
        text += '-'.repeat(50) + '\n';
        
        subs.forEach(sub => {
          if (sub.intervals.length > 0) {
            text += '> ' + sub.name + '\n';
            sub.intervals.forEach((interval, idx) => {
              const intDur = getDurationMinutes(interval.startTime, interval.endTime);
              text += '  ' + (idx + 1) + '. ' + interval.startTime + ' -> ' + interval.endTime + ' (' + formatDuration(intDur) + ')\n';
            });
            text += '\n';
          }
        });
      }
    });

    text += '+' + '='.repeat(W) + '+\n';
    text += '|' + center('END OF REPORT', W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n';

    setSummaryText(text);
    setShowSummaryModal(true);
    setCopied(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      toast.success('Summary copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  // Add new head channel
  const addHeadChannel = () => {
    const newHead: ImportHeadChannel = {
      id: generateId(),
      name: `Head ${headChannels.length + 1}`,
      startTime: '07:00',
      endTime: '14:00',
      subChannels: [],
      expanded: true
    };
    setHeadChannels([...headChannels, newHead]);
  };

  // Delete head channel
  const deleteHeadChannel = (headId: string) => {
    setHeadChannels(headChannels.filter(h => h.id !== headId));
  };

  // Update head channel
  const updateHeadChannel = (headId: string, updates: Partial<ImportHeadChannel>) => {
    setHeadChannels(headChannels.map(h => h.id === headId ? {
      ...h,
      ...updates
    } : h));
  };

  // Toggle head channel expand
  const toggleHeadExpand = (headId: string) => {
    setHeadChannels(headChannels.map(h => h.id === headId ? {
      ...h,
      expanded: !h.expanded
    } : h));
  };

  // Add sub channel to head
  const addSubChannel = (headId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      const newSub: ImportSubChannel = {
        id: generateId(),
        name: `Sub ${h.subChannels.filter(s => !s.isCutoff).length + 1}`,
        intervals: [],
        expanded: true,
        isCutoff: false
      };
      return {
        ...h,
        subChannels: [...h.subChannels, newSub]
      };
    }));
  };

  // Add cutoff timer to head (special sub channel for non-operational time)
  const addCutoffTimer = (headId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      const cutoffCount = h.subChannels.filter(s => s.isCutoff).length;
      const newCutoff: ImportSubChannel = {
        id: generateId(),
        name: `Cutoff ${cutoffCount + 1}`,
        intervals: [],
        expanded: true,
        isCutoff: true
      };
      return {
        ...h,
        subChannels: [...h.subChannels, newCutoff]
      };
    }));
  };

  // Delete sub channel
  const deleteSubChannel = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.filter(s => s.id !== subId)
      };
    }));
  };

  // Update sub channel
  const updateSubChannel = (headId: string, subId: string, updates: Partial<ImportSubChannel>) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => s.id === subId ? {
          ...s,
          ...updates
        } : s)
      };
    }));
  };

  // Toggle sub channel expand
  const toggleSubExpand = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => s.id === subId ? {
          ...s,
          expanded: !s.expanded
        } : s)
      };
    }));
  };

  // Add interval to sub channel
  const addInterval = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => {
          if (s.id !== subId) return s;
          // Get last interval end time as new start, or head start time
          const lastEnd = s.intervals.length > 0 ? s.intervals[s.intervals.length - 1].endTime : h.startTime;
          const lastEndMins = timeToMinutes(lastEnd);
          const headEndMins = timeToMinutes(h.endTime);
          const newEndMins = Math.min(lastEndMins + 30, headEndMins);
          const newInterval: TimelineInterval = {
            id: generateId(),
            startTime: lastEnd,
            endTime: minutesToTime(newEndMins)
          };
          return {
            ...s,
            intervals: [...s.intervals, newInterval]
          };
        })
      };
    }));
  };

  // Delete interval
  const deleteInterval = (headId: string, subId: string, intervalId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => {
          if (s.id !== subId) return s;
          return {
            ...s,
            intervals: s.intervals.filter(i => i.id !== intervalId)
          };
        })
      };
    }));
  };

  // Update interval
  const updateInterval = (headId: string, subId: string, intervalId: string, updates: Partial<TimelineInterval>) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => {
          if (s.id !== subId) return s;
          return {
            ...s,
            intervals: s.intervals.map(i => i.id === intervalId ? {
              ...i,
              ...updates
            } : i)
          };
        })
      };
    }));
  };

  // Calculate head summary with cutoff consideration
  const getHeadSummary = (head: ImportHeadChannel) => {
    const totalMins = getDurationMinutes(head.startTime, head.endTime);
    const subChannels = head.subChannels ?? [];
    const cutoffMins = subChannels
      .filter(s => s.isCutoff)
      .reduce(
        (acc, s) =>
          acc +
          (s.intervals ?? []).reduce(
            (intAcc, int) => intAcc + getDurationMinutes(int.startTime, int.endTime),
            0
          ),
        0
      );
    return {
      totalMins,
      cutoffMins,
      netMins: totalMins - cutoffMins
    };
  };

  // Save to compact JSON (TXT file)
  const saveToJson = async () => {
    if (headChannels.length === 0) {
      toast.error('No data to save');
      return;
    }
    // Create compact format: h=heads, s=subs, i=intervals, n=name, st=start, et=end, c=cutoff
    const data = headChannels.map(h => ({
      n: h.name,
      st: h.startTime,
      et: h.endTime,
      s: h.subChannels.map(sc => ({
        n: sc.name,
        c: sc.isCutoff ? 1 : 0,
        i: sc.intervals.map(int => [int.startTime, int.endTime])
      }))
    }));
    const jsonStr = JSON.stringify(data);
    const result = await saveTextFile(jsonStr, 'timeline-oclock.txt');
    if (result.ok) {
      toast.success('File saved');
    } else if (result.reason === 'unsupported') {
      toast.error('File save is not supported in this environment');
    } else if (result.reason === 'error') {
      toast.error('Failed to save file');
      console.error(result.error);
    }
  };

  // Import from JSON
  const importFromJson = async () => {
    const fileResult = await openTextFile();
    let input: string | null = null;

    if (fileResult.ok) {
      input = fileResult.text;
    } else if (fileResult.reason === 'unsupported') {
      input = prompt('Paste previously saved JSON data:');
    } else if (fileResult.reason === 'error') {
      toast.error('Failed to open file');
      console.error(fileResult.error);
      return;
    } else {
      return;
    }

    if (!input) return;

    const cleaned = input
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const data = JSON.parse(cleaned);
      if (!Array.isArray(data)) throw new Error('Invalid format');
      const imported: ImportHeadChannel[] = data.map((h: any) => ({
        id: generateId(),
        name: h.n || 'Head',
        startTime: h.st || '07:00',
        endTime: h.et || '14:00',
        expanded: true,
        subChannels: (h.s || []).map((sc: any) => ({
          id: generateId(),
          name: sc.n || 'Sub',
          isCutoff: sc.c === 1,
          expanded: true,
          intervals: (sc.i || []).map((int: any) => ({
            id: generateId(),
            startTime: int?.[0] || '07:00',
            endTime: int?.[1] || '07:30'
          }))
        }))
      }));
      setHeadChannels(imported);
      toast.success(`Successfully imported ${imported.length} head channel(s)!`);
    } catch {
      toast.error('Invalid JSON format');
    }
  };

  const hasData = headChannels.length > 0;
  return <div className="bg-secondary rounded-xl p-4 relative">
      {/* Close button */}
      <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center transition-all" aria-label="Close">
        <X className="w-3.5 h-3.5" />
      </button>

      <h3 className="text-sm font-semibold text-foreground mb-3">Timeline Builder (O'Clock)</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Head Channel = time range (07:00 → 14:00) · Sub Channel = activity · Cutoff = non-operational time
      </p>

      {/* Builder UI */}
      <div className="space-y-3">
        {/* Action Buttons Row */}
        <div className="flex items-center gap-2">
          <button onClick={addHeadChannel} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Head Channel
          </button>
          
          <button onClick={saveToJson} disabled={!hasData} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="w-3.5 h-3.5" />
            Save TXT
          </button>
          
          <button onClick={importFromJson} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            Import TXT
          </button>
        </div>

        {/* Head Channels List */}
        {headChannels.map(head => {
        const summary = getHeadSummary(head);
        return <div key={head.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
              {/* Head Channel Header */}
              <div className="flex items-center gap-2">
                <button onClick={() => toggleHeadExpand(head.id)} className="text-muted-foreground hover:text-foreground">
                  {head.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <span className="text-xs text-primary font-medium">📌</span>

                <input type="text" value={head.name} onChange={e => updateHeadChannel(head.id, {
              name: e.target.value
            })} className="flex-1 bg-transparent text-sm font-medium text-foreground border-none focus:outline-none focus:ring-0" placeholder="Head Channel Name" />

                <div className="flex items-center gap-1">
                  <input type="time" value={head.startTime} onChange={e => updateHeadChannel(head.id, {
                startTime: e.target.value
              })} className="bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input type="time" value={head.endTime} onChange={e => updateHeadChannel(head.id, {
                endTime: e.target.value
              })} className="bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                </div>

                {/* Duration with cutoff info */}
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="font-medium text-foreground">{formatDuration(summary.netMins)}</span>
                  {summary.cutoffMins > 0 && <span className="text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">(-{formatDuration(summary.cutoffMins)})</span>}
                </div>

                <button onClick={() => deleteHeadChannel(head.id)} className="w-6 h-6 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Head Channel Content */}
              {head.expanded && <div className="pl-6 space-y-2">
                  {/* Action Buttons - Apple style */}
                  <div className="flex items-center gap-3">
                    {/* Apple-like Add Sub Channel Button - Emerald theme */}
                    <button onClick={() => addSubChannel(head.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                        bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                        shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40
                        hover:scale-105 active:scale-95
                        border border-emerald-400/30">
                      <Plus className="w-3 h-3" />
                      Add Sub Channel
                    </button>

                    {/* Apple-like Cutoff Timer Button - Rose theme */}
                    <button onClick={() => addCutoffTimer(head.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                        bg-gradient-to-r from-rose-500 to-pink-500 text-white
                        shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40
                        hover:scale-105 active:scale-95
                        border border-rose-400/30">
                      <Scissors className="w-3 h-3" />
                      Add Cutoff Timer
                    </button>
                  </div>

                  {/* Sub Channels (Regular) */}
                  {head.subChannels.filter(s => !s.isCutoff).map(sub => <div key={sub.id} className="bg-background/50 rounded-lg p-2 space-y-2">
                      {/* Sub Channel Header */}
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSubExpand(head.id, sub.id)} className="text-muted-foreground hover:text-foreground">
                          {sub.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-[10px] text-muted-foreground">└</span>

                        <input type="text" value={sub.name} onChange={e => updateSubChannel(head.id, sub.id, {
                  name: e.target.value
                })} className="flex-1 bg-transparent text-xs text-foreground border-none focus:outline-none focus:ring-0" placeholder="Sub Channel Name" />

                        <span className="text-[10px] text-muted-foreground">
                          {sub.intervals.length} interval
                        </span>

                        <button onClick={() => deleteSubChannel(head.id, sub.id)} className="w-5 h-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Sub Channel Intervals */}
                      {sub.expanded && <div className="pl-5 space-y-1">
                          {/* Add Interval Button */}
                          <button onClick={() => addInterval(head.id, sub.id)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors">
                            <Plus className="w-2.5 h-2.5" />
                            Add Timeline (Start → Pause)
                          </button>

                          {/* Intervals */}
                          {sub.intervals.map((interval, idx) => <div key={interval.id} className="flex items-center gap-2 text-[10px]">
                              <span className="text-muted-foreground w-4">{idx + 1}.</span>

                              <div className="flex items-center gap-1">
                                <span className="text-green-500">▶</span>
                                <input type="time" value={interval.startTime} onChange={e => updateInterval(head.id, sub.id, interval.id, {
                      startTime: e.target.value
                    })} className="bg-muted rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50" />
                              </div>

                              <span className="text-muted-foreground">→</span>

                              <div className="flex items-center gap-1">
                                <span className="text-orange-500">⏸</span>
                                <input type="time" value={interval.endTime} onChange={e => updateInterval(head.id, sub.id, interval.id, {
                      endTime: e.target.value
                    })} className="bg-muted rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50" />
                              </div>

                              <span className="text-muted-foreground">
                                ({formatDuration(getDurationMinutes(interval.startTime, interval.endTime))} active)
                              </span>

                              <button onClick={() => deleteInterval(head.id, sub.id, interval.id)} className="w-4 h-4 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors ml-auto">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>)}

                          {sub.intervals.length === 0 && <div className="text-[10px] text-muted-foreground italic pl-4">
                              No timeline yet. Click "Add Timeline" to add one.
                            </div>}
                        </div>}
                    </div>)}

                  {/* Cutoff Timer Sub Channels */}
                  {head.subChannels.filter(s => s.isCutoff).map(sub => <div key={sub.id} className="rounded-lg p-2 space-y-2 border-2 border-rose-400/50 bg-gradient-to-br from-rose-500/20 to-pink-500/20">
                      {/* Cutoff Header */}
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSubExpand(head.id, sub.id)} className="text-rose-300 hover:text-rose-100">
                          {sub.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>

                        <Scissors className="w-3 h-3 text-rose-300" />

                        <input type="text" value={sub.name} onChange={e => updateSubChannel(head.id, sub.id, {
                  name: e.target.value
                })} className="flex-1 bg-rose-500/20 border border-rose-400/40 rounded px-2 py-0.5 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-rose-400 placeholder:text-rose-300/70" placeholder="Cutoff Name (e.g., Break, Meeting)" />

                        <span className="text-[10px] text-white font-medium px-2 py-0.5 rounded-full bg-rose-500/50 border border-rose-300/50">
                          Non-Operational
                        </span>

                        <button onClick={() => deleteSubChannel(head.id, sub.id)} className="w-5 h-5 rounded-full hover:bg-rose-500/40 text-rose-300 hover:text-white flex items-center justify-center transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Cutoff Intervals */}
                      {sub.expanded && <div className="pl-5 space-y-1">
                          {/* Add Cutoff Interval Button */}
                          <button onClick={() => addInterval(head.id, sub.id)} className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-white font-medium bg-rose-500/40 hover:bg-rose-500/60 border border-rose-400/50 rounded transition-colors">
                            <Plus className="w-2.5 h-2.5" />
                            Add Cutoff Time
                          </button>

                          {/* Cutoff Intervals */}
                          {sub.intervals.map((interval, idx) => <div key={interval.id} className="flex items-center gap-2 text-[10px] bg-rose-500/10 rounded px-2 py-1">
                              <span className="text-white font-medium w-4">{idx + 1}.</span>

                              <div className="flex items-center gap-1">
                                <span className="text-rose-200">✂</span>
                                <input type="time" value={interval.startTime} onChange={e => updateInterval(head.id, sub.id, interval.id, {
                      startTime: e.target.value
                    })} className="bg-rose-500/40 border border-rose-300/60 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-rose-300" />
                              </div>

                              <span className="text-rose-200 font-bold">→</span>

                              <div className="flex items-center gap-1">
                                <span className="text-rose-200">✂</span>
                                <input type="time" value={interval.endTime} onChange={e => updateInterval(head.id, sub.id, interval.id, {
                      endTime: e.target.value
                    })} className="bg-rose-500/40 border border-rose-300/60 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-rose-300" />
                              </div>

                              <span className="text-white font-semibold bg-rose-500/50 px-1.5 py-0.5 rounded">
                                -{formatDuration(getDurationMinutes(interval.startTime, interval.endTime))}
                              </span>

                              <button onClick={() => deleteInterval(head.id, sub.id, interval.id)} className="w-4 h-4 rounded-full bg-rose-500/30 hover:bg-rose-500/60 text-white flex items-center justify-center transition-colors ml-auto">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>)}

                          {sub.intervals.length === 0 && <div className="text-[10px] text-rose-100 italic pl-4 py-1">
                              Add cutoff time to deduct from Head duration.
                            </div>}
                        </div>}
                    </div>)}

                  {head.subChannels.length === 0 && <div className="text-xs text-muted-foreground italic pl-2">
                      No sub channels or cutoff timers yet
                    </div>}
                </div>}
            </div>;
      })}

        {/* Empty state */}
        {!hasData && <div className="text-center text-muted-foreground py-4 text-sm">
            Click "Add Head Channel" to start building your timeline
          </div>}
      </div>

      {/* Visualize Button */}
      {hasData && <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowVisualization(!showVisualization)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/25">
            <Eye className="w-4 h-4" />
            {showVisualization ? 'Hide' : 'Show'} Visualization
          </button>

          {showVisualization && <button onClick={generateSummaryText} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg shadow-blue-500/25">
              <FileText className="w-4 h-4" />
              Export to Summary
            </button>}
        </div>}

      {/* Visualization - Apple Style */}
      {showVisualization && hasData && <div className="mt-6 pt-6 border-t border-border/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <h4 className="text-base font-semibold text-foreground tracking-tight">
                Timeline Visualization
              </h4>
            </div>
            {/* Cutoff Toggle */}
            <button onClick={() => setShowCutoffVisual(!showCutoffVisual)} className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full transition-all ${showCutoffVisual ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25' : 'bg-secondary text-muted-foreground border border-border hover:bg-secondary/80'}`}>
              {showCutoffVisual ? <>
                  <Eye className="w-3.5 h-3.5" />
                  Cutoff Visible
                </> : <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Cutoff Hidden
                </>}
            </button>
          </div>
          <div ref={visualizationRef}>
            <VisualizationErrorBoundary title="Timeline visualization failed">
              <TimelineVisualization headChannels={headChannels} showCutoff={showCutoffVisual} />
            </VisualizationErrorBoundary>
          </div>
        </div>}

      {/* Summary Modal */}
      {showSummaryModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSummaryModal(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] m-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Timeline Summary</h3>
                  <p className="text-xs text-muted-foreground">Copy the summary text below</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copyToClipboard} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button onClick={() => setShowSummaryModal(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="bg-muted/50 border border-border rounded-xl p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto leading-relaxed">
                {summaryText}
              </pre>
            </div>
          </div>
        </div>}
    </div>;
}
