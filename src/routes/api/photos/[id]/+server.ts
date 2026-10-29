import { error } from '@sveltejs/kit';
import { photoAccess } from '#lib/server/store.ts';
import { isHost } from '#lib/server/auth.ts';
import { downloadPhoto } from '#lib/server/photos.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params, cookies }) => {
  const id = params.id;
  if (!/^[a-f0-9]{32}\.(png|jpeg|webp)$/.test(id)) error(404);
  // Checked on every request (no caching) so hiding an entry revokes its photo at once.
  const access = await photoAccess(`/api/photos/${id}`);
  if (!access || (access === 'pending' && !await isHost(cookies))) error(404);
  try {
    const bytes = await downloadPhoto(id);
    return new Response(new Uint8Array(bytes).buffer, { headers: { 'content-type': `image/${id.split('.').pop()}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch { error(404); }
};
