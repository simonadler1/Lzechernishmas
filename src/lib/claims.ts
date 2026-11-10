import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganizerClaim } from '../../shared/api-types';
import type { ParticipantValues } from '../components/ParticipantFields';
import { api } from './api';
import { campaignKey } from './campaigns';

const claimsKey = (campaignId: string) => ['campaigns', campaignId, 'claims'] as const;

export function useClaims(campaignId: string) {
  return useQuery({
    queryKey: claimsKey(campaignId),
    queryFn: async () => (await api.get<{ claims: OrganizerClaim[] }>(`/api/campaigns/${campaignId}/claims`)).claims,
    refetchInterval: 30_000,
  });
}

/** Refreshes everything a claim change can affect: the table, the progress and the campaign's status. */
function useRefresh(campaignId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: claimsKey(campaignId) }),
      client.invalidateQueries({ queryKey: campaignKey(campaignId), exact: true }),
      client.invalidateQueries({ queryKey: ['campaigns'], exact: true }),
    ]);
}

export function useSetClaimStatus(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ claimId, status }: { claimId: string; status: 'claimed' | 'completed' | 'released' }) =>
      api.patch(`/api/campaigns/${campaignId}/claims/${claimId}`, { status }),
    onSettled: refresh,
  });
}

export function useAssign(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: (input: ParticipantValues & { masechtaIds: string[] }) =>
      api.post<{ notified: boolean }>(`/api/campaigns/${campaignId}/claims`, input),
    onSettled: refresh,
  });
}

export function useEditParticipant(campaignId: string) {
  const refresh = useRefresh(campaignId);
  return useMutation({
    mutationFn: ({ participantId, values }: { participantId: string; values: ParticipantValues }) =>
      api.patch(`/api/campaigns/${campaignId}/participants/${participantId}`, values),
    onSuccess: refresh,
  });
}
