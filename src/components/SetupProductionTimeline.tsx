import { useState, useRef } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Scissors, Clock, Save, Upload, Factory, AlertTriangle, Settings2, Cog, PieChart as PieChartIcon, BarChart3, TrendingUp, Edit2, FileText, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CursorTooltip } from '@/components/CursorTooltip';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ProductionKpiPanel, type ProductionKpiConfig } from '@/components/ProductionKpiPanel';
import { saveTextFile, openTextFile } from '@/lib/textFile';
import { FullscreenChart } from '@/components/FullscreenChart';
import { VisualizationErrorBoundary } from '@/components/VisualizationErrorBoundary';

// Color presets for customization
const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Indigo', value: '#6366f1' },
];

// Default downtime category colors
const DEFAULT_CATEGORY_COLORS = ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4'];

type InputMode = 'time' | 'oclock';
type AnalyticsChartType = 'pie' | 'bar';

// Downtime category interface
interface DowntimeCategory {
  id: string;
  name: string;
  color: string;
}

// Default categories
const createDefaultCategories = (): DowntimeCategory[] => [
  { id: 'produc_isue', name: 'Production Issue', color: '#ef4444' },
  { id: 'material_isue', name: 'Material Issue', color: '#f97316' },
  { id: 'equipmen_isue', name: 'Equipment Issue', color: '#eab308' },
  { id: 'part_isue', name: 'Part Issue', color: '#8b5cf6' },
];

// Chart context label interface (for non-downtime portions)
interface ChartContextLabel {
  id: string;
  name: string;
  color: string;
}

// Default chart context labels
const createDefaultChartContextLabels = (): ChartContextLabel[] => [
  { id: 'budget_remaining', name: 'Not Available', color: '#374151' },
  { id: 'cycle_remaining', name: 'Cycle Time', color: '#4b5563' },
  { id: 'actual_remaining', name: 'Cycle Time', color: '#6b7280' },
];

// System settings interface
interface SystemSettings {
  maxHeadSlots: number;
  downtimeBudgetMins: number;
  downtimeCategories: DowntimeCategory[];
  chartContextLabels: ChartContextLabel[];
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  maxHeadSlots: 5,
  downtimeBudgetMins: 60,
  downtimeCategories: createDefaultCategories(),
  chartContextLabels: createDefaultChartContextLabels(),
};

// Default values
const DEFAULT_CYCLE_TIME = 210; // minutes

interface TimelineInterval {
  id: string;
  startMin: number;
  endMin: number;
  startTime: string;
  endTime: string;
  color: string;
}

interface SubHead {
  id: string;
  name: string;
  intervals: TimelineInterval[];
  expanded: boolean;
  isCutoff?: boolean;
  color: string;
  status: string;
  visible: boolean;
}

// Updated DowntimeItem to use range-based input
interface DowntimeItem {
  id: string;
  categoryId: string;
  startMin: number;
  endMin: number;
  startTime: string;
  endTime: string;
}

interface ProductionHead {
  id: string;
  name: string;
  startMin: number;
  endMin: number;
  totalMinutes: number;
  startTime: string;
  endTime: string;
  color: string;
  status: string;
  expanded: boolean;
  subHeads: SubHead[];
  downtimeItems: DowntimeItem[];
  showDowntimeGraph: boolean;
  individualCycleTime?: number; // Individual cycle time for this head (when using individual mode)
}

interface MainProduction {
  id: string;
  name: string;
  mode: InputMode;
  cycleTime: number;
  useIndividualCycleTimes: boolean; // Toggle for individual cycle times per head
  // KPI / productivity settings (stored per production)
  kpi: ProductionKpiConfig;
  color: string;
  expanded: boolean;
  heads: ProductionHead[];
}

interface SetupProductionTimelineProps {
  onClose: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function timeToMinutes(time?: string): number {
  if (!time || !time.includes(':')) return 0;
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function minutesToTime(mins: number): string {
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = Math.round(mins % 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatDurationShort(mins: number): string {
  return `${Math.round(mins)}m`;
}

// Visual settings for the timeline graph
interface VisualSettings {
  containerPadding: number;
  barHeight: number;
  barGap: number;
  labelWidth: number;
  valueWidth: number;
  labelFontSize: number;
  valueFontSize: number;
  markerFontSize: number;
  borderRadius: number;
  showGridLines: boolean;
  gridLineOpacity: number;
  barOpacity: number;
  showShadow: boolean;
  showLegend: boolean;
  legendPosition: 'bottom' | 'top';
  timeUnit: 'minutes' | 'hours' | 'seconds';
}

const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  containerPadding: 8,
  barHeight: 20,
  barGap: 2,
  labelWidth: 80,
  valueWidth: 60,
  labelFontSize: 9,
  valueFontSize: 9,
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

// Get duration minutes
function getDurationMinutes(startMin: number, endMin: number): number {
  return Math.max(0, endMin - startMin);
}

// Cutoff interval type
interface CutoffInterval {
  startMins: number;
  endMins: number;
}

// Get sliced segments after cutoff
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

// Downtime Timeline Graph Component - Shows downtime items as timeline bars positioned by their time ranges
interface DowntimeTimelineGraphProps {
  head: ProductionHead;
  headName: string;
  netHeadDurationMins: number;
  mode: InputMode;
  visualSettings: VisualSettings;
  systemSettings: SystemSettings;
  cycleTimeMins?: number; // Total cycle time for percentage calculation
}

function DowntimeTimelineGraph({ head, headName, netHeadDurationMins, mode, visualSettings, systemSettings, cycleTimeMins }: DowntimeTimelineGraphProps) {
  const vs = visualSettings;
  const categories = systemSettings.downtimeCategories;
  const budgetMins = systemSettings.downtimeBudgetMins;
  const downtimeItems = head.downtimeItems ?? [];
  
  // Use net head duration for all calculations and display (after cutoff applied)
  let offsetMins = 0;
  
  if (mode === 'oclock') {
    offsetMins = timeToMinutes(head.startTime);
  } else {
    offsetMins = head.startMin;
  }
  
  // Use net duration for timeline scale (after cutoff)
  const displayDurationMins = netHeadDurationMins;
  
  if (netHeadDurationMins <= 0 || downtimeItems.length === 0) return null;
  
  // Calculate total downtime
  const totalDowntimeMins = downtimeItems.reduce((acc, item) => acc + (item.endMin - item.startMin), 0);
  
  // Calculate percentages
  const pctOfHead = netHeadDurationMins > 0 ? (totalDowntimeMins / netHeadDurationMins) * 100 : 0;
  const pctOfBudget = budgetMins > 0 ? (totalDowntimeMins / budgetMins) * 100 : 0;
  const pctOfCycle = cycleTimeMins && cycleTimeMins > 0 ? (totalDowntimeMins / cycleTimeMins) * 100 : 0;
  
  // Format time based on unit setting
  const formatWithUnit = (mins: number): string => {
    switch (vs.timeUnit) {
      case 'seconds':
        return `${Math.round(mins * 60)}s`;
      case 'hours':
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };
  
  // Generate time markers - EXACT same logic as HeadTimelineVisualization
  const timeMarkers: { mins: number; label: string; position: number }[] = [];
  const stepMinutes = displayDurationMins > 120 ? 30 : displayDurationMins > 60 ? 15 : 10;
  
  for (let i = 0; i <= displayDurationMins; i += stepMinutes) {
    timeMarkers.push({ 
      mins: i, 
      label: formatWithUnit(i),
      position: (i / displayDurationMins) * 100
    });
  }
  // Add final marker only if it doesn't overlap too much with the last step marker
  const lastStepMarker = Math.floor(displayDurationMins / stepMinutes) * stepMinutes;
  if (displayDurationMins - lastStepMarker > stepMinutes * 0.3) {
    timeMarkers.push({ 
      mins: displayDurationMins, 
      label: formatWithUnit(displayDurationMins),
      position: 100
    });
  }

  return (
    <FullscreenChart title={`Downtime Timeline: ${headName}`}>
      <div 
        className="bg-gradient-to-b from-amber-950/80 to-amber-950/60 border border-amber-500/50 rounded-xl"
        style={{ 
          padding: vs.containerPadding,
          borderRadius: vs.borderRadius 
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-amber-200">
            Downtime Timeline: {formatWithUnit(totalDowntimeMins)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded">
            {pctOfHead.toFixed(1)}% of head
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded ${pctOfBudget > 100 ? 'text-red-400 bg-red-900/50' : 'text-emerald-400 bg-emerald-900/50'}`}>
            {pctOfBudget.toFixed(1)}% of budget
          </span>
          {cycleTimeMins && cycleTimeMins > 0 && (
            <span className="text-[10px] text-cyan-400 bg-cyan-900/50 px-2 py-0.5 rounded">
              {pctOfCycle.toFixed(1)}% of cycle
            </span>
          )}
        </div>
      </div>

      {/* Timeline Graph - EXACT same structure as HeadTimelineVisualization */}
      <div className="relative">
        {/* Grid lines - EXACT same alignment as head graph */}
        {vs.showGridLines && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ 
              marginLeft: vs.labelWidth + 4, 
              marginRight: vs.valueWidth + 4 
            }}
          >
            {timeMarkers.map((marker, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-px"
                style={{ 
                  left: `${marker.position}%`,
                  backgroundColor: `rgba(245, 158, 11, ${vs.gridLineOpacity / 100})`
                }}
              />
            ))}
          </div>
        )}

        {/* Time markers - EXACT same structure as head graph */}
        <div 
          className="relative mb-1 flex justify-between items-end" 
          style={{ 
            marginLeft: vs.labelWidth + 4, 
            marginRight: vs.valueWidth + 4,
            height: 18
          }}
        >
          {timeMarkers.map((marker, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === timeMarkers.length - 1;
            return (
              <span
                key={idx}
                style={{ 
                  fontSize: vs.markerFontSize,
                  position: 'absolute',
                  left: `${marker.position}%`,
                  transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  whiteSpace: 'nowrap'
                }}
                className="font-medium text-amber-400 tabular-nums"
              >
                {marker.label}
              </span>
            );
          })}
        </div>

        {/* Timeline Bars - EXACT same structure as HeadTimelineVisualization */}
        <div style={{ gap: vs.barGap }} className="flex flex-col">
          {/* Downtime combined bar */}
          <div className="flex items-center gap-1">
            <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0">
              <span style={{ fontSize: vs.labelFontSize }} className="font-semibold text-amber-300 uppercase tracking-wider">
                Downtime
              </span>
            </div>
            <CursorTooltip content={
              <>
                <p className="font-medium text-amber-400">Total Downtime</p>
                <p>{formatWithUnit(totalDowntimeMins)} / {formatWithUnit(netHeadDurationMins)}</p>
              </>
            }>
              <div 
                className="flex-1 relative cursor-pointer bg-slate-800/70 rounded border border-slate-700/50"
                style={{ 
                  height: vs.barHeight + 4,
                  borderRadius: vs.borderRadius,
                  opacity: vs.barOpacity / 100
                }}
              >
                {downtimeItems.map((item) => {
                  const category = categories.find(c => c.id === item.categoryId) || categories[0];
                  // Position based on item's time range relative to head - use displayDurationMins for scale
                  const itemStartRelative = (mode === 'oclock' ? item.startMin - offsetMins : item.startMin - offsetMins);
                  const itemDuration = item.endMin - item.startMin;
                  const left = (itemStartRelative / displayDurationMins) * 100;
                  const width = (itemDuration / displayDurationMins) * 100;
                  
                  return (
                    <CursorTooltip
                      key={item.id}
                      asChild
                      content={
                        <>
                          <p className="font-medium" style={{ color: category?.color }}>{category?.name}</p>
                          <p>
                            {mode === 'oclock' 
                              ? `${item.startTime} → ${item.endTime}` 
                              : `${formatWithUnit(item.startMin)} → ${formatWithUnit(item.endMin)}`
                            }
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            Duration: {formatWithUnit(itemDuration)}
                          </p>
                        </>
                      }
                    >
                      <div
                        className="absolute top-0 bottom-0 rounded shadow-lg border-2"
                        style={{
                          left: `${Math.max(left, 0)}%`,
                          width: `${Math.max(width, 0.5)}%`,
                          background: category?.color,
                          borderColor: `${category?.color}`,
                          borderRadius: vs.borderRadius,
                          boxShadow: `0 0 8px ${category?.color}80`
                        }}
                      />
                    </CursorTooltip>
                  );
                })}
              </div>
            </CursorTooltip>
            <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
              <span style={{ fontSize: vs.valueFontSize }} className="text-amber-300 tabular-nums font-medium">
                {formatWithUnit(totalDowntimeMins)}
              </span>
            </div>
          </div>

          {/* Head reference line - showing NET head duration (after cutoff) */}
          <div className="flex items-center gap-1">
            <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0 flex items-center justify-end gap-1">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
              <span style={{ fontSize: vs.labelFontSize }} className="text-amber-200/80 truncate block">
                {headName}
              </span>
            </div>
            <div 
              className="flex-1 relative bg-slate-800/30 rounded border border-slate-700/20"
              style={{ 
                height: vs.barHeight,
                borderRadius: vs.borderRadius,
                opacity: vs.barOpacity / 100
              }}
            >
              <div 
                className="absolute top-0 left-0 bottom-0 rounded bg-emerald-500/30 border border-emerald-500/20"
                style={{ 
                  width: '100%',
                  borderRadius: vs.borderRadius
                }}
              />
            </div>
            <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
              <span style={{ fontSize: vs.valueFontSize }} className="text-amber-200/80 tabular-nums">
                {formatWithUnit(netHeadDurationMins)}
              </span>
            </div>
          </div>

          {/* Individual type bars */}
            {categories.map(category => {
              const typeItems = downtimeItems.filter(d => d.categoryId === category.id);
              if (typeItems.length === 0) return null;
            
            const typeTotalMins = typeItems.reduce((acc, d) => acc + (d.endMin - d.startMin), 0);
            
            return (
              <div key={category.id} className="flex items-center gap-1">
                <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0 flex items-center justify-end gap-1">
                  <div 
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: category.color }}
                  />
                  <span style={{ fontSize: vs.labelFontSize }} className="text-amber-200/80 truncate block">
                    {category.name.replace(' Issue', '')}
                  </span>
                </div>
                <CursorTooltip
                  asChild
                  content={
                    <>
                      <p className="font-medium" style={{ color: category.color }}>{category.name}</p>
                      <p>{formatWithUnit(typeTotalMins)} ({typeItems.length} item{typeItems.length > 1 ? 's' : ''})</p>
                    </>
                  }
                >
                  <div 
                    className="flex-1 relative cursor-pointer bg-slate-800/50 rounded border border-slate-700/30"
                    style={{ height: vs.barHeight - 4, borderRadius: vs.borderRadius, opacity: vs.barOpacity / 100 }}
                  >
                    {typeItems.map((item) => {
                      const itemStartRelative = (mode === 'oclock' ? item.startMin - offsetMins : item.startMin - offsetMins);
                      const itemDuration = item.endMin - item.startMin;
                      const left = (itemStartRelative / displayDurationMins) * 100;
                      const width = (itemDuration / displayDurationMins) * 100;
                      return (
                        <div
                          key={item.id}
                          className="absolute top-0 bottom-0 rounded shadow-md"
                          style={{
                            left: `${Math.max(left, 0)}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            background: category.color,
                            borderRadius: vs.borderRadius,
                            boxShadow: `0 0 6px ${category.color}60`
                          }}
                        />
                      );
                    })}
                  </div>
                </CursorTooltip>
                <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
                  <span style={{ fontSize: vs.valueFontSize }} className="text-amber-200/80 tabular-nums">
                    {formatWithUnit(typeTotalMins)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] pt-2 border-t border-amber-500/20">
        <div className="flex items-center gap-3 flex-wrap">
          {categories.map(category => {
            const typeTotal = downtimeItems.filter(d => d.categoryId === category.id).reduce((a, d) => a + (d.endMin - d.startMin), 0);
            if (typeTotal === 0) return null;
            return (
              <div key={category.id} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="text-amber-200">{formatWithUnit(typeTotal)}</span>
              </div>
            );
          })}
        </div>
        <div className="text-amber-300 font-medium">
          Budget: {formatWithUnit(systemSettings.downtimeBudgetMins)}
        </div>
      </div>
      </div>
    </FullscreenChart>
  );
}

// Timeline Visualization Component for a single head
interface HeadTimelineVisualizationProps {
  head: ProductionHead;
  mode: InputMode;
  showCutoff: boolean;
  visualSettings: VisualSettings;
  systemSettings: SystemSettings;
  showDowntimeGraph: boolean;
  cycleTimeMins?: number; // Individual or global cycle time for this head
}

function HeadTimelineVisualization({ head, mode, showCutoff, visualSettings, systemSettings, showDowntimeGraph, cycleTimeMins }: HeadTimelineVisualizationProps) {
  const vs = visualSettings;
  const subHeads = head.subHeads ?? [];
  const downtimeItems = head.downtimeItems ?? [];
    
  // Calculate cutoffs first
  const cutoffSubs = subHeads.filter(s => s.isCutoff);
  const totalCutoffMins = cutoffSubs.reduce((acc, sub) => 
    acc + sub.intervals.reduce((a, int) => a + getDurationMinutes(int.startMin, int.endMin), 0), 0);
  
  let headDurationMins: number;
  let offsetMins = 0;
  
  if (mode === 'oclock') {
    const headStartMins = timeToMinutes(head.startTime);
    const headEndMins = timeToMinutes(head.endTime);
    headDurationMins = headEndMins - headStartMins;
    offsetMins = headStartMins;
  } else {
    headDurationMins = head.endMin - head.startMin;
    offsetMins = head.startMin;
  }
  
  // Apply cutoff to head duration for display purposes
  const netHeadDurationMins = headDurationMins - totalCutoffMins;
  
  if (headDurationMins <= 0) return null;

  // Find max end time from all sub-heads
  let maxSubEndMins = 0;
  subHeads.forEach(sub => {
    sub.intervals.forEach(interval => {
      const relativeEnd = mode === 'oclock' ? interval.endMin - offsetMins : interval.endMin - offsetMins;
      maxSubEndMins = Math.max(maxSubEndMins, relativeEnd);
    });
  });
  
  const totalDurationMins = Math.max(headDurationMins, maxSubEndMins);
  const netOperationalMins = netHeadDurationMins;

  // Use raw duration when showing cutoff, net duration when hiding cutoff
  // This ensures the graph scales correctly for both views
  const displayDurationMins = showCutoff 
    ? Math.max(headDurationMins, maxSubEndMins)
    : Math.max(netOperationalMins, maxSubEndMins > 0 ? maxSubEndMins - totalCutoffMins : 0);

  // Format time based on unit setting
  const formatWithUnit = (mins: number): string => {
    switch (vs.timeUnit) {
      case 'seconds':
        return `${Math.round(mins * 60)}s`;
      case 'hours':
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };

  // Generate time markers with proper spacing - avoid last marker overlap
  const timeMarkers: { mins: number; label: string; position: number }[] = [];
  const stepMinutes = displayDurationMins > 120 ? 30 : displayDurationMins > 60 ? 15 : 10;
  
  for (let i = 0; i <= displayDurationMins; i += stepMinutes) {
    timeMarkers.push({ 
      mins: i, 
      label: formatWithUnit(i),
      position: (i / displayDurationMins) * 100
    });
  }
  // Add final marker only if it doesn't overlap too much with the last step marker
  const lastStepMarker = Math.floor(displayDurationMins / stepMinutes) * stepMinutes;
  if (displayDurationMins - lastStepMarker > stepMinutes * 0.3) {
    timeMarkers.push({ 
      mins: displayDurationMins, 
      label: formatWithUnit(displayDurationMins),
      position: 100
    });
  }

  return (
    <FullscreenChart title={`${head.name} Timeline`}>
      <div 
        className="bg-gradient-to-b from-card to-card/80 rounded-xl border border-border/50 backdrop-blur-sm"
        style={{ 
          padding: vs.containerPadding,
          borderRadius: vs.borderRadius,
          boxShadow: vs.showShadow ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
        }}
      >
      {/* Header with time range */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: head.color }}
          />
          <h3 style={{ fontSize: vs.labelFontSize + 2 }} className="font-semibold text-foreground tracking-tight">
            {head.name}
          </h3>
          <span style={{ fontSize: vs.labelFontSize }} className="text-muted-foreground">
            {mode === 'oclock' 
              ? `${head.startTime} → ${head.endTime} (${formatDurationShort(netHeadDurationMins)})`
              : `${formatWithUnit(head.startMin)} → ${formatWithUnit(head.endMin)} (${formatDurationShort(netHeadDurationMins)})`
            }
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalCutoffMins > 0 && (
            <div className="px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
              <span style={{ fontSize: vs.markerFontSize }} className="font-medium text-rose-400">-{formatDurationShort(totalCutoffMins)} (Net: {formatDurationShort(netHeadDurationMins)})</span>
            </div>
          )}
        </div>
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
            {timeMarkers.map((marker, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-px"
                style={{ 
                  left: `${marker.position}%`,
                  backgroundColor: `rgba(128, 128, 128, ${vs.gridLineOpacity / 100})`
                }}
              />
            ))}
          </div>
        )}

