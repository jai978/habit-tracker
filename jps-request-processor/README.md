# JPS Client Request Processor

Turns messages clients send to the JPS Solutions Facebook Page into review-ready
implementation prompts for Lovable.

A client writes what they want in their own words, across however many messages
they feel like sending. This service works out whether that is a website change,
writes a precise implementation prompt, and shows it to you with a copy button.
**It never touches a client's website.** You read the prompt, you decide, you
paste it into Lovable.

```
Client messages the Facebook Page
        ↓  Meta webhook
Message stored (deduplicated by Facebook's message id)
        ↓  60s of silence from the client
The whole burst is read as one request
        ↓  client identity + site context + recent conversation
Classified: CHANGE_REQUEST / POSSIBLE_CHANGE / OTHER
        ↓  only when it is a real change
Lovable prompt generated
        ↓
Telegram alert + dashboard  →  you review  →  you paste into Lovable
```

> This project lives in a subdirectory of the `habit-tracker` repository and is
> entirely separate from the habit tracker app at the repository root. All
> commands below are run from `jps-request-processor/`.

## What it does and does not do

It reduces the reading and translating: consolidating a burst of messages into
one request, keeping the client's exact wording for phone numbers and addresses,
remembering what their site looks like, and flagging the requests that are too
vague to act on.

It does not modify Lovable projects, publish websites, reply to clients, make
decisions on your behalf, invent missing content, or infer a redesign from "can
you make the homepage better". When the model is not confident, the request is
held for clarification rather than presented as ready.

## Requirements

- Node 22.18 or newer. The service runs TypeScript directly, so there is no
  build step, and it uses Node's built-in SQLite, so there is nothing to compile.
- An Anthropic API key.
- A Meta app with the Messenger product, connected to the JPS Facebook Page.
- Optionally a Telegram bot, for alerts on your phone.

## Quick start

```sh
cd jps-request-processor
npm install
cp .env.example .env      # then fill it in — see below
npm test                  # 46 tests, no network needed
npm run dev
```

The dashboard is at `http://localhost:3000/dashboard?token=<DASHBOARD_TOKEN>`.

### Filling in `.env`

Only four values are strictly required to boot: `ANTHROPIC_API_KEY`,
`FB_VERIFY_TOKEN`, `FB_APP_SECRET` and `DASHBOARD_TOKEN`. Generate the two
secrets you invent yourself with `openssl rand -hex 32`.

Every setting is documented inline in `.env.example`. The ones worth a decision:

| Setting | Why you would change it |
| --- | --- |
| `MESSAGE_DEBOUNCE_MS` | How long a client must stop typing before their burst is treated as finished. 60s by default. |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` by default. Switch to `claude-opus-5` or `claude-sonnet-5` if a client's messages need more careful interpretation than Haiku gives. |
| `AI_EFFORT` | `low` through `max`. Ignored on Haiku models, which don't accept this parameter. |
| `CONFIDENCE_THRESHOLD` | Below this, a change request is held for clarification instead of marked ready. |
| `STORE_DRIVER` | `sqlite` (default) or `supabase` — see Deployment. |
| `NOTIFY_POSSIBLE_CHANGE` | Turn off if ambiguous messages are noisy on Telegram. |

## Connecting the Facebook Page

The service must be reachable over HTTPS before Meta will talk to it. Deploy
first (or use `ngrok http 3000` while you are testing), then:

1. In the Meta app dashboard, add the **Messenger** product and link the JPS
   Solutions Page.
2. Under **Webhooks**, set the callback URL to
   `https://your-host/webhooks/facebook` and the verify token to your
   `FB_VERIFY_TOKEN`. Meta calls the URL immediately; if the token matches you
   will see `webhook_subscribed` in the logs.
3. Subscribe the Page to the **`messages`** field. That is the only one needed.
4. Copy the **App Secret** into `FB_APP_SECRET`. Every delivery is verified
   against it, and unsigned deliveries are rejected.

`FB_PAGE_ACCESS_TOKEN` is not used by this version — nothing replies to clients.
It is in the config because replying is the obvious next step.

## Adding a client

A message is only interpreted when its Facebook sender id matches a client. You
will not know a client's sender id in advance, and that is fine — the first time
they message you, the request appears as **Unknown sender** with the id on it.
Add the client, or link the sender to an existing one, and the batch is
reinterpreted with their site context.

You can also add clients up front from the dashboard, or from the terminal:

```sh
npm run clients -- list
npm run clients -- add --name "ABC Roofing" --sender-id 1234567890 --url https://abcroofing.co.nz
npm run clients -- set-context <client-id> ./abc-roofing-context.md
```

### Site context is what makes the prompts good

The **site context** field is free text describing the client's website. It is
given to the model whenever that client messages, and it is the difference
between "add commercial roofing somewhere" and "add it to `/services`, matching
the existing service cards". Something like:

```
Business: ABC Roofing
Website: abcroofing.co.nz
Pages:
  /                          hero, services summary, gallery strip, contact form
  /about                     team photos and bios
  /services                  service cards, three across on desktop
  /services/residential-roofing
  /gallery
  /contact                   contact form (Formspree) — must keep working
Rules:
  - Preserve current branding and the green/charcoal palette.
  - Service pages all follow the same layout.
  - Hosted through Lovable.
```

