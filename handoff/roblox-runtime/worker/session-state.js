// Serialized into both the browser-local worker and the sign-in page. Keep
// ownership beside the existing token, in the same IndexedDB transaction.
// A login transfer owns a generation; ordinary HTTP cookie rotation keeps it.
// Nothing from this record is sent to the parent page or to a server.
export async function sessionStateTransaction(openDb, action, options = {}) {
  const database = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('kv', 'readwrite');
      const store = transaction.objectStore('kv');
      const tokenRead = store.get('token');
      const ownerRead = store.get('kkeep-session-owner');
      let result;
      ownerRead.onsuccess = () => {
        const current = typeof tokenRead.result === 'string' ? tokenRead.result : '';
        let owner = ownerRead.result;
        const valid = owner && Number.isSafeInteger(owner.generation) && owner.generation > 0;
        const advance = generation => {
          if (generation >= Number.MAX_SAFE_INTEGER) throw new Error('Browser session generation exhausted');
          return generation + 1;
        };
        try {
          // Older open pages may still write the original token key. Treat a
          // mismatch as a new owner rather than letting an old lease erase it.
          if (!valid || owner.token !== current) {
            owner = {generation:valid ? advance(owner.generation) : 1, token:current};
            store.put(owner, 'kkeep-session-owner');
          }
          const write = (token, generation) => {
            if (token) store.put(token, 'token');
            else store.delete('token');
            owner = {generation, token};
            store.put(owner, 'kkeep-session-owner');
          };
          if (action === 'inspect') result = {status:'current', ...owner};
          else if (action === 'capture') {
            if (typeof options.token !== 'string' || !options.token) throw new Error('Missing browser session');
            write(options.token, advance(owner.generation));
            result = {status:'stored', ...owner, previous:current};
          } else if (action === 'rotate') {
            if (!options.previous || current !== options.previous) result = {status:'stale'};
            else {
              write(options.token, owner.generation);
              result = {status:'stored', ...owner};
            }
          } else if (owner.generation !== options.generation) result = {status:'stale'};
          else if (action === 'matches') result = {status:'current', ...owner};
          else if (action === 'restore' || action === 'clear') {
            write(action === 'restore' && typeof options.token === 'string' ? options.token : '', advance(owner.generation));
            result = {status:'stored', ...owner};
          } else throw new Error('Unknown browser session operation');
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Browser session storage failed'));
    });
  } finally { database.close(); }
}

// Compare the stored token and write its rotation in one transaction: a late
// response cannot recreate a token deleted by logout or replace a newer login.
export async function storeRotatedSessionToken(up, previous, openDb, manageState = sessionStateTransaction) {
  // Sign-in has its own verified transfer. An anonymous request has no
  // session to rotate and must not create one from a delayed response.
  if (typeof previous !== 'string' || !previous) return 'none';
  let candidate = null;
  for (const [name, values] of Object.entries(up.rawHeaders || {})) {
    if (name.toLowerCase() !== 'set-cookie') continue;
    for (const cookie of [].concat(values)) {
      const match = /^\s*\.ROBLOSECURITY=([^;]*)/i.exec(cookie);
      if (match && match[1].length > 100 && match[1] !== previous) candidate = match[1];
    }
  }
  if (candidate === null) return 'none';
  return (await manageState(openDb, 'rotate', {previous, token:candidate})).status;
}


export function transformSessionState(text) {
  const replace=(from,to)=>{
    if(text.split(from).length!==2)throw new Error('Provider logout contract changed');
    text=text.replace(from,()=>to);
  };
  replace('\tconst POOL = 3;', `\tconst kkeepSessionState = ${sessionStateTransaction.toString()};\n\tconst POOL = 3;`);
  replace(`\tasync function keepRotatedToken(up, tok) {
\t\tconst raw = up.rawHeaders || {};
\t\tfor (const [k, v] of Object.entries(raw)) {
\t\t\tif (k.toLowerCase() !== "set-cookie") continue;
\t\t\tfor (const c of [].concat(v)) {
\t\t\t\tconst m = /^\\s*\\.ROBLOSECURITY=([^;]*)/i.exec(c);
\t\t\t\tif (m && m[1].length > MIN_TOKEN_LEN && m[1] !== tok) {
\t\t\t\t\tawait kv("put", "token", m[1]);
\t\t\t\t\ttokenMemo = null;
\t\t\t\t\tstats.rotated++;
\t\t\t\t}
\t\t\t}
\t\t}
\t}`, `\tasync function keepRotatedToken(up, tok) {
\t\tconst outcome = await (${storeRotatedSessionToken.toString()})(up, tok, db, kkeepSessionState);
\t\tif (outcome !== "none") tokenMemo = null;
\t\tif (outcome === "stored") stats.rotated++;
\t}`);
  // A logout must target the session selected when it began, even if another
  // tab signs in while the relay is opening or the response is in flight.
  replace('\tasync function rbxJson(host, path, { method = "GET", body = null } = {}) {',
    '\tasync function rbxJson(host, path, { method = "GET", body = null, sessionToken = null } = {}) {');
  replace('\t\tconst tok = await token();\n\t\tif (tok) headers["cookie"] = `.ROBLOSECURITY=${tok}`;\n\t\tif (body)',
    '\t\tconst tok = sessionToken === null ? await token() : sessionToken;\n\t\tif (tok) headers["cookie"] = `.ROBLOSECURITY=${tok}`;\n\t\tif (body)');
  replace(`\t\t\t\t\tif (await token()) await rbxJson("auth.roblox.com", "/v2/logout", { method: "POST" });
\t\t\t\t\tawait kv("del", "token");
\t\t\t\t\tforgetSession();`, `\t\t\t\t\tconst selected = await kkeepSessionState(db, "inspect");
\t\t\t\t\tif (selected.token) {
\t\t\t\t\t\tconst result = await rbxJson("auth.roblox.com", "/v2/logout", { method: "POST", sessionToken:selected.token });
\t\t\t\t\t\tif (result.status !== 200 && result.status !== 204) return json(502, {error:"Sign-out could not be confirmed. Try again."});
\t\t\t\t\t}
\t\t\t\t\tconst cleared = await kkeepSessionState(db, "clear", {generation:selected.generation});
\t\t\t\t\tforgetSession();
\t\t\t\t\tif (cleared.status !== "stored") return json(409, {error:"Your Roblox session changed. Sign out again if needed."});`);
  return text;
}
