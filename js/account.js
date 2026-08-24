// js/account.js
// Account page (hamburger menu: "Account") -- lets a driver change their
// own password and opt out of Stats tracking. Same overlay pattern as
// codes.js/forum.js: build the body fresh into #dd-account-body each time
// it opens. No local cache needed here -- window.DD.auth already keeps
// the session (including trackStats) up to date, and this just reads it.
(function () {
  const menuAccount = document.getElementById("menuAccount");
  const overlay = document.getElementById("dd-account-overlay");
  const bodyEl = document.getElementById("dd-account-body");
  const doneBtn = document.getElementById("dd-account-done");

  function closeHamburgerMenuLocal() {
    const menu = document.getElementById("hamburgerMenu");
    menu?.classList.remove("is-open");
    menu?.setAttribute("aria-hidden", "true");
    document.getElementById("hamburgerBtn")?.setAttribute("aria-expanded", "false");
  }

  function openAccount() {
    closeHamburgerMenuLocal();
    overlay?.classList.add("is-open");
    overlay?.setAttribute("aria-hidden", "false");
    render();
  }
  function closeAccount() {
    overlay?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
  }
  menuAccount?.addEventListener("click", openAccount);
  doneBtn?.addEventListener("click", closeAccount);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeAccount();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.classList.contains("is-open")) closeAccount();
  });

  function buildField(id, labelText, autocomplete) {
    const wrap = document.createElement("div");
    wrap.className = "dd-account-field";
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "password";
    input.id = id;
    input.autocomplete = autocomplete;
    wrap.appendChild(label);
    wrap.appendChild(input);
    return { wrap, input };
  }

  function render() {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    const session = window.DD.auth && window.DD.auth.getSession();

    // --- Change password ---
    const pwSection = document.createElement("div");
    pwSection.className = "dd-account-section";
    const pwHeading = document.createElement("div");
    pwHeading.className = "dd-account-section-title";
    pwHeading.textContent = "Change Password";
    pwSection.appendChild(pwHeading);

    const msg = document.createElement("div");
    msg.className = "dd-account-form-msg hide";
    pwSection.appendChild(msg);

    const currentField = buildField("dd-account-current-password", "Current Password", "current-password");
    const newField = buildField("dd-account-new-password", "New Password", "new-password");
    const confirmField = buildField("dd-account-confirm-password", "Confirm New Password", "new-password");
    pwSection.appendChild(currentField.wrap);
    pwSection.appendChild(newField.wrap);
    pwSection.appendChild(confirmField.wrap);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-primary dd-account-save-btn";
    saveBtn.textContent = "Change Password";
    saveBtn.addEventListener("click", async () => {
      msg.classList.add("hide");
      msg.classList.remove("dd-account-form-msg-ok");
      saveBtn.disabled = true;
      const result = await window.DD.auth.changePassword({
        currentPassword: currentField.input.value,
        newPassword: newField.input.value,
        confirmPassword: confirmField.input.value,
      });
      saveBtn.disabled = false;
      if (!result || !result.ok) {
        msg.textContent = (result && result.error) || "Couldn't change your password. Try again.";
        msg.classList.remove("hide");
        return;
      }
      currentField.input.value = "";
      newField.input.value = "";
      confirmField.input.value = "";
      msg.textContent = "Password changed.";
      msg.classList.remove("hide");
      msg.classList.add("dd-account-form-msg-ok");
    });
    pwSection.appendChild(saveBtn);
    bodyEl.appendChild(pwSection);

    // --- Stats tracking opt-out ---
    const statsSection = document.createElement("div");
    statsSection.className = "dd-account-section";
    const statsHeading = document.createElement("div");
    statsHeading.className = "dd-account-section-title";
    statsHeading.textContent = "Stats Tracking";
    statsSection.appendChild(statsHeading);

    const checkLabel = document.createElement("label");
    checkLabel.className = "dd-account-checkbox-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "dd-account-no-track-stats";
    checkbox.checked = session ? session.trackStats === false : false;
    const checkText = document.createElement("span");
    checkText.textContent = "Do not track stats";
    checkLabel.appendChild(checkbox);
    checkLabel.appendChild(checkText);
    statsSection.appendChild(checkLabel);

    const note = document.createElement("p");
    note.className = "dd-account-note";
    note.textContent =
      "When checked: Order Total isn't required on non-cash orders, and End Night won't archive anything to Stats. Time Card and the delivery tracker keep working as normal either way.";
    statsSection.appendChild(note);

    checkbox.addEventListener("change", async () => {
      const wantsTracking = !checkbox.checked;
      checkbox.disabled = true;
      const result = await window.DD.auth.setTrackStats(wantsTracking);
      checkbox.disabled = false;
      if (!result || !result.ok) {
        checkbox.checked = !checkbox.checked; // revert the click, the save failed
        window.DD.modal?.show({
          top: "COULDN'T DO THAT",
          bottom: ((result && result.error) || "Something went wrong. Try again.").toUpperCase(),
          okText: "OK",
        });
      }
    });
    bodyEl.appendChild(statsSection);
  }
})();
