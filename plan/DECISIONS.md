# Decisions

Choices made during planning, with the reason and the cost of reversing each. Rows marked **Confirmed** were decided by the human. The human can override the others; the earlier the cheaper.

| Decision | Why | Cost to change later |
| --- | --- | --- |
| **Confirmed:** claim by masechta | How the owner wants people to sign up. | High: the unit is in the schema and chart UI. |
| **Confirmed:** reminders go to the people who signed up | Owner's decision. Contacts and the organizer get none. | Low. |
| **Confirmed:** participants have no accounts, only an identifier saying who is learning; each submission gets a private signed link | Someone scanning a sign in shul will abandon a signup. | Medium. |
| **Confirmed:** public signup requires only a name; phone and email are optional | Owner's decision, so people without a phone or who prefer not to share one can still take a masechta. They get no reminders and cannot recover a lost link. | Low: one validation rule. |
| **Confirmed:** participants can sign back in with a code sent to the phone or email they gave | Owner's decision, so nobody has to keep the link. Requires real SMS and email before public launch. | Low. |
| Code sign-in replaces the "lost your link?" message | One way back is simpler than two, and a code lands the person on their page immediately. | Low. |
| Sign-in opens every submission with that address in the campaign, through a signed token over the address | The code proves they control the address, so grouping is safe here, unlike matching on a typed number. Reuses `/m/:token` and its routes. | Low. |
| **Confirmed:** participants can edit their name, contact details and anonymous setting from the my-portion page, and the organizer can edit them from the dashboard | Owner's decision. The organizer route covers people who gave only a name and lost their link. | Low. |
| Details are edited per submission, even when signed in | Two people can share a phone number, so one save must not rename both. | Low. |
| **Confirmed:** the same phone remembers the person, so rescanning the QR code shows their masechtos | Owner's decision. It is the only way back for name-only people that needs nothing saved. | Low. |
| Device memory uses a server-set `HttpOnly` cookie, not browser storage | Safari can clear script-written storage after 7 days without a visit, and campaigns run longer than that. | Low. |
| One participant row per submission, not per person | Matching on a typed phone number would let a stranger reach someone's existing portion. Reminders group by address instead. | Medium. |
| Manage and unsubscribe tokens are HMAC-derived, not stored | Reminders must re-send the link, which rules out one-way hashes, and this avoids storing live secrets. | Low. |
| Organizers log in with an emailed 6-digit code | No password storage or reset flow, and a code is easier than a magic link when switching devices. Requires real email before public launch. | Medium. |
| One channel per person per event, SMS first | Avoids double-messaging; SMS is the channel people read. | Low: one function. |
| Hold messages on Shabbos and Yom Tov | Expected by this audience. Sending only near 10:00 local avoids any need for zmanim. | Low. |
| Claims stay open after the end date | The goal is finishing Shas; auto-closing would strand it. | Low. |
| Single Worker serves API and SPA, with D1 | One deploy, and D1 unique indexes give the no-double-claim guarantee directly. | High. |
| **Confirmed:** device tests run in Chrome only, without Docker | Owner's decision. Phone sizes are emulated, screenshots are compared only on the Mac, and iPhone Safari is covered by the manual check in task 16. | Low: add a Playwright project. |
| Wrangler rather than the newer `cf` CLI | `cf` is still in beta, and Wrangler is the documented path for the Vite plugin and D1 migrations. | Medium: `cf migrate` exists. |
| One shared preview plus production, deployed from developers' machines through one script | Simple for a small team, and the script carries the safety checks. CI deploys and personal sandboxes can come later. | Low. |
| Preview sits behind Cloudflare Access | Its test outbox shows login codes and phone numbers. | Low. |
| **Confirmed:** Cloudflare project name is `lzecher-nishmas` | Owner's decision. | Low before the first deploy. |
| **Confirmed:** account and domain are undecided, and the project must be deployable to any Cloudflare account | Owner's decision. Account values sit only in `wrangler.jsonc`, `pnpm cf:setup` re-creates the resources, and `DEPLOYMENT.md` has a tested data move. | Low. |
| Buy the domain outside Cloudflare Registrar | A nameserver change is enough to move accounts, while a Registrar domain needs a manual transfer request. | Medium once bought. |
| **Confirmed:** one name field, in Hebrew or English, with an on-screen Hebrew keyboard | Owner's decision, to simplify the form; most users have no Hebrew keyboard. Text messages use the name as typed, so a Hebrew name makes them cost more segments. | Low. |
| **Confirmed:** no campaign title field; the organizer's pages show the dedication and the name, such as "L'ilui nishmas: Name" | Owner's decision, to shorten the form. | Low: add the field and column back. |
| **Confirmed:** no timezone input | Owner's decision. A new campaign silently takes the organizer's browser timezone, falling back to New York. A campaign created from outside Israel for people in Israel would follow the diaspora Yom Tov calendar and US phone format. | Low: add the field back. |
| Ashkenazi transliteration in English names | Matches how the product was described ("mishnayos", "Shabbos"). | Low: data file. |
