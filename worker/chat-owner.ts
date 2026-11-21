import type {BrowserDB} from './browser-data.ts';

/** Bind only the pre-existing account explicitly selected by the site owner. */
export async function chatOwnerAccount(db: BrowserDB): Promise<string | null> {
  const current = (await db.prepare('SELECT account FROM kkeep_chat_owner WHERE id=1').all()).results[0] as {account:string} | undefined;
  if (current) return current.account;
  await db.prepare('INSERT OR IGNORE INTO kkeep_chat_owner (id,account,created) SELECT 1,id,? FROM kkeep_accounts WHERE id=? AND username=?').bind(Date.now(),'342d1bf6-2554-4344-82ea-8ead8a7ed5a9','owner').run();
  const bound = (await db.prepare('SELECT account FROM kkeep_chat_owner WHERE id=1').all()).results[0] as {account:string} | undefined;
  return bound?.account || null;
}
