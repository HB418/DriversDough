// js/codes.js
// A plain list of property addresses and their access codes -- Heath was
// explicit this should stay simple: just address + code, nothing more.
// Same data-flow pattern as maps.js/forum.js: an in-memory cache
// (codesCache) is refreshed from Supabase whenever the popup opens and
// after every add/edit/delete; everyone can view the list, only an
// admin account can change it (enforced again on the server by
// dd_create_code/dd_update_code/dd_delete_code, not just by hiding
// buttons here).
(function () {
  const sb = window.DD.supabaseClient;

  let codesCache = null; // null until loaded once, then an array

  function mapCodeRow(row) {
    return { id: row.id, address: row.address, code: row.code };
  }
  async function refreshCodes() {
    try {
      const { data, error } = await sb.from("access_codes").select("*").order("address", { ascending: true });
      if (error || !data) return false;
      codesCache = data.map(mapCodeRow);
      return true;
    } catch (err) {
      return false;
    }
  }

  function getToken() {
    return window.DD.auth && window.DD.auth.getToken();
  }
  function isAdmin() {
    const session = window.DD.auth && window.DD.auth.getSession();
    return !!(session && session.isAdmin);
  }

  async function createCode(address, code) {
    const { data: result, error } = await sb.rpc("dd_create_code", { p_token: getToken(), p_address: address, p_code: code });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function updateCode(id, address, code) {
    const { data: result, error } = await sb.rpc("dd_update_code", { p_token: getToken(), p_code_id: id, p_address: address, p_code: code });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function deleteCode(id) {
    const { data: result, error } = await sb.rpc("dd_delete_code", { p_token: getToken(), p_code_id: id });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  function showServerError(error) {
    window.DD.modal?.show({
      top: "COULDN'T DO THAT",
      bottom: (error || "Something went wrong. Try again.").toUpperCase(),
      okText: "OK",
    });
  }

  // --- UI --------------------------------------------------------------
  const menuBtn = document.getElementById("hamburgerBtn");
  const menuCodes = document.getElementById("menuCodes");
  const overlay = document.getElementById("dd-codes-overlay");
  const bodyEl = document.getElementById("dd-codes-body");
  const doneBtn = document.getElementById("dd-codes-done");

  function closeHamburgerMenuLocal() {
    const menu = document.getElementById("hamburgerMenu");
    menu?.classList.remove("is-open");
    menu?.setAttribute("aria-hidden", "true");
    menuBtn?.setAttribute("aria-expanded", "false");
  }

  function showLoading() {
    if (bodyEl) bodyEl.innerHTML = '<p class="dd-calc-waiting">Loading…</p>';
  }

  let editingId = null; // id of the code row currently being edited, if any
  let showAddForm = false;

  async function openCodes() {
    closeHamburgerMenuLocal();
    editingId = null;
    showAddForm = false;
    overlay?.classList.add("is-open");
    overlay?.setAttribute("aria-hidden", "false");
    showLoading();
    await refreshCodes();
    render();
  }
  function closeCodes() {
    overlay?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
  }
  menuCodes?.addEventListener("click", openCodes);
  doneBtn?.addEventListener("click", closeCodes);

  function render() {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    if (isAdmin()) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn-primary dd-codes-add-btn";
      addBtn.textContent = showAddForm ? "Cancel" : "+ Add Code";
      addBtn.addEventListener("click", () => {
        showAddForm = !showAddForm;
        editingId = null;
        render();
      });
      bodyEl.appendChild(addBtn);
      if (showAddForm) bodyEl.appendChild(buildForm(null));
    }

    const wrap = document.createElement("div");
    wrap.className = "dd-codes-scroll";

    if (!codesCache || !codesCache.length) {
      const empty = document.createElement("p");
      empty.className = "dd-calc-waiting";
      empty.textContent = "Waiting for Data";
      wrap.appendChild(empty);
    } else {
      // Group by address so a property with multiple codes (gate, lockbox,
      // etc.) shows once with all its codes together, not repeated rows.
      const groups = [];
      const byAddress = new Map();
      codesCache.forEach((c) => {
        if (!byAddress.has(c.address)) {
          const g = { address: c.address, codes: [] };
          byAddress.set(c.address, g);
          groups.push(g);
        }
        byAddress.get(c.address).codes.push(c);
      });

      groups.forEach((group) => {
        const item = document.createElement("div");
        item.className = "dd-codes-item";
        const addr = document.createElement("div");
        addr.className = "dd-codes-address";
        addr.textContent = group.address;
        item.appendChild(addr);

        group.codes.forEach((c) => {
          if (editingId === c.id) {
            item.appendChild(buildForm(c));
            return;
          }
          const row = document.createElement("div");
          row.className = "dd-codes-code-row";
          const codeText = document.createElement("span");
          codeText.className = "dd-codes-code";
          codeText.textContent = c.code;
          row.appendChild(codeText);
          if (isAdmin()) {
            const actions = document.createElement("span");
            actions.className = "dd-codes-code-actions";
            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "dd-codes-edit-btn";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
              editingId = c.id;
              showAddForm = false;
              render();
            });
            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "dd-codes-delete-btn";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", () => confirmDelete(c));
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            row.appendChild(actions);
          }
          item.appendChild(row);
        });

        wrap.appendChild(item);
      });
    }

    bodyEl.appendChild(wrap);
  }

  function buildForm(existing) {
    const form = document.createElement("div");
    form.className = "dd-codes-form";
    const msg = document.createElement("div");
    msg.className = "dd-codes-form-msg hide";
    form.appendChild(msg);

    const addrField = document.createElement("div");
    addrField.className = "dd-codes-field";
    addrField.innerHTML = '<label for="dd-codes-input-address">Address</label>';
    const addrInput = document.createElement("input");
    addrInput.type = "text";
    addrInput.id = "dd-codes-input-address";
    addrInput.autocomplete = "off";
    addrInput.value = existing ? existing.address : "";
    addrField.appendChild(addrInput);
    form.appendChild(addrField);

    const codeField = document.createElement("div");
    codeField.className = "dd-codes-field";
    codeField.innerHTML = '<label for="dd-codes-input-code">Code</label>';
    const codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.id = "dd-codes-input-code";
    codeInput.autocomplete = "off";
    codeInput.value = existing ? existing.code : "";
    codeField.appendChild(codeInput);
    form.appendChild(codeField);

    const actions = document.createElement("div");
    actions.className = "dd-codes-form-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-primary";
    saveBtn.textContent = "Save";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      editingId = null;
      showAddForm = false;
      render();
    });
    saveBtn.addEventListener("click", async () => {
      const address = addrInput.value.trim();
      const code = codeInput.value.trim();
      if (!address || !code) {
        msg.textContent = "Enter both an address and a code.";
        msg.classList.remove("hide");
        return;
      }
      saveBtn.disabled = true;
      const result = existing ? await updateCode(existing.id, address, code) : await createCode(address, code);
      saveBtn.disabled = false;
      if (!result || !result.ok) {
        msg.textContent = (result && result.error) || "Couldn't save that. Try again.";
        msg.classList.remove("hide");
        return;
      }
      editingId = null;
      showAddForm = false;
      showLoading();
      await refreshCodes();
      render();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    form.appendChild(actions);
    return form;
  }

  function confirmDelete(c) {
    window.DD.modal?.show({
      top: "DELETE CODE",
      // dd-box-modal sets this via textContent, not innerHTML, so this is
      // plain text on screen -- no HTML-escaping needed (or wanted) here.
      bottom: "DELETE " + c.code.toUpperCase() + " FOR " + c.address.toUpperCase() + "?",
      okText: "Delete",
      cancelText: "Cancel",
      danger: true,
      onOk: async () => {
        const result = await deleteCode(c.id);
        if (!result || !result.ok) {
          showServerError(result && result.error);
          return;
        }
        await refreshCodes();
        render();
      },
    });
  }
})();
