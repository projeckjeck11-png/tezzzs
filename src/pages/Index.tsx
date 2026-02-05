import { useEffect, useState } from 'react';
import { useStopwatch } from '@/hooks/useStopwatch';
import { HeadChannelCard } from '@/components/HeadChannelCard';
import { ActionBar } from '@/components/ActionBar';
import { NotesDisplay } from '@/components/NotesDisplay';
import { ImportTimelineCustomize } from '@/components/ImportTimelineCustomize';
import SetupProductionTimeline from '@/components/SetupProductionTimeline';
import { StopwatchActions } from '@/components/StopwatchActions';
import { Plus, Settings2, Factory, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function Index() {
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const stored = window.localStorage.getItem('appZoom');
    const parsed = stored ? Number(stored) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
  });
  const [showZoomControls, setShowZoomControls] = useState(false);
  const [showImportCustomize, setShowImportCustomize] = useState(false);
  const [showSetupProduction, setShowSetupProduction] = useState(false);
  const {
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
  } = useStopwatch();

  const hasChannels = headChannels.length > 0;
  const hasData = hasChannels || notes.length > 0;

  const handleAddHeadChannel = () => {
    addHeadChannel();
    setShowImportCustomize(false);
    setShowSetupProduction(false);
  };

  useEffect(() => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    if (clamped !== zoom) {
      setZoom(clamped);
      return;
    }
    const value = clamped.toFixed(2);
    document.documentElement.style.zoom = value;
    document.body.style.zoom = value;
    window.localStorage.setItem('appZoom', value);
  }, [zoom]);

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const zoomIn = () => setZoom(prev => Math.min(ZOOM_MAX, Math.round((prev + ZOOM_STEP) * 10) / 10));
  const zoomOut = () => setZoom(prev => Math.max(ZOOM_MIN, Math.round((prev - ZOOM_STEP) * 10) / 10));
  const resetZoom = () => setZoom(1);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <header className="mb-6 flex flex-col items-center gap-2 text-center relative">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            MetricDeck
          </h1>
          <div className="absolute right-0 top-0">
            <button
              type="button"
              onClick={() => setShowZoomControls(prev => !prev)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
              aria-label="Toggle zoom controls"
              aria-expanded={showZoomControls}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {showZoomControls && (
              <div className="absolute right-0 top-full z-10 mt-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-xl">
                  <button
                    onClick={zoomOut}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground transition hover:text-foreground hover:bg-muted/60"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[48px] text-center tabular-nums">{zoomLabel}</span>
                  <button
                    onClick={zoomIn}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground transition hover:text-foreground hover:bg-muted/60"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-4 w-px bg-border/60" />
                  <input
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={ZOOM_STEP}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-28 accent-slate-700"
                    aria-label="Zoom level"
                  />
                  <button
                    onClick={resetZoom}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground transition hover:text-foreground hover:bg-muted/60"
                    aria-label="Reset zoom"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Timer input and calculation setup tool for production analytics
          </p>
        </header>

        <main className="flex flex-col gap-4">
          {/* Main Action Buttons - Always visible and aligned */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                hasChannels
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={handleAddHeadChannel}
            >
              <Plus className="w-4 h-4" />
              Add Head Channel
            </button>

            <button
              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                showImportCustomize
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={() => {
                setShowImportCustomize(!showImportCustomize);
                setShowSetupProduction(false);
              }}
            >
              <Settings2 className="w-4 h-4" />
              Import Timeline Customize
            </button>

            <button
              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                showSetupProduction
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={() => {
                setShowSetupProduction(!showSetupProduction);
                setShowImportCustomize(false);
              }}
            >
              <Factory className="w-4 h-4" />
              Setup Production Timeline
            </button>
          </div>

          {/* Stopwatch Sub-Actions - Only show when there are head channels */}
          {hasChannels && (
            <StopwatchActions 
              headChannels={headChannels} 
              onImportChannels={importHeadChannels}
            />
          )}

          {/* Import Timeline Customize Panel */}
          {showImportCustomize && <ImportTimelineCustomize onClose={() => setShowImportCustomize(false)} />}

          {/* Setup Production Timeline Panel */}
          {showSetupProduction && <SetupProductionTimeline onClose={() => setShowSetupProduction(false)} />}

          <div className="flex flex-col gap-3">
            {headChannels.map(headChannel => (
              <HeadChannelCard
                key={headChannel.id}
                headChannel={headChannel}
                displayTime={getDisplayTime(headChannel)}
                buttonLabel={getButtonLabel(headChannel)}
                onToggle={() => toggleHeadChannel(headChannel.id)}
                onNameChange={name => updateHeadChannelName(headChannel.id, name)}
                onDelete={() => deleteHeadChannel(headChannel.id)}
                onReset={() => resetHeadChannel(headChannel.id)}
                onAddSubChannel={() => addSubChannel(headChannel.id)}
                onToggleSubChannel={subId => toggleSubChannel(headChannel.id, subId)}
                onResetSubChannel={subId => resetSubChannel(headChannel.id, subId)}
                onDeleteSubChannel={subId => deleteSubChannel(headChannel.id, subId)}
                onUpdateSubChannelName={(subId, name) => updateSubChannelName(headChannel.id, subId, name)}
                getDisplayTime={getDisplayTime}
              />
            ))}
          </div>

          {hasChannels && (
            <ActionBar
              onSave={saveSnapshot}
              onDelete={deleteAll}
              onCloseAll={closeAllChannels}
              onResetAllTimers={resetAllTimers}
              hasChannels={hasChannels}
              hasData={hasData}
            />
          )}

          <NotesDisplay notes={notes} onDeleteNote={deleteNote} />
        </main>

        {/* Footer Credit */}
        <footer className="mt-12 mb-6 text-center">
          <p className="text-[11px] text-muted-foreground/60 tracking-wide font-light">
            Created by <span className="font-medium text-muted-foreground/80">RedCAP</span> © 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
