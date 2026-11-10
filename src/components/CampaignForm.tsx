import { useRef, useState, type FormEvent, type SyntheticEvent } from 'react';
import type { CampaignDto } from '../../shared/api-types';
import { DEDICATION_LABELS, DEDICATION_TYPES, type DedicationType } from '../../shared/dedication';
import { hebrewDate } from '../../shared/hebrew-date';
import type { CampaignInput } from '../../shared/schemas';
import { errorMessage, fieldErrors } from '../lib/api';
import { HebrewKeyboard } from './HebrewKeyboard';
import { Button, Field, Hebrew, Notice, SelectField, TextAreaField } from './ui';

/** The browser's timezone. It is saved with a new campaign so reminders go out in the organizer's morning. */
function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

interface Props {
  campaign?: CampaignDto;
  submitLabel: string;
  busy: boolean;
  error: unknown;
  onSubmit: (input: CampaignInput) => void;
  onCancel?: () => void;
}

/** Create and edit share this form. Server validation messages appear on the field they belong to. */
export function CampaignForm({ campaign, submitLabel, busy, error, onSubmit, onCancel }: Props) {
  const [honoreeName, setHonoreeName] = useState(campaign?.honoreeName ?? '');
  const [dedicationType, setDedicationType] = useState<DedicationType>(campaign?.dedicationType ?? 'ilui_nishmas');
  const [message, setMessage] = useState(campaign?.message ?? '');
  const [endDate, setEndDate] = useState(campaign?.endDate ?? '');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Where the on-screen keyboard types: the last place the cursor was in the name field.
  const caret = useRef<{ start: number; end: number } | null>(null);
  const rememberCaret = (event: SyntheticEvent<HTMLInputElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    caret.current = selectionStart === null ? null : { start: selectionStart, end: selectionEnd ?? selectionStart };
  };
  const typeAt = (edit: (start: number, end: number, value: string) => { value: string; caret: number }) => {
    setHonoreeName((current) => {
      const at = caret.current ?? { start: current.length, end: current.length };
      const start = Math.min(at.start, current.length);
      const next = edit(start, Math.min(at.end, current.length), current);
      caret.current = { start: next.caret, end: next.caret };
      return next.value;
    });
  };
  const insert = (text: string) =>
    typeAt((start, end, value) => ({ value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }));
  const deleteBack = () =>
    typeAt((start, end, value) =>
      start !== end
        ? { value: value.slice(0, start) + value.slice(end), caret: start }
        : { value: value.slice(0, Math.max(0, start - 1)) + value.slice(start), caret: Math.max(0, start - 1) },
    );

  const errors = fieldErrors(error);
  const hebrew = hebrewDate(endDate);
  const hasFieldError = Object.keys(errors).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      honoreeName,
      dedicationType,
      message,
      endDate,
      // Only a new campaign gets a timezone. Editing leaves it as it was.
      ...(campaign ? {} : { timezone: browserTimezone() }),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <Field
          label="Name"
          hint="The person the learning is for, in Hebrew or English, as it should appear on the chart and the sign."
          name="honoreeName"
          dir="auto"
          autoComplete="off"
          className="font-hebrew text-lg"
          required
          value={honoreeName}
          onChange={(e) => {
            setHonoreeName(e.target.value);
            rememberCaret(e);
          }}
          onSelect={rememberCaret}
          onBlur={rememberCaret}
          error={errors.honoreeName}
        />
        <Button
          variant="quiet"
          className="-ml-4"
          aria-expanded={keyboardOpen}
          aria-controls="hebrew-keyboard"
          onClick={() => setKeyboardOpen((open) => !open)}
        >
          {keyboardOpen ? 'Hide the Hebrew keyboard' : 'Type in Hebrew letters'}
        </Button>
        <div id="hebrew-keyboard" hidden={!keyboardOpen}>
          {keyboardOpen && <HebrewKeyboard onInsert={insert} onDelete={deleteBack} className="mt-1 max-w-md" />}
        </div>
      </div>
      <SelectField
        label="The learning is"
        name="dedicationType"
        value={dedicationType}
        onChange={(e) => setDedicationType(e.target.value as DedicationType)}
        error={errors.dedicationType}
      >
        {DEDICATION_TYPES.map((type) => (
          <option key={type} value={type}>
            {DEDICATION_LABELS[type]}
          </option>
        ))}
      </SelectField>
      <div>
        <Field
          label="Target date"
          hint="Usually the shloshim or the yahrzeit. People can still finish after it."
          name="endDate"
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={errors.endDate}
        />
        <p className="mt-1 min-h-6 text-ink-muted" aria-live="polite" data-testid="hebrew-date">
          {hebrew && <Hebrew>{hebrew}</Hebrew>}
        </p>
      </div>
      <TextAreaField
        label="Information for participants (optional)"
        hint="Anything you want people to know, in your own words. It appears on the chart page and on the printed sign."
        maxLength={1000}
        name="message"
        dir="auto"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        error={errors.message}
      />

      {Boolean(error) && (
        <Notice>{hasFieldError ? 'Some details need fixing. See the messages above.' : errorMessage(error)}</Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
