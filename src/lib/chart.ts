import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChartEntry,
  ClaimCreatedResponse,
  MineResponse,
  PublicChartResponse,
} from '../../shared/api-types';
import type { PublicClaimInput } from '../../shared/schemas';
import { api } from './api';

export type MasechtaState = 'open' | 'selected' | 'taken' | 'finished';

const chartKey = (slug: string) => ['chart', slug] as const;
const mineKey = (slug: string) => ['mine', slug] as const;

/** The shared chart. It refreshes itself, so two people in two shuls see each other's choices. */
export function usePublicChart(slug: string) {
  return useQuery({
    queryKey: chartKey(slug),
    queryFn: () => api.get<PublicChartResponse>(`/api/public/campaigns/${slug}`),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}

/** What this phone remembers for this campaign. */
export function useMine(slug: string) {
  return useQuery({
    queryKey: mineKey(slug),
    queryFn: () => api.get<MineResponse>(`/api/public/campaigns/${slug}/mine`),
    staleTime: 0,
    retry: false,
  });
}

export function useRefreshChart(slug: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: chartKey(slug) }),
      client.invalidateQueries({ queryKey: mineKey(slug) }),
    ]);
}

export function useTakeMasechtos(slug: string) {
  const refresh = useRefreshChart(slug);
  return useMutation({
    mutationFn: (input: PublicClaimInput) =>
      api.post<ClaimCreatedResponse>(`/api/public/campaigns/${slug}/claims`, input),
    // Refresh after a conflict too, so the chart shows what was just taken.
    onSettled: () => void refresh(),
  });
}

export function useForgetDevice(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/api/public/campaigns/${slug}/mine`),
    onSuccess: () => client.setQueryData<MineResponse>(mineKey(slug), { submissions: [] }),
  });
}

export function entriesById(entries: ChartEntry[]): Map<string, ChartEntry> {
  return new Map(entries.map((entry) => [entry.masechtaId, entry]));
}
