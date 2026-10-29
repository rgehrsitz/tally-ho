# Tally Ho 🎃

Good costumes. Wicked company.

A mobile-first costume contest for a party of 40–60 people. An individual can
win alone **and** with their linked couple. Built with SvelteKit, TypeScript,
Tailwind, and an optional transactional PostgreSQL repository.

## Quick file demo

Requires Node 22.12+ and npm.

```sh
npm install
npm run dev -- --host 0.0.0.0
```

Open the printed URL and `/host` in another tab. The development host PIN is
**2468**. Copy `.env.example` to `.env` to override `DEMO_HOST_PIN`.
With `DATABASE_URL` blank, the app uses ignored `.data/demo.json` files in one
Node process. This remains a quick rehearsal option, not hosted persistence.

## Local PostgreSQL

No cloud account is needed. The bundled development launcher runs a real native
PostgreSQL server, listening only on `127.0.0.1:54329`:

```sh
npm run db:local
```

Keep that terminal open. In a second terminal, copy `.env.example` to `.env` and
set the following **local-only** connection string:

```dotenv
DATABASE_URL=postgresql://tally:local-demo-only@127.0.0.1:54329/tally_ho
EVENT_ID=halloween-demo
```

Then run:

```sh
npm run db:migrate
npm run db:seed          # demo costumes; add -- --empty --name "..." for a real event
npm run dev -- --host 0.0.0.0
```

Migrations are versioned and transactional. Seed creates eight fictional entries
and no ballots, and leaves an existing event unchanged. `DATABASE_URL` explicitly
selects PostgreSQL; connection failures never switch to file storage. Existing
file-demo data is not imported or overwritten. Restart Vite after changing env.
`EVENT_ID` selects the server's event; multi-event URL routing/settings are future
work.

The native launcher stores its cluster under ignored `.data/postgres-local/`;
Ctrl+C stops the server while preserving data. It needs native process/shared
memory access, which some agent sandboxes restrict. The pinned native binary is
a development dependency, not a production database service. If your platform
cannot run it, use PostgreSQL 17+ or the Docker alternative instead:

```sh
docker compose up -d --wait
npm run db:migrate
npm run db:seed
```

Docker uses the same loopback port and local demo credentials, storing data in
`.data/postgres/`. Run only one launcher at a time. `docker compose stop` stops
the Docker server. Neither option publishes a database or website.

### Persistence guarantees

- Event, entry, category, and ballot rows are scoped by event ID.
- A primary key enforces one ballot choice per event/browser/category. Foreign
  keys prevent cross-event references and mismatched category/entry types.
- Couples reference two distinct individual entries; neither membership nor wins
  remove individual eligibility. There is no cross-category winner exclusion.
- Every action locks its event row, loads the latest state, applies the shared
  domain rules, and commits the graph together. A small party's bounded graph
  is intentionally replaced within a transaction rather than maintaining a
  second implementation of voting and merging rules in SQL.
- Independent connections serialize votes, moderation, merges, resets, and closure.
  Failed operations roll back completely. Reads use a consistent snapshot.
- Closed phase rules reject later votes, edits, merges and moderation. Reveal
  changes visibility; reset explicitly starts a fresh practice event.
- Tables have RLS enabled with no public policies. Access is through server
  endpoints, using the database-owner connection for local development. Never
  expose `DATABASE_URL` to a browser or grant guests access to these tables.

