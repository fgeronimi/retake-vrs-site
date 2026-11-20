// retake-vrs: progressive behaviour on top of complete HTML pages (docs/design.md).
// Theme toggle, search, tabs, tooltips, the what-if picker. No framework, no build.
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }

  // Theme: the head script already applied a saved choice; this wires the buttons.
  function setTheme(theme) {
    doc.setAttribute("data-theme", theme);
    store("rv-theme", theme);
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-theme") === theme));
    });
  }
  var current = doc.getAttribute("data-theme") ||
    (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.querySelectorAll("[data-set-theme]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-set-theme") === current));
    b.addEventListener("click", function () { setTheme(b.getAttribute("data-set-theme")); });
  });

  // Tabs: a [data-tabs] list of buttons pointing at panels by id; one panel visible.
  document.querySelectorAll("[data-tabs]").forEach(function (list) {
    var buttons = Array.prototype.slice.call(list.querySelectorAll("[data-target]"));
    function show(target) {
      buttons.forEach(function (b) {
        var on = b.getAttribute("data-target") === target;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(b.getAttribute("data-target"));
        if (panel) panel.hidden = !on;
      });
    }
    buttons.forEach(function (b, i) {
      b.addEventListener("click", function () { show(b.getAttribute("data-target")); });
      b.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        var next = buttons[(i + step + buttons.length) % buttons.length];
        next.focus();
        show(next.getAttribute("data-target"));
      });
    });
    if (buttons.length) show(buttons[0].getAttribute("data-target"));
  });

  // Tooltips: marks carry data-tip; the native <title> is dropped to avoid two tooltips.
  var tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);
  document.querySelectorAll("svg.chart [data-tip]").forEach(function (el) {
    var title = el.querySelector(":scope > title");
    if (title) title.remove();
  });
  function place(e) {
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    var y = e.clientY + 16 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 16;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = y + "px";
  }
  document.addEventListener("mousemove", function (e) {
    var el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tip.classList.remove("on"); return; }
    tip.textContent = el.getAttribute("data-tip");
    tip.classList.add("on");
    place(e);
  });

  // Search: teams and players, from assets/search.json, loaded on first focus.
  var input = document.getElementById("q");
  var results = document.getElementById("q-results");
  if (input && results) {
    var index = null;
    var home = input.getAttribute("data-home");
    var assets = input.getAttribute("data-assets");
    var none = input.getAttribute("data-none");
    function fold(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
    function load() {
      if (index) return Promise.resolve(index);
      return fetch(input.getAttribute("data-index")).then(function (r) { return r.json(); })
        .then(function (data) { index = data; return data; });
    }
    function initials(name) {
      var words = name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return "?";
      return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
    }
    function logo(t) {
      var box = document.createElement("span");
      box.className = "logo" + (t.l ? "" : " none");
      box.setAttribute("aria-hidden", "true");
      if (t.l) {
        var img = document.createElement("img");
        img.src = assets + "teams/" + t.l;
        img.alt = "";
        box.appendChild(img);
      } else {
        box.textContent = initials(t.n);
      }
      return box;
    }
    function render(items) {
      results.innerHTML = "";
      if (!items) { results.hidden = true; return; }
      if (!items.length) {
        var li = document.createElement("li");
        li.className = "none";
        li.textContent = none;
        results.appendChild(li);
      }
      items.forEach(function (t) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = home + "roster/" + t.s + ".html";
        a.appendChild(logo(t));
        a.appendChild(document.createTextNode("#" + t.r + " " + t.n));
        var small = document.createElement("small");
        small.textContent = t.p.join(" · ");
        a.appendChild(small);
        li.appendChild(a);
        results.appendChild(li);
      });
      results.hidden = false;
    }
    input.addEventListener("focus", load);
    input.addEventListener("input", function () {
      var q = fold(input.value.trim());
      if (q.length < 2) { render(null); return; }
      load().then(function (data) {
        var hits = data.filter(function (t) {
          return fold(t.n).indexOf(q) >= 0 || t.p.some(function (p) { return fold(p).indexOf(q) >= 0; });
        });
        render(hits.slice(0, 8));
      });
    });
    input.addEventListener("keydown", function (e) {
      var links = Array.prototype.slice.call(results.querySelectorAll("a"));
      if (e.key === "ArrowDown" && links.length) { e.preventDefault(); links[0].focus(); }
      if (e.key === "Escape") { input.value = ""; render(null); }
    });
    results.addEventListener("keydown", function (e) {
      var links = Array.prototype.slice.call(results.querySelectorAll("a"));
      var i = links.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? links[i - 1] : input).focus(); }
      if (e.key === "Escape") { input.focus(); render(null); }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search")) render(null);
    });
  }

})();
