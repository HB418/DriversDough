// js/script.js
// Main app: wires the form and deliveries table together. Calculation math
// lives in js/calculations.js; every prompt/alert goes through the reusable
// pizza-box modal in js/dd-box-modal.js.
(function () {
  const addBtn = document.getElementById("addEntryBtn");
  const cancelBtn = document.getElementById("cancel-btn");
  const submitBtn = document.getElementById("submit-btn");
  const form = document.getElementById("entry-form");
  const formSection = document.getElementById("formSection");
  const main = document.getElementById("main-content");
  const tbody = document.getElementById("deliveryTable");

  const streetInput = document.getElementById("street");
  const feeSelect = document.getElementById("delivery-fee");
  const orderTypeSel = document.getElementById("order-type");
  const tipInput = document.getElementById("tip");
  const totalInput = document.getElementById("total");
  const cashTip = document.getElementById("cash-tip");
  const partialCash = document.getElementById("partial-cash");
  const endNightBtn = document.getElementById("endNightBtn");

  const appHeader = document.getElementById("appHeader");
  const appFooter = document.getElementById("appFooter");
  const modeImage = document.getElementById("modeImage");
  const phoneColumn = document.getElementById("phoneColumn");
  const paneResizer = document.getElementById("paneResizer");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const menuTimeCard = document.getElementById("menuTimeCard");
  const menuStats = document.getElementById("menuStats");
  const menuHideImage = document.getElementById("menuHideImage");
  const menuBackup = document.getElementById("menuBackup");
  const menuRestore = document.getElementById("menuRestore");
  const restoreFileInput = document.getElementById("restoreFileInput");

  const punchBtn = document.getElementById("punchBtn");
  const punchLabel = document.getElementById("punchLabel");
  const punchOverlay = document.getElementById("dd-punch-overlay");
  const punchTitle = document.getElementById("dd-punch-title");
  const punchDateEl = document.getElementById("dd-punch-date");
  const punchTimeInput = document.getElementById("dd-punch-time");
  const punchConfirmBtn = document.getElementById("dd-punch-confirm");
  const punchCancelBtn = document.getElementById("dd-punch-cancel");
  const timecardOverlay = document.getElementById("dd-timecard-overlay");
  const timecardPeriodEl = document.getElementById("dd-timecard-period");
  const timecardBody = document.getElementById("dd-timecard-body");
  const timecardDoneBtn = document.getElementById("dd-timecard-done");
  const timecardPrevLink = document.getElementById("dd-timecard-prev-link");
  const timecardCurrentLink = document.getElementById("dd-timecard-current-link");
  const timecardListOverlay = document.getElementById("dd-timecard-list-overlay");
  const timecardListBody = document.getElementById("dd-timecard-list-body");
  const timecardListDoneBtn = document.getElementById("dd-timecard-list-done");

  const statsOverlay = document.getElementById("dd-stats-overlay");
  const statsPeriodEl = document.getElementById("dd-stats-period");
  const statsBody = document.getElementById("dd-stats-body");
  const statsDoneBtn = document.getElementById("dd-stats-done");
  const statsPrevBtn = document.getElementById("dd-stats-prev");
  const statsNextBtn = document.getElementById("dd-stats-next");

  // Plain order-confirmation dialog — no pizza-box graphic, just a clean
  // readable card, since that graphic gets old showing up on every submit.
  const confirmOverlay = document.getElementById("dd-confirm-overlay");
  const confirmTitle = document.getElementById("dd-confirm-title");
  const confirmList = document.getElementById("dd-confirm-list");
  const confirmOkBtn = document.getElementById("dd-confirm-ok");

  function openConfirmDialog() {
    if (!confirmOverlay) return;
    confirmOverlay.classList.add("is-open");
    confirmOverlay.setAttribute("aria-hidden", "false");
    confirmOkBtn?.focus();
  }
  function closeConfirmDialog() {
    if (!confirmOverlay) return;
    confirmOverlay.classList.remove("is-open");
    confirmOverlay.setAttribute("aria-hidden", "true");
  }
  confirmOkBtn?.addEventListener("click", closeConfirmDialog);
  confirmOverlay?.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeConfirmDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && confirmOverlay?.classList.contains("is-open")) closeConfirmDialog();
  });

  // Delivery Details popup — opened by tapping a row's Street cell. Same
  // plain-dialog look as the confirm dialog above, but with its own
  // Edit/Delete/Done action row instead of a single OK (this is where Edit
  // and Delete live now — no more standalone top-row buttons or "tap a row
  // first" step, since tapping the address already identifies the entry).
  const deliveryOverlay = document.getElementById("dd-delivery-overlay");
  const deliveryTitle = document.getElementById("dd-delivery-title");
  const deliveryList = document.getElementById("dd-delivery-list");
  const deliveryEditBtn = document.getElementById("dd-delivery-edit");
  const deliveryDeleteBtn = document.getElementById("dd-delivery-delete");
  const deliveryDoneBtn = document.getElementById("dd-delivery-done");
  // Which entry the popup is currently showing, so its Edit/Delete buttons
  // know what to act on.
  let deliveryBreakdownIndex = null;

  function openDeliveryDialog() {
    if (!deliveryOverlay) return;
    deliveryOverlay.classList.add("is-open");
    deliveryOverlay.setAttribute("aria-hidden", "false");
    deliveryDoneBtn?.focus();
  }
  function closeDeliveryDialog() {
    if (!deliveryOverlay) return;
    deliveryOverlay.classList.remove("is-open");
    deliveryOverlay.setAttribute("aria-hidden", "true");
  }
  deliveryDoneBtn?.addEventListener("click", closeDeliveryDialog);
  deliveryOverlay?.addEventListener("click", (e) => {
    if (e.target === deliveryOverlay) closeDeliveryDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && deliveryOverlay?.classList.contains("is-open")) closeDeliveryDialog();
  });

  // === Header title: fit-to-width, measured instead of guessed ===
  // PaperCSS's own h1 default in this hand-drawn font is enormous — this
  // sandbox can never show that (PaperCSS has no network route to load
  // from here), so every fixed CSS number tried against it has landed
  // wrong on a real device: too small, then confirmed-by-screenshot too
  // big (wrapping "Driver's Dough" onto two lines). Measuring the title's
  // actual rendered width live sidesteps guessing entirely — size up at a
  // fixed reference, read its true width in whatever font is really
  // active, then scale to fill the header on one line. Same technique
  // dd-box-modal.js already uses to fit the pizza-box wordmark.
  function fitHeaderTitle() {
    const h1 = document.querySelector("header h1");
    if (!h1) return;
    const availableWidth = h1.getBoundingClientRect().width;
    if (!availableWidth) return;

    const prevWhiteSpace = h1.style.whiteSpace;
    const prevDisplay = h1.style.display;
    const prevPosition = h1.style.position;

    h1.style.fontSize = "100px";
    h1.style.whiteSpace = "nowrap";
    h1.style.display = "inline-block";
    h1.style.position = "absolute";

    const naturalWidth = h1.getBoundingClientRect().width;

    h1.style.whiteSpace = prevWhiteSpace;
    h1.style.display = prevDisplay;
    h1.style.position = prevPosition;

    if (naturalWidth > 0) {
      // .96 = a hair of margin so sub-pixel rounding never tips it back
      // into wrapping.
      const target = availableWidth * 0.96;
      const size = Math.max(20, Math.min((target / naturalWidth) * 100, 56));
      h1.style.fontSize = size + "px";
      h1.style.whiteSpace = "nowrap";
    }
  }

  // === Fixed header/footer ===
  // Header and footer are position:fixed so the page scrolls underneath
  // them; their heights vary (banner image, font swap, "Hide Image"), so
  // measure them and hand the numbers to CSS as custom properties instead
  // of hardcoding pixel offsets.
  function syncFixedBarOffsets() {
    fitHeaderTitle();
    if (appHeader) {
      document.documentElement.style.setProperty("--header-h", `${appHeader.offsetHeight}px`);
    }
    if (appFooter) {
      document.documentElement.style.setProperty("--footer-h", `${appFooter.offsetHeight}px`);
    }
  }
  window.addEventListener("resize", syncFixedBarOffsets);
  modeImage?.addEventListener("load", syncFixedBarOffsets);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncFixedBarOffsets);
  }

  // === Desktop split-view: draggable column width ===
  // Past 900px the app is pinned to a phone-width column (#phoneColumn)
  // with the rest of the window left blank (#rightPane) — see the
  // "Large-screen split view" block in css/style.css for why. 480px is
  // just a starting guess though, not everyone's idea of "phone-width", so
  // #paneResizer lets it be dragged wider/narrower, remembered per browser.
  const PANE_WIDTH_KEY = "driversDoughPaneWidth";
  const PANE_WIDTH_MIN = 320;
  const PANE_WIDTH_MAX = 900;
  function setPaneWidth(px) {
    const clamped = Math.max(PANE_WIDTH_MIN, Math.min(PANE_WIDTH_MAX, px));
    document.documentElement.style.setProperty("--phone-col-w", `${clamped}px`);
    return clamped;
  }
  try {
    const savedWidth = parseInt(localStorage.getItem(PANE_WIDTH_KEY), 10);
    if (!Number.isNaN(savedWidth)) setPaneWidth(savedWidth);
  } catch (err) {}
  if (paneResizer) {
    let dragging = false;
    paneResizer.addEventListener("pointerdown", (e) => {
      dragging = true;
      paneResizer.classList.add("is-dragging");
      paneResizer.setPointerCapture(e.pointerId);
    });
    paneResizer.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      setPaneWidth(e.clientX);
      syncFixedBarOffsets();
    });
    function persistPaneWidth() {
      try {
        const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--phone-col-w"));
        if (!Number.isNaN(current)) localStorage.setItem(PANE_WIDTH_KEY, String(Math.round(current)));
      } catch (err) {}
    }
    function stopDrag() {
      if (!dragging) return;
      dragging = false;
      paneResizer.classList.remove("is-dragging");
      persistPaneWidth();
    }
    paneResizer.addEventListener("pointerup", stopDrag);
    paneResizer.addEventListener("pointercancel", stopDrag);
    // Keyboard resizing (arrow keys) for accessibility, since it's a
    // role="separator" — no drag gesture needed.
    paneResizer.addEventListener("keydown", (e) => {
      const cs = getComputedStyle(document.documentElement).getPropertyValue("--phone-col-w");
      const current = parseFloat(cs) || 480;
      if (e.key === "ArrowLeft") {
        setPaneWidth(current - 20);
      } else if (e.key === "ArrowRight") {
        setPaneWidth(current + 20);
      } else {
        return;
      }
      syncFixedBarOffsets();
      persistPaneWidth();
      e.preventDefault();
    });
  }

  // === Dark mode ===
  const DARK_MODE_KEY = "driversDoughDarkMode";
  function applyDarkMode(isDark) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    if (darkModeToggle) {
      darkModeToggle.textContent = isDark ? "☀️" : "🌙";
      darkModeToggle.setAttribute("aria-pressed", String(isDark));
    }
    // Swap the banner to match — the head's inline script already picked
    // the right one before first paint; this covers switching live.
    if (modeImage) {
      const nextSrc = isDark ? modeImage.dataset.srcNight : modeImage.dataset.srcDay;
      if (nextSrc && modeImage.getAttribute("src") !== nextSrc) modeImage.src = nextSrc;
    }
  }
  darkModeToggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") !== "dark";
    applyDarkMode(isDark);
    try {
      localStorage.setItem(DARK_MODE_KEY, isDark ? "1" : "0");
    } catch (err) {}
  });
  // The <head> inline script already set data-theme before first paint —
  // this just syncs the toggle button's icon/label to match.
  applyDarkMode(document.documentElement.getAttribute("data-theme") === "dark");

  // === Hide Image (header banner) ===
  const HIDE_IMAGE_KEY = "driversDoughHideImage";
  function applyHideImage(isHidden) {
    modeImage?.classList.toggle("hide", isHidden);
    if (menuHideImage) menuHideImage.textContent = isHidden ? "Show Image" : "Hide Image";
    syncFixedBarOffsets();
  }
  menuHideImage?.addEventListener("click", () => {
    const isHidden = !modeImage?.classList.contains("hide");
    applyHideImage(isHidden);
    try {
      localStorage.setItem(HIDE_IMAGE_KEY, isHidden ? "1" : "0");
    } catch (err) {}
    closeHamburgerMenu();
  });
  try {
    applyHideImage(localStorage.getItem(HIDE_IMAGE_KEY) === "1");
  } catch (err) {
    applyHideImage(false);
  }

  // === Hamburger menu ===
  function openHamburgerMenu() {
    hamburgerMenu?.classList.add("is-open");
    hamburgerMenu?.setAttribute("aria-hidden", "false");
    hamburgerBtn?.setAttribute("aria-expanded", "true");
  }
  function closeHamburgerMenu() {
    hamburgerMenu?.classList.remove("is-open");
    hamburgerMenu?.setAttribute("aria-hidden", "true");
    hamburgerBtn?.setAttribute("aria-expanded", "false");
  }
  hamburgerBtn?.addEventListener("click", () => {
    if (hamburgerMenu?.classList.contains("is-open")) closeHamburgerMenu();
    else openHamburgerMenu();
  });
  document.addEventListener("click", (e) => {
    if (!hamburgerMenu?.classList.contains("is-open")) return;
    if (hamburgerMenu.contains(e.target) || hamburgerBtn?.contains(e.target)) return;
    closeHamburgerMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hamburgerMenu?.classList.contains("is-open")) closeHamburgerMenu();
  });

  // Maps is now real — see js/maps.js, which wires up #menuMaps on its own.
  // Codes is now real too — see js/codes.js, which wires up #menuCodes.

  // === Backup / Restore ===
  // Everything this app stores lives in localStorage on this one device —
  // swap phones, clear site data, or run into trouble, and it's gone.
  // Backup Data saves it all to one file the user keeps themselves;
  // Restore Data loads that file back in (here or on a different device).
  const BACKUP_KEYS = [
    "driversDoughEntries",
    "driversDoughTimeCard",
    "driversDoughStatsHistory",
    "driversDoughPaneWidth",
    "driversDoughDarkMode",
    "driversDoughHideImage",
    "driversDoughMaps",
    "driversDoughForum",
    "driversDoughAuth",
  ];

  function backupData() {
    closeHamburgerMenu();
    const snapshot = { app: "driversDough", version: 1, exportedAt: new Date().toISOString(), data: {} };
    BACKUP_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) snapshot.data[k] = v;
    });
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drivers-dough-backup-${toDateKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  menuBackup?.addEventListener("click", backupData);

  function restoreData() {
    closeHamburgerMenu();
    restoreFileInput?.click();
  }
  menuRestore?.addEventListener("click", restoreData);

  restoreFileInput?.addEventListener("change", () => {
    const file = restoreFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      restoreFileInput.value = ""; // lets the same file be picked again later
      let data = null;
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.data && typeof parsed.data === "object") data = parsed.data;
      } catch (err) {
        data = null;
      }
      if (!data) {
        window.DD.modal?.show({
          top: "RESTORE FAILED",
          bottom: "THAT FILE DOESN'T LOOK LIKE A BACKUP",
          okText: "OK",
        });
        return;
      }
      window.DD.modal?.show({
        top: "RESTORE DATA",
        bottom: "THIS REPLACES EVERYTHING ON THIS DEVICE",
        okText: "Restore",
        cancelText: "Cancel",
        danger: true,
        highlightBottom: true,
        onOk: () => {
          BACKUP_KEYS.forEach((k) => {
            try {
              if (data[k] !== undefined) localStorage.setItem(k, data[k]);
            } catch (err) {}
          });
          window.location.reload();
        },
      });
    };
    reader.readAsText(file);
  });

  // === Time Card ===
  // One punch-in/punch-out pair per calendar day, keyed by local date
  // ("YYYY-MM-DD") so it can't drift with timezone math. End Night (below)
  // stamps that day's CC gratuity onto the same record once a shift wraps.
  const TIMECARD_KEY = "driversDoughTimeCard";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function toDateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // A verified Sunday that starts a pay period. Every other period is this
  // one shifted by a whole number of 14-day blocks (past or future), so the
  // Sunday-start/Saturday-end rotation holds forever without drifting —
  // there's no "current period" stored anywhere, it's recomputed from
  // today's date every time.
  const PERIOD_ANCHOR_SUNDAY = startOfDay(new Date(2026, 7, 9)); // Aug 9, 2026
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function getPeriodStart(date) {
    const day = startOfDay(date);
    const daysSinceAnchor = Math.round((day - PERIOD_ANCHOR_SUNDAY) / MS_PER_DAY);
    const periodIndex = Math.floor(daysSinceAnchor / 14);
    const start = new Date(PERIOD_ANCHOR_SUNDAY);
    start.setDate(start.getDate() + periodIndex * 14);
    return start;
  }

  function formatDateShort(d) {
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  function formatDateHeading(d) {
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function formatTime12h(hhmm) {
    if (!hhmm) return "—";
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return "—";
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad2(m)} ${period}`;
  }
  function nowHHMM() {
    const now = new Date();
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  }

  // Minutes worked in one "HH:MM"-"HH:MM" shift. Wraps past midnight
  // (out < in) by assuming the shift crossed into the next day rather than
  // showing a negative number.
  function shiftMinutes(inHHMM, outHHMM) {
    if (!inHHMM || !outHHMM) return 0;
    const [ih, im] = inHHMM.split(":").map(Number);
    const [oh, om] = outHHMM.split(":").map(Number);
    if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return 0;
    const inMin = ih * 60 + im;
    const outMin = oh * 60 + om;
    return ((outMin - inMin) % 1440 + 1440) % 1440;
  }

  // Total hours worked across every completed shift in a day, as a trimmed
  // decimal string ("8.5h", "7h", "6.25h") — a day can hold more than one
  // punch-in/punch-out pair (see the shifts array below), so this sums all
  // of them rather than just one.
  function formatHoursForShifts(shifts) {
    if (!Array.isArray(shifts) || !shifts.length) return "—";
    let totalMin = 0;
    let any = false;
    shifts.forEach((s) => {
      if (!s?.in || !s?.out) return;
      totalMin += shiftMinutes(s.in, s.out);
      any = true;
    });
    if (!any) return "—";
    const hours = totalMin / 60;
    const rounded = Math.round(hours * 100) / 100;
    return `${parseFloat(rounded.toFixed(2))}h`;
  }

  function loadTimeCard() {
    try {
      const raw = localStorage.getItem(TIMECARD_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return {};
      // Migrate the old one-in/one-out-per-day shape (from before a single
      // day could hold more than one punch-in/punch-out pair) into a
      // shifts array, so a punch recorded before this update isn't lost or
      // corrupted by the format change.
      Object.keys(parsed).forEach((key) => {
        const rec = parsed[key];
        if (!rec || typeof rec !== "object") return;
        if (!Array.isArray(rec.shifts)) {
          const shifts = [];
          if (rec.in || rec.out) shifts.push({ in: rec.in || null, out: rec.out || null });
          rec.shifts = shifts;
          delete rec.in;
          delete rec.out;
        }
      });
      return parsed;
    } catch (err) {
      return {};
    }
  }
  function saveTimeCard() {
    try {
      localStorage.setItem(TIMECARD_KEY, JSON.stringify(timeCard));
    } catch (err) {}
  }

  // { "2026-08-20": { shifts: [{in:"14:32", out:"18:00"}, {in:"19:00",
  //   out:"22:10"}], ccGratuity: "45.00" }, ... } — a plain array so a
  // second punch-in the same day (a split shift, forgetting to punch out
  // and back in, whatever) starts a NEW shift instead of overwriting the
  // first one's times.
  let timeCard = loadTimeCard();

  // The header button's only state: today has an open shift (punched in,
  // not yet out) — i.e. the LAST shift in today's list has an in but no out.
  function isPunchedIn() {
    const shifts = timeCard[toDateKey(new Date())]?.shifts;
    if (!Array.isArray(shifts) || !shifts.length) return false;
    const last = shifts[shifts.length - 1];
    return !!(last?.in && !last?.out);
  }

  function refreshPunchButton() {
    const punchedIn = isPunchedIn();
    if (punchLabel) punchLabel.textContent = punchedIn ? "Punch Out" : "Punch In";
    punchBtn?.classList.toggle("is-punched-in", punchedIn);
  }

  function openPunchPopup() {
    const mode = isPunchedIn() ? "out" : "in";
    if (punchTitle) punchTitle.textContent = mode === "out" ? "Punch Out" : "Punch In";
    if (punchDateEl) punchDateEl.textContent = formatDateHeading(new Date());
    if (punchTimeInput) punchTimeInput.value = nowHHMM();
    punchOverlay?.classList.add("is-open");
    punchOverlay?.setAttribute("aria-hidden", "false");
    punchTimeInput?.focus();
  }
  function closePunchPopup() {
    punchOverlay?.classList.remove("is-open");
    punchOverlay?.setAttribute("aria-hidden", "true");
  }
  function confirmPunch() {
    const punchedIn = isPunchedIn();
    const time = punchTimeInput?.value || nowHHMM();
    const key = toDateKey(new Date());
    if (!timeCard[key]) timeCard[key] = { shifts: [], ccGratuity: null };
    if (!Array.isArray(timeCard[key].shifts)) timeCard[key].shifts = [];
    if (punchedIn) {
      // Punching out closes the currently-open shift (the last one).
      const last = timeCard[key].shifts[timeCard[key].shifts.length - 1];
      if (last) last.out = time;
      else timeCard[key].shifts.push({ in: null, out: time });
    } else {
      // Punching in always starts a NEW shift rather than touching any
      // earlier one — this is what stops a second punch-in the same day
      // from overwriting the first shift's times.
      timeCard[key].shifts.push({ in: time, out: null });
    }
    saveTimeCard();
    refreshPunchButton();
    closePunchPopup();
    if (timecardOverlay?.classList.contains("is-open")) renderTimeCard();
    // Only on a punch-IN (not punch-out) — shows a "this day last year"
    // recap if there's stats data for the same date a year ago.
    if (!punchedIn) checkThisDayLastYear();
  }
  punchBtn?.addEventListener("click", openPunchPopup);
  punchConfirmBtn?.addEventListener("click", confirmPunch);
  punchCancelBtn?.addEventListener("click", closePunchPopup);
  punchOverlay?.addEventListener("click", (e) => {
    if (e.target === punchOverlay) closePunchPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && punchOverlay?.classList.contains("is-open")) closePunchPopup();
  });
  refreshPunchButton();

  // Lists the full 14-day pay period ("this Saturday" and every 14 days
  // before/after it are period-end Saturdays, Sunday starts the next one)
  // that today falls in — every day gets a row, punched or not, so a
  // missed punch is as visible as a filled-in one.
  //
  // timeCardRefDate controls WHICH period is shown — it's reset to today
  // whenever the popup is freshly opened from the hamburger menu, but the
  // Previous list (below) can point it at an earlier period instead.
  // "Today" is always computed separately from the real current date, so
  // the today-highlight only ever lands on the actual current day, never
  // on a day in a past period being viewed.
  let timeCardRefDate = new Date();

  function renderTimeCard() {
    if (!timecardBody) return;
    const actualToday = startOfDay(new Date());
    const periodStart = getPeriodStart(timeCardRefDate);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 13);
    if (timecardPeriodEl) {
      timecardPeriodEl.textContent =
        `${periodStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ` +
        `${periodEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    const todayKey = toDateKey(actualToday);
    const isCurrentPeriod = periodStart.getTime() === getPeriodStart(actualToday).getTime();
    timecardCurrentLink?.classList.toggle("hide", isCurrentPeriod);
    timecardBody.innerHTML = "";
    for (let i = 0; i < 14; i++) {
      const d = new Date(periodStart);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const rec = timeCard[key];

      const day = document.createElement("div");
      day.className = "dd-timecard-day";
      if (key === todayKey) day.classList.add("dd-timecard-today");

      const dateEl = document.createElement("div");
      dateEl.className = "dd-timecard-day-date";
      dateEl.textContent = formatDateShort(d);
      day.appendChild(dateEl);

      // Row A: In / Out (one row per shift — almost always just one, but a
      // second punch-in the same day adds a second row instead of erasing
      // the first). Final row: Hours (summed across every shift) / CC
      // Gratuity. All laid out as a 2-column grid so nothing has to be
      // shrunk down to fit everything side by side in one cramped row.
      const grid = document.createElement("div");
      grid.className = "dd-timecard-day-grid";
      const shifts = rec?.shifts?.length ? rec.shifts : [{ in: null, out: null }];
      const fields = [];
      shifts.forEach((s, i) => {
        const n = shifts.length > 1 ? ` ${i + 1}` : "";
        fields.push([`In${n}`, s.in ? formatTime12h(s.in) : "—"]);
        fields.push([`Out${n}`, s.out ? formatTime12h(s.out) : "—"]);
      });
      fields.push(["Hours", formatHoursForShifts(rec?.shifts)]);
      fields.push(["CC Grat.", rec?.ccGratuity ? `$${rec.ccGratuity}` : "—"]);
      fields.forEach(([label, value]) => {
        const field = document.createElement("div");
        field.className = "dd-timecard-field";
        const labelEl = document.createElement("span");
        labelEl.className = "dd-timecard-field-label";
        labelEl.textContent = label;
        const valueEl = document.createElement("span");
        valueEl.className = "dd-timecard-field-value";
        valueEl.textContent = value;
        field.appendChild(labelEl);
        field.appendChild(valueEl);
        grid.appendChild(field);
      });
      day.appendChild(grid);
      timecardBody.appendChild(day);
    }
  }

  function showTimeCardOverlay() {
    timecardOverlay?.classList.add("is-open");
    timecardOverlay?.setAttribute("aria-hidden", "false");
    timecardDoneBtn?.focus();
  }
  function openTimeCard() {
    closeHamburgerMenu();
    timeCardRefDate = new Date(); // always opens on the current period
    renderTimeCard();
    showTimeCardOverlay();
  }
  function closeTimeCard() {
    timecardOverlay?.classList.remove("is-open");
    timecardOverlay?.setAttribute("aria-hidden", "true");
  }
  menuTimeCard?.addEventListener("click", openTimeCard);
  timecardDoneBtn?.addEventListener("click", closeTimeCard);
  timecardOverlay?.addEventListener("click", (e) => {
    if (e.target === timecardOverlay) closeTimeCard();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && timecardOverlay?.classList.contains("is-open")) closeTimeCard();
  });

  // Jumps the main Time Card view straight back to today's period without
  // closing the popup — only visible once you've drilled into a past one.
  timecardCurrentLink?.addEventListener("click", () => {
    timeCardRefDate = new Date();
    renderTimeCard();
  });

  // Every past pay period that has any recorded activity (a punch or a
  // stamped CC gratuity), most recent first — the current period is left
  // out since that's what the main view already shows.
  function getPastPeriodsWithData() {
    const currentPeriodStart = getPeriodStart(new Date()).getTime();
    const periods = new Map(); // period start (ms) -> { start, totalMinutes }
    Object.keys(timeCard).forEach((key) => {
      const rec = timeCard[key];
      const hasShift = Array.isArray(rec?.shifts) && rec.shifts.some((s) => s?.in || s?.out);
      const hasGrat = rec?.ccGratuity !== null && rec?.ccGratuity !== undefined && rec?.ccGratuity !== "";
      if (!hasShift && !hasGrat) return;
      const d = new Date(`${key}T00:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const periodStart = getPeriodStart(d);
      const pKey = periodStart.getTime();
      if (pKey === currentPeriodStart) return;
      if (!periods.has(pKey)) periods.set(pKey, { start: periodStart, totalMinutes: 0 });
      const entry = periods.get(pKey);
      if (Array.isArray(rec.shifts)) {
        rec.shifts.forEach((s) => {
          if (s.in && s.out) entry.totalMinutes += shiftMinutes(s.in, s.out);
        });
      }
    });
    return Array.from(periods.values()).sort((a, b) => b.start - a.start);
  }

  function renderTimeCardList() {
    if (!timecardListBody) return;
    timecardListBody.innerHTML = "";
    const periods = getPastPeriodsWithData();
    if (!periods.length) {
      const empty = document.createElement("div");
      empty.className = "dd-timecard-list-empty";
      empty.textContent = "No previous time cards yet.";
      timecardListBody.appendChild(empty);
      return;
    }
    periods.forEach((p) => {
      const end = new Date(p.start);
      end.setDate(end.getDate() + 13);
      const item = document.createElement("div");
      item.className = "dd-timecard-list-item";
      const range = document.createElement("span");
      range.className = "dd-timecard-list-range";
      range.textContent =
        `${p.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ` +
        `${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      const meta = document.createElement("span");
      meta.className = "dd-timecard-list-meta";
      const hours = Math.round((p.totalMinutes / 60) * 100) / 100;
      meta.textContent = `${parseFloat(hours.toFixed(2))}h`;
      item.appendChild(range);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        timeCardRefDate = new Date(p.start);
        renderTimeCard();
        closeTimeCardList();
        showTimeCardOverlay();
      });
      timecardListBody.appendChild(item);
    });
  }

  function openTimeCardList() {
    renderTimeCardList();
    timecardListOverlay?.classList.add("is-open");
    timecardListOverlay?.setAttribute("aria-hidden", "false");
    timecardListDoneBtn?.focus();
  }
  function closeTimeCardList() {
    timecardListOverlay?.classList.remove("is-open");
    timecardListOverlay?.setAttribute("aria-hidden", "true");
  }
  timecardPrevLink?.addEventListener("click", () => {
    closeTimeCard();
    openTimeCardList();
  });
  timecardListDoneBtn?.addEventListener("click", () => {
    closeTimeCardList();
    showTimeCardOverlay();
  });
  timecardListOverlay?.addEventListener("click", (e) => {
    if (e.target === timecardListOverlay) {
      closeTimeCardList();
      showTimeCardOverlay();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && timecardListOverlay?.classList.contains("is-open")) {
      closeTimeCardList();
      showTimeCardOverlay();
    }
  });

  // === Stats history ===
  // Permanent, hour-bucketed archive of every night's deliveries, kept
  // forever (small — plain counts/dollars, no raw entries) so Day/Week/
  // Month/Year stats and "this day last year" can be computed at any time.
  // Entries themselves are wiped by End Night same as always; this is what
  // survives that wipe.
  const STATS_KEY = "driversDoughStatsHistory";
  const FEE_KEYS = window.DD.calc.FEE_TIERS;

  // Tip-amount distribution buckets — half-open ranges [lower, upper), so
  // e.g. a $2.00 tip lands in "2-3", not "1-2". Only nonzero tips are
  // bucketed (matches "Number of Tips" being a nonzero-tip count).
  const TIP_BUCKET_DEFS = [
    { key: "<1", test: (t) => t < 1 },
    { key: "1-2", test: (t) => t >= 1 && t < 2 },
    { key: "2-3", test: (t) => t >= 2 && t < 3 },
    { key: "3-4", test: (t) => t >= 3 && t < 4 },
    { key: "4-5", test: (t) => t >= 4 && t < 5 },
    { key: "5-6", test: (t) => t >= 5 && t < 6 },
    { key: "6-7", test: (t) => t >= 6 && t < 7 },
    { key: "7-8", test: (t) => t >= 7 && t < 8 },
    { key: "8-9", test: (t) => t >= 8 && t < 9 },
    { key: "9-10", test: (t) => t >= 9 && t < 10 },
    { key: "10-15", test: (t) => t >= 10 && t < 15 },
    { key: "15-20", test: (t) => t >= 15 && t < 20 },
    { key: "20+", test: (t) => t >= 20 },
  ];
  function tipBucketKey(tip) {
    const found = TIP_BUCKET_DEFS.find((b) => b.test(tip));
    return found ? found.key : "20+";
  }

  // One hour's worth of stats — also reused as the shape for any summed
  // range (a day, a week, a whole year), since summing is just adding these
  // together field by field.
  function emptyStatsBucket() {
    const feeCounts = {};
    FEE_KEYS.forEach((f) => (feeCounts[f] = 0));
    const tipBuckets = {};
    TIP_BUCKET_DEFS.forEach((b) => (tipBuckets[b.key] = 0));
    return { deliveries: 0, tipCount: 0, tipValue: 0, orderTotal: 0, feeCounts, tipBuckets };
  }
  function addBucket(target, bucket) {
    if (!bucket) return;
    target.deliveries += bucket.deliveries || 0;
    target.tipCount += bucket.tipCount || 0;
    target.tipValue += bucket.tipValue || 0;
    target.orderTotal += bucket.orderTotal || 0;
    FEE_KEYS.forEach((f) => (target.feeCounts[f] += bucket.feeCounts?.[f] || 0));
    TIP_BUCKET_DEFS.forEach((b) => (target.tipBuckets[b.key] += bucket.tipBuckets?.[b.key] || 0));
  }

  function loadStatsHistory() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  function saveStatsHistory() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(statsHistory));
    } catch (err) {}
  }

  // { "2026-08-21": { "17": {deliveries, tipCount, tipValue, orderTotal,
  //   feeCounts:{...}, tipBuckets:{...}}, "18": {...}, ... }, ... } — sparse,
  // only hours that actually had a delivery exist.
  let statsHistory = loadStatsHistory();

  // Rolls one night's entries into the permanent archive — called from
  // clearAllEntries() right before it wipes them, so nothing is lost, just
  // condensed from individual deliveries down to per-hour counts/totals.
  function archiveEntriesToStats(entriesToArchive) {
    if (!entriesToArchive.length) return;
    const key = toDateKey(new Date());
    if (!statsHistory[key]) statsHistory[key] = {};
    const day = statsHistory[key];
    entriesToArchive.forEach((entry) => {
      const hh = (entry.time || nowHHMM()).split(":")[0];
      const hourKey = String(parseInt(hh, 10));
      if (!day[hourKey]) day[hourKey] = emptyStatsBucket();
      const bucket = day[hourKey];
      const tip = parseFloat(entry.tip) || 0;
      // Order Total here means what the customer paid for the order
      // itself -- a phone/online CC slip's printed total often already
      // has the driver's card tip baked in, so back that portion out
      // (see correctedOrderTotal). Cash orders, and any tip portion paid
      // in cash, are untouched.
      const total = window.DD.calc.correctedOrderTotal(entry);
      bucket.deliveries += 1;
      bucket.orderTotal += total;
      if (tip > 0) {
        bucket.tipCount += 1;
        bucket.tipValue += tip;
        bucket.tipBuckets[tipBucketKey(tip)] += 1;
      }
      if (entry.fee && bucket.feeCounts[entry.fee] !== undefined) {
        bucket.feeCounts[entry.fee] += 1;
      }
    });
    saveStatsHistory();
  }

  // Lunch/dinner rush windows, in hour-of-day (24h, local time). Everything
  // from 4pm on counts as dinner through end of day — no fixed dinner end,
  // since how late it runs varies night to night.
  const LUNCH_START_HOUR = 10;
  const LUNCH_END_HOUR = 16; // up to, not including, 4pm
  const DINNER_START_HOUR = 16;
  const DINNER_END_HOUR = 24;

  // Sums every archived hour-bucket across [startDate, endDate] (inclusive,
  // local dates) into one combined total, a 0-23 hour-of-day breakdown, and
  // lunch/dinner shift totals derived from that same breakdown — this is
  // the one function Day/Week/Month/Year stats views all run through, just
  // with a different date range. Hours worked comes from the existing time
  // card shifts data for the same range, not from statsHistory.
  function computeStatsForRange(startDate, endDate) {
    const totals = emptyStatsBucket();
    const byHour = {};
    for (let h = 0; h < 24; h++) byHour[h] = emptyStatsBucket();
    const byDay = {}; // dateKey -> bucket, insertion order == date order
    const byMonth = {}; // "YYYY-MM" -> bucket, insertion order == month order
    let totalMinutesWorked = 0;

    const cursor = startOfDay(startDate);
    const last = startOfDay(endDate);
    while (cursor <= last) {
      const key = toDateKey(cursor);
      const monthKey = key.slice(0, 7);
      const day = statsHistory[key];
      if (day) {
        if (!byDay[key]) byDay[key] = emptyStatsBucket();
        if (!byMonth[monthKey]) byMonth[monthKey] = emptyStatsBucket();
        Object.keys(day).forEach((hourKey) => {
          addBucket(totals, day[hourKey]);
          if (byHour[hourKey]) addBucket(byHour[hourKey], day[hourKey]);
          addBucket(byDay[key], day[hourKey]);
          addBucket(byMonth[monthKey], day[hourKey]);
        });
      }
      const tcShifts = timeCard[key]?.shifts;
      if (Array.isArray(tcShifts)) {
        tcShifts.forEach((s) => {
          if (s.in && s.out) totalMinutesWorked += shiftMinutes(s.in, s.out);
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const lunch = emptyStatsBucket();
    const dinner = emptyStatsBucket();
    for (let h = 0; h < 24; h++) {
      if (h >= LUNCH_START_HOUR && h < LUNCH_END_HOUR) addBucket(lunch, byHour[h]);
      if (h >= DINNER_START_HOUR && h < DINNER_END_HOUR) addBucket(dinner, byHour[h]);
    }

    return {
      totals,
      byHour,
      byDay,
      byMonth,
      lunch,
      dinner,
      hoursWorked: Math.round((totalMinutesWorked / 60) * 100) / 100,
    };
  }

  // Date-range helpers for the four stats tabs. Week is Sunday-start,
  // matching the pay period the time card already uses.
  function getDayRange(date) {
    const d = startOfDay(date);
    return [d, d];
  }
  function getWeekRange(date) {
    const d = startOfDay(date);
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [start, end];
  }
  function getMonthRange(date) {
    const d = startOfDay(date);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [start, end];
  }
  function getYearRange(date) {
    const d = startOfDay(date);
    const start = new Date(d.getFullYear(), 0, 1);
    const end = new Date(d.getFullYear(), 11, 31);
    return [start, end];
  }

  // "This Saturday is period ending" etc. already established Sunday-start
  // weeks elsewhere in this file — reusing that same convention here so
  // "week" means the same thing everywhere in the app.

  // Fires on a punch-IN: if there's archived data for this exact
  // month/day from a year ago, shows a quick recap via the same plain
  // popup used for order confirmations and tip breakdowns.
  function checkThisDayLastYear() {
    const today = new Date();
    const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const key = toDateKey(lastYear);
    const day = statsHistory[key];
    if (!day) return;
    const totals = emptyStatsBucket();
    Object.keys(day).forEach((hourKey) => addBucket(totals, day[hourKey]));
    if (!totals.deliveries) return;
    const rows = [
      ["Deliveries", String(totals.deliveries)],
      ["Tips", String(totals.tipCount)],
      ["Tip Value", `$${totals.tipValue.toFixed(2)}`],
      ["Order Total", `$${totals.orderTotal.toFixed(2)}`],
    ];
    if (confirmTitle) confirmTitle.textContent = `On This Day, ${lastYear.getFullYear()}`;
    renderConfirmRows(confirmList, rows);
    openConfirmDialog();
  }

  // True if the given date (by local date key) has an actual time card
  // entry or any archived deliveries — used to skip empty dates when
  // paging through stats so Prev/Next don't wander through blank days.
  function dateKeyHasActivity(key) {
    const tc = timeCard[key];
    if (tc && Array.isArray(tc.shifts) && tc.shifts.length) return true;
    const day = statsHistory[key];
    if (day && Object.keys(day).some((h) => day[h].deliveries > 0)) return true;
    return false;
  }
  function rangeHasActivity(start, end) {
    const cursor = startOfDay(start);
    const last = startOfDay(end);
    while (cursor <= last) {
      if (dateKeyHasActivity(toDateKey(cursor))) return true;
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  }

  // === Stats page ===
  let currentStatsTab = "day"; // "day" | "week" | "month" | "year"
  let currentStatsDate = new Date();

  function getStatsRange() {
    if (currentStatsTab === "week") return getWeekRange(currentStatsDate);
    if (currentStatsTab === "month") return getMonthRange(currentStatsDate);
    if (currentStatsTab === "year") return getYearRange(currentStatsDate);
    return getDayRange(currentStatsDate);
  }

  function formatStatsPeriodLabel() {
    const d = currentStatsDate;
    if (currentStatsTab === "day") {
      return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (currentStatsTab === "week") {
      const [start, end] = getWeekRange(d);
      return (
        `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ` +
        `${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      );
    }
    if (currentStatsTab === "month") {
      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    return String(d.getFullYear());
  }

  const TIP_BUCKET_LABELS = {
    "<1": "Under $1",
    "1-2": "$1 – $2",
    "2-3": "$2 – $3",
    "3-4": "$3 – $4",
    "4-5": "$4 – $5",
    "5-6": "$5 – $6",
    "6-7": "$6 – $7",
    "7-8": "$7 – $8",
    "8-9": "$8 – $9",
    "9-10": "$9 – $10",
    "10-15": "$10 – $15",
    "15-20": "$15 – $20",
    "20+": "$20+",
  };

  function formatHourLabel(h) {
    const hour = Number(h);
    const period = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12} ${period}`;
  }

  // --- Chart colors -------------------------------------------------
  // Fixed-order categorical brand hues, validated for colorblind-safe
  // adjacent contrast (each mode checked separately since a dark surface
  // needs different lightness steps to stay readable). Used wherever
  // bars/slices represent DIFFERENT NAMED THINGS (fee tiers, lunch vs
  // dinner) so identity never depends on color alone -- every chart also
  // prints its own labels.
  const CHART_PALETTE = {
    light: { blue: "#55A6D9", orange: "#F28705", aqua: "#1baf7a", yellow: "#D9A200", magenta: "#e87ba4", green: "#008300" },
    dark: { blue: "#3D8FC7", orange: "#D97904", aqua: "#199e70", yellow: "#A88300", magenta: "#d55181", green: "#008300" },
  };
  const FEE_CHART_HUES = ["blue", "orange", "aqua", "yellow", "magenta", "green"]; // matches FEE_KEYS order
  const LUNCH_DINNER_HUES = { light: ["#55A6D9", "#F28705"], dark: ["#3D8FC7", "#D97904"] };

  function isDarkMode() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }
  function feeChartColor(index) {
    const mode = isDarkMode() ? "dark" : "light";
    const hue = FEE_CHART_HUES[index % FEE_CHART_HUES.length];
    return CHART_PALETTE[mode][hue];
  }

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }
  function hexToHslArr(hex) {
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }
  // Position-based ramp of n steps around one brand hue: the FIRST item in
  // a sequence (earliest hour, lowest tip bucket, earliest day) reads
  // lightest and the LAST reads darkest -- order carries the meaning, not
  // each bar's own value, so color never re-encodes what the bar's length
  // already shows. Same lightness band in both themes (40%-72% L) since
  // that range stays legible against both a white and a near-black surface.
  function ordinalRamp(baseHex, n) {
    const [h] = hexToHslArr(baseHex);
    const sat = 62;
    const lo = 40, hi = 72;
    const steps = [];
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      steps.push(hslToHex(h, sat, hi - t * (hi - lo)));
    }
    return steps;
  }

  // --- Chart builders -------------------------------------------------
  // Horizontal HTML bar rows: label, a proportional fill, and the exact
  // value printed alongside it -- the bar is a visual on top of a number
  // you can already read, never the only way to get it. A native title
  // attribute adds a hover tooltip on top of that.
  function buildBarChart(container, items, formatValue, ariaLabel) {
    const max = Math.max(1, ...items.map((it) => it.value));
    const chart = document.createElement("div");
    chart.className = "dd-chart-bars";
    chart.setAttribute("role", "img");
    if (ariaLabel) chart.setAttribute("aria-label", ariaLabel);
    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "dd-chart-bar-row";
      row.title = `${it.label}: ${formatValue(it.value)}`;
      const label = document.createElement("span");
      label.className = "dd-chart-bar-label";
      label.textContent = it.label;
      const track = document.createElement("div");
      track.className = "dd-chart-bar-track";
      const fill = document.createElement("div");
      fill.className = "dd-chart-bar-fill";
      const pct = it.value > 0 ? Math.max(4, (it.value / max) * 100) : 0;
      fill.style.width = pct + "%";
      fill.style.background = it.color;
      track.appendChild(fill);
      const value = document.createElement("span");
      value.className = "dd-chart-bar-value";
      value.textContent = formatValue(it.value);
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      chart.appendChild(row);
    });
    container.appendChild(chart);
  }

  // SVG donut for a true part-to-whole ratio (kept to 2-3 slices, per the
  // colorblind-safety cap on part-to-whole palettes). Center shows the
  // combined total; the legend below prints each slice's own label,
  // value, and percentage as real text -- the ring's colors are backup,
  // not the only way to read the split.
  const SVG_NS = "http://www.w3.org/2000/svg";
  function buildDonutChart(container, slices, formatValue, centerLabel) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    const row = document.createElement("div");
    row.className = "dd-chart-donut-row";

    const outer = document.createElement("div");
    outer.className = "dd-chart-donut-outer";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 42 42");
    svg.setAttribute("class", "dd-chart-donut");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      slices.map((s) => `${s.label} ${total ? Math.round((s.value / total) * 100) : 0} percent`).join(", ")
    );
    const track = document.createElementNS(SVG_NS, "circle");
    track.setAttribute("cx", "21");
    track.setAttribute("cy", "21");
    track.setAttribute("r", "15.9155");
    track.setAttribute("class", "dd-chart-donut-track");
    svg.appendChild(track);

    let cumulative = 0;
    slices.forEach((s) => {
      const pct = total > 0 ? (s.value / total) * 100 : 0;
      if (pct <= 0) return;
      const gap = slices.length > 1 ? 1 : 0;
      const arc = Math.max(pct - gap, 0.001);
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", "21");
      circle.setAttribute("cy", "21");
      circle.setAttribute("r", "15.9155");
      circle.setAttribute("class", "dd-chart-donut-slice");
      circle.setAttribute("stroke", s.color);
      circle.setAttribute("stroke-dasharray", `${arc} ${100 - arc}`);
      circle.setAttribute("stroke-dashoffset", String(-cumulative));
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${s.label}: ${formatValue(s.value)} (${Math.round(pct)}%)`;
      circle.appendChild(title);
      svg.appendChild(circle);
      cumulative += pct;
    });
    outer.appendChild(svg);

    const center = document.createElement("div");
    center.className = "dd-chart-donut-center";
    const centerValue = document.createElement("div");
    centerValue.className = "dd-chart-donut-center-value";
    centerValue.textContent = formatValue(total);
    const centerText = document.createElement("div");
    centerText.className = "dd-chart-donut-center-label";
    centerText.textContent = centerLabel || "Total";
    center.appendChild(centerValue);
    center.appendChild(centerText);
    outer.appendChild(center);
    row.appendChild(outer);

    const legend = document.createElement("div");
    legend.className = "dd-chart-legend";
    slices.forEach((s) => {
      const item = document.createElement("div");
      item.className = "dd-chart-legend-item";
      const swatch = document.createElement("span");
      swatch.className = "dd-chart-legend-swatch";
      swatch.style.background = s.color;
      const text = document.createElement("span");
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      text.textContent = `${s.label} — ${formatValue(s.value)} (${pct}%)`;
      item.appendChild(swatch);
      item.appendChild(text);
      legend.appendChild(item);
    });
    row.appendChild(legend);

    container.appendChild(row);
  }

  function addStatsRow(container, label, value) {
    const row = document.createElement("div");
    row.className = "dd-stats-row";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "dd-stats-row-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    container.appendChild(row);
  }

  function addStatsEmptyNote(container, text) {
    const note = document.createElement("div");
    note.className = "dd-stats-empty";
    note.textContent = text;
    container.appendChild(note);
  }

  function addStatsSection(parent, title) {
    const section = document.createElement("div");
    section.className = "dd-stats-section";
    const heading = document.createElement("div");
    heading.className = "dd-stats-section-title";
    heading.textContent = title;
    section.appendChild(heading);
    parent.appendChild(section);
    return section;
  }

  // Rebuilds the whole Stats popup body for the current tab + period —
  // same pattern as renderTimeCard: wipe and rebuild from scratch rather
  // than trying to patch individual pieces.
  function renderStats() {
    if (!statsBody) return;
    if (statsPeriodEl) statsPeriodEl.textContent = formatStatsPeriodLabel();
    document.querySelectorAll(".dd-stats-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === currentStatsTab);
    });

    const [start, end] = getStatsRange();
    const result = computeStatsForRange(start, end);
    const t = result.totals;

    statsBody.innerHTML = "";

    const summary = addStatsSection(statsBody, "Summary");
    addStatsRow(summary, "Hours Worked", `${result.hoursWorked}h`);
    addStatsRow(summary, "Deliveries", String(t.deliveries));
    addStatsRow(summary, "Tips", String(t.tipCount));
    addStatsRow(summary, "Tip Value", `$${t.tipValue.toFixed(2)}`);
    addStatsRow(summary, "Order Total", `$${t.orderTotal.toFixed(2)}`);

    // Over Time: only meaningful past a single day -- Day's own "By Hour"
    // section below already IS its over-time view. Week/Month walk day by
    // day; Year walks month by month. Every point in the range is plotted
    // (including $0 days), so a quiet stretch shows as a real gap rather
    // than just vanishing from the chart.
    if (currentStatsTab !== "day") {
      const trendSection = addStatsSection(statsBody, "Over Time");
      const trendItems = [];
      if (currentStatsTab === "year") {
        const year = start.getFullYear();
        const baseHue = isDarkMode() ? CHART_PALETTE.dark.blue : CHART_PALETTE.light.blue;
        const colors = ordinalRamp(baseHue, 12);
        for (let m = 0; m < 12; m++) {
          const key = `${year}-${pad2(m + 1)}`;
          const bucket = result.byMonth[key];
          trendItems.push({
            label: new Date(year, m, 1).toLocaleDateString(undefined, { month: "short" }),
            value: bucket ? bucket.tipValue : 0,
            color: colors[m],
          });
        }
      } else {
        const days = [];
        const cursor = startOfDay(start);
        const last = startOfDay(end);
        while (cursor <= last) {
          days.push(new Date(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
        const baseHue = isDarkMode() ? CHART_PALETTE.dark.blue : CHART_PALETTE.light.blue;
        const colors = ordinalRamp(baseHue, days.length);
        days.forEach((d, i) => {
          const key = toDateKey(d);
          const bucket = result.byDay[key];
          const label =
            currentStatsTab === "week"
              ? d.toLocaleDateString(undefined, { weekday: "short" })
              : String(d.getDate());
          trendItems.push({ label, value: bucket ? bucket.tipValue : 0, color: colors[i] });
        });
      }
      if (!trendItems.some((it) => it.value > 0)) {
        addStatsEmptyNote(trendSection, "No tips recorded for this period.");
      } else {
        buildBarChart(trendSection, trendItems, (v) => `$${v.toFixed(2)}`, "Tip value over time");
      }
    }

    const fees = addStatsSection(statsBody, "Delivery Fees");
    if (!t.deliveries) {
      addStatsEmptyNote(fees, "No deliveries recorded for this period.");
    } else {
      const feeItems = window.DD.calc.FEE_TIERS.map((tier, i) => ({
        label: `$${tier}`,
        value: t.feeCounts[tier] || 0,
        color: feeChartColor(i),
      }));
      buildBarChart(fees, feeItems, (v) => String(v), "Deliveries by fee tier");
    }

    const shiftSection = addStatsSection(statsBody, "Shift Breakdown");
    const lunchDinnerColors = isDarkMode() ? LUNCH_DINNER_HUES.dark : LUNCH_DINNER_HUES.light;
    if (!result.lunch.deliveries && !result.dinner.deliveries) {
      addStatsEmptyNote(shiftSection, "No deliveries recorded for this period.");
    } else {
      buildDonutChart(
        shiftSection,
        [
          { label: "Lunch", value: result.lunch.deliveries, color: lunchDinnerColors[0] },
          { label: "Dinner", value: result.dinner.deliveries, color: lunchDinnerColors[1] },
        ],
        (v) => String(v),
        "Deliveries"
      );
    }
    const shiftGrid = document.createElement("div");
    shiftGrid.className = "dd-stats-shift-grid";
    [
      ["Lunch", result.lunch],
      ["Dinner", result.dinner],
      ["Full Day", t],
    ].forEach(([label, bucket]) => {
      const card = document.createElement("div");
      card.className = "dd-stats-shift-card";
      const title = document.createElement("div");
      title.className = "dd-stats-shift-title";
      title.textContent = label;
      card.appendChild(title);
      [
        ["Deliveries", String(bucket.deliveries)],
        ["Tip Value", `$${bucket.tipValue.toFixed(2)}`],
        ["Order Total", `$${bucket.orderTotal.toFixed(2)}`],
      ].forEach(([fLabel, fValue]) => {
        const field = document.createElement("div");
        field.className = "dd-stats-shift-field";
        const lab = document.createElement("span");
        lab.className = "dd-stats-shift-field-label";
        lab.textContent = fLabel;
        const val = document.createElement("span");
        val.className = "dd-stats-shift-field-value";
        val.textContent = fValue;
        field.appendChild(lab);
        field.appendChild(val);
        card.appendChild(field);
      });
      shiftGrid.appendChild(card);
    });
    shiftSection.appendChild(shiftGrid);

    const tipDist = addStatsSection(statsBody, "Tip Amounts");
    if (!t.tipCount) {
      addStatsEmptyNote(tipDist, "No tips recorded for this period.");
    } else {
      const tipBaseHue = isDarkMode() ? CHART_PALETTE.dark.blue : CHART_PALETTE.light.blue;
      const tipColors = ordinalRamp(tipBaseHue, TIP_BUCKET_DEFS.length);
      const tipItems = TIP_BUCKET_DEFS.map((b, i) => ({
        label: TIP_BUCKET_LABELS[b.key],
        value: t.tipBuckets[b.key] || 0,
        color: tipColors[i],
      }));
      buildBarChart(tipDist, tipItems, (v) => String(v), "Tip count by amount range");
    }

    const hourSection = addStatsSection(statsBody, "Deliveries by Hour");
    const activeHours = Object.keys(result.byHour)
      .map(Number)
      .filter((h) => result.byHour[h].deliveries > 0)
      .sort((a, b) => a - b);
    if (!activeHours.length) {
      addStatsEmptyNote(hourSection, "No deliveries recorded for this period.");
    } else {
      const hourBaseHue = isDarkMode() ? CHART_PALETTE.dark.blue : CHART_PALETTE.light.blue;
      const hourColors = ordinalRamp(hourBaseHue, 24);
      const hourItems = activeHours.map((h) => ({
        label: formatHourLabel(h),
        value: result.byHour[h].deliveries,
        color: hourColors[h],
      }));
      buildBarChart(hourSection, hourItems, (v) => String(v), "Deliveries by hour of day");
    }

    // Same hour-of-day breakdown, but tip dollars instead of delivery
    // count -- a busy hour isn't always the best-tipping one, so this is
    // its own chart rather than folded into the count above. Uses whatever
    // hours actually had tip money (not just deliveries), and a distinct
    // hue (green, "money") so it reads as a different metric at a glance.
    const tipHourSection = addStatsSection(statsBody, "Tip $ by Hour");
    const activeTipHours = Object.keys(result.byHour)
      .map(Number)
      .filter((h) => result.byHour[h].tipValue > 0)
      .sort((a, b) => a - b);
    if (!activeTipHours.length) {
      addStatsEmptyNote(tipHourSection, "No tips recorded for this period.");
    } else {
      const tipHourBaseHue = isDarkMode() ? CHART_PALETTE.dark.green : CHART_PALETTE.light.green;
      const tipHourColors = ordinalRamp(tipHourBaseHue, 24);
      const tipHourItems = activeTipHours.map((h) => ({
        label: formatHourLabel(h),
        value: result.byHour[h].tipValue,
        color: tipHourColors[h],
      }));
      buildBarChart(tipHourSection, tipHourItems, (v) => `$${v.toFixed(2)}`, "Tip dollars by hour of day");
    }
  }

  function openStats() {
    closeHamburgerMenu();
    currentStatsTab = "day";
    currentStatsDate = new Date();
    renderStats();
    statsOverlay?.classList.add("is-open");
    statsOverlay?.setAttribute("aria-hidden", "false");
    statsDoneBtn?.focus();
  }
  function closeStats() {
    statsOverlay?.classList.remove("is-open");
    statsOverlay?.setAttribute("aria-hidden", "true");
  }
  document.querySelectorAll(".dd-stats-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentStatsTab = btn.dataset.tab;
      renderStats();
    });
  });
  function statsRangeFor(tab, date) {
    if (tab === "week") return getWeekRange(date);
    if (tab === "month") return getMonthRange(date);
    if (tab === "year") return getYearRange(date);
    return getDayRange(date);
  }

  // Moves currentStatsDate one period (day/week/month/year, per the active
  // tab) in the given direction, skipping over any period with no time
  // card entry and no archived deliveries so Prev/Next don't force paging
  // through blank days. Today's period is always a valid stop even if it's
  // empty, and Next never pages into the (necessarily empty) future.
  function stepStatsDate(dir) {
    const today = startOfDay(new Date());
    let d = new Date(currentStatsDate);
    for (let i = 0; i < 3660; i++) {
      if (currentStatsTab === "day") d.setDate(d.getDate() + dir);
      else if (currentStatsTab === "week") d.setDate(d.getDate() + dir * 7);
      else if (currentStatsTab === "month") d.setMonth(d.getMonth() + dir);
      else d.setFullYear(d.getFullYear() + dir);

      const [s, e] = statsRangeFor(currentStatsTab, d);
      if (dir > 0 && s > today) return currentStatsDate;
      if (rangeHasActivity(s, e) || (s <= today && today <= e)) return d;
    }
    return currentStatsDate;
  }

  statsPrevBtn?.addEventListener("click", () => {
    currentStatsDate = stepStatsDate(-1);
    renderStats();
  });
  statsNextBtn?.addEventListener("click", () => {
    currentStatsDate = stepStatsDate(1);
    renderStats();
  });
  menuStats?.addEventListener("click", openStats);
  statsDoneBtn?.addEventListener("click", closeStats);
  statsOverlay?.addEventListener("click", (e) => {
    if (e.target === statsOverlay) closeStats();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && statsOverlay?.classList.contains("is-open")) closeStats();
  });

  // Deliveries persist across reloads/closes so a shift survives the tab
  // being closed by accident. Only cleared deliberately via "End Night".
  const STORAGE_KEY = "driversDoughEntries";

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      // localStorage unavailable (private browsing, quota, etc.) — the
      // shift still works, it just won't survive a reload.
    }
  }

  // In-memory record of every delivery entered this shift, seeded from
  // localStorage so a reload/close doesn't lose the shift.
  let entries = loadEntries();
  // Index into `entries` currently loaded in the form for editing, or null when adding new.
  let editIndex = null;
  // The confirmed cash portion of the tip for the entry currently in the
  // form (a "x.xx" string), when Partial Cash Tip is checked.
  let partialCashAmount = "";

  function openForm() {
    formSection?.classList.remove("hide");
    form?.classList.remove("hide");
    main?.classList.add("hide"); // hide main content when form opens
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    formSection?.classList.add("hide");
    form?.classList.add("hide");
    main?.classList.remove("hide"); // show main content again
    editIndex = null;
    if (submitBtn) submitBtn.textContent = "Submit";
  }

  function formatMoney(n) {
    if (n === "" || n === null || n === undefined || isNaN(Number(n))) return "";
    return Number(n).toFixed(2);
  }

  function typeToIcon(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("cash")) return "💲";
    if (t.includes("phone")) return "📞";
    if (t.includes("online") || t.includes("web")) return "🌐";
    return t ? t[0].toUpperCase() : "";
  }

  function orderTypeLabel(orderType) {
    if (orderType === "cash") return "Cash";
    if (orderType === "phone_cc") return "Phone CC";
    if (orderType === "online_cc") return "Online CC";
    return orderType || "—";
  }

  // Shared by every use of a plain popup (order-added/updated, tip
  // breakdown, delivery details) — builds the label/value <li> rows into
  // whichever list element it's given.
  function renderConfirmRows(listEl, rows, append) {
    if (!listEl) return;
    if (!append) listEl.innerHTML = "";
    rows.forEach(([label, value]) => {
      const li = document.createElement("li");
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      const valueSpan = document.createElement("span");
      valueSpan.className = "dd-confirm-value";
      valueSpan.textContent = value;
      li.appendChild(labelSpan);
      li.appendChild(valueSpan);
      listEl.appendChild(li);
    });
  }

  // The core field list for one delivery — shared by the post-submit
  // confirmation and the Delivery Details popup, so they can't drift apart.
  function buildEntrySummaryRows(entry) {
    const rows = [
      ["Street", entry.street || "—"],
      ["Order Type", orderTypeLabel(entry.orderType)],
      ["Delivery Fee", `$${entry.fee || "0.00"}`],
      ["Order Total", entry.total ? `$${entry.total}` : "—"],
      ["Tip", `$${entry.tip || "0.00"}`],
    ];
    if (entry.cashTip) {
      rows.push(["Tip Paid", "Cash"]);
    } else if (entry.partialCashTip && entry.partialCashAmount) {
      rows.push(["Tip Paid", `$${entry.partialCashAmount} Cash / Rest Card`]);
    }
    return rows;
  }

  // Every field just saved, read back to the driver before they move on.
  function showOrderConfirmation(entryData, wasEdit) {
    if (confirmTitle) confirmTitle.textContent = wasEdit ? "Entry Updated" : "Order Added";
    renderConfirmRows(confirmList, buildEntrySummaryRows(entryData));
    openConfirmDialog();
  }

  // Tapping the Tip cell on any row (not just partial-cash ones — the
  // behavior is the same everywhere so it's predictable) shows the
  // cash/card split for that delivery's tip, via the same plain dialog.
  function showTipBreakdown(entry) {
    const tip = parseFloat(entry.tip) || 0;
    const cashPortion = window.DD.calc.cashPortionOfTip(entry);
    const cardPortion = Math.max(tip - cashPortion, 0);
    const rows = [
      ["Street", entry.street || "—"],
      ["Order Type", orderTypeLabel(entry.orderType)],
      ["Total Tip", `$${tip.toFixed(2)}`],
      ["Cash", `$${cashPortion.toFixed(2)}`],
      ["Card", `$${cardPortion.toFixed(2)}`],
    ];
    if (confirmTitle) confirmTitle.textContent = "Tip Breakdown";
    renderConfirmRows(confirmList, rows);
    openConfirmDialog();
  }

  // Tapping the Street cell shows the full delivery — this is now the only
  // way into Edit/Delete, via the buttons in that popup's action row. The
  // Street row itself is a dropdown of every delivery, in the order they
  // were entered, rather than plain text — so tapping the wrong row is a
  // quick fix from right here instead of closing and retapping.
  function renderDeliveryDetails(idx) {
    const entry = entries[idx];
    if (!entry || !deliveryList) return;
    deliveryBreakdownIndex = idx;
    if (deliveryTitle) deliveryTitle.textContent = "Delivery Details";
    deliveryList.innerHTML = "";

    const streetLi = document.createElement("li");
    const streetLabel = document.createElement("span");
    streetLabel.textContent = "Street";
    const streetSelect = document.createElement("select");
    streetSelect.id = "dd-delivery-street-select";
    streetSelect.className = "dd-delivery-street-select";
    entries.forEach((e, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = e.street || "(no address)";
      if (i === idx) opt.selected = true;
      streetSelect.appendChild(opt);
    });
    streetLi.appendChild(streetLabel);
    streetLi.appendChild(streetSelect);
    deliveryList.appendChild(streetLi);

    // Everything else (Order Type, Delivery Fee, Order Total, Tip, Tip
    // Paid) — buildEntrySummaryRows already puts Street first, so skip it.
    renderConfirmRows(deliveryList, buildEntrySummaryRows(entry).slice(1), true);
  }

  // Switching the dropdown swaps which entry the popup (and its Edit/
  // Delete buttons) refer to, without closing and reopening it.
  deliveryList?.addEventListener("change", (e) => {
    if (e.target.id !== "dd-delivery-street-select") return;
    const newIdx = Number(e.target.value);
    if (!Number.isNaN(newIdx) && entries[newIdx]) renderDeliveryDetails(newIdx);
  });

  function showDeliveryBreakdown(idx) {
    renderDeliveryDetails(idx);
    openDeliveryDialog();
  }

  deliveryEditBtn?.addEventListener("click", () => {
    const idx = deliveryBreakdownIndex;
    closeDeliveryDialog();
    openEditForIndex(idx);
  });
  deliveryDeleteBtn?.addEventListener("click", () => {
    const idx = deliveryBreakdownIndex;
    closeDeliveryDialog();
    confirmDeleteIndex(idx);
  });

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Rebuilds the deliveries table from the `entries` array.
  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!entries.length) {
      const tr = document.createElement("tr");
      tr.className = "dd-table-waiting-row";
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "dd-calc-waiting";
      td.textContent = "Waiting for Data";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    entries.forEach((entry, i) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(i);
      const cells = [
        String(i + 1),
        entry.street || "",
        typeToIcon(entry.orderType),
        entry.total || "",
        entry.tip || "",
        entry.fee || "",
      ];
      cells.forEach((txt, colIndex) => {
        const td = document.createElement("td");
        if (colIndex === 1) {
          // Street: never wraps/grows the row. Long text scrolls inside
          // this cell instead — see the drag-to-scroll handlers below.
          td.className = "street-cell";
          const inner = document.createElement("div");
          inner.className = "street-scroll";
          inner.textContent = String(txt);
          td.appendChild(inner);
        } else if (colIndex === 4) {
          // Tip: tap it (any row, not just partial-cash ones — same
          // behavior everywhere so it's predictable) to see the cash/card
          // breakdown. The small "P" flags partial-cash rows; the small
          // "$" flags a tip that's entirely cash (only shown when there's
          // an actual tip to mark — no point flagging a $0.00 tip).
          td.className = "tip-cell";
          td.textContent = String(txt);
          if (entry.partialCashTip) {
            const marker = document.createElement("sub");
            marker.className = "partial-tip-marker";
            marker.textContent = "P";
            td.appendChild(marker);
          } else if (entry.cashTip && Number(entry.tip) > 0) {
            const marker = document.createElement("sub");
            marker.className = "cash-tip-marker";
            marker.textContent = "$";
            td.appendChild(marker);
          }
        } else {
          td.textContent = String(txt);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // Drag-to-scroll for the Street column (mouse and touch alike, via
  // Pointer Events). A drag is distinguished from a tap so dragging the
  // address text doesn't also toggle the row's selection below.
  let streetDrag = null;
  let suppressRowClick = false;

  tbody?.addEventListener("pointerdown", (e) => {
    const inner = e.target.closest(".street-scroll");
    if (!inner) return;
    streetDrag = {
      el: inner,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: inner.scrollLeft,
      moved: false,
    };
    inner.setPointerCapture(e.pointerId);
  });

  tbody?.addEventListener("pointermove", (e) => {
    if (!streetDrag || streetDrag.pointerId !== e.pointerId) return;
    const dx = e.clientX - streetDrag.startX;
    if (Math.abs(dx) > 3) streetDrag.moved = true;
    streetDrag.el.scrollLeft = streetDrag.startScrollLeft - dx;
  });

  function endStreetDrag(e) {
    if (!streetDrag || streetDrag.pointerId !== e.pointerId) return;
    if (streetDrag.moved) suppressRowClick = true;
    streetDrag = null;
  }
  tbody?.addEventListener("pointerup", endStreetDrag);
  tbody?.addEventListener("pointercancel", endStreetDrag);

  // Recomputes every number in the Calculations cards from `entries`.
  function updateCalculations() {
    const totals = window.DD.calc.computeTotals(entries);

    // Each fee tier's line only shows once that tier has an actual
    // delivery logged -- no point listing "$7.00 Deliveries: 0" for every
    // tier that hasn't come up yet. If NOTHING has been logged at all,
    // both cards show a single "Waiting for Data" note instead of an
    // empty list.
    const hasAnyData = totals.totalDeliveries > 0;
    const toggle = (id, show) => document.getElementById(id)?.classList.toggle("hide", !show);
    toggle("counts-waiting", !hasAnyData);
    toggle("values-waiting", !hasAnyData);
    toggle("counts-list", hasAnyData);
    toggle("values-list", hasAnyData);

    window.DD.calc.FEE_TIERS.forEach((tier) => {
      const key = tier.replace(".", "");
      const tierHasData = totals.counts[tier] > 0;
      setText(`count-${key}`, String(totals.counts[tier]));
      setText(`value-${key}`, `$${totals.values[tier].toFixed(2)}`);
      toggle(`row-count-${key}`, tierHasData);
      toggle(`row-value-${key}`, tierHasData);
    });
    toggle("row-count-total", hasAnyData);
    toggle("row-value-total", hasAnyData);

    setText("count-total", String(totals.totalDeliveries));
    setText("value-total", `$${totals.totalValueOfFees.toFixed(2)}`);
    setText("cc-gratuity", `$${totals.ccGratuity.toFixed(2)}`);
    setText("delivery-fee-total", `$${totals.deliveryFeeTotal.toFixed(2)}`);
    setText("total-from-house", `$${totals.totalFromHouse.toFixed(2)}`);
    setText("total-from-house-display", `$${totals.totalFromHouse.toFixed(2)}`);
    setText("cash-gratuity", `$${totals.cashGratuity.toFixed(2)}`);
    setText("night-total", `$${totals.nightTotal.toFixed(2)}`);
    setText("total-cash-owed", `$${totals.totalCashOwed.toFixed(2)}`);
  }

  function populateFormFromEntry(entry) {
    if (streetInput) streetInput.value = entry.street || "";
    if (feeSelect) feeSelect.value = entry.fee || "";
    if (orderTypeSel) orderTypeSel.value = entry.orderType || "";
    if (tipInput) tipInput.value = entry.tip || "";
    if (totalInput) totalInput.value = entry.total || "";
    if (cashTip) cashTip.checked = !!entry.cashTip;
    if (entry.partialCashTip && entry.partialCashAmount) {
      setPartialCashTip(entry.partialCashAmount);
    } else {
      clearPartialCashTip();
    }
    syncCheckboxesForOrderType(true);
  }

  function onSubmit(e) {
    e.preventDefault();

    const orderType = orderTypeSel?.value || "";
    const totalRaw = totalInput?.value?.trim() || "";

    // Order Total is required for every order type now, not just cash —
    // stats tracking needs every order's total to add up "money taken in"
    // correctly, and a cash order additionally needs a real (nonzero) total
    // since house money is reconciled against it.
    const requiredFields = [
      { label: "Street Address", el: streetInput, ok: !!streetInput?.value?.trim() },
      { label: "Delivery Fee", el: feeSelect, ok: !!feeSelect?.value },
      { label: "Order Type", el: orderTypeSel, ok: !!orderType },
      { label: "Tip (Gratuity)", el: tipInput, ok: !!tipInput?.value?.trim() },
      { label: "Order Total", el: totalInput, ok: !!totalRaw },
    ];
    const missing = requiredFields.filter((f) => !f.ok);
    if (missing.length) {
      window.DD.modal?.show({
        top: "MISSING INFO",
        bottom: "PLEASE FILL IN:",
        extra: missing.map((f) => f.label).join(", "),
        okText: "OK",
        onOk: () => missing[0].el?.focus(),
      });
      return;
    }

    // Order Total can never be $0.00, on any order type — a free delivery
    // isn't a real order, and cash orders specifically need a real total
    // since house money is reconciled against it.
    if (!(Number(totalRaw) > 0)) {
      window.DD.modal?.show({
        top: "ORDER TOTAL NEEDED",
        bottom: "ORDER TOTAL CAN'T BE $0.00",
        okText: "OK",
        onOk: () => totalInput?.focus(),
      });
      return;
    }

    // A cash order has no card portion, so Partial Cash Tip never applies
    // to it — even if a value is sitting in memory, hidden, from before the
    // order type was switched to cash (see syncCheckboxesForOrderType).
    const partialCashTipApplies = orderType !== "cash" && !!partialCash?.checked;

    const entryData = {
      street: streetInput?.value?.trim() || "",
      orderType,
      total: formatMoney(totalRaw),
      tip: formatMoney(tipInput?.value),
      fee: feeSelect?.value || "",
      cashTip: !!cashTip?.checked,
      partialCashTip: partialCashTipApplies,
      partialCashAmount: partialCashTipApplies ? partialCashAmount : "",
      // Stamped automatically (not user-entered) — the hour this delivery
      // was keyed into the app, used to bucket it by hour-of-day for stats.
      // Preserved across an edit (see populateFormFromEntry/onSubmit's
      // edit path below) rather than re-stamped, so editing a delivery
      // doesn't move it to a different hour's stats bucket.
      time: (editIndex !== null && entries[editIndex]?.time) || nowHHMM(),
    };
    const wasEdit = editIndex !== null && !!entries[editIndex];

    if (editIndex !== null && entries[editIndex]) {
      entries[editIndex] = entryData;
    } else {
      entries.push(entryData);
    }

    renderTable();
    updateCalculations();
    saveEntries();
    showOrderConfirmation(entryData, wasEdit);
    form?.reset();
    closeForm();
  }

  // Cents-first currency entry: digits fill in from the right (pennies,
  // then tens, then dollars) and shift left as you type, with the decimal
  // point staying put — like a calculator or POS cash-total field.
  function formatCentsInput(el) {
    if (!el) return;
    el.addEventListener("input", () => {
      const digits = el.value.replace(/\D/g, "").slice(0, 7); // cap ~$99,999.99
      if (!digits) {
        el.value = "";
        return;
      }
      const cents = parseInt(digits, 10);
      el.value = (cents / 100).toFixed(2);
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }
  formatCentsInput(totalInput);
  formatCentsInput(tipInput);

  // Partial Cash Tip display: once an amount is confirmed, the checkbox
  // shifts to line up under the start of "Partial" and the dollar amount
  // shows to its right (see .has-amount in style.css).
  function setPartialCashTip(amount) {
    partialCashAmount = amount;
    if (partialCash) partialCash.checked = true;
    const label = document.getElementById("partial-cash-label");
    label?.classList.add("has-amount");
    const amountEl = document.getElementById("partial-cash-amount");
    if (amountEl) amountEl.textContent = `$${amount}`;
  }

  function clearPartialCashTip() {
    partialCashAmount = "";
    if (partialCash) partialCash.checked = false;
    const label = document.getElementById("partial-cash-label");
    label?.classList.remove("has-amount");
    const amountEl = document.getElementById("partial-cash-amount");
    if (amountEl) amountEl.textContent = "";
  }

  // Asks how much of the tip was cash. Reopens itself with an error if the
  // amount is invalid, preserving whatever was typed so the user isn't
  // stuck retyping it.
  function promptPartialCashAmount(errorMsg, prefill) {
    const tipTotal = Number(tipInput?.value) || 0;
    window.DD.modal?.show({
      top: "PARTIAL CASH TIP",
      bottom: errorMsg || "HOW MUCH OF THE TIP IS CASH?",
      highlightBottom: !!errorMsg,
      prompt: true,
      promptValue: prefill !== undefined ? prefill : partialCashAmount,
      promptPlaceholder: "0.00",
      okText: "Enter",
      cancelText: "Cancel",
      onOk: (value) => {
        const cashAmt = Number(value) || 0;
        if (!(cashAmt > 0) || cashAmt > tipTotal) {
          promptPartialCashAmount(`MUST BE $0.01 TO $${tipTotal.toFixed(2)}`, value);
          return;
        }
        setPartialCashTip(cashAmt.toFixed(2));
      },
      onCancel: () => clearPartialCashTip(),
    });
  }

  // Enforce checkbox rules and cash-only behavior.
  // `preserve` = true skips auto-checking/unchecking, used when pre-filling the form for an edit.
  function syncCheckboxesForOrderType(preserve) {
    const value = (orderTypeSel?.value || "").toLowerCase();
    const isCash = value === "cash";
    if (totalInput) totalInput.required = !!isCash; // required only for cash orders
    // A cash order has no card portion at all, so a *partial* cash tip
    // (some cash, some card) isn't a possible state — hide it rather than
    // clearing it, so switching back to a card order brings it right back.
    if (partialCash) partialCash.disabled = isCash;
    document.getElementById("partial-cash-label")?.classList.toggle("hide", isCash);
    if (preserve) return;
    if (isCash) {
      // Auto-select Cash Tip when Cash is chosen
      if (cashTip) cashTip.checked = true;
    } else {
      // Non-cash: keep boxes enabled, but uncheck Cash Tip (Partial Cash
      // Tip's own state is left alone — it just reappears if it was set).
      if (cashTip) cashTip.checked = false;
    }
  }

  orderTypeSel?.addEventListener("change", () => syncCheckboxesForOrderType(false));

  cashTip?.addEventListener("change", (e) => {
    if (e.target.checked) clearPartialCashTip(); // mutually exclusive
  });

  partialCash?.addEventListener("change", (e) => {
    if (!e.target.checked) {
      clearPartialCashTip();
      return;
    }
    const tipTotal = Number(tipInput?.value) || 0;
    if (!(tipTotal > 0)) {
      partialCash.checked = false;
      window.DD.modal?.show({
        top: "PARTIAL CASH TIP",
        bottom: "ENTER THE TIP AMOUNT FIRST",
        okText: "OK",
        onOk: () => tipInput?.focus(),
      });
      return;
    }
    if (cashTip) cashTip.checked = false; // mutually exclusive
    promptPartialCashAmount();
  });

  // Street and Tip are the only clickable cells in a row. A drag inside the
  // Street column's scroller doesn't count as a tap (see above) — it just
  // scrolls the address text instead of opening anything.
  tbody?.addEventListener("click", (e) => {
    if (suppressRowClick) {
      suppressRowClick = false;
      return;
    }
    const tipCell = e.target.closest(".tip-cell");
    if (tipCell) {
      const tipTr = tipCell.closest("tr");
      const tipIdx = Number(tipTr?.dataset.index);
      if (!Number.isNaN(tipIdx) && entries[tipIdx]) showTipBreakdown(entries[tipIdx]);
      return;
    }
    const streetCell = e.target.closest(".street-cell");
    if (streetCell) {
      const streetTr = streetCell.closest("tr");
      const streetIdx = Number(streetTr?.dataset.index);
      if (!Number.isNaN(streetIdx) && entries[streetIdx]) showDeliveryBreakdown(streetIdx);
      return;
    }
  });

  function startAdd() {
    editIndex = null;
    renderTable();
    form?.reset();
    clearPartialCashTip(); // a brand-new entry starts with no carried-over amount
    syncCheckboxesForOrderType(false);
    if (submitBtn) submitBtn.textContent = "Submit";
    openForm();
  }

  // Opens the form pre-populated for a specific entry — reached only via
  // the Delivery Details popup's Edit button now, so idx is always known
  // and valid; no more "tap a row first" ambiguity to handle.
  function openEditForIndex(idx) {
    if (idx === null || idx === undefined || !entries[idx]) return;
    editIndex = idx;
    populateFormFromEntry(entries[editIndex]);
    if (submitBtn) submitBtn.textContent = "Update";
    openForm();
  }

  function clearAllEntries() {
    // Stamp today's CC gratuity onto the time card before the numbers it's
    // computed from disappear — this is the only moment that total exists.
    const totals = window.DD.calc.computeTotals(entries);
    const key = toDateKey(new Date());
    if (!timeCard[key]) timeCard[key] = { shifts: [], ccGratuity: null };
    timeCard[key].ccGratuity = totals.ccGratuity.toFixed(2);
    saveTimeCard();
    if (timecardOverlay?.classList.contains("is-open")) renderTimeCard();

    // Fold tonight's deliveries into the permanent stats archive before
    // they're gone for good.
    archiveEntriesToStats(entries);

    entries = [];
    editIndex = null;
    renderTable();
    updateCalculations();
    saveEntries();
  }

  // Clears the whole shift, after confirming TWICE — the deliveries table
  // is persisted, so this is the only way to start a fresh night, and it's
  // not undoable.
  endNightBtn?.addEventListener("click", () => {
    if (entries.length === 0) {
      window.DD.modal?.show({
        top: "END NIGHT",
        bottom: "THERE IS NOTHING TO CLEAR",
        okText: "OK",
      });
      return;
    }
    window.DD.modal?.show({
      top: "END NIGHT",
      bottom: "THIS CLEARS ALL DELIVERIES",
      okText: "End Night",
      cancelText: "Cancel",
      danger: true,
      onOk: () => {
        // Second, more urgent confirmation before the data actually goes away.
        window.DD.modal?.show({
          top: "END NIGHT",
          bottom: "THIS WILL CLEAR ALL DATA FROM TABLE",
          okText: "End Night",
          cancelText: "Cancel",
          danger: true,
          highlightTop: true,
          highlightBottom: true,
          onOk: clearAllEntries,
        });
      },
    });
  });

  // Deletes a single delivery — reached only via the Delivery Details
  // popup's Delete button now, so idx is always known and valid. Still
  // confirms TWICE (same pattern as End Night) since it isn't recoverable.
  function confirmDeleteIndex(idx) {
    if (idx === null || idx === undefined || !entries[idx]) return;
    window.DD.modal?.show({
      top: "DELETE ENTRY",
      bottom: "THIS WILL DELETE THIS DELIVERY",
      okText: "Delete Entry",
      cancelText: "Cancel",
      danger: true,
      onOk: () => {
        // Second, more urgent confirmation before the row actually goes away.
        window.DD.modal?.show({
          top: "DELETE ENTRY",
          bottom: "THIS WILL PERMANENTLY REMOVE THIS ENTRY",
          okText: "Delete Entry",
          cancelText: "Cancel",
          danger: true,
          highlightTop: true,
          highlightBottom: true,
          onOk: () => {
            entries.splice(idx, 1);
            renderTable();
            updateCalculations();
            saveEntries();
          },
        });
      },
    });
  }

  // Init
  addBtn?.addEventListener("click", startAdd);
  cancelBtn?.addEventListener("click", closeForm);
  form?.addEventListener("submit", onSubmit);

  syncCheckboxesForOrderType(false);
  renderTable();
  updateCalculations();
  syncFixedBarOffsets();
})();