        {/* Time markers - Fixed alignment with safe spacing */}
        <div 
          className="relative mb-1 flex justify-between items-end" 
          style={{ 
            marginLeft: vs.labelWidth + 4, 
            marginRight: vs.valueWidth + 4,
            height: 18
          }}
        >
          {timeMarkers.map((marker, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === timeMarkers.length - 1;
            return (
              <span
                key={idx}
                style={{ 
                  fontSize: vs.markerFontSize,
                  position: 'absolute',
                  left: `${marker.position}%`,
                  transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  whiteSpace: 'nowrap'
                }}
                className="font-medium text-muted-foreground tabular-nums"
              >
                {marker.label}
              </span>
            );
          })}
        </div>

        {/* Timeline Bars */}
        <div style={{ gap: vs.barGap }} className="flex flex-col">
          {/* Head channel bar */}
          <div className="flex items-center gap-1">
            <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0">
              <span style={{ fontSize: vs.labelFontSize }} className="font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
            </div>
            <CursorTooltip content={
              <>
                <p className="font-medium">
                  {mode === 'oclock' 
                    ? `${head.startTime} → ${head.endTime}` 
                    : `${formatWithUnit(head.startMin)} → ${formatWithUnit(head.endMin)}`
                  }
                </p>
                <p className="text-muted-foreground">
                  {showCutoff && totalCutoffMins > 0 
                    ? `Raw: ${formatDuration(headDurationMins)} | Cutoff: -${formatDuration(totalCutoffMins)} | Net: ${formatDuration(netOperationalMins)}`
                    : `Net: ${formatDuration(netOperationalMins)} (${netOperationalMins} min)`
                  }
                </p>
              </>
            }>
              <div 
                className="flex-1 rounded relative overflow-hidden border cursor-pointer"
                style={{
                  height: vs.barHeight + 4,
                  borderRadius: vs.borderRadius,
                  opacity: vs.barOpacity / 100,
                  background: `linear-gradient(to right, ${head.color}33, ${head.color}1a)`,
                  borderColor: `${head.color}33`
                }}
              >
                {/* When showCutoff is true: Show full bar with cutoff segments overlaid */}
                {showCutoff && totalCutoffMins > 0 ? (
                  <>
                    {/* Full raw duration bar */}
                    <div 
                      className="absolute top-0 left-0 bottom-0" 
                      style={{ 
                        width: `${(headDurationMins / displayDurationMins) * 100}%`,
                        background: `linear-gradient(to right, ${head.color}80, ${head.color}60)` 
                      }}
                    />
                    {/* Cutoff segments overlaid in red to show what's being cut */}
                    {cutoffSubs.flatMap(sub => sub.intervals).map((interval) => {
                      const cutoffLeft = ((interval.startMin - offsetMins) / displayDurationMins) * 100;
                      const cutoffWidth = ((interval.endMin - interval.startMin) / displayDurationMins) * 100;
                      return (
                        <div
                          key={interval.id}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: `${Math.max(0, cutoffLeft)}%`,
                            width: `${cutoffWidth}%`,
                            background: 'linear-gradient(to right, rgba(239, 68, 68, 0.6), rgba(248, 113, 113, 0.6))',
                            borderLeft: '1px solid rgba(239, 68, 68, 0.8)',
                            borderRight: '1px solid rgba(239, 68, 68, 0.8)'
                          }}
                        />
                      );
                    })}
                  </>
                ) : (
                  /* When showCutoff is false: Show only the net duration (final bar) */
                  <div 
                    className="absolute top-0 left-0 bottom-0" 
                    style={{ 
                      width: '100%',
                      background: `linear-gradient(to right, ${head.color}80, ${head.color}60)` 
                    }}
                  />
                )}
              </div>
            </CursorTooltip>
            <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
              <span style={{ fontSize: vs.valueFontSize }} className="text-foreground tabular-nums font-medium">
                {showCutoff && totalCutoffMins > 0 
                  ? formatDurationShort(headDurationMins)
                  : formatDurationShort(netHeadDurationMins)
                }
              </span>
            </div>
          </div>

          {/* Sub-heads bars */}
          {subHeads.filter(s => !s.isCutoff).map((sub) => {
            const firstInt = sub.intervals[0];
            const lastInt = sub.intervals[sub.intervals.length - 1];
            const labelIndicatorColor = firstInt?.color || sub.color;

            const cutoffIntervals: CutoffInterval[] = cutoffSubs.flatMap(cs => 
              cs.intervals.map(int => ({ startMins: int.startMin, endMins: int.endMin }))
            );

            const slicedSegments = getSlicedSegments(
              sub.intervals.map(i => ({ id: i.id, startMin: i.startMin, endMin: i.endMin, color: i.color })),
              cutoffIntervals,
              totalDurationMins,
              offsetMins
            );

            const slicedActiveMins = slicedSegments.reduce((acc, seg) => acc + (seg.endMin - seg.startMin), 0);

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
                          : `${formatDurationShort(firstInt?.startMin || 0)} → ${formatDurationShort(lastInt?.endMin || 0)}`
                        }
                      </p>
                      <p className="text-muted-foreground">Active: {formatDuration(slicedActiveMins)} ({slicedActiveMins} min)</p>
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
                    {slicedSegments.map((segment) => (
                      <CursorTooltip
                        key={segment.id}
                        asChild
                        content={
                          <>
                            <p className="font-medium">{sub.name}</p>
                            <p>
                              {mode === 'oclock'
                                ? `${minutesToTime(segment.startMin)} → ${minutesToTime(segment.endMin)}`
                                : `${formatDurationShort(segment.startMin)} → ${formatDurationShort(segment.endMin)}`
                              }
                            </p>
                            <p className="text-muted-foreground">{formatDuration(segment.endMin - segment.startMin)}</p>
                          </>
                        }
                      >
                        <div
                          className="absolute top-0 bottom-0 rounded shadow-sm border"
                          style={{
                            left: `${segment.left}%`,
                            width: `${segment.width}%`,
                            background: `linear-gradient(to right, ${segment.color}, ${segment.color}cc)`,
                            borderColor: `${segment.color}4d`,
                            borderRadius: vs.borderRadius
                          }}
                        />
                      </CursorTooltip>
                    ))}
                  </div>
                </CursorTooltip>
                <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
                  <span style={{ fontSize: vs.valueFontSize }} className="text-foreground tabular-nums font-medium">
                    {formatDurationShort(slicedActiveMins)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Cutoff bars */}
          {showCutoff && cutoffSubs.map((sub) => {
            const firstCut = sub.intervals[0];
            const lastCut = sub.intervals[sub.intervals.length - 1];
            const totalCutMins = sub.intervals.reduce((a, i) => a + getDurationMinutes(i.startMin, i.endMin), 0);

            return (
              <div key={sub.id} className="flex items-center gap-1">
                <div style={{ width: vs.labelWidth }} className="text-right pr-1 flex-shrink-0 flex items-center justify-end gap-1">
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
                          : `${formatDurationShort(firstCut?.startMin || 0)} → ${formatDurationShort(lastCut?.endMin || 0)}`
                        }
                      </p>
                      <p className="text-muted-foreground">Deducted: {formatDuration(totalCutMins)} ({totalCutMins} min)</p>
                    </>
                  }
                >
                  <div 
                    className="flex-1 relative cursor-pointer"
                    style={{ height: vs.barHeight, opacity: vs.barOpacity / 100 }}
                  >
                    {sub.intervals.map((interval) => {
                      const left = ((interval.startMin - offsetMins) / totalDurationMins) * 100;
                      const width = ((interval.endMin - interval.startMin) / totalDurationMins) * 100;
                      return (
                        <div
                          key={interval.id}
                          className="absolute top-0 bottom-0 rounded shadow-sm border"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: 'linear-gradient(to right, #ef4444, #f87171)',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            borderRadius: vs.borderRadius
                          }}
                        />
                      );
                    })}
                  </div>
                </CursorTooltip>
                <div style={{ width: vs.valueWidth }} className="text-right flex-shrink-0">
                  <span style={{ fontSize: vs.valueFontSize }} className="text-rose-400 tabular-nums font-medium">-{formatDurationShort(totalCutMins)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Downtime Timeline Graph - Controlled by global toggle */}
      {showDowntimeGraph && downtimeItems.length > 0 && (
        <div className="mt-3">
          <DowntimeTimelineGraph 
            head={head}
            headName={head.name}
            netHeadDurationMins={netHeadDurationMins}
            mode={mode}
            visualSettings={vs}
            systemSettings={systemSettings}
            cycleTimeMins={cycleTimeMins}
          />
        </div>
      )}
      </div>
    </FullscreenChart>
  );
}

