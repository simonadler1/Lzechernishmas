import type { Progress } from '../../shared/api-types';
import { SHAS } from '../../shared/shas';
import type { MasechtaState } from '../lib/chart';
import { cx } from '../lib/cx';
import { progressText } from './ProgressBar';

const LONGEST_SEDER = Math.max(...SHAS.map((seder) => seder.masechtos.reduce((sum, m) => sum + m.perakim, 0)));

/**
 * All of Shas at once: six rows, one per seder, each masechta as wide as its
 * number of perakim. It runs right to left, the way Shas is read. It is a
 * picture only; the list below is where masechtos are chosen, and the counts
 * are given as text for screen readers.
 */
export function ShasMap({
  stateOf,
  progress,
  justTaken,
}: {
  stateOf: (masechtaId: string) => MasechtaState;
  progress: Progress;
  /** Masechtos this visitor took a moment ago. Their segments fill in. */
  justTaken?: ReadonlySet<string>;
}) {
  return (
    <div role="img" aria-label={`Map of Shas: ${progressText(progress)}.`} dir="rtl" className="space-y-1">
      {SHAS.map((seder) => {
        const perakim = seder.masechtos.reduce((sum, m) => sum + m.perakim, 0);
        return (
          <div key={seder.id} className="flex h-4 gap-px lg:h-5" style={{ width: `${(perakim / LONGEST_SEDER) * 100}%` }}>
            {seder.masechtos.map((masechta) => {
              const state = stateOf(masechta.id);
              return (
                <div
                  key={masechta.id}
                  style={{ flexGrow: masechta.perakim, flexBasis: 0 }}
                  className={cx(
                    'min-w-0 border',
                    state === 'open' && 'border-line-strong',
                    state === 'selected' && 'border-2 border-tekhelet',
                    state === 'taken' && 'state-taken border-tekhelet',
                    state === 'finished' && 'border-tekhelet bg-tekhelet',
                    justTaken?.has(masechta.id) && 'segment-fill',
                  )}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
