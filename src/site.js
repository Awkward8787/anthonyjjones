(function () {
  "use strict";

  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = root.getAttribute("data-color-dark");
      var light = root.getAttribute("data-color-light");
      if (dark && light) meta.setAttribute("content", theme === "light" ? light : dark);
    }
    if (!toggle) return;
    var toLight = theme !== "light";
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    toggle.textContent = toLight ? "Light" : "Dark";
    toggle.setAttribute("aria-label", toLight ? "Switch to light theme" : "Switch to dark theme");
  }

  if (toggle) {
    applyTheme(currentTheme());
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem("theme", next);
      } catch (err) {
        /* private mode */
      }
    });
  }

  var form = document.querySelector("[data-live-search]");
  if (!form) return;

  var input = form.querySelector('input[type="search"]');
  if (!input) return;

  var chips = Array.prototype.slice.call(document.querySelectorAll("[data-tag-chip]"));
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-filter-item]"));
  var countEl = document.querySelector("[data-count]");
  var globalEmpty = document.querySelector("[data-global-empty]");
  var emptyMessage = globalEmpty ? globalEmpty.getAttribute("data-message") || "" : "";
  var known = new Set(
    chips
      .map(function (chip) {
        return chip.getAttribute("data-tag") || "";
      })
      .filter(Boolean),
  );
  var selected = new Set();
  var lock = false;

  items.forEach(function (el) {
    el._tokens = new Set(
      (el.getAttribute("data-search") || "").split(" ").filter(Boolean),
    );
    el._compact = el.getAttribute("data-compact") || "";
  });

  function fold(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokensOf(value) {
    return fold(value).split(/\s+/).filter(Boolean);
  }

  function syncChips() {
    chips.forEach(function (chip) {
      var tag = chip.getAttribute("data-tag") || "";
      var on = tag ? selected.has(tag) : selected.size === 0;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function itemMatches(el, tokens) {
    var textOk = tokens.every(function (token) {
      if (el._tokens.has(token)) return true;
      var packed = token.replace(/[^a-z0-9]+/g, "");
      return packed.length >= 4 && el._compact.indexOf(packed) !== -1;
    });
    if (!textOk) return false;
    if (selected.size === 0) return true;
    var tags = (el.getAttribute("data-tags") || "").split("|").filter(Boolean);
    if (!tags.length) return false;
    return tags.some(function (tag) {
      return selected.has(tag);
    });
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function apply() {
    var tokens = tokensOf(input.value);
    var filtering = tokens.length > 0 || selected.size > 0;
    var visibleByKind = {};

    items.forEach(function (el) {
      var ok = itemMatches(el, tokens);
      el.hidden = !ok;
      if (ok) {
        var kind = el.getAttribute("data-kind") || "item";
        visibleByKind[kind] = (visibleByKind[kind] || 0) + 1;
      }
    });

    var totalVisible = 0;
    Object.keys(visibleByKind).forEach(function (kind) {
      totalVisible += visibleByKind[kind];
    });
    var none = filtering && totalVisible === 0;

    document.querySelectorAll("[data-filter-group]").forEach(function (group) {
      var any = Array.prototype.some.call(
        group.querySelectorAll("[data-filter-item]"),
        function (el) {
          return !el.hidden;
        },
      );
      group.hidden = !any;
    });

    document.querySelectorAll("[data-filter-section]").forEach(function (section) {
      var list = section.querySelectorAll("[data-filter-item]");
      var any = Array.prototype.some.call(list, function (el) {
        return !el.hidden;
      });
      var empty = section.querySelector("[data-empty]");
      if (empty) empty.hidden = any || list.length === 0 || none;
    });

    document.querySelectorAll("[data-unfiltered-only]").forEach(function (el) {
      el.hidden = filtering;
    });

    if (globalEmpty) {
      globalEmpty.hidden = !none;
      if (none) globalEmpty.textContent = emptyMessage;
    }

    if (countEl) {
      if (!filtering) {
        countEl.textContent = "";
      } else if (none) {
        countEl.textContent = "No matches";
      } else {
        var parts = [];
        if (visibleByKind.project) parts.push(plural(visibleByKind.project, "project", "projects"));
        if (visibleByKind.service) parts.push(plural(visibleByKind.service, "service", "services"));
        if (visibleByKind.skill) parts.push(plural(visibleByKind.skill, "skill", "skills"));
        if (visibleByKind.role) parts.push(plural(visibleByKind.role, "role", "roles"));
        if (visibleByKind.study) parts.push(plural(visibleByKind.study, "program", "programs"));
        countEl.textContent = parts.join(", ");
      }
    }

    document.querySelectorAll(".project.is-open").forEach(function (project) {
      if (project.hidden) setProjectOpen("");
    });
  }

  function setProjectOpen(slug) {
    document.querySelectorAll(".project").forEach(function (project) {
      var open = Boolean(slug) && project.dataset.slug === slug;
      project.classList.toggle("is-open", open);
      var button = project.querySelector(".case-toggle");
      if (button) {
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.textContent = open ? "Close" : "Case study";
      }
    });
  }

  function writeUrl(mode) {
    var url = new URL(window.location.href);
    var q = input.value.trim();
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    url.searchParams.delete("tag");
    Array.from(selected).forEach(function (tag) {
      url.searchParams.append("tag", tag);
    });
    var opened = document.querySelector(".project.is-open");
    if (opened && opened.dataset.slug) url.searchParams.set("project", opened.dataset.slug);
    else url.searchParams.delete("project");
    var next = url.pathname + url.search + url.hash;
    var current = window.location.pathname + window.location.search + window.location.hash;
    if (next === current) return;
    if (mode === "push") history.pushState({ q: q }, "", url);
    else history.replaceState({ q: q }, "", url);
  }

  function openFromUrl(shouldScroll) {
    var url = new URL(window.location.href);
    var slug = url.searchParams.get("project") || "";
    if (!slug && window.location.hash) {
      var id = decodeURIComponent(window.location.hash.slice(1));
      var hashed = document.getElementById(id);
      if (hashed && hashed.classList.contains("project")) slug = id;
    }
    lock = true;
    setProjectOpen(slug);
    lock = false;
    if (shouldScroll && slug) {
      var el = document.getElementById(slug);
      if (el && !el.hidden) el.scrollIntoView({ block: "start" });
    }
  }

  function read(shouldScroll) {
    var url = new URL(window.location.href);
    input.value = url.searchParams.get("q") || "";
    selected = new Set(
      url.searchParams.getAll("tag").filter(function (tag) {
        return known.has(tag);
      }),
    );
    syncChips();
    apply();
    openFromUrl(shouldScroll);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    apply();
    writeUrl("push");
  });

  input.addEventListener("input", function () {
    apply();
    writeUrl("replace");
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var tag = chip.getAttribute("data-tag") || "";
      if (!tag) selected.clear();
      else if (selected.has(tag)) selected.delete(tag);
      else selected.add(tag);
      syncChips();
      apply();
      writeUrl("push");
    });
  });

  document.querySelectorAll("[data-skill-query]").forEach(function (button) {
    button.addEventListener("click", function () {
      input.value = button.getAttribute("data-skill-query") || "";
      apply();
      writeUrl("push");
      var work = document.getElementById("work");
      if (work) work.scrollIntoView({ block: "start" });
    });
  });

  document.querySelectorAll(".case-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
      if (lock) return;
      var project = button.closest(".project");
      if (!project) return;
      var slug = project.classList.contains("is-open") ? "" : project.dataset.slug;
      setProjectOpen(slug);
      writeUrl("replace");
    });
  });

  window.addEventListener("popstate", function () {
    read(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.isComposing) return;
    var target = event.target;
    var typing =
      target &&
      (target.closest && target.closest("input, textarea, select, [contenteditable='true']"));
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }
    if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }
    if (event.key === "Escape") {
      var opened = document.querySelector(".project.is-open");
      if (opened) {
        var toggleButton = opened.querySelector(".case-toggle");
        setProjectOpen("");
        if (toggleButton) toggleButton.focus();
        writeUrl("replace");
        return;
      }
      if (document.activeElement === input && input.value) {
        input.value = "";
        apply();
        writeUrl("replace");
      }
    }
  });

  var kbd = document.querySelector("[data-kbd]");
  if (kbd) {
    var mac = /Mac|iPhone|iPad/.test(navigator.userAgent || "");
    kbd.textContent = mac ? "⌘K" : "Ctrl K";
  }

  read(true);
})();
