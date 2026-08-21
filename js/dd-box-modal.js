// js/dd-box-modal.js
// Reusable "pizza box" modal — the one component every prompt/alert in the
// app should go through (per the project outline). Exposes:
//   DD.modal.show({ top, bottom, extra, okText, onOk, cancelText, onCancel,
//                   danger, highlightTop, highlightBottom,
//                   prompt, promptValue, promptPlaceholder })
//   DD.modal.close()
(function () {
  window.DD = window.DD || {};

  const overlay = document.getElementById("ddb-overlay");
  const topRail = document.getElementById("ddb-top-rail");
  const bottomRail = document.getElementById("ddb-bottom-rail");
  const extraEl = document.getElementById("ddb-extra");
  const inputEl = document.getElementById("ddb-input");
  const okBtn = document.getElementById("ddb-ok");
  const cancelBtn = document.getElementById("ddb-cancel");
  const brand = document.querySelector(".ddb-brand");
  const driversEl = document.querySelector(".ddb-drivers");
  const doughEl = document.querySelector(".ddb-dough");

  let onOkCallback = null;
  let onCancelCallback = null;
  let promptActive = false;

  // Cents-first currency entry for the prompt field — same digits-shift-in
  // masking used on the Tip/Total inputs, kept self-contained here so this
  // component doesn't depend on script.js.
  inputEl?.addEventListener("input", () => {
    const digits = inputEl.value.replace(/\D/g, "").slice(0, 7); // cap ~$99,999.99
    if (!digits) {
      inputEl.value = "";
      return;
    }
    const cents = parseInt(digits, 10);
    inputEl.value = (cents / 100).toFixed(2);
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  });
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      okBtn?.click();
    }
  });

  // Size the wordmark by MEASURING it, instead of guessing a CSS percentage
  // that only matches one particular font's metrics. Each line is scaled so
  // its own natural (unwrapped) width exactly fills the brand column — the
  // same column the red rails span — so "DRIVER'S" and "Dough" always end
  // flush with the rails' right edge and never wrap or clip, regardless of
  // which font the browser actually renders (Bahnschrift vs. a fallback).
  function fitLine(el, containerWidth) {
    if (!el || !containerWidth) return;
    const prevWhiteSpace = el.style.whiteSpace;
    const prevDisplay = el.style.display;
    const prevPosition = el.style.position;

    // Measure at a fixed, known font-size so natural-width -> font-size is
    // a simple ratio, then take the element out of flow (shrink-to-fit)
    // so the measurement isn't constrained by the column it sits in.
    el.style.fontSize = "100px";
    el.style.whiteSpace = "nowrap";
    el.style.display = "inline-block";
    el.style.position = "absolute";

    const naturalWidth = el.getBoundingClientRect().width;

    el.style.whiteSpace = prevWhiteSpace;
    el.style.display = prevDisplay;
    el.style.position = prevPosition;

    if (naturalWidth > 0) {
      // .98 = a hair of margin so sub-pixel rounding never tips it into
      // wrapping or clipping past the rail edge.
      const target = containerWidth * 0.98;
      const size = Math.max(14, Math.min((target / naturalWidth) * 100, 140));
      el.style.fontSize = size + "px";
    }
  }

  function fitBrandText() {
    if (!brand || !driversEl || !doughEl) return;
    const containerWidth = brand.getBoundingClientRect().width;
    fitLine(driversEl, containerWidth);
    fitLine(doughEl, containerWidth);
  }

  let fitRaf = null;
  function scheduleFit() {
    if (fitRaf) cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      // A 2nd frame guarantees the overlay's just-added .is-open (display:flex)
      // has actually been laid out before we measure the brand column's width.
      fitRaf = requestAnimationFrame(fitBrandText);
    });
  }

  window.addEventListener("resize", () => {
    if (overlay?.classList.contains("is-open")) scheduleFit();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (overlay?.classList.contains("is-open")) fitBrandText();
    });
  }

  function open() {
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    scheduleFit();
    if (promptActive && inputEl) {
      inputEl.focus();
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    } else {
      okBtn?.focus();
    }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    onOkCallback = null;
    onCancelCallback = null;
  }

  // top/bottom are the two red rail labels on the box (see the pizza box art
  // this component is modeled on). okText labels the single action button.
  // extra: optional plain text shown below the bottom rail — not another
  // red bar, just text, the way the real box prints its address/phone under
  // the second banner. Use this for anything too long for the rail pill,
  // like an itemized list of missing fields.
  // highlightTop / highlightBottom: pass true to make that rail blink — use
  // this for a message that needs extra attention (re-showing something the
  // user dismissed without acting on it, or a final "are you sure" step);
  // pass both for maximum urgency.
  // cancelText: pass to also show a second button (e.g. a yes/no confirm
  // like "End Night"). onCancel fires when Cancel is clicked, and — same as
  // Escape and clicking outside the card — always behaves like a cancel,
  // never a confirm.
  // danger: pass true to make the OK button the filled/destructive style.
  // prompt: pass true to show a plain amount field above the buttons (e.g.
  // "how much of the tip is cash"); promptValue seeds it, promptPlaceholder
  // sets its placeholder. When active, onOk receives the field's current
  // (already dollars-formatted) string value as its argument.
  function show({
    top = "DRIVER'S DOUGH",
    bottom = "",
    extra = "",
    okText = "OK",
    onOk,
    cancelText = "",
    onCancel,
    danger = false,
    highlightTop = false,
    highlightBottom = false,
    prompt = false,
    promptValue = "",
    promptPlaceholder = "0.00",
  } = {}) {
    if (topRail) {
      topRail.textContent = top;
      topRail.classList.toggle("ddb-blink", !!highlightTop);
    }
    if (bottomRail) {
      bottomRail.textContent = bottom;
      bottomRail.classList.toggle("ddb-blink", !!highlightBottom);
    }
    if (extraEl) {
      extraEl.textContent = extra;
      extraEl.style.display = extra ? "" : "none";
    }
    promptActive = !!prompt;
    if (inputEl) {
      inputEl.style.display = promptActive ? "block" : "none";
      inputEl.placeholder = promptPlaceholder;
      inputEl.value = promptValue || "";
    }
    if (okBtn) {
      okBtn.textContent = okText;
      okBtn.classList.toggle("ddb-btn-danger", !!danger);
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelText || "Cancel";
      cancelBtn.style.display = cancelText ? "inline-block" : "none";
    }
    onOkCallback = typeof onOk === "function" ? onOk : null;
    onCancelCallback = typeof onCancel === "function" ? onCancel : null;
    open();
  }

  okBtn?.addEventListener("click", () => {
    const cb = onOkCallback;
    const value = promptActive && inputEl ? inputEl.value : undefined;
    close();
    if (cb) cb(value);
  });

  function cancel() {
    const cb = onCancelCallback;
    close();
    if (cb) cb();
  }

  cancelBtn?.addEventListener("click", cancel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.classList.contains("is-open")) cancel();
  });

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) cancel();
  });

  window.DD.modal = { show, close };
})();
