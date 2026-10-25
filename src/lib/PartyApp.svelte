<script lang="ts">
  import { onMount } from 'svelte';
  import { eligible, type Entry, type PublicParty } from './domain';
  let { hostMode = false }: { hostMode?: boolean } = $props();
  let party = $state<PublicParty | null>(null);
  let tab = $state<'gallery' | 'register' | 'ballot'>('gallery');
  let filter = $state('all');
  let search = $state('');
  let busy = $state(false);
  let notice = $state('');
  let failure = $state('');
  let pin = $state('');
  let entryType = $state<'individual' | 'couple'>('individual');
  let title = $state('');
  let names = $state('');
  let firstMember = $state('');
  let secondMember = $state('');
  let photoFile = $state<File | undefined>();
  let formKey = $state(0);
  let categoryName = $state('');
  let categoryType = $state<'individual' | 'couple'>('individual');
  let qr = $state('');
  let shareUrl = $state('');
  let sharing = $state(false);
  let resetConfirm = $state(false);
  let phaseConfirm = $state(false);
  let editing = $state('');
  let editTitle = $state('');
  let editNames = $state('');
  let mergeSource = $state('');
  let mergeTarget = $state('');
  let endpoint = $derived(`/api/demo${hostMode ? '?host=1' : ''}`);
  let individuals = $derived(party?.entries.filter(e => e.type === 'individual' && e.approved && !e.hidden) ?? []);
  let gallery = $derived(party?.entries.filter(e => (filter === 'all' || e.type === filter) && `${e.title} ${e.names} ${e.number}`.toLowerCase().includes(search.toLowerCase())) ?? []);
  let savedCount = $derived(Object.keys(party?.choices ?? {}).length);
  let pending = $derived(party?.entries.filter(e => !e.approved && !e.hidden).length ?? 0);
  async function refresh() {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Unable to load the event. Please try again.');
      party = await response.json();
    } catch (error) { failure = (error as Error).message; }
  }
  async function send(input: Record<string, unknown>, message = '') {
    if (busy) return false;
    busy = true; failure = ''; notice = '';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save. Please try again.');
      party = data; notice = message;
      return true;
    } catch (error) { failure = (error as Error).message; return false; }
    finally { busy = false; }
  }
  async function register(event: SubmitEvent) {
    event.preventDefault();
    let photoData: string | undefined;
    if (photoFile) {
      if (photoFile.size > 2_000_000) { failure = 'Please use a photo smaller than 2 MB.'; return; }
      try { photoData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read this photo.')); reader.readAsDataURL(photoFile!); }); }
      catch (error) { failure = (error as Error).message; return; }
    }
    if (await send({ action: 'register', title, names, type: entryType, members: [firstMember, secondMember], photoData }, party?.host ? 'Entry added and approved.' : 'You’re on the list! Your entry is waiting for host approval.')) {
      title = ''; names = ''; firstMember = ''; secondMember = ''; photoFile = undefined; formKey++;
      if (!hostMode) tab = 'gallery';
    }
  }
  async function share() {
    sharing = !sharing;
    if (sharing && !qr) {
      try { const QRCode = await import('qrcode'); qr = await QRCode.toDataURL(shareUrl, { width: 240, margin: 2, color: { dark: '#213e32', light: '#ffffff' } }); }
      catch { failure = 'Could not make the QR code. You can still copy the event link.'; }
    }
  }
  function startEdit(entry: Entry) { editing = entry.id; editTitle = entry.title; editNames = entry.names; }
  onMount(() => {
    shareUrl = `${window.location.origin}/`;
    void refresh();
    const timer = setInterval(() => { if (!busy && !document.hidden) void refresh(); }, 5000);
    return () => clearInterval(timer);
  });
</script>

<svelte:head>
  <title>{hostMode ? 'Host desk' : 'The Halloween Social'} · Tally Ho</title>
  <meta name="description" content="A little friendly competition. Enter your costume, find your favorites, and cast your Halloween party ballot with Tally Ho." />
</svelte:head>
<div class="demo-strip">A LITTLE PARTY. A LITTLE FRIENDLY COMPETITION. <span>DEMO EVENT</span></div>
<header class="site-header">
  <a class="brand" href="/" aria-label="Tally Ho home"><span class="brand-icon">✳</span> Tally Ho<span class="brand-dot">.</span></a>
  <div class="header-links"><button class="text-button" onclick={share}>{sharing ? 'Hide QR' : 'Share event ↗'}</button><a class:active={hostMode} href={hostMode ? '/' : '/host'}>{hostMode ? 'Guest view' : 'Host desk'} <span aria-hidden="true">↗</span></a></div>
</header>
{#if sharing}
  <section class="share-panel" aria-label="Share event">
    {#if qr}<img src={qr} width="180" height="180" alt="QR code for this event" />{/if}
    <div><h2>Bring everyone along.</h2><p>Scan to enter a costume and vote.</p><a href={shareUrl}>{shareUrl}</a><p class="muted small">For another phone, open the app using your computer’s local network address first. A localhost QR only opens on this computer.</p></div>
  </section>
{/if}
<main>
  {#if !party}
    <div class="empty"><span class="eyebrow">GETTING THE PARTY READY</span><h1>One moment…</h1>{#if failure}<p role="alert">{failure}</p><button onclick={refresh}>Try again</button>{/if}</div>
  {:else if hostMode && !party.host}
    <section class="login-panel">
      <span class="eyebrow">BEHIND THE SCENES</span><h1>The host desk.</h1><p>A little less counting.<br />A little more enjoying the party.</p>
      <form onsubmit={(event) => { event.preventDefault(); void send({ action: 'login', pin }, 'Welcome to the host desk.'); pin = ''; }}>
        <label for="pin">Host PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" bind:value={pin} required />
        <button class="primary" disabled={busy}>Open host desk <span>→</span></button>
      </form><p class="small muted">Default local demo PIN: <strong>2468</strong>, unless overridden with DEMO_HOST_PIN.</p>
      {#if failure}<p role="alert" class="error">{failure}</p>{/if}
    </section>
  {:else}
    <section class="hero">
      <div><div class="eyebrow"><span class="tiny-star">✦</span> OCTOBER AFTER DARK · HALLOWEEN DEMO</div>
        <h1>{hostMode ? 'Your party.\nAll together.' : 'Good costumes.\nGreat company.'}</h1>
        <p class="hero-copy">{hostMode ? 'Welcome to the host desk. Keep the entries tidy, open the ballot, and let the good costumes win.' : 'A night for the wonderfully weird. Join the costume lineup, find your favorites, and give them a little love.'}</p>
        <div class="hero-actions">
          {#if hostMode}<button class="primary" onclick={() => tab = 'register'}>Add an entry <span>+</span></button><button class="secondary" disabled={busy} onclick={() => send({ action: 'logout' })}>Sign out</button>
          {:else if party.phase === 'registration'}<button class="primary" onclick={() => tab = 'register'}>Enter your costume <span>↗</span></button><span class="hero-note">Individuals & couples welcome</span>
          {:else if party.phase === 'voting'}<button class="primary" onclick={() => tab = 'ballot'}>Cast your ballot <span>↗</span></button><span class="hero-note">Your favorites deserve a vote</span>
          {:else}<span class="closed-note">Voting has closed. Thanks for joining in!</span>{/if}
        </div>
      </div>
      <div class="party-art" aria-hidden="true"><span class="art-spark one">✧</span><span class="art-spark two">✦</span><div class="moon"></div><div class="ghost"><div class="ghost-eyes"><i></i><i></i></div><div class="ghost-cheek left"></div><div class="ghost-cheek right"></div><div class="ghost-mouth"></div></div><div class="ticket"><span>YOU LOOK</span><strong>boo-tiful.</strong><small>THE HALLOWEEN SOCIAL</small></div><span class="art-caption">DRESS UP. SHOW UP. HAVE FUN.</span></div>
    </section>
    <section class="event-bar" aria-label="Event status">
      <div><span class="status-dot" class:closed={party.phase === 'closed'}></span><strong>{party.phase === 'registration' ? 'Registration is open' : party.phase === 'voting' ? 'Voting is open' : 'Voting is closed'}</strong></div>
      <p>{party.phase === 'registration' ? 'Get on the list. Voting comes next.' : party.phase === 'voting' ? 'Change your choices any time before voting closes.' : party.revealed ? 'The results are in. Meet your winners.' : 'Your host has the results. Stay tuned.'}</p>
      <span>{hostMode ? `${party.entries.length} entries` : `${party.entries.length} in the lineup`}</span>
    </section>
    {#if failure}<div class="feedback error" role="alert">{failure}</div>{/if}
    {#if notice}<div class="feedback success" role="status">{notice}</div>{/if}
    {#if hostMode}
      <section class="host-controls">
        <div><span class="eyebrow">PARTY CONTROLS</span><h2>{party.phase === 'registration' ? 'Let everyone get settled.' : party.phase === 'voting' ? 'The votes are coming in.' : 'That’s a wrap.'}</h2><p class="muted">{party.ballotCount} ballots with at least one choice · {pending} awaiting approval</p></div>
        <div class="control-actions">
          {#if party.phase !== 'closed'}
            {#if phaseConfirm}<p class="small">{party.phase === 'registration' ? 'Close registration and open voting?' : 'Close voting and make results final?'}</p><button class="primary" disabled={busy} onclick={async () => { await send({ action: 'phase', phase: party!.phase === 'registration' ? 'voting' : 'closed' }, 'Event phase updated.'); phaseConfirm = false; }}>Confirm</button><button class="secondary" onclick={() => phaseConfirm = false}>Cancel</button>
            {:else}<button class="primary" onclick={() => phaseConfirm = true}>{party.phase === 'registration' ? 'Open voting →' : 'Close voting →'}</button>{/if}
          {:else}<button class="primary" disabled={busy} onclick={() => send({ action: 'reveal' }, party!.revealed ? 'Guest results hidden.' : 'Results revealed to guests.')}>{party.revealed ? 'Hide guest results' : 'Reveal guest results'}</button>{/if}
        </div>
      </section>
    {/if}
    <nav class="tabs" aria-label="Event sections">
      <button class:chosen={tab === 'gallery'} onclick={() => tab = 'gallery'}>{hostMode ? 'Entries' : 'The lineup'} <span>{party.entries.length}</span></button>
      {#if party.phase === 'registration'}<button class:chosen={tab === 'register'} onclick={() => tab = 'register'}>Enter a costume</button>{/if}
      {#if !hostMode}<button class:chosen={tab === 'ballot'} onclick={() => tab = 'ballot'}>Your ballot {#if savedCount}<span>{savedCount}/{party.categories.length}</span>{/if}</button>{/if}
    </nav>
    {#if tab === 'register' && party.phase === 'registration'}
      <section class="registration">
        <div><span class="eyebrow">MAKE AN ENTRANCE</span><h2>Who are you<br />tonight?</h2><p class="muted">One costume, one place in the lineup. Pair up too, and you can win individually and together.</p><p class="small muted">Couples: register each person first. Once both individual entries are approved, link them here as a couple.</p></div>
        <form class="entry-form" onsubmit={register}>
          <fieldset class="type-choice"><legend>Entry type</legend><label><input type="radio" bind:group={entryType} value="individual" /> Individual</label><label><input type="radio" bind:group={entryType} value="couple" /> Couple</label></fieldset>
          <label for="costume">Costume name</label><input id="costume" placeholder={entryType === 'couple' ? 'e.g. The Addamses' : 'e.g. Morticia Addams'} bind:value={title} maxlength="80" required />
          {#if entryType === 'individual'}<label for="names">Your display name</label><input id="names" bind:value={names} placeholder="What should we call you?" maxlength="80" required />
          {:else}<label for="member-one">First individual costume</label><select id="member-one" bind:value={firstMember} required><option value="">Choose a costume</option>{#each individuals as entry}<option value={entry.id} disabled={entry.id === secondMember}>#{entry.number} · {entry.title} ({entry.names})</option>{/each}</select><label for="member-two">Second individual costume</label><select id="member-two" bind:value={secondMember} required><option value="">Choose a costume</option>{#each individuals as entry}<option value={entry.id} disabled={entry.id === firstMember}>#{entry.number} · {entry.title} ({entry.names})</option>{/each}</select>{/if}
          {#key formKey}<label for="photo">Costume photo <span class="muted">(optional)</span></label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onchange={(event) => photoFile = event.currentTarget.files?.[0]} />{/key}
          <p class="small muted">JPEG, PNG, or WebP · under 2 MB. No photo? You’ll still get a spot in the lineup.</p>
          <button class="primary" disabled={busy}>{busy ? 'Saving…' : hostMode ? 'Add costume' : 'Join the lineup'} <span>↗</span></button>
          <p class="small muted">{hostMode ? 'Assisted entries are approved immediately.' : 'Your host will approve your entry before it appears.'}</p>
        </form>
      </section>
    {:else if tab === 'ballot' && !hostMode}
      <section class="ballot"><div class="section-title"><div><span class="eyebrow">A LITTLE LOVE FOR YOUR FAVORITES</span><h2>Your ballot.</h2></div><span class="count-label">{savedCount} of {party.categories.length} chosen</span></div>
        <p class="muted">{party.phase === 'registration' ? 'Voting opens once everyone has had a chance to register. Come back soon.' : party.phase === 'closed' ? 'Voting has closed. Here are your saved choices.' : 'Choose one costume in each category. Every choice saves immediately; you can change it before voting closes. Skipping is fine.'}</p>
        {#each party.categories as category}
          <fieldset class="ballot-category" disabled={party.phase !== 'voting' || busy}><legend>{category.name} <span>{category.type === 'couple' ? 'COUPLES' : 'INDIVIDUALS'}</span></legend>
            <div class="ballot-options">{#each party.entries.filter(e => eligible(party!, e, category)) as entry}<label class:picked={party.choices[category.id] === entry.id}><input type="radio" name={category.id} value={entry.id} checked={party.choices[category.id] === entry.id} onchange={() => send({ action: 'vote', category: category.id, entry: entry.id }, 'Choice saved. You can change it until voting closes.')} /><span class="ballot-icon">{entry.icon}</span><span><strong>{entry.title}</strong><small>#{entry.number} · {entry.names}</small></span></label>{/each}</div>
            {#if party.choices[category.id]}<button class="text-button" onclick={() => send({ action: 'vote', category: category.id, entry: null }, 'Choice cleared.')}>Clear choice</button>{/if}
          </fieldset>
        {/each}<p class="small muted">Anonymous voting uses this browser. Return here to edit your ballot. Another browser or cleared browser data will start a different ballot.</p>
      </section>
    {:else}
      <section class="gallery-section"><div class="section-title"><div><span class="eyebrow">THE CHARACTERS OF THE NIGHT</span><h2>{hostMode ? 'Everyone’s here.' : 'Meet the lineup.'}</h2></div><p class="muted">{hostMode ? 'A little housekeeping, a lot of character.' : 'Big ideas. Excellent disguises.'}</p></div>
        <div class="gallery-tools"><div class="filters" aria-label="Entry type">{#each [{ id: 'all', name: 'Everyone' }, { id: 'individual', name: 'Individuals' }, { id: 'couple', name: 'Couples' }] as item}<button class:selected={filter === item.id} aria-pressed={filter === item.id} onclick={() => filter = item.id}>{item.name}</button>{/each}</div><label class="search"><span aria-hidden="true">⌕</span><input aria-label="Search costumes" placeholder="Find a costume or name…" bind:value={search} /></label></div>
        <div class="entry-grid">{#each gallery as entry}
          <article class="costume-card" class:dimmed={entry.hidden}>
            <div class="costume-art art-{entry.number % 6}">{#if entry.photo}<img src={entry.photo} alt={entry.title} loading="lazy" />{:else}<span class="costume-emoji" aria-hidden="true">{entry.icon}</span><span class="no-photo">COSTUME PHOTO TO COME</span>{/if}<span class="entry-number">#{String(entry.number).padStart(2, '0')}</span><span class="entry-type">{entry.type === 'couple' ? '↔ Couple' : 'Individual'}</span></div>
            <div class="costume-details"><h3>{entry.title}</h3><p>{entry.names}</p>{#if entry.type === 'couple'}<span class="couple-note">Also in the individual lineup</span>{/if}
              {#if hostMode}<div class="moderation"><span class="approval-label">{entry.hidden ? 'Hidden' : entry.approved ? 'Approved' : 'Awaiting approval'}</span>{#if party.phase !== 'closed'}<div>{#if !entry.approved}<button disabled={busy} onclick={() => send({ action: 'moderate', id: entry.id, operation: 'approve' }, 'Entry approved.')}>Approve</button>{/if}<button disabled={busy} onclick={() => send({ action: 'moderate', id: entry.id, operation: 'hide' }, entry.hidden ? 'Entry restored.' : 'Entry hidden. Linked couples are also ineligible while a member is hidden.')}>{entry.hidden ? 'Restore' : 'Hide'}</button><button onclick={() => startEdit(entry)}>Edit</button></div>{/if}</div>{/if}
            </div>
          </article>
        {:else}<div class="empty"><h3>No costumes here just yet.</h3><p>Try a different search, or be the first to join the lineup.</p></div>{/each}</div>
      </section>
    {/if}
    {#if editing && hostMode}<section class="utility-panel"><h2>Edit entry</h2><form class="inline-form" onsubmit={async (event) => { event.preventDefault(); if (await send({ action: 'edit', id: editing, title: editTitle, names: editNames }, 'Entry updated.')) editing = ''; }}><label>Costume name<input bind:value={editTitle} maxlength="80" required /></label><label>Display name<input bind:value={editNames} maxlength="80" required /></label><button class="primary" disabled={busy}>Save</button><button type="button" class="secondary" onclick={() => editing = ''}>Cancel</button></form></section>{/if}
    {#if party.results}
      <section class="results"><div class="section-title"><div><span class="eyebrow">{party.phase === 'closed' ? 'A ROUND OF APPLAUSE' : 'FOR YOUR EYES ONLY'}</span><h2>{party.phase === 'closed' ? 'The results are in.' : 'Private live tallies.'}</h2></div><p class="muted">{party.phase === 'closed' ? 'Every great costume deserves its moment.' : 'Visible only to signed-in hosts.'}</p></div>
        <div class="result-grid">{#each party.results as result}<article class="result-card"><span class="result-star">✦</span><h3>{result.category.name}</h3><p class="small muted">{result.total} votes{result.winners.length > 1 ? ' · Tied for first' : ''}</p>{#if result.total === 0}<p class="no-votes">No votes yet. The suspense!</p>{:else}{#each result.rows as row}<div class="result-row" class:winner={result.winners.includes(row.entry.id)}><span>{row.entry.icon} {row.entry.title}{#if result.winners.includes(row.entry.id)} <small>{party.phase === 'closed' ? '★' : '↑'}</small>{/if}</span><strong>{row.count}</strong></div>{/each}{/if}</article>{/each}</div>
      </section>
    {/if}
    {#if hostMode}
      <section class="utility-panel"><span class="eyebrow">MAKE IT YOUR PARTY</span><h2>Awards for the evening.</h2><div class="category-list">{#each party.categories as category}<div><span><strong>{category.name}</strong><small>{category.type === 'couple' ? 'Couples' : 'Individuals'}</small></span>{#if party.phase === 'registration'}<button class="text-button" aria-label={`Remove ${category.name}`} disabled={busy} onclick={() => send({ action: 'remove-category', id: category.id }, 'Category removed.')}>Remove</button>{/if}</div>{/each}</div>
        {#if party.phase === 'registration'}<form class="inline-form" onsubmit={async (event) => { event.preventDefault(); if (await send({ action: 'category', name: categoryName, type: categoryType }, 'Category added.')) categoryName = ''; }}><label>Award name<input bind:value={categoryName} maxlength="50" placeholder="e.g. Funniest Costume" required /></label><label>Eligible entries<select bind:value={categoryType}><option value="individual">Individuals</option><option value="couple">Couples</option></select></label><button class="secondary" disabled={busy}>Add category +</button></form>{:else}<p class="small muted">Categories are locked now that registration has closed.</p>{/if}
      </section>
      {#if party.phase !== 'closed'}<section class="utility-panel"><h2>Two entries, one costume?</h2><p class="muted">Merge duplicates of the same type. The destination keeps its details; the latest vote per voter and category survives.</p><form class="inline-form" onsubmit={async (event) => { event.preventDefault(); if (await send({ action: 'merge', source: mergeSource, target: mergeTarget }, 'Entries merged.')) { mergeSource = ''; mergeTarget = ''; } }}><label>Duplicate entry<select bind:value={mergeSource} required><option value="">Choose duplicate</option>{#each party.entries as entry}<option value={entry.id}>#{entry.number} · {entry.title}</option>{/each}</select></label><label>Keep this entry<select bind:value={mergeTarget} required><option value="">Choose destination</option>{#each party.entries.filter(e => e.id !== mergeSource && e.type === party?.entries.find(s => s.id === mergeSource)?.type) as entry}<option value={entry.id}>#{entry.number} · {entry.title}</option>{/each}</select></label><button class="secondary" disabled={busy || !mergeSource || !mergeTarget}>Merge entries</button></form></section>{/if}
      <section class="reset-panel"><div><h3>Another practice round?</h3><p class="small muted">Reset removes all demo entries, photos, and ballots and restores the sample event.</p></div>{#if resetConfirm}<div><p class="small">Erase this demo’s changes?</p><button class="danger" disabled={busy} onclick={async () => { await send({ action: 'reset' }, 'Fresh start! The demo is back to registration.'); resetConfirm = false; tab = 'gallery'; }}>Yes, reset demo</button><button class="text-button" onclick={() => resetConfirm = false}>Cancel</button></div>{:else}<button class="secondary" onclick={() => resetConfirm = true}>Reset demo ↺</button>{/if}</section>
    {/if}
  {/if}
</main>
<footer><a class="brand" href="/">Tally Ho<span class="brand-dot">.</span></a><p>A little friendly competition. A lot of good company.</p><span>MADE FOR THE MOMENT ✦</span></footer>
