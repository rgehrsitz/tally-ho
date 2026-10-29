/** Local HTTP protocol fixture, not a substitute for a real Supabase rehearsal. */
import { createServer } from 'node:http';
export const hostUserId = '00000000-0000-4000-8000-000000000001';
export const outsiderUserId = '00000000-0000-4000-8000-000000000002';
export const otherEventUserId = '00000000-0000-4000-8000-000000000003';
export async function fakeSupabase() {
  const objects = new Map<string, Buffer>();
  const tokens = new Map<string, string>();
  const refreshes = new Map<string, string>();
  let serial = 0;
  const state = { publicBucket: false, failStorage: false, refreshCount: 0, downloads: 0 };
  const user = (id: string) => ({ id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: { role: 'host', is_admin: true }, created_at: '2026-01-01T00:00:00Z' });
  function session(id: string, expiresIn = 3600) {
    const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+expiresIn })).toString('base64url');
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${payload}.fixture${++serial}`;
    const refresh = `refresh-fixture-${serial}`;
    tokens.set(token,id); refreshes.set(refresh,id);
    return { access_token: token, refresh_token: refresh, expires_in: expiresIn, expires_at: Math.floor(Date.now()/1000)+expiresIn, token_type: 'bearer', user: user(id) };
  }
  const server = createServer(async (req,res) => {
    try {
      const url = new URL(req.url!, 'http://fixture');
      const chunks: Buffer[]=[]; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes=Buffer.concat(chunks);
      const json=(status:number, data:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
      const bearer=req.headers.authorization?.replace(/^Bearer /,'') ?? '';
      if (url.pathname.startsWith('/auth/v1/')) {
        if (req.headers.apikey !== 'fixture-publishable') {json(403,{message:'Wrong Auth key'});return;}
        if (url.pathname === '/auth/v1/token') {
          const input=JSON.parse(bytes.toString());
          if (url.searchParams.get('grant_type') === 'refresh_token') {
            const id=refreshes.get(input.refresh_token);
            if (!id) {json(400,{error_code:'refresh_token_not_found',msg:'Invalid refresh token'});return;}
            state.refreshCount++; refreshes.delete(input.refresh_token); json(200,session(id)); return;
          }
          const ids:Record<string,string>={'host@example.test':hostUserId,'refresh@example.test':hostUserId,'outsider@example.test':outsiderUserId,'other-event@example.test':otherEventUserId};
          if (!ids[input.email] || input.password !== 'fixture-password') {json(400,{error_code:'invalid_credentials',msg:'Invalid credentials'});return;}
          json(200,session(ids[input.email],input.email === 'refresh@example.test' ? 1 : 3600));return;
        }
        if (url.pathname === '/auth/v1/user') {
          const id=tokens.get(bearer);if(!id){json(401,{code:401,msg:'Invalid access token'});return;}json(200,user(id));return;
        }
        if (url.pathname === '/auth/v1/logout') {tokens.delete(bearer);res.writeHead(204);res.end();return;}
        json(404,{});return;
      }
      if (url.pathname.startsWith('/storage/v1/')) {
        if(req.headers.apikey !== 'fixture-secret') {json(403,{message:'Private bucket'});return;}
        if(state.failStorage){json(503,{message:'Fixture storage unavailable'});return;}
        if(url.pathname === '/storage/v1/bucket/costume-photos') {json(200,{id:'costume-photos',name:'costume-photos',public:state.publicBucket});return;}
        const prefix='/storage/v1/object/costume-photos/';
        if(url.pathname.startsWith(prefix)) {
          const key=decodeURIComponent(url.pathname.slice(prefix.length));
          if(req.method==='POST'){objects.set(key,bytes);json(200,{Key:`costume-photos/${key}`});return;}
          if(req.method==='GET'){state.downloads++;const file=objects.get(key);if(!file){json(404,{});return;}res.writeHead(200,{'content-type':'image/png'});res.end(file);return;}
        }
        if(url.pathname === '/storage/v1/object/costume-photos' && req.method==='DELETE'){
          const {prefixes}=JSON.parse(bytes.toString()); for(const key of prefixes)objects.delete(key);json(200,[]);return;
        }
        json(404,{});return;
      }
      json(404,{});
    } catch {res.writeHead(500);res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  return { url, objects, state, revokeAll:()=>{tokens.clear();refreshes.clear();}, close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())) };
}
