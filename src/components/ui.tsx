import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import type { CampaignDto } from '../../shared/api-types';
import { campaignTitleLead } from '../../shared/dedication';
import { cx } from '../lib/cx';

/**
 * The small shared component set. Phone rules from plan/DESIGN.md are built in:
 * controls are at least 44px tall and inputs use 16px text so iOS does not zoom.
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const buttonBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-base font-semibold ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-tekhelet text-surface hover:bg-ink',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-ink',
  quiet: 'text-tekhelet underline underline-offset-2 hover:text-ink',
  danger: 'border border-error bg-surface text-error hover:bg-error hover:text-surface',
};

export const buttonClass = (variant: Variant = 'primary', className?: string) =>
  cx(buttonBase, variants[variant], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows the label as busy and blocks a second tap. */
  busy?: boolean;
}

export function Button({ variant = 'primary', busy, className, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClass(variant, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

export const inputClass =
  'block min-h-12 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink ' +
  'placeholder:text-ink-muted aria-[invalid=true]:border-error';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** A labelled input with an optional hint and an error announced to screen readers. */
export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mb-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hintId, errorId) || undefined}
        {...rest}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

interface LabelledProps {
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** Label, hint and error around any control. `children` receives the ids to wire up. */
function Labelled({
  label,
  hint,
  error,
  id,
  children,
}: LabelledProps & { id?: string; children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode }) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return (
    <div>
      <label htmlFor={controlId} className="mb-1 block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mb-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {children({
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': cx(hintId, errorId) || undefined,
      })}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: LabelledProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Labelled label={label} hint={hint} error={error} id={id}>
      {(props) => (
        <select className={cx(inputClass, className)} {...props} {...rest}>
          {children}
        </select>
      )}
    </Labelled>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: LabelledProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Labelled label={label} hint={hint} error={error} id={id}>
      {(props) => <textarea className={cx(inputClass, 'min-h-28', className)} {...props} {...rest} />}
    </Labelled>
  );
}

/** A checkbox whose whole row is the tap target. */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: { label: ReactNode; hint?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-start gap-3 py-2', className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-tekhelet" {...rest} />
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Copies text and says so. Falls back to showing the text selected when the clipboard is unavailable. */
export function CopyButton({ text, label = 'Copy link', className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  };
  return (
    <Button variant="secondary" className={className} onClick={copy}>
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy. Select the link instead.' : label}
      </span>
    </Button>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-sm font-semibold text-error">
      {children}
    </p>
  );
}

/** A message about the whole form or page, such as a failed request. */
export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-control border-l-4 px-3 py-2',
        tone === 'error' ? 'border-error bg-surface text-error' : 'border-tekhelet bg-tekhelet-wash text-ink',
      )}
    >
      {children}
    </p>
  );
}

/** A plain surface for grouping, used on organizer pages. Public pages use ruled rows instead. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-control border border-line bg-surface p-4', className)}>{children}</div>;
}

/** A placeholder block shaped like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" data-skeleton className={cx('animate-pulse rounded-control bg-line', className)} />;
}

export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('text-xl font-semibold', className)}>{children}</h1>;
}

const HEBREW_LETTERS = /[\u0590-\u05FF]/;
export const hasHebrew = (text: string) => HEBREW_LETTERS.test(text);

/**
 * The name of the person the learning is for. It may be in Hebrew or English,
 * so the direction follows the text, and both are set in the same serif.
 */
export function HonoreeName({ name, className }: { name: string; className?: string }) {
  return (
    <span dir="auto" lang={hasHebrew(name) ? 'he' : undefined} className={cx('font-hebrew', className)}>
      {name}
    </span>
  );
}

/** What a campaign is called in the organizer's pages: "L'ilui nishmas: נפתלי בן יעקב". */
export function CampaignTitle({ campaign, className }: { campaign: Pick<CampaignDto, 'dedicationType' | 'honoreeName'>; className?: string }) {
  return (
    <span className={className}>
      {campaignTitleLead(campaign.dedicationType)}: <HonoreeName name={campaign.honoreeName} className="inline-block" />
    </span>
  );
}

/** Hebrew text inside an English page. The page stays LTR; only this element flips. */
export function Hebrew({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="he" className={cx('font-hebrew', className)}>
      {children}
    </span>
  );
}
