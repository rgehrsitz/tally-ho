import { error } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readParty, dataDir } from '#lib/server/store.ts';
import { isHost } from '#lib/server/auth.ts';
import { publicView } from '#lib/domain.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ params, cookies }) => {
  const id = params.id;
  if (!/^[a-f0-9]{32}\.(png|jpeg|webp)$/.test(id)) error(404);
  if (!publicView(readParty(), '', isHost(cookies)).entries.some(e => e.photo === `/api/photos/${id}`)) error(404);
  try {
    const bytes = readFileSync(resolve(dataDir, 'photos', id));
    return new Response(bytes, { headers: { 'content-type': `image/${id.split('.').pop()}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch { error(404); }
};
