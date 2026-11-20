// Verbatim public provider header and sign-out function, retrieved 2026-11-19.
function topRow({ back = true, query = "", placeholder = "Search experiences", tab = "", live = false } = {}) {
  return `<div class="top">
    ${back ? `<button class="back" aria-label="Back" onclick="history.length>1?history.back():(location.hash='#/')">${I.back}</button>` : ""}
    <form class="search" role="search" onsubmit="event.preventDefault();const q=this.q.value.trim();if(q)location.hash='#/search?q='+encodeURIComponent(q)+'${tab ? `&tab=${tab}` : ""}'">${I.search}
      <input name="q" type="search" placeholder="${placeholder}" aria-label="${placeholder}" value="${esc(query)}" autocomplete="off">
      ${query && !live ? `<button type="button" class="clear" aria-label="Clear search" onclick="this.form.q.value='';this.form.q.focus()">${I.x}</button>` : ""}
    </form>
    <div class="gap"></div>
    ${state.robux != null ? `<div class="pill" title="Robux">${I.robux}${state.robux.toLocaleString()}</div>` : ""}
    <button class="round" aria-label="Sign out" title="Sign out" onclick="signOut()">${I.logout}</button>
  </div>`;
}
async function signOut() {
  if (!confirm("Sign out of Roblox here?")) return;
  await fetch(apiUrl("/api/session"), { method: "DELETE" }).catch(() => {});
  if (JAR) { toSignIn(); return; }
  location.href = "/";
}
window.signOut = signOut;
