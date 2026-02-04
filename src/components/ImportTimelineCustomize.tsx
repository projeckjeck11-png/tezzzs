import { useState, useRef } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Scissors, FileText, Clock, Save, Upload, Copy, Check, Tag, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { CursorTooltip } from '@/components/CursorTooltip';
import { saveTextFile, openTextFile } from '@/lib/textFile';
import { FullscreenChart } from '@/components/FullscreenChart';
import { VisualizationErrorBoundary } from '@/components/VisualizationErrorBoundary';

// Color presets for customization
const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981', gradient: 'from-emerald-500 to-emerald-400' },
  { name: 'Blue', value: '#3b82f6', gradient: 'from-blue-500 to-blue-400' },
  { name: 'Purple', value: '#8b5cf6', gradient: 'from-purple-500 to-purple-400' },
  { name: 'Orange', value: '#f97316', gradient: 'from-orange-500 to-orange-400' },
  { name: 'Pink', value: '#ec4899', gradient: 'from-pink-500 to-pink-400' },
  { name: 'Cyan', value: '#06b6d4', gradient: 'from-cyan-500 to-cyan-400' },
  { name: 'Yellow', value: '#eab308', gradient: 'from-yellow-500 to-yellow-400' },
  { name: 'Indigo', value: '#6366f1', gradient: 'from-indigo-500 to-indigo-400' },
];

type InputMode = 'time' | 'oclock';

interface TimelineInterval {
  id: string;
  // For 'time' mode: minutes
  startMin: number;
  endMin: number;
  // For 'oclock' mode: "HH:MM" format
  startTime: string;
  endTime: string;
  // Color for this timeline segment
  color: string;
}

interface ImportSubChannel {
  id: string;
  name: string;
  intervals: TimelineInterval[];
  expanded: boolean;
  isCutoff?: boolean;
  color: string;
  status: string;
  visible: boolean;
}

interface ImportHeadChannel {
  id: string;
  name: string;
  // For time mode
  totalMinutes: number;
  // For oclock mode
  startTime: string;
  endTime: string;
  subChannels: ImportSubChannel[];
  expanded: boolean;
  color: string;
  status: string;
}

interface CustomLabel {
  id: string;
  key: string;
  value: string;
  color: string; // badge indicator color
}

interface ImportTimelineCustomizeProps {
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

// Format duration in minutes to readable string based on time unit
function formatDuration(mins: number, timeUnit: 'minutes' | 'hours' | 'seconds' = 'minutes'): string {
  switch (timeUnit) {
    case 'seconds': {
      const totalSeconds = Math.round(mins * 60);
      return `${totalSeconds}s`;
    }
    case 'hours': {
      const hours = mins / 60;
      return `${hours.toFixed(2)}h`;
    }
    case 'minutes':
    default: {
      return `${Math.round(mins)}m`;
    }
  }
}

// Format duration in mixed format (for tooltips and summaries)
function formatDurationMixed(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = Math.round(mins % 60);
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
  intervals: { id: string; startMin: number; endMin: number; color: string }[],
  cutoffs: CutoffInterval[],
  totalDurationMins: number,
  offsetMins: number = 0
): { id: string; left: number; width: number; startMin: number; endMin: number; color: string }[] {
  const result: { id: string; left: number; width: number; startMin: number; endMin: number; color: string }[] = [];
  
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
      const left = ((seg.start - offsetMins) / totalDurationMins) * 100;
      const width = ((seg.end - seg.start) / totalDurationMins) * 100;
      result.push({
        id: `${interval.id}-seg-${i}`,
        left,
        width,
        startMin: seg.start,
        endMin: seg.end,
        color: interval.color
      });
    }
  }
  return result;
}

// Merge overlapping intervals
function mergeIntervals(intervals: { start: number; end: number }[]): { start: number; end: number }[] {
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
}

// Visual settings for the timeline graph
interface VisualSettings {
  // Margins
  containerPadding: number; // px
  barHeight: number; // px
  barGap: number; // px
  labelWidth: number; // px
  valueWidth: number; // px
  
  // Typography
  labelFontSize: number; // px
  valueFontSize: number; // px
  markerFontSize: number; // px
  
  // Style
  borderRadius: number; // px
  showGridLines: boolean;
  gridLineOpacity: number; // 0-100
  barOpacity: number; // 0-100
  showShadow: boolean;
  
  // Legend
  showLegend: boolean;
  legendPosition: 'bottom' | 'top';
  
  // Time Unit
  timeUnit: 'minutes' | 'hours' | 'seconds';
}

const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  containerPadding: 8,
  barHeight: 20,
  barGap: 2,
  labelWidth: 40,
  valueWidth: 32,
  labelFontSize: 8,
  valueFontSize: 8,
  markerFontSize: 9,
  borderRadius: 4,
  showGridLines: true,
  gridLineOpacity: 20,
  barOpacity: 100,
  showShadow: true,
  showLegend: true,
  legendPosition: 'bottom',
  timeUnit: 'minutes'
};

interface TimelineVisualizationProps {
  headChannels: ImportHeadChannel[];
  showCutoff: boolean;
  customLabels: CustomLabel[];
  mode: InputMode;
  visibleStatusLabels: Set<string>;
  visualSettings: VisualSettings;
  onOpenSettings?: () => void;
}

