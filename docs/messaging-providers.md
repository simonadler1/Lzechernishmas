# Going live with real text messages and email

Today every message is recorded in the test outbox and nothing is delivered (`MESSAGING_MODE=mock`). This is what has to happen before real campaigns.

Production cannot run in mock mode: organizers log in with an emailed code, and participants sign back in with a code, so nobody could get in. `pnpm deploy:production` refuses while `MESSAGING_MODE` is `mock`.

## How sending works

Everything goes through `dispatch()` in `worker/messaging/dispatch.ts`. It checks opt-outs, records the message in `outbound_messages`, then hands it to a `MessageSender`. A sender does one thing:

```ts
interface MessageSender {
  send(message: { channel: 'sms' | 'email'; to: string; subject?: string; body: string }): Promise<{ providerId: string }>;
}
```

It returns the provider's message id, or throws. A thrown error is recorded as `failed` with its message, and the dedupe key is released so a later attempt can retry.

## Adding a provider

1. Write a class in `worker/messaging/senders.ts` that implements `MessageSender` with the provider's HTTP API. Use `fetch`; Workers cannot run most Node SDKs. One class can cover both channels, or route `sms` and `email` to two providers.
2. Add a case for it in `getSender()` in the same file, keyed by a new `MESSAGING_MODE` value.
3. Put the provider's API keys in Wrangler secrets (`pnpm exec wrangler secret put NAME --config wrangler.jsonc --env production`), list them under `secrets.required` for each environment in `wrangler.jsonc`, and add them to `.dev.vars.example`.
4. Set `MESSAGING_MODE` to the new value for production in `wrangler.jsonc`. Keep preview on `mock` unless you want preview to send real messages.
5. Test the sender with a stubbed `fetch`: a success returns the provider id, and an error response throws.

No template, route or reminder code changes.

## Email

- Choose a transactional provider with an HTTP API.
- Send from an address on the campaign domain, and add the provider's SPF and DKIM records to the domain's DNS. Add a DMARC record. Without these, login codes land in spam.
- When the domain moves between Cloudflare accounts, these records move with the zone. See `docs/DEPLOYING.md`.
- Add a `List-Unsubscribe` header pointing at the unsubscribe link each email already carries. The sender needs that link, so pass it through `SendRequest` when you add this.

## Text messages

- Choose an SMS provider with an HTTP API.
- In the United States, register the brand and a campaign for A2P 10DLC before sending. Unregistered traffic is filtered by carriers. Registration takes days to weeks, so start early. Israel and other countries have their own sender rules; check them for each country you send to.
- Messages already end with "Reply STOP to opt out". The provider must deliver those replies to the app:
  - Add a route for the provider's inbound webhook, verify its signature, and on STOP insert `('sms', <number in E.164>)` into `opt_outs`. This is the same table the unsubscribe page writes to, and `dispatch()` already checks it. Handle START by deleting the row.
  - Most providers also block the number themselves after STOP. Keep `opt_outs` in step anyway, so the outbox shows `suppressed` instead of `failed`.
- Hebrew characters cut a text message to 70 characters per segment. The templates use the English name when the campaign has one, which is why the form asks for it.

## Consent

Participants type their own phone or email and are told on the form that they will get reminders and can opt out.

Contacts are different: the organizer supplies them. Before the first real invitation, have someone who knows messaging rules review this flow:

- The organizer must tick "These are people who would expect to hear from me about this campaign" before sending.
- Each contact gets one invitation and nothing else unless they take a masechta.
- Every invitation carries an opt-out.

Whether this is enough depends on the country and the provider's own policy. Text-message rules in particular often require prior consent from the recipient, which a tick by the organizer may not satisfy. If the review says no, send invitations by email only, or have organizers share the link themselves.

## Before switching on

- [ ] A real sender is written, tested and selected by `MESSAGING_MODE` in production.
- [ ] SPF, DKIM and DMARC pass for a test email to Gmail and Outlook.
- [ ] The SMS sender registration is approved.
- [ ] Replying STOP to a test message adds the number to `opt_outs`, and the next message to it is `suppressed`.
- [ ] The consent review for organizer-supplied contacts is done.
- [ ] A login code arrives within a few seconds, by email, on production.
