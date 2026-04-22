(function () {
  "use strict";
  window.FT = window.FT || {};

  const pending = new Set();
  let scheduled = false;
  let mo = null;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; flush(); };
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 200 });
    else setTimeout(run, 50);
  }

  function flush() {
    // Detect SPA navigation (content scripts can't patch main-world history).
    window.FT.injector.maybeHandleNav();

    const batch = pending;
    for (const a of batch) {
      if (a && a.isConnected) window.FT.injector.renderFor(a);
    }
    batch.clear();
    // Cheap idempotent call — re-attach badges/Tags button if FB re-rendered the header.
    window.FT.injector.renderProfileHeader();
  }

  function enqueueAnchorsIn(root) {
    if (!root) return;
    const sel = window.FT.selectors.profileAnchor;
    if (root.nodeType === 1) {
      if (root.matches && root.matches(sel)) pending.add(root);
      if (root.querySelectorAll) {
        const matches = root.querySelectorAll(sel);
        for (const a of matches) pending.add(a);
      }
    }
  }

  function handleMutations(records) {
    const managedAttr = window.FT.selectors.managedAttr;
    let sawAnyAdded = false;
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Ignore our own injected elements.
        if (node.hasAttribute && node.hasAttribute(managedAttr)) continue;
        sawAnyAdded = true;
        enqueueAnchorsIn(node);
      }
    }
    // Any DOM addition may be FB lazily rendering the profile H1 after nav —
    // schedule a flush so renderProfileHeader gets a chance to run.
    if (sawAnyAdded) schedule();
  }

  function start() {
    if (mo) return;
    mo = new MutationObserver(handleMutations);
    mo.observe(document.body, { childList: true, subtree: true });
    // Initial sweep.
    const anchors = document.querySelectorAll(window.FT.selectors.profileAnchor);
    for (const a of anchors) pending.add(a);
    schedule();
  }

  function stop() {
    if (mo) mo.disconnect();
    mo = null;
    pending.clear();
  }

  window.FT.observer = { start, stop };
})();
