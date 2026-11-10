import type { MasechtaState } from '../lib/chart';
import { cx } from '../lib/cx';

const Check = ({ className }: { className: string }) => (
  <svg viewBox="0 0 20 20" className={cx('absolute inset-0 size-full', className)} aria-hidden="true">
    <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The circle at the start of a masechta's row. Each state has its own pattern,
 * so it reads in sunlight, in grayscale and without color vision.
 */
export function StateMark({ state }: { state: MasechtaState }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative block size-5 shrink-0 rounded-full border',
        state === 'open' && 'border-line-strong bg-surface',
        state === 'selected' && 'border-tekhelet bg-tekhelet',
        state === 'taken' && 'state-taken border-tekhelet',
        state === 'finished' && 'border-tekhelet bg-tekhelet',
      )}
    >
      {(state === 'selected' || state === 'finished') && <Check className="text-surface" />}
    </span>
  );
}
