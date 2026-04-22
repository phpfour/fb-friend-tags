(function () {
  "use strict";
  window.FT = window.FT || {};

  const RESERVED = new Set([
    "home", "watch", "marketplace", "groups", "events", "reel", "reels",
    "stories", "messages", "notifications", "settings", "help", "pages",
    "gaming", "fundraisers", "saved", "memories", "friends", "search",
    "bookmarks", "policies", "privacy", "terms", "login", "recover",
    "business", "ads", "legal", "hashtag", "photo", "photos", "video",
    "videos", "story", "live", "games", "weather", "jobs", "dating",
    "latest", "lite"
  ]);

  // extractUserKey(href) -> { kind: "id"|"vanity", value: string } | null
  function extractUserKey(href) {
    if (!href || typeof href !== "string") return null;
    let url;
    try { url = new URL(href, location.origin); } catch (_) { return null; }

    const host = url.hostname;
    if (host && !/(^|\.)facebook\.com$/.test(host)) return null;

    let path = url.pathname.replace(/\/+$/, "");

    // /profile.php?id=N — numeric ID, permanent.
    if (path === "/profile.php") {
      const id = url.searchParams.get("id");
      if (id && /^\d+$/.test(id)) return { kind: "id", value: id };
      return null;
    }

    // /people/Name/NUMERIC/ — some locales. Trailing numeric is the ID.
    const peopleMatch = path.match(/^\/people\/[^\/]+\/(\d+)$/);
    if (peopleMatch) return { kind: "id", value: peopleMatch[1] };

    // /<vanity> — top-level single segment.
    const topMatch = path.match(/^\/([^\/]+)$/);
    if (topMatch) {
      const seg = topMatch[1];
      if (!seg) return null;
      if (RESERVED.has(seg.toLowerCase())) return null;
      if (!/^[A-Za-z0-9.][A-Za-z0-9.\-]*$/.test(seg)) return null;
      if (seg.length < 3 || seg.length > 50) return null;
      return { kind: "vanity", value: seg };
    }

    return null;
  }

  // Canonicalize with known vanity->id mapping, preferring numeric.
  function canonicalUserId(key, vanityToId) {
    if (!key) return null;
    if (key.kind === "id") return "id:" + key.value;
    const id = vanityToId && vanityToId[key.value];
    if (id) return "id:" + id;
    return "v:" + key.value;
  }

  window.FT.userKey = { extractUserKey, canonicalUserId };
})();
