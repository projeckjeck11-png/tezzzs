import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CursorTooltip } from "@/components/CursorTooltip";
import { FullscreenChart } from "@/components/FullscreenChart";
import { z } from "zod";

type TargetBasis = "shift" | "cycle" | "hour";
type ActualBasis = "net" | "raw";
type TimeContext = "production" | "production_plus_downtime";

type TimeUnit = "minutes" | "hours" | "seconds";

export type ProductionKpiConfig = {
  /** Minutes required to produce the given unitsPerCycle (default 210) */
  cycleTimePerUnit?: number;
  /** Units produced per cycle (default 1) */
  unitsPerCycle?: number;
  /** Enable manual target output entry (default off -> auto) */
  targetEnabled?: boolean;
  /** Manual target output when targetEnabled = true */
  manualTargetOutput?: number;
  targetBasis: TargetBasis;
  /** Only used when targetBasis === "shift". If missing, per-shift target cannot be computed. */
  shiftMinutes?: number;
  /** Which actual duration to use for KPI math. */
  actualBasis?: ActualBasis;
  /** Whether KPI time uses production time only or production + downtime. */
  timeContext?: TimeContext;
  /** Ideal output per cycle for Performance/Quality calculations */
  idealOutputPerCycle?: number;
  /** Good/accepted output count for Quality calculation */
  goodOutput?: number;
};

type Props = {
  config: ProductionKpiConfig;
  onChange: (updates: Partial<ProductionKpiConfig>) => void;
  headsCount: number;
  plannedCycleTimeMins: number;
  plannedScheduleTimeMins: number;
  actualRawTimeMins: number;
  actualNetTimeMins: number;
  downtimeMins: number;
  downtimeBudgetMins: number;
  timeUnit: TimeUnit;
};

function clampNumber(n: number) {
  if (!Number.isFinite(n)) return 0;
  return n;
}

