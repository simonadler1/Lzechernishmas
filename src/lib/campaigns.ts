import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CampaignDto, CampaignStatus } from '../../shared/api-types';
import type { CampaignInput } from '../../shared/schemas';
import { api } from './api';

export const campaignKey = (id: string) => ['campaigns', id] as const;

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => (await api.get<{ campaigns: CampaignDto[] }>('/api/campaigns')).campaigns,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKey(id),
    queryFn: async () => (await api.get<{ campaign: CampaignDto }>(`/api/campaigns/${id}`)).campaign,
    retry: false,
  });
}

/** Stores a campaign returned by a write, so every screen showing it updates. */
function useStoreCampaign() {
  const client = useQueryClient();
  return ({ campaign }: { campaign: CampaignDto }) => {
    client.setQueryData(campaignKey(campaign.id), campaign);
    void client.invalidateQueries({ queryKey: ['campaigns'], exact: true });
    return campaign;
  };
}

export function useCreateCampaign() {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async (input: CampaignInput) => store(await api.post<{ campaign: CampaignDto }>('/api/campaigns', input)),
  });
}

export function useUpdateCampaign(id: string) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async (input: Partial<CampaignInput>) =>
      store(await api.patch<{ campaign: CampaignDto }>(`/api/campaigns/${id}`, input)),
  });
}

export function useCampaignAction(id: string, action: 'activate' | 'archive') {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async () => store(await api.post<{ campaign: CampaignDto }>(`/api/campaigns/${id}/${action}`)),
  });
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Finished',
  archived: 'Archived',
};

export const publicLink = (slug: string) => `${window.location.origin}/c/${slug}`;
