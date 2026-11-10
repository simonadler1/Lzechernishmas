import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { CampaignDto, ContactDto, ContactRowResult, InvitationsResult } from '../../shared/api-types';
import { parseContactText, type ParsedContact } from '../../shared/contacts';
import { api, errorMessage } from '../lib/api';
import { Button, Checkbox, Field, Notice, Skeleton, TextAreaField } from './ui';

const contactsKey = (campaignId: string) => ['campaigns', campaignId, 'contacts'] as const;
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function useContacts(campaignId: string) {
  return useQuery({
    queryKey: contactsKey(campaignId),
    queryFn: async () => (await api.get<{ contacts: ContactDto[] }>(`/api/campaigns/${campaignId}/contacts`)).contacts,
  });
}

function useAddContacts(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ParsedContact[]) =>
      (await api.post<{ results: ContactRowResult[] }>(`/api/campaigns/${campaignId}/contacts`, { rows })).results,
    onSuccess: () => client.invalidateQueries({ queryKey: contactsKey(campaignId) }),
  });
}

const RESULT_LABEL: Record<ContactRowResult['status'], string> = {
  added: 'Added',
  duplicate: 'Already in your contacts',
  invalid: 'Not added',
};

function Results({ results }: { results: ContactRowResult[] }) {
  const added = results.filter((r) => r.status === 'added').length;
  const problems = results.map((result, index) => ({ result, line: index + 1 })).filter(({ result }) => result.status !== 'added');
  return (
    <div role="status" className="border-l-4 border-tekhelet bg-surface p-4">
      <p className="font-semibold">
        {added} of {results.length} added.
      </p>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map(({ result, line }) => (
            <li key={line}>
              Line {line}
              {result.name && <span dir="auto"> ({result.name})</span>}: {RESULT_LABEL[result.status]}.
              {result.status === 'invalid' && ` ${result.reason}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddContacts({ campaignId }: { campaignId: string }) {
  const add = useAddContacts(campaignId);
  const [mode, setMode] = useState<'one' | 'many'>('one');
  const [one, setOne] = useState({ name: '', phone: '', email: '' });
  const [text, setText] = useState('');

  const submitOne = (event: FormEvent) => {
    event.preventDefault();
    add.mutate([one], {
      onSuccess: (results) => {
        if (results[0]?.status === 'added') setOne({ name: '', phone: '', email: '' });
      },
    });
  };
  const submitMany = (event: FormEvent) => {
    event.preventDefault();
    const rows = parseContactText(text);
    if (rows.length === 0) return;
    add.mutate(rows, {
      onSuccess: (results) => {
        // Leave only the lines that still need fixing.
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        setText(lines.filter((_, i) => results[i]?.status === 'invalid').join('\n'));
      },
    });
  };
  const switchTo = (next: 'one' | 'many') => {
    add.reset();
    setMode(next);
  };
  const single = mode === 'one' ? add.data?.[0] : undefined;

  return (
    <div className="max-w-[35rem]">
      {mode === 'one' ? (
        <form onSubmit={submitOne} className="space-y-4" noValidate>
          <Field label="Contact's name" name="contact-name" autoComplete="off" dir="auto" value={one.name}
            onChange={(e) => setOne({ ...one, name: e.target.value })} />
          <Field label="Their phone" name="contact-phone" type="tel" inputMode="tel" autoComplete="off" value={one.phone}
            onChange={(e) => setOne({ ...one, phone: e.target.value })} />
          <Field label="Their email" name="contact-email" type="email" inputMode="email" autoComplete="off"
            autoCapitalize="none" value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} />
          {single && single.status !== 'added' && (
            <Notice>
              {RESULT_LABEL[single.status]}. {single.status === 'invalid' && single.reason}
            </Notice>
          )}
          {single?.status === 'added' && <Notice tone="info">Added {single.name}.</Notice>}
          {add.error && <Notice>{errorMessage(add.error)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" busy={add.isPending}>
              Add contact
            </Button>
            <Button variant="quiet" onClick={() => switchTo('many')}>
              Paste a list instead
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitMany} className="space-y-4" noValidate>
          <TextAreaField
            label="Paste contacts"
            hint="One person per line: name, then phone and email in either order. One of the two is enough."
            name="contacts-text"
            className="min-h-40"
            dir="auto"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {add.data && <Results results={add.data} />}
          {add.error && <Notice>{errorMessage(add.error)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" busy={add.isPending}>
              Add contacts
            </Button>
            <Button variant="quiet" onClick={() => switchTo('one')}>
              Add one person instead
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Invite({ campaign, contacts, selected }: { campaign: CampaignDto; contacts: ContactDto[]; selected: string[] }) {
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const uninvited = contacts.filter((contact) => contact.invitedAt === null);
  const chosen = uninvited.filter((contact) => selected.includes(contact.id));
  const targets = chosen.length > 0 ? chosen : uninvited;

  const send = useMutation({
    mutationFn: () =>
      api.post<InvitationsResult>(`/api/campaigns/${campaign.id}/invitations`, {
        confirmedExpectation: confirmed,
        ...(chosen.length > 0 ? { contactIds: chosen.map((c) => c.id) } : {}),
      }),
    onSuccess: () => {
      setConfirmed(false);
      return client.invalidateQueries({ queryKey: contactsKey(campaign.id) });
    },
  });

  const sent = send.data && (
    <Notice tone="info">
      {send.data.sent} {send.data.sent === 1 ? 'invitation' : 'invitations'} sent.
      {send.data.suppressed > 0 && ` ${send.data.suppressed} not sent, because that person opted out of messages.`}
      {send.data.failed > 0 && ` ${send.data.failed} could not be sent. Try again later.`}
    </Notice>
  );

  if (campaign.status !== 'active') {
    return <p className="max-w-prose text-ink-muted">Activate the campaign to send invitations.</p>;
  }
  if (targets.length === 0) {
    return (
      <div className="max-w-prose space-y-3">
        {sent}
        <p className="text-ink-muted">Everyone on the list has been invited. Each person is invited only once.</p>
      </div>
    );
  }

  return (
    <div className="max-w-prose space-y-3">
      {sent}
      <p>
        {chosen.length > 0
          ? `${targets.length} selected ${targets.length === 1 ? 'person' : 'people'} will get one message with the link to the chart.`
          : `${targets.length} ${targets.length === 1 ? 'person has' : 'people have'} not been invited yet. Each will get one message with the link to the chart, by text if they have a phone number and otherwise by email.`}
      </p>
      <Checkbox
        label="These are people who would expect to hear from me about this campaign"
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
      />
      {send.error && <Notice>{errorMessage(send.error)}</Notice>}
      <Button busy={send.isPending} disabled={!confirmed} onClick={() => send.mutate()}>
        {targets.length === 1 ? 'Send 1 invitation' : `Send ${targets.length} invitations`}
      </Button>
    </div>
  );
}

/** People the organizer wants to invite: add them, see who was invited and who took a masechta, and invite. */
export function ContactsSection({ campaign }: { campaign: CampaignDto }) {
  const client = useQueryClient();
  const { data: contacts, error, isPending } = useContacts(campaign.id);
  const [selected, setSelected] = useState<string[]>([]);
  const remove = useMutation({
    mutationFn: (contactId: string) => api.delete(`/api/campaigns/${campaign.id}/contacts/${contactId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: contactsKey(campaign.id) }),
  });

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (error || !contacts) return <Notice>{errorMessage(error)}</Notice>;

  const columns = 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto]';

  return (
    <div className="space-y-6">
      {contacts.length === 0 ? (
        <p className="max-w-prose text-ink-muted">
          Add the people you want to invite. They get one message with the link, and nothing more unless they take a
          masechta.
        </p>
      ) : (
        <div>
          <div aria-hidden="true" className={`hidden gap-x-4 border-b border-line-strong pb-1 text-sm text-ink-muted md:grid ${columns}`}>
            <span>Name</span>
            <span>Phone and email</span>
            <span>Invited</span>
            <span className="w-24" />
          </div>
          <ul className="border-t border-line md:border-t-0" aria-label="Contacts">
            {contacts.map((contact) => (
              <li key={contact.id} className={`grid items-center gap-x-4 gap-y-1 border-b border-line py-2 ${columns}`}>
                <div className="min-w-0">
                  {contact.invitedAt === null ? (
                    <Checkbox
                      label={<span dir="auto">{contact.name}</span>}
                      checked={selected.includes(contact.id)}
                      onChange={(e) =>
                        setSelected(e.target.checked ? [...selected, contact.id] : selected.filter((id) => id !== contact.id))
                      }
                    />
                  ) : (
                    <span dir="auto">{contact.name}</span>
                  )}
                </div>
                <div className="min-w-0 break-words text-sm">
                  {contact.phone && <span className="block">{contact.phone}</span>}
                  {contact.email && <span className="block">{contact.email}</span>}
                </div>
                <div className="text-sm">
                  {contact.invitedAt ? `Invited ${date.format(new Date(contact.invitedAt))}` : 'Not invited yet'}
                  {contact.hasTaken && <span className="block font-semibold">Took a masechta</span>}
                </div>
                <Button variant="quiet" className="-ml-4 justify-self-start md:ml-0" busy={remove.isPending && remove.variables === contact.id}
                  onClick={() => remove.mutate(contact.id)} aria-label={`Remove ${contact.name}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {remove.error && (
            <div className="mt-2">
              <Notice>{errorMessage(remove.error)}</Notice>
            </div>
          )}
        </div>
      )}

      {contacts.length > 0 && (
        <div>
          <h3 className="font-semibold">Send invitations</h3>
          <div className="mt-2">
            <Invite campaign={campaign} contacts={contacts} selected={selected} />
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold">Add contacts</h3>
        <div className="mt-2">
          <AddContacts campaignId={campaign.id} />
        </div>
      </div>
    </div>
  );
}
