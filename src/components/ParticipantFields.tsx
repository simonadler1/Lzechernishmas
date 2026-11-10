import { Checkbox, Field } from './ui';

export interface ParticipantValues {
  name: string;
  phone: string;
  email: string;
  isAnonymous: boolean;
}

export const emptyParticipant: ParticipantValues = { name: '', phone: '', email: '', isAnonymous: false };

/**
 * Name, optional phone and email, and the anonymous choice. The claim form,
 * the my-portion edit form and the organizer all use these same fields and words.
 */
export function ParticipantFields({
  values,
  onChange,
  errors,
  nameLabel = 'Your name',
  organizer = false,
}: {
  values: ParticipantValues;
  onChange: (values: ParticipantValues) => void;
  errors: Record<string, string>;
  nameLabel?: string;
  /** The organizer is filling this in for someone else. */
  organizer?: boolean;
}) {
  const set = <K extends keyof ParticipantValues>(key: K, value: ParticipantValues[K]) =>
    onChange({ ...values, [key]: value });
  const hasContact = values.phone.trim() !== '' || values.email.trim() !== '';

  return (
    <div className="space-y-4">
      <Field
        label={nameLabel}
        name="name"
        autoComplete={organizer ? 'off' : 'name'}
        autoCapitalize="words"
        dir="auto"
        required
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
      />
      <Field
        label="Phone (optional)"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete={organizer ? 'off' : 'tel'}
        value={values.phone}
        onChange={(e) => set('phone', e.target.value)}
        error={errors.phone}
      />
      <Field
        label="Email (optional)"
        name="email"
        type="email"
        inputMode="email"
        autoComplete={organizer ? 'off' : 'email'}
        autoCapitalize="none"
        spellCheck={false}
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        error={errors.email}
      />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {hasContact
          ? organizer
            ? 'They will get a link to their page and reminders for this campaign, and can opt out at any time.'
            : 'You will get a link to your page and reminders for this campaign, by text if you gave a phone number and otherwise by email. You can opt out at any time.'
          : organizer
            ? 'With no phone or email they get no reminders. You can mark their masechta finished for them.'
            : 'Leaving both blank means no reminders, and no way to send you your link.'}
      </p>
      <Checkbox
        name="isAnonymous"
        label={organizer ? 'Show as Anonymous on the chart' : 'Show me as Anonymous on the chart'}
        hint={organizer ? 'You still see the name here.' : 'The organizer still sees your name.'}
        checked={values.isAnonymous}
        onChange={(e) => set('isAnonymous', e.target.checked)}
      />
    </div>
  );
}
