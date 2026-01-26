import { X, Copy, Check } from 'lucide-react';
import { Note } from '@/types';
import { useState } from 'react';

interface NotesDisplayProps {
  notes: Note[];
  onDeleteNote: (id: string) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotesDisplay({ notes, onDeleteNote }: NotesDisplayProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (notes.length === 0) return null;

  const handleCopy = async (note: Note) => {
    const text = note.lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <h2 className="text-lg font-semibold text-foreground mb-4">Saved Notes</h2>
      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <div
            key={note.id}
            className="bg-secondary rounded-xl p-4 relative group cursor-pointer hover:bg-secondary/80 transition-colors"
            onClick={() => handleCopy(note)}
          >
            {/* Copy indicator */}
            <div className={`absolute top-2 left-2 flex items-center gap-1 text-xs font-medium transition-opacity ${copiedId === note.id ? 'opacity-100 text-green-500' : 'opacity-0 group-hover:opacity-100 text-muted-foreground'}`}>
              {copiedId === note.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Click to copy</span>
                </>
              )}
            </div>

            {/* Delete button for individual note */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note.id);
              }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/80 hover:bg-destructive hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              aria-label="Delete note"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider text-right">
              {formatDate(note.savedAt)}
            </div>
            <div className="flex flex-col gap-1">
              {note.lines.map((line, idx) => (
                <div key={idx} className="text-[15px] font-mono text-foreground">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
