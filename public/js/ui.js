// ui.js — resilient version for single-pill or grid layouts
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // Always call the same origin as the page (avoids CORS/mixed-origin issues)
  const API_BASE = window.location.origin;

  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const escapeHtml = (s = "") =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );

function extractCodeFromValue(v='') {
  // (...SFO)  → SFO
  const m = v.match(/\(([A-Z]{3})\)\s*$/);
  if (m) return m[1];
  // SFO - ... → SFO
  const n = v.match(/^\s*([A-Z]{3})\b/);
  if (n) return n[1];
  return v.trim().toUpperCase();
}


  // ---------- elements ----------
  const form = $("#flight-search");
  if (!form) {
    console.warn("[ui] #flight-search not found; aborting init");
    return;
  }

  const originEl = $("#origin");
  const originList = $("#origin-list");
  const destEl = $("#destination");
  const destList = $("#destination-list");

  const depEl = $("#departureDate");
  const retEl = $("#returnDate");
  const swapBtn = $("#swap");

  // Trip type (optional UI)
  const tripTypeBtn = $("#tripType");
  const tripTypeMenu = tripTypeBtn?.nextElementSibling || null;
  const tripTypeHidden = form.querySelector('input[name="tripType"]');
  const tripLabel = document.querySelector("[data-trip-label]");

  // Travelers
  const travOpen = $("#travOpen");
  const travDialog = $("#travDialog");
  const travDone = $("#travDone");
  const adultsHidden = form.querySelector('input[name="adults"]');
  const travelClassHidden = form.querySelector('input[name="travelClass"]');
  const adultsCountEl = $("#adultsCount");
  const cabinEl = $("#cabin");
  const travSummary = $("#travSummary");

  // ---------- dates ----------
  if (depEl) {
    depEl.min = todayISO();
    depEl.addEventListener(
      "change",
      () => {
        if (retEl) retEl.min = depEl.value || todayISO();
      },
      { passive: true }
    );
  }
  if (retEl) retEl.min = todayISO();

  // ---------- swap ----------
  if (swapBtn && originEl && destEl) {
    swapBtn.addEventListener("click", () => {
      const a = originEl.value;
      originEl.value = destEl.value;
      destEl.value = a;
      // close any open lists
      if (originList) originList.style.display = "none";
      if (destList) destList.style.display = "none";
    });
  }

  // ---------- trip type dropdown (optional) ----------
  const retCell =
    document.querySelector(".pill-return") ||
    document.querySelector(".fw-return");
  const applyTripType = (val) => {
    if (!retCell || !retEl) return;
    const isOneWay = val === "oneway";
    retCell.hidden = isOneWay;
    if (isOneWay) retEl.value = "";
  };

  if (tripTypeBtn && tripTypeMenu && tripTypeHidden) {
    tripTypeBtn.addEventListener("click", () => {
      const open = tripTypeMenu.style.display === "block";
      tripTypeMenu.style.display = open ? "none" : "block";
      tripTypeBtn.setAttribute("aria-expanded", String(!open));
    });

    tripTypeMenu.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      const val = li.dataset.value;
      tripTypeHidden.value = val;
      [...tripTypeMenu.children].forEach((x) =>
        x.setAttribute("aria-selected", String(x === li))
      );
      if (tripLabel) tripLabel.textContent = li.textContent;
      tripTypeMenu.style.display = "none";
      tripTypeBtn.setAttribute("aria-expanded", "false");
      applyTripType(val);
    });

    document.addEventListener("click", (e) => {
      if (!tripTypeBtn.contains(e.target)) tripTypeMenu.style.display = "none";
    });

    // initial
    applyTripType(tripTypeHidden.value || "roundtrip");
  }

  // ---------- travelers popover ----------
  const refreshTravSummary = () => {
    if (!travSummary) return;
    const a = Math.max(1, Number(adultsHidden?.value || "1"));
    const raw = (travelClassHidden?.value || "ECONOMY").replace("_", " ");
    const cls = raw.charAt(0) + raw.slice(1).toLowerCase();
    travSummary.textContent = `${a} Adult${a > 1 ? "s" : ""}, ${cls}`;
  };
  refreshTravSummary();

  if (travOpen && travDialog) {
    travOpen.addEventListener("click", () => {
      travDialog.hidden = !travDialog.hidden;
      travOpen.setAttribute("aria-expanded", String(!travDialog.hidden));
    });

    document.addEventListener("click", (e) => {
      if (!travDialog || !travOpen) return;
      if (!travDialog.contains(e.target) && !travOpen.contains(e.target)) {
        travDialog.hidden = true;
        travOpen.setAttribute("aria-expanded", "false");
      }
    });

    // Support both old .fw-step and new .pill-step
    travDialog.addEventListener("click", (e) => {
      const btn = e.target.closest(".fw-step, .pill-step");
      if (!btn) return;
      const delta = Number(btn.dataset.delta);
      const step = btn.dataset.step;
      if (step === "adults") {
        const v = Math.max(1, Number(adultsHidden?.value || "1") + delta);
        if (adultsHidden) adultsHidden.value = String(v);
        if (adultsCountEl) adultsCountEl.textContent = String(v);
        refreshTravSummary();
      }
    });

    cabinEl?.addEventListener("change", () => {
      if (travelClassHidden) travelClassHidden.value = cabinEl.value;
      refreshTravSummary();
    });

    travDone?.addEventListener("click", () => {
      travDialog.hidden = true;
      travOpen.setAttribute("aria-expanded", "false");
    });
  }

  // ---------- autocomplete ----------
  function bindAutocomplete(input, list) {
    if (!input || !list) return;

    let items = [],
      active = -1,
      timer = null,
      selecting = false;

    const render = () => {
      list.innerHTML = "";
      if (!items.length) {
        list.style.display = "none";
        return;
      }
      for (const it of items) {
        const code = it.iataCode || "";
        const city = it.address?.cityName || it.name || it.detailedName || "";
        const country = it.address?.countryName || "";
        const label = city || code; // what we show before (CODE)

        const li = document.createElement("li");
        li.dataset.code = code; // keep the code for later
        li.dataset.label = label; // keep a clean label
        li.innerHTML = `<strong>${escapeHtml(code)}</strong> — ${escapeHtml(
          city
        )}${country ? " (" + escapeHtml(country) + ")" : ""}`;

        li.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          selecting = true;
          // 1) Show a nice value in the input
          input.value = `${label} (${code})`;
          // 2) Store the IATA code safely on the input
          input.dataset.code = code;
          input.dataset.label = label;
          list.style.display = "none";

          setTimeout(() => (selecting = false), 0);
        });

        list.appendChild(li);
      }

      list.style.display = "block";
    };

    const search = async (q) => {
      if (!q || q.length < 2) {
        items = [];
        render();
        return;
      }
      try {
        const r = await fetch(
          `${API_BASE}/api/autocomplete?keyword=${encodeURIComponent(q)}`
        );
        const data = await r.json();
        items = Array.isArray(data) ? data : data?.data || [];
      } catch {
        items = [];
      }
      render();
    };

    input.addEventListener("input", () => {
      delete input.dataset.code;
      delete input.dataset.label;
      clearTimeout(timer);
      timer = setTimeout(() => search(input.value.trim()), 180);
    });

    input.addEventListener("keydown", (e) => {
      const all = [...list.children];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = Math.min(all.length - 1, active + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(0, active - 1);
      } else if (e.key === "Enter") {
        if (active >= 0 && all[active]) {
          e.preventDefault();
          all[active].dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true })
          );
        }
      } else return;
      all.forEach((li, i) => li.classList.toggle("active", i === active));
    });

    document.addEventListener("pointerdown", (e) => {
      if (selecting) return;
      if (e.target === input) return;
      // close if click is not inside any autocomplete list
      if (!e.target.closest(".pill-ac, .ac, #origin-list, #destination-list")) {
        list.style.display = "none";
      }
    });
  }

  bindAutocomplete(originEl, originList);
  bindAutocomplete(destEl, destList);

  // ---------- submit ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const trip = (tripTypeHidden?.value || "roundtrip").toLowerCase();
const origin = originEl?.dataset.code || extractCodeFromValue(originEl?.value || '');
const destination = destEl?.dataset.code || extractCodeFromValue(destEl?.value || '');
    const departureDate = depEl?.value || "";
    const returnDate = retEl?.value || "";
    const adults = Math.max(1, parseInt(adultsHidden?.value || "1", 10));
    const travelClass = travelClassHidden?.value || "ECONOMY";

    if (!origin || !destination || !departureDate) {
      alert("Please select origin, destination and a departure date.");
      return;
    }
    if (trip === "roundtrip" && !returnDate) {
      alert("Please select a return date or switch to One way.");
      return;
    }

    const params = new URLSearchParams({
      origin,
      destination,
      departureDate,
      adults: String(adults),
      travelClass,
    });
    if (trip === "roundtrip") params.append("returnDate", returnDate);

    window.location.href = `flights.html?${params.toString()}`;
  });
});