function TimelineVisualization({ headChannels, showCutoff, customLabels, mode, visibleStatusLabels, visualSettings, onOpenSettings }: TimelineVisualizationProps) {
  const vs = visualSettings;
  
  const safeHeadChannels = headChannels ?? [];
  if (safeHeadChannels.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4 text-xs">
        Add a Head Channel to view visualization
      </div>
    );
  }

  return (
    <div className="space-y-3" style={{ padding: vs.containerPadding }}>
      {safeHeadChannels.map((head) => {
        const subChannels = head.subChannels ?? [];
        // Calculate total duration based on mode
        let headDurationMins: number;
        let offsetMins = 0;
        
        if (mode === 'oclock') {
          const headStartMins = timeToMinutes(head.startTime);
          const headEndMins = timeToMinutes(head.endTime);
          headDurationMins = headEndMins - headStartMins;
          offsetMins = headStartMins;
        } else {
          headDurationMins = head.totalMinutes;
        }
        
        if (headDurationMins <= 0) return null;

        // Find max end time from all sub-channels (relative to offset)
        let maxSubEndMins = 0;
        subChannels.forEach(sub => {
          const intervals = sub.intervals ?? [];
          intervals.forEach(interval => {
            const relativeEnd = mode === 'oclock' ? interval.endMin - offsetMins : interval.endMin;
            maxSubEndMins = Math.max(maxSubEndMins, relativeEnd);
          });
        });
        
        // Use the maximum of head duration and max sub end time for graph scale
        const totalDurationMins = Math.max(headDurationMins, maxSubEndMins);

        const cutoffSubs = subChannels.filter(s => s.isCutoff);
        const totalCutoffMins = cutoffSubs.reduce((acc, sub) => {
          const intervals = sub.intervals ?? [];
          return acc + intervals.reduce((a, int) => a + getDurationMinutes(int.startMin, int.endMin), 0);
        }, 0);
        // Net operational is based on head duration, not max duration
        const netOperationalMins = headDurationMins - totalCutoffMins;

        // Display duration depends on showCutoff: full if shown, net if hidden
        const displayDurationMins = showCutoff ? totalDurationMins : Math.max(netOperationalMins, maxSubEndMins - totalCutoffMins);
        if (displayDurationMins <= 0) return null;

        // Generate time markers - always use 30 minute intervals with minutes as label
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
          <FullscreenChart key={head.id} title={`${head.name} Timeline`}>
            <div 
              className="bg-gradient-to-b from-card to-card/80 rounded-xl border border-border/50 backdrop-blur-sm"
              style={{ 
                padding: vs.containerPadding,
                borderRadius: vs.borderRadius,
                boxShadow: vs.showShadow ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
              }}
            >
            {/* Compact Single-line Header */}
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: head.color }}
                />
                <h3 style={{ fontSize: vs.labelFontSize + 2 }} className="font-semibold text-foreground tracking-tight">
                  {head.name} 
                  <span className="text-muted-foreground font-normal"> | </span>
                  <span style={{ fontSize: vs.labelFontSize }} className="font-normal text-muted-foreground">
                    {mode === 'oclock' ? `${head.startTime} – ${head.endTime}` : `${formatDuration(headDurationMins, vs.timeUnit)} total`}
                    {totalDurationMins > headDurationMins && (
                      <span className="text-amber-500 ml-1">(scale: {formatDuration(totalDurationMins, vs.timeUnit)})</span>
                    )}
                  </span>
                  {visibleStatusLabels.has(head.id) && head.status && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary" style={{ fontSize: vs.labelFontSize - 2 }}>
                      {head.status}
                    </span>
                  )}
                </h3>
              </div>
              {totalCutoffMins > 0 && (
                <div className="px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                  <span style={{ fontSize: vs.markerFontSize }} className="font-medium text-rose-400">-{formatDuration(totalCutoffMins, vs.timeUnit)}</span>
                </div>
              )}
            </div>

            {/* Timeline Container */}
            <div className="relative">
              {/* Grid lines */}
              {vs.showGridLines && (
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{ 
                    marginLeft: vs.labelWidth + 4,
                    marginRight: vs.valueWidth + 4
                  }}
                >
                  {timeMarkers.map((marker, idx) => {
                    const pct = (marker.mins / displayDurationMins) * 100;
                    return (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 w-px"
                        style={{ 
                          left: `${pct}%`,
                          backgroundColor: `rgba(128, 128, 128, ${vs.gridLineOpacity / 100})`
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Time markers */}
              <div className="flex items-end mb-0.5" style={{ marginLeft: vs.labelWidth + 4, marginRight: vs.valueWidth + 4 }}>
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
                        <span style={{ fontSize: vs.markerFontSize }} className="font-medium text-muted-foreground tabular-nums">
                          {marker.label}
                        </span>
                        <div className="w-px h-1 bg-border/60 mt-0.5" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Bars */}
              <div style={{ gap: vs.barGap }} className="flex flex-col">
                {/* Head channel bar (Total) - Always visible */}
                <div className="flex items-center gap-1">
                  <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0">
                    <span style={{ fontSize: vs.labelFontSize }} className="font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                  </div>
                  <CursorTooltip content={
                    <>
                      <p className="font-medium">
                        {mode === 'oclock' ? `${head.startTime} → ${head.endTime}` : `0 → ${formatDuration(headDurationMins, vs.timeUnit)}`}
                      </p>
                      <p className="text-muted-foreground">Net: {formatDurationMixed(netOperationalMins)} ({netOperationalMins} min)</p>
                      {totalDurationMins > headDurationMins && (
                        <p className="text-amber-500">Graph scaled to {formatDuration(totalDurationMins, vs.timeUnit)} (sub exceeds head)</p>
                      )}
                    </>
                  }>
                    <div 
                      className="rounded relative overflow-hidden border cursor-pointer"
                      style={{
                        height: vs.barHeight + 4,
                        borderRadius: vs.borderRadius,
                        opacity: vs.barOpacity / 100,
                        background: `linear-gradient(to right, ${head.color}33, ${head.color}1a)`,
                        borderColor: `${head.color}33`,
                        width: `${(headDurationMins / totalDurationMins) * 100}%`
                      }}
                    >
                      <div 
                        className="absolute inset-0" 
                        style={{ background: `linear-gradient(to right, ${head.color}4d, ${head.color}33)` }}
                      />
                      {/* Cutoff overlays */}
                      {showCutoff && cutoffSubs.map(sub => (sub.intervals ?? []).map(interval => {
                        const left = ((interval.startMin - offsetMins) / headDurationMins) * 100;
                        const width = ((interval.endMin - interval.startMin) / headDurationMins) * 100;
                        return (
                          <div
                            key={interval.id}
                            className="absolute top-0 h-full bg-rose-500/50 backdrop-blur-sm"
                            style={{
                              left: `${Math.max(0, Math.min(100, left))}%`,
                              width: `${Math.max(Math.min(width, 100 - left), 0.5)}%`,
                              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)'
                            }}
                          />
                        );
                      }))}
                    </div>
                  </CursorTooltip>
                  <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
                    <span style={{ fontSize: vs.valueFontSize }} className="font-semibold text-foreground tabular-nums">{formatDuration(netOperationalMins, vs.timeUnit)}</span>
                  </div>
                </div>

                {/* Sub channel bars - Always show all graphs */}
                {subChannels.filter(s => !s.isCutoff).map(sub => {
                  const intervals = sub.intervals ?? [];
                  if (intervals.length === 0) return null;
                  const cutoffIntervals: CutoffInterval[] = cutoffSubs.flatMap(cs =>
                    (cs.intervals ?? []).map(int => ({ startMins: int.startMin, endMins: int.endMin }))
                  );
                  const slicedActiveMins = calculateSlicedDuration(intervals, cutoffIntervals);
                  const slicedSegments = getSlicedSegments(
                    intervals, 
                    cutoffIntervals, 
                    totalDurationMins,
                    offsetMins
                  );
                  const firstInt = intervals[0];
                  const lastInt = intervals[intervals.length - 1];
                  const showStatus = visibleStatusLabels.has(sub.id);

                  // Get the first interval's color for the label indicator
                  const labelIndicatorColor = intervals[0]?.color || sub.color;
                  
                  return (
                    <div key={sub.id} className="flex items-center gap-1">
                      <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0 flex items-center justify-end gap-1">
                        <div 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: labelIndicatorColor }}
                        />
                        <span style={{ fontSize: vs.labelFontSize }} className="text-muted-foreground truncate block">{sub.name}</span>
                      </div>
                      <CursorTooltip
                        asChild
                        content={
                          <>
                            <p className="font-medium">{sub.name}</p>
                            <p>
                              {mode === 'oclock' 
                                ? `${firstInt?.startTime || '-'} → ${lastInt?.endTime || '-'}`
                                : `${formatDuration(firstInt?.startMin || 0, vs.timeUnit)} → ${formatDuration(lastInt?.endMin || 0, vs.timeUnit)}`
                              }
                            </p>
                            <p className="text-muted-foreground">Active: {formatDurationMixed(slicedActiveMins)} ({slicedActiveMins} min)</p>
                            {showStatus && sub.status && <p className="text-primary">Status: {sub.status}</p>}
                          </>
                        }
                      >
                        <div 
                          className="flex-1 relative cursor-pointer"
                          style={{ 
                            height: vs.barHeight, 
                            opacity: vs.barOpacity / 100 
                          }}
                        >
                          {slicedSegments.map(segment => {
                            const segmentDuration = segment.endMin - segment.startMin;
                            return (
                              <CursorTooltip
                                key={segment.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium">{sub.name}</p>
                                    <p>
                                      {mode === 'oclock' 
                                        ? `${minutesToTime(segment.startMin)} → ${minutesToTime(segment.endMin)}`
                                        : `${formatDuration(segment.startMin, vs.timeUnit)} → ${formatDuration(segment.endMin, vs.timeUnit)}`
                                      }
                                    </p>
                                    <p className="text-muted-foreground">Active: {formatDurationMixed(segmentDuration)} ({segmentDuration} min)</p>
                                  </>
                                }
                              >
                                <div
                                  className="absolute top-0 bottom-0"
                                  style={{
                                    left: `${Math.max(0, segment.left)}%`,
                                    width: `${Math.max(segment.width, 0.5)}%`,
                                    background: `linear-gradient(to right, ${segment.color}, ${segment.color}cc)`,
                                    borderColor: `${segment.color}4d`,
                                    borderWidth: '1px',
                                    borderRadius: vs.borderRadius,
                                    boxShadow: vs.showShadow ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                  }}
                                />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0 flex items-center gap-1">
                        <span style={{ fontSize: vs.valueFontSize }} className="text-muted-foreground tabular-nums">{formatDuration(slicedActiveMins, vs.timeUnit)}</span>
                        {showStatus && sub.status && (
                          <span style={{ fontSize: vs.valueFontSize - 1 }} className="px-1 py-0.5 rounded bg-primary/10 text-primary">{sub.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Cutoff sub channels - Always show all */}
                {showCutoff && cutoffSubs.map(sub => {
                  const totalCutMins = sub.intervals.reduce((acc, int) => acc + getDurationMinutes(int.startMin, int.endMin), 0);
                  const firstCut = sub.intervals[0];
                  const lastCut = sub.intervals[sub.intervals.length - 1];

                  return (
                    <div key={sub.id} className="flex items-center gap-1">
                      <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex items-center justify-end gap-0.5 flex-shrink-0">
                        <Scissors className="w-2 h-2 text-rose-400" />
                        <span style={{ fontSize: vs.labelFontSize }} className="text-rose-400 truncate">{sub.name}</span>
                      </div>
                      <CursorTooltip
                        asChild
                        content={
                          <>
                            <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                            <p>
                              {mode === 'oclock'
                                ? `${firstCut?.startTime || '-'} → ${lastCut?.endTime || '-'}`
                                : `${formatDuration(firstCut?.startMin || 0, vs.timeUnit)} → ${formatDuration(lastCut?.endMin || 0, vs.timeUnit)}`
                              }
                            </p>
                            <p className="text-muted-foreground">Deducted: {formatDurationMixed(totalCutMins)} ({totalCutMins} min)</p>
                          </>
                        }
                      >
                        <div 
                          className="flex-1 relative cursor-pointer"
                          style={{ height: vs.barHeight, opacity: vs.barOpacity / 100 }}
                        >
                          {sub.intervals.map(interval => {
                            const left = ((interval.startMin - offsetMins) / totalDurationMins) * 100;
                            const width = ((interval.endMin - interval.startMin) / totalDurationMins) * 100;
                            const intervalDuration = interval.endMin - interval.startMin;
                            return (
                              <CursorTooltip
                                key={interval.id}
                                asChild
                                content={
                                  <>
                                    <p className="font-medium text-rose-400">{sub.name} (Cutoff)</p>
                                    <p>
                                      {mode === 'oclock'
                                        ? `${minutesToTime(interval.startMin)} → ${minutesToTime(interval.endMin)}`
                                        : `${formatDuration(interval.startMin, vs.timeUnit)} → ${formatDuration(interval.endMin, vs.timeUnit)}`
                                      }
                                    </p>
                                    <p className="text-muted-foreground">Deducted: {formatDurationMixed(intervalDuration)} ({intervalDuration} min)</p>
                                  </>
                                }
                              >
                                <div
                                  className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500 to-rose-400 border border-rose-500/30"
                                  style={{
                                    left: `${Math.max(0, left)}%`,
                                    width: `${Math.max(width, 0.5)}%`,
                                    borderRadius: vs.borderRadius,
                                    boxShadow: vs.showShadow ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)'
                                  }}
                                />
                              </CursorTooltip>
                            );
                          })}
                        </div>
                      </CursorTooltip>
                      <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
                        <span style={{ fontSize: vs.valueFontSize }} className="text-rose-400 tabular-nums">-{formatDuration(totalCutMins, vs.timeUnit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Custom Labels below graph */}
              {customLabels.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-1.5 border-t border-border/20">
                  {customLabels.map(label => (
                    <div key={label.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 border border-border/30">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: label.color || '#8b5cf6' }}
                        aria-hidden="true"
                      />
                      <span className="text-[8px] font-medium text-muted-foreground">{label.key}:</span>
                      <span className="text-[8px] font-semibold text-foreground">{label.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compact Legend */}
              {vs.showLegend && (
                <div className={`flex items-center gap-2 pt-1 border-t border-border/20 ${vs.legendPosition === 'bottom' ? 'mt-1.5' : 'mb-1.5 order-first'}`}>
                  <div className="flex items-center gap-1">
                    <div 
                      className="w-1.5 h-1.5 rounded-sm" 
                      style={{ backgroundColor: `${head.color}66` }}
                    />
                    <span style={{ fontSize: vs.valueFontSize - 1 }} className="text-muted-foreground">Total</span>
                  </div>
                  {subChannels.filter(s => !s.isCutoff && visibleStatusLabels.has(s.id)).map(sub => {
                    const legendColor = (sub.intervals ?? [])[0]?.color || sub.color;
                    return (
                      <div key={sub.id} className="flex items-center gap-1">
                        <div 
                          className="w-1.5 h-1.5 rounded-sm" 
                          style={{ backgroundColor: legendColor }}
                        />
                        <span style={{ fontSize: vs.valueFontSize - 1 }} className="text-muted-foreground">{sub.name}</span>
                        {sub.status && (
                          <span style={{ fontSize: vs.valueFontSize - 2 }} className="px-1 py-0.5 rounded bg-primary/10 text-primary">{sub.status}</span>
                        )}
                      </div>
                    );
                  })}
                  {showCutoff && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-sm bg-gradient-to-r from-rose-500 to-rose-400" />
                      <span style={{ fontSize: vs.valueFontSize - 1 }} className="text-rose-400">Cutoff</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          </FullscreenChart>
        );
      })}
    </div>
  );
}

export function ImportTimelineCustomize({ onClose }: ImportTimelineCustomizeProps) {
  const [mode, setMode] = useState<InputMode | null>(null);
  const [headChannels, setHeadChannels] = useState<ImportHeadChannel[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showCutoffVisual, setShowCutoffVisual] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [copied, setCopied] = useState(false);
  const [customLabels, setCustomLabels] = useState<CustomLabel[]>([]);
  const [visibleStatusLabels, setVisibleStatusLabels] = useState<Set<string>>(new Set());
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);
  const [showVisualSettings, setShowVisualSettings] = useState(false);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const visualizationRef = useRef<HTMLDivElement>(null);

  // Mode selection screen
  if (mode === null) {
    return (
      <div className="bg-secondary rounded-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center transition-all"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <h3 className="text-lg font-semibold text-foreground mb-2 text-center">Import Timeline Customize</h3>
        <p className="text-xs text-muted-foreground mb-6 text-center">
          Choose your input mode to get started
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button
            onClick={() => setMode('time')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <h4 className="text-sm font-semibold text-foreground">By Time</h4>
              <p className="text-[10px] text-muted-foreground mt-1">Input in minutes<br/>e.g., 0m → 30m</p>
            </div>
          </button>

          <button
            onClick={() => setMode('oclock')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <h4 className="text-sm font-semibold text-foreground">By O'Clock</h4>
              <p className="text-[10px] text-muted-foreground mt-1">Input in hours<br/>e.g., 08:00 → 09:30</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Generate Summary Text
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
    text += '|' + center('CUSTOMIZE TIMELINE SUMMARY REPORT', W) + '|\n';
    text += '|' + center(`Generated: ${new Date().toLocaleString()}`, W) + '|\n';
    text += '|' + center(`Mode: ${mode === 'time' ? 'Minutes' : "O'Clock"}`, W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n\n';

    headChannels.forEach((head, headIdx) => {
      const cutoffSubs = head.subChannels.filter(s => s.isCutoff);
      
      let totalDurationMins: number;
      let offsetMins = 0;
      
      if (mode === 'oclock') {
        const headStartMins = timeToMinutes(head.startTime);
        const headEndMins = timeToMinutes(head.endTime);
        totalDurationMins = headEndMins - headStartMins;
        offsetMins = headStartMins;
      } else {
        totalDurationMins = head.totalMinutes;
      }
      
      const totalCutoffMins = cutoffSubs.reduce((acc, sub) => 
        acc + sub.intervals.reduce((a, int) => a + (int.endMin - int.startMin), 0), 0
      );
      const netHeadMins = totalDurationMins - totalCutoffMins;

      text += fullWidthBorder();
      text += fullWidthRow('HEAD ' + (headIdx + 1) + ': ' + head.name + (head.status ? ` [${head.status}]` : ''));
      text += fullWidthRow('Total: ' + formatDuration(totalDurationMins) + (mode === 'oclock' ? ` (${head.startTime} - ${head.endTime})` : ''));
      if (totalCutoffMins > 0) {
        text += fullWidthRow('Net Duration: ' + formatDuration(netHeadMins) + ' (Cutoff: -' + formatDuration(totalCutoffMins) + ')');
      }
      text += fullWidthBorder() + '\n';

      const subs = head.subChannels.filter(s => !s.isCutoff);
      const cutoffIntervals = cutoffSubs.flatMap(cs => cs.intervals);
      
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

      const formatTimeUnit = (mins: number): string => {
        if (mode === 'oclock') {
          return minutesToTime(mins);
        }
        if (mins >= 1) {
          const h = Math.floor(mins / 60);
          const m = Math.floor(mins % 60);
          if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
          return `${m}m`;
        }
        return `${Math.round(mins * 60)}s`;
      };

      const formatRange = (segments: { start: number; end: number }[]): string => {
        if (segments.length === 0) return '-';
        return segments.map(s => `${formatTimeUnit(s.start)}-${formatTimeUnit(s.end)}`).join('; ');
      };

      if (subs.length > 0) {
        // For Actual calculation: clamp segments to head range (0 to totalDurationMins)
        const headRangeStart = mode === 'oclock' ? offsetMins : 0;
        const headRangeEnd = mode === 'oclock' ? offsetMins + totalDurationMins : totalDurationMins;
        
        const clampToHeadRange = (segments: { start: number; end: number }[]): { start: number; end: number }[] => {
          return segments
            .map(seg => ({
              start: Math.max(headRangeStart, seg.start),
              end: Math.min(headRangeEnd, seg.end)
            }))
            .filter(seg => seg.start < seg.end);
        };
        
        const allSlicedSegments: { start: number; end: number }[] = [];
        const allClampedSegments: { start: number; end: number }[] = []; // For actual (clamped to head)
        const subDataRows: { name: string; cnt: string; raw: string; net: string; rawRange: string; actualRange: string; status: string; exceedsHead: boolean }[] = [];
        
        let hasSubExceedingHead = false;
        
        subs.forEach(sub => {
          const rawTotalMins = sub.intervals.reduce((acc, int) => acc + (int.endMin - int.startMin), 0);
          const slicedSegments = getSlicedSegmentsForSub(sub.intervals);
          allSlicedSegments.push(...slicedSegments);
          
          // Check if sub exceeds head range
          const maxSubEnd = Math.max(...sub.intervals.map(i => i.endMin), 0);
          const minSubStart = Math.min(...sub.intervals.map(i => i.startMin), Infinity);
          const exceedsHead = maxSubEnd > headRangeEnd || minSubStart < headRangeStart;
          if (exceedsHead) hasSubExceedingHead = true;
          
          // Clamp segments to head range for actual calculation
          const clampedSegments = clampToHeadRange(slicedSegments);
          allClampedSegments.push(...clampedSegments);
          
          const slicedMins = slicedSegments.reduce((a, s) => a + (s.end - s.start), 0);
          const status = sub.status || (exceedsHead ? 'Overflow' : slicedMins < rawTotalMins ? 'Cut' : 'Full');
          const rawRange = sub.intervals.map(int => `${formatTimeUnit(int.startMin)}-${formatTimeUnit(int.endMin)}`).join('; ');
          const actualRange = formatRange(clampedSegments);
          
          subDataRows.push({
            name: sub.name,
            cnt: String(sub.intervals.length),
            raw: formatDuration(rawTotalMins),
            net: formatDuration(slicedMins),
            rawRange,
            actualRange,
            status,
            exceedsHead
          });
        });

        const totalRawMins = subs.reduce((acc, sub) => acc + sub.intervals.reduce((a, i) => a + (i.endMin - i.startMin), 0), 0);
        const totalSlicedMins = subs.reduce((acc, sub) => {
          const segments = getSlicedSegmentsForSub(sub.intervals);
          return acc + segments.reduce((a, s) => a + (s.end - s.start), 0);
        }, 0);
        
        // Actual = merged segments clamped to head range
        const mergedActualSegments = mergeIntervals(allClampedSegments);
        const totalActualMins = mergedActualSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);

        const headers = ['Name', 'Cnt', 'Raw', 'Net', 'Actual', 'Raw Start-End', 'Actual Start-End', 'Status'];
        const totalRow = ['TOTAL', '', formatDuration(totalRawMins), formatDuration(totalSlicedMins), formatDuration(totalActualMins), '', '', ''];
        
        const colW = headers.map((h, i) => {
          let maxLen = h.length;
          subDataRows.forEach(row => {
            const vals = [row.name, row.cnt, row.raw, row.net, row.net, row.rawRange, row.actualRange, row.status];
            maxLen = Math.max(maxLen, vals[i].length);
          });
          maxLen = Math.max(maxLen, totalRow[i].length);
          if (i === 0) maxLen = Math.max(maxLen, 12);
          if (i === 1) maxLen = Math.max(maxLen, 3);
          if (i === 7) maxLen = Math.max(maxLen, 8); // Increased for 'Overflow'
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
        
        // Add notes about exceeding head and actual calculation
        if (hasSubExceedingHead) {
          text += 'Note: Some sub channels exceed head duration range. Status marked as "Overflow".\n';
          text += '      Actual time is clamped to head range (' + formatTimeUnit(headRangeStart) + ' - ' + formatTimeUnit(headRangeEnd) + ').\n';
        }
        text += 'Note: Raw = sum all durations, Net = after cutoff, Actual = merged overlaps within head range.\n\n';
      }

      if (cutoffSubs.length > 0) {
        text += 'CUTOFF (Non-Operational Time)\n';
        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';
        text += '| ' + 'Name'.padEnd(26) + ' | ' + 'Range'.padEnd(18) + ' | ' + 'Duration'.padEnd(10) + ' |\n';
        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';

        cutoffSubs.forEach(sub => {
          sub.intervals.forEach((interval, idx) => {
            const cutDuration = interval.endMin - interval.startMin;
            const name = sub.intervals.length > 1 ? `${sub.name} [${idx + 1}]` : sub.name;
            const rangeStr = mode === 'oclock' 
              ? `${interval.startTime} -> ${interval.endTime}`
              : `${interval.startMin} -> ${interval.endMin}`;
            text += '| ' + name.substring(0, 26).padEnd(26) + ' | ' + rangeStr.padEnd(18) + ' | ' + formatDuration(cutDuration).padStart(8).padEnd(10) + ' |\n';
          });
        });

        text += '+' + '-'.repeat(28) + '+' + '-'.repeat(20) + '+' + '-'.repeat(12) + '+\n';
        const totalCutoffMinsAll = cutoffSubs.reduce((acc, sub) => acc + sub.intervals.reduce((a, i) => a + (i.endMin - i.startMin), 0), 0);
        text += '| ' + 'TOTAL CUTOFF'.padEnd(26) + ' | ' + ''.padEnd(18) + ' | ' + formatDuration(totalCutoffMinsAll).padStart(8).padEnd(10) + ' |\n';
        text += '+' + '='.repeat(28) + '+' + '='.repeat(20) + '+' + '='.repeat(12) + '+\n\n';
      }

      text += '\n';
    });

    // Custom Labels section
    if (customLabels.length > 0) {
      text += 'CUSTOM LABELS\n';
      text += '+' + '-'.repeat(30) + '+' + '-'.repeat(46) + '+\n';
      customLabels.forEach(label => {
        text += '| ' + label.key.padEnd(28) + ' | ' + label.value.padEnd(44) + ' |\n';
      });
      text += '+' + '='.repeat(30) + '+' + '='.repeat(46) + '+\n\n';
    }

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
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Add new head channel
  const addHeadChannel = () => {
    const defaultColor = COLOR_PRESETS[0]?.value || '#10b981';
    const newHead: ImportHeadChannel = {
      id: generateId(),
      name: `Head ${headChannels.length + 1}`,
      totalMinutes: 60,
      startTime: '08:00',
      endTime: '09:00',
      subChannels: [],
      expanded: true,
      color: defaultColor,
      status: ''
    };
    setHeadChannels([...headChannels, newHead]);
  };

  // Delete head channel
  const deleteHeadChannel = (headId: string) => {
    const head = headChannels.find(h => h.id === headId);
    if (head) {
      const subIds = head.subChannels.map(s => s.id);
      setVisibleStatusLabels(prev => {
        const next = new Set(prev);
        subIds.forEach(id => next.delete(id));
        return next;
      });
    }
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
    const head = headChannels.find(h => h.id === headId);
    if (!head) return;
    
    const subCount = head.subChannels.filter(s => !s.isCutoff).length;
    const defaultColor = head.color || COLOR_PRESETS[0]?.value || '#10b981';
    const subId = generateId();
    
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      const newSub: ImportSubChannel = {
        id: subId,
        name: `Sub ${subCount + 1}`,
        intervals: [],
        expanded: true,
        isCutoff: false,
        color: defaultColor,
        status: '',
        visible: false // Default hidden
      };
      return { ...h, subChannels: [...h.subChannels, newSub] };
    }));
  };

  // Add cutoff timer
  const addCutoffTimer = (headId: string) => {
    const subId = generateId();
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      const cutoffCount = h.subChannels.filter(s => s.isCutoff).length;
      const newCutoff: ImportSubChannel = {
        id: subId,
        name: `Cutoff ${cutoffCount + 1}`,
        intervals: [],
        expanded: true,
        isCutoff: true,
        color: '#ef4444',
        status: '',
        visible: false
      };
      return { ...h, subChannels: [...h.subChannels, newCutoff] };
    }));
  };

  // Delete sub channel
  const deleteSubChannel = (headId: string, subId: string) => {
    setVisibleStatusLabels(prev => {
      const next = new Set(prev);
      next.delete(subId);
      return next;
    });
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

  // Toggle sub channel status label visibility
  const toggleStatusLabelVisibility = (subId: string) => {
    setVisibleStatusLabels(prev => {
      const next = new Set(prev);
      if (next.has(subId)) {
        next.delete(subId);
      } else {
        next.add(subId);
      }
      return next;
    });
  };

  // Add interval to sub channel
  const addInterval = (headId: string, subId: string) => {
    setHeadChannels(headChannels.map(h => {
      if (h.id !== headId) return h;
      return {
        ...h,
        subChannels: h.subChannels.map(s => {
          if (s.id !== subId) return s;
          
          let newStartMin: number;
          let newEndMin: number;
          let newStartTime: string;
          let newEndTime: string;
          
          if (mode === 'oclock') {
            const headStartMins = timeToMinutes(h.startTime);
            const lastEnd = s.intervals.length > 0 ? timeToMinutes(s.intervals[s.intervals.length - 1].endTime) : headStartMins;
            newStartMin = lastEnd;
            newEndMin = lastEnd + 30; // allow beyond head
            newStartTime = minutesToTime(newStartMin);
            newEndTime = minutesToTime(newEndMin);
          } else {
            const lastEnd = s.intervals.length > 0 ? s.intervals[s.intervals.length - 1].endMin : 0;
            newStartMin = lastEnd;
            newEndMin = lastEnd + 5; // allow beyond head
            newStartTime = minutesToTime(newStartMin);
            newEndTime = minutesToTime(newEndMin);
          }
          
          const newInterval: TimelineInterval = {
            id: generateId(),
            startMin: newStartMin,
            endMin: newEndMin,
            startTime: newStartTime,
            endTime: newEndTime,
            color: s.color // default to sub-channel color
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
            intervals: s.intervals.map(i => {
              if (i.id !== intervalId) return i;
              const updated = { ...i, ...updates };
              // Sync startMin/endMin with startTime/endTime
              if (updates.startTime !== undefined) {
                updated.startMin = timeToMinutes(updates.startTime);
              }
              if (updates.endTime !== undefined) {
                updated.endMin = timeToMinutes(updates.endTime);
              }
              if (updates.startMin !== undefined) {
                updated.startTime = minutesToTime(updates.startMin);
              }
              if (updates.endMin !== undefined) {
                updated.endTime = minutesToTime(updates.endMin);
              }
              return updated;
            }),
          };
        }),
      };
    }));
  };

  // Calculate head summary with cutoff
  const getHeadSummary = (head: ImportHeadChannel) => {
    let totalMins: number;
    if (mode === 'oclock') {
      totalMins = timeToMinutes(head.endTime) - timeToMinutes(head.startTime);
    } else {
      totalMins = head.totalMinutes;
    }
    const cutoffMins = head.subChannels.filter(s => s.isCutoff).reduce((acc, s) => 
      acc + s.intervals.reduce((intAcc, int) => intAcc + getDurationMinutes(int.startMin, int.endMin), 0), 0);
    return { totalMins, cutoffMins, netMins: totalMins - cutoffMins };
  };

  // Save to compact JSON (TXT file)
  const saveToJson = async () => {
    if (headChannels.length === 0) {
      toast.error('No data to save');
      return;
    }
    const data = {
      mode,
      labels: customLabels,
      heads: headChannels.map(h => ({
        n: h.name,
        t: h.totalMinutes,
        st: h.startTime,
        et: h.endTime,
        c: h.color,
        st2: h.status,
        s: h.subChannels.map(sc => ({
          n: sc.name,
          cut: sc.isCutoff ? 1 : 0,
          c: sc.color,
          st: sc.status,
          i: sc.intervals.map(int => mode === 'oclock' 
            ? [int.startTime, int.endTime, int.color]
            : [int.startMin, int.endMin, int.color]
          )
        }))
      }))
    };
    const jsonStr = JSON.stringify(data);
    const result = await saveTextFile(jsonStr, 'timeline-customize.txt');
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

    const stripCodeFences = (s: string) =>
      s.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    const extractJsonPayload = (s: string) => {
      const t = stripCodeFences(s);
      const firstObj = t.indexOf('{');
      const lastObj = t.lastIndexOf('}');
      if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) return t.slice(firstObj, lastObj + 1);
      return t;
    };

    try {
      const payload = extractJsonPayload(input);
      let parsed: any = JSON.parse(payload);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);

      const hadExistingHeads = headChannels.length > 0;
      const hasExistingData = hadExistingHeads || customLabels.length > 0;

      if (parsed.mode) {
        if (!mode || !hasExistingData) {
          setMode(parsed.mode);
        } else if (parsed.mode !== mode) {
          toast.warning(`Imported data uses "${parsed.mode}" mode. Keeping current "${mode}" mode.`);
        }
      }

      if (parsed.labels) {
        const incomingLabels = (parsed.labels as any[]).map((l: any) => ({
          id: l.id || generateId(),
          key: l.key ?? 'Label',
          value: l.value ?? '',
          color: l.color || COLOR_PRESETS[0]?.value || '#8b5cf6',
        }));

        if (incomingLabels.length > 0) {
          setCustomLabels(prev => {
            const used = new Set(prev.map(label => label.id));
            const merged = incomingLabels.map(label => {
              let nextId = label.id;
              if (used.has(nextId)) {
                nextId = generateId();
              }
              used.add(nextId);
              return { ...label, id: nextId };
            });
            return [...prev, ...merged];
          });
        }
      }

      const imported: ImportHeadChannel[] = (parsed.heads || []).map((h: any) => ({
        id: generateId(),
        name: h.n || 'Head',
        totalMinutes: h.t || 60,
        startTime: h.st || '08:00',
        endTime: h.et || '09:00',
        color: h.c || '#10b981',
        status: h.st2 || '',
        expanded: true,
        subChannels: (h.s || []).map((sc: any) => {
          const subId = generateId();
          return {
            id: subId,
            name: sc.n || 'Sub',
            isCutoff: sc.cut === 1,
            color: sc.c || '#3b82f6',
            status: sc.st || '',
            expanded: true,
            visible: false,
            intervals: (sc.i || []).map((int: any, intIdx: number) => {
              const isTimeFormat = typeof int[0] === 'string';
              return {
                id: generateId(),
                startMin: isTimeFormat ? timeToMinutes(int[0]) : int[0],
                endMin: isTimeFormat ? timeToMinutes(int[1]) : int[1],
                startTime: isTimeFormat ? int[0] : minutesToTime(int[0]),
                endTime: isTimeFormat ? int[1] : minutesToTime(int[1]),
                color: int[2] || sc.c || COLOR_PRESETS[intIdx % COLOR_PRESETS.length]?.value || '#3b82f6'
              };
            })
          };
        })
      }));

      setHeadChannels(prev => [...prev, ...imported]);
      toast.success(`Successfully imported ${imported.length} head channel(s)${hadExistingHeads ? ' (merged)' : ''}!`);
    } catch {
      toast.error('Invalid JSON format');
    }
  };

  // Add custom label
  const addCustomLabel = () => {
    const defaultColor = COLOR_PRESETS[customLabels.length % COLOR_PRESETS.length]?.value || '#8b5cf6';
    setCustomLabels([...customLabels, { id: generateId(), key: 'Label', value: '', color: defaultColor }]);
  };

  // Update custom label
  const updateCustomLabel = (id: string, updates: Partial<CustomLabel>) => {
    setCustomLabels(customLabels.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  // Delete custom label
  const deleteCustomLabel = (id: string) => {
    setCustomLabels(customLabels.filter(l => l.id !== id));
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

      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-foreground">Timeline Customize</h3>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
          {mode === 'time' ? 'Minutes' : "O'Clock"}
        </span>
        <button
          onClick={() => setMode(null)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Change Mode
        </button>
      </div>
      
      <p className="text-xs text-muted-foreground mb-4">
        Customize colors, status labels, and visibility for your timeline
      </p>

      {/* Builder UI */}
      <div className="space-y-3">
        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 flex-wrap">
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
            Save TXT
          </button>

          <button
            onClick={importFromJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import TXT
          </button>

          <button
            onClick={addCustomLabel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-medium hover:bg-violet-600 transition-colors"
          >
            <Tag className="w-3.5 h-3.5" />
            Add Label
          </button>
        </div>

        {/* Custom Labels */}
        {customLabels.length > 0 && (
          <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2">
            <div className="text-[10px] font-medium text-violet-400 mb-2 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Custom Labels (shown below graph)
            </div>
            <div className="space-y-1.5">
              {customLabels.map(label => (
                <div key={label.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={label.color || '#8b5cf6'}
                    onChange={(e) => updateCustomLabel(label.id, { color: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    title="Label color"
                  />
                  <input
                    type="text"
                    value={label.key}
                    onChange={(e) => updateCustomLabel(label.id, { key: e.target.value })}
                    className="w-24 bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                    placeholder="Key"
                  />
                  <span className="text-muted-foreground">:</span>
                  <input
                    type="text"
                    value={label.value}
                    onChange={(e) => updateCustomLabel(label.id, { value: e.target.value })}
                    className="flex-1 bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                    placeholder="Value"
                  />
                  <button
                    onClick={() => deleteCustomLabel(label.id)}
                    className="w-5 h-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

                {/* Color picker */}
                <div className="relative">
                  <input
                    type="color"
                    value={head.color}
                    onChange={(e) => updateHeadChannel(head.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    title="Head color"
                  />
                </div>

                <input
                  type="text"
                  value={head.name}
                  onChange={(e) => updateHeadChannel(head.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-medium text-foreground border-none focus:outline-none focus:ring-0"
                  placeholder="Head Channel Name"
                />

                {/* Status input */}
                <input
                  type="text"
                  value={head.status}
                  onChange={(e) => updateHeadChannel(head.id, { status: e.target.value })}
                  className="w-20 bg-muted rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Status"
                />

                {mode === 'time' ? (
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
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      value={head.startTime}
                      onChange={(e) => updateHeadChannel(head.id, { startTime: e.target.value })}
                      className="bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <input
                      type="time"
                      value={head.endTime}
                      onChange={(e) => updateHeadChannel(head.id, { endTime: e.target.value })}
                      className="bg-muted rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                )}

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
                  {/* Action Buttons */}
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

                        {/* Color picker */}
                        <input
                          type="color"
                          value={sub.color}
                          onChange={(e) => updateSubChannel(head.id, sub.id, { color: e.target.value })}
                          className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent"
                          title="Sub color"
                        />

                        <input
                          type="text"
                          value={sub.name}
                          onChange={(e) => updateSubChannel(head.id, sub.id, { name: e.target.value })}
                          className="flex-1 bg-transparent text-xs text-foreground border-none focus:outline-none focus:ring-0"
                          placeholder="Sub Channel Name"
                        />

                        {/* Status input */}
                        <input
                          type="text"
                          value={sub.status}
                          onChange={(e) => updateSubChannel(head.id, sub.id, { status: e.target.value })}
                          className="w-16 bg-muted rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder="Status"
                        />

                        {/* Status visibility toggle */}
                        <button
                          onClick={() => toggleStatusLabelVisibility(sub.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            visibleStatusLabels.has(sub.id) 
                              ? 'bg-primary/20 text-primary' 
                              : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                          title={visibleStatusLabels.has(sub.id) ? 'Status label shown' : 'Status label hidden'}
                        >
                          {visibleStatusLabels.has(sub.id) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>

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
                              {/* Color picker for interval */}
                              <input
                                type="color"
                                value={interval.color}
                                onChange={(e) => updateInterval(head.id, sub.id, interval.id, { color: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                                title="Timeline color"
                              />
                              <span className="text-muted-foreground w-4">{idx + 1}.</span>

                              {mode === 'time' ? (
                                <>
                                  <div className="flex items-center gap-1">
                                    <span className="text-green-500">▶</span>
                                    <input
                                      type="number"
                                      value={interval.startMin}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value) || 0;
                                        updateInterval(head.id, sub.id, interval.id, {
                                          startMin: Math.max(0, Math.min(v, interval.endMin - 1))
                                        });
                                      }}
                                      className="w-12 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                      min="0"
                                    />
                                    <span className="text-muted-foreground">m</span>
                                  </div>

                                  <span className="text-muted-foreground">→</span>

                                  <div className="flex items-center gap-1">
                                    <span className="text-orange-500">⏸</span>
                                    <input
                                      type="number"
                                      value={interval.endMin}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value) || 1;
                                        updateInterval(head.id, sub.id, interval.id, {
                                          endMin: Math.max(interval.startMin + 1, v)
                                        });
                                      }}
                                      className="w-12 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                                      min="1"
                                    />
                                    <span className="text-muted-foreground">m</span>
                                  </div>

                                  <span className="text-muted-foreground">({interval.endMin - interval.startMin}m aktif)</span>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1">
                                    <span className="text-green-500">▶</span>
                                    <input
                                      type="time"
                                      value={interval.startTime}
                                      onChange={(e) => updateInterval(head.id, sub.id, interval.id, { startTime: e.target.value })}
                                      className="bg-muted rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                                    />
                                  </div>

                                  <span className="text-muted-foreground">→</span>

                                  <div className="flex items-center gap-1">
                                    <span className="text-orange-500">⏸</span>
                                    <input
                                      type="time"
                                      value={interval.endTime}
                                      onChange={(e) => updateInterval(head.id, sub.id, interval.id, { endTime: e.target.value })}
                                      className="bg-muted rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                                    />
                                  </div>

                                  <span className="text-muted-foreground">({formatDuration(interval.endMin - interval.startMin)} aktif)</span>
                                </>
                              )}

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

                        {/* Status visibility toggle */}
                        <button
                          onClick={() => toggleStatusLabelVisibility(sub.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            visibleStatusLabels.has(sub.id) 
                              ? 'bg-rose-500/20 text-rose-400' 
                              : 'bg-rose-500/10 text-rose-400/50 hover:text-rose-400'
                          }`}
                          title={visibleStatusLabels.has(sub.id) ? 'Status label shown' : 'Status label hidden'}
                        >
                          {visibleStatusLabels.has(sub.id) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>

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

                              {mode === 'time' ? (
                                <>
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
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1">
                                    <span className="text-rose-400">✂</span>
                                    <input
                                      type="time"
                                      value={interval.startTime}
                                      onChange={(e) => updateInterval(head.id, sub.id, interval.id, { startTime: e.target.value })}
                                      className="bg-rose-500/20 rounded px-1.5 py-0.5 text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-400/50"
                                    />
                                  </div>

                                  <span className="text-rose-400">→</span>

                                  <div className="flex items-center gap-1">
                                    <span className="text-rose-400">✂</span>
                                    <input
                                      type="time"
                                      value={interval.endTime}
                                      onChange={(e) => updateInterval(head.id, sub.id, interval.id, { endTime: e.target.value })}
                                      className="bg-rose-500/20 rounded px-1.5 py-0.5 text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-400/50"
                                    />
                                  </div>

                                  <span className="text-rose-300">(-{formatDuration(interval.endMin - interval.startMin)})</span>
                                </>
                              )}

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
            <>
              <button
                onClick={() => setShowVisibilityPanel(!showVisibilityPanel)}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-xl text-sm font-medium border border-border hover:bg-muted transition-all"
              >
                <Settings2 className="w-4 h-4" />
                Toggle Visibility
              </button>

              <button
                onClick={generateSummaryText}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg shadow-blue-500/25"
              >
                <FileText className="w-4 h-4" />
                Export to Summary
              </button>
            </>
          )}
        </div>
      )}

      {/* Status Label Visibility Panel */}
      {showVisualization && showVisibilityPanel && hasData && (
        <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5" />
            Status Label Visibility (graphs always shown)
          </div>
          <div className="flex flex-wrap gap-2">
            {headChannels.flatMap(head => 
              (head.subChannels ?? []).map(sub => (
                <button
                  key={sub.id}
                  onClick={() => toggleStatusLabelVisibility(sub.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                    visibleStatusLabels.has(sub.id)
                      ? 'text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  style={visibleStatusLabels.has(sub.id) ? { backgroundColor: sub.color } : {}}
                >
                  {visibleStatusLabels.has(sub.id) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {sub.name} {sub.status ? `(${sub.status})` : ''}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Visualization */}
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVisualSettings(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full transition-all bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 hover:text-foreground"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Graph Settings
              </button>
              
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
          </div>

          <VisualizationErrorBoundary title="Timeline visualization failed">
            <TimelineVisualization 
              headChannels={headChannels} 
              showCutoff={showCutoffVisual} 
              customLabels={customLabels}
              mode={mode}
              visibleStatusLabels={visibleStatusLabels}
              visualSettings={visualSettings}
              onOpenSettings={() => setShowVisualSettings(true)}
            />
          </VisualizationErrorBoundary>
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

      {/* Visual Settings Modal */}
      {showVisualSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowVisualSettings(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] m-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Graph Settings</h3>
                  <p className="text-xs text-muted-foreground">Customize timeline visualization</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setVisualSettings(DEFAULT_VISUAL_SETTINGS)} 
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                >
                  Reset Default
                </button>
                <button onClick={() => setShowVisualSettings(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Spacing Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center text-[10px]">📏</span>
                  Spacing & Size
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Container Padding</label>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={visualSettings.containerPadding}
                      onChange={e => setVisualSettings(s => ({ ...s, containerPadding: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.containerPadding}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bar Height</label>
                    <input
                      type="range"
                      min="12"
                      max="40"
                      value={visualSettings.barHeight}
                      onChange={e => setVisualSettings(s => ({ ...s, barHeight: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.barHeight}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bar Gap</label>
                    <input
                      type="range"
                      min="0"
                      max="12"
                      value={visualSettings.barGap}
                      onChange={e => setVisualSettings(s => ({ ...s, barGap: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.barGap}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Border Radius</label>
                    <input
                      type="range"
                      min="0"
                      max="16"
                      value={visualSettings.borderRadius}
                      onChange={e => setVisualSettings(s => ({ ...s, borderRadius: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.borderRadius}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Label Width</label>
                    <input
                      type="range"
                      min="24"
                      max="80"
                      value={visualSettings.labelWidth}
                      onChange={e => setVisualSettings(s => ({ ...s, labelWidth: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.labelWidth}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Value Width</label>
                    <input
                      type="range"
                      min="24"
                      max="64"
                      value={visualSettings.valueWidth}
                      onChange={e => setVisualSettings(s => ({ ...s, valueWidth: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.valueWidth}px</span>
                  </div>
                </div>
              </div>

              {/* Typography Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-[10px]">🔤</span>
                  Typography
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Label Font</label>
                    <input
                      type="range"
                      min="6"
                      max="14"
                      value={visualSettings.labelFontSize}
                      onChange={e => setVisualSettings(s => ({ ...s, labelFontSize: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.labelFontSize}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Value Font</label>
                    <input
                      type="range"
                      min="6"
                      max="14"
                      value={visualSettings.valueFontSize}
                      onChange={e => setVisualSettings(s => ({ ...s, valueFontSize: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.valueFontSize}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Marker Font</label>
                    <input
                      type="range"
                      min="6"
                      max="14"
                      value={visualSettings.markerFontSize}
                      onChange={e => setVisualSettings(s => ({ ...s, markerFontSize: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.markerFontSize}px</span>
                  </div>
                </div>
              </div>

              {/* Time Unit Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center text-[10px]">⏱️</span>
                  Time Unit
                </h4>
                <p className="text-[10px] text-muted-foreground">Display values in the selected time unit on the graph</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setVisualSettings(s => ({ ...s, timeUnit: 'seconds' }))}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                      visualSettings.timeUnit === 'seconds' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    Seconds
                  </button>
                  <button
                    onClick={() => setVisualSettings(s => ({ ...s, timeUnit: 'minutes' }))}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                      visualSettings.timeUnit === 'minutes' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    Minutes
                  </button>
                  <button
                    onClick={() => setVisualSettings(s => ({ ...s, timeUnit: 'hours' }))}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                      visualSettings.timeUnit === 'hours' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    Hours
                  </button>
                </div>
              </div>

              {/* Style Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center text-[10px]">🎨</span>
                  Style & Effects
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bar Opacity</label>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={visualSettings.barOpacity}
                      onChange={e => setVisualSettings(s => ({ ...s, barOpacity: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.barOpacity}%</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Grid Opacity</label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={visualSettings.gridLineOpacity}
                      onChange={e => setVisualSettings(s => ({ ...s, gridLineOpacity: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.gridLineOpacity}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualSettings.showGridLines}
                      onChange={e => setVisualSettings(s => ({ ...s, showGridLines: e.target.checked }))}
                      className="w-4 h-4 rounded border-border bg-muted"
                    />
                    <span className="text-xs text-foreground">Show Grid Lines</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualSettings.showShadow}
                      onChange={e => setVisualSettings(s => ({ ...s, showShadow: e.target.checked }))}
                      className="w-4 h-4 rounded border-border bg-muted"
                    />
                    <span className="text-xs text-foreground">Show Shadow</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualSettings.showLegend}
                      onChange={e => setVisualSettings(s => ({ ...s, showLegend: e.target.checked }))}
                      className="w-4 h-4 rounded border-border bg-muted"
                    />
                    <span className="text-xs text-foreground">Show Legend</span>
                  </label>
                </div>
                {visualSettings.showLegend && (
                  <div className="pt-2">
                    <label className="text-xs text-muted-foreground mb-2 block">Legend Position</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVisualSettings(s => ({ ...s, legendPosition: 'bottom' }))}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                          visualSettings.legendPosition === 'bottom' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        Bottom
                      </button>
                      <button
                        onClick={() => setVisualSettings(s => ({ ...s, legendPosition: 'top' }))}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                          visualSettings.legendPosition === 'top' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        Top
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
