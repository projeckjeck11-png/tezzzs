import { useState, useEffect } from 'react';
import { X, RotateCcw, Plus } from 'lucide-react';
import { HeadChannel } from '@/types';
import { SubChannelCard } from './SubChannelCard';
import { TimelineChart } from './TimelineChart';

interface HeadChannelCardProps {
  headChannel: HeadChannel;
  displayTime: string;
  buttonLabel: string;
  onToggle: () => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  onReset: () => void;
  onAddSubChannel: () => void;
  onToggleSubChannel: (subId: string) => void;
  onResetSubChannel: (subId: string) => void;
  onDeleteSubChannel: (subId: string) => void;
  onUpdateSubChannelName: (subId: string, name: string) => void;
  getDisplayTime: (timer: { accumulatedMs: number; running: boolean; startPerf: number | null }) => string;
}

export function HeadChannelCard({
  headChannel,
  displayTime,
  buttonLabel,
  onToggle,
  onNameChange,
  onDelete,
  onReset,
  onAddSubChannel,
  onToggleSubChannel,
  onResetSubChannel,
  onDeleteSubChannel,
  onUpdateSubChannelName,
  getDisplayTime,
}: HeadChannelCardProps) {
  const [localName, setLocalName] = useState(headChannel.name);

  useEffect(() => {
    setLocalName(headChannel.name);
  }, [headChannel.name]);

  const handleBlur = () => {
    onNameChange(localName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow">
      {/* Head Channel Section */}
      <div className="p-3 relative group">
        {/* Delete button */}
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
          aria-label="Delete head channel"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-start gap-3">
          {/* Main timer display */}
          <div className="flex-shrink-0">
            <input
              type="text"
              className="text-sm font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 pr-8 transition-colors max-w-[150px] truncate"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Head channel"
            />
            <div className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-foreground font-mono mt-1">
              {displayTime}
            </div>

            <div className="flex gap-2 mt-2">
              <button
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                  headChannel.running
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
                onClick={onToggle}
              >
                {buttonLabel}
              </button>
              <button
                onClick={onReset}
                className="py-2 px-3 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98] flex items-center justify-center gap-1"
                aria-label="Reset timer"
                title="Reset all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub Channels Section */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {headChannel.subChannels.map((sub) => (
                <SubChannelCard
                  key={sub.id}
                  subChannel={sub}
                  displayTime={getDisplayTime(sub)}
                  headRunning={headChannel.running}
                  onToggle={() => onToggleSubChannel(sub.id)}
                  onNameChange={(name) => onUpdateSubChannelName(sub.id, name)}
                  onDelete={() => onDeleteSubChannel(sub.id)}
                  onReset={() => onResetSubChannel(sub.id)}
                />
              ))}

              {/* Add Sub Channel Button */}
              <button
                onClick={onAddSubChannel}
                className="flex-shrink-0 w-[80px] h-[90px] border border-dashed border-border/50 rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px] mt-1">Sub</span>
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Chart */}
        <TimelineChart headChannel={headChannel} />
      </div>
    </div>
  );
}
