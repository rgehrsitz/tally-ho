# Tally Ho ✳

A little friendly competition. A lot of good company.

A mobile-first costume contest for a party of 40–60 people. An individual can win alone **and** with their linked couple. Built with SvelteKit, TypeScript, and Tailwind.

## Run the demo

Requires Node 22.12+ and npm.

```sh
npm install
npm run dev -- --host 0.0.0.0
```

Open the printed local URL. Open `/host` in another tab and sign in using demo PIN **2468**. To override it, copy `.env.example` to `.env` and set `DEMO_HOST_PIN`. This default is only available in development mode.

For another phone on the same Wi-Fi, open the computer's local network URL printed by Vite (for example `http://192.168.1.10:5173`). Then use **Share event** to display a QR code for that URL. A QR made from localhost only works on the same computer. Firewall/network isolation can prevent phone access.

## Try a complete party

1. Register an individual costume as a guest, optionally with a JPEG, PNG, or WebP photo under 2 MB.
2. Approve it from the host desk. To enter a couple, link two approved individual entries; both individual costumes stay eligible for individual awards.
3. Add/remove categories during registration. Edit, hide, or merge entries as needed.
4. Open voting from the host desk. Use the guest ballot to choose, replace, or clear one choice per category. For a second demo voter, use a private window or another browser/device.
5. Watch private tallies in the host desk. Close voting, see immediate results with ties, and optionally reveal results to guests.
6. Reset from the host desk for a fresh practice run. Reset deletes all demo changes, photos, and votes.

The sample event starts with eight approved entries and no votes. Artwork placeholders identify fictional entries; optional uploaded photos appear in their place. Views refresh every five seconds; ballot saves and host actions update immediately.

## What works now

- Registration, optional photo upload, linked individual/couple entries, stable entry numbers.
- Approval, editing, hiding/restoring, duplicate merging with latest-choice preservation.
- Event category configuration, phase transitions, anonymous editable ballots.
- Host PIN sessions, host-only tallies, final results, ties, guest result reveal.
- QR/link sharing, responsive UI, local persistence, and reset.

## Local demo boundaries

`.data/demo.json` and `.data/photos/` store fictional demo data on this computer and are ignored by Git. Transactions are synchronous and atomic within one Node process. Host sessions and login throttling are in memory and reset when the server restarts. This is a rehearsal app, not the deployed production backend. Reset affects every browser using this one demo event.

Anonymous browser cookies do not prove one vote per human; clearing cookies or switching browsers creates a new ballot. Couples sharing a phone need separate browser profiles/devices to vote independently. Verified self-vote blocking is not implemented because no voter-to-entry identity is collected.

The planned production stack is Netlify + managed PostgreSQL/Supabase photo storage and host authentication. **Do not deploy this local filesystem backend to Netlify Functions.** Production work and the agreed scope are in [PROJECT_BRIEF.md](PROJECT_BRIEF.md); contributor instructions are in [AGENTS.md](AGENTS.md).

## Checks and local production build

```sh
npm run check
npm test
npm run build
```

The demo uses the Node adapter so local file persistence is honest and explicit. To run the built demo on local HTTP:

```sh
ORIGIN=http://localhost:3000 DEMO_HOST_PIN=your-private-pin node build
```

This starts an HTTP server, but production cookies are Secure, so authenticated use of that build requires an HTTPS reverse proxy and a matching HTTPS ORIGIN. Use the development server for the phone rehearsal. Replace local storage/auth and use the Netlify adapter when preparing the actual deployment.

## Repository status

Local repository only; no GitHub repository or deployment yet. An open-source license will be selected before public release. TV/projector/presentation mode is reserved for a later version.
