import type { MessageSender, SendRequest } from './types';

/** Delivers nothing. The message is already recorded in `outbound_messages`, which is the dev outbox. */
export class MockSender implements MessageSender {
  async send(message: SendRequest): Promise<{ providerId: string }> {
    console.log(`[mock ${message.channel}] to ${message.to}: ${message.subject ?? message.body.slice(0, 60)}`);
    return { providerId: `mock-${crypto.randomUUID()}` };
  }
}

export function getSender(env: Pick<Env, 'MESSAGING_MODE'>): MessageSender {
  switch (env.MESSAGING_MODE) {
    case 'mock':
      return new MockSender();
    default:
      // docs/messaging-providers.md explains how to add a real adapter here.
      throw new Error(`No message sender for MESSAGING_MODE "${env.MESSAGING_MODE}"`);
  }
}
