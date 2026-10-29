import { error } from '@sveltejs/kit';
import { readParty } from '#lib/server/store.ts';
import { isHost } from '#lib/server/auth.ts';
import { downloadPhoto } from '#lib/server/photos.ts';
import { publicView } from '#lib/domain.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params, cookies }) => {
  const id = params.id;
  if (!/^[a-f0-9]{32}\.(png|jpeg|webp)$/.test(id)) error(404);
  const party = await readParty();
  const visible = publicView(party, '').entries.some(e => e.photo === `/api/photos/${id}`);
  if (!visible && !(await isHost(cookies) && party.entries.some(e => e.photo === `/api/photos/${id}`))) error(404);
  try {
    const bytes = await downloadPhoto(id);
    return new Response(new Uint8Array(bytes).buffer, { headers: { 'content-type': `image/${id.split('.').pop()}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch { error(404); }
};
