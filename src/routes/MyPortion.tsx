import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  ParticipantUpdatedResponse,
  PortionClaim,
  PortionResponse,
  PortionSubmission,
} from '../../shared/api-types';
import { getMasechta, sefariaUrl } from '../../shared/shas';
import { ParticipantFields, type ParticipantValues } from '../components/ParticipantFields';
import { StateMark } from '../components/StateMark';
import { Button, ButtonLink, Hebrew, Notice, Skeleton } from '../components/ui';
import { ApiError, api, errorMessage, fieldErrors } from '../lib/api';
import { TitleBlock } from './PublicChart';

const portionKey = (token: string) => ['portion', token] as const;

/** Keeps this private page out of search engines. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function ClaimRow({ token, claim }: { token: string; claim: PortionClaim }) {
  const client = useQueryClient();
  const masechta = getMasechta(claim.masechtaId)!;
  const [confirming, setConfirming] = useState(false);

  const act = useMutation({
    mutationFn: (action: 'complete' | 'reopen' | 'release') =>
      api.post(`/api/manage/${token}/claims/${claim.id}/${action}`),
    onSuccess: () => {
      setConfirming(false);
      void client.invalidateQueries({ queryKey: ['chart'] });
      void client.invalidateQueries({ queryKey: ['mine'] });
      return client.invalidateQueries({ queryKey: portionKey(token) });
    },
  });
  const finished = claim.status === 'finished';

  return (
    <li className="border-b border-line py-4">
      <div className="flex items-center gap-3">
        <StateMark state={claim.status} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{masechta.en}</span>
          <span className="block text-sm text-ink-muted">
            {masechta.perakim} perakim{finished && ', finished'}
          </span>
        </span>
        <Hebrew className="shrink-0 text-lg">{masechta.he}</Hebrew>
      </div>

      {act.error && (
        <div className="mt-3">
          <Notice>{errorMessage(act.error)}</Notice>
        </div>
      )}

      {confirming ? (
        <div className="mt-3 border-l-4 border-error bg-surface p-4">
          <p>Give back {masechta.en}? It will be open again for someone else to take.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" busy={act.isPending} onClick={() => act.mutate('release')}>
              Give it back
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {finished ? (
            <Button variant="secondary" busy={act.isPending} onClick={() => act.mutate('reopen')}>
              Undo finished
            </Button>
          ) : (
            <Button busy={act.isPending} onClick={() => act.mutate('complete')}>
              Mark finished
            </Button>
          )}
          <a
            href={sefariaUrl(masechta.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 font-semibold hover:border-ink"
          >
            Read on Sefaria
          </a>
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            Give it back
          </Button>
        </div>
      )}
    </li>
  );
}

function EditDetails({
  token,
  submission,
  onClose,
}: {
  token: string;
  submission: PortionSubmission;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<ParticipantValues>({
    name: submission.name,
    phone: submission.phone ?? '',
    email: submission.email ?? '',
    isAnonymous: submission.isAnonymous,
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch<ParticipantUpdatedResponse>(`/api/manage/${token}/participants/${submission.participantId}`, values),
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ['chart'] });
      onClose();
      // The edit removed the phone or email this link was built on, so switch to the link that still works.
      if (updated.manageToken) navigate(`/m/${updated.manageToken}`, { replace: true });
      else void client.invalidateQueries({ queryKey: portionKey(token) });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const errors = fieldErrors(save.error);

  return (
    <form onSubmit={submit} className="mt-3 space-y-4 border-l-4 border-tekhelet bg-surface p-4" noValidate>
      <ParticipantFields values={values} onChange={setValues} errors={errors} />
      {save.error && Object.keys(errors).length === 0 && <Notice>{errorMessage(save.error)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={save.isPending} className="w-full sm:w-auto">
          Save details
        </Button>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Submission({ token, submission, grouped }: { token: string; submission: PortionSubmission; grouped: boolean }) {
  const [editing, setEditing] = useState(false);
  const contact = [submission.phone, submission.email].filter(Boolean).join(', ');

  return (
    <section className="mt-8" aria-label={grouped ? `Taken as ${submission.name}` : 'Your masechtos'}>
      <div className="border-b border-line-strong pb-2">
        <h2 className="text-lg font-semibold" dir="auto">
          {grouped ? `Taken as ${submission.name}` : submission.name}
        </h2>
        <p className="text-sm text-ink-muted">
          {contact || 'No phone or email, so no reminders'}
          {submission.isAnonymous && '. Shown as Anonymous on the chart'}
        </p>
      </div>

      {submission.claims.length === 0 ? (
        <p className="border-b border-line py-4 text-ink-muted">Nothing is held under this name now.</p>
      ) : (
        <ul>
          {submission.claims.map((claim) => (
            <ClaimRow key={claim.id} token={token} claim={claim} />
          ))}
        </ul>
      )}

      {editing ? (
        <EditDetails token={token} submission={submission} onClose={() => setEditing(false)} />
      ) : (
        <Button variant="quiet" className="-ml-4" onClick={() => setEditing(true)}>
          Edit my details
        </Button>
      )}
    </section>
  );
}

export default function MyPortion() {
  const { token = '' } = useParams();
  useNoIndex();
  const { data, error, isPending } = useQuery({
    queryKey: portionKey(token),
    queryFn: () => api.get<PortionResponse>(`/api/manage/${token}`),
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    document.title = 'Your masechtos';
  }, []);

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-[35rem] px-4 py-8">
        <Skeleton className="mx-auto h-14 w-3/4" />
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-3 h-24 w-full" />
      </main>
    );
  }

  if (error || !data) {
    const invalid = error instanceof ApiError && error.status === 404;
    return (
      <main className="mx-auto w-full max-w-[35rem] px-4 py-12">
        <h1 className="text-xl font-semibold">{invalid ? 'This link does not work' : 'Your page could not be loaded'}</h1>
        <p className="mt-2 text-ink-muted">
          {invalid
            ? 'It may have been cut short when it was copied. Open it again from the message you were sent. If you gave a phone number or email, you can also sign in from the chart page.'
            : 'Check your connection, then reload the page.'}
        </p>
      </main>
    );
  }

  const { campaign, submissions } = data;
  const claims = submissions.flatMap((s) => s.claims);
  const allFinished = claims.length > 0 && claims.every((claim) => claim.status === 'finished');
  const grouped = submissions.length > 1;

  return (
    <main className="mx-auto w-full max-w-[35rem] px-4 py-8">
      <TitleBlock campaign={campaign} />

      {allFinished && (
        <div className="mt-8 border-l-4 border-tekhelet bg-tekhelet-wash p-4">
          <p className="text-lg font-semibold">You finished everything you took. Yasher koach.</p>
          <p className="mt-1">If you can learn another masechta, the chart shows what is still open.</p>
        </div>
      )}
      {claims.length === 0 && (
        <div className="mt-8">
          <Notice tone="info">You are not holding any masechtos now. The chart shows what is still open.</Notice>
        </div>
      )}

      {submissions.map((submission) => (
        <Submission key={submission.participantId} token={token} submission={submission} grouped={grouped} />
      ))}

      <div className="mt-8 border-t border-line pt-6">
        <ButtonLink to={`/c/${campaign.slug}`} variant="secondary" className="w-full sm:w-auto">
          {campaign.status === 'completed' ? 'See the chart' : 'Take more masechtos'}
        </ButtonLink>
        <p className="mt-4 text-sm text-ink-muted">
          This page is private to you. Anyone with its link can change your masechtos, so share the{' '}
          <Link to={`/c/${campaign.slug}`} className="text-link">
            chart link
          </Link>{' '}
          with others instead.
        </p>
      </div>
    </main>
  );
}
