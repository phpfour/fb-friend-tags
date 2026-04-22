(function () {
  "use strict";
  console.info("[FriendTags] v0.1.0 loaded");

  async function boot() {
    try {
      const state = await window.FT.storage.getState();
      window.FT.injector.setState(state);
      window.FT.observer.start();
      window.FT.storage.onChange((newState) => {
        window.FT.injector.setState(newState);
      });
      // popstate still fires in the isolated world for back/forward nav.
      window.addEventListener("popstate", () => window.FT.injector.maybeHandleNav());
      // Navigation API fires on all SPA navigations in the content-script
      // world (Chrome 102+). This is the cleanest signal for FB's soft nav.
      if (window.navigation && typeof window.navigation.addEventListener === "function") {
        window.navigation.addEventListener("navigate", () => {
          // Give FB a tick to start rendering the new page.
          setTimeout(() => window.FT.injector.maybeHandleNav(), 50);
        });
      }
      // Safety net: 1-second poll in case neither the observer nor the
      // Navigation API fires (e.g., H1 text-content mutation without childList).
      setInterval(() => window.FT.injector.maybeHandleNav(), 1000);
    } catch (err) {
      console.error("[FriendTags] boot failed", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