The transaction approach follows [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html)
and uses [one node-postgres client per transaction](https://node-postgres.com/features/transactions).

## Try a complete party

1. Choose **Just me** or **Two of us**. Couples can enter both people and their
   shared costume in one form. For either person, choose a new person or reuse
   an existing entry. Optional photos are shrunk in the browser to a JPEG of
   at most 1600 px before upload (the server limit is 2 MB).
2. On the couple card in the host desk, select **Approve couple + both people**
   to approve the couple and both linked individual entries in one transaction.
   This also works when the couple itself is already approved. Restore any hidden
   entries first; group approval never unhides them. Individual cards retain their
   separate **Approve** action. All three must be approved for couple voting.
   Entered individually first? Select **Add a partner** on the lineup card to reuse
   that entry. Right after an individual signup, **Add my partner now** reuses
   the pending entry immediately. A private signup receipt saved in that browser
   also works after reloading. It authorizes pairing only, not approval, editing,
   private photo access, or voting. The server stores its hash separately from
   ballot identity. Other browsers cannot see pending entries or their receipts;
   the host can help if someone changes browsers or clears storage. Older signups
   made before receipts were added need host help until approved. No one needs
   to register twice.
3. Add/remove categories during registration. Edit, hide, or merge entries.
4. Open voting. Choose, replace, or clear one entry per category. Use another
   browser/device or private window for a second demo ballot.
5. Watch private host tallies. Close voting, check ties and zero-vote categories,
   then reveal results to guest phones.
6. Reset for another rehearsal. This restores the seed, clears ballots and removes
   known old uploads. Concurrent abandoned uploads can require manual cleanup.

Guest views refresh every ten seconds and the host desk every five. Saves update immediately. Stale refreshes do
not overwrite a newer ballot save. The Halloween poster theme uses locally
bundled fonts, photo-free entry cards, and readable voting controls; its design
reference is [DESIGN.md](DESIGN.md).

For phones on the same Wi-Fi, use the computer's network URL printed by Vite
(for example `http://192.168.1.10:5173`) before selecting **Share event**. A
localhost QR works only on that computer. Firewall/network isolation may prevent
phone access.

## Verification

```sh
npm run check
npm test
npm run build
```

`npm test` runs domain/configuration tests plus real PostgreSQL and HTTP integration tests, including Supabase-mode SDK tests against a local Auth/Storage protocol fixture. It
starts an isolated native database on a random loopback port and a temporary Vite
server with its own generated files and cache under ignored `.data/`, then stops both and removes test database files. It ignores your app's
`DATABASE_URL` and never resets your development database. Test photo fixtures
are fictional and removed by reset. To run just integration tests:

```sh
npm run test:integration
```

See [VERIFICATION.md](VERIFICATION.md) for verified scenarios and limitations.
The Docker variant and physical phones still need their own rehearsal.

## Supabase and Netlify preparation

Supabase-mode code now uses a private photo bucket, verified email/password host
sessions, event-specific database host grants, and persistent Auth cookies. Host
PIN sessions and local photos remain available only in development demo mode.
Guests still need no account; anonymous browser ballots do not prove one vote per
human. Individual and linked-couple awards remain independent.

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for server-only env values, migrations,
private bucket SQL, host provisioning/revocation, and real-project rehearsal.
`npm run db:grant-host -- <auth-user-uuid>` grants this event's host permission;
`npm run db:revoke-host -- <auth-user-uuid>` removes it. Creating an Auth user by
itself never grants access. Host account/password support is organizer-managed;
public signup and recovery/invitation flows are not implemented.

Local `npm run build` uses the Node adapter. `npm run build:netlify` validates
production configuration and builds with the Netlify adapter; it does not deploy.
Demo mode cannot run in a production build. The build command does not load local
`.env` automatically; supply production variables in the process environment or,
for a later authorized deploy, Netlify's Builds and Functions scopes.

**Live Supabase verification and deployment remain outstanding.** Tests exercise
real PostgreSQL plus the Supabase SDK against a local HTTP protocol fixture;
this is not proof of a live project's bucket, Auth, role, email, TLS or connection
configuration. Netlify artifacts compile locally; hosted multi-instance and
physical-phone rehearsals still need to be done. No site was created or deployed.
Existing local photos are not automatically uploaded to a cloud project.

Source: [rgehrsitz/tally-ho](https://github.com/rgehrsitz/tally-ho). Licensed under
the [MIT License](LICENSE). The application has not been deployed. TV/projector/presentation mode is
reserved for a future version. The agreed scope is in [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
and contributor guidance is in [AGENTS.md](AGENTS.md).
