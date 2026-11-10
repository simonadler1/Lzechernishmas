import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
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

/** Hebrew text inside an English page. The page stays LTR; only this element flips. */
export function Hebrew({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="he" className={cx('font-hebrew', className)}>
      {children}
    </span>
  );
}
