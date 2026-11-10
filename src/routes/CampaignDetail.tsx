import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { CampaignDto } from '../../shared/api-types';
import { formatLongDate } from '../../shared/dates';
import { DEDICATION_LABELS } from '../../shared/dedication';
import { hebrewDate } from '../../shared/hebrew-date';
import { CampaignForm } from '../components/CampaignForm';
import { ContactsSection } from '../components/ContactsSection';
import { AssignMasechtos, ClaimsTable, OpenMasechtos } from '../components/ClaimsSection';
import { Page } from '../components/layout';
import { ProgressBar } from '../components/ProgressBar';
import { Button, ButtonLink, CopyButton, Hebrew, Notice, Skeleton } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { STATUS_LABELS, publicLink, useCampaign, useCampaignAction, useUpdateCampaign } from '../lib/campaigns';

/** A titled block of the campaign page. Later sections (claims, contacts) are added the same way. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Share({ campaign }: { campaign: CampaignDto }) {
  const link = publicLink(campaign.slug);
  if (campaign.status === 'draft') {
    return <p className="max-w-prose text-ink-muted">Activate the campaign to get its link and printable sign.</p>;
  }
  return (
    <div className="max-w-prose">
      <p className="text-ink-muted">
        {campaign.status === 'archived'
          ? 'This campaign is archived, so its link no longer opens the chart.'
          : 'Anyone with this link can see the chart and take a masechta. No account is needed.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={link} className="text-link flex min-h-11 min-w-0 items-center break-all" data-testid="public-link">
          {link}
        </a>
        <CopyButton text={link} />
      </div>
      {campaign.status !== 'archived' && (
        <ButtonLink to={`/campaigns/${campaign.id}/sign`} variant="secondary" className="mt-3">
          Printable sign with QR code
        </ButtonLink>
      )}
    </div>
  );
}

function Details({ campaign }: { campaign: CampaignDto }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateCampaign(campaign.id);

  if (editing) {
    return (
      <div className="max-w-[35rem]">
        <CampaignForm
          campaign={campaign}
          submitLabel="Save changes"
          busy={update.isPending}
          error={update.error}
          onSubmit={(input) => update.mutate(input, { onSuccess: () => setEditing(false) })}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const rows: [string, ReactNode][] = [
    ['Title', campaign.title],
    ['Name in English', campaign.honoreeNameEn ?? 'Not given'],
    ['The learning is', DEDICATION_LABELS[campaign.dedicationType]],
    [
      'Target date',
      <>
        {formatLongDate(campaign.endDate)}, <Hebrew>{hebrewDate(campaign.endDate)}</Hebrew>
      </>,
    ],
    ['Timezone', campaign.timezone.replace(/_/g, ' ')],
    ['Information for participants', campaign.message ? <span dir="auto">{campaign.message}</span> : 'None'],
  ];

  return (
    <>
      <dl className="grid max-w-prose gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="mb-2 min-w-0 whitespace-pre-wrap sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>
      {campaign.status !== 'archived' && (
        <Button variant="secondary" className="mt-4" onClick={() => setEditing(true)}>
          Edit campaign details
        </Button>
      )}
    </>
  );
}

function Status({ campaign }: { campaign: CampaignDto }) {
  const activate = useCampaignAction(campaign.id, 'activate');
  const archive = useCampaignAction(campaign.id, 'archive');
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const explain: Record<CampaignDto['status'], string> = {
    draft: 'Only you can see this campaign. Activate it when the details are right, and people can start taking masechtos.',
    active: 'The chart is open. People can take masechtos from the link or the sign.',
    completed: 'All 63 masechtos are finished.',
    archived: 'This campaign is archived. Its chart is no longer public.',
  };

  return (
    <div className="max-w-prose">
      <p>{explain[campaign.status]}</p>
      {(activate.error || archive.error) && (
        <div className="mt-3">
          <Notice>{errorMessage(activate.error ?? archive.error)}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {campaign.status === 'draft' && (
          <Button busy={activate.isPending} onClick={() => activate.mutate()}>
            Activate campaign
          </Button>
        )}
        {campaign.status !== 'archived' && !confirmingArchive && (
          <Button variant="secondary" onClick={() => setConfirmingArchive(true)}>
            Archive campaign
          </Button>
        )}
      </div>
      {confirmingArchive && campaign.status !== 'archived' && (
        <div className="mt-4 border-l-4 border-error bg-surface p-4">
          <p>
            Archiving takes the chart offline for everyone, including people who already took a masechta. It cannot be
            undone here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" busy={archive.isPending} onClick={() => archive.mutate()}>
              Archive campaign
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingArchive(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignDetail() {
  const { id = '' } = useParams();
  const { data: campaign, error, isPending } = useCampaign(id);

  if (isPending) {
    return (
      <Page>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Page>
    );
  }
  if (error || !campaign) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Page narrow>
        <Notice>{missing ? 'This campaign does not exist, or it belongs to another account.' : errorMessage(error)}</Notice>
        <p className="mt-4">
          <Link to="/campaigns" className="text-link">
            Back to your campaigns
          </Link>
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <p>
        <Link to="/campaigns" className="text-link">
          Your campaigns
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="min-w-0">
          <Hebrew className="block text-2xl font-bold">{campaign.honoreeNameHe}</Hebrew>
        </h1>
        <p className="text-ink-muted">{STATUS_LABELS[campaign.status]}</p>
      </div>
      <p className="mt-1 text-lg">{campaign.title}</p>

      <div className="mt-6 max-w-prose">
        <ProgressBar progress={campaign.progress} />
      </div>

      <Section title="Status">
        <Status campaign={campaign} />
      </Section>
      <Section title="Share">
        <Share campaign={campaign} />
      </Section>
      {(campaign.status === 'active' || campaign.status === 'completed') && (
        <>
          <Section title="Who has what">
            <ClaimsTable campaign={campaign} />
          </Section>
          {campaign.status === 'active' && (
            <>
              <Section title="Assign masechtos">
                <AssignMasechtos campaign={campaign} />
              </Section>
              <Section title="Still open">
                <OpenMasechtos campaign={campaign} />
              </Section>
            </>
          )}
        </>
      )}
      {(campaign.status === 'draft' || campaign.status === 'active') && (
        <Section title="Contacts and invitations">
          <ContactsSection campaign={campaign} />
        </Section>
      )}
      <Section title="Details">
        <Details campaign={campaign} />
      </Section>
    </Page>
  );
}
