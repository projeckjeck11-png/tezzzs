import { useState, useRef } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Scissors, FileText, Clock, Save, Upload, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CursorTooltip } from '@/components/CursorTooltip';

interface TimelineInterval {
  id: string;
  startMin: number;
  endMin: number;
}

interface ImportSubChannel {
  id: string;
  name: string;
  intervals: TimelineInterval[];
  expanded: boolean;
  isCutoff?: boolean;
}

interface ImportHeadChannel {
  id: string;
  name: string;
  totalMinutes: number;
  subChannels: ImportSubChannel[];
  expanded: boolean;
}

interface ImportTimelineProps {
  onClose: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Format duration in minutes to readable string
function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// Calculate duration between two minutes
function getDurationMinutes(startMin: number, endMin: number): number {
  return Math.max(0, endMin - startMin);
}

// Calculate actual active time for a sub-channel after cutoff slicing
interface CutoffInterval {
  startMins: number;
  endMins: number;
}

function calculateSlicedDuration(intervals: { startMin: number; endMin: number }[], cutoffs: CutoffInterval[]): number {
  let totalMins = 0;
  for (const interval of intervals) {
    const intStart = interval.startMin;
    const intEnd = interval.endMin;
    let segments: { start: number; end: number }[] = [{ start: intStart, end: intEnd }];
    
    for (const cutoff of cutoffs) {
      const newSegments: { start: number; end: number }[] = [];
      for (const seg of segments) {
        if (cutoff.endMins <= seg.start || cutoff.startMins >= seg.end) {
          newSegments.push(seg);
        } else {
          if (cutoff.startMins > seg.start) {
            newSegments.push({ start: seg.start, end: cutoff.startMins });
          }
          if (cutoff.endMins < seg.end) {
            newSegments.push({ start: cutoff.endMins, end: seg.end });
          }
        }
      }
      segments = newSegments;
    }
    for (const seg of segments) {
      totalMins += seg.end - seg.start;
    }
  }
  return totalMins;
}

// Get visual segments for sub-channel intervals after cutoff slicing
function getSlicedSegments(
  intervals: { id: string; startMin: number; endMin: number }[],
  cutoffs: CutoffInterval[],
  totalDurationMins: number
): { id: string; left: number; width: number; startMin: number; endMin: number }[] {
  const result: { id: string; left: number; width: number; startMin: number; endMin: number }[] = [];
  
  for (const interval of intervals) {
    const intStart = interval.startMin;
    const intEnd = interval.endMin;
    let segments: { start: number; end: number }[] = [{ start: intStart, end: intEnd }];
    
    for (const cutoff of cutoffs) {
      const newSegments: { start: number; end: number }[] = [];
      for (const seg of segments) {
        if (cutoff.endMins <= seg.start || cutoff.startMins >= seg.end) {
          newSegments.push(seg);
        } else {
          if (cutoff.startMins > seg.start) {
            newSegments.push({ start: seg.start, end: cutoff.startMins });
          }
          if (cutoff.endMins < seg.end) {
            newSegments.push({ start: cutoff.endMins, end: seg.end });
          }
        }
      }
      segments = newSegments;
    }
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const left = (seg.start / totalDurationMins) * 100;
      const width = ((seg.end - seg.start) / totalDurationMins) * 100;
      result.push({
        id: `${interval.id}-seg-${i}`,
        left,
        width,
        startMin: seg.start,
        endMin: seg.end
      });
    }
  }
  return result;
}

