import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useCurrentUser, useSetCurrentUser } from '../lib/auth';
import { cx } from '../lib/cx';
import { Button, Notice, Skeleton } from './ui';

/** A centered column. `narrow` is the single-column reading width used on phones and forms. */
export function Page({ narrow, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return (
    <main className={cx('mx-auto w-full px-4 py-6 sm:px-6 sm:py-8', narrow ? 'max-w-[35rem]' : 'max-w-5xl', className)}>
      {children}
    </main>
  );
}

/** Organizer pages: a plain top bar, and a redirect to /login for anyone signed out. */
export function OrganizerLayout() {
  const { user, isLoading, error } = useCurrentUser();
  const setUser = useSetCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      setUser(null);
      navigate('/login', { replace: true });
    },
  });

  if (isLoading) {
    return (
      <Page>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
      </Page>
    );
  }
  if (error) {
    return (
      <Page narrow>
        <Notice>Could not check your login. Reload the page to try again.</Notice>
      </Page>
    );
  }
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4 sm:px-6">
          <Link to="/campaigns" className="flex min-h-11 items-center font-semibold">
            Mishnayos chart
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden min-w-0 truncate text-sm text-ink-muted sm:block">{user.email}</span>
            <Button variant="quiet" busy={logout.isPending} onClick={() => logout.mutate()}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
