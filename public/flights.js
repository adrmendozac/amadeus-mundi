(() => {
  "use strict";

  // ---------- basics ----------
  const API_BASE = window.location.origin;

  // Small DOM helpers (define ONCE)
  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }
  function on(el, evt, fn) {
    if (el) el.addEventListener(evt, fn);
  }

  const criteriaEl = $("#criteria");
  const resultsEl  = $("#results");

  // ---------- formatters & helpers ----------
  function isoToMins(iso) {
    const m = /P(T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(iso || "");
    return (m && m[2] ? +m[2] : 0) * 60 + (m && m[3] ? +m[3] : 0);
  }

  function getOperatorLabel(segment) {
    const marketing = segment?.carrierCode;
    const operator  = segment?.operating?.carrierCode;
    if (!operator || operator === marketing) return null;
    return (window.AIRLINES && window.AIRLINES[operator]) || operator;
  }

  function minsToHHMM(mins) {
    mins = Math.max(0, Math.min(1439, mins | 0));
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  function minsToHrsMins(total) {
    total = Math.max(0, Math.round(+total || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m)   return `${h}h ${m}m`;
    if (h)        return `${h}h`;
    return `${m}m`;
  }

  function stopsCount(o) {
    const segs = o.itineraries?.[0]?.segments || [];
    return Math.max(0, segs.length - 1);
  }

  function checkedBagIncluded(o) {
    if (o.pricingOptions?.includedCheckedBagsOnly) return true;
    for (const tp of o.travelerPricings || [])
      for (const f of tp.fareDetailsBySegment || [])
        if (f.includedCheckedBags?.quantity > 0) return true;
    return false;
  }
  function carryOnIncluded(o) {
    for (const tp of o.travelerPricings || [])
      for (const f of tp.fareDetailsBySegment || [])
        if (f.includedCabinBags?.quantity > 0) return true;
    return false;
  }

  function firstDep(it) {
    return it?.segments?.[0]?.departure?.at;
  }
  function lastArr(it) {
    const s = it?.segments || [];
    return s.length ? s[s.length - 1].arrival?.at : null;
  }
  function timeToMinutes(ts) {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  }
  function totalDurationMins(o) {
    return (o.itineraries || [])
      .map((it) => isoToMins(it?.duration))
      .reduce((a, b) => a + b, 0);
  }

  function q(name) {
    return new URLSearchParams(location.search).get(name) || "";
  }
  function onlyCode(s = "") {
    const m = s.match(/\(([A-Z]{3})\)\s*$/) || s.match(/^\s*([A-Z]{3})\b/);
    return (m ? m[1] : s.trim().toUpperCase()).slice(0, 3);
  }
  function fmtDate(d) {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  }
  function fmtTime(ts) {
    try {
      let s = new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      // narrow no-break space before AM/PM so it never wraps
      return s.replace(" AM", "\u202FAM").replace(" PM", "\u202FPM");
    } catch {
      return ts;
    }
  }
  function fmtDuration(iso) {
    const m = /P(T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(iso || "");
    const h = m && m[2] ? +m[2] : 0;
    const M = m && m[3] ? +m[3] : 0;
    return (h ? `${h}h ` : "") + (M ? `${M}m` : h ? "0m" : "");
  }

  // ---------- airports/airlines lookup ----------
  let IATA_MAP;
  async function loadAirports() {
    if (IATA_MAP) return IATA_MAP;
    const res = await fetch("assets/airports.json");
    const data = await res.json();
    IATA_MAP = new Map();
    for (const a of Object.values(data)) if (a.iata) IATA_MAP.set(a.iata.toUpperCase(), a);
    return IATA_MAP;
  }
  function airportNameLabel(code) {
    const a = IATA_MAP?.get(code?.toUpperCase());
    return a ? `${a.name} (${code})` : code || "";
  }
  async function loadAirlines() {
    try {
      const res = await fetch("/assets/airlines.json");
      window.AIRLINES = await res.json();
    } catch (err) {
      console.error("Failed to load airlines.json", err);
      window.AIRLINES = {};
    }
  }

  // ---------- main ----------
  async function run() {
    console.log("[flights.js] loaded", location.search);

    try { await loadAirports(); } catch (e) { console.warn("airports.json failed to load", e); }
    try { await loadAirlines(); } catch {}

    const origin        = onlyCode(q("origin"));
    const destination   = onlyCode(q("destination"));
    const departureDate = q("departureDate");
    const returnDate    = q("returnDate");
    const adults        = +(q("adults") || "1");
    const travelClass   = q("travelClass") || "ECONOMY";

    const rt = returnDate ? ` • Return ${fmtDate(returnDate)}` : "";
    if (criteriaEl) {
      const left  = airportNameLabel(origin);
      const right = airportNameLabel(destination);
      criteriaEl.textContent = `${left} → ${right} • Depart ${fmtDate(departureDate)}${rt} • ${adults} adult${adults > 1 ? "s" : ""}`;
    }

    if (!origin || !destination || !departureDate) {
      resultsEl.innerHTML = `<div class="alert alert-warning">Faltan datos: origen, destino o fecha.</div>`;
      return;
    }

    resultsEl.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border" role="status"></div>
        <p class="mt-3 mb-0">Buscando vuelos…</p>
      </div>`;

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, departureDate, returnDate, adults, travelClass }),
      });

      const json = await res.json();
      console.log("[flights.js] /api/search status", res.status, json);

      // Handle known API error shape (e.g., Amadeus 429)
      const firstErr = json?.errors?.[0];
      if (firstErr) {
        const msg = firstErr?.status == 429
          ? "Demasiadas solicitudes al servidor. Intenta nuevamente más tarde."
          : (firstErr?.detail || firstErr?.title || "Error en la búsqueda.");
        resultsEl.innerHTML = `<div class="alert alert-warning">${msg}</div>`;
        return;
      }

      if (!res.ok) {
        throw new Error((json && (json.error || json.details)) || `HTTP ${res.status}`);
      }

      const offers = Array.isArray(json?.data) ? json.data
                    : Array.isArray(json)       ? json
                    : Array.isArray(json?.results) ? json.results
                    : [];

      if (!offers.length) {
        resultsEl.innerHTML = `<div class="alert alert-warning">No encontramos resultados para esas fechas/ruta.</div>`;
        return;
      }

      renderResults(offers);
    } catch (err) {
      console.error("[flights.js] search failed:", err);
      resultsEl.innerHTML = `<div class="alert alert-danger">La búsqueda falló. ${err?.message || ""}</div>`;
    }
  }

  // ---------- results, sorting & paging ----------
  function renderResults(offers) {
    const container = document.createElement("div");
    container.className = "row g-3";

    const durations = offers.map(totalDurationMins);
    const durMin = Math.min(...durations);
    const durMax = Math.max(...durations);

    const filters = {
      direct:  false,
      one:     false,
      twoPlus: false,
      carryOn: false,
      checked: false,
      outStart: 0, outEnd: 1439,   // start-only UI, end fixed to 23:59
      retStart: 0, retEnd: 1439,   // start-only UI, end fixed to 23:59
      maxTrip: durMax,
    };

    // ----- sidebar -----
    const aside = document.createElement("aside");
    aside.className = "col-12 col-lg-4 col-xl-3";
    aside.innerHTML = `
      <div class="card p-3 sticky-top" style="top:1rem">

        <details open class="mb-3">
          <summary class="h5 mb-2">Escalas</summary>
          <div class="d-grid gap-2">
            <label class="form-check">
              <input id="fDirect" class="form-check-input" type="checkbox" checked>
              <span class="ms-2">Directo</span>
            </label>
            <label class="form-check">
              <input id="fOne" class="form-check-input" type="checkbox" checked>
              <span class="ms-2">1 stop</span>
            </label>
            <label class="form-check">
              <input id="fTwoPlus" class="form-check-input" type="checkbox" checked>
              <span class="ms-2">2+ stops</span>
            </label>
          </div>
        </details>

        <details open class="mb-3">
          <summary class="h5 mb-2">Equipaje</summary>
          <div class="d-flex align-items-center gap-3 mb-2">
            <a href="#" id="bagsSelectAll" class="small">Select all</a>
            <span class="text-muted">/</span>
            <a href="#" id="bagsClearAll" class="small">Clear all</a>
          </div>
          <div class="d-grid gap-2">
            <label class="form-check">
              <input id="fCarryOn" class="form-check-input" type="checkbox">
              <span class="ms-2">Equipaje de mano</span>
            </label>
            <label class="form-check">
              <input id="fChecked" class="form-check-input" type="checkbox">
              <span class="ms-2">Maletas documentadas</span>
            </label>
          </div>
        </details>

        <details open class="mb-3">
          <summary class="h5 mb-2">Horario de Salida</summary>
          <div class="mb-2 fw-semibold">Horario de salida</div>
          <div class="d-flex align-items-center gap-2">
            <input id="outStart" type="range" min="0" max="1439" value="0" class="form-range" style="width:100%">
          </div>
          <div class="small text-muted"><span id="outLabel">12:00 AM – 11:59 PM</span></div>

          <div class="mt-3 mb-2 fw-semibold">Horario de Retorno</div>
          <div class="d-flex align-items-center gap-2">
            <input id="retStart" type="range" min="0" max="1439" value="0" class="form-range" style="width:100%">
          </div>
          <div class="small text-muted"><span id="retLabel">12:00 AM – 11:59 PM</span></div>
        </details>

        <details open class="mb-2">
          <summary class="h5 mb-2">Trip duration</summary>
          <div class="d-flex align-items-center gap-2">
            <input id="tripMax" type="range" min="${durMin}" max="${durMax}" value="${durMax}" class="form-range" style="width:100%">
          </div>
          <div class="small text-muted">Up to <span id="tripLabel">${minsToHrsMins(durMax)}</span></div>
        </details>

        <button id="clearAll" class="btn btn-outline-secondary w-100">Clear filters</button>
      </div>`;
    container.appendChild(aside);

    // helper scoped to sidebar
    const $a = (sel) => aside.querySelector(sel);

    // ---- grab DOM refs (start-only) BEFORE defining/using handlers
    const outStart = $a("#outStart");
    const retStart = $a("#retStart");
    const outLabel = $a("#outLabel");
    const retLabel = $a("#retLabel");
    const tripMax  = $a("#tripMax");
    const tripLbl  = $a("#tripLabel");

    // ---- handlers (do NOT call yet)
    function updateOut() {
      if (!outStart) return;
      const start = +outStart.value || 0;
      const end = 1439; // end of day
      filters.outStart = start;
      filters.outEnd   = end;
      if (outLabel) outLabel.textContent = `${minsToHHMM(start)} – ${minsToHHMM(end)}`;
      applyAndRender();
    }
    function updateRet() {
      if (!retStart) return;
      const start = +retStart.value || 0;
      const end = 1439;
      filters.retStart = start;
      filters.retEnd   = end;
      if (retLabel) retLabel.textContent = `${minsToHHMM(start)} – ${minsToHHMM(end)}`;
      applyAndRender();
    }
    function setTrip(n) {
      n = Math.max(durMin, Math.min(durMax, +n || durMax));
      filters.maxTrip = n;
      if (tripMax) tripMax.value = String(n);
      if (tripLbl) tripLbl.textContent = `Up to ${minsToHrsMins(n)}`;
      applyAndRender();
    }

    // ----- results column -----
    const main = document.createElement("section");
    main.className = "col-12 col-lg-8 col-xl-9";
    main.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div><strong>${offers.length}</strong> resultados</div>
        <select id="sort" class="form-select form-select-sm" style="width:auto">
          <option value="price">Orden: menor precio</option>
          <option value="duration">Orden: menor duración</option>
        </select>
      </div>
      <div id="resultList" class="d-flex flex-column gap-3"></div>
      <button id="showMore" class="btn btn-outline-primary mx-auto" style="display:none">Mostrar más resultados</button>`;
    container.appendChild(main);

    // mount
    resultsEl.innerHTML = "";
    resultsEl.appendChild(container);

    // paging/sorting state
    const list = main.querySelector("#resultList");
    const showMoreBtn = main.querySelector("#showMore");
    let shown = 0, pageSize = 10, sorted = offers.slice();

    function appendPage() {
      const next = sorted.slice(shown, shown + pageSize);
      for (const o of next) list.appendChild(card(o));
      shown += next.length;
      showMoreBtn.style.display = shown < sorted.length ? "block" : "none";
    }
    function resetPaging() {
      list.innerHTML = "";
      shown = 0;
      appendPage();
    }

    function passes(o) {
      // Stops
      if (filters.direct || filters.one || filters.twoPlus) {
        const s = stopsCount(o);
        let ok = false;
        if (filters.direct && s === 0) ok = true;
        if (filters.one && s === 1) ok = true;
        if (filters.twoPlus && s >= 2) ok = true;
        if (!ok) return false;
      }
      // Baggage
      if (filters.carryOn && !carryOnIncluded(o)) return false;
      if (filters.checked && !checkedBagIncluded(o)) return false;

      // Time windows (start-only → end fixed to 23:59)
      const outIt = o.itineraries?.[0];
      if (outIt) {
        const d = firstDep(outIt);
        if (d) {
          const m = timeToMinutes(d);
          if (m < filters.outStart || m > filters.outEnd) return false;
        }
        const a = lastArr(outIt);
        if (a) {
          const m = timeToMinutes(a);
          if (m < filters.outStart || m > filters.outEnd) return false;
        }
      }
      const retIt = o.itineraries?.[1];
      if (retIt) {
        const d = firstDep(retIt);
        if (d) {
          const m = timeToMinutes(d);
          if (m < filters.retStart || m > filters.retEnd) return false;
        }
        const a = lastArr(retIt);
        if (a) {
          const m = timeToMinutes(a);
          if (m < filters.retStart || m > filters.retEnd) return false;
        }
      }

      // Trip duration
      if (totalDurationMins(o) > filters.maxTrip) return false;
      return true;
    }

    let state = { sort: "price" };
    function getSortValue() {
      const sel = main.querySelector("#sort");
      return sel && sel.value ? sel.value : state.sort;
    }
    function applyAndRender() {
      const sortBy  = getSortValue();
      const filtered = offers.filter(passes);
      const arr = filtered.slice().sort((a, b) => {
        if (sortBy === "duration") return totalDurationMins(a) - totalDurationMins(b);
        const pa = +a.price?.grandTotal || 1e12;
        const pb = +b.price?.grandTotal || 1e12;
        return pa - pb;
      });
      sorted = arr;
      resetPaging();
    }

    // ----- wire inputs (AFTER applyAndRender exists) -----
    // Stops
    on($a("#fDirect"),  "change", (e) => { filters.direct  = e.target.checked; applyAndRender(); });
    on($a("#fOne"),     "change", (e) => { filters.one     = e.target.checked; applyAndRender(); });
    on($a("#fTwoPlus"), "change", (e) => { filters.twoPlus = e.target.checked; applyAndRender(); });

    // Baggage
    on($a("#fCarryOn"), "change", (e) => { filters.carryOn = e.target.checked; applyAndRender(); });
    on($a("#fChecked"), "change", (e) => { filters.checked = e.target.checked; applyAndRender(); });
    on($a("#bagsSelectAll"), "click", (e) => {
      e.preventDefault();
      const co = $a("#fCarryOn"), ck = $a("#fChecked");
      if (co) co.checked = true;
      if (ck) ck.checked = true;
      filters.carryOn = true; filters.checked = true;
      applyAndRender();
    });
    on($a("#bagsClearAll"), "click", (e) => {
      e.preventDefault();
      const co = $a("#fCarryOn"), ck = $a("#fChecked");
      if (co) co.checked = false;
      if (ck) ck.checked = false;
      filters.carryOn = false; filters.checked = false;
      applyAndRender();
    });

    // Start-only sliders
    on(outStart, "input", updateOut);
    on(retStart, "input", updateRet);

    // Trip duration
    on(tripMax, "input", (e) => setTrip(e.target.value));

    // sort & paging
    on(main.querySelector("#sort"), "change", applyAndRender);
    on(showMoreBtn, "click", appendPage);

    // Clear all
    on($a("#clearAll"), "click", (e) => {
      e.preventDefault();
      filters.direct = false;
      filters.one    = true;
      filters.twoPlus = true;
      filters.carryOn = false;
      filters.checked = false;
      filters.outStart = 0; filters.outEnd = 1439;
      filters.retStart = 0; filters.retEnd = 1439;
      filters.maxTrip  = durMax;

      const fd = $a("#fDirect"), fo = $a("#fOne"), ft = $a("#fTwoPlus");
      const fc = $a("#fCarryOn"), fck = $a("#fChecked");
      if (fd) fd.checked = false;
      if (fo) fo.checked = true;
      if (ft) ft.checked = true;
      if (fc) fc.checked = false;
      if (fck) fck.checked = false;

      if (outStart) outStart.value = "0";
      if (retStart) retStart.value = "0";

      updateOut();
      updateRet();
      setTrip(durMax);
    });

    // initial render (after everything is wired)
    updateOut();
    updateRet();
    setTrip(durMax);
  }

  // ---------- single offer card ----------
  function card(ofr) {
    const price    = ofr.price?.grandTotal || ofr.price?.total || "?";
    const currency = ofr.price?.currency || "USD";
    const out = ofr.itineraries?.[0];
    const ret = ofr.itineraries?.[1];

    const amountFmt = isFinite(+price)
      ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(+price)
      : `${price} ${currency}`;

    const c = document.createElement("div");
    c.className = "flight-card shadow-sm";

    // marketing carriers for logos
    const mOut = out?.segments?.[0]?.carrierCode || "";
    const mRet = ret?.segments?.[0]?.carrierCode || mOut;

    c.innerHTML = `
      <div class="flight-body">
        <div class="airline-stack">
          <img class="airline-logo" src="/assets/img/logos/${mOut}.png" alt="${mOut}" loading="lazy">
          ${ret ? `<img class="airline-logo" src="/assets/img/logos/${mRet}.png" alt="${mRet}" loading="lazy">` : ""}
        </div>
        <div class="legs">
          ${renderLeg(out)}
          ${ret ? renderLeg(ret) : ""}
          ${(() => {
            const op = out?.segments?.[0];
            const opLabel = getOperatorLabel(op);
            return opLabel ? `<div class="operator-note small">Parcialmente operado por ${opLabel}</div>` : "";
          })()}
        </div>
      </div>

      <aside class="flight-aside">
        <div class="price-wrap">
          <div class="price-amount">${amountFmt}</div>
          <span class="price-ccy">${currency}</span>
        </div>
        <button class="btn btn-primary btn-cta">Seleccionar ➜</button>
      </aside>
    `;

    const btn = c.querySelector(".btn-cta");
    on(btn, "click", () => {
      sessionStorage.setItem("selectedOffer", JSON.stringify(ofr));
      sessionStorage.setItem("searchCriteria", location.search);
      location.href = "checkout.html";
    });

    // make entire aside clickable
    const aside = c.querySelector(".flight-aside");
    aside.style.cursor = "pointer";
    on(aside, "click", () => btn.click());

    return c;
  }

  function renderLeg(leg) {
    if (!leg) return "";
    const segs  = leg.segments || [];
    const first = segs[0] || {};
    const last  = segs[segs.length - 1] || {};
    const dep   = first.departure || {};
    const arr   = last.arrival    || {};

    const stops  = Math.max(0, segs.length - 1);
    const via    = segs.slice(0, -1).map(s => s.arrival?.iataCode).filter(Boolean).join(", ");
    const durTxt = fmtDuration(leg.duration);

    // +N if crosses days
    let plus = "";
    try {
      const d0 = new Date(dep.at), d1 = new Date(arr.at);
      const diffDays = Math.floor((d1 - d0) / (24*3600*1000));
      plus = diffDays > 0 ? `+${diffDays}` : "";
    } catch {}

    return `
      <div class="leg-row">
        <div>
          <div class="time">${dep.at ? fmtTime(dep.at) : ""}</div>
          <div class="city">${dep.iataCode || ""}</div>
        </div>

        <div>
          <div class="path"><span class="line"></span><span class="dot"></span><span class="line"></span></div>
          <div class="meta">
            <span class="dur">${durTxt}</span>
            <span class="stops">${stops === 0 ? "Directo" : (stops === 1 ? "1 escala" : `${stops} escalas`)}</span>
            ${via ? `<span class="via">${via}</span>` : ""}
          </div>
        </div>

        <div>
          <div class="time">${arr.at ? fmtTime(arr.at) : ""}${plus ? `<sup>${plus}</sup>` : ""}</div>
          <div class="city">${arr.iataCode || ""}</div>
        </div>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", run);
})();
