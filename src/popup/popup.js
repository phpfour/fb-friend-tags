(function () {
  "use strict";

  const root = document.getElementById("ft-popup-root");
  const storage = window.FT.storage;
  const contrast = window.FT.contrast;

  let view = { kind: "list", search: "" };

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function render() {
    storage.getState().then((state) => {
      root.innerHTML = "";
      root.appendChild(view.kind === "list" ? renderList(state) : renderDetail(state));
    });
  }

  function renderList(state) {
    const counts = countsByTag(state);
    const q = view.search.trim().toLowerCase();
    const tagsSorted = state.tags.slice().sort((a, b) => a.name.localeCompare(b.name));
    const filtered = tagsSorted.filter(t => !q || t.name.toLowerCase().includes(q));

    const header = h("div", { class: "pop-header" },
      h("div", { class: "pop-title" }, "Friend Tags"),
      h("button", {
        class: "pop-btn pop-btn-primary",
        onclick: () => startCreate(),
      }, "+ New")
    );

    const search = h("input", {
      type: "text",
      class: "pop-search",
      placeholder: "Search tags…",
      value: view.search,
      oninput: (e) => { view.search = e.target.value; render(); },
    });

    const list = h("div", { class: "pop-list" });
    if (state.tags.length === 0) {
      list.appendChild(h("div", { class: "pop-empty" },
        h("div", { class: "pop-empty-title" }, "No tags yet"),
        h("div", { class: "pop-empty-body" },
          "Hover any name on Facebook and click the ",
          h("strong", {}, "+"),
          " to create your first tag.")));
    } else if (filtered.length === 0) {
      list.appendChild(h("div", { class: "pop-empty-row" }, "No tags match \"" + view.search + "\""));
    } else {
      for (const t of filtered) {
        list.appendChild(renderTagRow(t, counts[t.id] || 0));
      }
    }

    const footer = h("div", { class: "pop-footer" },
      h("button", { class: "pop-link", onclick: doImport }, "Import"),
      h("button", { class: "pop-link", onclick: doExport, disabled: state.tags.length === 0 && Object.keys(state.assignments).length === 0 }, "Export"),
      h("span", { class: "pop-version" }, "v0.1.0")
    );

    return h("div", { class: "pop-screen" }, header, search, list, footer);
  }

  function renderTagRow(tag, count) {
    const textColor = contrast.textColorFor(tag.color);
    return h("button", {
      class: "pop-row",
      onclick: () => { view = { kind: "detail", tagId: tag.id }; render(); },
    },
      h("span", { class: "pop-swatch", style: { backgroundColor: tag.color, color: textColor } }, tag.name),
      h("span", { class: "pop-count" }, String(count) + (count === 1 ? " person" : " people")),
      h("span", { class: "pop-chevron" }, "›")
    );
  }

  function renderDetail(state) {
    const tag = state.tags.find(t => t.id === view.tagId);
    if (!tag) { view = { kind: "list", search: "" }; return renderList(state); }
    const assigned = Object.entries(state.assignments)
      .filter(([, ids]) => ids.includes(tag.id))
      .map(([userKey]) => userKey)
      .sort();

    const header = h("div", { class: "pop-header" },
      h("button", { class: "pop-back", onclick: () => { view = { kind: "list", search: "" }; render(); } }, "‹ Back"),
      h("div", { class: "pop-title-small" }, "Edit tag")
    );

    const nameInput = h("input", {
      type: "text",
      class: "pop-input",
      value: tag.name,
      onchange: async (e) => {
        const v = e.target.value.trim();
        if (!v || v === tag.name) { e.target.value = tag.name; return; }
        await storage.updateTag(tag.id, { name: v });
        render();
      },
    });

    const palette = h("div", { class: "pop-palette" });
    for (const color of storage.PALETTE) {
      const isCurrent = color.toLowerCase() === tag.color.toLowerCase();
      palette.appendChild(h("button", {
        class: "pop-dot" + (isCurrent ? " pop-dot-selected" : ""),
        style: { backgroundColor: color },
        "aria-label": "Pick color " + color,
        onclick: async () => {
          await storage.updateTag(tag.id, { color });
          render();
        }
      }));
    }

    const peopleHeader = h("div", { class: "pop-section-label" },
      `People (${assigned.length})`
    );

    const peopleList = h("div", { class: "pop-people" });
    if (assigned.length === 0) {
      peopleList.appendChild(h("div", { class: "pop-empty-row" }, "No one has this tag yet."));
    } else {
      for (const userKey of assigned) {
        peopleList.appendChild(renderPersonRow(userKey, tag.id, state));
      }
    }

    const deleteBtn = h("button", {
      class: "pop-delete",
      onclick: async () => {
        if (!confirm(`Delete tag "${tag.name}"? This removes it from ${assigned.length} ${assigned.length === 1 ? "person" : "people"}.`)) return;
        await storage.deleteTag(tag.id);
        view = { kind: "list", search: "" };
        render();
      }
    }, "Delete tag");

    return h("div", { class: "pop-screen" },
      header,
      h("label", { class: "pop-label" }, "Name"),
      nameInput,
      h("label", { class: "pop-label" }, "Color"),
      palette,
      peopleHeader,
      peopleList,
      deleteBtn
    );
  }

  function renderPersonRow(userKey, tagId, state) {
    const [kind, value] = userKey.split(":", 2);
    const label = kind === "id" ? value : "@" + value;
    const href = kind === "id"
      ? "https://facebook.com/profile.php?id=" + encodeURIComponent(value)
      : "https://facebook.com/" + encodeURIComponent(value);
    return h("div", { class: "pop-person" },
      h("a", { class: "pop-person-link", href, target: "_blank", rel: "noopener noreferrer" }, label),
      h("button", {
        class: "pop-person-remove",
        "aria-label": "Remove " + label + " from this tag",
        onclick: async () => {
          const existing = state.assignments[userKey] || [];
          const next = existing.filter(id => id !== tagId);
          await storage.setUserTags(userKey, next);
          render();
        }
      }, "×")
    );
  }

  async function startCreate() {
    const name = prompt("Tag name:");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const color = storage.PALETTE[Math.floor(Math.random() * storage.PALETTE.length)];
    const id = await storage.addTag({ name: trimmed, color });
    view = { kind: "detail", tagId: id };
    render();
  }

  function countsByTag(state) {
    const counts = {};
    for (const ids of Object.values(state.assignments)) {
      for (const id of ids) counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }

  async function doExport() {
    const data = await storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "friend-tags-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function doImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm("Import will replace all current tags and assignments. Continue?")) return;
        await storage.importAll(data);
        view = { kind: "list", search: "" };
        render();
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    });
    input.click();
  }

  // Reflect FB dark mode preference where we can.
  if (matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.classList.add("__fb-dark-mode");
  }

  storage.onChange(() => render());
  render();
})();
