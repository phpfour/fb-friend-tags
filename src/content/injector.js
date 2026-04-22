(function () {
  "use strict";
  window.FT = window.FT || {};

  const SEL = () => window.FT.selectors;
  const uk = () => window.FT.userKey;
  const contrast = () => window.FT.contrast;

  const AFFIX_CLASS = "ft-affix";
  const BADGE_CLASS = "ft-badge";
  const ADD_BTN_CLASS = "ft-add-btn";

  let cachedState = null;
  let lastHrefSeen = null;

  function setState(state) {
    cachedState = state;
    refreshAll();
  }

  function getState() { return cachedState; }

  // Call from observer flush; detects SPA navigation reliably regardless of
  // whether we can hook history.pushState (content scripts can't patch the
  // main-world history object).
  function maybeHandleNav() {
    if (location.href === lastHrefSeen) return;
    lastHrefSeen = location.href;
    refreshAll();
  }

  function canonicalKeyFrom(href) {
    const key = uk().extractUserKey(href);
    if (!key) return null;
    const v2i = (cachedState && cachedState.meta && cachedState.meta.vanityToId) || {};
    return uk().canonicalUserId(key, v2i);
  }

  function userKeyFor(anchor) {
    return canonicalKeyFrom(anchor.getAttribute("href"));
  }

  // The canonical userKey of the profile whose page we're currently on, or null.
  function currentProfileUserKey() {
    return canonicalKeyFrom(location.pathname + location.search);
  }

  function displayNameFor(anchor) {
    return (anchor.textContent || "").trim().slice(0, 80) || "this person";
  }

  function renderFor(anchor) {
    if (!cachedState) return;
    const s = SEL();
    if (!anchor || !anchor.isConnected) return;
    if (anchor.hasAttribute(s.processedAttr)) return;
    const canonical = userKeyFor(anchor);
    if (!canonical) return;
    // Skip avatar/image-only anchors — inject only where a visible name is rendered.
    const text = (anchor.textContent || "").trim();
    if (!text) return;
    if (anchor.querySelector("img") && text.length < 2) return;
    // On a profile page, skip anchors that reference the profile's own user —
    // the header already shows the badges; we don't need to repeat them on
    // every post by this person on their own profile.
    if (canonical === currentProfileUserKey()) return;
    anchor.setAttribute(s.processedAttr, "1");

    const tagIds = cachedState.assignments[canonical] || [];
    const tagsById = new Map(cachedState.tags.map(t => [t.id, t]));

    const affix = document.createElement("span");
    affix.className = AFFIX_CLASS;
    affix.setAttribute(s.managedAttr, "1");
    affix.setAttribute("data-ft-user", canonical);

    for (const tagId of tagIds) {
      const tag = tagsById.get(tagId);
      if (!tag) continue;
      affix.appendChild(makeBadge(tag));
    }

    if (!affix.childNodes.length) return; // no badges — nothing to show

    // Insert right after the anchor, as a sibling. If FB re-renders the parent,
    // the observer will re-process the new anchor and inject a fresh affix.
    anchor.insertAdjacentElement("afterend", affix);
  }

  function makeBadge(tag) {
    const el = document.createElement("span");
    el.className = BADGE_CLASS;
    el.setAttribute(window.FT.selectors.managedAttr, "1");
    el.textContent = tag.name;
    el.style.backgroundColor = tag.color;
    el.style.color = contrast().textColorFor(tag.color);
    el.title = tag.name;
    return el;
  }

  function removeAllAffixes(root = document) {
    root.querySelectorAll(`.${AFFIX_CLASS}`).forEach(n => n.remove());
  }
  function clearSentinels(root = document) {
    const attr = SEL().processedAttr;
    root.querySelectorAll(`[${attr}]`).forEach(a => a.removeAttribute(attr));
  }

  // FB's profile pages frequently have multiple H1s — a hidden/empty one for
  // a11y or layout reasons, plus the visible profile-name H1. Pick the first
  // one with actual visible text content.
  function findVisibleProfileHeader() {
    const s = SEL();
    const candidates = document.querySelectorAll(s.profileHeader);
    for (const c of candidates) {
      const txt = (c.textContent || "").trim();
      if (!txt) continue;
      // Skip if hidden via CSS.
      if (c.offsetParent === null && c.getClientRects().length === 0) continue;
      return c;
    }
    return null;
  }

  // Inject badges + "Tags" button inline at the end of the profile header <h1>.
  // Living inside the h1 keeps us out of FB's action-row grid/flex layout.
  function renderProfileHeader() {
    if (!cachedState) return;
    const userKey = currentProfileUserKey();
    if (!userKey) return;
    const s = SEL();
    const h1 = findVisibleProfileHeader();
    if (!h1 || !h1.isConnected) return;
    // If FB reused the same h1 element across SPA nav (same DOM node, new
    // text content), the sentinel and our stale affix are still attached.
    // Detect by comparing data-ft-user on the existing affix with the
    // currentProfileUserKey; if they differ, clear and re-inject.
    if (h1.hasAttribute(s.processedAttr)) {
      const existing = h1.querySelector("." + AFFIX_CLASS);
      const existingKey = existing ? existing.getAttribute("data-ft-user") : null;
      if (existingKey === userKey) return;
      if (existing) existing.remove();
      h1.removeAttribute(s.processedAttr);
    }

    const tagIds = cachedState.assignments[userKey] || [];
    const tagsById = new Map(cachedState.tags.map(t => [t.id, t]));
    const displayName = (h1.textContent || "").trim().slice(0, 80) || "this profile";

    const affix = document.createElement("span");
    affix.className = AFFIX_CLASS + " " + AFFIX_CLASS + "-h1";
    affix.setAttribute(s.managedAttr, "1");
    affix.setAttribute("data-ft-user", userKey);

    for (const tagId of tagIds) {
      const tag = tagsById.get(tagId);
      if (!tag) continue;
      affix.appendChild(makeBadge(tag));
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ft-tags-btn";
    btn.setAttribute(s.managedAttr, "1");
    btn.setAttribute("aria-label", "Edit tags for this profile");
    btn.textContent = "Tags" + (tagIds.length ? " · " + tagIds.length : "");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.FT.popover.open({ anchorEl: btn, userKey, displayName });
    });
    affix.appendChild(btn);

    h1.setAttribute(s.processedAttr, "1");
    h1.appendChild(affix);
  }

  function renderProfileTagsButton() { /* folded into renderProfileHeader */ }

  function refreshAll() {
    removeAllAffixes();
    clearSentinels();
    // Remove any stale Tags button; it gets re-injected below.
    document.querySelectorAll(".ft-tags-btn").forEach(n => n.remove());
    const anchors = document.querySelectorAll(SEL().profileAnchor);
    for (const a of anchors) renderFor(a);
    renderProfileHeader();
    renderProfileTagsButton();
  }

  window.FT.injector = {
    setState,
    getState,
    renderFor,
    renderProfileHeader,
    renderProfileTagsButton,
    maybeHandleNav,
    refreshAll,
    AFFIX_CLASS,
    BADGE_CLASS,
    ADD_BTN_CLASS,
  };
})();
