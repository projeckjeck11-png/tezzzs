import { useState } from 'react';
import { Database, Trash2, Save, X, RotateCcw } from 'lucide-react';

interface ActionBarProps {
  onSave: () => void;
  onDelete: () => void;
  onCloseAll: () => void;
  onResetAllTimers: () => void;
  hasChannels: boolean;
  hasData: boolean;
}

export function ActionBar({
  onSave,
  onDelete,
  onCloseAll,
  onResetAllTimers,
  hasChannels,
  hasData
}: ActionBarProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete();
    setShowConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowConfirm(false);
  };

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-border mt-4">
      {/* Local storage indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Database className="w-3.5 h-3.5" />
        <span>Data saved locally in your browser (localStorage)</span>
      </div>

      {!showConfirm ? (
        <div className="flex flex-col gap-2">
          {/* Primary actions */}
          <div className="flex gap-2">
            <button
              className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={onSave}
              disabled={!hasChannels}
            >
              <Save className="w-4 h-4" />
              Save Snapshot
            </button>
            <button
              className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium bg-secondary text-destructive border border-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={handleDeleteClick}
              disabled={!hasData}
            >
              <Trash2 className="w-4 h-4" />
              Reset Database
            </button>
          </div>

          {/* Secondary actions */}
          <div className="flex gap-2">
            <button
              className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={onCloseAll}
              disabled={!hasChannels}
            >
              <X className="w-3.5 h-3.5" />
              Close All
            </button>
            <button
              className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={onResetAllTimers}
              disabled={!hasChannels}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All Timers
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-foreground text-center">
            Delete all local data? (channels & notes)
          </span>
          <div className="flex gap-3">
            <button
              className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground border border-border hover:bg-accent transition-all active:scale-[0.98]"
              onClick={handleCancelDelete}
            >
              Cancel
            </button>
            <button
              className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-all active:scale-[0.98]"
              onClick={handleConfirmDelete}
            >
              Delete All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