function TimelineVisualization({ headChannels, showCutoff }: { headChannels: ImportHeadChannel[]; showCutoff: boolean }) {
  if (headChannels.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4 text-xs">
        Add a Head Channel to view visualization
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {headChannels.map((head) => {
        const totalDurationMins = head.totalMinutes;
        if (totalDurationMins === 0) return null;

        const cutoffSubs = head.subChannels.filter(s => s.isCutoff);
        const totalCutoffMins = cutoffSubs.reduce((acc, sub) => 
          acc + sub.intervals.reduce((a, int) => a + getDurationMinutes(int.startMin, int.endMin), 0), 0);
        const netOperationalMins = totalDurationMins - totalCutoffMins;

        // Display duration depends on showCutoff: full if shown, net if hidden
        const displayDurationMins = showCutoff ? totalDurationMins : netOperationalMins;

        // Generate time markers - always use 30 minute intervals
        const timeMarkers: { mins: number; label: string }[] = [];
        const stepMinutes = 30; // Fixed 30 minute intervals
        for (let i = 0; i <= displayDurationMins; i += stepMinutes) {
          timeMarkers.push({ mins: i, label: i.toString() });
        }
        // Add final marker if not on 30min boundary
        if (displayDurationMins % 30 !== 0) {
          timeMarkers.push({ mins: displayDurationMins, label: Math.round(displayDurationMins).toString() });
        }

        return (
          <div key={head.id} className="bg-gradient-to-b from-card to-card/80 rounded-xl p-2 shadow-lg border border-border/50 backdrop-blur-sm">
            {/* Compact Single-line Header */}
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-semibold text-foreground tracking-tight">
                {head.name} <span className="text-muted-foreground font-normal">|</span> <span className="text-[10px] font-normal text-muted-foreground">{totalDurationMins}m total</span>
              </h3>
              {totalCutoffMins > 0 && (
                <div className="px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                  <span className="text-[9px] font-medium text-rose-400">-{formatDuration(totalCutoffMins)}</span>
                </div>
              )}
            </div>

            {/* Timeline Container */}
            <div className="relative">
              {/* Time markers */}
              <div className="flex items-end mb-0.5 ml-12 mr-8">
                <div className="flex-1 relative h-4">
                  {timeMarkers.map((marker, idx) => {
                    const pct = (marker.mins / displayDurationMins) * 100;
                    const isFirst = idx === 0;
                    const isLast = idx === timeMarkers.length - 1;
                    return (
                      <div
                        key={idx}
                        className="absolute flex flex-col items-center"
                        style={{
                          left: `${pct}%`,
                          transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
                        }}
                      >
                        <span className="text-[9px] font-medium text-muted-foreground tabular-nums">
                          {marker.label}
                        </span>
                        <div className="w-px h-1 bg-border/60 mt-0.5" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Bars */}
              <div className="space-y-0.5">
                {/* Head channel bar */}
                <div className="flex items-center gap-1">
                  <div className="w-10 text-right pr-1 flex-shrink-0">
                    <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                  </div>
                  <CursorTooltip content={
                    <>
                      <p className="font-medium">0m → {totalDurationMins}m</p>
                      <p className="text-muted-foreground">Net: {formatDuration(netOperationalMins)} ({netOperationalMins} min)</p>
                    </>
                  }>
                    <div className="h-6 bg-gradient-to-r from-primary/20 to-primary/10 rounded relative overflow-hidden border border-primary/20 cursor-pointer">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-primary/20" />
                      {/* Cutoff overlays */}
                      {showCutoff && cutoffSubs.map(sub => sub.intervals.map(interval => {
                        const left = (interval.startMin / totalDurationMins) * 100;
                        const width = ((interval.endMin - interval.startMin) / totalDurationMins) * 100;
                        return (
                          <div
                            key={interval.id}
                            className="absolute top-0 h-full bg-rose-500/50 backdrop-blur-sm"
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.max(width, 0.5)}%`,
                              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)'
                            }}
                          />
                        );
                      }))}
                    </div>
                  </CursorTooltip>
                  <div className="w-8 text-right flex-shrink-0">
                    <span className="text-[9px] font-semibold text-foreground tabular-nums">{formatDuration(netOperationalMins)}</span>
                  </div>
                </div>

                {/* Sub channel bars */}
                {head.subChannels.filter(s => !s.isCutoff).map(sub => {
                  const cutoffIntervals: CutoffInterval[] = cutoffSubs.flatMap(cs =>
                    cs.intervals.map(int => ({ startMins: int.startMin, endMins: int.endMin }))
                  );
                  const slicedActiveMins = calculateSlicedDuration(sub.intervals, cutoffIntervals);
                  const slicedSegments = getSlicedSegments(sub.intervals, cutoffIntervals, totalDurationMins);
                  const firstInt = sub.intervals[0];
                  const lastInt = sub.intervals[sub.intervals.length - 1];

                  return (
                    <div key={sub.id} className="flex items-center gap-1">
                      <div className="w-10 text-right pr-1 flex-shrink-0 flex items-center justify-end gap-0.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                        <span className="text-[8px] text-muted-foreground truncate block">{sub.name}</span>
                      </div>
                      <CursorTooltip content={
                        <>
                          <p className="font-medium">{sub.name}</p>
                          <p>{firstInt?.startMin || 0}m → {lastInt?.endMin || 0}m</p>
                          <p className="text-muted-foreground">Active: {formatDuration(slicedActiveMins)} ({slicedActiveMins} min)</p>
                        </>
                      } flex={false}>
                        <div className="flex-1 h-5 relative cursor-pointer">
                          {slicedSegments.map(segment => {
                            const segmentDuration = segment.endMin - segment.startMin;
                            return (
                              <CursorTooltip
                                key={segment.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium">{sub.name}</p>
                                    <p>{segment.startMin}m → {segment.endMin}m</p>
                                    <p className="text-muted-foreground">Active: {formatDuration(segmentDuration)} ({segmentDuration} min)</p>
                                  </>
                                }
                              >
                                <div
                                  className="absolute top-0 bottom-0 rounded shadow-sm bg-gradient-to-r from-emerald-500 to-emerald-400 border border-emerald-500/30"
                                  style={{
                                    left: `${Math.max(0, segment.left)}%`,
                                    width: `${Math.max(segment.width, 0.5)}%`
                                  }}
                                />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div className="w-8 text-right flex-shrink-0">
                        <span className="text-[8px] text-muted-foreground tabular-nums">{formatDuration(slicedActiveMins)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Cutoff sub channels */}
                {showCutoff && cutoffSubs.map(sub => {
                  const totalCutMins = sub.intervals.reduce((acc, int) => acc + getDurationMinutes(int.startMin, int.endMin), 0);
                  const firstCut = sub.intervals[0];
                  const lastCut = sub.intervals[sub.intervals.length - 1];

                  return (
                    <div key={sub.id} className="flex items-center gap-1">
                      <div className="w-10 text-right pr-1 flex items-center justify-end gap-0.5 flex-shrink-0">
                        <Scissors className="w-2 h-2 text-rose-400" />
                        <span className="text-[8px] text-rose-400 truncate">{sub.name}</span>
                      </div>
                      <CursorTooltip content={
                        <>
                          <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                          <p>{firstCut?.startMin || 0}m → {lastCut?.endMin || 0}m</p>
                          <p className="text-muted-foreground">Deducted: {formatDuration(totalCutMins)} ({totalCutMins} min)</p>
                        </>
                      } flex={false}>
                        <div className="flex-1 h-5 relative cursor-pointer">
                          {sub.intervals.map(interval => {
                            const left = (interval.startMin / totalDurationMins) * 100;
                            const width = ((interval.endMin - interval.startMin) / totalDurationMins) * 100;
                            const intervalDuration = interval.endMin - interval.startMin;
                            return (
                              <CursorTooltip
                                key={interval.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                                    <p>{interval.startMin}m → {interval.endMin}m</p>
                                    <p className="text-muted-foreground">Deducted: {formatDuration(intervalDuration)} ({intervalDuration} min)</p>
                                  </>
                                }
                              >
                                <div
                                  className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500 to-rose-400 rounded shadow-sm border border-rose-500/30"
                                  style={{
                                    left: `${Math.max(0, left)}%`,
                                    width: `${Math.max(width, 0.5)}%`,
                                    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)'
                                  }}
                                />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div className="w-8 text-right flex-shrink-0">
                        <span className="text-[8px] text-rose-400 tabular-nums">-{formatDuration(totalCutMins)}</span>
                      </div>
                    </div>
                  );
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
                {showCutoff && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-rose-500 to-rose-400" />
                    <span className="text-[7px] text-rose-400">Cutoff</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ImportTimeline({ onClose }: ImportTimelineProps) {
  const [headChannels, setHeadChannels] = useState<ImportHeadChannel[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showCutoffVisual, setShowCutoffVisual] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [copied, setCopied] = useState(false);
  const visualizationRef = useRef<HTMLDivElement>(null);

  // Generate Summary Text Table
  const generateSummaryText = () => {
    if (headChannels.length === 0) return;

    let text = '';
    const W = 78;

    const center = (str: string, width: number) => {
      const pad = Math.max(0, width - str.length);
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    };

    const fullWidthBorder = (char = '-') => '+' + char.repeat(W) + '+\n';
    const fullWidthRow = (content: string) => '| ' + content.padEnd(W - 2) + ' |\n';

    text += '+' + '='.repeat(W) + '+\n';
    text += '|' + center('TIMELINE SUMMARY REPORT', W) + '|\n';
    text += '|' + center(`Generated: ${new Date().toLocaleString()}`, W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n\n';

    headChannels.forEach((head, headIdx) => {
      const cutoffSubs = head.subChannels.filter(s => s.isCutoff);
      const totalCutoffMins = cutoffSubs.reduce((acc, sub) => 
        acc + sub.intervals.reduce((a, int) => a + (int.endMin - int.startMin), 0), 0
      );
      const netHeadMins = head.totalMinutes - totalCutoffMins;

      // HEAD HEADER BOX - use consistent width W
      text += fullWidthBorder();
      text += fullWidthRow('HEAD ' + (headIdx + 1) + ': ' + head.name);
      text += fullWidthRow('Total: ' + formatDuration(head.totalMinutes));
      if (totalCutoffMins > 0) {
        text += fullWidthRow('Net Duration: ' + formatDuration(netHeadMins) + ' (Cutoff: -' + formatDuration(totalCutoffMins) + ')');
      }
      text += fullWidthBorder() + '\n';

      const subs = head.subChannels.filter(s => !s.isCutoff);
      const cutoffIntervals = cutoffSubs.flatMap(cs => cs.intervals);
      
      // Helper to merge overlapping intervals
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
      
      // Helper function to get sliced segments after cutoff
      const getSlicedSegmentsForSub = (intervals: { startMin: number; endMin: number }[]) => {
        const allSegments: { start: number; end: number }[] = [];
        intervals.forEach(interval => {
          let segments = [{ start: interval.startMin, end: interval.endMin }];
          cutoffIntervals.forEach(cutoff => {
            const newSegs: { start: number; end: number }[] = [];
            segments.forEach(seg => {
              if (cutoff.endMin <= seg.start || cutoff.startMin >= seg.end) {
                newSegs.push(seg);
              } else {
                if (cutoff.startMin > seg.start) newSegs.push({ start: seg.start, end: cutoff.startMin });
                if (cutoff.endMin < seg.end) newSegs.push({ start: cutoff.endMin, end: seg.end });
              }
            });
            segments = newSegs;
          });
          allSegments.push(...segments);
        });
        return allSegments;
      };

      // Format time in minutes or seconds
      const formatTimeUnit = (mins: number): string => {
        if (mins >= 1) {
          const h = Math.floor(mins / 60);
          const m = Math.floor(mins % 60);
          const s = Math.round((mins % 1) * 60);
          if (h > 0) {
            return s > 0 ? `${h}h${m}m${s}s` : m > 0 ? `${h}h${m}m` : `${h}h`;
          }
          return s > 0 ? `${m}m${s}s` : `${m}m`;
        }
        return `${Math.round(mins * 60)}s`;
      };

      // Format range string
      const formatRange = (segments: { start: number; end: number }[]): string => {
        if (segments.length === 0) return '-';
        return segments.map(s => `${formatTimeUnit(s.start)}-${formatTimeUnit(s.end)}`).join('; ');
      };

      if (subs.length > 0) {
        // Collect all sliced segments across all subs for actual (merged) calculation
        const allSlicedSegments: { start: number; end: number }[] = [];
        
        // Pre-calculate all data to determine dynamic column widths
        const subDataRows: { name: string; cnt: string; raw: string; net: string; rawRange: string; actualRange: string; status: string }[] = [];
        
        subs.forEach(sub => {
          const rawTotalMins = sub.intervals.reduce((acc, int) => acc + (int.endMin - int.startMin), 0);
          const slicedSegments = getSlicedSegmentsForSub(sub.intervals);
          allSlicedSegments.push(...slicedSegments);
          const slicedMins = slicedSegments.reduce((a, s) => a + (s.end - s.start), 0);
          const status = slicedMins < rawTotalMins ? 'Cut' : 'Full';
          const rawRange = sub.intervals.map(int => `${formatTimeUnit(int.startMin)}-${formatTimeUnit(int.endMin)}`).join('; ');
          const actualRange = formatRange(slicedSegments);
          
          subDataRows.push({
            name: sub.name,
            cnt: String(sub.intervals.length),
            raw: formatDuration(rawTotalMins),
            net: formatDuration(slicedMins),
            rawRange,
            actualRange,
            status
          });
        });

        // Calculate totals
        const totalRawMins = subs.reduce((acc, sub) => acc + sub.intervals.reduce((a, i) => a + (i.endMin - i.startMin), 0), 0);
        const totalSlicedMins = subs.reduce((acc, sub) => {
          const segments = getSlicedSegmentsForSub(sub.intervals);
          return acc + segments.reduce((a, s) => a + (s.end - s.start), 0);
        }, 0);
        
        // Calculate actual (merged overlaps across all subs)
        const mergedActualSegments = mergeIntervals(allSlicedSegments);
        const totalActualMins = mergedActualSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);

        // Calculate dynamic column widths based on content
        const headers = ['Name', 'Cnt', 'Raw', 'Net', 'Actual', 'Raw Start-End', 'Actual Start-End', 'Status'];
        const totalRow = ['TOTAL', '', formatDuration(totalRawMins), formatDuration(totalSlicedMins), formatDuration(totalActualMins), '', '', ''];
        
        const colW = headers.map((h, i) => {
          let maxLen = h.length;
          subDataRows.forEach(row => {
            const vals = [row.name, row.cnt, row.raw, row.net, row.net, row.rawRange, row.actualRange, row.status];
            maxLen = Math.max(maxLen, vals[i].length);
          });
          maxLen = Math.max(maxLen, totalRow[i].length);
          // Add minimum widths for certain columns
          if (i === 0) maxLen = Math.max(maxLen, 12); // Name min
          if (i === 1) maxLen = Math.max(maxLen, 3);  // Cnt min
          if (i === 7) maxLen = Math.max(maxLen, 4);  // Status min
          return maxLen;
        });

        const divider = (char = '-') => '+' + colW.map(w => char.repeat(w + 2)).join('+') + '+\n';
        const row = (cols: string[]) => '| ' + cols.map((c, i) => c.padEnd(colW[i])).join(' | ') + ' |\n';

        text += 'SUB CHANNELS\n';
        text += divider();
        text += row(headers);
        text += divider();

        subDataRows.forEach(data => {
          text += row([data.name, data.cnt, data.raw, data.net, data.net, data.rawRange, data.actualRange, data.status]);
        });

        text += divider();
        text += row(totalRow);
        text += divider('=') + '\n';
        
        // Add note about Raw vs Actual
        if (totalRawMins !== totalActualMins) {
          const overlapMins = totalSlicedMins - totalActualMins;
          text += `Note: Raw = sum all, Net = after cutoff, Actual = merged overlaps`;
          if (overlapMins > 0) {
            text += ` (overlap: ${formatDuration(overlapMins)})`;
          }
          text += '\n\n';
        } else {
          text += 'Note: Times in minutes (m) or seconds (s). Raw = original, Net = after cutoff, Actual = merged\n\n';
        }
      }

      if (cutoffSubs.length > 0) {
        text += 'CUTOFF (Non-Operational Time)\n';
        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';
        text += '| ' + 'Name'.padEnd(26) + ' | ' + 'Range (min)'.padEnd(18) + ' | ' + 'Duration'.padEnd(10) + ' |\n';
        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';

        cutoffSubs.forEach(sub => {
          sub.intervals.forEach((interval, idx) => {
            const cutDuration = interval.endMin - interval.startMin;
            const name = sub.intervals.length > 1 ? `${sub.name} [${idx + 1}]` : sub.name;
            text += '| ' + name.substring(0, 26).padEnd(26) + ' | ' + (interval.startMin + ' -> ' + interval.endMin).padEnd(18) + ' | ' + formatDuration(cutDuration).padStart(8).padEnd(10) + ' |\n';
          });
        });

        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';
        text += '| ' + 'TOTAL CUTOFF'.padEnd(26) + ' | ' + ''.padEnd(18) + ' | ' + formatDuration(totalCutoffMins).padStart(8).padEnd(10) + ' |\n';
        text += '+' + '='.repeat(28) + '+' + '='.repeat(20) + '+' + '='.repeat(12) + '+\n\n';
      }

      text += '\n';
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
      totalMinutes: 60,
      subChannels: [],
      expanded: true,
    };
    setHeadChannels([...headChannels, newHead]);
  };

  // Delete head channel
  const deleteHeadChannel = (headId: string) => {
    setHeadChannels(headChannels.filter(h => h.id !== headId));
  };

  // Update head channel
  const updateHeadChannel = (headId: string, updates: Partial<ImportHeadChannel>) => {
    setHeadChannels(headChannels.map(h => h.id === headId ? { ...h, ...updates } : h));
  };

  // Toggle head channel expand
  const toggleHeadExpand = (headId: string) => {
    setHeadChannels(headChannels.map(h => h.id === headId ? { ...h, expanded: !h.expanded } : h));
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
      return { ...h, subChannels: [...h.subChannels, newSub] };
    }));
  };

  // Add cutoff timer
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
      return { ...h, subChannels: [...h.subChannels, newCutoff] };
    }));
  };

  // Delete sub channel
  const deleteSubChannel = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return { ...h, subChannels: h.subChannels.filter(s => s.id !== subId) };
    }));
  };

  // Update sub channel
  const updateSubChannel = (headId: string, subId: string, updates: Partial<ImportSubChannel>) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => s.id === subId ? { ...s, ...updates } : s),
      };
    }));
  };

  // Toggle sub channel expand
  const toggleSubExpand = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => s.id === subId ? { ...s, expanded: !s.expanded } : s),
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
          const lastEnd = s.intervals.length > 0 ? s.intervals[s.intervals.length - 1].endMin : 0;
          const newEndMin = Math.min(lastEnd + 5, h.totalMinutes);
          const newInterval: TimelineInterval = {
            id: generateId(),
            startMin: lastEnd,
            endMin: newEndMin
          };
          return { ...s, intervals: [...s.intervals, newInterval] };
        }),
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
          return { ...s, intervals: s.intervals.filter(i => i.id !== intervalId) };
        }),
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
            intervals: s.intervals.map(i => i.id === intervalId ? { ...i, ...updates } : i),
          };
        }),
      };
    }));
  };

  // Calculate head summary with cutoff
  const getHeadSummary = (head: ImportHeadChannel) => {
    const totalMins = head.totalMinutes;
    const cutoffMins = head.subChannels.filter(s => s.isCutoff).reduce((acc, s) => 
      acc + s.intervals.reduce((intAcc, int) => intAcc + getDurationMinutes(int.startMin, int.endMin), 0), 0);
    return { totalMins, cutoffMins, netMins: totalMins - cutoffMins };
  };

  // Save to compact JSON
  const saveToJson = () => {
    if (headChannels.length === 0) {
      toast.error('No data to save');
      return;
    }
    const data = headChannels.map(h => ({
      n: h.name,
      t: h.totalMinutes,
      s: h.subChannels.map(sc => ({
        n: sc.name,
        c: sc.isCutoff ? 1 : 0,
        i: sc.intervals.map(int => [int.startMin, int.endMin])
      }))
    }));
    const jsonStr = JSON.stringify(data);
    navigator.clipboard.writeText(jsonStr).then(() => {
      toast.success('Data copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  // Import from JSON
  const importFromJson = () => {
    const input = prompt('Paste previously saved JSON data:');
    if (!input) return;

    // Make parsing robust: handle ```json blocks, extra text, and "JSON as string" cases.
    const stripCodeFences = (s: string) =>
      s
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();

    const extractJsonPayload = (s: string) => {
      const t = stripCodeFences(s);
      const firstArr = t.indexOf('[');
      const lastArr = t.lastIndexOf(']');
      if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) return t.slice(firstArr, lastArr + 1);
      const firstObj = t.indexOf('{');
      const lastObj = t.lastIndexOf('}');
      if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) return t.slice(firstObj, lastObj + 1);
      return t;
    };

    // Support 2 formats:
    // 1) Menit builder: [{ n, t, s:[{n,c,i:[[startMin,endMin]]}] }]
    // 2) O'Clock builder / Stopwatch export: [{ n, st, et, s:[{n,c,i:[["HH:MM","HH:MM"]]}] }]
    const timeToMinutes = (t: string) => {
      const [hhRaw, mmRaw] = (t || '00:00').split(':');
      const hh = Number(hhRaw);
      const mm = Number(mmRaw);
      return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
    };

    try {
      const payload = extractJsonPayload(input);
      let parsed: any = JSON.parse(payload);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);

      if (!Array.isArray(parsed)) throw new Error('Invalid format');

      const imported: ImportHeadChannel[] = parsed.map((h: any) => {
        const isClockFormat = typeof h?.st === 'string' && typeof h?.et === 'string';

        if (isClockFormat) {
          const absStart = timeToMinutes(h.st);
          const absEnd = timeToMinutes(h.et);
          const totalMinutes = Math.max(1, absEnd - absStart);

          return {
            id: generateId(),
            name: h.n || 'Head',
            totalMinutes,
            expanded: true,
            subChannels: (h.s || []).map((sc: any) => ({
              id: generateId(),
              name: sc.n || 'Sub',
              isCutoff: sc.c === 1,
              expanded: true,
              intervals: (sc.i || [])
                .map((int: any) => {
                  // int can be [string, string] or [number, number]
                  const val0 = int?.[0];
                  const val1 = int?.[1];

                  const sAbs = typeof val0 === 'string' ? timeToMinutes(val0) : Number(val0);
                  const eAbs = typeof val1 === 'string' ? timeToMinutes(val1) : Number(val1);

                  const startMin = Math.max(0, (Number.isFinite(sAbs) ? sAbs : 0) - absStart);
                  const endMin = Math.max(0, (Number.isFinite(eAbs) ? eAbs : 0) - absStart);

                  if (endMin <= startMin) return null;
                  return { id: generateId(), startMin, endMin };
                })
                .filter(Boolean),
            })),
          };
        }

        // Default: minute format (original)
        return {
          id: generateId(),
          name: h.n || 'Head',
          totalMinutes: Number.isFinite(h?.t) ? h.t : 60,
          expanded: true,
          subChannels: (h.s || []).map((sc: any) => ({
            id: generateId(),
            name: sc.n || 'Sub',
            isCutoff: sc.c === 1,
            expanded: true,
            intervals: (sc.i || []).map((int: any) => ({
              id: generateId(),
              startMin: Number.isFinite(int?.[0]) ? int[0] : 0,
              endMin: Number.isFinite(int?.[1]) ? int[1] : 5,
            })),
          })),
        };
      });

      setHeadChannels(imported);
      toast.success(`Successfully imported ${imported.length} head channel(s)!`);
    } catch {
      toast.error('Invalid JSON format');
    }
  };

  const hasData = headChannels.length > 0;

  return (
    <div className="bg-secondary rounded-xl p-4 relative">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center transition-all"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <h3 className="text-sm font-semibold text-foreground mb-3">Timeline Builder (Minutes)</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Head Channel = total duration (minutes) · Sub Channel = activity · Cutoff = non-operational time
      </p>

      {/* Builder UI */}
      <div className="space-y-3">
        {/* Action Buttons Row */}
        <div className="flex items-center gap-2">
          <button
            onClick={addHeadChannel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Head Channel
          </button>

          <button
            onClick={saveToJson}
            disabled={!hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Save JSON
          </button>

          <button
            onClick={importFromJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </button>
        </div>

        {/* Head Channels List */}
        {headChannels.map((head) => {
          const summary = getHeadSummary(head);
          return (
            <div key={head.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
              {/* Head Channel Header */}
              <div className="flex items-center gap-2">
                <button onClick={() => toggleHeadExpand(head.id)} className="text-muted-foreground hover:text-foreground">
                  {head.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <span className="text-xs text-primary font-medium">📌</span>

                <input
                  type="text"
                  value={head.name}
                  onChange={(e) => updateHeadChannel(head.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-medium text-foreground border-none focus:outline-none focus:ring-0"
                  placeholder="Head Channel Name"
                />

                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={head.totalMinutes}
                    onChange={(e) => updateHeadChannel(head.id, { totalMinutes: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-16 bg-muted rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                    min="1"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>

                {/* Duration with cutoff info */}
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="font-medium text-foreground">{formatDuration(summary.netMins)}</span>
                  {summary.cutoffMins > 0 && (
                    <span className="text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">(-{formatDuration(summary.cutoffMins)})</span>
                  )}
                </div>

                <button
                  onClick={() => deleteHeadChannel(head.id)}
                  className="w-6 h-6 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Head Channel Content */}
              {head.expanded && (
                <div className="pl-6 space-y-2">
                  {/* Action Buttons - Apple style */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => addSubChannel(head.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                        bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                        shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40
                        hover:scale-105 active:scale-95
                        border border-emerald-400/30"
                    >
                      <Plus className="w-3 h-3" />
                      Add Sub Channel
                    </button>

                    <button
                      onClick={() => addCutoffTimer(head.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                        bg-gradient-to-r from-rose-500 to-pink-500 text-white
                        shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40
                        hover:scale-105 active:scale-95
                        border border-rose-400/30"
                    >
                      <Scissors className="w-3 h-3" />
                      Add Cutoff Timer
                    </button>
                  </div>

                  {/* Sub Channels (Regular) */}
                  {head.subChannels.filter(s => !s.isCutoff).map((sub) => (
                    <div key={sub.id} className="bg-background/50 rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSubExpand(head.id, sub.id)} className="text-muted-foreground hover:text-foreground">
                          {sub.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-[10px] text-muted-foreground">└</span>

                        <input
                          type="text"
                          value={sub.name}
                          onChange={(e) => updateSubChannel(head.id, sub.id, { name: e.target.value })}
                          className="flex-1 bg-transparent text-xs text-foreground border-none focus:outline-none focus:ring-0"
                          placeholder="Sub Channel Name"
                        />

                        <span className="text-[10px] text-muted-foreground">{sub.intervals.length} interval</span>

                        <button
                          onClick={() => deleteSubChannel(head.id, sub.id)}
                          className="w-5 h-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {sub.expanded && (
                        <div className="pl-5 space-y-1">
                          <button
                            onClick={() => addInterval(head.id, sub.id)}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            Add Timeline (Start → Pause)
                          </button>

                          {sub.intervals.map((interval, idx) => (
                            <div key={interval.id} className="flex items-center gap-2 text-[10px]">
                              <span className="text-muted-foreground w-4">{idx + 1}.</span>

                              <div className="flex items-center gap-1">
                                <span className="text-green-500">▶</span>
                                <input
                                  type="number"
                                  value={interval.startMin}
                                  onChange={(e) => updateInterval(head.id, sub.id, interval.id, {
                                    startMin: Math.max(0, Math.min(parseInt(e.target.value) || 0, interval.endMin - 1))
                                  })}
                                  className="w-12 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  min="0"
                                  max={head.totalMinutes}
                                />
                                <span className="text-muted-foreground">m</span>
                              </div>

                              <span className="text-muted-foreground">→</span>

                              <div className="flex items-center gap-1">
                                <span className="text-orange-500">⏸</span>
                                <input
                                  type="number"
                                  value={interval.endMin}
                                  onChange={(e) => updateInterval(head.id, sub.id, interval.id, {
                                    endMin: Math.max(interval.startMin + 1, Math.min(parseInt(e.target.value) || 1, head.totalMinutes))
                                  })}
                                  className="w-12 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  min="1"
                                  max={head.totalMinutes}
                                />
                                <span className="text-muted-foreground">m</span>
                              </div>

                              <span className="text-muted-foreground">({interval.endMin - interval.startMin}m aktif)</span>

                              <button
                                onClick={() => deleteInterval(head.id, sub.id, interval.id)}
                                className="w-4 h-4 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors ml-auto"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}

                          {sub.intervals.length === 0 && (
                            <div className="text-[10px] text-muted-foreground italic pl-4">
                              No timeline yet. Click "Add Timeline" to add one.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Cutoff Timers */}
                  {head.subChannels.filter(s => s.isCutoff).map((sub) => (
                    <div key={sub.id} className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSubExpand(head.id, sub.id)} className="text-rose-400 hover:text-rose-300">
                          {sub.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>

                        <Scissors className="w-3 h-3 text-rose-400" />

                        <input
                          type="text"
                          value={sub.name}
                          onChange={(e) => updateSubChannel(head.id, sub.id, { name: e.target.value })}
                          className="flex-1 bg-transparent text-xs text-rose-300 border-none focus:outline-none focus:ring-0"
                          placeholder="Cutoff Timer Name"
                        />

                        <span className="text-[10px] text-rose-400">{sub.intervals.length} cutoff</span>

                        <button
                          onClick={() => deleteSubChannel(head.id, sub.id)}
                          className="w-5 h-5 rounded-full hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {sub.expanded && (
                        <div className="pl-5 space-y-1">
                          <button
                            onClick={() => addInterval(head.id, sub.id)}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            Add Cutoff Period
                          </button>

                          {sub.intervals.map((interval, idx) => (
                            <div key={interval.id} className="flex items-center gap-2 text-[10px]">
                              <span className="text-rose-400 w-4">{idx + 1}.</span>

                              <div className="flex items-center gap-1">
                                <span className="text-rose-400">✂</span>
                                <input
                                  type="number"
                                  value={interval.startMin}
                                  onChange={(e) => updateInterval(head.id, sub.id, interval.id, {
                                    startMin: Math.max(0, Math.min(parseInt(e.target.value) || 0, interval.endMin - 1))
                                  })}
                                  className="w-12 bg-rose-500/20 rounded px-1.5 py-0.5 text-center text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-400/50"
                                  min="0"
                                  max={head.totalMinutes}
                                />
                                <span className="text-rose-400">m</span>
                              </div>

                              <span className="text-rose-400">→</span>

                              <div className="flex items-center gap-1">
                                <span className="text-rose-400">✂</span>
                                <input
                                  type="number"
                                  value={interval.endMin}
                                  onChange={(e) => updateInterval(head.id, sub.id, interval.id, {
                                    endMin: Math.max(interval.startMin + 1, Math.min(parseInt(e.target.value) || 1, head.totalMinutes))
                                  })}
                                  className="w-12 bg-rose-500/20 rounded px-1.5 py-0.5 text-center text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-400/50"
                                  min="1"
                                  max={head.totalMinutes}
                                />
                                <span className="text-rose-400">m</span>
                              </div>

                              <span className="text-rose-300">(-{interval.endMin - interval.startMin}m)</span>

                              <button
                                onClick={() => deleteInterval(head.id, sub.id, interval.id)}
                                className="w-4 h-4 rounded-full hover:bg-rose-500/30 text-rose-400 flex items-center justify-center transition-colors ml-auto"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}

                          {sub.intervals.length === 0 && (
                            <div className="text-[10px] text-rose-400/70 italic pl-4">
                              No cutoff period yet.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {head.subChannels.length === 0 && (
                    <div className="text-xs text-muted-foreground italic pl-2">
                      No sub channel or cutoff timer yet
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {!hasData && (
          <div className="text-center text-muted-foreground py-4 text-sm">
            Click "Add Head Channel" to start building timeline
          </div>
        )}
      </div>

      {/* Visualize Button */}
      {hasData && (
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowVisualization(!showVisualization)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-primary/25"
          >
            <Eye className="w-4 h-4" />
            {showVisualization ? 'Hide' : 'Show'} Visualization
          </button>

          {showVisualization && (
            <button
              onClick={generateSummaryText}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg shadow-blue-500/25"
            >
              <FileText className="w-4 h-4" />
              Export to Summary
            </button>
          )}
        </div>
      )}

      {/* Visualization - Apple Style (match O'Clock UI) */}
      {showVisualization && hasData && (
        <div className="mt-6 pt-6 border-t border-border/50" ref={visualizationRef}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <h4 className="text-base font-semibold text-foreground tracking-tight">
                Timeline Visualization
              </h4>
            </div>

            <button
              onClick={() => setShowCutoffVisual(!showCutoffVisual)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full transition-all ${
                showCutoffVisual
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                  : 'bg-secondary text-muted-foreground border border-border hover:bg-secondary/80'
              }`}
            >
              {showCutoffVisual ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Cutoff Visible
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Cutoff Hidden
                </>
              )}
            </button>
          </div>

          <TimelineVisualization headChannels={headChannels} showCutoff={showCutoffVisual} />
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSummaryModal(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] m-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
            <div className="flex-1 overflow-auto p-4">
              <pre className="bg-muted/50 border border-border rounded-xl p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto leading-relaxed">
                {summaryText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
