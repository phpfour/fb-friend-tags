(function () {
  "use strict";
  window.FT = window.FT || {};

  // ALL FB selectors live here. When FB breaks us, patch this file.
  window.FT.selectors = {
    version: 1,
    // Any anchor with role="link" and an href we can parse.
    // We match every role=link anchor and let userKey.js reject non-profile hrefs.
    profileAnchor: 'a[role="link"][href]',
    // The profile page's main name is rendered as plain text inside an <h1>
    // in the main region — no anchor. We inject relative to this h1.
    profileHeader: '[role="main"] h1, main h1, h1',
    // Candidates for the profile action button row (Friends / Message / Search).
    profileActionButton: '[role="main"] [role="button"], main [role="button"]',
    profileActionLabels: ["Message", "Friends", "Add friend", "Add Friend", "Follow", "Following", "Search", "Edit profile"],
    // Scoping roots for "row hover" affordance.
    feedPost: '[role="article"]',
    // Sentinel attributes (ours — do not change without migration).
    processedAttr: "data-ft-processed",
    managedAttr: "data-ft-managed",
  };
})();
