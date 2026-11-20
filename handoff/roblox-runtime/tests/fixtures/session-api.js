// Public provider jar worker excerpt, retrieved 2026-11-19.
// Identity cache, session API and invalidation retained verbatim for regression tests.
	let userMemo = null;
	async function currentUser() {
		const tok = await token();
		if (!tok) return null;
		if (userMemo && userMemo.tok === tok) return userMemo.user;
		let r = await rbxJson("users.roblox.com", "/v1/users/authenticated");
		for (let i = 0; i < 3 && r.status === 0; i++) {
			await new Promise((ok) => setTimeout(ok, 600 * (i + 1)));
			r = await rbxJson("users.roblox.com", "/v1/users/authenticated");
		}
		if (r.status === 0) throw new Error("couldn't reach Roblox");
		userMemo = {
			tok,
			user: r.status === 200 && r.data && r.data.id ? r.data : null
		};
		return userMemo.user;
	}
	const uiData = createData(rbxJson, () => userMemo && userMemo.user);
	function forgetSession() {
		tokenMemo = null;
		userMemo = null;
		csrf = "";
		clearCache();
	}
	async function rbxApi(req, url) {
		const p = url.pathname.slice(9);
		const q = url.searchParams;
		const json = (status, obj) => new Response(viaUs(JSON.stringify(obj)), {
			status,
			headers: {
				"content-type": "application/json",
				"cache-control": "no-store"
			}
		});
		try {
			if (p === "/session") {
				if (req.method === "DELETE") {
					if (await token()) await rbxJson("auth.roblox.com", "/v2/logout", { method: "POST" });
					await kv("del", "token");
					forgetSession();
					return json(200, { ok: true });
				}
				const u = await currentUser();
				return json(200, {
					loggedIn: !!u,
					user: u
				});
			}
			if (!await currentUser()) return json(401, { error: "not signed in" });
			if (p === "/launch") {
				const placeId = (q.get("placeId") || "").replace(/\D/g, "");
				if (!placeId) return json(400, { error: "bad or missing placeId" });
				const job = (q.get("job") || "").toLowerCase();
				return json(200, { url: `/play/${placeId}${JOB_ID.test(job) ? `?job=${job}` : ""}` });
			}
			if (p === "/ui/home") return json(200, await uiData.home());
			if (p === "/ui/friends") return json(200, await uiData.friends());
			if (p === "/ui/search") {
				const s = (q.get("q") || "").trim().slice(0, 50);
				if (!s) return json(400, { error: "missing q" });
				if (q.get("type") === "people") {
					if (s.length < 3) return json(200, {
						users: [],
						error: "Type at least 3 letters to search people."
					});
					return json(200, await uiData.searchPeople(s));
				}
				return json(200, { games: await uiData.searchGames(s) });
			}
			if (p === "/ui/profile") {
				const uid = (q.get("userId") || "").replace(/\D/g, "");
				if (!uid) return json(400, { error: "bad or missing userId" });
				const pr = await uiData.profile(uid);
				return pr ? json(200, pr) : json(404, { error: "person not found" });
			}
			if (p === "/ui/requests") return json(200, await uiData.requests());
			if (p === "/friend" && req.method === "POST") {
				let b = {};
				try {
					b = await req.json();
				} catch {}
				const id = String(b.userId || "").replace(/\D/g, "");
				const path = {
					add: "request-friendship",
					accept: "accept-friend-request",
					decline: "decline-friend-request",
					cancel: "unfriend"
				}[b.action];
				if (!id || !path) return json(400, { error: "bad friend request" });
				const r = await rbxJson("friends.roblox.com", `/v1/users/${id}/${path}`, {
					method: "POST",
					body: b.action === "add" ? { friendshipOriginSourceType: 0 } : {}
				});
				clearCache();
				if (r.status === 200 && r.data && r.data.isCaptchaRequired) return json(200, {
					ok: false,
					error: "Roblox wants a captcha for this one. Add them on roblox.com instead."
				});
				if (r.status === 200) return json(200, { ok: !(r.data && r.data.success === false) });
				const code = r.data && r.data.errors && r.data.errors[0];
				return json(200, {
					ok: false,
					error: r.status === 0 ? "Couldn't reach Roblox." : r.status === 429 ? "Roblox says slow down. Try again in a minute." : code && /captcha|challenge/i.test(code.message || "") ? "Roblox wants a captcha for this one. Add them on roblox.com instead." : code && code.message || `Roblox refused (${r.status}).`
				});
			}
			if (p === "/ui/game") {
				const placeId = (q.get("placeId") || "").replace(/\D/g, "");
				if (!placeId) return json(400, { error: "bad or missing placeId" });
				const g = await uiData.game(placeId);
				return g ? json(200, g) : json(404, { error: "game not found" });
			}
			return json(404, { error: "unknown endpoint" });
		} catch (e) {
			return json(502, { error: String(e && e.message || e) });
		}
	}
