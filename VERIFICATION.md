# Local PostgreSQL and Halloween theme verification

Verified October 25, 2026. Source published to `rgehrsitz/tally-ho` under MIT with
user authorization. The application has not been deployed.

## Automated

- `npm run check`: no errors or warnings, including scripts and integration tests.
- `npm test`: 36 passing tests (18 domain + 18 PostgreSQL/HTTP integration tests).
- `npm run build`: successful Node-adapter build.
- `git diff --check`: clean.
- Versioned migration and non-destructive seed both ran twice successfully against
  the local development database.

Integration tests use a temporary real PostgreSQL 18 cluster, independent
connection pools, and a temporary Vite HTTP server. They do not use the app's
development database or mock database transactions. The native server needs
shared-memory/process access; tests passed with that local sandbox permission.

Verified behavior:

- An individual costume and its linked couple can win simultaneously; zero-vote
  categories have no winners. Existing domain tests also cover ties.
- Concurrent ballot writes yield one saved choice per browser/category;
  replacement and clearing persist across independent connections.
- Votes racing closure either commit before closure or are rejected afterward.
  A vote queued behind a locked closing event validates the committed phase.
- Closed events reject ballot changes, editing, moderation, category changes and
  merges; revealing results changes visibility without changing final tallies.
- Merges update couple references and preserve the latest choice, including a
  newer choice for another entry. Merging two members of one couple is rejected.
- A PostgreSQL failure after UPDATE/DELETE have started rolls back the complete
  event, including its entries and ballots; subsequent operations still work.
- Database constraints reject duplicate ballots, cross-event references,
  category/entry type mismatches, repeated couple members, and couple-as-member
  references.
- Events remain isolated; repeating seed leaves existing data unchanged.
- RLS hides all table rows from a non-owner role even when SELECT is granted.
- HTTP endpoints enforce host permissions and same-origin writes. Pending photos
  are accessible only to the host; approval makes them public. Guest responses
  omit pending entries/photos, other ballots, private tallies and ballot counts.
- HTTP closure rejects later edits, reveal exposes results, and reset makes old
  photos inaccessible.

## Browser rehearsal against PostgreSQL

Used separate host/guest browser contexts on the local dev server.

- Guest registration without a photo, host approval, opening voting, choice
  replacement/clearing, closure, result reveal and reset all completed through UI.
- Gomez won Best Costume and the linked Addamses won Best Couple in the same event.
- Guest results stayed hidden until host reveal; Most Creative showed no votes.
- Desktop at 1280px and guest/host layouts at 390px were visually inspected.
  A 320px host title overflow was caught, fixed and checked again.
- A delayed stale polling response did not overwrite a newer saved ballot choice.
- No horizontal overflow in checked guest/host layouts; no browser console errors.
- Original artwork is CSS/SVG, fonts are bundled locally, and entries without
  photos remain fully usable. Screenshots are ignored under `test-results/`.
- Local development PostgreSQL was reset to eight sample entries in registration
  with no votes. Existing file-demo data was not migrated or overwritten.

## Signup clarity follow-up

Reproduced the original problem: Couple exposed only approved-entry dropdowns,
with no way to enter new people or add a partner from an individual card.

- Signup now says **Just me** / **Two of us**, supports two new people, one new
  and one existing person, or two existing people in a single registration.
- “Enter both of us” preserves the current individual's draft name/costume.
- Individual cards and the registration gallery offer **Add a partner**; the
  selected individual is reused rather than duplicated.
- Guests can use their own signup receipt immediately; hosts can
  link pending people directly. Linked couples stay ineligible until both
  people and the couple are approved.
- New regression tests were run before the fix and failed on the missing couple
  signup paths. They now pass, including whole-request validation, capacity,
  no partial entries/consumed numbers, pending privacy, and simultaneous awards.
- PostgreSQL/HTTP tests exercise atomic two-person signup, reuse, linking two
  existing people, approval, and individual plus couple winners.
