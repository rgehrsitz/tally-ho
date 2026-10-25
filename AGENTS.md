# Tally Ho development instructions

Read PROJECT_BRIEF.md before changing product behavior. Build for a friendly party of 40–60 guests; keep changes focused and easy to run.

## Non-negotiable product rules
- A person has an individual costume entry. A couple is a separate entry linked to two individual entries. A costume can win individually AND as part of its couple. Never impose cross-category winner exclusion.
- Guests need no account. One anonymous browser ballot may choose one eligible entry per category and edit/clear until closure. Do not claim browser identity proves one vote per human.
- Enforce phase, eligibility, authorization, and ballot uniqueness on the server. Guest endpoints must not leak ballots, private tallies, pending entries, or their photos.
- Registration precedes voting. Closed results are immutable. A host can reveal final results to phones.
- Merge duplicate entries transactionally; retain the latest choice per voter/category and update couple references. Never collapse two members into one couple member.
- No TV/projector/presentation mode in v1. Record it only as a future idea.

## Architecture and scope
- SvelteKit + TypeScript + Tailwind; target Netlify + managed PostgreSQL/photo storage (Supabase).
- Local development supports transactional PostgreSQL via DATABASE_URL, with an optional single-process .data/ file fallback. Photos still use ignored .data/ files; demo PIN sessions remain in memory. This is not production hosting or authentication.
- Keep pure rules in src/lib/domain.ts, persistence/auth in src/lib/server/, and sanitized guest/host response projections on the server.
- Use Svelte 5 runes and the installed SvelteKit 3 conventions; #lib aliases are defined in package.json. Consult installed versions and official docs before applying older configuration examples.
- Do not deploy this backend to Netlify Functions yet. PostgreSQL persistence is implemented locally; replace filesystem photos with object storage and demo PIN sessions with production authentication first.
- No secrets, real guest photos, .env files, local sessions, or .data files in Git. Keep .env.example safe.
- Host photo upload is optional; keep entries without images fully usable.

## Validation
Run npm run check, npm test, and npm run build after behavior changes. Add meaningful tests for voting, privacy, phase transitions, merge rules, and linked entry eligibility. Browser-check registration, host moderation, ballot editing, closure, results, and mobile layout when UI changes materially.

## Workflow
Do not create a GitHub repository, publish, or deploy without user authorization. Local development and commits are fine. Document completed work and remaining production gaps honestly. Choose an open-source license with the user before public release.
