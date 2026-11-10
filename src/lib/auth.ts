import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';

export interface User {
  id: string;
  email: string;
  name: string | null;
}

const ME = ['me'] as const;

/** The signed-in organizer, or null. `undefined` while the first check is running. */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: ME,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  return { user: query.data, isLoading: query.isPending, error: query.error };
}

export function useSetCurrentUser() {
  const client = useQueryClient();
  return (user: User | null) => {
    client.setQueryData(ME, user);
    if (!user) client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };
}
