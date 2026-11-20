import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync, randomBytes} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON;');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
class Query {
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Query(this.sql,args);}
 async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
 async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}
}
export const helperPassword=randomBytes(20).toString('hex');
export const testPassword=randomBytes(20).toString('hex');
const salt=randomBytes(16).toString('hex');
const files=new Map();
export const env={
 HELPER_PASSWORD_HASH:salt+':'+pbkdf2Sync(helperPassword,salt,100000,32,'sha256').toString('hex'),
 OWNER_PASSWORD_HASH:salt+':'+pbkdf2Sync(testPassword,salt,100000,32,'sha256').toString('hex'),
 DB:{prepare:sql=>new Query(sql),async batch(ops){sqlite.exec('BEGIN');try{const r=await Promise.all(ops.map(x=>x.run()));sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}},
 BUCKET:{async put(key,data){files.set(key,new Uint8Array(data));},async get(key){return files.has(key)?{body:files.get(key)}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])files.delete(key);}}
};
