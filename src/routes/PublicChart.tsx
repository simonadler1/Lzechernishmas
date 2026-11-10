import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ClaimCreatedResponse, MineResponse, PublicCampaignDto } from '../../shared/api-types';
import { formatLongDate, localDate } from '../../shared/dates';
import { dedicationPhrase } from '../../shared/dedication';
import { SHAS, getMasechta, type Masechta } from '../../shared/shas';
import { ParticipantFields, emptyParticipant, type ParticipantValues } from '../components/ParticipantFields';
import { progressText } from '../components/ProgressBar';
import { ShasMap } from '../components/ShasMap';
import { StateMark } from '../components/StateMark';
import { Button, ButtonLink, Checkbox, CopyButton, Field, Hebrew, Notice, Skeleton } from '../components/ui';
import { ApiError, api, errorMessage, fieldErrors } from '../lib/api';
import {
  entriesById,
  useForgetDevice,
  useMine,
  usePublicChart,
  useTakeMasechtos,
  type MasechtaState,
} from '../lib/chart';
import { cx } from '../lib/cx';

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const names = (ids: string[]) => ids.map((id) => getMasechta(id)?.en ?? id);

/** "l'ilui nishmas Naftali ben Yaakov", falling back to the Hebrew name. */
export function Dedication({ campaign }: { campaign: PublicCampaignDto }) {
  if (campaign.honoreeNameEn) return <>{dedicationPhrase(campaign.dedicationType, campaign.honoreeNameEn)}</>;
  const [before] = dedicationPhrase(campaign.dedicationType, '\u0000').split('\u0000');
  return (
    <>
      {before}
      <Hebrew>{campaign.honoreeNameHe}</Hebrew>
    </>
  );
}

/** The title page: the name, what the learning is for, and the target date. */
export function TitleBlock({ campaign, children }: { campaign: PublicCampaignDto; children?: ReactNode }) {
  return (
    <header className="text-center">
      <h1 className="honoree-name" dir="rtl" lang="he">
        {campaign.honoreeNameHe}
      </h1>
      <p className="mt-3 text-lg">
        All of Shas Mishnayos, learned <Dedication campaign={campaign} />
      </p>
      <p className="mt-2 text-ink-muted">
        Target date {formatLongDate(campaign.endDate)}
        {campaign.endDateHebrew && (
          <>
            <br />
            <Hebrew className="text-lg">{campaign.endDateHebrew}</Hebrew>
          </>
        )}
      </p>
      {children}
    </header>
  );
}

function Row({
  masechta,
  state,
  holder,
  onToggle,
}: {
  masechta: Masechta;
  state: MasechtaState;
  holder?: string;
  onToggle?: () => void;
}) {
  const layout = 'flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left';
  const body = (
    <>
      <StateMark state={state} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{masechta.en}</span>
        <span className="block text-sm text-ink-muted" dir="auto">
          {state === 'open' && `${masechta.perakim} perakim`}
          {state === 'selected' && `${masechta.perakim} perakim, selected`}
          {state === 'taken' && (
            <>
              <span className="sr-only">Taken by </span>
              {holder}
            </>
          )}
          {state === 'finished' && (
            <>
              <span className="sr-only">Finished by </span>
              {holder}, finished
            </>
          )}
        </span>
      </span>
      <Hebrew className="shrink-0 text-lg">{masechta.he}</Hebrew>
    </>
  );
  return (
    <li className="border-b border-line">
      {onToggle ? (
        <button
          type="button"
          aria-pressed={state === 'selected'}
          onClick={onToggle}
          className={cx(layout, 'cursor-pointer', state === 'selected' ? 'bg-tekhelet-wash' : 'hover:bg-surface')}
        >
          {body}
        </button>
      ) : (
        <div className={layout}>{body}</div>
      )}
    </li>
  );
}

