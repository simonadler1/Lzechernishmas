import { cx } from '../lib/cx';

// Alphabetical, because someone without a Hebrew keyboard does not know the
// typing layout either. Final letters sit beside their regular forms.
const KEYS = [...'אבגדהוזחטיכךלמםנןסעפףצץקרשת', '״', '׳', '-'];

const keyClass =
  'flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface ' +
  'font-hebrew text-lg hover:border-ink active:bg-tekhelet-wash';

/**
 * Hebrew letters to tap, for people whose phone or computer has no Hebrew
 * keyboard. The field it types into does not need to be focused, so on a phone
 * the system keyboard stays out of the way.
 */
export function HebrewKeyboard({
  onInsert,
  onDelete,
  className,
}: {
  onInsert: (text: string) => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Hebrew keyboard" dir="rtl" className={cx('grid grid-cols-6 gap-2', className)}>
      {KEYS.map((key) => (
        <button key={key} type="button" lang="he" className={keyClass} onClick={() => onInsert(key)}>
          {key}
        </button>
      ))}
      <button type="button" dir="ltr" className={cx(keyClass, 'col-span-4 font-sans text-base')} onClick={() => onInsert(' ')}>
        Space
      </button>
      <button type="button" dir="ltr" className={cx(keyClass, 'col-span-2 font-sans text-base')} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
