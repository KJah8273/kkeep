// Verbatim provider pages that cache header HTML across await, retrieved 2026-11-19.
async function pageUser(id) {
  const top = topRow({ placeholder: "Search people", tab: "people" });
  $page.innerHTML = top + loading(2);
  const u = await api(`/api/ui/profile?userId=${encodeURIComponent(id)}`);
  document.title = u.name + " · Roblox";
  const date = (s) => s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const where = u.game ? (u.game.name ? `Playing ${u.game.name}` : "In a game") : u.location ? u.location : u.presence === 1 ? "Online" : "Offline";
  const st = u.game ? "play" : u.presence ? "on" : "off";
  const name = esc(u.name);
  // Friend action, big. Join (when we can see their game) always comes first.
  const fr = u.status === "You" ? ""
    : u.status === "Friends" ? `<button class="big-ghost unfriend" data-fr="cancel" data-uid="${u.id}" onclick="if(!confirm('Remove ${name.replace(/'/g, "")} from your friends?'))event.stopImmediatePropagation()"><span class="is">${I.check}Friends</span><span class="un">Unfriend</span></button>`
    : u.status === "RequestSent" ? `<button class="big-ghost" disabled>Request sent</button>`
    : u.status === "RequestReceived" ? `<button class="${u.game?.placeId ? "big-ghost" : "play-big"}" data-fr="accept" data-uid="${u.id}">${I.check}Accept request</button><button class="big-ghost" data-fr="decline" data-uid="${u.id}">Decline</button>`
    : `<button class="${u.game?.placeId ? "big-ghost" : "play-big"}" data-fr="add" data-uid="${u.id}">${I.plus}Add friend</button>`;
  const join = u.game?.placeId ? `<button class="play-big" data-play="${u.game.placeId}" data-job="${esc(u.game.jobId || "")}">${I.play}Join ${name}</button>` : "";
  const theirFriend = (f) => `<a class="friend" href="#/user/${f.id}" title="${esc(f.name)}">
    <span class="av"><span class="face">${img(f.avatar, 74)}</span></span>
    <span class="nm">${esc(f.name)}</span><span class="st">${esc(at(f))}</span></a>`;
  $page.innerHTML = top + `
    <section class="hero user">
      <div class="media"><div class="main ustage ${st}">
        ${u.body ? `<img src="${esc(u.body)}" alt="${name}'s avatar" decoding="async">` : `<div class="uface">${img(u.avatar, 150)}</div>`}
        <span class="uchip ${st}">${u.game ? I.pad : "<i></i>"}<span>${esc(where)}</span></span>
      </div></div>
      <div class="info">
        <div class="ttl"><div class="ico round">${img(u.avatar, 60)}</div>
          <div><h1>${name}${u.verified ? I.verified : ""}</h1>${at(u) ? `<div class="by">${esc(at(u))}</div>` : ""}</div></div>
        <div class="gmeta">${u.friends != null ? `<span class="like">${I.users}${fmt(u.friends)} friends</span>` : ""}${u.followers != null ? `<span>${fmt(u.followers)} followers</span>` : ""}${u.following != null ? `<span>${fmt(u.following)} following</span>` : ""}</div>
        ${u.banned ? '<div class="desc">This account is banned.</div>'
          : u.about ? `<div class="desc" id="desc">${esc(u.about)}</div>${u.about.length > 160 || u.about.split("\n").length > 3 ? `<button class="more" onclick="const d=document.getElementById('desc');d.classList.toggle('open');this.textContent=d.classList.contains('open')?'Show less':'Read more'">Read more</button>` : ""}`
          : '<div class="desc none">No description yet.</div>'}
        ${join || fr ? `<div class="uacts">${join}${fr}</div>` : ""}
        <dl class="facts">
          ${u.friends != null ? `<dt>Friends</dt><dd>${fmt(u.friends)}</dd>` : ""}
          ${u.followers != null ? `<dt>Followers</dt><dd>${fmt(u.followers)}</dd>` : ""}
          ${u.following != null ? `<dt>Following</dt><dd>${fmt(u.following)}</dd>` : ""}
          ${u.created ? `<dt>Joined</dt><dd>${date(u.created)}</dd>` : ""}
        </dl>
      </div>
    </section>
    ${u.playing ? `<section>${secH("Playing now")}<div class="rail">${wideCard(u.playing)}</div></section>` : ""}
    ${u.theirFriends?.length ? `<section>${secH("Friends", u.friends)}<div class="rail">${u.theirFriends.map(theirFriend).join("")}</div></section>` : ""}
    ${u.favourites?.length ? `<section>${secH("Favourite experiences", u.favourites.length)}<div class="rail">${u.favourites.map(sqCard).join("")}</div></section>` : ""}`;
}


async function pageSearch(params) {
  const q = (params.get("q") || "").trim();
  const tab = params.get("tab") === "people" ? "people" : "experiences";
  const tabs = `<nav class="tabs" style="margin-top:-8px">
    <a class="tab ${tab === "experiences" ? "on" : ""}" href="#/search?q=${encodeURIComponent(q)}">Experiences</a>
    <a class="tab ${tab === "people" ? "on" : ""}" href="#/search?q=${encodeURIComponent(q)}&tab=people">People</a></nav>`;
  const head = `<div class="head"><div><h1>Results for <q>${esc(q)}</q></h1></div></div>`;
  const top = topRow({ query: q, placeholder: tab === "people" ? "Search people" : "Search experiences", tab: tab === "people" ? "people" : "" });
  $page.innerHTML = top + head + tabs + loading(2);
  if (tab === "people") {
    const d = await api(`/api/ui/search?type=people&q=${encodeURIComponent(q)}`);
    const act = (u) => u.status === "Friends" ? `<span class="sb done">${I.check}Friends</span>`
      : u.status === "RequestSent" ? '<span class="sb done">Request sent</span>'
      : u.status === "You" ? '<span class="sb done">You</span>'
      : u.status === "RequestReceived" ? `<button class="sb w" data-fr="accept" data-uid="${u.id}">Accept</button>`
      : `<button class="sb w" data-fr="add" data-uid="${u.id}">${I.plus || ""}Add friend</button>`;
    $page.innerHTML = top + head + tabs + (d.users.length
      ? `<section>${secH("Roblox", d.users.length)}<div class="people">${d.users.map((u) => personTile({ ...u, handle: at(u) }, act(u))).join("")}</div></section>`
      : `<div class="state">${esc(d.error || `No people found for “${q}”.`)}</div>`);
  } else {
    const d = await api(`/api/ui/search?q=${encodeURIComponent(q)}`);
    $page.innerHTML = top + head + tabs + (d.games.length
      ? `<section><div class="games">${d.games.map(sqCard).join("")}</div></section>`
      : `<div class="state">No experiences found for <b>${esc(q)}</b>. Try a shorter name.</div>`);
  }
}

