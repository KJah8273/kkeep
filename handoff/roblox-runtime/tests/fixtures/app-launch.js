// Public provider catalog launch function, retrieved 2026-11-20.
// Retained verbatim to verify the original API call and single navigation.
async function launch(placeId, job, btn) {
  // Jar mode: the engine is this same origin, so the game runs right here.
  if (JAR) {
    if (btn) { btn.disabled = true; btn.textContent = job ? "Joining…" : "Starting…"; }
    try { location.href = (await api(`/api/launch?placeId=${encodeURIComponent(placeId)}${job ? `&job=${encodeURIComponent(job)}` : ""}`)).url; }
    catch (e) { if (btn) btn.disabled = false; toast(e.message); }
    return;
  }
  const win = framed ? null : window.open("about:blank", "_blank");
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = job ? "Joining…" : "Starting…"; }
  try {
    const r = await api(`/api/launch?placeId=${encodeURIComponent(placeId)}${job ? `&job=${encodeURIComponent(job)}` : ""}`);
    if (framed) {
      const title = (btn?.closest(".wide,.sq")?.querySelector(".gname")?.textContent || document.querySelector("h1")?.textContent || "").trim();
      if (!(await playInAchroma(r.url, title))) window.open(r.url, "_blank");
    } else if (win) win.location.href = r.url; else location.href = r.url;
  } catch (e) {
    if (win) win.close();
    toast(e.message);
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}
