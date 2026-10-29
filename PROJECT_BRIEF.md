# Tally Ho

A fun, mobile-first voting app for a friend's annual Halloween party with 40–60 guests. Make entering costumes and voting enjoyable, and remove manual counting at the end of the night. Make event content reusable for other small celebrations and eventual open-source use without building a marketplace.

## Agreed v1 experience
- QR code or short event link; phone browser, no installation or guest account.
- Self-registration or host/helper-assisted registration. Costume title, display name, stable human-readable entry number, optional photo; missing photos must never block participation.
- Individual entries and couple entries. **Each person's costume is independently eligible for individual awards AND may be part of a separate couple entry. The same person/costume may win both individual and couple categories.** Couple membership links two individual entries; each partner casts their own anonymous ballot. Signup can create both individuals and their couple in one submission, or reuse existing individuals when a partner is added later. Pending entries stay private; a private browser signup receipt lets its submitter link a partner immediately, without waiting for approval. Hosts may also link pending entries. Signup receipts are independent of anonymous ballot identity.
- Event-specific categories, each with individual/couple eligibility.
- Host moderation: review, approve, edit, hide, and merge duplicate entries. A host can approve a couple and both linked individuals in one atomic action; hidden entries must be restored explicitly first. Hidden/unapproved members make a linked couple ineligible.
- Registration → Voting → Closed, controlled by the host. Late arrivals have a registration opportunity before voting opens.
- One anonymous ballot choice per eligible category. Every choice is saved, can be replaced or cleared before voting closes, and can be skipped. Closure prevents all further ballot edits.
- Private host tallies during voting; instant final counts/winners on closure. Identify ties rather than selecting an arbitrary winner. Host may reveal final results to guest phones.

## Integrity and privacy
Use opaque persistent browser tokens without voter names. This is a trust-based party system: another browser or cleared browser data creates another ballot. Enforce uniqueness and eligibility in the database in production, validate on the server, and keep tallies and others' choices out of guest responses. Couple membership does not identify who owns a browser, so verified self-vote blocking is not part of the current model.

Merge operations must update linked couple references and votes transactionally. For every voter/category, preserve the most recently updated choice, including when that choice is for a different entry. Reject merges that would turn a couple into the same individual twice.

## Technology direction
SvelteKit + TypeScript + Tailwind CSS. Netlify hosting with its supported SvelteKit adapter. Supabase for managed PostgreSQL, photo storage, and production host authentication. Store secrets server-side, include migrations and setup documentation, and make event data explicit in the model.

## First milestone: runnable local demo
Include a fictional Halloween event with individual and couple costumes, configurable categories, entry approval, optional photo uploads, private host controls, actual browser ballots, closure and results, QR sharing, and host reset. Use linked sample entries such as Gomez and Morticia / The Addamses to demonstrate independent and couple wins.

Local demo persistence and authentication may be intentionally simpler than production, clearly documented, and isolated behind server modules. Do not present a local demo as ready to run the real party across hosted instances.

## Design
Warm, playful, readable, and easy to use on a phone. Large tap targets, obvious event phase and save confirmations, fast gallery, attractive placeholders. Halloween is event content, not an assumption built into every data model.

## Reuse and open source
Support event records and event-specific categories in the production model. Provide README, .env.example, demo seed/reset, migration and deployment instructions. Pick the public license with the user. Do not build an elaborate plugin framework or separate people directory prematurely.

## Outside v1
No TV/projector/presentation mode, casting, animated awards ceremony, favorites shortlist, guest accounts, voter tickets, billing, or event marketplace. Presentation mode stays on the future-ideas list without implementation now.

## Acceptance checks
- A costume can win an individual award and its linked couple can win a couple award.
- Ballot edits replace choices; clearing/skipping works; closure rejects later writes.
- Ineligible/unapproved/hidden entries cannot receive new votes.
- Guest endpoints never include private tallies, other ballots, pending entries, or pending photos.
- Host merges preserve the latest vote and linked membership. Ties and zero-vote categories are explicit.
- Registration, moderation, voting, host result reveal, reset, and phone-sized layouts work end to end.

## Remaining production work
PostgreSQL transactions, event-scoped tables, and database uniqueness constraints are implemented and tested locally (with an optional file-demo fallback). Supabase private object storage, verified email/password host sessions, and event-specific host grants are implemented with local protocol-fixture tests; verify them against an actual Supabase project and provision real host access; add multi-event routing, event creation/settings and a stable short event URL; extend locally verified concurrent close/vote behavior to deployed multi-instance rehearsal; Netlify adapter/config and setup docs are prepared; verify real hosting configuration before any authorized deployment; rehearse on the party Wi-Fi with multiple physical phones.
