import { getSender } from './senders';
import type { Channel, DispatchStatus, MessageSender, OutboundMessage, Template } from './types';

/** These carry a code someone just asked for, so an opt-out does not block them. */
const ALWAYS_DELIVERED: readonly Template[] = ['login_code', 'participant_code'];

export function chooseChannel(person: {
  phone?: string | null;
  email?: string | null;
}): { channel: Channel; address: string } | null {
  if (person.phone) return { channel: 'sms', address: person.phone };
  if (person.email) return { channel: 'email', address: person.email };
  return null;
}

export async function isOptedOut(env: Pick<Env, 'DB'>, channel: Channel, address: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM opt_outs WHERE channel = ? AND address = ?')
    .bind(channel, address)
    .first();
  return row !== null;
}

/**
 * The only function that may call a sender.
 *
 * The row is inserted before sending. If the Worker dies mid-send, a retry with
 * the same dedupe key finds the row and does not send a second time.
 */
export async function dispatch(
  env: Pick<Env, 'DB' | 'MESSAGING_MODE'>,
  message: OutboundMessage,
  sender?: MessageSender,
): Promise<DispatchStatus> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const suppressed =
    !ALWAYS_DELIVERED.includes(message.template) && (await isOptedOut(env, message.channel, message.to));

  const inserted = await env.DB.prepare(
    `INSERT INTO outbound_messages (id, campaign_id, channel, to_address, template, subject, body, status, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING`,
  )
    .bind(
      id,
      message.campaignId ?? null,
      message.channel,
      message.to,
      message.template,
      message.subject ?? null,
      message.body,
      suppressed ? 'suppressed' : 'queued',
      message.dedupeKey ?? null,
      createdAt,
    )
    .run();

  if (inserted.meta.changes === 0) return 'duplicate';
  if (suppressed) return 'suppressed';

  try {
    const { providerId } = await (sender ?? getSender(env)).send({
      channel: message.channel,
      to: message.to,
      subject: message.subject,
      body: message.body,
    });
    await env.DB.prepare(`UPDATE outbound_messages SET status = 'sent', provider_id = ?, sent_at = ? WHERE id = ?`)
      .bind(providerId, new Date().toISOString(), id)
      .run();
    return 'sent';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Message ${id} (${message.template}) failed: ${reason}`);
    await env.DB.prepare(`UPDATE outbound_messages SET status = 'failed', error = ? WHERE id = ?`)
      .bind(reason.slice(0, 500), id)
      .run();
    return 'failed';
  }
}
