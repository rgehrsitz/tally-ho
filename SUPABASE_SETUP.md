# Supabase setup and Netlify preparation

Implementation is available locally. No live Supabase project was configured or
modified, and no Netlify site was created or deployed during this milestone.
The tests use the real SDK against a local HTTP protocol fixture; that does not
verify Supabase project configuration, real email delivery or hosted networking.

## 1. Choose a Supabase project

Use a project dedicated to this contest app. In Project Settings, copy its project
URL, publishable key, server secret key (or legacy service_role key), and database
connection string into an ignored local `.env`. Never paste secret values into
chat, commit them, or give them a `PUBLIC_` / `VITE_` prefix.

```dotenv
APP_MODE=supabase
EVENT_ID=halloween-demo
DATABASE_URL=postgresql://.../postgres?sslmode=verify-full
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-server-secret-key
SUPABASE_PHOTO_BUCKET=costume-photos
```

Use the database-owner connection for migrations and host provisioning. For
Netlify runtime use Supabase's **transaction-mode pooler** URL, with verified TLS
(`sslmode=verify-full`). The repository uses short-lived transactions, a pool of
three connections per function instance, and unnamed queries; it does not rely
on session-local state or prepared-statement names. Set a connection budget for
the Supabase project's size before live load testing.

**Database CA certificate.** Supabase's database certificates chain to Supabase's
own root CA, which Node does not trust by default, so `verify-full` fails with
"self-signed certificate in certificate chain" unless the CA is supplied. Download
it from Project Settings → Database → SSL Configuration, and set its PEM text as
`DATABASE_CA_CERT` (literal `\n` line breaks are accepted, which suits Netlify's
single-line env values). The app then verifies the chain and hostname with that CA.
`npm run build:netlify` warns when a Supabase `DATABASE_URL` has no CA set.

Put Netlify functions and the Supabase project in the same region. Each write
holds the event lock for about a dozen round trips, so latency between them sets
how quickly a burst of votes clears.

The publishable key is used only with Auth. The separate secret key is used only
for private Storage access, without session persistence. No keys or user/session
objects are returned in guest/host party projections. Browser Auth cookies are
HttpOnly, SameSite=Lax, and Secure outside the local dev server.

