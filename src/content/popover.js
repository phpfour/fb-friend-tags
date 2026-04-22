(function () {
  "use strict";
  window.FT = window.FT || {};

  const ROOT_CLASS = "ft-popover-root";
  const BACKDROP_CLASS = "ft-popover-backdrop";
  const PANEL_CLASS = "ft-popover-panel";
  let rootEl = null;
  let currentCtx = null;
  let escHandler = null;

  function open(ctx) {
    close();
    currentCtx = ctx;
    render(ctx);
  }

  function close() {
    if (rootEl) rootEl.remove();
    rootEl = null;
    currentCtx = null;
    if (escHandler) {
      document.removeEventListener("keydown", escHandler, true);
      escHandler = null;
    }
  }

  function render(ctx) {
    const { anchorEl, userKey, displayName } = ctx;
    const managedAttr = window.FT.selectors.managedAttr;
    const state = window.FT.injector.getState();
    if (!state) return;

    rootEl = document.createElement("div");
    rootEl.className = ROOT_CLASS;
    rootEl.setAttribute(managedAttr, "1");

    const backdrop = document.createElement("div");
    backdrop.className = BACKDROP_CLASS;
    backdrop.setAttribute(managedAttr, "1");
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) close();
    });
    rootEl.appendChild(backdrop);

    const panel = document.createElement("div");
    panel.className = PANEL_CLASS;
    panel.setAttribute(managedAttr, "1");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", `Tag ${displayName}`);
    rootEl.appendChild(panel);

    renderPanelContents(panel, userKey, displayName);
    document.body.appendChild(rootEl);
    positionPanel(panel, anchorEl);

    escHandler = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    };
    document.addEventListener("keydown", escHandler, true);

    const input = panel.querySelector("input.ft-popover-search");
    if (input) input.focus();
  }

  function positionPanel(panel, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const PANEL_W = 260;
    const gap = 6;
    let left = rect.left;
    const maxLeft = window.innerWidth - PANEL_W - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    let top = rect.bottom + gap;
    if (top + 320 > window.innerHeight) top = Math.max(8, rect.top - 320 - gap);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function renderPanelContents(panel, userKey, displayName) {
    panel.innerHTML = "";
    const state = window.FT.injector.getState();
    const managedAttr = window.FT.selectors.managedAttr;
    const assigned = new Set(state.assignments[userKey] || []);

    const header = document.createElement("div");
    header.className = "ft-popover-header";
    header.setAttribute(managedAttr, "1");
    header.textContent = "Tag " + displayName;
    panel.appendChild(header);

    const search = document.createElement("input");
    search.type = "text";
    search.className = "ft-popover-search";
    search.placeholder = "Search or create a tag…";
    search.setAttribute(managedAttr, "1");
    panel.appendChild(search);

    const list = document.createElement("div");
    list.className = "ft-popover-list";
    list.setAttribute(managedAttr, "1");
    panel.appendChild(list);

    const createRow = document.createElement("div");
    createRow.className = "ft-popover-create";
    createRow.setAttribute(managedAttr, "1");
    panel.appendChild(createRow);

    const refreshList = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = "";
      const tags = state.tags.slice().sort((a, b) => a.name.localeCompare(b.name));
      const visible = tags.filter(t => !q || t.name.toLowerCase().includes(q));
      for (const t of visible) list.appendChild(renderTagRow(t, assigned, userKey, managedAttr));
      const exact = tags.find(t => t.name.toLowerCase() === q);
      createRow.innerHTML = "";
      if (q && !exact) {
        const newTagBtn = document.createElement("button");
        newTagBtn.type = "button";
        newTagBtn.className = "ft-popover-create-btn";
        newTagBtn.setAttribute(managedAttr, "1");
        newTagBtn.textContent = `Create "${search.value.trim()}"`;
        newTagBtn.appendChild(renderColorPicker(managedAttr, async (color) => {
          const name = search.value.trim();
          if (!name) return;
          const newId = await window.FT.storage.addTag({ name, color });
          assigned.add(newId);
          const next = Array.from(assigned);
          await window.FT.storage.setUserTags(userKey, next);
          search.value = "";
          refreshList();
        }));
        createRow.appendChild(newTagBtn);
      }
    };

    search.addEventListener("input", refreshList);
    search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = search.value.trim();
      if (!q) return;
      const exact = state.tags.find(t => t.name.toLowerCase() === q.toLowerCase());
      if (exact) {
        toggleAssignment(exact, assigned, userKey).then(refreshList);
      } else {
        // Create with palette[0] as default color.
        const color = window.FT.storage.PALETTE[0];
        window.FT.storage.addTag({ name: q, color }).then(async (newId) => {
          assigned.add(newId);
          await window.FT.storage.setUserTags(userKey, Array.from(assigned));
          search.value = "";
          refreshList();
        });
      }
      e.preventDefault();
    });

    refreshList();
  }

  function renderTagRow(tag, assigned, userKey, managedAttr) {
    const row = document.createElement("label");
    row.className = "ft-popover-row";
    row.setAttribute(managedAttr, "1");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = assigned.has(tag.id);
    cb.setAttribute(managedAttr, "1");
    cb.addEventListener("change", async () => {
      if (cb.checked) assigned.add(tag.id);
      else assigned.delete(tag.id);
      await window.FT.storage.setUserTags(userKey, Array.from(assigned));
    });
    const swatch = document.createElement("span");
    swatch.className = "ft-popover-swatch";
    swatch.setAttribute(managedAttr, "1");
    swatch.style.backgroundColor = tag.color;
    const text = document.createElement("span");
    text.className = "ft-popover-name";
    text.setAttribute(managedAttr, "1");
    text.textContent = tag.name;
    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(text);
    return row;
  }

  async function toggleAssignment(tag, assigned, userKey) {
    if (assigned.has(tag.id)) assigned.delete(tag.id);
    else assigned.add(tag.id);
    await window.FT.storage.setUserTags(userKey, Array.from(assigned));
  }

  function renderColorPicker(managedAttr, onPick) {
    const wrap = document.createElement("span");
    wrap.className = "ft-popover-palette";
    wrap.setAttribute(managedAttr, "1");
    const PALETTE = window.FT.storage.PALETTE;
    for (const color of PALETTE) {
      const dot = document.createElement("span");
      dot.className = "ft-popover-dot";
      dot.setAttribute(managedAttr, "1");
      dot.style.backgroundColor = color;
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick(color);
      });
      wrap.appendChild(dot);
    }
    return wrap;
  }

  window.FT.popover = { open, close };
})();