- Browser rehearsal used an isolated local `signup-rehearsal` event: registered
  two new people together, registered an individual and added a partner later,
  verified the existing individual appeared exactly once, moderated entries,
  opened voting and confirmed that individual and couple won together.
- The form was visually inspected at 390px with no horizontal overflow; the
  current main demo event was left untouched.

## Immediate partner follow-up

- A successful individual signup now offers **Add my partner now**. A private,
  server-generated receipt reuses that exact pending entry without duplication.
- Receipts persist in local browser storage across reloads; the database stores
  only SHA-256 hashes. Receipt hashes are removed from host/guest projections,
  including nested result rows. Anonymous ballot tokens are not associated with
  signups.
- Added HTTP/PostgreSQL tests for immediate pending-entry reuse, guessed IDs,
  invalid receipts, forged hash fields, closed registration, no token/hash leaks,
  simultaneous individual/couple winners, and stale receipts after reset with
  reused entry numbers.
- Browser-verified in an isolated receipt rehearsal event: individual signup,
  immediate CTA, reload persistence, partner signup without approval, exactly
  one original individual plus one new partner and linked couple, and pending
  entries absent from the public gallery. All three stayed unapproved.
- Form fits at 320px. Rehearsal data was removed; the main event was not reset.
- Prior signups without receipts, other browsers, or cleared browser storage
  still need host help to link an entry while it is pending.

## One-click couple approval follow-up

- Couple cards offer **Approve couple + both people** when any part of the linked
  group is unapproved, including an approved couple with pending individuals.
- One host-only server action validates the complete group, then approves all
  three within the existing event transaction. Hidden entries must be restored
  separately. Closed events and malformed links are rejected without changes.
- Unit tests cover mixed approval state, repeated approval, unrelated entries,
  host authorization, closure, invalid links and hidden members.
- PostgreSQL/HTTP tests verify a single request approves all three, preserves
  independent individual/couple winners, rejects unauthorized/closed writes, and
  rolls back every approval when an injected database error occurs mid-write.
- Browser rehearsal at 320px confirmed exactly one approval request, all three
  entries approved and visible to guests, no remaining approval button and no
  horizontal overflow.
- Parallel dev servers initially collided through shared SvelteKit generated
  environment files. Test servers now use unique TALLY_RUNTIME_DIR directories
  and Vite caches; the full suite passes while a separately isolated rehearsal
  server is running. Rehearsal data was removed afterward.

## Host couple member details

- Host couple cards list each linked individual's entry number, costume name,
  display name and approval status before the group approval controls. Hidden
  status is displayed separately from approval; unavailable links are explicit.
- Browser-verified pending/pending, approved/pending, hidden/pending and fully
  approved states in an isolated event. Badges updated immediately after actions;
  group approval was blocked while a member was hidden.
- Desktop and 320px card screenshots were visually inspected, including a long
  costume title; no horizontal overflow. Guest cards do not show this host-only
  moderation list. No server behavior or award eligibility rules changed.
- All 36 tests, type checking and the Node build passed.

## Earlier demo verification

The initial file demo also passed its nine domain tests and a desktop/390px
rehearsal on October 25, including PNG upload, category add/remove, QR generation,
private host tallies, unauthorized reset rejection, reveal, reset and sign-out.
That record is historical; this milestone's full UI rehearsal used PostgreSQL.

## Remaining production work and unverified environments

- Photos are still local files. Supabase object storage and production host
  authentication are not implemented. PIN sessions/throttling remain in memory.
- Docker/PostgreSQL 17 launcher, physical phones, party Wi-Fi, HTTPS built-server
  use, and a full 40–60 guest rehearsal were not verified this round.
- Concurrent independent database connections were tested locally; deployed
  multi-instance servers, managed Supabase configuration/roles and Netlify
  deployment remain unverified.
- Event records are isolated but the app still selects one event with EVENT_ID;
  multi-event routing and event creation/settings remain future work.
- Reset deletes known old uploads. Concurrent abandoned uploads can leave
  inaccessible files requiring local cleanup. Files are not production storage.
- The optional file repository remains a single-process rehearsal mode and must
  never be deployed to Netlify Functions.