**Standing instructions** is a separate field for constraints that apply to
every request from that client ("never change the booking form").

## Using it day to day

The dashboard lists every processed batch, newest first.

- **Change request** with status **NEW** — read the prompt, copy it, paste it
  into Lovable, then mark it Implemented.
- **Needs clarification** — the model was unsure, the client was vague, or a
  promised photo never arrived. Ask the client. The prompt is usually still
  there and becomes usable once you know the answer.
- **Unknown sender** — link them to a client.
- **No change requested** — recorded for the history; you are not notified.

Nothing changes status by itself. Statuses are `NEW`, `REVIEWED`,
`IMPLEMENTED`, `IGNORED`, `NEEDS_CLARIFICATION`.

**Failed batches** lists anything that ran out of retries — an Anthropic outage,
usually. The messages are still stored; **Retry** re-runs the analysis from
scratch. Messages are never dropped because a call failed.

## Deployment

Any host that runs a long-lived Node process works. The service needs to stay
running: the message-burst timer lives in the database and is checked every few
seconds, which is also why it does not fit serverless.

**With SQLite (simplest).** One process, one file, no database service. Needs a
persistent disk — a Fly.io volume, a small VPS, or a Railway volume. On a host
with an ephemeral filesystem the database disappears on every deploy.

```sh
docker build -t jps-requests .
docker run -p 3000:3000 --env-file .env -v jps-data:/app/data jps-requests
```

**With Supabase (when the disk is ephemeral).** Free tier is plenty. Run
`src/db/schema.sql` in the Supabase SQL editor, then set `STORE_DRIVER=supabase`,
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key bypasses row
level security and must stay server-side; the schema enables RLS with no
policies so the anon key cannot read client conversations.

Running costs are the host plus Anthropic usage. Each processed message batch is
one classification call, plus one prompt-generation call when it is a real
change request.

## Operating notes

**Duplicate deliveries.** Meta retries anything it does not get a fast 200 for.
Messages are deduplicated on Facebook's `mid` inside a single insert, so a retry
can never create a second message or a second request. The webhook answers
before doing the work for the same reason.

**Restarts.** A batch being analysed when the process stops is reclaimed on the
next start and processed again. A batch that fails is retried with exponential
backoff up to `MAX_PROCESSING_ATTEMPTS`, then parked in Failed batches and
announced on Telegram.

**Messages arriving mid-analysis.** They open a new batch rather than joining the
one being processed, so they become a second request instead of being lost.

**Logs** are one JSON object per line, with fixed event names —
`webhook_received`, `message_stored`, `message_batch_started`,
`client_identified`, `ai_processing_started`, `ai_processing_completed`,
`request_created`, `notification_sent`, `error`. Every stage carries `batch_id`,
so one request traces end to end with a single grep. Secrets are redacted before
anything is written.

## Security

API keys and tokens are read from the environment and never leave the server.
Meta deliveries are verified with HMAC-SHA256 against the raw request body.
Client message text is untrusted input: it is length-capped, stripped of control
characters, and escaped everywhere it is rendered. Structured model output is
validated before it is stored or displayed — a malformed response fails the
batch into the retry path rather than reaching the database.

The dashboard is protected by a single shared token, held in a
`SameSite=Strict`, `HttpOnly` cookie and required again in every form, so a
cross-site POST cannot act with the cookie alone. It is an internal tool for one
operator, not a multi-user system — put it behind your own network controls if
that changes. Both the webhook and the dashboard are rate limited.

## Tests

```sh
npm test        # 46 tests
npm run typecheck
```

`tests/acceptance.test.ts` is the PRD's acceptance list, run end to end through
the real pipeline with a scripted model: a thank-you produces no prompt, a phone
number change produces one naming the number, four rapid messages become one
request, vague dissatisfaction is escalated, an attached image is carried
through, an AI failure keeps the messages retryable, and a duplicated webhook
creates one record. The rest covers the webhook parser and signature checks, AI
output validation, notification formatting, and the HTTP surface including
signature enforcement and dashboard auth. Nothing in the suite touches a network.

## Where the pieces are

```
src/
  api/facebook-webhook.ts   Meta handshake, signature check, ingest
  api/dashboard.ts          Internal dashboard routes and auth
  api/views.ts              Server-rendered HTML
  services/facebook.ts      Signature verification, webhook parsing
  services/ai.ts            The only file that calls the model
  services/request-processor.ts  Ingest, debounce, classify, record, notify
  services/scheduler.ts     Poll loop that closes debounce windows
  services/client-context.ts     What the model is allowed to see
  services/notifications.ts Telegram
  prompts/                  Prompt text and output schema, no application logic
  db/                       Storage interface, SQLite and Supabase drivers
  utils/                    Logging, validation, escaping, rate limiting
```

Integrations are kept behind interfaces — `Store`, `AiService`, `Notifier` — so
a second message channel, another model, or a different database is a new file
rather than a rewrite.

## The line this version will not cross

The AI interprets; you decide. A missed automation costs a few minutes. A
misread request on a live client website costs a lot more. Once this has read
enough real messages accurately, the implementation side is the next thing to
automate — approval first, then Lovable, then a "done 👍" back to the client.
