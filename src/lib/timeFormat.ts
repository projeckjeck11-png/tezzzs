/**
 * Format time in HH:MM:SS:CC format
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Format time in short format (H:MM:SS or M:SS)
 */
export function formatTimeShort(ms: number): string {
  // Always show as total minutes for timeline markers
  const totalMinutes = Math.floor(ms / 60000);
  return totalMinutes.toString();
}

/**
 * Calculate elapsed milliseconds for any timer.
 * Uses performance.now() for sub-millisecond accuracy.
 */
export function getElapsedMs(timer: { accumulatedMs: number; running: boolean; startPerf: number | null }): number {
  if (timer.running && timer.startPerf !== null) {
    return Math.floor(timer.accumulatedMs + (performance.now() - timer.startPerf));
  }
  return Math.floor(timer.accumulatedMs);
}
