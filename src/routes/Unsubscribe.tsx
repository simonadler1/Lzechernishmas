import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { Button, Notice, Skeleton } from '../components/ui';
import { ApiError, api, errorMessage } from '../lib/api';

interface OptOut {
  channel: 'sms' | 'email';
  address: string;
  optedOut: boolean;
}

export default function Unsubscribe() {
  const { token = '' } = useParams();
  const { data, error, isPending } = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => api.get<OptOut>(`/api/unsubscribe/${token}`),
    retry: false,
  });
  const confirm = useMutation({ mutationFn: () => api.post<OptOut>(`/api/unsubscribe/${token}`) });

  const shell = (children: ReactNode) => (
    <main className="mx-auto w-full max-w-[35rem] px-4 py-12">{children}</main>
  );

  if (isPending) return shell(<Skeleton className="h-32 w-full" />);
  if (error || !data) {
    const invalid = error instanceof ApiError && error.status === 404;
    return shell(
      <>
        <h1 className="text-xl font-semibold">{invalid ? 'This link does not work' : 'This page could not be loaded'}</h1>
        <p className="mt-2 text-ink-muted">
          {invalid
            ? 'It may have been cut short when it was copied. Open it again from the message you received.'
            : 'Check your connection, then reload the page.'}
        </p>
      </>,
    );
  }

  const kind = data.channel === 'sms' ? 'text messages' : 'emails';
  const done = data.optedOut || confirm.data?.optedOut;

  return shell(
    done ? (
      <>
        <h1 className="text-xl font-semibold">Stopped</h1>
        <p className="mt-2">
          <span className="font-semibold break-all">{data.address}</span> will not get any more {kind} about mishnayos
          campaigns from this site.
        </p>
        <p className="mt-2 text-ink-muted">
          Any masechta you took is still yours. Codes you ask for yourself, to sign in, are still sent.
        </p>
      </>
    ) : (
      <>
        <h1 className="text-xl font-semibold">Stop {kind}?</h1>
        <p className="mt-2">
          <span className="font-semibold break-all">{data.address}</span> will stop getting invitations, confirmations
          and reminders about mishnayos campaigns from this site.
        </p>
        <p className="mt-2 text-ink-muted">
          Any masechta you took stays yours. Codes you ask for yourself, to sign in, are still sent.
        </p>
        {confirm.error && (
          <div className="mt-4">
            <Notice>{errorMessage(confirm.error)}</Notice>
          </div>
        )}
        <Button className="mt-6 w-full sm:w-auto" busy={confirm.isPending} onClick={() => confirm.mutate()}>
          Stop these {kind}
        </Button>
      </>
    ),
  );
}
