// Public provider jar worker HTTP/token excerpt, retrieved 2026-11-19.
	function db() {
		return new Promise((resolve, reject) => {
			const r = indexedDB.open("rbxjar", 1);
			r.onupgradeneeded = () => r.result.createObjectStore("kv");
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
	}
	async function kv(op, key, value) {
		const d = await db();
		return new Promise((resolve, reject) => {
			const s = d.transaction("kv", op === "get" ? "readonly" : "readwrite").objectStore("kv");
			const r = op === "get" ? s.get(key) : op === "del" ? s.delete(key) : s.put(value, key);
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
	}
	let tokenMemo = null;
	async function token() {
		if (!tokenMemo) tokenMemo = { token: await kv("get", "token") || "" };
		return tokenMemo.token;
	}
	const POOL = 3;
	async function keepRotatedToken(up, tok) {
		const raw = up.rawHeaders || {};
		for (const [k, v] of Object.entries(raw)) {
			if (k.toLowerCase() !== "set-cookie") continue;
			for (const c of [].concat(v)) {
				const m = /^\s*\.ROBLOSECURITY=([^;]*)/i.exec(c);
				if (m && m[1].length > MIN_TOKEN_LEN && m[1] !== tok) {
					await kv("put", "token", m[1]);
					tokenMemo = null;
					stats.rotated++;
				}
			}
		}
	}
	const HEDGE_MS = 4e3;
	async function rbxJson(host, path, { method = "GET", body = null } = {}) {
		const headers = {
			accept: "application/json",
			origin: ROBLOX_ORIGIN,
			referer: ROBLOX_ORIGIN + "/"
		};
		const tok = await token();
		if (tok) headers["cookie"] = `.ROBLOSECURITY=${tok}`;
		if (body) headers["content-type"] = "application/json";
		if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;
		const readOnly = method === "GET" || isReadPost(host, path.split("?")[0]);
		const go = async () => {
			try {
				const ep = await client();
				const run = () => ep.fetch(`https://${host}${path}`, {
					method,
					headers,
					body: body ? JSON.stringify(body) : void 0
				});
				return await (readOnly ? onSlot(0, run) : run());
			} catch (e) {
				if (!/stopped answering|was reset/.test(e && e.message)) dropClient(0);
				throw e;
			}
		};
		try {
			const again = readOnly;
			let up;
			for (let i = 0;; i++) try {
				up = method === "GET" ? await hedged(go) : await go();
				break;
			} catch (e) {
				if (!again || i >= 2) throw e;
				await new Promise((ok) => setTimeout(ok, 300 * (i + 1)));
			}
			if (up.status === 403 && up.headers.get("x-csrf-token") && headers["x-csrf-token"] !== up.headers.get("x-csrf-token")) {
				csrf = headers["x-csrf-token"] = up.headers.get("x-csrf-token");
				up = await go();
			}
			await keepRotatedToken(up, tok);
			let data = null;
			try {
				data = await up.json();
			} catch {}
			return {
				status: up.status,
				data
			};
		} catch (e) {
			diag("err", `ui ${method} ${host}${path.split("?")[0]}: ${e && (e.message || e)}`);
			return {
				status: 0,
				data: null
			};
		}
	}
