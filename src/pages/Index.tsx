import { useState } from 'react';
import { useStopwatch } from '@/hooks/useStopwatch';
import { HeadChannelCard } from '@/components/HeadChannelCard';
import { ActionBar } from '@/components/ActionBar';
import { NotesDisplay } from '@/components/NotesDisplay';
import { ImportTimeline } from '@/components/ImportTimeline';
import { ImportTimelineOClock } from '@/components/ImportTimelineOClock';
import { ImportTimelineCustomize } from '@/components/ImportTimelineCustomize';
import SetupProductionTimeline from '@/components/SetupProductionTimeline';
import { StopwatchActions } from '@/components/StopwatchActions';
import { ClipboardPaste, Clock, Plus, Settings2, Factory } from 'lucide-react';

export default function Index() {
  const [showImport, setShowImport] = useState(false);
  const [showImportOClock, setShowImportOClock] = useState(false);
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
    setShowImport(false);
    setShowImportOClock(false);
    setShowImportCustomize(false);
    setShowSetupProduction(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <header className="mb-6 text-center">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            MetricDeck
          </h1>
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
                showImport
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={() => {
                setShowImport(!showImport);
                setShowImportOClock(false);
                setShowImportCustomize(false);
              }}
            >
              <ClipboardPaste className="w-4 h-4" />
              Import Timeline
            </button>

            <button
              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                showImportOClock
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={() => {
                setShowImportOClock(!showImportOClock);
                setShowImport(false);
                setShowImportCustomize(false);
              }}
            >
              <Clock className="w-4 h-4" />
              Import Timeline O'Clock
            </button>

            <button
              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                showImportCustomize
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground border border-dashed border-border hover:bg-accent hover:border-muted-foreground'
              }`}
              onClick={() => {
                setShowImportCustomize(!showImportCustomize);
                setShowImport(false);
                setShowImportOClock(false);
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
                setShowImport(false);
                setShowImportOClock(false);
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

          {/* Import Timeline Panel */}
          {showImport && <ImportTimeline onClose={() => setShowImport(false)} />}

          {/* Import Timeline O'Clock Panel */}
          {showImportOClock && <ImportTimelineOClock onClose={() => setShowImportOClock(false)} />}

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
