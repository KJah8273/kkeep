// Verbatim public provider escaping, error renderer and router, retrieved 2026-11-19.
const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const failed = (e) => `<div class="state"><b>Couldn't load this page.</b> ${esc(e.message)}<br><button class="btn btn-ghost" onclick="route()">Try again</button></div>`;

async function route() {
  const h = location.hash.slice(1) || "/";
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  document.title = "Roblox";
  window.scrollTo(0, 0);
  try {
    if (path === "/friends") await pageFriends();
    else if (path === "/search" && params.get("q")) await pageSearch(params);
    else if (path.startsWith("/game/")) await pageGame(path.slice(6).replace(/\D/g, ""));
    else if (path.startsWith("/user/")) await pageUser(path.slice(6).replace(/\D/g, ""));
    else await pageHome();
  } catch (e) {
    if (e.message !== "signed out") $page.innerHTML = topRow({ back: path !== "/" }) + failed(e);
  }
}
window.route = route;
