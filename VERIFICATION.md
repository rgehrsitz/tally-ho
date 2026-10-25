# Initial demo verification

Verified October 25, 2026 on the local development server.

## Automated
- `npm run check`: no errors or warnings.
- `npm test`: 9 passing rule tests.
- `npm run build`: successful Node-adapter build.

Rule tests cover individual plus linked-couple winners, ballot replacement and clearing, phase and eligibility enforcement, guest data privacy and result reveal, latest-vote preservation on merge, couple reference updates, pending registration, invalid couples, hidden member eligibility, host permissions, category locking, ties, and zero-vote categories.

## Browser rehearsal
- Desktop gallery: eight sample entries, no horizontal overflow.
- Guest and host at 390px width: no horizontal overflow; screenshots visually inspected.
- Guest registered a fictional entry with a PNG photo; pending entry was absent from guest data.
- Host PIN sign-in, approval, approved photo retrieval, category add/remove, and opening voting worked.
- Guest changed and cleared choices; choice projection included only that ballot.
- Separate anonymous browser context could not retrieve host tallies or other ballot choices; unauthorized reset returned 401.
- Closed vote submission returned 400.
- Gomez won an individual category and the linked Addamses won Best Couple in the same event.
- Guest results stayed private until host reveal, then appeared on the guest screen.
- QR generation worked; host reset restored the seed and removed votes/uploads; sign-out worked.
- Browser console contained no errors.

After testing the demo was reset to registration with eight sample entries and no votes. The application was not deployed; no remote Git repository was created.

## Not yet verified
Actual phones over party Wi-Fi, deployed cloud persistence/auth, multi-instance behavior, and a real 40–60 guest rehearsal. The current file store is intentionally single-process and local. The built Node demo was compiled but not rehearsed over HTTPS.