References: [connection choices](https://supabase.com/docs/guides/database/connecting-to-postgres),
[server-side session clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## 2. Apply database migrations and seed an event

```sh
npm run db:migrate
npm run db:seed -- --empty --name "Your Party Name"
```

These commands read `.env`. Migrations are versioned and transactional; seed is
non-destructive. Migration 003 adds `event_hosts(event_id, user_id)` with RLS and
no browser policies. Existing entry/couple/vote rules and receipts are preserved.
For the real party, always use `--empty`: plain `db:seed` loads fictional demo
costumes, and reset is disabled in Supabase mode, so they could only be hidden.
The default categories are created either way; edit them on the host desk. Event setup/editing beyond the current host
controls remains a future feature; choose a separate EVENT_ID for rehearsal.

Do not grant browser/anon/authenticated roles access to the contest tables.
Database connectivity is server-only; an Auth user is not automatically a host.

## 3. Create the private photo bucket

Review and run [supabase/storage.sql](supabase/storage.sql) in the chosen project's
SQL editor. It creates `costume-photos` as **private**, limits files to 2 MB, and
allows PNG, JPEG and WebP. It refuses to silently adopt an existing public bucket
or different limits. If using a different bucket name, change the SQL and env
value together before running it.

Do not add public or authenticated-client Storage policies for this bucket.
Audit any existing broad `storage.objects` policies in a reused project. All
uploads/downloads go through Tally Ho's server, not directly from the browser.
The app checks that the bucket is private before uploading.

Object keys are `<encoded-event-id>/<random-name>.<type>`. The database retains
only `/api/photos/<random-name>.<type>`. That endpoint verifies approved/visible
eligibility on every guest read, or verified host membership for pending photos,
then proxies the bytes with `private, no-store` and `nosniff` headers. It never
returns public or signed object URLs. The check reads entries only, not ballots,
to keep gallery loads light. Hiding an entry removes guest access on the
next request. The upload also validates size, type and magic bytes on the server.

If registration validation fails, the new upload is deleted. An unknown database
failure may mean a commit succeeded but its acknowledgment was lost; in that
case the object is retained for reconciliation rather than risking deletion of
an entry's committed photo. Crashes and failed cleanup can also leave private,
unreferenced objects. Review references in `entries.photo` against bucket keys
before deleting orphans; never delete a whole event prefix during live requests.
Photos are optional, including when Storage is unavailable.

Existing filesystem photos are **not** automatically uploaded. Use a fresh event
or explicitly copy referenced local photos into the corresponding event prefix
before switching an existing event to cloud mode. Do not upload real guest data
as part of a setup rehearsal without the organizer's authorization.

References: [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[asset downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## 4. Provision hosts

Create a confirmed email/password user in Supabase Authentication → Users. This
milestone does not add public signup, send invitations, or implement an email
callback/password-recovery flow. The organizer manages accounts and password
help in Supabase. Use a strong password and share credentials through your usual
private channel, not this repository or chat.

Copy the user's verified Auth **UUID**, then grant access to this event:

```sh
npm run db:grant-host -- 00000000-0000-4000-8000-000000000001
```

Use the actual UUID, not the example. To revoke permission:

```sh
npm run db:revoke-host -- 00000000-0000-4000-8000-000000000001
```

Membership is checked on each host request after `auth.getUser()` verifies the
session with Supabase. User-editable metadata, an email match, or an account in
the project do not grant host access. Permission removal affects the next host
request. Sessions survive app restarts; refresh-token changes are written back
through the SSR client's cookie adapter. Sign-out clears this browser's cookies
and requests local-session sign-out from Auth. Supabase access-token revocation
semantics still apply; revoke event membership to remove host authorization.

`/host` displays email/password fields in Supabase mode. PIN login and demo reset
are disabled there, even during local development. Guest registration/voting
remains account-free. Individual and linked-couple awards stay independent.

References: [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword),
[Supabase SSR sessions](https://supabase.com/docs/guides/auth/choosing-a-server-package).

## 5. Rehearse locally against the real project

```sh
npm run dev -- --host 0.0.0.0
```

Restart after env changes. Verify: valid/invalid host sign-in, an account without
membership, host permission revocation, session refresh/reload, sign-out,
optional photo upload, pending-photo privacy in another browser, approval,
hiding, couple/group approval, ballot edits, closure and guest result reveal.
Rehearse with a separate event before using real entries.

Incomplete Supabase configuration fails closed. It never switches to PIN auth or
filesystem persistence/photos. Demo mode is available only on the development
server. Service failures return safe errors rather than database diagnostics.

## 6. Build for Netlify without deploying

`netlify.toml` uses the official Node-function SvelteKit adapter through
`npm run build:netlify`. The installed SvelteKit 3 configuration stays in
`vite.config.ts`; older `svelte.config.js` examples do not apply to this project.
No handwritten functions, Edge Functions, or SPA fallback rewrites are needed.

Set the server variables above in the terminal environment, then:

```sh
npm run build:netlify
```

This command intentionally does **not** load the demo `.env`. It requires valid
production configuration before building. Local `npm run build` continues to use
the Node adapter. Building creates local artifacts; it does not deploy anything.
Production mode requires Supabase and verified database TLS; demo mode cannot run
in a production build.

Before an authorized deployment, set all server variables in the intended
Netlify site's **Builds and Functions** scopes. Changes require a new deployment.
Use separate database events/projects and host grants for Deploy Previews; do
not let previews write live contest data. Do not enable auto-deploys yet.

## Remaining release gates

- Real Supabase bucket/Auth/host membership verification with operator-provided
  credentials; no real project has been tested by this milestone.
- Production database role/connection-budget review, hosted multi-instance load
  and vote/close rehearsal, real-device party Wi-Fi testing, and an explicit
  deployment authorization.
- Event creation/settings/routing and organizer-managed password support remain
  limited as described above. This is not an event marketplace or guest account
  system. No TV/projector mode is included.
