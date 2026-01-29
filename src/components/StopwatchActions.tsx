import { useState } from 'react';
import { Save, FileText, Copy, Check, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { HeadChannel } from '@/types';
import { buildStopwatchTimelineJson } from '@/lib/stopwatchTimelineJson';
import { getElapsedMs } from '@/lib/timeFormat';
import { saveTextFile, openTextFile } from '@/lib/textFile';

interface StopwatchActionsProps {
  headChannels: HeadChannel[];
  onImportChannels: (data: {
    name: string;
    totalMs: number;
    subChannels: {
      name: string;
      intervals: { startMs: number; endMs: number }[];
    }[];
  }[]) => void;
}

// Format duration in ms to readable string
function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// Format time to minutes or seconds
function formatTimeToMinOrSec(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function StopwatchActions({ headChannels, onImportChannels }: StopwatchActionsProps) {
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [copied, setCopied] = useState(false);

  const hasChannels = headChannels.length > 0;

  // Save JSON to TXT file
  const handleSaveJson = async () => {
    if (!hasChannels) {
      toast.error('No head channels to save');
      return;
    }

    try {
      const json = buildStopwatchTimelineJson(headChannels);
      const result = await saveTextFile(json, 'stopwatch-timeline.txt');
      if (result.ok) {
        toast.success('File saved');
      } else if (result.reason === 'unsupported') {
        toast.error('File save is not supported in this environment');
      } else if (result.reason === 'error') {
        toast.error('Failed to save file');
        console.error(result.error);
      }
    } catch {
      toast.error('Failed to save file');
    }
  };

  // Import JSON from TXT file (fallback to paste if unsupported)
  const handleImportJson = async () => {
    const fileResult = await openTextFile();
    let input: string | null = null;

    if (fileResult.ok) {
      input = fileResult.text;
    } else if (fileResult.reason === 'unsupported') {
      input = window.prompt(
        'Paste JSON data:\n\nFormat: [{"n":"Head 1","t":60,"s":[{"n":"Sub 1","c":0,"i":[[0,5]]}]}]'
      );
    } else if (fileResult.reason === 'error') {
      toast.error('Failed to open file');
      console.error(fileResult.error);
      return;
    } else {
      return;
    }

    if (input === null) {
      return; // User cancelled
    }

    if (!input.trim()) {
      toast.error('No data entered');
      return;
    }

    try {
      const data = JSON.parse(input.trim());
      
      if (!Array.isArray(data)) {
        toast.error('Invalid JSON format - must be an array');
        return;
      }

      // Parse the compact format: [{"n":"Head 1","t":60,"s":[{"n":"Sub 1","c":0,"i":[[0,5]]}]}]
      // Values are in minutes
      const parsed = data.map((head: { n?: string; t?: number; s?: { n?: string; c?: number; i?: number[][] }[] }) => ({
        name: head.n || 'Head',
        totalMs: (head.t || 0) * 60 * 1000, // t is in minutes -> ms
        subChannels: (head.s || []).map((sub: { n?: string; c?: number; i?: number[][] }) => ({
          name: sub.n || 'Sub',
          intervals: (sub.i || []).map((interval: number[]) => ({
            startMs: (interval[0] || 0) * 60 * 1000, // minutes -> ms
            endMs: (interval[1] || 0) * 60 * 1000,   // minutes -> ms
          })),
        })),
      }));

      onImportChannels(parsed);
      toast.success(`Imported ${parsed.length} head channel(s)!`);
    } catch {
      toast.error('Invalid JSON format');
    }
  };

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

  // Get intervals from sub channel marks
  const getIntervalsFromMarks = (marks: { action: string; headTimeMs: number }[], currentElapsed: number): { start: number; end: number }[] => {
    const intervals: { start: number; end: number }[] = [];
    let lastStart: number | null = null;
    
    for (const mark of marks) {
      if (mark.action === 'start') {
        lastStart = mark.headTimeMs;
      } else if (mark.action === 'pause' && lastStart !== null) {
        intervals.push({ start: lastStart, end: mark.headTimeMs });
        lastStart = null;
      }
    }
    
    // If still running, close the interval at current elapsed time
    if (lastStart !== null) {
      intervals.push({ start: lastStart, end: currentElapsed });
    }
    
    return intervals;
  };

  // Generate Summary Text
  const generateSummaryText = () => {
    if (!hasChannels) return;

    let text = '';
    const W = 78;

    const center = (str: string, width: number) => {
      const pad = Math.max(0, width - str.length);
      const left = Math.floor(pad / 2);
      return ' '.repeat(left) + str + ' '.repeat(pad - left);
    };

    const fullWidthBorder = '+' + '-'.repeat(W) + '+\n';
    const fullWidthRow = (content: string) => '| ' + content.padEnd(W - 2) + ' |\n';

    // Header
    text += '+' + '='.repeat(W) + '+\n';
    text += '|' + center('STOPWATCH SUMMARY REPORT', W) + '|\n';
    text += '|' + center(`Generated: ${new Date().toLocaleString()}`, W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n\n';

    headChannels.forEach((head, headIdx) => {
      const headElapsedMs = getElapsedMs(head);

      text += fullWidthBorder;
      text += fullWidthRow(`HEAD ${headIdx + 1}: ${head.name}`);
      text += fullWidthRow(`Duration: ${formatDuration(headElapsedMs)} (${formatTimeToMinOrSec(headElapsedMs)})`);
      text += fullWidthBorder + '\n';

      // Sub channels table
      const subs = head.subChannels;
      if (subs.length > 0) {
        // Pre-calculate data for dynamic column widths
        const subDataRows: { name: string; cnt: string; raw: string; actual: string; startEnd: string }[] = [];
        
        // Collect all intervals from all subs for actual calculation
        const allSubIntervals: { start: number; end: number }[] = [];
        
        subs.forEach(sub => {
          const subElapsedMs = getElapsedMs(sub);
          const marks = sub.marks;
          const intervals = getIntervalsFromMarks(marks, headElapsedMs);
          allSubIntervals.push(...intervals);
          
          const firstMark = marks[0];
          const lastMark = marks[marks.length - 1];

          // Format start-end in minutes/seconds
          let startEndStr = '-';
          if (firstMark && lastMark) {
            const startTime = formatTimeToMinOrSec(firstMark.headTimeMs);
            const endTime = formatTimeToMinOrSec(lastMark.headTimeMs);
            startEndStr = `${startTime} - ${endTime}`;
          }

          subDataRows.push({
            name: sub.name,
            cnt: String(marks.filter(m => m.action === 'start').length),
            raw: formatDuration(subElapsedMs),
            actual: '', // Will calculate per-sub actual later
            startEnd: startEndStr
          });
        });

        // Calculate total raw (sum of all)
        const totalRawMs = subs.reduce((acc, sub) => acc + getElapsedMs(sub), 0);
        
        // Calculate total actual (merged intervals)
        const mergedIntervals = mergeIntervals(allSubIntervals);
        const totalActualMs = mergedIntervals.reduce((acc, int) => acc + (int.end - int.start), 0);

        // Calculate dynamic column widths
        const headers = ['Name', 'Count', 'Raw', 'Actual', 'Start-End'];
        const totalRow = ['TOTAL', '', formatDuration(totalRawMs), formatDuration(totalActualMs), ''];
        
        const colW = headers.map((h, i) => {
          let maxLen = h.length;
          subDataRows.forEach(row => {
            const vals = [row.name, row.cnt, row.raw, row.raw, row.startEnd]; // Use raw for actual width too
            maxLen = Math.max(maxLen, vals[i].length);
          });
          maxLen = Math.max(maxLen, totalRow[i].length);
          if (i === 0) maxLen = Math.max(maxLen, 12); // Name min
          if (i === 1) maxLen = Math.max(maxLen, 5);  // Count min
          return maxLen;
        });

        const divider = (widths: number[], char = '-') => {
          return '+' + widths.map(w => char.repeat(w + 2)).join('+') + '+\n';
        };

        const row = (cols: string[], widths: number[]) => {
          return '| ' + cols.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |\n';
        };

        text += 'SUB CHANNELS\n';
        text += divider(colW);
        text += row(headers, colW);
        text += divider(colW);

        subs.forEach((sub, idx) => {
          const data = subDataRows[idx];
          // For individual sub, raw = actual (no parallel within same sub)
          text += row([data.name, data.cnt, data.raw, data.raw, data.startEnd], colW);
        });

        text += divider(colW);
        text += row(totalRow, colW);
        text += divider(colW, '=');
        
        // Add note about Raw vs Actual
        if (totalRawMs !== totalActualMs) {
          const overlapMs = totalRawMs - totalActualMs;
          text += `Note: Raw = sum of all, Actual = merged (overlap: ${formatDuration(overlapMs)})\n`;
        }
      }

      text += '\n';
    });

    // Grand Total
    const grandTotalMs = headChannels.reduce((acc, head) => acc + getElapsedMs(head), 0);
    text += '+' + '='.repeat(W) + '+\n';
    text += '|' + center(`GRAND TOTAL: ${formatDuration(grandTotalMs)}`, W) + '|\n';
    text += '+' + '='.repeat(W) + '+\n';

    setSummaryText(text);
    setShowSummaryModal(true);
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      toast.success('Summary copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy summary');
    }
  };

  return (
    <>
      {/* Stopwatch Sub-Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2">
      {/* Save TXT */}
        <button
          className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveJson}
          disabled={!hasChannels}
          title="Save TXT file"
        >
          <Save className="w-4 h-4" />
          Save TXT
        </button>

      {/* Import TXT */}
        <button
          className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] bg-blue-500 text-white hover:bg-blue-600"
          onClick={handleImportJson}
          title="Import TXT file"
        >
          <Upload className="w-4 h-4" />
          Import TXT
        </button>

        {/* Export Summary */}
        <button
          className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={generateSummaryText}
          disabled={!hasChannels}
          title="Export summary report"
        >
          <FileText className="w-4 h-4" />
          Export Summary
        </button>
      </div>

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card rounded-xl shadow-2xl border border-border max-w-3xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Stopwatch Summary</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySummary}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono text-foreground whitespace-pre overflow-x-auto bg-muted/50 p-4 rounded-lg">
                {summaryText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