function safeDiv(a: number, b: number) {
  if (!b || !Number.isFinite(b)) return 0;
  return a / b;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function explainProductivityStatus(ratio: number) {
  if (!Number.isFinite(ratio)) return { status: "unknown", text: "Data tidak tersedia", color: "text-muted-foreground" };
  if (ratio === 0) return { status: "no-data", text: "Belum ada output atau target", color: "text-muted-foreground" };
  if (ratio >= 1.2) return { status: "excellent", text: "Sangat Produktif", color: "text-green-600" };
  if (ratio >= 1.0) return { status: "good", text: "Produktif", color: "text-green-500" };
  if (ratio >= 0.8) return { status: "fair", text: "Cukup Produktif", color: "text-amber-500" };
  if (ratio >= 0.5) return { status: "poor", text: "Kurang Produktif", color: "text-orange-500" };
  return { status: "critical", text: "Kritis - Perlu Perbaikan", color: "text-red-600" };
}

function explainEfficiencyStatus(ratio: number) {
  if (!Number.isFinite(ratio)) return { status: "unknown", text: "Data tidak tersedia", color: "text-muted-foreground" };
  if (ratio >= 0.95) return { status: "excellent", text: "Sangat Efisien", color: "text-green-600" };
  if (ratio >= 0.85) return { status: "good", text: "Efisien", color: "text-green-500" };
  if (ratio >= 0.7) return { status: "fair", text: "Cukup Efisien", color: "text-amber-500" };
  if (ratio >= 0.5) return { status: "poor", text: "Kurang Efisien", color: "text-orange-500" };
  return { status: "critical", text: "Tidak Efisien", color: "text-red-600" };
}

function basisLabel(basis: TargetBasis) {
  if (basis === "hour") return "per hour";
  if (basis === "shift") return "per shift";
  return "per cycle";
}

export function ProductionKpiPanel({
  config,
  onChange,
  headsCount,
  plannedCycleTimeMins,
  plannedScheduleTimeMins,
  actualRawTimeMins,
  actualNetTimeMins,
  downtimeMins,
  downtimeBudgetMins,
  timeUnit,
}: Props) {
  const cycleTimePerUnit = clampNumber(config.cycleTimePerUnit ?? plannedCycleTimeMins ?? 210);
  const unitsPerCycle = clampNumber(config.unitsPerCycle ?? 1) || 1;
  const targetEnabled = config.targetEnabled ?? false;
  const manualTargetOutput = clampNumber(config.manualTargetOutput ?? 0);
  const idealOutputPerCycle = clampNumber(config.idealOutputPerCycle ?? unitsPerCycle);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftMinutesDraft, setShiftMinutesDraft] = useState<string>("");
  const prevBasisRef = useRef<TargetBasis>(config.targetBasis);
  const shiftSavedRef = useRef(false);

  const shiftMinutesSchema = useMemo(
    () =>
      z
        .string()
        .trim()
        .min(1, "Shift duration is required")
        .refine((v) => Number.isFinite(Number(v)), "Must be a number")
        .transform((v) => Number(v))
        .refine((n) => n > 0, "Must be > 0")
        .refine((n) => n <= 1440, "Max 1440 minutes (24 hours)"),
    [],
  );

  const actualBasis: ActualBasis = config.actualBasis ?? "net";
  const timeContext: TimeContext = config.timeContext ?? "production";

  // PLANNED TIME: use scheduled duration (average per head)
  const plannedTimeMins = plannedScheduleTimeMins;
  const actualTimeMins = actualBasis === "raw" ? actualRawTimeMins : actualNetTimeMins;

  const downtimeBudgetCap = clampNumber(downtimeBudgetMins);
  const downtimeMinsCapped = Math.max(
    0,
    Math.min(downtimeMins, downtimeBudgetCap > 0 ? downtimeBudgetCap : downtimeMins),
  );
  const actualTimeForKpiMins = timeContext === "production_plus_downtime"
    ? actualTimeMins + downtimeMinsCapped
    : actualTimeMins;
  const actualHoursForKpi = actualTimeForKpiMins / 60;
  const plannedWindowMins = plannedTimeMins + downtimeBudgetCap;
  const completedCycles = safeDiv(actualTimeMins, cycleTimePerUnit);
  const completedCyclesForKpi = safeDiv(actualTimeForKpiMins, cycleTimePerUnit);
  const actualOutput = completedCyclesForKpi * unitsPerCycle;
  const targetOutputFromPlan = safeDiv(plannedTimeMins, cycleTimePerUnit) * unitsPerCycle;
  const perHeadOutput = headsCount > 0 ? actualOutput / headsCount : 0;
  const perCycleOutput = completedCyclesForKpi > 0 ? actualOutput / completedCyclesForKpi : 0;
  const goodOutput = clampNumber(config.goodOutput ?? actualOutput);

  const shiftMinutes = clampNumber(config.shiftMinutes ?? 0);
  const completedShifts = shiftMinutes > 0 ? safeDiv(actualTimeForKpiMins, shiftMinutes) : 0;

  // CORE CALCULATION: Computed Target
  // This is the expected output based on how much time has passed
  const computedTargetOutput = targetEnabled ? manualTargetOutput : targetOutputFromPlan;
  const targetValue = computedTargetOutput;

  // PRODUCTIVITY: Actual vs Target (simple ratio)
  // Context: If Target = 2 and Actual = 2, productivity = 100%
  const productivityRatio = safeDiv(actualOutput, computedTargetOutput);
  const productivityPerHour = safeDiv(actualOutput, actualHoursForKpi);
  const productivityPerCycle = safeDiv(actualOutput, completedCyclesForKpi);

  // =========================================
  // EFFICIENCY METRICS (Industry Standard)
  // =========================================

  // 1. AVAILABILITY (Uptime Rate)
  // Planned Production Time includes the configured downtime budget.
  const [oeeView, setOeeView] = useState<"cycle" | "target">("cycle");

  // Base durations: cycle vs target/schedule
  // Cycle baseline = ideal time for exactly 1 cycle (already includes unitsPerCycle)
  const plannedBaseMins = cycleTimePerUnit;
  const plannedWindowMinsBase = plannedBaseMins + downtimeBudgetCap;

  const plannedForView = oeeView === "cycle" ? plannedBaseMins : plannedTimeMins;
  const plannedWindowMinsView = oeeView === "cycle" ? plannedWindowMinsBase : plannedTimeMins + downtimeBudgetCap;

  const downtimePctBase = safeDiv(downtimeMinsCapped, plannedWindowMinsBase);
  const downtimePctTarget = safeDiv(downtimeMinsCapped, plannedTimeMins + downtimeBudgetCap);
  const availabilityBase = plannedWindowMinsBase > 0
    ? Math.max(0, plannedWindowMinsBase - downtimeMinsCapped) / plannedWindowMinsBase
    : 0;

  const netRunningMins = Math.max(0, actualTimeMins);
  const performanceTimeMins = timeContext === "production_plus_downtime"
    ? actualTimeForKpiMins
    : netRunningMins;
  const performanceCycles = safeDiv(performanceTimeMins, plannedCycleTimeMins);

  // 2. UTILIZATION (Capacity Usage)
  // = Actual Running Time / (Planned Time + Actual Downtime)
  // Capped at 100% - if you run longer than planned, utilization is 100%
  // This measures how much of the planned capacity was used
  const utilizationRaw = safeDiv(netRunningMins, plannedForView + downtimeMinsCapped);
  const utilization = Math.min(utilizationRaw, 1); // Cap at 100%

  // 3. TIME EFFICIENCY (Speed)
  // = Planned Time / Actual Time
  // >100% = faster than planned, <100% = slower than planned
  const timeEfficiency = safeDiv(plannedForView, actualTimeForKpiMins);

  // 4. PERFORMANCE RATE (OEE Component)
  // = (Actual Output × Ideal Cycle Time) / Operating Time
  // Measures actual output vs theoretical max output
  const theoreticalOutputAtSpeed = performanceTimeMins > 0 && idealOutputPerCycle > 0
    ? (performanceTimeMins / plannedCycleTimeMins) * idealOutputPerCycle
    : 0;
  const performanceRate = theoreticalOutputAtSpeed > 0
    ? Math.min(safeDiv(actualOutput, theoreticalOutputAtSpeed), 1.5) // Cap at 150% to avoid crazy numbers
    : safeDiv(actualOutput, performanceCycles > 0 ? performanceCycles * (idealOutputPerCycle || 1) : 1);

  // 5. QUALITY RATE
  // = Good Output / Total Output
  const qualityRate = actualOutput > 0 ? safeDiv(goodOutput, actualOutput) : 1;

  // 6. OEE (Overall Equipment Effectiveness)
  // = Availability × Performance × Quality
  const availabilityTarget = plannedWindowMins > 0
    ? Math.max(0, plannedWindowMins - downtimeMinsCapped) / plannedWindowMins
    : availabilityBase;

  // 7. TAKT TIME ADHERENCE
  // Takt Time = Planned Time / Required Output
  // Actual Cycle Time = Actual Production Time / Actual Output
  const taktTime = computedTargetOutput > 0 ? safeDiv(plannedTimeMins, computedTargetOutput) : 0;
  const actualCycleTime = actualOutput > 0 ? safeDiv(actualTimeForKpiMins, actualOutput) : 0;
  const taktAdherenceRaw = taktTime > 0 ? safeDiv(taktTime, actualCycleTime) : 0;
  const taktAdherence = Math.min(taktAdherenceRaw, 1);

  // =========================================
  // Dual OEE Baseline (Cycle vs Target)
  // =========================================
  // Base Cycle: gunakan cycleTimePerUnit & unitsPerCycle sebagai ideal output acuan.
  // OEE di sini merefleksikan seberapa baik waktu tersedia dimanfaatkan (Availability * Quality),
  // dengan asumsi performance ideal (1) saat mengikuti cycle ideal.
  const oeeCycleBase = availabilityBase * qualityRate;

  // Base Target Output: gunakan target (manual/auto) sebagai output yang harus dicapai.
  // Performance_target dihitung dari waktu yang diperlukan untuk memenuhi target vs waktu aktual KPI.
  // Performance vs target output (output-based, capped 100%)
  const performanceTargetBase = computedTargetOutput > 0
    ? Math.min(safeDiv(actualOutput, computedTargetOutput), 1)
    : 0;
  const oeeTargetBase = availabilityTarget * performanceTargetBase * qualityRate;

  const primaryOee = oeeView === "cycle" ? oeeCycleBase : oeeTargetBase;
  const primaryLabel = oeeView === "cycle" ? "OEE (Cycle Base)" : "OEE (Target Base)";
  const performanceDisplay = oeeView === "cycle" ? 1 : performanceTargetBase;
  const availabilityDisplay = oeeView === "cycle" ? availabilityBase : availabilityTarget;
  const downtimePctDisplay = oeeView === "cycle" ? downtimePctBase : downtimePctTarget;
  const plannedDisplay = plannedForView;
  const plannedWindowDisplay = plannedWindowMinsView;
  const operatingWindowDisplay = Math.max(0, plannedWindowDisplay - downtimeMinsCapped);
  const plannedLabel = oeeView === "cycle"
    ? `Cycle base • ${cycleTimePerUnit}m / ${unitsPerCycle} unit`
    : "Schedule-based";

  const oeeStatus = (val: number) => {
    if (!Number.isFinite(val)) return { text: "N/A", cls: "text-muted-foreground" };
    if (val >= 0.85) return { text: "World Class", cls: "text-green-600" };
    if (val >= 0.65) return { text: "Typical", cls: "text-amber-600" };
    return { text: "Needs Improvement", cls: "text-red-600" };
  };

  // Gap calculation
  const outputGap = actualOutput - computedTargetOutput;
  const gapPercentage = computedTargetOutput > 0 ? (outputGap / computedTargetOutput) * 100 : 0;

  // Status evaluations
  const productivityStatus = explainProductivityStatus(productivityRatio);
  const availability = availabilityDisplay;
  const efficiencyStatus = explainEfficiencyStatus(availability);

  const chartData = [
    { name: "Actual", value: actualOutput },
    { name: "Target", value: computedTargetOutput },
  ];

  const formatTime = (mins: number) => {
    switch (timeUnit) {
      case "seconds":
        return `${Math.round(mins * 60)}s`;
      case "hours":
        return `${(mins / 60).toFixed(2)}h`;
      default:
        return `${Math.round(mins)}m`;
    }
  };

  // Get planned basis label based on target basis (auto-synced)
  const getPlannedBasisLabel = () => {
    return "schedule-based";
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 space-y-3">
      {/* HEADER: Context Summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-foreground">Productivity & Efficiency</div>
          <div className="text-[10px] text-muted-foreground">
            Planned: {formatTime(plannedTimeMins)} ({getPlannedBasisLabel()}) • Actual ({actualBasis}): {formatTime(actualTimeMins)} • KPI Time: {formatTime(actualTimeForKpiMins)} • Downtime: {formatTime(downtimeMinsCapped)}
          </div>
        </div>
      </div>

      {/* Cycle Time / Unit Settings */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-semibold text-primary">Cycle Time / Unit</div>
          <div className="text-[11px] text-muted-foreground">Default 210 menit / 1 unit (bisa diubah)</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Cycle time (menit per {unitsPerCycle} unit)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={cycleTimePerUnit}
              onChange={(e) => onChange({ cycleTimePerUnit: Number(e.target.value) || 1 })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Units per cycle</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={unitsPerCycle}
              onChange={(e) => onChange({ unitsPerCycle: Number(e.target.value) || 1 })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* OUTPUT SETUP SECTION - Clear Context */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-xs font-semibold text-primary">📊 Setup Output</div>
          <CursorTooltip
            content={
              <div className="max-w-[340px] whitespace-normal">
                <div className="font-medium text-primary">Apa itu Setup Output?</div>
                <div className="text-muted-foreground mt-1">
                  Bagian ini untuk memasukkan data produksi yang akan dianalisis.
                </div>
                <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                  <div className="font-medium">Konteks Sederhana:</div>
                  <div className="mt-1">
                    <span className="font-bold">Target</span> = Berapa unit yang SEHARUSNYA diproduksi<br/>
                    <span className="font-bold">Actual</span> = Berapa unit yang SUDAH diproduksi
                  </div>
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <div className="font-medium">Contoh:</div>
                    <div>• Target = 2 unit/jam, Actual = 2 unit → Tepat target (100%)</div>
                    <div>• Target = 2 unit/jam, Actual = 3 unit → Melebihi target (150%)</div>
                    <div>• Target = 2 unit/jam, Actual = 1 unit → Di bawah target (50%)</div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="font-medium">Kesimpulan</div>
                  <div className="text-muted-foreground">
                    Isi kedua nilai ini untuk mendapatkan analisis produktivitas yang akurat.
                  </div>
                </div>
              </div>
            }
          >
            <span className="text-[9px] text-muted-foreground/70 cursor-help">ⓘ</span>
          </CursorTooltip>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ACTUAL OUTPUT INPUT */}
          <div className="space-y-2">
            <CursorTooltip
              content={
                <div className="max-w-[320px] whitespace-normal">
                  <div className="font-medium text-green-600">Actual Output (Output Aktual)</div>
                  <div className="text-muted-foreground mt-1">
                    Jumlah unit yang SUDAH diproduksi dalam periode waktu yang berjalan.
                  </div>
                  <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Nilai saat ini: {actualOutput} unit</div>
                    <div className="mt-2">
                      <div className="font-medium">Interpretasi:</div>
                      {actualOutput === 0 ? (
                        <div className="text-amber-500">⚠️ Output = 0. Belum ada produksi tercatat.</div>
                      ) : (
                        <div className="text-green-600">✓ {actualOutput} unit sudah diproduksi dari {headsCount} head selama {formatTime(actualTimeForKpiMins)} ({timeContext === "production_plus_downtime" ? "incl. downtime" : "production only"}).</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-medium">Contoh Penggunaan:</div>
                    <div className="text-muted-foreground text-[10px]">
                      • Jika produksi 2 unit → masukkan 2<br/>
                      • Jika produksi 100 unit → masukkan 100
                    </div>
                  </div>
                </div>
              }
            >
              <label className="text-[10px] font-medium text-green-600 cursor-help flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Actual Output (sudah diproduksi)
              </label>
            </CursorTooltip>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.01}
                value={Number(actualOutput.toFixed(2))}
                readOnly
                disabled
                className="w-full rounded-md border-2 border-green-500/50 bg-green-50/30 dark:bg-green-950/20 px-3 py-2 text-sm font-semibold text-foreground focus:border-green-500 focus:ring-green-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">unit</span>
            </div>
          </div>

          {/* TARGET INPUT */}
          <div className="space-y-2">
            <CursorTooltip
              content={
                <div className="max-w-[340px] whitespace-normal">
                  <div className="font-medium text-blue-600">Target Output</div>
                  <div className="text-muted-foreground mt-1">
                    Default OFF: otomatis dari planned ÷ cycle time. ON: isi manual (boleh desimal).
                  </div>
                  <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Target saat ini:</div>
                    <div className="text-blue-600 font-bold text-lg">{computedTargetOutput.toFixed(2)} unit</div>
                    <div className="text-muted-foreground mt-1">
                      {targetEnabled ? "Manual" : "Otomatis"}
                    </div>
                  </div>
                </div>
              }
            >
              <label className="text-[10px] font-medium text-blue-600 cursor-help flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Target Output
              </label>
            </CursorTooltip>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={targetEnabled}
                  onChange={(e) => onChange({ targetEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-border bg-background"
                />
                Manual target
              </label>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={targetEnabled ? manualTargetOutput : computedTargetOutput}
                  onChange={(e) => onChange({ manualTargetOutput: Number(e.target.value) || 0, targetEnabled: true })}
                  disabled={!targetEnabled}
                  className="w-full rounded-md border-2 px-3 py-2 text-sm font-semibold text-foreground focus:ring-blue-500 border-blue-500/50 bg-blue-50/30 dark:bg-blue-950/20 focus:border-blue-500 disabled:border-border disabled:bg-muted/40 disabled:text-muted-foreground disabled:cursor-not-allowed"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">unit</span>
              </div>
            </div>
            {/* Shift Duration Edit Button removed (auto mode) */}
          </div>
        </div>

        {/* Quick Summary */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <CursorTooltip
            content={
              <div className="max-w-[340px] whitespace-normal">
                <div className="font-medium text-primary">Rumus Productivity</div>
                <div className="text-muted-foreground mt-1">
                  Productivity = Actual Output ÷ Computed Target
                </div>
                <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                  <div className="font-medium">Actual Output:</div>
                  <div className="font-mono">Input</div>
                  <div className="mt-1">{actualOutput} unit</div>
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <div className="font-medium">Computed Target:</div>
                  {config.targetBasis === "hour" && (
                    <>
                      <div className="font-mono">Hours = KPI Time (mins) ÷ 60</div>
                      <div className="mt-1">
                        {actualTimeForKpiMins.toFixed(0)} ÷ 60 = {actualHoursForKpi.toFixed(2)} hours
                      </div>
                      <div className="mt-1">
                        Target = {targetValue} × {actualHoursForKpi.toFixed(2)} ={" "}
                        <span className="font-bold text-blue-600">{computedTargetOutput.toFixed(2)} unit</span>
                      </div>
                    </>
                  )}
                  {config.targetBasis === "shift" && (
                    <>
                      <div className="font-mono">Shifts = KPI Time (mins) ÷ Shift Duration (mins)</div>
                      <div className="mt-1">
                        {actualTimeForKpiMins.toFixed(0)} ÷ {shiftMinutes > 0 ? shiftMinutes.toFixed(0) : "n/a"} = {completedShifts.toFixed(2)} shift
                      </div>
                      <div className="mt-1">
                        Target = {targetValue} × {completedShifts.toFixed(2)} ={" "}
                        <span className="font-bold text-blue-600">{computedTargetOutput.toFixed(2)} unit</span>
                      </div>
                    </>
                  )}
                  {config.targetBasis === "cycle" && (
                    <>
                      <div className="font-mono">Cycles = KPI Time (mins) ÷ Planned Cycle (mins)</div>
                      <div className="mt-1">
                        {actualTimeForKpiMins.toFixed(0)} ÷ {plannedCycleTimeMins.toFixed(0)} = {completedCyclesForKpi.toFixed(2)} cycle
                      </div>
                      <div className="mt-1">
                        Target = {targetValue} × {completedCyclesForKpi.toFixed(2)} ={" "}
                        <span className="font-bold text-blue-600">{computedTargetOutput.toFixed(2)} unit</span>
                      </div>
                    </>
                  )}
                  </div>
                  <div className="mt-2 border-t border-border/50 pt-2">
                    <div className="font-medium">Productivity:</div>
                    <div>
                      {actualOutput} ÷ {computedTargetOutput.toFixed(2)} ={" "}
                      <span className={`font-bold ${productivityStatus.color}`}>{pct(productivityRatio)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  KPI Time: {formatTime(actualTimeForKpiMins)} ({timeContext === "production_plus_downtime" ? "production + downtime" : "production only"})
                </div>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-4 text-xs cursor-help">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Actual:</span>
                <span className="font-bold text-green-600">{actualOutput} unit</span>
              </div>
              <div className="text-muted-foreground">vs</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Target:</span>
                <span className="font-bold text-blue-600">{computedTargetOutput.toFixed(2)} unit</span>
              </div>
              <div className="text-muted-foreground">=</div>
              <div className={`font-bold ${productivityStatus.color}`}>
                {pct(productivityRatio)} {productivityStatus.text}
              </div>
            </div>
          </CursorTooltip>
        </div>
      </div>

      {/* ADVANCED SETTINGS - Simplified (removed Planned dropdown) */}
      <div className="flex flex-wrap items-center gap-3 text-[10px]">
        <span className="text-muted-foreground">Advanced:</span>
        
        <CursorTooltip
          content={
            <div className="max-w-[320px] whitespace-normal">
              <div className="font-medium text-primary">Planned Time (Auto-Synced)</div>
              <div className="text-muted-foreground mt-1">
                Waktu acuan otomatis menyesuaikan dengan basis target yang dipilih.
              </div>
              <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                <div><span className="font-bold">Current:</span> {getPlannedBasisLabel()} = {formatTime(plannedTimeMins)}</div>
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div><span className="font-bold">Per Hour/Shift:</span> Schedule-based ({formatTime(plannedScheduleTimeMins)})</div>
                  <div><span className="font-bold">Per Cycle:</span> Cycle-based ({formatTime(plannedCycleTimeMins)})</div>
                </div>
              </div>
            </div>
          }
        >
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50">
            <span className="text-muted-foreground">Planned:</span>
            <span className="font-medium">{formatTime(plannedTimeMins)}</span>
            <span className="text-muted-foreground/70">({getPlannedBasisLabel()})</span>
          </div>
        </CursorTooltip>

        <CursorTooltip
          content={
            <div className="max-w-[320px] whitespace-normal">
              <div className="font-medium text-primary">Actual Time Basis</div>
              <div className="text-muted-foreground mt-1">
                Waktu aktual yang digunakan untuk kalkulasi.
              </div>
              <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                <div><span className="font-bold">Net:</span> {formatTime(actualNetTimeMins)} - Tanpa cutoff</div>
                <div><span className="font-bold">Raw:</span> {formatTime(actualRawTimeMins)} - Termasuk cutoff</div>
              </div>
            </div>
          }
        >
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Actual:</span>
            <select
              value={actualBasis}
              onChange={(e) => onChange({ actualBasis: e.target.value as ActualBasis })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] cursor-help"
            >
              <option value="net">net (no cutoff)</option>
              <option value="raw">raw (incl. cutoff)</option>
            </select>
          </div>
        </CursorTooltip>

        <CursorTooltip
          content={
            <div className="max-w-[320px] whitespace-normal">
              <div className="font-medium text-primary">KPI Time Context</div>
              <div className="text-muted-foreground mt-1">
                Menentukan apakah KPI time memakai waktu produksi saja atau produksi + downtime (maks. budget).
              </div>
              <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                <div><span className="font-bold">Production only:</span> Actual</div>
                <div><span className="font-bold">Production + downtime:</span> Actual + Downtime (capped)</div>
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div><span className="font-bold">Current:</span> {timeContext === "production_plus_downtime" ? "production + downtime" : "production only"}</div>
                  <div><span className="font-bold">KPI Time:</span> {formatTime(actualTimeForKpiMins)}</div>
                </div>
              </div>
            </div>
          }
        >
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">KPI Time:</span>
            <select
              value={timeContext}
              onChange={(e) => onChange({ timeContext: e.target.value as TimeContext })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] cursor-help"
            >
              <option value="production">production only</option>
              <option value="production_plus_downtime">production + downtime</option>
            </select>
          </div>
        </CursorTooltip>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">OEE Base:</span>
          <div className="inline-flex rounded-md border border-border bg-muted/50 overflow-hidden">
            <button
              className={`px-3 py-1 font-medium ${oeeView === "cycle" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setOeeView("cycle")}
              type="button"
            >
              Cycle
            </button>
            <button
              className={`px-3 py-1 font-medium ${oeeView === "target" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setOeeView("target")}
              type="button"
            >
              Target
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* LEFT: Productivity Chart */}
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="text-[10px] font-medium text-muted-foreground mb-2">Perbandingan Output</div>
          
          {/* Chart */}
            <FullscreenChart title="KPI Output Chart" fillWidth={false} contentClassName="max-w-lg w-full">
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                    }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)} unit`, ""]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FullscreenChart>

          {/* Key Metrics under chart */}
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <CursorTooltip
              content={
                <div className="max-w-[360px] whitespace-normal">
                  <div className="font-medium text-primary">Productivity Ratio (Rasio Produktivitas)</div>
                  <div className="text-muted-foreground mt-1">
                    Perbandingan langsung antara output aktual dengan target yang seharusnya dicapai.
                  </div>
                  <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Rumus:</div>
                    <div className="font-mono mt-1">(Actual Output ÷ Computed Target) × 100%</div>
                    <div className="mt-2 border-t border-border/50 pt-2">
                      <div>= {actualOutput} ÷ {computedTargetOutput.toFixed(2)}</div>
                      <div>= <span className={`font-bold ${productivityStatus.color}`}>{pct(productivityRatio)}</span></div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-medium">Interpretasi Nilai {pct(productivityRatio)}:</div>
                    <div className="text-muted-foreground space-y-1 mt-1">
                      {productivityRatio >= 1.2 && <div className="text-green-600">🏆 SANGAT PRODUKTIF! Melebihi target sebesar {((productivityRatio - 1) * 100).toFixed(0)}%.</div>}
                      {productivityRatio >= 1.0 && productivityRatio < 1.2 && <div className="text-green-500">✅ PRODUKTIF. Target tercapai atau terlampaui.</div>}
                      {productivityRatio >= 0.8 && productivityRatio < 1.0 && <div className="text-amber-500">📊 CUKUP PRODUKTIF. Kurang {((1 - productivityRatio) * 100).toFixed(0)}% dari target.</div>}
                      {productivityRatio >= 0.5 && productivityRatio < 0.8 && <div className="text-orange-500">⚠️ KURANG PRODUKTIF. Hanya {(productivityRatio * 100).toFixed(0)}% dari target tercapai.</div>}
                      {productivityRatio > 0 && productivityRatio < 0.5 && <div className="text-red-600">🚨 KRITIS! Hanya {(productivityRatio * 100).toFixed(0)}% dari target. Perlu evaluasi segera.</div>}
                      {productivityRatio === 0 && <div className="text-muted-foreground">⚠️ Tidak ada data. Isi Actual Output dan Target.</div>}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-medium">Panduan Nilai:</div>
                    <div className="text-[10px] space-y-0.5 mt-1">
                      <div><span className="text-green-600">≥120%</span> = Sangat Produktif (melebihi ekspektasi)</div>
                      <div><span className="text-green-500">100-119%</span> = Produktif (target tercapai)</div>
                      <div><span className="text-amber-500">80-99%</span> = Cukup (hampir target)</div>
                      <div><span className="text-orange-500">50-79%</span> = Kurang (perlu perbaikan)</div>
                      <div><span className="text-red-600">&lt;50%</span> = Kritis (investigasi diperlukan)</div>
                    </div>
                  </div>
                </div>
              }
            >
              <div className={`rounded-md p-2 cursor-help ${productivityRatio >= 1 ? 'bg-green-500/10 border border-green-500/20' : productivityRatio >= 0.8 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <div className="text-[10px] text-muted-foreground">Productivity</div>
                <div className={`font-bold text-lg ${productivityStatus.color}`}>{pct(productivityRatio)}</div>
                <div className={`text-[9px] ${productivityStatus.color}`}>{productivityStatus.text}</div>
              </div>
            </CursorTooltip>

            <CursorTooltip
              content={
                <div className="max-w-[360px] whitespace-normal">
                  <div className="font-medium text-primary">Gap (Selisih Output)</div>
                  <div className="text-muted-foreground mt-1">
                    Perbedaan antara output aktual dengan target yang seharusnya.
                  </div>
                  <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Rumus:</div>
                    <div className="font-mono mt-1">Actual Output − Computed Target</div>
                    <div className="mt-2 border-t border-border/50 pt-2">
                      <div>= {actualOutput} − {computedTargetOutput.toFixed(2)}</div>
                      <div>= <span className={`font-bold ${outputGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>{outputGap >= 0 ? '+' : ''}{outputGap.toFixed(2)} unit</span></div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-medium">Interpretasi Nilai {outputGap >= 0 ? '+' : ''}{outputGap.toFixed(2)}:</div>
                    <div className="text-muted-foreground mt-1">
                      {outputGap > 0 && (
                        <div className="text-green-600">
                          ✅ SURPLUS {outputGap.toFixed(2)} unit ({gapPercentage.toFixed(1)}% di atas target).<br/>
                          Artinya: Produksi melebihi yang diharapkan. Performa sangat baik!
                        </div>
                      )}
                      {outputGap === 0 && (
                        <div className="text-green-500">
                          ✓ TEPAT TARGET.<br/>
                          Artinya: Produksi persis sesuai yang direncanakan.
                        </div>
                      )}
                      {outputGap < 0 && outputGap > -computedTargetOutput * 0.1 && (
                        <div className="text-amber-500">
                          📊 KURANG {Math.abs(outputGap).toFixed(2)} unit ({Math.abs(gapPercentage).toFixed(1)}% di bawah target).<br/>
                          Artinya: Sedikit di bawah target, masih dalam toleransi.
                        </div>
                      )}
                      {outputGap <= -computedTargetOutput * 0.1 && outputGap > -computedTargetOutput * 0.25 && (
                        <div className="text-orange-500">
                          ⚠️ KURANG {Math.abs(outputGap).toFixed(2)} unit ({Math.abs(gapPercentage).toFixed(1)}% di bawah target).<br/>
                          Artinya: Di bawah target, perlu evaluasi proses.
                        </div>
                      )}
                      {outputGap <= -computedTargetOutput * 0.25 && computedTargetOutput > 0 && (
                        <div className="text-red-600">
                          🚨 KURANG {Math.abs(outputGap).toFixed(2)} unit ({Math.abs(gapPercentage).toFixed(1)}% di bawah target).<br/>
                          Artinya: Jauh di bawah target! Investigasi diperlukan.
                        </div>
                      )}
                      {computedTargetOutput === 0 && (
                        <div className="text-muted-foreground">
                          ⚠️ Target = 0, tidak bisa menghitung gap yang bermakna.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              }
            >
              <div className={`rounded-md p-2 cursor-help ${outputGap >= 0 ? 'bg-green-500/10 border border-green-500/20' : outputGap > -computedTargetOutput * 0.25 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <div className="text-[10px] text-muted-foreground">Gap</div>
                <div className={`font-bold text-lg ${outputGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {outputGap >= 0 ? '+' : ''}{outputGap.toFixed(2)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {outputGap >= 0 ? 'surplus' : 'kurang'} dari target
                </div>
              </div>
            </CursorTooltip>
          </div>

          {/* REPORT: Kesimpulan Productivity */}
          <div className={`mt-3 p-3 rounded-lg border ${productivityRatio >= 1 ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : productivityRatio >= 0.8 ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800'}`}>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">📝 Kesimpulan Productivity</div>
            <div className="text-xs text-foreground space-y-1">
              {productivityRatio === 0 || !Number.isFinite(productivityRatio) ? (
                <p>⚠️ Belum ada data untuk dianalisis. Isi Actual Output dan Target terlebih dahulu.</p>
              ) : (
                <>
                  <p>
                    Dari target <span className="font-bold text-blue-600">{computedTargetOutput.toFixed(2)} unit</span>, 
                    produksi aktual adalah <span className="font-bold text-green-600">{actualOutput} unit</span>.
                  </p>
                  <p className={productivityStatus.color}>
                    {productivityRatio >= 1.2 && `🏆 Performa SANGAT BAIK! Melebihi target sebesar ${((productivityRatio - 1) * 100).toFixed(0)}%. Pertahankan momentum ini.`}
                    {productivityRatio >= 1.0 && productivityRatio < 1.2 && `✅ Performa BAIK. Target tercapai. ${outputGap > 0 ? `Surplus ${outputGap.toFixed(2)} unit.` : ''}`}
                    {productivityRatio >= 0.8 && productivityRatio < 1.0 && `📊 Performa CUKUP. Kurang ${Math.abs(outputGap).toFixed(2)} unit dari target. Identifikasi hambatan produksi.`}
                    {productivityRatio >= 0.5 && productivityRatio < 0.8 && `⚠️ Performa KURANG. Hanya ${(productivityRatio * 100).toFixed(0)}% dari target. Perlu evaluasi proses dan resources.`}
                    {productivityRatio < 0.5 && `🚨 Performa KRITIS. Hanya ${(productivityRatio * 100).toFixed(0)}% dari target. Segera lakukan root cause analysis.`}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Efficiency Metrics */}
        <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
          {/* Output Breakdown */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-2">Output Breakdown</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Output per Hour</div>
                    <div className="text-muted-foreground mt-1">
                      Kecepatan produksi per jam.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-mono">Total Output ÷ Jam</div>
                      <div className="mt-1">{actualOutput} ÷ {actualHoursForKpi.toFixed(2)} = <span className="font-bold">{productivityPerHour.toFixed(2)}</span></div>
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/30 p-2 cursor-help text-center">
                  <div className="text-[10px] text-muted-foreground">Per Hour</div>
                  <div className="font-semibold tabular-nums">{productivityPerHour.toFixed(2)}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Output per Head</div>
                    <div className="text-muted-foreground mt-1">
                      Rata-rata output per station/head.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-mono">Total Output ÷ Heads</div>
                      <div className="mt-1">{actualOutput} ÷ {headsCount} = <span className="font-bold">{perHeadOutput.toFixed(2)}</span></div>
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/30 p-2 cursor-help text-center">
                  <div className="text-[10px] text-muted-foreground">Per Head</div>
                  <div className="font-semibold tabular-nums">{perHeadOutput.toFixed(2)}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Output per Cycle</div>
                    <div className="text-muted-foreground mt-1">
                      Output per cycle yang diselesaikan.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-mono">Total Output ÷ Cycles</div>
                      <div className="mt-1">{actualOutput} ÷ {completedCyclesForKpi.toFixed(2)} = <span className="font-bold">{perCycleOutput.toFixed(2)}</span></div>
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/30 p-2 cursor-help text-center">
                  <div className="text-[10px] text-muted-foreground">Per Cycle</div>
                  <div className="font-semibold tabular-nums">{perCycleOutput.toFixed(2)}</div>
                </div>
              </CursorTooltip>
            </div>
          </div>

          {/* Efficiency Metrics - CORE */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground mb-2">Efficiency Metrics (Core)</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <CursorTooltip
                content={
                  <div className="max-w-[320px] whitespace-normal">
                    <div className="font-medium">Availability (Ketersediaan)</div>
                    <div className="text-muted-foreground mt-1">
                      Persentase waktu yang digunakan untuk produksi (bukan downtime).
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Rumus:</div>
                    <div className="font-mono">100% - (Downtime ÷ (Planned + Budget) × 100%)</div>
                    <div className="mt-2 border-t border-border/50 pt-2">
                      <div><span className="font-semibold">{plannedLabel}</span></div>
                      <div>Downtime% = {formatTime(downtimeMinsCapped)} ÷ ({formatTime(plannedDisplay)} + {formatTime(downtimeBudgetCap)}) = {pct(downtimePctDisplay)}</div>
                      <div>Availability = 100% - {pct(downtimePctDisplay)} = <span className="font-bold">{pct(availability)}</span></div>
                    </div>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium">Interpretasi {pct(availability)}:</div>
                      <div className="text-muted-foreground text-[10px]">
                        {availability >= 0.9 ? `✅ Downtime rendah. Mesin berjalan lancar.` : 
                         availability >= 0.8 ? `📊 Downtime moderat. Masih dalam batas wajar.` : 
                         `⚠️ Downtime tinggi. Perlu investigasi penyebab.`}
                      </div>
                    </div>
                  </div>
                }
              >
                <div className={`rounded-md p-2 cursor-help ${availability >= 0.9 ? 'bg-green-500/10 border border-green-500/20' : availability >= 0.8 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="text-[10px] text-muted-foreground">Availability</div>
                  <div className="font-semibold tabular-nums">{pct(availability)}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[320px] whitespace-normal">
                    <div className="font-medium">Utilization (Utilisasi Kapasitas)</div>
                    <div className="text-muted-foreground mt-1">
                      Berapa persen kapasitas yang digunakan dari waktu yang direncanakan. <span className="font-bold">Maksimal 100%.</span>
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-medium">Rumus:</div>
                      <div className="font-mono">min(Actual ÷ (Planned + Downtime), 100%)</div>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div>Net Running = {formatTime(actualTimeMins)} (downtime di luar actual)</div>
                        <div><span className="font-semibold">{plannedLabel}</span></div>
                        <div>Raw = {formatTime(netRunningMins)} ÷ ({formatTime(plannedDisplay)} + {formatTime(downtimeMinsCapped)}) = {pct(utilizationRaw)}</div>
                        <div>Capped = <span className="font-bold">{pct(utilization)}</span></div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium">Interpretasi {pct(utilization)}:</div>
                      <div className="text-muted-foreground text-[10px]">
                        {utilization >= 0.85 ? `✅ Utilisasi baik. Kapasitas dimanfaatkan optimal.` : 
                         utilization >= 0.7 ? `📊 Utilisasi cukup. Ada ruang untuk peningkatan.` : 
                         `⚠️ Utilisasi rendah. Banyak kapasitas terbuang.`}
                      </div>
                    </div>
                    <div className="mt-2 p-2 bg-amber-500/10 rounded text-[10px]">
                      <div className="font-medium text-amber-600">⚡ Catatan:</div>
                      <div className="text-muted-foreground">
                        Jika aktual &gt; planned, utilisasi tetap 100% (kapasitas terpakai penuh).
                        {utilizationRaw > 1 && <span className="block mt-1">Raw value: {pct(utilizationRaw)} → capped ke 100%</span>}
                      </div>
                    </div>
                  </div>
                }
              >
                <div className={`rounded-md p-2 cursor-help ${utilization >= 0.85 ? 'bg-green-500/10 border border-green-500/20' : utilization >= 0.7 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="text-[10px] text-muted-foreground">Utilization</div>
                  <div className="font-semibold tabular-nums">{pct(utilization)}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[320px] whitespace-normal">
                    <div className="font-medium">Time Efficiency (Efisiensi Waktu)</div>
                    <div className="text-muted-foreground mt-1">
                      Seberapa cepat pekerjaan selesai dibanding rencana.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-medium">Rumus:</div>
                      <div className="font-mono">(Planned ÷ Actual) × 100%</div>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div><span className="font-semibold">{plannedLabel}</span></div>
                        <div>= {formatTime(plannedDisplay)} ÷ {formatTime(actualTimeForKpiMins)}</div>
                        <div>= <span className="font-bold">{pct(timeEfficiency)}</span></div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium">Interpretasi {pct(timeEfficiency)}:</div>
                      <div className="text-muted-foreground text-[10px]">
                        {timeEfficiency >= 1 ? `✅ Lebih cepat dari rencana (${((timeEfficiency - 1) * 100).toFixed(0)}% lebih efisien)` : 
                         timeEfficiency >= 0.9 ? `📊 Hampir sesuai rencana` : 
                         `⚠️ Lebih lambat ${((1 - timeEfficiency) * 100).toFixed(0)}% dari rencana`}
                      </div>
                    </div>
                  </div>
                }
              >
                <div className={`rounded-md p-2 cursor-help ${timeEfficiency >= 1 ? 'bg-green-500/10 border border-green-500/20' : timeEfficiency >= 0.9 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="text-[10px] text-muted-foreground">Time Eff.</div>
                  <div className="font-semibold tabular-nums">{pct(timeEfficiency)}</div>
                </div>
              </CursorTooltip>
            </div>
          </div>

          {/* Industry Standard Metrics - OEE Components */}
          <div>
          <div className="text-[10px] font-medium text-muted-foreground mb-2">Industry Metrics (OEE Components)</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <CursorTooltip
              content={
                <div className="max-w-[360px] whitespace-normal">
                  <div className="font-medium text-primary">{primaryLabel}</div>
                  <div className="text-muted-foreground mt-1">
                    Cycle Base: Availability × Quality (performance diasumsikan ideal).<br/>
                    Target Base: Availability × Performance_target × Quality, dengan performance_target = waktu ideal untuk target ÷ KPI time.
                  </div>
                  <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                    <div className="font-medium">Nilai:</div>
                    <div className="font-mono text-lg">{pct(primaryOee)}</div>
                  </div>
                </div>
              }
            >
              <div className={`rounded-md p-2 cursor-help ${primaryOee >= 0.85 ? 'bg-green-500/10 border border-green-500/20' : primaryOee >= 0.65 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <div className="text-[10px] text-muted-foreground">{primaryLabel}</div>
                <div className="font-bold text-lg tabular-nums">{pct(primaryOee)}</div>
                <div className={`text-[9px] ${oeeStatus(primaryOee).cls}`}>{oeeStatus(primaryOee).text}</div>
              </div>
            </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[320px] whitespace-normal">
                    <div className="font-medium">Takt Time Adherence</div>
                    <div className="text-muted-foreground mt-1">
                      Seberapa konsisten produksi mengikuti ritme (takt) yang diperlukan.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div className="font-medium">Rumus:</div>
                      <div className="font-mono">min(Takt Time ÷ Actual Cycle Time, 100%)</div>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div className="font-medium">Langkah:</div>
                        <div>Takt = {formatTime(plannedTimeMins)} ÷ {computedTargetOutput.toFixed(2)} = {taktTime.toFixed(2)} min/unit</div>
                        <div>Actual = {formatTime(actualTimeForKpiMins)} ÷ {actualOutput} = {actualCycleTime.toFixed(2)} min/unit</div>
                        <div>Ratio = {taktTime.toFixed(2)} ÷ {actualCycleTime.toFixed(2)} = {pct(taktAdherenceRaw)}</div>
                        <div>Adherence = <span className="font-bold">{pct(taktAdherence)}</span></div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium">Interpretasi:</div>
                      <div className="text-muted-foreground text-[10px]">
                        {taktAdherence >= 0.95 ? `✅ Sesuai / lebih cepat dari takt` : 
                         taktAdherence >= 0.9 ? `📊 Sedikit lebih lambat dari takt` : 
                         `⚠️ Lebih lambat dari takt yang diperlukan`}
                      </div>
                    </div>
                  </div>
                }
              >
                <div className={`rounded-md p-2 cursor-help ${taktAdherence >= 0.95 ? 'bg-green-500/10 border border-green-500/20' : taktAdherence >= 0.9 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="text-[10px] text-muted-foreground">Takt Adherence</div>
                  <div className="font-semibold tabular-nums">{pct(taktAdherence)}</div>
                </div>
              </CursorTooltip>
            </div>

            {/* OEE Component Breakdown */}
          <div className="grid grid-cols-3 gap-2 text-xs mt-2">
            <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Availability (OEE A)</div>
                    <div className="text-muted-foreground mt-1">
                      Komponen pertama OEE: waktu uptime vs total waktu.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div><span className="font-semibold">{plannedLabel}</span></div>
                      <div>= (Planned + Budget - Downtime) ÷ (Planned + Budget)</div>
                      <div>= {pct(availability)}</div>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div>Planned = {formatTime(plannedDisplay)}</div>
                        <div>Budget = {formatTime(downtimeBudgetCap)}</div>
                        <div>Downtime = {formatTime(downtimeMinsCapped)}</div>
                        <div>Operating = {formatTime(operatingWindowDisplay)}</div>
                        <div>A = {formatTime(operatingWindowDisplay)} / {formatTime(plannedWindowDisplay)} = {pct(availability)}</div>
                      </div>
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/20 p-1.5 cursor-help text-center">
                  <div className="text-[9px] text-muted-foreground">A</div>
                  <div className="font-semibold text-[11px] tabular-nums">{pct(availabilityDisplay)}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Performance (OEE P)</div>
                    <div className="text-muted-foreground mt-1">
                      Komponen kedua OEE: kecepatan aktual vs kecepatan ideal.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div>= Actual Output ÷ Theoretical Max</div>
                      <div>= {pct(Math.min(performanceRate, 1))}</div>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div>Actual Output = {actualOutput}</div>
                        {theoreticalOutputAtSpeed > 0 ? (
                          <>
                            <div>
                              Theoretical Max = ({formatTime(performanceTimeMins)} / {formatTime(plannedCycleTimeMins)}) * {idealOutputPerCycle} = {theoreticalOutputAtSpeed.toFixed(2)}
                            </div>
                            <div>Raw P = {actualOutput} / {theoreticalOutputAtSpeed.toFixed(2)} = {pct(performanceRate)}</div>
                          </>
                        ) : (
                          <>
                            <div>Cycles = {performanceCycles.toFixed(2)}</div>
                            <div>Ideal Output/Cycle = {idealOutputPerCycle || 1}</div>
                            <div>Theoretical Max = {performanceCycles.toFixed(2)} * {idealOutputPerCycle || 1} = {(performanceCycles * (idealOutputPerCycle || 1)).toFixed(2)}</div>
                            <div>Raw P = {actualOutput} / {(performanceCycles > 0 ? performanceCycles * (idealOutputPerCycle || 1) : 1).toFixed(2)} = {pct(performanceRate)}</div>
                          </>
                        )}
                        <div>OEE P (capped) = {pct(Math.min(performanceRate, 1))}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Catatan: Performance capped di 100% untuk kalkulasi OEE.
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/20 p-1.5 cursor-help text-center">
                  <div className="text-[9px] text-muted-foreground">P</div>
                  <div className="font-semibold text-[11px] tabular-nums">{pct(Math.min(performanceDisplay, 1))}</div>
                </div>
              </CursorTooltip>

              <CursorTooltip
                content={
                  <div className="max-w-[300px] whitespace-normal">
                    <div className="font-medium">Quality (OEE Q)</div>
                    <div className="text-muted-foreground mt-1">
                      Komponen ketiga OEE: produk bagus vs total produk.
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-[10px]">
                      <div>= Good Output ÷ Total Output</div>
                      <div>= {goodOutput} ÷ {actualOutput} = {pct(qualityRate)}</div>
                    </div>
                    <div className="mt-2 border-t border-border/50 pt-2 text-[10px]">
                      {actualOutput > 0 ? (
                        <>
                          <div>Good Output = {goodOutput}</div>
                          <div>Total Output = {actualOutput}</div>
                          <div>Q = {goodOutput} / {actualOutput} = {pct(qualityRate)}</div>
                        </>
                      ) : (
                        <div>Total Output = 0, Quality default 100%</div>
                      )}
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Default: Quality = 100% (semua output dianggap bagus).
                    </div>
                  </div>
                }
              >
                <div className="rounded-md bg-muted/20 p-1.5 cursor-help text-center">
                  <div className="text-[9px] text-muted-foreground">Q</div>
                  <div className="font-semibold text-[11px] tabular-nums">{pct(qualityRate)}</div>
                </div>
              </CursorTooltip>
            </div>
          </div>

          {/* REPORT: Kesimpulan Efficiency */}
          <div className={`p-3 rounded-lg border ${primaryOee >= 0.85 ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : primaryOee >= 0.65 ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800'}`}>
            <div className="text-[10px] font-semibold text-muted-foreground mb-1">📝 Kesimpulan Efficiency</div>
            <div className="text-xs text-foreground space-y-1">
              {actualTimeMins === 0 ? (
                <p>⚠️ Belum ada data waktu untuk dianalisis.</p>
              ) : (
                <>
                  <p>
                    {primaryLabel}: <span className="font-bold">{pct(primaryOee)}</span> • 
                    Availability: <span className={downtimePctDisplay > 0.1 ? 'font-bold text-red-600' : 'font-bold'}>{pct(availability)}</span> • 
                    Utilization: <span className="font-bold">{pct(utilization)}</span>
                  </p>
                  <p className={efficiencyStatus.color}>
                    {primaryOee >= 0.85 && `🏆 WORLD CLASS! ${primaryLabel} ${pct(primaryOee)} menunjukkan operasi sangat efisien. Pertahankan!`}
                    {primaryOee >= 0.65 && primaryOee < 0.85 && `✅ TYPICAL. ${primaryLabel} ${pct(primaryOee)} dalam range normal. Ada ruang untuk improvement.`}
                    {primaryOee >= 0.4 && primaryOee < 0.65 && `📊 PERLU PERHATIAN. ${primaryLabel} ${pct(primaryOee)} di bawah rata-rata. Fokus pada ${availability < 0.85 ? 'downtime reduction' : performanceDisplay < 0.85 ? 'speed optimization' : 'quality improvement'}.`}
                    {primaryOee < 0.4 && `⚠️ URGENT! ${primaryLabel} sangat rendah. Perlu investigasi Availability, Performance, dan Quality.`}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Summary footer */}
          <div className="text-[9px] text-muted-foreground bg-muted/20 rounded px-2 py-1 flex flex-wrap gap-x-3">
            <span>Cycles: {completedCycles.toFixed(2)}</span>
            <span>Running: {formatTime(netRunningMins)}</span>
            {config.targetBasis === "shift" && (
              <span>Shifts: {completedShifts.toFixed(2)} ({shiftMinutes > 0 ? `${shiftMinutes}m` : "not set"})</span>
            )}
          </div>
        </div>
      </div>

      {/* Shift Duration Dialog - NOW IN MINUTES */}
      <Dialog
        open={shiftDialogOpen}
        onOpenChange={(open) => {
          setShiftDialogOpen(open);
          if (!open && !shiftSavedRef.current) {
            onChange({ targetBasis: prevBasisRef.current });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Durasi Shift</DialogTitle>
            <DialogDescription>
              Masukkan durasi 1 shift dalam <span className="font-bold">menit</span>. Ini diperlukan agar target "per shift" dapat dihitung dengan benar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="p-3 bg-muted/30 rounded-lg text-sm">
              <div className="font-medium mb-1">Contoh Penggunaan:</div>
              <div className="text-muted-foreground text-xs space-y-1">
                <div>• Shift 8 jam = <span className="font-bold">480 menit</span></div>
                <div>• Shift 12 jam = <span className="font-bold">720 menit</span></div>
                <div>• Setelah 240 menit (0.5 shift dari 480m), computed target = 50% dari target per shift</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Durasi shift (menit)</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={shiftMinutesDraft}
                  onChange={(e) => setShiftMinutesDraft(e.target.value)}
                  placeholder="contoh: 480"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">menit</span>
              </div>
              {shiftMinutesDraft && Number(shiftMinutesDraft) > 0 && (
                <div className="text-xs text-muted-foreground">
                  = {(Number(shiftMinutesDraft) / 60).toFixed(2)} jam
                </div>
              )}
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Preset:</span>
              {[
                { label: "6 jam", value: 360 },
                { label: "8 jam", value: 480 },
                { label: "10 jam", value: 600 },
                { label: "12 jam", value: 720 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setShiftMinutesDraft(String(preset.value))}
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                >
                  {preset.label} ({preset.value}m)
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                shiftSavedRef.current = false;
                setShiftDialogOpen(false);
                onChange({ targetBasis: prevBasisRef.current });
              }}
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                const parsed = shiftMinutesSchema.safeParse(shiftMinutesDraft);
                if (!parsed.success) {
                  return;
                }
                shiftSavedRef.current = true;
                onChange({ targetBasis: "shift", shiftMinutes: parsed.data });
                setShiftDialogOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




