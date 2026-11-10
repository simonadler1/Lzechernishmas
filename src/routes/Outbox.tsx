import { useQuery } from '@tanstack/react-query';
import { Page } from '../components/layout';
import { Notice, PageHeading, Skeleton } from '../components/ui';
import { ApiError, api } from '../lib/api';

interface OutboxMessage {
  id: string;
  channel: 'sms' | 'email';
  to: string;
  template: string;
  subject: string | null;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
}

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

/** Turns the URLs in a message into links, so a tester can follow them. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="mt-2 whitespace-pre-wrap" dir="auto">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="text-link break-all">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export default function Outbox() {
  const { data, error, isPending } = useQuery({
    queryKey: ['outbox'],
    queryFn: () => api.get<{ messages: OutboxMessage[] }>('/api/dev/outbox'),
    refetchInterval: 3000,
    retry: false,
  });

  return (
    <Page>
      <PageHeading>Test outbox</PageHeading>
      <p className="mt-2 max-w-prose text-ink-muted">
        Nothing is delivered yet. Every text message and email the app would send is listed here, newest first. Login
        codes appear here too.
      </p>

      <div className="mt-6">
        {isPending && <Skeleton className="h-24 w-full" />}
        {error && (
          <Notice>
            {error instanceof ApiError && error.status === 404
              ? 'The test outbox is switched off on this site.'
              : 'Could not load the outbox. It will try again shortly.'}
          </Notice>
        )}
        {data && data.messages.length === 0 && (
          <p className="border-y border-line py-6">No messages yet. Ask for a login code and it will show up here.</p>
        )}
        {data && data.messages.length > 0 && (
          <ul className="border-t border-line">
            {data.messages.map((message) => (
              <li key={message.id} className="border-b border-line py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-semibold">{message.channel === 'sms' ? 'Text message' : 'Email'}</span>
                  <span className="break-all">to {message.to}</span>
                  <span className="text-sm text-ink-muted">{message.template}</span>
                  <span className={message.status === 'sent' ? 'text-sm text-ink-muted' : 'text-sm font-semibold text-error'}>
                    {message.status}
                  </span>
                  <time data-volatile className="text-sm text-ink-muted" dateTime={message.createdAt}>
                    {time.format(new Date(message.createdAt))}
                  </time>
                </div>
                {message.subject && (
                  <p className="mt-2 font-semibold" dir="auto">
                    {message.subject}
                  </p>
                )}
                <Body text={message.body} />
                {message.error && <p className="mt-2 text-sm text-error">{message.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
