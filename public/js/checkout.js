(() => {
  'use strict';

  // ----------------------------
  // Load offer from session
  // ----------------------------
  const offerRaw = sessionStorage.getItem('selectedOffer');
  if (!offerRaw) {
    // No offer stored: send the user back to search
    location.href = 'flights.html';
    return;
  }

  // Create the special assistance checkbox under the passenger count controls
  function ensureAssistanceUI() {
    const sec = document.getElementById('passengers-section');
    if (!sec) return;
    if (sec.querySelector('#assistWheelchair')) return; // already exists

    // Insert before the passengers wrapper
    const before = sec.querySelector('#passengers');
    const div = document.createElement('div');
    div.className = 'form-check mb-3';
    div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="assistWheelchair" name="specialAssistanceWheelchair" value="yes">
      <label class="form-check-label" for="assistWheelchair">
        Añadir asistencia especial — Asistencia con silla de ruedas
      </label>`;
    sec.insertBefore(div, before || null);
  }
  const offer = JSON.parse(offerRaw);

  const $ = (s, r = document) => r.querySelector(s);
  const summary = $('#summary');

  // Restrict phone field to digits only (block letters before they appear)
  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    const allowedKeys = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End']);
    phoneInput.addEventListener('keydown', (evt) => {
      if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
      if (allowedKeys.has(evt.key)) return;
      if (/^\d$/.test(evt.key)) return;
      evt.preventDefault();
    });
    phoneInput.addEventListener('input', () => {
      const digits = phoneInput.value.replace(/\D+/g, '');
      if (phoneInput.value !== digits) phoneInput.value = digits;
    });
  }

  const alphaKeys = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End']);
  const alphaChar = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]$/;
  function registerAlphaOnly(field) {
    if (!field || field.dataset.alphaOnlyInit) return;
    field.dataset.alphaOnlyInit = '1';
    field.addEventListener('keydown', (evt) => {
      if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
      if (alphaKeys.has(evt.key)) return;
      if (evt.key === ' ') return;
      if (evt.key.length !== 1) return; // allow composed keys (accents)
      if (!alphaChar.test(evt.key)) evt.preventDefault();
    });
    field.addEventListener('input', () => {
      const filtered = Array.from(field.value)
        .filter((ch) => ch === ' ' || alphaChar.test(ch))
        .join('');
      if (field.value !== filtered) field.value = filtered;
    });
  }

  function enforceAlphaOnlyInputs(root = document) {
    if (!root) return;
    root.querySelectorAll('input.alpha-only').forEach(registerAlphaOnly);
  }

  const digitKeys = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', 'Enter']);
  function registerDigitOnly(field) {
    if (!field || field.dataset.onlyDigitsInit) return;
    field.dataset.onlyDigitsInit = '1';
    const sanitize = () => {
      const digits = field.value.replace(/\D+/g, '');
      if (field.value !== digits) field.value = digits;
    };
    field.addEventListener('keydown', (evt) => {
      if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
      if (digitKeys.has(evt.key)) return;
      if (/^\d$/.test(evt.key)) return;
      evt.preventDefault();
    });
    field.addEventListener('input', sanitize);
    field.addEventListener('blur', sanitize);
    field.addEventListener('paste', () => setTimeout(sanitize, 0));
  }

  function enforceDigitOnlyInputs(root = document) {
    if (!root) return;
    root.querySelectorAll('input.only-digits').forEach(registerDigitOnly);
  }

  // Apply immediately for static fields
  enforceAlphaOnlyInputs();

  // ----------------------------
  // Formatters
  // ----------------------------
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const money = (v, ccy = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(Number(v || 0));
  const fmtDur = (iso) => {
    const m = /P(T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(iso || '');
    const h = (m && m[2]) ? +m[2] : 0;
    const min = (m && m[3]) ? +m[3] : 0;
    return `${h ? `${h}h ` : ''}${min ? `${min}m` : ''}`.trim();
  };

  // ----------------------------
  // Summary helper
  // ----------------------------
  function legSummary(leg) {
    const segs = leg.segments || [];
    const first = segs[0] || {};
    const last = segs[segs.length - 1] || {};
    const dep = first.departure || {};
    const arr = last.arrival || {};
    const stops = Math.max(0, segs.length - 1);
    const via = segs.slice(0, -1).map(s => s.arrival?.iataCode).filter(Boolean).join(' · ');

    return `
      <div class="co-leg">
        <div class="co-flex">
          <div><strong>${dep.iataCode}</strong> · ${fmtDate(dep.at)} · ${fmtTime(dep.at)}</div>
          <div>${fmtDur(leg.duration)} · ${stops === 0 ? 'Directo' : (stops === 1 ? '1 escala' : `${stops} escalas`)}</div>
        </div>
        <div class="co-flex">
          <div><strong>${arr.iataCode}</strong> · ${fmtDate(arr.at)} · ${fmtTime(arr.at)}</div>
          <div>${via || ''}</div>
        </div>
      </div>
    `;
  }

  // ----------------------------
  // Modal utilities
  // ----------------------------
  // Lightweight lookups for modal labeling
  let AIRPORTS_MAP_MODAL;
  let AIRLINES_MODAL;

  async function loadAirportsModal() {
    if (AIRPORTS_MAP_MODAL) return AIRPORTS_MAP_MODAL;
    try {
      const res = await fetch('/assets/airports.json');
      const data = await res.json();
      AIRPORTS_MAP_MODAL = new Map();
      for (const a of Object.values(data)) {
        if (a && a.iata) AIRPORTS_MAP_MODAL.set(String(a.iata).toUpperCase(), a);
      }
    } catch (e) {
      console.warn('airports.json failed to load for modal', e);
      AIRPORTS_MAP_MODAL = new Map();
    }
    return AIRPORTS_MAP_MODAL;
  }

  async function loadAirlinesModal() {
    if (AIRLINES_MODAL) return AIRLINES_MODAL;
    try {
      const res = await fetch('/assets/airlines.json');
      const arr = await res.json();
      const map = {};
      if (Array.isArray(arr)) {
        for (const a of arr) {
          if (!a) continue;
          const code = a.iata || a.id || a.code;
          if (code) map[String(code).toUpperCase()] = a.name || code;
        }
      }
      AIRLINES_MODAL = map;
    } catch (e) {
      console.warn('airlines.json failed to load for modal', e);
      AIRLINES_MODAL = {};
    }
    return AIRLINES_MODAL;
  }

  function airportLabelSync(code) {
    const c = code ? String(code).toUpperCase() : '';
    const a = AIRPORTS_MAP_MODAL?.get(c);
    return a ? `${c} — ${a.name}` : (code || '');
  }

  function airlineName(code) {
    const c = code ? String(code).toUpperCase() : '';
    return (AIRLINES_MODAL && AIRLINES_MODAL[c]) || c || '';
  }
  function ensureModal() {
    let el = document.getElementById('itineraryModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'itineraryModal';
    el.className = 'modal fade';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('role', 'dialog');
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Itinerario</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div id="itineraryBody">Loading…</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  function fmtLayover(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(m / 60), mm = m % 60;
    return `${h ? `${h}h ` : ''}${mm}m`;
  }

  function renderLegDetails(leg) {
    const segs = leg.segments || [];
    const first = segs[0] || {};
    const last = segs[segs.length - 1] || {};
    const dep = first.departure || {};
    const arr = last.arrival || {};

    const header = `
      <div class="mb-3">
        <div class="fw-semibold">${airportLabelSync(dep.iataCode)} to ${airportLabelSync(arr.iataCode)}</div>
        <div class="text-muted small">${fmtTime(dep.at)} - ${fmtTime(arr.at)} · ${fmtDate(dep.at)}</div>
      </div>`;

      const parts = [header];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const d = s.departure || {};
        const a = s.arrival || {};
        const dur = s.duration || '';
        parts.push(`<div class="d-flex align-items-start gap-2 mb-3">
          <div class="text-muted">✈️</div>
          <div>
            <div class="small">${fmtTime(d.at)} · ${fmtDate(d.at)}</div>
            <div class="fw-semibold">${airportLabelSync(d.iataCode)} → ${airportLabelSync(a.iataCode)}</div>
            <div class="text-muted small">Duración: ${fmtDur(dur)}${s.carrierCode ? ` · ${airlineName(s.carrierCode)}${s.number ? ` ${s.number}` : ''}` : ''}</div>
            ${s.operating?.carrierCode ? `<div class="text-muted small">Operado por: ${airlineName(s.operating.carrierCode)}</div>` : ''}
          </div>
        </div>`);
        if (i < segs.length - 1) {
          const next = segs[i + 1];
          const lay = new Date(next?.departure?.at || 0) - new Date(a.at || 0);
          parts.push(`<div class="bg-light rounded py-2 px-3 mb-3 small">${fmtLayover(lay)} de escala en ${airportLabelSync(a.iataCode)}</div>`);
        }
      }
      return parts.join('\n');
    }

    // ----------------------------
    // Event: open modal on “Trip details”
    // ----------------------------
    const legs = offer.itineraries || [];
    document.addEventListener('click', async (e) => {
      if (!document.getElementById('summary')?.contains(e.target)) return;
      const link = e.target.closest('.trip-details');
      if (!link) return;
      e.preventDefault();
  
      const idx = Number(link.getAttribute('data-leg-index') || '0');
      const leg = legs[idx];
      const modalEl = ensureModal();
      const body = modalEl.querySelector('#itineraryBody');
      try { 
        await Promise.all([loadAirportsModal(), loadAirlinesModal()]); 
      } catch {}
      body.innerHTML = renderLegDetails(leg);
  
      if (window.bootstrap?.Modal) {
        let m = window.bootstrap.Modal.getInstance(modalEl);
        if (!m) m = new window.bootstrap.Modal(modalEl, { backdrop: true, keyboard: true, focus: true });
        m.show();
      } else {
        alert('Bootstrap modal not available');
      }
    });

  // ----------------------------
  // Render summary with itinerary cards + totals
  // ----------------------------
  const currency = offer.price?.currency || 'USD';
  const grand = Number(offer.price?.grandTotal || offer.price?.total || 0);
  const base = Number(offer.price?.base || 0);
  const fees = Array.isArray(offer.price?.fees) ? offer.price.fees.reduce((s, f) => s + Number(f?.amount || 0), 0) : 0;
  const taxesFees = +(grand - base - fees).toFixed(2);

  // adults from the saved search criteria
  const searchQS = sessionStorage.getItem('searchCriteria') || '';
  const adultsMatch = /(^|&)adults=(\d+)/.exec((searchQS || '').replace(/^\?/, ''));
  const adults = Math.max(1, parseInt(adultsMatch?.[2] || '1', 10));

  // ----------------------------
  // Dynamic passenger forms (1..9)
  // ----------------------------
  const passengersWrap = document.getElementById('passengers');
  const passengerCountInput = document.getElementById('passengerCount');

  const clamp = (n) => Math.min(9, Math.max(1, Number(n) || 1));

  // ----------------------------
  // Countries loader (ISO-3166-1 alpha-3)
  // ----------------------------
  let COUNTRIES; // [{ code, name }]
  let COUNTRY_OPTIONS_HTML; // cached <option> html
  async function loadCountries() {
    if (COUNTRIES && COUNTRY_OPTIONS_HTML) return COUNTRIES;
    try {
      const res = await fetch('/assets/countries.json');
      COUNTRIES = await res.json();
      COUNTRY_OPTIONS_HTML = ['<option value="">Seleccione</option>']
        .concat((Array.isArray(COUNTRIES) ? COUNTRIES : []).map(c => `<option value="${c.code}">${c.name}</option>`))
        .join('');
    } catch (e) {
      console.warn('countries.json failed to load', e);
      COUNTRIES = [];
      COUNTRY_OPTIONS_HTML = '<option value="">Seleccione</option>';
    }
    return COUNTRIES;
  }

  async function populateCountrySelects() {
    if (!passengersWrap) return;
    await loadCountries();
    passengersWrap.querySelectorAll('select.country-nationality, select.country-issuing').forEach(sel => {
      sel.innerHTML = COUNTRY_OPTIONS_HTML;
    });
  }

  function passengerFields(index) {
    const n = index + 1;
    return `
      <div class="border rounded p-3 mb-3">
        <div class="fw-semibold mb-2">Pasajero ${n}</div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Tratamiento </label>
            <div class="select-wrapper">
              <select class="form-select" name="passengers[${index}][treatment]">
                <option value="">Seleccione</option>
                <option value="Sr.">Sr.</option>
                <option value="Sra.">Sra.</option>
              </select>
              <span class="chevron">▾</span>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Nombre(s) *</label>
            <input class="form-control alpha-only" name="passengers[${index}][firstName]" pattern="^[A-Za-zÁÉÍÓÚáéíóúÑñ\\s]+$" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Apellido(s) *</label>
            <input class="form-control alpha-only" name="passengers[${index}][lastName]" pattern="^[A-Za-zÁÉÍÓÚáéíóúÑñ\\s]+$" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Número de pasaporte *</label>
            <input class="form-control only-digits" name="passengers[${index}][passportNumber]" inputmode="numeric" pattern="\\d*" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">País emisor *</label>
            <div class="select-wrapper">
              <select class="form-select country-issuing" name="passengers[${index}][issuingCountry]" required></select>
              <span class="chevron">▾</span>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Género *</label>
            <div class="select-wrapper">
              <select class="form-select" name="passengers[${index}][gender]" required>
                <option value="">Seleccione</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
              <span class="chevron">▾</span>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Nacionalidad *</label>
            <div class="select-wrapper">
              <select class="form-select country-nationality" name="passengers[${index}][nationality]" required></select>
              <span class="chevron">▾</span>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Fecha de nacimiento *</label>
            <input class="form-control dob-picker" name="passengers[${index}][dob]" placeholder="YYYY-MM-DD" required>
          </div>
        </div>
      </div>
    `;
  }

  function renderPassengerForms(count) {
    if (!passengersWrap || !passengerCountInput) return;
    const c = clamp(count);
    passengersWrap.innerHTML = Array.from({ length: c }, (_, i) => passengerFields(i)).join('');
    passengerCountInput.value = String(c);
    // After rendering, populate country dropdowns
    populateCountrySelects();
    // Enforce digit-only for passport fields
    enforceDigitOnlyInputs(passengersWrap);
    // Enforce letters-only for passenger names
    enforceAlphaOnlyInputs(passengersWrap);
    // Initialize DOB date pickers
    initDobPickers();
  }

  // Initialize passengers strictly based on saved adults (from initial search)
  if (passengersWrap && passengerCountInput) {
    const initialCount = clamp(adults);
    renderPassengerForms(initialCount);
    // Lock the control to prevent edits on checkout
    passengerCountInput.value = String(initialCount);
    passengerCountInput.disabled = true;
    passengerCountInput.title = 'La cantidad de pasajeros proviene de la búsqueda inicial.';
  }

  // Initialize Flatpickr on DOB inputs (fallback to native date if not available)
  function initDobPickers() {
    if (!passengersWrap) return;
    passengersWrap.querySelectorAll('input.dob-picker').forEach((el) => {
      // Avoid double init
      if (el._dobInit) return; el._dobInit = true;
      const todayStr = new Date().toISOString().slice(0, 10);
      if (window.flatpickr) {
        window.flatpickr(el, {
          dateFormat: 'd/m/Y',
          altInput: true,
          altFormat: 'F j, Y',
          maxDate: todayStr,     // cannot be in the future
          allowInput: true,
          enableTime: false,
          // Use native pickers on mobile for better UX if library chooses so
          // Flatpickr defaults are fine; do not force enableMobile
        });
      } else {
        // Fallback: use native date input
        el.setAttribute('type', 'date');
        el.setAttribute('max', todayStr);
      }
    });
  }

  const MARKUP_PER_ADULT = 15;
  const markup = adults * MARKUP_PER_ADULT;
  const grandAdj = grand + markup;

  function itineraryCard(leg, idx) {
    const segs = leg.segments || [];
    const first = segs[0] || {};
    const last = segs[segs.length - 1] || {};
    const dep = first.departure || {};
    const arr = last.arrival || {};
    const viaCodes = segs.slice(0, -1).map(s => s.arrival?.iataCode).filter(Boolean);
    const stops = Math.max(0, segs.length - 1);
    const stopLabel = stops === 0 ? 'Directo' : (stops === 1 ? `1 escala (${viaCodes[0] || ''})` : `${stops} escalas`);
    return `
      <div class="p-3 rounded bg-light mb-3 d-flex align-items-start justify-content-between">
        <div>
          <div class="fw-bold">${dep.iataCode || ''} a ${arr.iataCode || ''}</div>
          <div class="text-muted small">${fmtTime(dep.at)} · ${fmtDate(dep.at)}</div>
        </div>
        <div class="text-end">
          <div class="small">${stopLabel}</div>
          <a href="#" class="small trip-details" data-leg-index="${idx}">Detallado</a>
        </div>
      </div>`;
  }

  const title = legs.length > 1 ? 'Tu viaje redondo' : 'Your one-way trip';
  const destCode = (() => {
    const lastLeg = legs[0];
    const segs = lastLeg?.segments || [];
    return segs.length ? (segs[segs.length - 1].arrival?.iataCode || '') : '';
  })();

  summary.innerHTML = `
    <h5 class="mb-3">${title}${destCode ? ` a ${destCode}` : ''}</h5>
    ${legs.map((l, i) => itineraryCard(l, i)).join('')}
    <div class="co-hr"></div>
    <div class="d-flex align-items-center justify-content-between">
      <div class="fw-bold text-primary">Tickets (${adults} Adulto${adults > 1 ? 's' : ''})</div>
      <div class="fw-bold text-primary">${money(grandAdj, currency)}</div>
    </div>
    <div class="co-hr"></div>
    <div style="font-size:.85rem;color:#768197;margin-top:6px">Todos los precios están expresados en dólares americanos ${currency}.</div>
  `;

  // Ensure modal exists
  ensureModal();

  // ----------------------------
  // Two-step flow: Agency -> Passengers
  // ----------------------------
  const btnContinue = document.getElementById('btn-continue');
  const passengersSection = document.getElementById('passengers-section');
  const btnSubmitQuote = document.getElementById('btn-submit-quote');
  const checkoutForm = document.getElementById('checkout-form');
  btnContinue?.addEventListener('click', () => {
    const data = new FormData(checkoutForm);
  
    // Validate only the agency fields
    const agencySection = document.getElementById('agency-section');
    const agencyControls = agencySection?.querySelectorAll('input, select, textarea') || [];
  
    // If you prefer explicit checks, you can keep them:
    // const agencyValid = data.get('countryCode') && data.get('phone') &&
    //                     data.get('email') && data.get('ejecutivo') &&
    //                     data.get('agentName') && data.get('razonSocial');
  
    // Better: use native constraint validation on all controls in the section
    const agencyValid = Array.from(agencyControls).every(el => el.checkValidity());
  
    if (!agencyValid) {
      // show built-in validation messages for all invalid fields
      Array.from(agencyControls).forEach(el => {
        if (!el.checkValidity()) el.reportValidity();
      });
      // Optionally focus the first invalid control
      const firstInvalid = Array.from(agencyControls).find(el => !el.checkValidity());
      firstInvalid?.focus();
      return;
    }
  
    // Reveal passengers step
    if (passengersSection) passengersSection.style.display = '';
    if (btnSubmitQuote) btnSubmitQuote.classList.remove('d-none');
    if (btnContinue) btnContinue.classList.add('d-none');
    // Ensure special assistance UI exists
    ensureAssistanceUI();
    passengersSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // ----------------------------
  // Handle form submit
  // ----------------------------
  function parsePassengers(fd) {
    const out = [];
    for (const [k, v] of fd.entries()) {
      const m = /^passengers\[(\d+)\]\[(\w+)\]$/.exec(k);
      if (!m) continue;
      const idx = Number(m[1]);
      const key = m[2];
      out[idx] ||= {};
      out[idx][key] = v;
    }
    return out;
  }

  $('#checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries());
    const passengers = parsePassengers(fd);

    // Form validation
    if (!data.countryCode || !data.phone || !data.email || !data.ejecutivo || data.ejecutivo === 'Seleccione Agente') {
      alert('Por favor completa los campos obligatorios.');
      return;
    }

    // Validate passenger fields
    if (!passengers.length || passengers.length > 9 || 
        passengers.some(p => !p || !p.firstName || !p.lastName || !p.passportNumber || 
        !p.issuingCountry || !p.gender || !p.nationality || !p.dob)) {
      alert('Completa todos los campos de los pasajeros.');
      return;
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Procesando... <span class="spinner-border spinner-border-sm" role="status"></span>';

    try {
      // 1. Create the booking (existing functionality)
      const res = await fetch('/api/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer, traveler: data, passengers })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      // 2. Send confirmation email
      try {
        const emailRes = await fetch('/api/send-booking-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passengers: passengers.map(p => ({
              firstName: p.firstName,
              lastName: p.lastName,
              treatment: p.treatment,
              dob: p.dob,
              documentNumber: p.passportNumber,
              passportNumber: p.passportNumber,
              issuingCountry: p.issuingCountry,
              gender: p.gender,
              nationality: p.nationality
            })),
            flightDetails: {
              segments: offer.itineraries.flatMap(i => i.segments).map(s => ({
                departure: s.departure,
                arrival: s.arrival,
                carrierCode: s.carrierCode,
                number: s.number
              })),
              price: offer.price?.total ? `${offer.price.currency} ${offer.price.total}` : 'Precio no disponible'
            },
            contactInfo: {
              name: `${passengers[0].firstName} ${passengers[0].lastName}`,
              email: data.email,
              phone: `${data.countryCode} ${data.phone}`,
              agent: data.ejecutivo
            },
            agencyInfo: {
              agentName: data.agentName,
              razonSocial: data.razonSocial,
              email: data.email,
              phone: `${data.countryCode} ${data.phone}`,
              ejecutivo: data.ejecutivo
            }
          })
        });

        if (emailRes.ok) {
          const emailResult = await emailRes.json();
          console.log('✅ Email sent successfully:', emailResult.messageId);
        } else {
          const error = await emailRes.json().catch(() => ({}));
          console.warn('⚠️ Email sending failed:', error.error || 'Unknown error');
          // Show user-friendly warning but don't fail the booking
          alert('⚠️ La reserva se completó exitosamente, pero hubo un problema enviando el email de confirmación. Te contactaremos pronto.');
        }
      } catch (emailError) {
        console.warn('⚠️ Email sending error:', emailError);
        // Don't fail the booking if email fails
      }

      // 3. Redirect to thank you page
      location.href = 'thankyou.html';
    } catch (err) {
      console.error('Booking error:', err);
      alert(`No se pudo completar la reserva: ${err.message || 'Error desconocido'}`);
    } finally {
      // Reset button state
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  });
})();
