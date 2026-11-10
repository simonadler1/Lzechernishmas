import type { Progress } from '../../shared/api-types';

export function progressText(progress: Progress): string {
  return `${progress.finished} of ${progress.total} masechtos finished, ${progress.taken} taken, ${progress.open} still open`;
}

/**
 * Finished is solid and taken is striped, the same patterns as the Shas map,
 * so the states read without relying on color.
 */
export function ProgressBar({ progress }: { progress: Progress }) {
  const percent = (count: number) => `${(count / progress.total) * 100}%`;
  return (
    <div>
      <div className="flex h-3 overflow-hidden border border-line-strong bg-surface" aria-hidden="true">
        <div className="bg-tekhelet" style={{ width: percent(progress.finished) }} />
        <div className="state-taken" style={{ width: percent(progress.taken) }} />
      </div>
      <p className="mt-1 text-sm text-ink-muted">{progressText(progress)}</p>
    </div>
  );
}
