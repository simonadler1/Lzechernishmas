import { useNavigate } from 'react-router';
import { CampaignForm } from '../components/CampaignForm';
import { Page } from '../components/layout';
import { PageHeading } from '../components/ui';
import { useCreateCampaign } from '../lib/campaigns';

export default function CampaignNew() {
  const navigate = useNavigate();
  const create = useCreateCampaign();

  return (
    <Page narrow>
      <PageHeading>New campaign</PageHeading>
      <p className="mt-2 text-ink-muted">
        It starts as a draft that only you can see. You can change everything here later.
      </p>
      <div className="mt-6">
        <CampaignForm
          submitLabel="Create campaign"
          busy={create.isPending}
          error={create.error}
          onSubmit={(input) =>
            create.mutate(input, { onSuccess: (campaign) => navigate(`/campaigns/${campaign.id}`, { replace: true }) })
          }
          onCancel={() => navigate('/campaigns')}
        />
      </div>
    </Page>
  );
}