// Analytics Chart Component - supports Pie, Bar, Area
interface AnalyticsChartProps {
  title: string;
  baseDurationMins: number;
  downtimeByCategory: { categoryId: string; minutes: number; color: string; name: string }[];
  totalDowntimeMins: number;
  budgetMins: number;
  chartType: AnalyticsChartType;
  icon?: React.ReactNode;
  accentColor: string;
  remainingLabel: string;
  remainingColor: string;
  timeUnit: 'seconds' | 'minutes' | 'hours';
}

function AnalyticsChart({ 
  title, 
  baseDurationMins, 
  downtimeByCategory, 
  totalDowntimeMins, 
  budgetMins,
  chartType,
  icon,
  accentColor,
  remainingLabel,
  remainingColor,
  timeUnit
}: AnalyticsChartProps) {
  const isOver = totalDowntimeMins > baseDurationMins;
  const remaining = Math.max(0, baseDurationMins - totalDowntimeMins);
  const downtimePct = baseDurationMins > 0 ? (totalDowntimeMins / baseDurationMins) * 100 : 0;
  
  // Format values based on time unit
  const formatWithUnit = (mins: number): string => {
    switch (timeUnit) {
      case 'seconds':
        return `${Math.round(mins * 60)}s`;
      case 'hours':
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };

  // Build chart data with percentages for each category
  const chartData = [
    ...downtimeByCategory.filter(d => d.minutes > 0).map(d => ({
      name: d.name,
      value: d.minutes,
      color: d.color,
      pct: (d.minutes / baseDurationMins) * 100
    })),
    ...(remaining > 0 ? [{
      name: remainingLabel,
      value: remaining,
      color: remainingColor,
      pct: (remaining / baseDurationMins) * 100
    }] : [])
  ];

  // Custom label for pie chart showing percentage on segments
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null; // Don't show label for small slices
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor="middle" 
        dominantBaseline="central"
        fontSize={9}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => formatWithUnit(v)} />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={9} width={70} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                formatter={(value: number, name: string, props: any) => [
                  `${formatWithUnit(value)} (${props.payload.pct.toFixed(1)}%)`, 
                  ''
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      default: // pie
        return (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={renderCustomizedLabel}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                formatter={(value: number, name: string, props: any) => [
                  `${formatWithUnit(value)} (${props.payload.pct.toFixed(1)}%)`, 
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <FullscreenChart title={title}>
      <div className={`bg-gradient-to-b from-card to-card/80 rounded-xl border p-4 ${isOver ? 'border-red-500/50 bg-red-500/5' : 'border-border/50'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {icon || <Factory className="w-4 h-4" style={{ color: accentColor }} />}
          {title}
        </h4>
        {isOver && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-[10px] font-medium text-red-500">OVER</span>
          </div>
        )}
      </div>

      {renderChart()}

      {/* Stats */}
      <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total Downtime:</span>
          <span className={`font-medium ${isOver ? 'text-red-500' : 'text-foreground'}`}>{formatWithUnit(totalDowntimeMins)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Base Duration:</span>
          <span className="font-medium text-foreground">{formatWithUnit(baseDurationMins)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Downtime %:</span>
          <span className={`font-medium ${downtimePct > 50 ? 'text-amber-500' : 'text-foreground'}`}>{downtimePct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Legend with all items including context label */}
      <div className="mt-3 pt-2 border-t border-border/30">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {chartData.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.name}:</span>
              <span className="font-medium text-foreground">{formatWithUnit(item.value)}</span>
              <span className="text-muted-foreground/70">({item.pct.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </FullscreenChart>
  );
}

// Downtime vs Budget Progress Chart - Unique horizontal stacked progress bar visualization
interface DowntimeBudgetProgressChartProps {
  downtimeByCategory: { categoryId: string; minutes: number; color: string; name: string }[];
  totalDowntimeMins: number;
  budgetMins: number;
  timeUnit: 'seconds' | 'minutes' | 'hours';
}

function DowntimeBudgetProgressChart({ 
  downtimeByCategory, 
  totalDowntimeMins, 
  budgetMins,
  timeUnit
}: DowntimeBudgetProgressChartProps) {
  const isOverBudget = totalDowntimeMins > budgetMins;
  const usedPct = budgetMins > 0 ? Math.min((totalDowntimeMins / budgetMins) * 100, 100) : 0;
  const overPct = isOverBudget && budgetMins > 0 ? ((totalDowntimeMins - budgetMins) / budgetMins) * 100 : 0;
  
  // Format values based on time unit
  const formatWithUnit = (mins: number): string => {
    switch (timeUnit) {
      case 'seconds':
        return `${Math.round(mins * 60)}s`;
      case 'hours':
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };

  // Build data for stacked segments (each category as a portion of the progress bar)
  const downtimeData = downtimeByCategory.filter(d => d.minutes > 0).map(d => ({
    name: d.name,
    value: d.minutes,
    color: d.color,
    pctOfBudget: budgetMins > 0 ? (d.minutes / budgetMins) * 100 : 0,
    pctOfTotal: totalDowntimeMins > 0 ? (d.minutes / totalDowntimeMins) * 100 : 0
  }));

  // Calculate cumulative positions for stacked segments
  let cumulative = 0;
  const stackedSegments = downtimeData.map(d => {
    const segment = {
      ...d,
      left: cumulative,
      width: Math.min(d.pctOfBudget, 100 - cumulative) // Cap at 100%
    };
    cumulative += d.pctOfBudget;
    return segment;
  });

  return (
    <FullscreenChart title="Downtime vs Budget" fillWidth={false} contentClassName="max-w-lg w-full">
      <div className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border-2 p-5 shadow-2xl backdrop-blur-sm ${isOverBudget ? 'border-red-500/60' : 'border-white/10'}`}>
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-base font-bold text-white flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          Downtime vs Budget
        </h4>
        {isOverBudget && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 shadow-lg shadow-red-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-400">OVER BUDGET</span>
          </div>
        )}
      </div>

      {/* Main Progress Bar Visualization */}
      <div className="space-y-4">
        {/* Budget scale markers */}
        <div className="relative h-5 flex justify-between text-xs text-white/60 font-semibold px-1">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
        
        {/* Main progress bar container */}
        <div className="relative">
          {/* Background track */}
          <div className="h-12 bg-gradient-to-r from-slate-700/80 to-slate-600/60 rounded-xl border border-white/10 overflow-hidden relative shadow-inner">
            {/* Grid lines */}
            <div className="absolute inset-0 flex">
              {[25, 50, 75].map(pct => (
                <div
                  key={pct}
                  className="absolute top-0 bottom-0 w-px bg-white/10"
                  style={{ left: `${pct}%` }}
                />
              ))}
            </div>
            
            {/* Stacked category segments */}
            {stackedSegments.map((segment, idx) => (
              <CursorTooltip
                key={idx}
                asChild
                content={
                  <>
                    <p className="font-bold" style={{ color: segment.color }}>{segment.name}</p>
                    <p className="text-white">{formatWithUnit(segment.value)}</p>
                    <p className="text-white/70 text-[10px]">{segment.pctOfBudget.toFixed(1)}% of budget</p>
                  </>
                }
              >
                <div
                  className="absolute top-0 bottom-0 cursor-pointer transition-all hover:brightness-125 hover:scale-y-105"
                  style={{
                    left: `${segment.left}%`,
                    width: `${segment.width}%`,
                    background: `linear-gradient(135deg, ${segment.color}, ${segment.color}cc)`,
                    boxShadow: `0 0 20px ${segment.color}80, inset 0 1px 0 rgba(255,255,255,0.2)`
                  }}
                />
              </CursorTooltip>
            ))}
            
            {/* Overflow indicator (over budget) */}
            {isOverBudget && (
              <div 
                className="absolute top-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-red-500/30 to-red-500/60 flex items-center justify-end pr-3"
                style={{ width: '25%' }}
              >
                <span className="text-sm font-black text-red-400 drop-shadow-lg">+{overPct.toFixed(0)}%</span>
              </div>
            )}
          </div>
          
          {/* 100% budget marker line */}
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500 rounded-full shadow-lg" />
        </div>

        {/* Usage indicator */}
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30" />
            <span className="text-sm font-semibold text-white">
              {formatWithUnit(totalDowntimeMins)} used
            </span>
          </div>
          <span className={`text-sm font-bold ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
            {isOverBudget 
              ? `${(usedPct + overPct).toFixed(1)}% (Over by ${formatWithUnit(totalDowntimeMins - budgetMins)})`
              : `${usedPct.toFixed(1)}% (${formatWithUnit(budgetMins - totalDowntimeMins)} remaining)`
            }
          </span>
        </div>
      </div>

      {/* Category Breakdown as mini progress bars */}
      <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
        <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Category Breakdown</span>
        {downtimeData.map((item, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}60` }} />
                <span className="text-sm font-medium text-white/90">{item.name}</span>
              </div>
              <span className="text-sm font-bold text-white">
                {formatWithUnit(item.value)} <span className="text-white/50">({item.pctOfTotal.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${item.pctOfTotal}%`,
                  background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                  boxShadow: `0 0 10px ${item.color}40`
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-xl p-3 border border-white/10 text-center">
          <div className="text-xs font-semibold text-white/50 mb-1">Used</div>
          <div className={`text-lg font-black ${isOverBudget ? 'text-red-400' : 'text-white'}`}>
            {formatWithUnit(totalDowntimeMins)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-xl p-3 border border-white/10 text-center">
          <div className="text-xs font-semibold text-white/50 mb-1">Budget</div>
          <div className="text-lg font-black text-amber-400">
            {formatWithUnit(budgetMins)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-xl p-3 border border-white/10 text-center">
          <div className="text-xs font-semibold text-white/50 mb-1">Status</div>
          <div className={`text-lg font-black ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
            {isOverBudget ? 'OVER' : 'OK'}
          </div>
        </div>
      </div>
      </div>
    </FullscreenChart>
  );
}

// System Settings Modal Component
interface SystemSettingsModalProps {
  settings: SystemSettings;
  onSettingsChange: (settings: SystemSettings) => void;
  onClose: () => void;
}

function SystemSettingsModal({ settings, onSettingsChange, onClose }: SystemSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);

  const handleSave = () => {
    onSettingsChange(localSettings);
    toast.success('System settings saved');
    onClose();
  };

  const addCategory = () => {
    const newCategory: DowntimeCategory = {
      id: generateId(),
      name: `Category ${localSettings.downtimeCategories.length + 1}`,
      color: DEFAULT_CATEGORY_COLORS[localSettings.downtimeCategories.length % DEFAULT_CATEGORY_COLORS.length]
    };
    setLocalSettings({
      ...localSettings,
      downtimeCategories: [...localSettings.downtimeCategories, newCategory]
    });
  };

  const deleteCategory = (id: string) => {
    if (localSettings.downtimeCategories.length <= 1) {
      toast.error('Must have at least one category');
      return;
    }
    setLocalSettings({
      ...localSettings,
      downtimeCategories: localSettings.downtimeCategories.filter(c => c.id !== id)
    });
  };

  const updateCategory = (id: string, updates: Partial<DowntimeCategory>) => {
    setLocalSettings({
      ...localSettings,
      downtimeCategories: localSettings.downtimeCategories.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  const updateContextLabel = (id: string, updates: Partial<ChartContextLabel>) => {
    setLocalSettings({
      ...localSettings,
      chartContextLabels: localSettings.chartContextLabels.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  // Get friendly name for context label
  const getContextLabelTitle = (id: string): string => {
    switch (id) {
      case 'budget_remaining': return 'Downtime vs Budget';
      case 'cycle_remaining': return 'Downtime vs Cycle Time';
      case 'actual_remaining': return 'Downtime vs Actual Cycle Time';
      default: return id;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Cog className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">System Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-destructive hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 space-y-5">
          {/* Head Slots Setting */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Factory className="w-4 h-4 text-primary" />
              Head Slots Configuration
            </h4>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Maximum Heads per Production</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={localSettings.maxHeadSlots}
                  onChange={e => setLocalSettings(s => ({ ...s, maxHeadSlots: Math.max(1, Math.min(99, Number(e.target.value) || 5)) }))}
                  className="w-20 bg-muted border border-border rounded-lg px-3 py-2 text-center text-lg font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Max: 99 heads per production</p>
            </div>
          </div>

          {/* Downtime Budget Setting */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Downtime Budget
            </h4>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Maximum Downtime per Cycle (minutes)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="480"
                  value={localSettings.downtimeBudgetMins}
                  onChange={e => setLocalSettings(s => ({ ...s, downtimeBudgetMins: Math.max(1, parseInt(e.target.value) || 60) }))}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-sm text-muted-foreground font-medium">minutes</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Current: {formatDuration(localSettings.downtimeBudgetMins)}</p>
            </div>
          </div>

          {/* Downtime Categories */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-500" />
                Downtime Categories
              </h4>
              <button
                onClick={addCategory}
                className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            
            <div className="space-y-2">
              {localSettings.downtimeCategories.map((category, idx) => (
                <div key={category.id} className="flex items-center gap-2 bg-card rounded-lg p-2 border border-border/50">
                  <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                  <input
                    type="color"
                    value={category.color}
                    onChange={e => updateCategory(category.id, { color: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                  />
                  {editingCategoryId === category.id ? (
                    <input
                      type="text"
                      value={category.name}
                      onChange={e => updateCategory(category.id, { name: e.target.value })}
                      onBlur={() => setEditingCategoryId(null)}
                      onKeyDown={e => e.key === 'Enter' && setEditingCategoryId(null)}
                      autoFocus
                      className="flex-1 bg-muted border border-primary/50 rounded px-2 py-1 text-xs focus:outline-none"
                    />
                  ) : (
                    <span 
                      className="flex-1 text-xs text-foreground cursor-pointer hover:text-primary"
                      onClick={() => setEditingCategoryId(category.id)}
                    >
                      {category.name}
                    </span>
                  )}
                  <button
                    onClick={() => setEditingCategoryId(category.id)}
                    className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteCategory(category.id)}
                    className="w-6 h-6 rounded hover:bg-destructive/20 hover:text-destructive flex items-center justify-center text-muted-foreground"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Click on category name to edit. Categories are used to classify downtime events.</p>
          </div>

          {/* Chart Context Labels */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-500" />
              Chart Context Labels
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Customize the label for non-downtime portions in each chart context.
            </p>
            
            <div className="space-y-2">
              {localSettings.chartContextLabels.map((ctx) => (
                <div key={ctx.id} className="flex items-center gap-2 bg-card rounded-lg p-2 border border-border/50">
                  <div className="flex-shrink-0 w-24">
                    <span className="text-[10px] text-muted-foreground leading-tight block">
                      {getContextLabelTitle(ctx.id)}
                    </span>
                  </div>
                  <input
                    type="color"
                    value={ctx.color}
                    onChange={e => updateContextLabel(ctx.id, { color: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                  />
                  {editingContextId === ctx.id ? (
                    <input
                      type="text"
                      value={ctx.name}
                      onChange={e => updateContextLabel(ctx.id, { name: e.target.value })}
                      onBlur={() => setEditingContextId(null)}
                      onKeyDown={e => e.key === 'Enter' && setEditingContextId(null)}
                      autoFocus
                      className="flex-1 bg-muted border border-primary/50 rounded px-2 py-1 text-xs focus:outline-none"
                    />
                  ) : (
                    <span 
                      className="flex-1 text-xs text-foreground cursor-pointer hover:text-primary truncate"
                      onClick={() => setEditingContextId(ctx.id)}
                    >
                      {ctx.name}
                    </span>
                  )}
                  <button
                    onClick={() => setEditingContextId(ctx.id)}
                    className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetupProductionTimeline({ onClose }: SetupProductionTimelineProps) {
  const [mode, setMode] = useState<InputMode | null>(null);
  const [mainProductions, setMainProductions] = useState<MainProduction[]>([]);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showCutoffVisual, setShowCutoffVisual] = useState(false);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const [showVisualSettings, setShowVisualSettings] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const visualizationRef = useRef<HTMLDivElement>(null);
  
  // Chart visibility and type toggles
  const [showBudgetChart, setShowBudgetChart] = useState(true);
  const [showCycleTimeChart, setShowCycleTimeChart] = useState(false);
  const [showActualCycleChart, setShowActualCycleChart] = useState(false);
  const [showDowntimeOnlyChart, setShowDowntimeOnlyChart] = useState(true); // New dedicated chart
  const [analyticsChartType, setAnalyticsChartType] = useState<AnalyticsChartType>('pie');
  
  // Global downtime graph toggle (hidden by default)
  const [showGlobalDowntimeGraph, setShowGlobalDowntimeGraph] = useState(false);
  
  // Summary report modal
  const [showSummaryReport, setShowSummaryReport] = useState(false);
  const [summaryReportText, setSummaryReportText] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
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
        
        <div className="flex items-center gap-2 mb-4">
          <Factory className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Setup Production Timeline</h3>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">
          Choose input mode for production timeline:
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('time')}
            className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
          >
            <Clock className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium text-foreground">Minutes</span>
            <span className="text-[10px] text-muted-foreground text-center">
              Input time ranges in minutes<br />
              (e.g., 0 → 60, 15 → 45)
            </span>
          </button>
          
          <button
            onClick={() => setMode('oclock')}
            className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
          >
            <Clock className="w-6 h-6 text-cyan-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium text-foreground">O'Clock</span>
            <span className="text-[10px] text-muted-foreground text-center">
              Input time ranges in HH:MM<br />
              (e.g., 07:40 → 08:20)
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Add main production
  const addMainProduction = () => {
    const productionCount = mainProductions.length;
    const newProduction: MainProduction = {
      id: generateId(),
      name: `Main Production ${productionCount + 1}`,
      mode: mode,
      cycleTime: DEFAULT_CYCLE_TIME,
      useIndividualCycleTimes: false,
      kpi: {
        cycleTimePerUnit: DEFAULT_CYCLE_TIME,
        unitsPerCycle: 1,
        targetEnabled: false,
        manualTargetOutput: 0,
        targetBasis: 'cycle',
        shiftMinutes: undefined,
        actualBasis: 'net',
        timeContext: 'production',
      },
      color: COLOR_PRESETS[productionCount % COLOR_PRESETS.length].value,
      expanded: true,
      heads: []
    };
    setMainProductions([...mainProductions, newProduction]);
  };

  // Delete main production
  const deleteMainProduction = (id: string) => {
    setMainProductions(mainProductions.filter(p => p.id !== id));
  };

  // Update main production
  const updateMainProduction = (id: string, updates: Partial<MainProduction>) => {
    setMainProductions(mainProductions.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Toggle main production expand
  const toggleMainProductionExpand = (id: string) => {
    const production = mainProductions.find(p => p.id === id);
    if (!production) return;
    updateMainProduction(id, { expanded: !production.expanded });
  };

  // Add head to production
  const addHead = (productionId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production || production.heads.length >= systemSettings.maxHeadSlots) return;
    
    const headCount = production.heads.length;
    const defaultColor = production.color;
    
    const newHead: ProductionHead = {
      id: generateId(),
      name: `Head ${headCount + 1}`,
      startMin: 0,
      endMin: 60,
      totalMinutes: 60,
      startTime: '08:00',
      endTime: '09:00',
      color: defaultColor,
      status: '',
      expanded: true,
      subHeads: [],
      downtimeItems: [],
      showDowntimeGraph: false,
      individualCycleTime: production.cycleTime // Default to production cycle time
    };
    
    updateMainProduction(productionId, { heads: [...production.heads, newHead] });
  };

  // Delete head
  const deleteHead = (productionId: string, headId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    updateMainProduction(productionId, { heads: production.heads.filter(h => h.id !== headId) });
  };

  // Update head
  const updateHead = (productionId: string, headId: string, updates: Partial<ProductionHead>) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    updateMainProduction(productionId, {
      heads: production.heads.map(h => h.id === headId ? { ...h, ...updates } : h)
    });
  };

  // Toggle head expand
  const toggleHeadExpand = (productionId: string, headId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    updateHead(productionId, headId, { expanded: !head.expanded });
  };

  // Add sub head
  const addSubHead = (productionId: string, headId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    
    const subCount = head.subHeads.filter(s => !s.isCutoff).length;
    const defaultColor = head.color;
    
    const newSub: SubHead = {
      id: generateId(),
      name: `Sub ${subCount + 1}`,
      intervals: [],
      expanded: true,
      isCutoff: false,
      color: defaultColor,
      status: '',
      visible: false
    };
    
    updateHead(productionId, headId, { subHeads: [...head.subHeads, newSub] });
  };

  // Add cutoff timer
  const addCutoffTimer = (productionId: string, headId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    
    const cutoffCount = head.subHeads.filter(s => s.isCutoff).length;
    const newCutoff: SubHead = {
      id: generateId(),
      name: `Cutoff ${cutoffCount + 1}`,
      intervals: [],
      expanded: true,
      isCutoff: true,
      color: '#ef4444',
      status: '',
      visible: false
    };
    
    updateHead(productionId, headId, { subHeads: [...head.subHeads, newCutoff] });
  };

  // Delete sub head
  const deleteSubHead = (productionId: string, headId: string, subId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    updateHead(productionId, headId, { subHeads: head.subHeads.filter(s => s.id !== subId) });
  };

  // Update sub head
  const updateSubHead = (productionId: string, headId: string, subId: string, updates: Partial<SubHead>) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    updateHead(productionId, headId, {
      subHeads: head.subHeads.map(s => s.id === subId ? { ...s, ...updates } : s)
    });
  };

  // Toggle sub expand
  const toggleSubExpand = (productionId: string, headId: string, subId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    const sub = head.subHeads.find(s => s.id === subId);
    if (!sub) return;
    updateSubHead(productionId, headId, subId, { expanded: !sub.expanded });
  };

  // Add interval
  const addInterval = (productionId: string, headId: string, subId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    const sub = head.subHeads.find(s => s.id === subId);
    if (!sub) return;
    
    const lastInterval = sub.intervals[sub.intervals.length - 1];
    const lastEnd = lastInterval?.endMin || 0;
    const newInterval: TimelineInterval = {
      id: generateId(),
      startMin: lastEnd,
      endMin: lastEnd + 10,
      startTime: minutesToTime(lastEnd),
      endTime: minutesToTime(lastEnd + 10),
      color: sub.color
    };
    
    updateSubHead(productionId, headId, subId, { intervals: [...sub.intervals, newInterval] });
  };

  // Delete interval
  const deleteInterval = (productionId: string, headId: string, subId: string, intervalId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    const sub = head.subHeads.find(s => s.id === subId);
    if (!sub) return;
    updateSubHead(productionId, headId, subId, { intervals: sub.intervals.filter(i => i.id !== intervalId) });
  };

  // Update interval
  const updateInterval = (productionId: string, headId: string, subId: string, intervalId: string, updates: Partial<TimelineInterval>) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    const sub = head.subHeads.find(s => s.id === subId);
    if (!sub) return;
    
    updateSubHead(productionId, headId, subId, {
      intervals: sub.intervals.map(i => {
        if (i.id !== intervalId) return i;
        let updated = { ...i, ...updates };
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
      })
    });
  };

  // Calculate total downtime for a production (now using ranges)
    const getProductionDowntime = (production: MainProduction): { byCategory: { categoryId: string; minutes: number; color: string; name: string }[]; total: number } => {
      const categoryTotals = new Map<string, number>();
      const heads = production.heads ?? [];
      
      heads.forEach(head => {
        const items = head.downtimeItems ?? [];
        items.forEach(item => {
          const itemDuration = item.endMin - item.startMin;
          categoryTotals.set(item.categoryId, (categoryTotals.get(item.categoryId) || 0) + itemDuration);
        });
      });

    const byCategory = systemSettings.downtimeCategories.map(cat => ({
      categoryId: cat.id,
      minutes: categoryTotals.get(cat.id) || 0,
      color: cat.color,
      name: cat.name
    }));

    const total = Array.from(categoryTotals.values()).reduce((a, b) => a + b, 0);
    return { byCategory, total };
  };

  // Add downtime item with range-based input
  const addDowntimeItem = (productionId: string, headId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    
    const { total: currentTotal } = getProductionDowntime(production);
    const newTotal = currentTotal + 10;
    
    if (newTotal > systemSettings.downtimeBudgetMins) {
      toast.warning(`Warning: Adding this will exceed the ${systemSettings.downtimeBudgetMins}m downtime budget`);
    }
    
    const firstCategory = systemSettings.downtimeCategories[0];
    // Default range: 0 → 10
    const newItem: DowntimeItem = {
      id: generateId(),
      categoryId: firstCategory?.id || 'produc_isue',
      startMin: 0,
      endMin: 10,
      startTime: '00:00',
      endTime: '00:10'
    };
    
    updateHead(productionId, headId, { downtimeItems: [...head.downtimeItems, newItem] });
  };

  // Delete downtime item
  const deleteDowntimeItem = (productionId: string, headId: string, itemId: string) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    updateHead(productionId, headId, { downtimeItems: head.downtimeItems.filter(d => d.id !== itemId) });
  };

  // Update downtime item
  const updateDowntimeItem = (productionId: string, headId: string, itemId: string, updates: Partial<DowntimeItem>) => {
    const production = mainProductions.find(p => p.id === productionId);
    if (!production) return;
    const head = production.heads.find(h => h.id === headId);
    if (!head) return;
    
    updateHead(productionId, headId, {
      downtimeItems: head.downtimeItems.map(d => {
        if (d.id !== itemId) return d;
        let updated = { ...d, ...updates };
        // Sync time and minute values
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
      })
    });
  };

  // Save to compact JSON (TXT file)
  const saveToJson = async () => {
    if (mainProductions.length === 0) {
      toast.error('No data to save');
      return;
    }
    const data = {
      v: 2,
      mode: mode,
      sys: {
        mhs: systemSettings.maxHeadSlots,
        dbm: systemSettings.downtimeBudgetMins,
        cats: systemSettings.downtimeCategories.map(c => [c.id, c.name, c.color]),
        ctx: systemSettings.chartContextLabels.map(c => [c.id, c.name, c.color])
      },
        productions: mainProductions.map(p => ({
        n: p.name,
        ct: p.cycleTime,
        uict: p.useIndividualCycleTimes ? 1 : 0,
          // KPI tuple: [cycleTimePerUnit, unitsPerCycle, targetBasis, shiftMinutes?, actualBasis?, timeContext?, targetEnabled?, manualTargetOutput?]
          kpi: [
            p.kpi?.cycleTimePerUnit ?? DEFAULT_CYCLE_TIME,
            p.kpi?.unitsPerCycle ?? 1,
            p.kpi?.targetBasis ?? 'cycle',
            p.kpi?.shiftMinutes ?? null,
            p.kpi?.actualBasis ?? 'net',
            p.kpi?.timeContext ?? 'production',
            p.kpi?.targetEnabled ? 1 : 0,
            p.kpi?.manualTargetOutput ?? null,
          ],
        c: p.color,
        h: p.heads.map(h => ({
          n: h.name,
          sm: h.startMin,
          em: h.endMin,
          t: h.totalMinutes,
          st: h.startTime,
          et: h.endTime,
          c: h.color,
          st2: h.status,
          sdg: h.showDowntimeGraph ? 1 : 0,
          ict: h.individualCycleTime || p.cycleTime,
          dt: h.downtimeItems.map(d => mode === 'oclock' 
            ? [d.categoryId, d.startTime, d.endTime]
            : [d.categoryId, d.startMin, d.endMin]
          ),
          s: h.subHeads.map(s => ({
            n: s.name,
            cut: s.isCutoff ? 1 : 0,
            c: s.color,
            st: s.status,
            i: s.intervals.map(int => mode === 'oclock'
              ? [int.startTime, int.endTime, int.color]
              : [int.startMin, int.endMin, int.color]
            )
          }))
        }))
      }))
    };
    const jsonStr = JSON.stringify(data);
    const result = await saveTextFile(jsonStr, 'production-timeline.txt');
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

      // Set mode
      const importedMode = parsed.mode || 'time';
      setMode(importedMode);

      // Import system settings if available (v2)
      if (parsed.sys) {
        const importedCategories: DowntimeCategory[] = (parsed.sys.cats || []).map((c: any) => ({
          id: c[0],
          name: c[1],
          color: c[2]
        }));
        const importedContextLabels: ChartContextLabel[] = (parsed.sys.ctx || []).map((c: any) => ({
          id: c[0],
          name: c[1],
          color: c[2]
        }));
        setSystemSettings({
          maxHeadSlots: parsed.sys.mhs || 5,
          downtimeBudgetMins: parsed.sys.dbm || 60,
          downtimeCategories: importedCategories.length > 0 ? importedCategories : createDefaultCategories(),
          chartContextLabels: importedContextLabels.length > 0 ? importedContextLabels : createDefaultChartContextLabels()
        });
      }

      // Import productions
      const imported: MainProduction[] = (parsed.productions || []).map((p: any) => ({
        id: generateId(),
        name: p.n || 'Main Production',
        mode: importedMode,
        cycleTime: p.ct || DEFAULT_CYCLE_TIME,
        useIndividualCycleTimes: p.uict === 1,
        kpi: {
          cycleTimePerUnit: Array.isArray(p.kpi) ? (Number(p.kpi[0]) || p.ct || DEFAULT_CYCLE_TIME) : (Number(p.ctpu) || p.ct || DEFAULT_CYCLE_TIME),
          unitsPerCycle: Array.isArray(p.kpi) ? (Number(p.kpi[1]) || 1) : (Number(p.upc) || 1),
          targetBasis: Array.isArray(p.kpi) ? (p.kpi[2] || 'cycle') : (p.tb || 'cycle'),
          shiftMinutes: Array.isArray(p.kpi) ? (Number(p.kpi[3]) || undefined) : undefined,
          actualBasis: Array.isArray(p.kpi) ? (p.kpi[4] || 'net') : 'net',
          timeContext: Array.isArray(p.kpi) ? (p.kpi[5] || 'production') : 'production',
          targetEnabled: Array.isArray(p.kpi) ? (!!p.kpi[6]) : false,
          manualTargetOutput: Array.isArray(p.kpi) ? (Number(p.kpi[7]) || 0) : 0,
        },
        color: p.c || '#10b981',
        expanded: true,
        heads: (p.h || []).slice(0, systemSettings.maxHeadSlots).map((h: any) => ({
          id: generateId(),
          name: h.n || 'Head',
          startMin: h.sm || 0,
          endMin: h.em || (h.t || 60),
          totalMinutes: h.t || 60,
          startTime: h.st || '08:00',
          endTime: h.et || '09:00',
          color: h.c || p.c || '#10b981',
          status: h.st2 || '',
          expanded: true,
          showDowntimeGraph: h.sdg === 1,
          individualCycleTime: h.ict || p.ct || DEFAULT_CYCLE_TIME,
          downtimeItems: (h.dt || []).map((d: any) => {
            if (importedMode === 'oclock') {
              return {
                id: generateId(),
                categoryId: d[0] || systemSettings.downtimeCategories[0]?.id || 'produc_isue',
                startTime: d[1] || '00:00',
                endTime: d[2] || '00:10',
                startMin: timeToMinutes(d[1] || '00:00'),
                endMin: timeToMinutes(d[2] || '00:10')
              };
            } else {
              return {
                id: generateId(),
                categoryId: d[0] || systemSettings.downtimeCategories[0]?.id || 'produc_isue',
                startMin: d[1] || 0,
                endMin: d[2] || 10,
                startTime: minutesToTime(d[1] || 0),
                endTime: minutesToTime(d[2] || 10)
              };
            }
          }),
          subHeads: (h.s || []).map((sc: any) => ({
            id: generateId(),
            name: sc.n || 'Sub',
            isCutoff: sc.cut === 1,
            color: sc.c || h.c || p.c || '#10b981',
            status: sc.st || '',
            visible: false,
            expanded: true,
            intervals: (sc.i || []).map((int: any) => {
              if (importedMode === 'oclock') {
                return {
                  id: generateId(),
                  startTime: int[0] || '00:00',
                  endTime: int[1] || '00:00',
                  startMin: timeToMinutes(int[0] || '00:00'),
                  endMin: timeToMinutes(int[1] || '00:00'),
                  color: int[2] || sc.c || h.c || p.c || '#10b981'
                };
              } else {
                return {
                  id: generateId(),
                  startMin: int[0] || 0,
                  endMin: int[1] || 0,
                  startTime: minutesToTime(int[0] || 0),
                  endTime: minutesToTime(int[1] || 0),
                  color: int[2] || sc.c || h.c || p.c || '#10b981'
                };
              }
            })
          }))
        }))
      }));

      setMainProductions(imported);
      toast.success(`Imported ${imported.length} production(s)`);
    } catch (e) {
      toast.error('Failed to parse JSON data');
      console.error(e);
    }
  };

  const hasData = mainProductions.some(p => p.heads.length > 0);

  // Format value based on unit for display
  const formatWithUnit = (mins: number): string => {
    switch (visualSettings.timeUnit) {
      case 'seconds':
        return `${Math.round(mins * 60)}s`;
      case 'hours':
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };

  // Generate Summary Report
  const generateSummaryReport = () => {
    const divider = '═'.repeat(60);
    const thinDivider = '─'.repeat(60);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    let report = '';
    report += `${divider}\n`;
    report += `                    PRODUCTION TIMELINE REPORT\n`;
    report += `${divider}\n`;
    report += `Generated: ${dateStr} at ${timeStr}\n`;
    report += `Mode: ${mode === 'oclock' ? "O'Clock (HH:MM)" : 'Minutes'}\n`;
    report += `Time Unit: ${visualSettings.timeUnit.charAt(0).toUpperCase() + visualSettings.timeUnit.slice(1)}\n`;
    report += `${thinDivider}\n\n`;

    // System Configuration
    report += `▌ SYSTEM CONFIGURATION\n`;
    report += `${thinDivider}\n`;
    report += `  Downtime Budget     : ${formatDuration(systemSettings.downtimeBudgetMins)}\n`;
    report += `  Max Head Slots      : ${systemSettings.maxHeadSlots}\n`;
    report += `  Categories          : ${systemSettings.downtimeCategories.length}\n`;
    systemSettings.downtimeCategories.forEach((cat, i) => {
      report += `    ${i + 1}. ${cat.name}\n`;
    });
    report += `\n`;

    // Per Production Summary
    mainProductions.forEach((production, pIdx) => {
      const { byCategory, total: totalDowntimeMins } = getProductionDowntime(production);
      const isOverBudget = totalDowntimeMins > systemSettings.downtimeBudgetMins;
      
      // Calculate actual cycle time from heads using NET durations (after cutoff)
      const actualCycleTimeMins = production.heads.reduce((acc, head) => {
        // Get raw head duration
        const rawHeadDuration = mode === 'oclock' 
          ? timeToMinutes(head.endTime) - timeToMinutes(head.startTime)
          : head.endMin - head.startMin;
        
        // Calculate total cutoff for this head
        const totalCutoffMins = head.subHeads
          .filter(s => s.isCutoff)
          .reduce((cAcc, cutoff) => {
            return cAcc + cutoff.intervals.reduce((iAcc, interval) => {
              return iAcc + (interval.endMin - interval.startMin);
            }, 0);
          }, 0);
        
        // Return net duration (raw - cutoff)
        const netHeadDuration = Math.max(0, rawHeadDuration - totalCutoffMins);
        return acc + netHeadDuration;
      }, 0);
      
      // Calculate total cycle time based on number of heads (cycleTime × number of heads)
      const totalCycleTimeMins = production.cycleTime * production.heads.length;

      report += `${divider}\n`;
      report += `▌ ${production.name.toUpperCase()}\n`;
      report += `${divider}\n`;
      report += `  Cycle Time (Config) : ${formatDuration(production.cycleTime)} per head\n`;
      report += `  Total Cycle Time    : ${formatDuration(totalCycleTimeMins)} (${production.cycleTime}m × ${production.heads.length} heads)\n`;
      report += `  Actual Net Time     : ${formatDuration(actualCycleTimeMins)} (after cutoffs)\n`;
      report += `  Total Heads         : ${production.heads.length} / ${systemSettings.maxHeadSlots}\n`;
      report += `\n`;

      // Downtime Summary
      report += `  ┌─ DOWNTIME SUMMARY ────────────────────────────────────────\n`;
      report += `  │ Total Downtime    : ${formatDuration(totalDowntimeMins)}\n`;
      report += `  │ Budget            : ${formatDuration(systemSettings.downtimeBudgetMins)}\n`;
      report += `  │ Status            : ${isOverBudget ? '⚠ OVER BUDGET' : '✓ Within Budget'}\n`;
      if (isOverBudget) {
        report += `  │ Over by           : ${formatDuration(totalDowntimeMins - systemSettings.downtimeBudgetMins)}\n`;
      }
      report += `  │ Usage             : ${((totalDowntimeMins / systemSettings.downtimeBudgetMins) * 100).toFixed(1)}%\n`;
      report += `  └──────────────────────────────────────────────────────────\n`;
      report += `\n`;

      // Downtime by Category
      if (byCategory.length > 0) {
        report += `  ┌─ DOWNTIME BY CATEGORY ──────────────────────────────────\n`;
        const maxNameLen = Math.max(...byCategory.map(c => c.name.length), 16);
        byCategory.forEach(cat => {
          const pct = totalDowntimeMins > 0 ? ((cat.minutes / totalDowntimeMins) * 100).toFixed(1) : '0.0';
          const bar = '█'.repeat(Math.min(Math.round((cat.minutes / totalDowntimeMins) * 20), 20));
          report += `  │ ${cat.name.padEnd(maxNameLen)} : ${formatDuration(cat.minutes).padStart(8)} (${pct.padStart(5)}%) ${bar}\n`;
        });
        report += `  └──────────────────────────────────────────────────────────\n`;
        report += `\n`;
      }

      // Heads Detail
      production.heads.forEach((head, hIdx) => {
        const headDuration = mode === 'oclock' 
          ? timeToMinutes(head.endTime) - timeToMinutes(head.startTime)
          : head.endMin - head.startMin;
        
        // Calculate cutoff
        const cutoffSubs = head.subHeads.filter(s => s.isCutoff);
        const totalCutoffMins = cutoffSubs.reduce((acc, sub) => {
          return acc + sub.intervals.reduce((sum, int) => sum + (int.endMin - int.startMin), 0);
        }, 0);
        const netHeadDuration = headDuration - totalCutoffMins;
        
        // Head downtime
        const headDowntime = head.downtimeItems.reduce((acc, item) => acc + (item.endMin - item.startMin), 0);

        report += `  ┌─ ${head.name.toUpperCase()} ────────────────────────────────────────────\n`;
        report += `  │ Time Range       : ${mode === 'oclock' ? `${head.startTime} → ${head.endTime}` : `${formatWithUnit(head.startMin)} → ${formatWithUnit(head.endMin)}`}\n`;
        report += `  │ Raw Duration     : ${formatDuration(headDuration)}\n`;
        if (totalCutoffMins > 0) {
          report += `  │ Cutoff           : -${formatDuration(totalCutoffMins)}\n`;
          report += `  │ Net Duration     : ${formatDuration(netHeadDuration)}\n`;
        }
        report += `  │ Downtime Items   : ${head.downtimeItems.length} (${formatDuration(headDowntime)})\n`;
        report += `  │ Sub-channels     : ${head.subHeads.filter(s => !s.isCutoff).length}\n`;
        report += `  │ Cutoff Timers    : ${cutoffSubs.length}\n`;
        
        // Downtime items detail
        if (head.downtimeItems.length > 0) {
          report += `  │\n`;
          report += `  │ Downtime Items:\n`;
          head.downtimeItems.forEach((item, idx) => {
            const category = systemSettings.downtimeCategories.find(c => c.id === item.categoryId);
            const itemDuration = item.endMin - item.startMin;
            const rangeStr = mode === 'oclock' 
              ? `${item.startTime} → ${item.endTime}`
              : `${formatWithUnit(item.startMin)} → ${formatWithUnit(item.endMin)}`;
            report += `  │   ${(idx + 1).toString().padStart(2)}. [${category?.name || 'Unknown'}] ${rangeStr} (${formatDuration(itemDuration)})\n`;
          });
        }

        // Sub-channels detail
        const regularSubs = head.subHeads.filter(s => !s.isCutoff);
        if (regularSubs.length > 0) {
          report += `  │\n`;
          report += `  │ Sub-channels:\n`;
          regularSubs.forEach((sub, idx) => {
            const subTotal = sub.intervals.reduce((acc, int) => acc + (int.endMin - int.startMin), 0);
            report += `  │   ${(idx + 1).toString().padStart(2)}. ${sub.name}: ${sub.intervals.length} interval(s), ${formatDuration(subTotal)}\n`;
            sub.intervals.forEach((int, iIdx) => {
              const intDur = int.endMin - int.startMin;
              const rangeStr = mode === 'oclock'
                ? `${int.startTime} → ${int.endTime}`
                : `${formatWithUnit(int.startMin)} → ${formatWithUnit(int.endMin)}`;
              report += `  │       ${String.fromCharCode(97 + iIdx)}. ${rangeStr} (${formatDuration(intDur)})\n`;
            });
          });
        }

        // Cutoff timers detail
        if (cutoffSubs.length > 0) {
          report += `  │\n`;
          report += `  │ Cutoff Timers:\n`;
          cutoffSubs.forEach((sub, idx) => {
            const subTotal = sub.intervals.reduce((acc, int) => acc + (int.endMin - int.startMin), 0);
            report += `  │   ${(idx + 1).toString().padStart(2)}. ${sub.name}: ${sub.intervals.length} interval(s), -${formatDuration(subTotal)}\n`;
            sub.intervals.forEach((int, iIdx) => {
              const intDur = int.endMin - int.startMin;
              const rangeStr = mode === 'oclock'
                ? `${int.startTime} → ${int.endTime}`
                : `${formatWithUnit(int.startMin)} → ${formatWithUnit(int.endMin)}`;
              report += `  │       ${String.fromCharCode(97 + iIdx)}. ${rangeStr} (-${formatDuration(intDur)})\n`;
            });
          });
        }

        report += `  └──────────────────────────────────────────────────────────\n`;
        report += `\n`;
      });
    });

    // Footer
    report += `${divider}\n`;
    report += `                         END OF REPORT\n`;
    report += `                    Created by RedCAP © 2026\n`;
    report += `${divider}\n`;

    setSummaryReportText(report);
    setShowSummaryReport(true);
    setCopiedSummary(false);
  };

  // Copy summary to clipboard
  const copySummaryToClipboard = () => {
    navigator.clipboard.writeText(summaryReportText).then(() => {
      setCopiedSummary(true);
      toast.success('Summary copied to clipboard!');
      setTimeout(() => setCopiedSummary(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  return (
    <div className="bg-secondary rounded-xl p-4 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center transition-all"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Factory className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Setup Production Timeline</h3>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
          {mode === 'time' ? 'Minutes' : "O'Clock"}
        </span>
        <button
          onClick={() => setMode(null)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Change Mode
        </button>
        <div className="flex-1" />
        {/* System Settings Button */}
        <button
          onClick={() => setShowSystemSettings(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 border border-border rounded-lg text-xs font-medium hover:bg-muted transition-colors"
        >
          <Cog className="w-3.5 h-3.5" />
          System Setup
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium text-primary">Downtime Budget:</span> {formatDuration(systemSettings.downtimeBudgetMins)} per cycle
          <span className="mx-2">|</span>
          <span className="font-medium text-primary">Default Cycle Time:</span> {formatDuration(DEFAULT_CYCLE_TIME)}
          <span className="mx-2">|</span>
          <span className="font-medium text-primary">Head Slots:</span> {systemSettings.maxHeadSlots}
          <span className="mx-2">|</span>
          <span className="font-medium text-primary">Categories:</span> {systemSettings.downtimeCategories.length}
        </div>
      </div>

      {/* Builder UI */}
      <div className="space-y-3">
        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={addMainProduction}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Main Production
          </button>

          {hasData && (
            <>
              <button
                onClick={() => setShowVisualization(!showVisualization)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showVisualization 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {showVisualization ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showVisualization ? 'Hide' : 'Show'} Visualization
              </button>

              <button
                onClick={saveToJson}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
              >
                <Save className="w-3.5 h-3.5" />
                Save TXT
              </button>

              <button
                onClick={generateSummaryReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-colors border border-amber-500/30"
              >
                <FileText className="w-3.5 h-3.5" />
                Export Summary
              </button>
            </>
          )}

          <button
            onClick={importFromJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import TXT
          </button>

          {showVisualization && (
            <button
              onClick={() => setShowVisualSettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Graph Settings
            </button>
          )}
        </div>

        {/* Productions List */}
        {mainProductions.map((production) => {
          const { byCategory, total: totalDowntimeMins } = getProductionDowntime(production);
          const isOverBudget = totalDowntimeMins > systemSettings.downtimeBudgetMins;

          return (
            <div key={production.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
              {/* Production Header */}
              <div className="flex items-center gap-2">
                <button onClick={() => toggleMainProductionExpand(production.id)} className="text-muted-foreground hover:text-foreground">
                  {production.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: production.color }} />

                <input
                  type="text"
                  value={production.name}
                  onChange={(e) => updateMainProduction(production.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-semibold text-foreground border-none focus:outline-none focus:ring-0"
                  placeholder="Production Name"
                />

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Cycle Time:</span>
                  <input
                    type="number"
                    value={production.cycleTime}
                    onChange={(e) => updateMainProduction(production.id, { cycleTime: Math.max(1, parseInt(e.target.value) || DEFAULT_CYCLE_TIME) })}
                    className={`w-16 bg-muted rounded px-2 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50 ${production.useIndividualCycleTimes ? 'opacity-50' : ''}`}
                    min="1"
                    disabled={production.useIndividualCycleTimes}
                    title={production.useIndividualCycleTimes ? 'Using individual cycle times per head' : 'Global cycle time for all heads'}
                  />
                  <span>m</span>
                  <button
                    onClick={() => updateMainProduction(production.id, { useIndividualCycleTimes: !production.useIndividualCycleTimes })}
                    className={`ml-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      production.useIndividualCycleTimes
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                    title={production.useIndividualCycleTimes ? 'Using individual cycle times per head' : 'Click to enable individual cycle times per head'}
                  >
                    {production.useIndividualCycleTimes ? 'Individual' : 'Unified'}
                  </button>
                </div>

                <div className="text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${isOverBudget ? 'bg-red-500/20 text-red-500' : 'bg-muted text-muted-foreground'}`}>
                    Downtime: {formatDurationShort(totalDowntimeMins)} / {formatDurationShort(systemSettings.downtimeBudgetMins)}
                  </span>
                </div>

                <button
                  onClick={() => deleteMainProduction(production.id)}
                  className="w-6 h-6 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Main Production Content */}
              {production.expanded && (
                <div className="space-y-3 pl-8">
                  {/* Add Head Button */}
                  <button
                    onClick={() => addHead(production.id)}
                    disabled={production.heads.length >= systemSettings.maxHeadSlots}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                    Add Head ({production.heads.length}/{systemSettings.maxHeadSlots})
                  </button>

                  {/* Heads List */}
                  {production.heads.map((head, headIdx) => {
                    const headDowntimeMins = head.downtimeItems.reduce((a, d) => a + (d.endMin - d.startMin), 0);
                    const headDurationMins = mode === 'oclock' 
                      ? timeToMinutes(head.endTime) - timeToMinutes(head.startTime)
                      : head.endMin - head.startMin;
                    
                    return (
                      <div key={head.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                        {/* Head Header */}
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleHeadExpand(production.id, head.id)} className="text-muted-foreground hover:text-foreground">
                            {head.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>

                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {headIdx + 1}
                          </div>

                          <input
                            type="color"
                            value={head.color}
                            onChange={(e) => updateHead(production.id, head.id, { color: e.target.value })}
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                            title="Head color"
                          />

                          <input
                            type="text"
                            value={head.name}
                            onChange={(e) => updateHead(production.id, head.id, { name: e.target.value })}
                            className="flex-1 bg-transparent text-sm font-medium text-foreground border-none focus:outline-none focus:ring-0 min-w-0"
                            placeholder="Head Name"
                          />

                          {/* Time Range Input - Now range-based for both modes */}
                          <div className="flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                            {mode === 'time' ? (
                              <>
                                <input
                                  type="number"
                                  value={head.startMin}
                                  onChange={(e) => {
                                    const newStart = Math.max(0, parseInt(e.target.value) || 0);
                                    updateHead(production.id, head.id, { 
                                      startMin: newStart,
                                      totalMinutes: head.endMin - newStart 
                                    });
                                  }}
                                  className="w-12 bg-transparent text-center focus:outline-none"
                                  min="0"
                                  title="Start minute"
                                />
                                <span className="text-muted-foreground">→</span>
                                <input
                                  type="number"
                                  value={head.endMin}
                                  onChange={(e) => {
                                    const newEnd = Math.max(head.startMin + 1, parseInt(e.target.value) || 1);
                                    updateHead(production.id, head.id, { 
                                      endMin: newEnd,
                                      totalMinutes: newEnd - head.startMin
                                    });
                                  }}
                                  className="w-12 bg-transparent text-center focus:outline-none"
                                  min="1"
                                  title="End minute"
                                />
                                <span className="text-muted-foreground">({formatDurationShort(headDurationMins)})</span>
                              </>
                            ) : (
                              <>
                                <input
                                  type="time"
                                  value={head.startTime}
                                  onChange={(e) => updateHead(production.id, head.id, { startTime: e.target.value })}
                                  className="bg-transparent focus:outline-none w-20"
                                />
                                <span className="text-muted-foreground">→</span>
                                <input
                                  type="time"
                                  value={head.endTime}
                                  onChange={(e) => updateHead(production.id, head.id, { endTime: e.target.value })}
                                  className="bg-transparent focus:outline-none w-20"
                                />
                                <span className="text-muted-foreground">({formatDurationShort(headDurationMins)})</span>
                              </>
                            )}
                          </div>

                          {/* Individual Cycle Time Input when in individual mode */}
                          {production.useIndividualCycleTimes && (
                            <div className="flex items-center gap-1 text-xs bg-primary/10 rounded px-2 py-0.5 border border-primary/20">
                              <span className="text-primary/70">CT:</span>
                              <input
                                type="number"
                                value={head.individualCycleTime || production.cycleTime}
                                onChange={(e) => updateHead(production.id, head.id, { 
                                  individualCycleTime: Math.max(1, parseInt(e.target.value) || production.cycleTime) 
                                })}
                                className="w-12 bg-transparent text-center focus:outline-none text-primary font-medium"
                                min="1"
                                title="Individual cycle time for this head"
                              />
                              <span className="text-primary/70">m</span>
                            </div>
                          )}

                          {headDowntimeMins > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                              DT: {formatDurationShort(headDowntimeMins)}
                            </span>
                          )}

                          <button
                            onClick={() => deleteHead(production.id, head.id)}
                            className="w-6 h-6 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Head Content */}
                        {head.expanded && (
                          <div className="pl-6 space-y-3">
                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => addSubHead(production.id, head.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                                  bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                                  shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40
                                  hover:scale-105 active:scale-95
                                  border border-emerald-400/30"
                              >
                                <Plus className="w-3 h-3" />
                                Add Sub Head
                              </button>

                              <button
                                onClick={() => addCutoffTimer(production.id, head.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                                  bg-gradient-to-r from-rose-500 to-pink-500 text-white
                                  shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40
                                  hover:scale-105 active:scale-95
                                  border border-rose-400/30"
                              >
                                <Scissors className="w-3 h-3" />
                                Add Cutoff Timer
                              </button>

                              <button
                                onClick={() => addDowntimeItem(production.id, head.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
                                  bg-gradient-to-r from-orange-500 to-amber-500 text-white
                                  shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40
                                  hover:scale-105 active:scale-95
                                  border border-orange-400/30"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Add Downtime
                              </button>
                            </div>

                            {/* Downtime Items - Now with range-based input */}
                            {head.downtimeItems.length > 0 && (
                              <div className="bg-amber-900/40 border border-amber-600/40 rounded-lg p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    Downtime Items
                                  </div>
                                  <span className="text-xs font-medium text-amber-300 bg-amber-800/50 px-2 py-0.5 rounded">
                                    Total: {formatDurationShort(headDowntimeMins)}
                                  </span>
                                </div>
                                {head.downtimeItems.map((item) => {
                                  const category = systemSettings.downtimeCategories.find(c => c.id === item.categoryId);
                                  const itemDuration = item.endMin - item.startMin;
                                  return (
                                    <div key={item.id} className="flex items-center gap-2 bg-amber-950/50 rounded-lg px-2 py-1.5">
                                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color || '#6b7280' }} />
                                      <select
                                        value={item.categoryId}
                                        onChange={(e) => updateDowntimeItem(production.id, head.id, item.id, { categoryId: e.target.value })}
                                        className="flex-1 bg-amber-800/60 border border-amber-600/30 rounded px-2 py-1 text-xs text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50 min-w-0"
                                      >
                                        {systemSettings.downtimeCategories.map(cat => (
                                          <option key={cat.id} value={cat.id} className="bg-amber-900 text-amber-100">
                                            {cat.name}
                                          </option>
                                        ))}
                                      </select>
                                      
                                      {/* Range-based input */}
                                      {mode === 'time' ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            value={item.startMin}
                                            onChange={(e) => updateDowntimeItem(production.id, head.id, item.id, { startMin: Math.max(0, parseInt(e.target.value) || 0) })}
                                            className="w-12 bg-amber-800/60 border border-amber-600/30 rounded px-1 py-1 text-center text-xs text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                            min="0"
                                            title="Start minute"
                                          />
                                          <span className="text-amber-400">→</span>
                                          <input
                                            type="number"
                                            value={item.endMin}
                                            onChange={(e) => updateDowntimeItem(production.id, head.id, item.id, { endMin: Math.max(item.startMin + 1, parseInt(e.target.value) || 1) })}
                                            className="w-12 bg-amber-800/60 border border-amber-600/30 rounded px-1 py-1 text-center text-xs text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                            min="1"
                                            title="End minute"
                                          />
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="time"
                                            value={item.startTime}
                                            onChange={(e) => updateDowntimeItem(production.id, head.id, item.id, { startTime: e.target.value })}
                                            className="w-20 bg-amber-800/60 border border-amber-600/30 rounded px-1 py-1 text-xs text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                          />
                                          <span className="text-amber-400">→</span>
                                          <input
                                            type="time"
                                            value={item.endTime}
                                            onChange={(e) => updateDowntimeItem(production.id, head.id, item.id, { endTime: e.target.value })}
                                            className="w-20 bg-amber-800/60 border border-amber-600/30 rounded px-1 py-1 text-xs text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                          />
                                        </div>
                                      )}
                                      
                                      <span className="text-xs text-amber-300 font-medium whitespace-nowrap">
                                        = {formatWithUnit(itemDuration)}
                                      </span>
                                      
                                      <button
                                        onClick={() => deleteDowntimeItem(production.id, head.id, item.id)}
                                        className="w-5 h-5 rounded-full bg-red-900/50 hover:bg-red-700/70 text-red-300 hover:text-red-100 flex items-center justify-center transition-colors flex-shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Sub Heads */}
                            {head.subHeads.filter(s => !s.isCutoff).map((sub) => (
                              <div key={sub.id} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => toggleSubExpand(production.id, head.id, sub.id)} className="text-emerald-400 hover:text-emerald-300">
                                    {sub.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>

                                  <input
                                    type="color"
                                    value={sub.color}
                                    onChange={(e) => updateSubHead(production.id, head.id, sub.id, { color: e.target.value })}
                                    className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent"
                                  />

                                  <input
                                    type="text"
                                    value={sub.name}
                                    onChange={(e) => updateSubHead(production.id, head.id, sub.id, { name: e.target.value })}
                                    className="flex-1 bg-transparent text-xs font-medium text-foreground border-none focus:outline-none"
                                    placeholder="Sub Name"
                                  />

                                  <button
                                    onClick={() => addInterval(production.id, head.id, sub.id)}
                                    className="text-emerald-400 hover:text-emerald-300"
                                    title="Add Interval"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => deleteSubHead(production.id, head.id, sub.id)}
                                    className="w-5 h-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {sub.expanded && (
                                  <div className="pl-4 space-y-1">
                                    {sub.intervals.map((interval) => (
                                      <div key={interval.id} className="flex items-center gap-2 text-xs">
                                        <input
                                          type="color"
                                          value={interval.color}
                                          onChange={(e) => updateInterval(production.id, head.id, sub.id, interval.id, { color: e.target.value })}
                                          className="w-3 h-3 rounded cursor-pointer border-0 bg-transparent"
                                        />
                                        {mode === 'time' ? (
                                          <>
                                            <input
                                              type="number"
                                              value={interval.startMin}
                                              onChange={(e) => updateInterval(production.id, head.id, sub.id, interval.id, { startMin: parseInt(e.target.value) || 0 })}
                                              className="w-14 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none"
                                              min="0"
                                            />
                                            <span className="text-muted-foreground">→</span>
                                            <input
                                              type="number"
                                              value={interval.endMin}
                                              onChange={(e) => updateInterval(production.id, head.id, sub.id, interval.id, { endMin: parseInt(e.target.value) || 0 })}
                                              className="w-14 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none"
                                              min="0"
                                            />
                                          </>
                                        ) : (
                                          <>
                                            <input
                                              type="time"
                                              value={interval.startTime}
                                              onChange={(e) => updateInterval(production.id, head.id, sub.id, interval.id, { startTime: e.target.value })}
                                              className="w-20 bg-muted rounded px-1 py-0.5 focus:outline-none"
                                            />
                                            <span className="text-muted-foreground">→</span>
                                            <input
                                              type="time"
                                              value={interval.endTime}
                                              onChange={(e) => updateInterval(production.id, head.id, sub.id, interval.id, { endTime: e.target.value })}
                                              className="w-20 bg-muted rounded px-1 py-0.5 focus:outline-none"
                                            />
                                          </>
                                        )}
                                        <span className="text-muted-foreground">
                                          ({formatDurationShort(getDurationMinutes(interval.startMin, interval.endMin))})
                                        </span>
                                        <button
                                          onClick={() => deleteInterval(production.id, head.id, sub.id, interval.id)}
                                          className="w-4 h-4 rounded hover:bg-destructive/20 hover:text-destructive flex items-center justify-center"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                    {sub.intervals.length === 0 && (
                                      <p className="text-[10px] text-muted-foreground italic">No intervals yet. Click + to add.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Cutoff Timers */}
                            {head.subHeads.filter(s => s.isCutoff).map((cutoff) => (
                              <div key={cutoff.id} className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => toggleSubExpand(production.id, head.id, cutoff.id)} className="text-rose-400 hover:text-rose-300">
                                    {cutoff.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>

                                  <Scissors className="w-3.5 h-3.5 text-rose-400" />

                                  <input
                                    type="text"
                                    value={cutoff.name}
                                    onChange={(e) => updateSubHead(production.id, head.id, cutoff.id, { name: e.target.value })}
                                    className="flex-1 bg-transparent text-xs font-medium text-rose-300 border-none focus:outline-none"
                                    placeholder="Cutoff Name"
                                  />

                                  <button
                                    onClick={() => addInterval(production.id, head.id, cutoff.id)}
                                    className="text-rose-400 hover:text-rose-300"
                                    title="Add Cutoff Interval"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => deleteSubHead(production.id, head.id, cutoff.id)}
                                    className="w-5 h-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {cutoff.expanded && (
                                  <div className="pl-4 space-y-1">
                                    {cutoff.intervals.map((interval) => (
                                      <div key={interval.id} className="flex items-center gap-2 text-xs">
                                        {mode === 'time' ? (
                                          <>
                                            <input
                                              type="number"
                                              value={interval.startMin}
                                              onChange={(e) => updateInterval(production.id, head.id, cutoff.id, interval.id, { startMin: parseInt(e.target.value) || 0 })}
                                              className="w-14 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none text-rose-300"
                                              min="0"
                                            />
                                            <span className="text-rose-400">→</span>
                                            <input
                                              type="number"
                                              value={interval.endMin}
                                              onChange={(e) => updateInterval(production.id, head.id, cutoff.id, interval.id, { endMin: parseInt(e.target.value) || 0 })}
                                              className="w-14 bg-muted rounded px-1.5 py-0.5 text-center focus:outline-none text-rose-300"
                                              min="0"
                                            />
                                          </>
                                        ) : (
                                          <>
                                            <input
                                              type="time"
                                              value={interval.startTime}
                                              onChange={(e) => updateInterval(production.id, head.id, cutoff.id, interval.id, { startTime: e.target.value })}
                                              className="w-20 bg-muted rounded px-1 py-0.5 focus:outline-none text-rose-300"
                                            />
                                            <span className="text-rose-400">→</span>
                                            <input
                                              type="time"
                                              value={interval.endTime}
                                              onChange={(e) => updateInterval(production.id, head.id, cutoff.id, interval.id, { endTime: e.target.value })}
                                              className="w-20 bg-muted rounded px-1 py-0.5 focus:outline-none text-rose-300"
                                            />
                                          </>
                                        )}
                                        <span className="text-rose-400">
                                          (-{formatDurationShort(getDurationMinutes(interval.startMin, interval.endMin))})
                                        </span>
                                        <button
                                          onClick={() => deleteInterval(production.id, head.id, cutoff.id, interval.id)}
                                          className="w-4 h-4 rounded hover:bg-destructive/20 hover:text-destructive flex items-center justify-center"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                    {cutoff.intervals.length === 0 && (
                                      <p className="text-[10px] text-rose-300/70 italic">No cutoff intervals yet. Click + to add.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visualization Section */}
      {showVisualization && hasData && (
        <VisualizationErrorBoundary title="Production visualization failed">
        <div ref={visualizationRef} className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Production Timeline Visualization
            </h4>
            <div className="flex items-center gap-4">
              {/* Global Downtime Graph Toggle */}
              <button
                onClick={() => setShowGlobalDowntimeGraph(!showGlobalDowntimeGraph)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                  showGlobalDowntimeGraph
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {showGlobalDowntimeGraph ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showGlobalDowntimeGraph ? 'Hide' : 'Show'} Downtime Graph
              </button>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showCutoffVisual}
                  onChange={(e) => setShowCutoffVisual(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Show Cutoff</span>
              </label>
            </div>
          </div>

          {/* Chart Type and Visibility Controls */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Analytics Charts</span>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(['pie', 'bar'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setAnalyticsChartType(type)}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${
                      analyticsChartType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type === 'pie' && <PieChartIcon className="w-3 h-3" />}
                    {type === 'bar' && <BarChart3 className="w-3 h-3" />}
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border text-xs font-medium ${showDowntimeOnlyChart ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'}`}>
                <input
                  type="checkbox"
                  checked={showDowntimeOnlyChart}
                  onChange={(e) => setShowDowntimeOnlyChart(e.target.checked)}
                  className="sr-only"
                />
                <PieChartIcon className="w-3.5 h-3.5" />
                Downtime Breakdown
              </label>
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border text-xs font-medium ${showBudgetChart ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'}`}>
                <input
                  type="checkbox"
                  checked={showBudgetChart}
                  onChange={(e) => setShowBudgetChart(e.target.checked)}
                  className="sr-only"
                />
                <AlertTriangle className="w-3.5 h-3.5" />
                Downtime vs Budget ({formatWithUnit(systemSettings.downtimeBudgetMins)})
              </label>
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border text-xs font-medium ${showCycleTimeChart ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'}`}>
                <input
                  type="checkbox"
                  checked={showCycleTimeChart}
                  onChange={(e) => setShowCycleTimeChart(e.target.checked)}
                  className="sr-only"
                />
                <Clock className="w-3.5 h-3.5" />
                Downtime vs Cycle Time
              </label>
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border text-xs font-medium ${showActualCycleChart ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'}`}>
                <input
                  type="checkbox"
                  checked={showActualCycleChart}
                  onChange={(e) => setShowActualCycleChart(e.target.checked)}
                  className="sr-only"
                />
                <Factory className="w-3.5 h-3.5" />
                Downtime vs Actual Cycle Time
              </label>
            </div>
          </div>

          {/* Productions Visualization */}
            {mainProductions.map((production) => {
              const { byCategory: downtimeByCategory, total: totalDowntimeMins } = getProductionDowntime(production);
              const heads = production.heads ?? [];
              const headsCount = Math.max(1, heads.length);
              
              // Calculate actual cycle time from heads
              // Calculate actual cycle time using NET durations (after cutoff for each head)
              const totalNetAcrossHeadsMins = heads.reduce((acc, head) => {
                const subHeads = head.subHeads ?? [];
                // Get raw head duration
                const rawHeadDuration = mode === 'oclock' 
                  ? timeToMinutes(head.endTime || '00:00') - timeToMinutes(head.startTime || '00:00')
                  : head.endMin - head.startMin;
                
                // Calculate total cutoff for this head
                const totalCutoffMins = subHeads
                  .filter(s => s.isCutoff)
                  .reduce((cAcc, cutoff) => {
                    const intervals = cutoff.intervals ?? [];
                    return cAcc + intervals.reduce((iAcc, interval) => {
                      return iAcc + (interval.endMin - interval.startMin);
                    }, 0);
                  }, 0);
                
                // Return net duration (raw - cutoff)
                const netHeadDuration = Math.max(0, rawHeadDuration - totalCutoffMins);
                return acc + netHeadDuration;
              }, 0);

            // Average actual net time per head (parallel heads)
            const actualNetTimeMins = totalNetAcrossHeadsMins / headsCount;

            // Raw actual time (includes cutoff)
              const totalRawAcrossHeadsMins = heads.reduce((acc, head) => {
                const rawHeadDuration = mode === 'oclock'
                  ? timeToMinutes(head.endTime || '00:00') - timeToMinutes(head.startTime || '00:00')
                  : head.endMin - head.startMin;
                return acc + Math.max(0, rawHeadDuration);
              }, 0);

            // Average actual raw time per head (parallel heads)
            const actualRawTimeMins = totalRawAcrossHeadsMins / headsCount;
            
            // Planned cycle time is the IDEAL per-cycle time (not multiplied by heads)
            // If using individual cycle times, use the average across heads.
            const plannedCycleTimeMins = production.useIndividualCycleTimes
              ? heads.reduce((acc, head) => acc + (head.individualCycleTime || production.cycleTime), 0) / headsCount
              : production.cycleTime;

            // Schedule-based planned time = average scheduled duration per head
            const plannedScheduleTimeMins = actualRawTimeMins;

            // Downtime for this panel should reflect total downtime (do not average per head)
            const downtimeMinsForPanel = totalDowntimeMins;
            
            const hasVisibleAnalyticsCharts = showBudgetChart || showCycleTimeChart || showActualCycleChart;
            const visibleAnalyticsCount = [showBudgetChart, showCycleTimeChart, showActualCycleChart].filter(Boolean).length;
            
            return (
              <div key={production.id} className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: production.color }} />
                  <h5 className="text-sm font-semibold text-foreground">{production.name}</h5>
                  <span className="text-xs text-muted-foreground">
                    Cycle (ideal): {formatWithUnit(plannedCycleTimeMins)} | Actual Net (avg/head): {formatWithUnit(actualNetTimeMins)}
                  </span>
                </div>

                {/* Downtime vs Budget Progress Chart (NEW unique visualization) */}
                {showDowntimeOnlyChart && (
                  <div className="max-w-lg">
                    <DowntimeBudgetProgressChart
                      downtimeByCategory={downtimeByCategory}
                      totalDowntimeMins={totalDowntimeMins}
                      budgetMins={systemSettings.downtimeBudgetMins}
                      timeUnit={visualSettings.timeUnit}
                    />
                  </div>
                )}

                {/* Analytics Charts Grid - Dynamic based on visibility */}
                {hasVisibleAnalyticsCharts && (
                  <div className={`grid gap-4 ${
                    visibleAnalyticsCount === 1 
                      ? 'grid-cols-1 max-w-md' 
                      : visibleAnalyticsCount === 2
                        ? 'grid-cols-1 md:grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-3'
                  }`}>
                    {/* Chart 1: Downtime vs Budget */}
                    {showBudgetChart && (
                      <AnalyticsChart
                        title="Downtime vs Budget"
                        baseDurationMins={systemSettings.downtimeBudgetMins}
                        downtimeByCategory={downtimeByCategory}
                        totalDowntimeMins={totalDowntimeMins}
                        budgetMins={systemSettings.downtimeBudgetMins}
                        chartType={analyticsChartType}
                        icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                        accentColor="#f59e0b"
                        remainingLabel={systemSettings.chartContextLabels.find(c => c.id === 'budget_remaining')?.name || 'Not Available'}
                        remainingColor={systemSettings.chartContextLabels.find(c => c.id === 'budget_remaining')?.color || '#374151'}
                        timeUnit={visualSettings.timeUnit}
                      />
                    )}

                    {/* Chart 2: Downtime vs Cycle Time */}
                    {showCycleTimeChart && (
                      <AnalyticsChart
                        title={production.useIndividualCycleTimes 
                          ? `Downtime vs Cycle Time (${formatWithUnit(plannedCycleTimeMins)} total)`
                          : `Downtime vs Cycle Time (${production.cycleTime}m � ${heads.length})`
                        }
                        baseDurationMins={plannedCycleTimeMins}
                        downtimeByCategory={downtimeByCategory}
                        totalDowntimeMins={totalDowntimeMins}
                        budgetMins={systemSettings.downtimeBudgetMins}
                        chartType={analyticsChartType}
                        icon={<Clock className="w-4 h-4 text-cyan-500" />}
                        accentColor="#06b6d4"
                        remainingLabel={systemSettings.chartContextLabels.find(c => c.id === 'cycle_remaining')?.name || 'Cycle Time'}
                        remainingColor={systemSettings.chartContextLabels.find(c => c.id === 'cycle_remaining')?.color || '#4b5563'}
                        timeUnit={visualSettings.timeUnit}
                      />
                    )}

                    {/* Chart 3: Downtime vs Actual Cycle Time (Net durations after cutoff) */}
                    {showActualCycleChart && actualNetTimeMins > 0 && (
                      <AnalyticsChart
                        title="Downtime vs Actual (Net)"
                        baseDurationMins={actualNetTimeMins}
                        downtimeByCategory={downtimeByCategory}
                        totalDowntimeMins={totalDowntimeMins}
                        budgetMins={systemSettings.downtimeBudgetMins}
                        chartType={analyticsChartType}
                        icon={<Factory className="w-4 h-4 text-emerald-500" />}
                        accentColor="#10b981"
                        remainingLabel={systemSettings.chartContextLabels.find(c => c.id === 'actual_remaining')?.name || 'Cycle Time'}
                        remainingColor={systemSettings.chartContextLabels.find(c => c.id === 'actual_remaining')?.color || '#6b7280'}
                        timeUnit={visualSettings.timeUnit}
                      />
                    )}
                  </div>
                )}

                {/* Productivity / Efficiency (new) */}
                <ProductionKpiPanel
                  config={production.kpi}
                  onChange={(updates) => updateMainProduction(production.id, { kpi: { ...production.kpi, ...updates } })}
                  headsCount={heads.length}
                  plannedCycleTimeMins={plannedCycleTimeMins}
                  plannedScheduleTimeMins={plannedScheduleTimeMins}
                  actualRawTimeMins={actualRawTimeMins}
                  actualNetTimeMins={actualNetTimeMins}
                  downtimeMins={downtimeMinsForPanel}
                  downtimeBudgetMins={systemSettings.downtimeBudgetMins}
                  timeUnit={visualSettings.timeUnit}
                />

                {/* Timeline Bars for each Head */}
                <div className="space-y-3">
                  {heads.map((head) => {
                    // Use individual cycle time if enabled, otherwise use global cycle time
                    const headCycleTime = production.useIndividualCycleTimes
                      ? (head.individualCycleTime || production.cycleTime)
                      : production.cycleTime;
                    
                    return (
                      <HeadTimelineVisualization
                        key={head.id}
                        head={head}
                        mode={mode}
                        showCutoff={showCutoffVisual}
                        visualSettings={visualSettings}
                        systemSettings={systemSettings}
                        showDowntimeGraph={showGlobalDowntimeGraph}
                        cycleTimeMins={headCycleTime}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        </VisualizationErrorBoundary>
      )}

      {/* Graph Settings Modal */}
      {showVisualSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="text-lg font-semibold text-foreground">Graph Settings</h3>
              <button
                onClick={() => setShowVisualSettings(false)}
                className="w-8 h-8 rounded-full bg-muted hover:bg-destructive hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Layout Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Layout</h4>
                <div className="grid grid-cols-2 gap-3">
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
                      max="8"
                      value={visualSettings.barGap}
                      onChange={e => setVisualSettings(s => ({ ...s, barGap: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.barGap}px</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Label Width</label>
                    <input
                      type="range"
                      min="40"
                      max="120"
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
                      min="30"
                      max="80"
                      value={visualSettings.valueWidth}
                      onChange={e => setVisualSettings(s => ({ ...s, valueWidth: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">{visualSettings.valueWidth}px</span>
                  </div>
                </div>
              </div>

              {/* Style Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Style</h4>
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
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualSettings.showGridLines}
                      onChange={e => setVisualSettings(s => ({ ...s, showGridLines: e.target.checked }))}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-muted-foreground">Show Grid</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualSettings.showShadow}
                      onChange={e => setVisualSettings(s => ({ ...s, showShadow: e.target.checked }))}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-muted-foreground">Show Shadow</span>
                  </label>
                </div>
              </div>

              {/* Time Unit Section */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Time Unit</h4>
                <div className="flex items-center gap-2">
                  {(['seconds', 'minutes', 'hours'] as const).map(unit => (
                    <button
                      key={unit}
                      onClick={() => setVisualSettings(s => ({ ...s, timeUnit: unit }))}
                      className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all border ${
                        visualSettings.timeUnit === unit
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                      }`}
                    >
                      {unit.charAt(0).toUpperCase() + unit.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset Button */}
              <button
                onClick={() => setVisualSettings(DEFAULT_VISUAL_SETTINGS)}
                className="w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Settings Modal */}
      {showSystemSettings && (
        <SystemSettingsModal
          settings={systemSettings}
          onSettingsChange={setSystemSettings}
          onClose={() => setShowSystemSettings(false)}
        />
      )}

      {/* Summary Report Modal */}
      {showSummaryReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal Header - Notepad Style */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 border-b border-amber-800">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-amber-100" />
                <h3 className="text-base font-semibold text-white tracking-tight">Production Summary Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copySummaryToClipboard}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedSummary 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {copiedSummary ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSummary ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowSummaryReport(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Notepad Content Area */}
            <div className="flex-1 overflow-auto bg-slate-950 p-1">
              <div 
                className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-lg border border-slate-800 h-full"
                style={{ 
                  backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, rgba(148, 163, 184, 0.1) 24px)',
                  backgroundSize: '100% 24px'
                }}
              >
                <pre 
                  className="p-4 text-xs leading-6 font-mono text-slate-300 whitespace-pre overflow-x-auto"
                  style={{ 
                    fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
                    tabSize: 2
                  }}
                >
                  {summaryReportText}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                {summaryReportText.split('\n').length} lines • {summaryReportText.length} characters
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copySummaryToClipboard}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowSummaryReport(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
