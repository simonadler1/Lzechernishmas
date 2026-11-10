import { useMemo, useState, type FormEvent } from 'react';
import type { CampaignDto } from '../../shared/api-types';
import { DEDICATION_LABELS, DEDICATION_TYPES, type DedicationType } from '../../shared/dedication';
import { hebrewDate } from '../../shared/hebrew-date';
import type { CampaignInput } from '../../shared/schemas';
import { errorMessage, fieldErrors } from '../lib/api';
import { Button, Field, Hebrew, Notice, SelectField, TextAreaField } from './ui';

function timezones(current: string): string[] {
  let all: string[];
  try {
    all = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older browsers: offer the common ones.
    all = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Jerusalem'];
  }
  return all.includes(current) ? all : [current, ...all];
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
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [honoreeNameHe, setHonoreeNameHe] = useState(campaign?.honoreeNameHe ?? '');
  const [honoreeNameEn, setHonoreeNameEn] = useState(campaign?.honoreeNameEn ?? '');
  const [dedicationType, setDedicationType] = useState<DedicationType>(campaign?.dedicationType ?? 'ilui_nishmas');
  const [message, setMessage] = useState(campaign?.message ?? '');
  const [endDate, setEndDate] = useState(campaign?.endDate ?? '');
  const [timezone, setTimezone] = useState(
    campaign?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/New_York',
  );

  const zones = useMemo(() => timezones(timezone), [timezone]);
  const errors = fieldErrors(error);
  const hebrew = hebrewDate(endDate);
  const hasFieldError = Object.keys(errors).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ title, honoreeNameHe, honoreeNameEn, dedicationType, message, endDate, timezone });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field
        label="Name in Hebrew"
        hint="The person the learning is for, as it should appear on the chart and the sign. For example: נפתלי בן יעקב"
        name="honoreeNameHe"
        dir="rtl"
        lang="he"
        className="font-hebrew text-lg"
        required
        value={honoreeNameHe}
        onChange={(e) => setHonoreeNameHe(e.target.value)}
        error={errors.honoreeNameHe}
      />
      <Field
        label="Name in English (optional)"
        hint="Used in text messages, which are much shorter when written in Hebrew letters."
        name="honoreeNameEn"
        value={honoreeNameEn}
        onChange={(e) => setHonoreeNameEn(e.target.value)}
        error={errors.honoreeNameEn}
      />
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
      <Field
        label="Campaign title"
        hint="For your own list, such as “Mishnayos for the shloshim”. Visitors see the name above, not this."
        name="title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
      />
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
      <SelectField
        label="Timezone"
        hint="Reminders go out at about 10:00 in the morning in this timezone."
        name="timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        error={errors.timezone}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replace(/_/g, ' ')}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Message (optional)"
        hint="A few words shown on the chart page."
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
