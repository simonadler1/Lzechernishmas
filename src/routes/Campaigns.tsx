import { Link } from 'react-router';
import { formatLongDate } from '../../shared/dates';
import { Page } from '../components/layout';
import { ProgressBar } from '../components/ProgressBar';
import { ButtonLink, CampaignTitle, Notice, PageHeading, Skeleton } from '../components/ui';
import { errorMessage } from '../lib/api';
import { STATUS_LABELS, useCampaigns } from '../lib/campaigns';

export default function Campaigns() {
  const { data: campaigns, error, isPending } = useCampaigns();

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading>Your campaigns</PageHeading>
        {campaigns && campaigns.length > 0 && <ButtonLink to="/campaigns/new">New campaign</ButtonLink>}
      </div>

      <div className="mt-6">
        {isPending && (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        )}
        {error && <Notice>{errorMessage(error)}</Notice>}

        {campaigns && campaigns.length === 0 && (
          <div className="max-w-prose border-y border-line py-8">
            <p>
              A campaign is one shared chart of all 63 masechtos. People take a masechta from a link or a QR sign, and
              everyone sees what is still open.
            </p>
            <ButtonLink to="/campaigns/new" className="mt-4">
              Start a campaign
            </ButtonLink>
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  to={`/campaigns/${campaign.id}`}
                  className="block h-full rounded-control border border-line bg-surface p-4 hover:border-ink"
                >
                  <div className="flex items-start justify-between gap-3">
                    <CampaignTitle campaign={campaign} className="block min-w-0 text-xl font-bold" />
                    <span className="shrink-0 text-sm text-ink-muted">{STATUS_LABELS[campaign.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">Target date {formatLongDate(campaign.endDate)}</p>
                  <div className="mt-4">
                    <ProgressBar progress={campaign.progress} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
