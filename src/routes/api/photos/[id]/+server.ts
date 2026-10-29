import { error } from '@sveltejs/kit';
import { photoAccess } from '#lib/server/store.ts';
import { isHost } from '#lib/server/auth.ts';
import { downloadPhoto } from '#lib/server/photos.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params, cookies }) => {
  const id = params.id;
  if (!/^[a-f0-9]{32}\.(png|jpeg|webp)$/.test(id)) error(404);
  const access = await photoAccess(`/api/photos/${id}`);
  if (!access || (access === 'pending' && !await isHost(cookies))) error(404);
  try {
    const bytes = await downloadPhoto(id);
    // Names are random and never reused, so a guest-visible photo can be cached
    // briefly on the phone; this keeps a gallery from re-fetching every photo
    // through the server. A photo hidden afterwards may stay on phones that
    // already loaded it for up to five minutes. Pending photos are never cached.
    const cache = access === 'public' ? 'private, max-age=300' : 'private, no-store';
    return new Response(new Uint8Array(bytes).buffer, { headers: { 'content-type': `image/${id.split('.').pop()}`, 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
  } catch { error(404); }
};
