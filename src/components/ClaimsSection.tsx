import { useMemo, useState, type FormEvent } from 'react';
import type { CampaignDto, OrganizerClaim } from '../../shared/api-types';
import { SHAS, getMasechta } from '../../shared/shas';
import { ApiError, errorMessage, fieldErrors } from '../lib/api';
import { useAssign, useClaims, useEditParticipant, useSetClaimStatus } from '../lib/claims';
import { ParticipantFields, emptyParticipant, type ParticipantValues } from './ParticipantFields';
import { StateMark } from './StateMark';
import { Button, Checkbox, Hebrew, Input, Notice, Skeleton, inputClass } from './ui';

const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function EditPerson({ campaignId, claim, onClose }: { campaignId: string; claim: OrganizerClaim; onClose: () => void }) {
  const edit = useEditParticipant(campaignId);
  const [values, setValues] = useState<ParticipantValues>({
    name: claim.participant.name,
    phone: claim.participant.phone ?? '',
    email: claim.participant.email ?? '',
    isAnonymous: claim.participant.isAnonymous,
  });
  const errors = fieldErrors(edit.error);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    edit.mutate({ participantId: claim.participant.id, values }, { onSuccess: onClose });
  };
  return (
    <form onSubmit={submit} className="mt-3 max-w-[35rem] space-y-4 border-l-4 border-tekhelet bg-surface p-4" noValidate>
      <ParticipantFields values={values} onChange={setValues} errors={errors} nameLabel="Name" organizer />
      {edit.error && Object.keys(errors).length === 0 && <Notice>{errorMessage(edit.error)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={edit.isPending}>
          Save details
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ClaimRow({ campaignId, claim }: { campaignId: string; claim: OrganizerClaim }) {
  const setStatus = useSetClaimStatus(campaignId);
  const [mode, setMode] = useState<'view' | 'edit' | 'release'>('view');
  const masechta = getMasechta(claim.masechtaId)!;
  const person = claim.participant;
  const finished = claim.status === 'finished';
  const change = (status: 'claimed' | 'completed' | 'released') =>
    setStatus.mutate({ claimId: claim.id, status }, { onSuccess: () => setMode('view') });

  return (
    <li className="border-b border-line py-3" data-testid={`claim-${claim.masechtaId}`}>
      <div className="grid gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)] md:items-center">
        <div className="flex items-center gap-3">
          <StateMark state={claim.status} />
          <span className="font-semibold">{masechta.en}</span>
          <Hebrew className="text-ink-muted">{masechta.he}</Hebrew>
        </div>
        <div className="min-w-0" dir="auto">
          {person.name}
          {(person.isAnonymous || person.source === 'organizer') && (
            <span className="block text-sm text-ink-muted" dir="ltr">
              {[person.isAnonymous && 'Anonymous on the chart', person.source === 'organizer' && 'Added by you']
                .filter(Boolean)
                .join(', ')}
            </span>
          )}
        </div>
        <div className="min-w-0 break-words text-sm">
          {person.phone || person.email ? (
            <>
              {person.phone && <span className="block">{person.phone}</span>}
              {person.email && <span className="block">{person.email}</span>}
            </>
          ) : (
            <span className="text-ink-muted">No phone or email</span>
          )}
        </div>
        <div className="text-sm">
          {finished ? 'Finished' : 'Taken'}
          <span className="text-ink-muted">
            {' '}
            {date.format(new Date(finished && claim.completedAt ? claim.completedAt : claim.claimedAt))}
          </span>
        </div>
      </div>

      {setStatus.error && (
        <div className="mt-2">
          <Notice>{errorMessage(setStatus.error)}</Notice>
        </div>
      )}

      {mode === 'view' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {finished ? (
            <Button variant="secondary" busy={setStatus.isPending} onClick={() => change('claimed')}>
              Undo finished
            </Button>
          ) : (
            <Button variant="secondary" busy={setStatus.isPending} onClick={() => change('completed')}>
              Mark finished
            </Button>
          )}
          <Button variant="quiet" onClick={() => setMode('edit')}>
            Edit details
          </Button>
          <Button variant="quiet" onClick={() => setMode('release')}>
            Release
          </Button>
        </div>
      )}
      {mode === 'release' && (
        <div className="mt-3 max-w-prose border-l-4 border-error bg-surface p-4">
          <p>
            Release {masechta.en} from {person.name}? It will be open for someone else to take. They are not told.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" busy={setStatus.isPending} onClick={() => change('released')}>
              Release {masechta.en}
            </Button>
            <Button variant="secondary" onClick={() => setMode('view')}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {mode === 'edit' && <EditPerson campaignId={campaignId} claim={claim} onClose={() => setMode('view')} />}
    </li>
  );
}

/** Who has what: every held masechta, with the person's real name and contact details. */
export function ClaimsTable({ campaign }: { campaign: CampaignDto }) {
  const { data: claims, error, isPending } = useClaims(campaign.id);
  const [status, setStatus] = useState<'all' | 'taken' | 'finished'>('all');
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (claims ?? []).filter(
      (claim) =>
        (status === 'all' || claim.status === status) &&
        (term === '' || claim.participant.name.toLowerCase().includes(term)),
    );
  }, [claims, status, search]);

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (error) return <Notice>{errorMessage(error)}</Notice>;
  if (!claims || claims.length === 0) {
    return (
      <p className="max-w-prose text-ink-muted">
        Nobody has taken a masechta yet. Share the link or hang the sign, or assign masechtos yourself below.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-64">
          <label htmlFor="claim-search" className="mb-1 block font-semibold">
            Search by name
          </label>
          <Input id="claim-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="claim-status" className="mb-1 block font-semibold">
            Show
          </label>
          <select
            id="claim-status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">Taken and finished</option>
            <option value="taken">Taken, not finished</option>
            <option value="finished">Finished</option>
          </select>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 hidden gap-x-4 border-b border-line-strong pb-1 text-sm text-ink-muted md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]"
      >
        <span>Masechta</span>
        <span>Name</span>
        <span>Phone and email</span>
        <span>Status</span>
      </div>
      <ul className="mt-4 border-t border-line md:mt-0 md:border-t-0" aria-label="Masechtos taken">
        {shown.map((claim) => (
          <ClaimRow key={claim.id} campaignId={campaign.id} claim={claim} />
        ))}
      </ul>
      {shown.length === 0 && <p className="py-4 text-ink-muted">Nothing matches. Clear the search or change the filter.</p>}
      <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
        Showing {shown.length} of {claims.length}
      </p>
    </>
  );
}

/** The masechtos nobody holds, by seder. */
export function OpenMasechtos({ campaign }: { campaign: CampaignDto }) {
  const { data: claims } = useClaims(campaign.id);
  if (!claims) return <Skeleton className="h-20 w-full" />;
  const held = new Set(claims.map((claim) => claim.masechtaId));
  const groups = SHAS.map((seder) => ({ seder, open: seder.masechtos.filter((m) => !held.has(m.id)) })).filter(
    (group) => group.open.length > 0,
  );
  if (groups.length === 0) return <p>Every masechta has been taken.</p>;
  return (
    <dl className="max-w-prose space-y-2">
      {groups.map(({ seder, open }) => (
        <div key={seder.id}>
          <dt className="font-semibold">{seder.en}</dt>
          <dd className="text-ink-muted">{open.map((m) => m.en).join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Assign several open masechtos to one person, for copying over a paper chart. */
export function AssignMasechtos({ campaign }: { campaign: CampaignDto }) {
  const { data: claims } = useClaims(campaign.id);
  const assign = useAssign(campaign.id);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ParticipantValues>(emptyParticipant);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const held = useMemo(() => new Set((claims ?? []).map((claim) => claim.masechtaId)), [claims]);
  const selected = picked.filter((id) => !held.has(id));
  const errors = fieldErrors(assign.error);

  if (!open) {
    return (
      <>
        {done && (
          <div className="mb-3 max-w-prose">
            <Notice tone="info">{done}</Notice>
          </div>
        )}
        <p className="max-w-prose text-ink-muted">
          For someone without a phone, or to copy over an existing paper chart. Contact details are optional.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          Assign masechtos
        </Button>
      </>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    assign.mutate(
      { ...values, masechtaIds: selected },
      {
        onSuccess: () => {
          setDone(`Assigned ${selected.map((id) => getMasechta(id)?.en).join(', ')} to ${values.name.trim()}.`);
          setValues(emptyParticipant);
          setPicked([]);
          setOpen(false);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'conflict') {
            const taken = (error.extra.conflicts as string[] | undefined) ?? [];
            setPicked(selected.filter((id) => !taken.includes(id)));
          }
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="max-w-[35rem]">
        <ParticipantFields values={values} onChange={setValues} errors={errors} nameLabel="Their name" organizer />
      </div>

      <fieldset>
        <legend className="font-semibold">Masechtos to assign</legend>
        <p className="text-sm text-ink-muted">Only masechtos that are still open are listed.</p>
        {SHAS.map((seder) => {
          const available = seder.masechtos.filter((m) => !held.has(m.id));
          if (available.length === 0) return null;
          return (
            <div key={seder.id} className="mt-3">
              <p className="border-b border-line pb-1 text-sm text-ink-muted">{seder.en}</p>
              <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {available.map((masechta) => (
                  <Checkbox
                    key={masechta.id}
                    label={masechta.en}
                    checked={selected.includes(masechta.id)}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...selected, masechta.id] : selected.filter((id) => id !== masechta.id))
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </fieldset>

      {errors.masechtaIds && <Notice>{errors.masechtaIds}</Notice>}
      {assign.error && Object.keys(errors).length === 0 && <Notice>{errorMessage(assign.error)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={assign.isPending}>
          {selected.length > 1 ? `Assign ${selected.length} masechtos` : 'Assign masechta'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            assign.reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