function YourMasechtos({ slug, mine }: { slug: string; mine: MineResponse }) {
  const forget = useForgetDevice(slug);
  return (
    <section aria-labelledby="yours" className="mb-6 border-l-4 border-tekhelet bg-surface p-4">
      <h2 id="yours" className="text-lg font-semibold">
        Your masechtos
      </h2>
      <ul className="mt-2 space-y-3">
        {mine.submissions.map((submission) => (
          <li key={submission.manageToken}>
            <p>
              {submission.masechtos
                .map((m) => `${getMasechta(m.masechtaId)?.en ?? m.masechtaId}${m.status === 'finished' ? ' (finished)' : ''}`)
                .join(', ')}
            </p>
            <Link to={`/m/${submission.manageToken}`} className="text-link flex min-h-11 items-center">
              Mark finished or give back
            </Link>
          </li>
        ))}
      </ul>
      <Button variant="quiet" className="-ml-4" busy={forget.isPending} onClick={() => forget.mutate()}>
        Not you? Remove from this phone
      </Button>
    </section>
  );
}

function SignIn({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => api.post(`/api/public/campaigns/${slug}/sign-in/request-code`, { address }),
    onSuccess: () => {
      setSentTo(address.trim());
      setCode('');
    },
  });
  const verify = useMutation({
    mutationFn: () =>
      api.post<{ token: string }>(`/api/public/campaigns/${slug}/sign-in/verify`, { address: sentTo, code }),
    onSuccess: ({ token }) => navigate(`/m/${token}`),
  });

  if (!open) {
    return (
      <Button variant="quiet" className="-ml-4" onClick={() => setOpen(true)}>
        Already took a masechta? Sign in
      </Button>
    );
  }

  const submitAddress = (event: FormEvent) => {
    event.preventDefault();
    request.mutate();
  };
  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    verify.mutate();
  };

  return (
    <section aria-labelledby="sign-in">
      <h2 id="sign-in" className="text-lg font-semibold">
        Sign in to your masechtos
      </h2>
      {sentTo === null ? (
        <form onSubmit={submitAddress} className="mt-3 space-y-4" noValidate>
          <Field
            label="Phone or email"
            hint="The one you gave when you took a masechta. We will send it a 6-digit code."
            name="address"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={fieldErrors(request.error).address}
          />
          {request.error && !fieldErrors(request.error).address && <Notice>{errorMessage(request.error)}</Notice>}
          <Button type="submit" busy={request.isPending} className="w-full sm:w-auto">
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-3 space-y-4" noValidate>
          <p className="text-ink-muted">
            If <span className="font-semibold text-ink">{sentTo}</span> was used for this campaign, a code is on its
            way. It works for 10 minutes.
          </p>
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={fieldErrors(verify.error).code}
          />
          {verify.error && !fieldErrors(verify.error).code && <Notice>{errorMessage(verify.error)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={verify.isPending} className="w-full sm:w-auto">
              Sign in
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setSentTo(null);
                verify.reset();
              }}
            >
              Use a different phone or email
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ChartSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[35rem] px-4 py-8">
      <Skeleton className="mx-auto h-14 w-3/4" />
      <Skeleton className="mx-auto mt-4 h-6 w-2/3" />
      <div className="mt-8 space-y-1">
        {SHAS.map((seder) => (
          <Skeleton key={seder.id} className="h-4 w-full" />
        ))}
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </main>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[35rem] px-4 py-12">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-ink-muted">{children}</p>
    </main>
  );
}

type Step = 'chart' | 'form' | 'done';

export default function PublicChart() {
  const { slug = '' } = useParams();
  const chart = usePublicChart(slug);
  const mine = useMine(slug);
  const take = useTakeMasechtos(slug);

  const [step, setStep] = useState<Step>('chart');
  const [picked, setPicked] = useState<string[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [values, setValues] = useState<ParticipantValues>(emptyParticipant);
  const [result, setResult] = useState<ClaimCreatedResponse | null>(null);
  const [justTaken, setJustTaken] = useState<ReadonlySet<string>>(new Set());
  const [conflict, setConflict] = useState<string | null>(null);

  const data = chart.data;
  const entries = useMemo(() => entriesById(data?.masechtos ?? []), [data]);
  // A masechta someone else took in the meantime silently leaves the selection.
  const selected = useMemo(() => picked.filter((id) => !entries.has(id)), [picked, entries]);

  const honoree = data?.campaign.honoreeNameEn ?? data?.campaign.honoreeNameHe;
  useEffect(() => {
    if (honoree) document.title = `Mishnayos for ${honoree}`;
  }, [honoree]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  if (chart.isPending) return <ChartSkeleton />;
  if (chart.error || !data) {
    return chart.error instanceof ApiError && chart.error.status === 404 ? (
      <Problem title="This chart was not found">
        Check that the link was copied in full, or scan the sign again. The campaign may also have ended.
      </Problem>
    ) : (
      <Problem title="The chart could not be loaded">Check your connection, then reload the page.</Problem>
    );
  }

  const { campaign, progress } = data;
  const stateOf = (id: string): MasechtaState => {
    const entry = entries.get(id);
    if (entry) return entry.status;
    return selected.includes(id) ? 'selected' : 'open';
  };
  const toggle = (id: string) => {
    setConflict(null);
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...selected, id]));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setConflict(null);
    take.mutate(
      { ...values, masechtaIds: selected },
      {
        onSuccess: (created) => {
          setResult(created);
          setJustTaken(new Set(created.masechtaIds));
          setPicked([]);
          setStep('done');
        },
        onError: (error) => {
          if (!(error instanceof ApiError) || error.code !== 'conflict') return;
          // Keep what was typed, drop only what was just taken, and say which.
          const taken = (error.extra.conflicts as string[] | undefined) ?? [];
          const remaining = selected.filter((id) => !taken.includes(id));
          setPicked(remaining);
          setConflict(error.message);
          if (remaining.length === 0) setStep('chart');
        },
      },
    );
  };

  if (step === 'form') {
    const errors = fieldErrors(take.error);
    const otherError = take.error && !conflict && Object.keys(errors).length === 0;
    return (
      <main className="mx-auto w-full max-w-[35rem] px-4 py-6">
        <h1 className="text-xl font-semibold">
          {selected.length === 1 ? 'Take this masechta' : `Take these ${selected.length} masechtos`}
        </h1>
        <p className="mt-1 text-ink-muted">
          <Dedication campaign={campaign} />
        </p>
        <ul className="mt-4 border-t border-line">
          {selected.map((id) => {
            const masechta = getMasechta(id)!;
            return (
              <li key={id} className="flex items-center justify-between gap-3 border-b border-line py-2">
                <span>
                  <span className="font-semibold">{masechta.en}</span>
                  <span className="text-ink-muted">, {masechta.perakim} perakim</span>
                </span>
                <Hebrew className="text-lg">{masechta.he}</Hebrew>
              </li>
            );
          })}
        </ul>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {conflict && <Notice>{conflict}</Notice>}
          <ParticipantFields values={values} onChange={setValues} errors={errors} />
          {errors.masechtaIds && <Notice>{errors.masechtaIds}</Notice>}
          {otherError && <Notice>{errorMessage(take.error)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={take.isPending} className="w-full sm:w-auto">
              {selected.length === 1 ? 'Take this masechta' : 'Take these masechtos'}
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep('chart')}>
              Back to the chart
            </Button>
          </div>
        </form>
      </main>
    );
  }

  if (step === 'done' && result) {
    const link = `${window.location.origin}/m/${result.manageToken}`;
    return (
      <main className="mx-auto w-full max-w-[35rem] px-4 py-8">
        <h1 className="text-xl font-semibold">Taken</h1>
        <p className="mt-2 text-lg">
          You took {list(names(result.masechtaIds))} <Dedication campaign={campaign} />. Thank you.
        </p>
        <div className="mt-6">
          <ShasMap stateOf={stateOf} progress={progress} justTaken={justTaken} />
          <p className="mt-2 text-sm text-ink-muted">{progressText(progress)}</p>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Your page</h2>
          <p className="mt-1 text-ink-muted">
            Mark a masechta finished there when you are done, or give it back if you cannot learn it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to={`/m/${result.manageToken}`} className="w-full sm:w-auto">
              Open your page
            </ButtonLink>
            {!result.notified && <CopyButton text={link} label="Copy the link" className="w-full sm:w-auto" />}
          </div>
          <p className="mt-4 max-w-prose">
            {result.notified
              ? 'We also sent you this link, so you can come back from any phone.'
              : 'This phone will remember you. On any other phone, this link is the only way back to your masechtos, so save it somewhere.'}
          </p>
        </div>

        <Button variant="quiet" className="-ml-4 mt-4" onClick={() => setStep('chart')}>
          Back to the chart
        </Button>
      </main>
    );
  }

  const isCompleted = campaign.status === 'completed';
  const pastDate = !isCompleted && localDate(new Date(), campaign.timezone) > campaign.endDate;
  const visibleSedarim = SHAS.map((seder) => ({
    seder,
    masechtos: onlyOpen ? seder.masechtos.filter((m) => !entries.has(m.id)) : seder.masechtos,
  })).filter((group) => group.masechtos.length > 0);

  return (
    <>
      <main
        className={cx(
          'mx-auto w-full max-w-[35rem] px-4 py-8 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16 lg:px-8',
          selected.length > 0 && 'pb-28',
        )}
      >
        <div className="lg:sticky lg:top-8 lg:self-start">
          <TitleBlock campaign={campaign}>
            {campaign.message && (
              <p className="mx-auto mt-4 max-w-prose whitespace-pre-wrap" dir="auto">
                {campaign.message}
              </p>
            )}
          </TitleBlock>
          <div className="mt-8">
            <ShasMap stateOf={stateOf} progress={progress} justTaken={justTaken} />
            <p className="mt-3 text-center font-semibold">{progressText(progress)}</p>
          </div>
        </div>

        <div className="mt-8 min-w-0 lg:mt-0">
          {isCompleted && (
            <div className="mb-6 border-l-4 border-tekhelet bg-tekhelet-wash p-4">
              <h2 className="text-lg font-semibold">All of Shas has been finished</h2>
              <p className="mt-1">
                Every masechta was learned <Dedication campaign={campaign} />. Thank you to everyone who took part.
              </p>
            </div>
          )}
          {pastDate && (
            <div className="mb-6">
              <Notice tone="info">
                This is past the target date. Masechtos can still be taken and finished, so that all of Shas is learned.
              </Notice>
            </div>
          )}

          {mine.data && mine.data.submissions.length > 0 && <YourMasechtos slug={slug} mine={mine.data} />}
          {conflict && (
            <div className="mb-4">
              <Notice>{conflict}</Notice>
            </div>
          )}

          {!isCompleted && (
            <Checkbox
              label="Show only what's still open"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
            />
          )}

          {visibleSedarim.length === 0 && (
            <p className="border-y border-line py-6">
              Every masechta has been taken. If someone gives one back, it will show up here.
            </p>
          )}

          {visibleSedarim.map(({ seder, masechtos }) => (
            <section key={seder.id} aria-labelledby={`seder-${seder.id}`} className="mt-6">
              <h2
                id={`seder-${seder.id}`}
                className="flex items-baseline justify-between gap-3 border-b border-line-strong px-2 pb-1 text-lg font-semibold"
              >
                <span>{seder.en}</span>
                <Hebrew className="text-xl">{seder.he}</Hebrew>
              </h2>
              <ul>
                {masechtos.map((masechta) => {
                  const state = stateOf(masechta.id);
                  const open = state === 'open' || state === 'selected';
                  return (
                    <Row
                      key={masechta.id}
                      masechta={masechta}
                      state={state}
                      holder={entries.get(masechta.id)?.name}
                      onToggle={open && !isCompleted ? () => toggle(masechta.id) : undefined}
                    />
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="mt-10 border-t border-line pt-4">
            <SignIn slug={slug} />
          </div>
        </div>
      </main>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line-strong bg-surface">
          <div
            className="mx-auto flex max-w-[35rem] items-center justify-between gap-3 px-4 pt-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <p className="min-w-0" aria-live="polite">
              <span className="block font-semibold">{selected.length} selected</span>
              <span className="block truncate text-sm text-ink-muted">{names(selected).join(', ')}</span>
            </p>
            <Button className="shrink-0" onClick={() => setStep('form')}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
