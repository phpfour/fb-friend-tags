(function () {
  "use strict";
  window.FT = window.FT || {};

  const KEY_TAGS = "tags";
  const KEY_META = "meta";
  const ASG_PREFIX = "asg:";
  const ASG_BUCKETS = 8;
  const PER_ITEM_MAX = 8000;     // chrome.storage.sync QUOTA_BYTES_PER_ITEM is 8192; leave slack
  const DEBOUNCE_MS = 500;
  const SCHEMA_VERSION = 1;

  // Curated palette: each color passes WCAG AA against either #1c1e21 or #ffffff.
  const PALETTE = [
    "#e53e3e", "#dd6b20", "#d69e2e", "#38a169", "#319795", "#3182ce",
    "#5a67d8", "#805ad5", "#d53f8c", "#718096", "#2d3748", "#92400e"
  ];

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function bucketFor(userId) { return hashStr(String(userId)) % ASG_BUCKETS; }
  function bucketKey(idx) { return ASG_PREFIX + idx; }
  function newId() { return Math.random().toString(36).slice(2, 12); }

  function emptyState() {
    return { tags: [], assignments: {}, meta: { vanityToId: {} } };
  }

  function packState(state) {
    const items = {};
    items[KEY_TAGS] = JSON.stringify({ v: SCHEMA_VERSION, tags: state.tags });
    items[KEY_META] = JSON.stringify({ v: SCHEMA_VERSION, vanityToId: state.meta.vanityToId || {} });
    const buckets = {};
    for (const [userId, tagIds] of Object.entries(state.assignments)) {
      if (!tagIds || !tagIds.length) continue;
      const b = bucketFor(userId);
      (buckets[b] = buckets[b] || {})[userId] = tagIds;
    }
    for (const [idx, entries] of Object.entries(buckets)) {
      items[bucketKey(idx)] = JSON.stringify({ v: SCHEMA_VERSION, entries });
    }
    for (const [k, v] of Object.entries(items)) {
      if (v.length > PER_ITEM_MAX) {
        throw new Error(`[FriendTags] "${k}" is ${v.length}b, over ${PER_ITEM_MAX}b per-item cap.`);
      }
    }
    return items;
  }

  function unpackItems(items) {
    const state = emptyState();
    if (items[KEY_TAGS]) {
      try { state.tags = (JSON.parse(items[KEY_TAGS]).tags) || []; } catch (_) {}
    }
    if (items[KEY_META]) {
      try { state.meta.vanityToId = (JSON.parse(items[KEY_META]).vanityToId) || {}; } catch (_) {}
    }
    for (const [k, v] of Object.entries(items)) {
      if (!k.startsWith(ASG_PREFIX)) continue;
      try {
        const parsed = JSON.parse(v);
        Object.assign(state.assignments, parsed.entries || {});
      } catch (_) {}
    }
    return state;
  }

  function applyRemoteChange(state, key, newValue) {
    if (key === KEY_TAGS) {
      state.tags = newValue ? (JSON.parse(newValue).tags || []) : [];
    } else if (key === KEY_META) {
      state.meta = { vanityToId: newValue ? (JSON.parse(newValue).vanityToId || {}) : {} };
    } else if (key.startsWith(ASG_PREFIX)) {
      const idx = Number(key.slice(ASG_PREFIX.length));
      for (const userId of Object.keys(state.assignments)) {
        if (bucketFor(userId) === idx) delete state.assignments[userId];
      }
      if (newValue) {
        try {
          const parsed = JSON.parse(newValue);
          Object.assign(state.assignments, parsed.entries || {});
        } catch (_) {}
      }
    }
  }

  // --- instance state -------------------------------------------------------

  let state = null;
  let loadPromise = null;
  let pendingKeys = new Set();
  let inflightKeys = new Set();
  let flushTimer = null;
  const listeners = new Set();

  async function load() {
    if (state) return state;
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const all = await chrome.storage.sync.get(null);
          state = unpackItems(all || {});
        } catch (err) {
          console.error("[FriendTags] initial load failed", err);
          state = emptyState();
        }
        return state;
      })();
    }
    return loadPromise;
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  async function flush() {
    flushTimer = null;
    if (!pendingKeys.size) return;
    inflightKeys = pendingKeys;
    pendingKeys = new Set();
    let packed;
    try {
      packed = packState(state);
    } catch (err) {
      console.error(err);
      for (const k of inflightKeys) pendingKeys.add(k);
      inflightKeys = new Set();
      return;
    }
    const toWrite = {};
    const toRemove = [];
    for (const key of inflightKeys) {
      if (key in packed) toWrite[key] = packed[key];
      else toRemove.push(key);
    }
    try {
      if (Object.keys(toWrite).length) await chrome.storage.sync.set(toWrite);
      if (toRemove.length) await chrome.storage.sync.remove(toRemove);
    } catch (err) {
      console.error("[FriendTags] flush failed", err);
      for (const k of inflightKeys) pendingKeys.add(k);
    } finally {
      inflightKeys = new Set();
    }
    if (pendingKeys.size) scheduleFlush();
  }

  function emit() {
    for (const l of listeners) { try { l(state); } catch (_) {} }
  }

  function markBucketDirty(userId) { pendingKeys.add(bucketKey(bucketFor(userId))); }

  // --- public API -----------------------------------------------------------

  async function getState() { return await load(); }

  async function setUserTags(userId, tagIds) {
    await load();
    userId = String(userId);
    if (!tagIds || !tagIds.length) {
      if (userId in state.assignments) {
        delete state.assignments[userId];
        markBucketDirty(userId);
      }
    } else {
      state.assignments[userId] = tagIds.slice();
      markBucketDirty(userId);
    }
    scheduleFlush();
    emit();
  }

  async function addTag({ name, color }) {
    await load();
    const id = newId();
    state.tags.push({ id, name, color });
    pendingKeys.add(KEY_TAGS);
    scheduleFlush();
    emit();
    return id;
  }

  async function updateTag(tagId, patch) {
    await load();
    const tag = state.tags.find(t => t.id === tagId);
    if (!tag) return;
    Object.assign(tag, patch);
    pendingKeys.add(KEY_TAGS);
    scheduleFlush();
    emit();
  }

  async function deleteTag(tagId) {
    await load();
    const before = state.tags.length;
    state.tags = state.tags.filter(t => t.id !== tagId);
    if (state.tags.length === before) return;
    pendingKeys.add(KEY_TAGS);
    for (const userId of Object.keys(state.assignments)) {
      const next = state.assignments[userId].filter(t => t !== tagId);
      if (next.length === state.assignments[userId].length) continue;
      if (next.length) state.assignments[userId] = next;
      else delete state.assignments[userId];
      markBucketDirty(userId);
    }
    scheduleFlush();
    emit();
  }

  async function setVanityToId(vanity, id) {
    await load();
    state.meta.vanityToId[String(vanity)] = String(id);
    pendingKeys.add(KEY_META);
    scheduleFlush();
    emit();
  }

  async function exportAll() {
    await load();
    return {
      v: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tags: state.tags,
      assignments: state.assignments,
      meta: state.meta
    };
  }

  async function importAll(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid import payload");
    await load();
    state.tags = Array.isArray(data.tags) ? data.tags : [];
    state.assignments = (data.assignments && typeof data.assignments === "object") ? { ...data.assignments } : {};
    state.meta = { vanityToId: (data.meta && data.meta.vanityToId) || {} };
    pendingKeys.add(KEY_TAGS);
    pendingKeys.add(KEY_META);
    for (let i = 0; i < ASG_BUCKETS; i++) pendingKeys.add(bucketKey(i));
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    await flush();
    emit();
  }

  async function clearAll() {
    await load();
    state = emptyState();
    pendingKeys.clear();
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    try { await chrome.storage.sync.clear(); } catch (_) {}
    emit();
  }

  function onChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!state) return;
      let dirty = false;
      for (const [key, change] of Object.entries(changes)) {
        if (inflightKeys.has(key) || pendingKeys.has(key)) continue;
        dirty = true;
        applyRemoteChange(state, key, change.newValue);
      }
      if (dirty) emit();
    });
  }

  window.FT.storage = {
    PALETTE,
    SCHEMA_VERSION,
    getState,
    setUserTags,
    addTag,
    updateTag,
    deleteTag,
    setVanityToId,
    exportAll,
    importAll,
    clearAll,
    onChange,
    _pack: packState,
    _unpack: unpackItems,
    _hash: hashStr,
    _bucket: bucketFor,
  };
})();
