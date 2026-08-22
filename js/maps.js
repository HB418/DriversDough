/* js/maps.js
   The Maps feature: three saved properties (Amazon Campground, Colonial
   Village, Crystal Springs Way), each its own Leaflet map on free Esri
   satellite imagery — same tile source and divIcon/rotation technique as
   the flightlog-v2 course-mapping tool this was built from, adapted for
   dropping numbered house pins instead of tee pads.

   Setup Mode: tap the map to drop the next pin (auto-numbered in order),
   drag it into place, set its direction line with the rotation slider,
   optionally overwrite the number, then Confirm locks it in permanently
   (no further drag/edit/delete once confirmed). The running number
   sequence always advances by 1 from whatever number it WOULD have
   suggested next, regardless of any override typed in for a given pin —
   so one renumbered house doesn't throw off the count for the rest of
   the street. Setup Mode itself stays available afterward to add more
   pins later.

   Data lives in its own localStorage key (driversDoughMaps), separate
   from script.js's own keys, and is included in Backup/Restore via
   BACKUP_KEYS in script.js. */

(function () {
  const MAP_DEFS = [
    {
      id: "amazon",
      name: "Amazon Campground",
      address: "105 Whitehouse Rd, Rochester, NH",
      center: { lat: 43.262889, lng: -70.92178 },
    },
    {
      id: "colonial",
      name: "Colonial Village",
      address: "Blackwater Rd, Somersworth, NH",
      center: { lat: 43.248718, lng: -70.902745 },
    },
    {
      id: "crystal",
      name: "Crystal Springs Way",
      address: "Old Rochester Rd, Somersworth/Dover, NH",
      center: { lat: 43.2594557, lng: -70.9224471 },
    },
  ];

  const MAPS_STORAGE_KEY = "driversDoughMaps";
  let mapsStore = loadMapsStore();

  function loadMapsStore() {
    try {
      const raw = localStorage.getItem(MAPS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  function saveMapsStore() {
    try {
      localStorage.setItem(MAPS_STORAGE_KEY, JSON.stringify(mapsStore));
    } catch (err) {}
  }
  function getMapRecord(id) {
    if (!mapsStore[id] || typeof mapsStore[id] !== "object") {
      mapsStore[id] = { pins: [] };
      saveMapsStore();
    }
    if (!Array.isArray(mapsStore[id].pins)) mapsStore[id].pins = [];
    return mapsStore[id];
  }
  // The suggested number for a fresh pin drop is always the LOWEST
  // positive integer not already used by a pin on this property -- never
  // a persisted counter that just marches forward. A counter drifts out
  // of sync with reality the moment a pin is deleted (its number should
  // become droppable again) or a pin is placed out of order (e.g. #3
  // dropped before #1/#2 exist) -- a counter would eventually suggest a
  // number already taken, creating a duplicate. Recomputing from the
  // actual pins every time avoids both.
  function lowestAvailableNumber(rec) {
    const used = new Set(
      (rec.pins || [])
        .map((p) => parseInt(p.number, 10))
        .filter((n) => Number.isInteger(n))
    );
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }
  function genPinId() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- Icon sizing (same "scales like a real object on the ground"
  // approach as flightlog-v2's map-icons.js) ---
  const ICON_BASE_ZOOM = 19;
  const MIN_SCALE = 0.5, MAX_SCALE = 2.5;
  const PIN_LINE_BASE_LEN = 52;
  const PIN_LINE_BASE_THICK = 4;
  const PIN_BADGE_BASE_D = 26;

  function scaleForZoom(map) {
    const z = map.getZoom();
    if (typeof z !== "number" || isNaN(z)) return 1;
    const scale = Math.pow(2, z - ICON_BASE_ZOOM);
    return Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));
  }

  // The LINE rotates on its own (not the whole marker) so the number
  // badge stays upright and readable no matter what direction it points
  // -- both are centered on the exact same ground point via
  // translate(-50%,-50%), the line additionally rotated around that
  // same center.
  function makePinDivIcon(number, rotationDeg, scale, isPending) {
    scale = scale || 1;
    const lineLen = Math.round(PIN_LINE_BASE_LEN * scale);
    const lineThick = Math.max(2, Math.round(PIN_LINE_BASE_THICK * scale));
    const badgeD = Math.max(16, Math.round(PIN_BADGE_BASE_D * scale));
    const box = Math.max(lineLen, badgeD) + 4;
    const fontPx = Math.max(9, Math.round(11 * scale));
    const pendingClass = isPending ? " is-pending" : "";
    const html =
      '<div class="dd-pin-icon' + pendingClass + '" style="width:' + box + "px;height:" + box + 'px;">' +
      '<div class="dd-pin-line" style="width:' + lineLen + "px;height:" + lineThick +
      "px;transform:translate(-50%,-50%) rotate(" + rotationDeg + 'deg);"></div>' +
      '<div class="dd-pin-badge" style="font-size:' + fontPx + "px;min-width:" + badgeD + "px;height:" + badgeD + 'px;">' +
      escapeHtml(number) +
      "</div></div>";
    return L.divIcon({
      html: html,
      className: "dd-pin-div-icon",
      iconSize: [box, box],
      iconAnchor: [box / 2, box / 2],
    });
  }

  function forceReenableDragging(marker) {
    if (!marker || !marker.dragging) return;
    if (marker.options.draggable) {
      marker.dragging.disable();
      marker.dragging.enable();
    }
  }

  // --- Map view state ---
  let mapLeaflet = null;
  let permanentLayer = null;
  let pinMarkersByNumber = {};
  let currentMapId = null;
  let setupModeOn = false;
  let pendingMarker = null;
  let pendingRotation = 0;
  let pendingDefaultNumber = null;
  let editingPinId = null; // set while pendingMarker represents an EXISTING pin being edited, not a new drop
  let locationTracker = null; // {watchId, marker} once geolocation is granted
  let followMode = true; // map re-centers on the live-location dot until the user drags away

  const mapsPickerOverlay = document.getElementById("dd-maps-picker-overlay");
  const mapsPickerBody = document.getElementById("dd-maps-picker-body");
  const mapsPickerDoneBtn = document.getElementById("dd-maps-picker-done");

  const mapOverlay = document.getElementById("dd-map-overlay");
  const mapTitleEl = document.getElementById("dd-map-title");
  const mapBackBtn = document.getElementById("dd-map-back");
  const setupToggleBtn = document.getElementById("dd-map-setup-toggle");
  const searchInput = document.getElementById("dd-map-search-input");
  const searchBtn = document.getElementById("dd-map-search-btn");
  const searchMsg = document.getElementById("dd-map-search-msg");
  const gridEl = document.getElementById("dd-map-grid");
  const recenterBtn = document.getElementById("dd-map-recenter-btn");

  const setupBar = document.getElementById("dd-map-setup-bar");
  const setupInstructions = document.getElementById("dd-map-setup-instructions");
  const setupFieldsRow = document.getElementById("dd-map-setup-fields");
  const setupNumberInput = document.getElementById("dd-map-setup-number");
  const setupRotationInput = document.getElementById("dd-map-setup-rotation");
  const setupActionsRow = document.getElementById("dd-map-setup-actions");
  const setupCancelBtn = document.getElementById("dd-map-setup-cancel");
  const setupConfirmBtn = document.getElementById("dd-map-setup-confirm");
  const setupDeleteBtn = document.getElementById("dd-map-setup-delete");
  const setupExitBtn = document.getElementById("dd-map-setup-exit");

  function closeHamburgerMenuLocal() {
    const menu = document.getElementById("hamburgerMenu");
    const btn = document.getElementById("hamburgerBtn");
    menu?.classList.remove("is-open");
    menu?.setAttribute("aria-hidden", "true");
    btn?.setAttribute("aria-expanded", "false");
  }

  // === Picker ===
  function renderMapsPicker() {
    if (!mapsPickerBody) return;
    mapsPickerBody.innerHTML = "";
    MAP_DEFS.forEach((def) => {
      const rec = getMapRecord(def.id);
      const item = document.createElement("div");
      item.className = "dd-maps-picker-item";
      const name = document.createElement("span");
      name.className = "dd-maps-picker-name";
      name.textContent = def.name;
      const addr = document.createElement("span");
      addr.className = "dd-maps-picker-address";
      addr.textContent = def.address;
      const count = document.createElement("span");
      count.className = "dd-maps-picker-count";
      count.textContent = rec.pins.length + (rec.pins.length === 1 ? " pin placed" : " pins placed");
      item.appendChild(name);
      item.appendChild(addr);
      item.appendChild(count);
      item.addEventListener("click", () => openMapView(def.id));
      mapsPickerBody.appendChild(item);
    });
  }
  function openMapsPicker() {
    closeHamburgerMenuLocal();
    renderMapsPicker();
    mapsPickerOverlay?.classList.add("is-open");
    mapsPickerOverlay?.setAttribute("aria-hidden", "false");
  }
  function closeMapsPicker() {
    mapsPickerOverlay?.classList.remove("is-open");
    mapsPickerOverlay?.setAttribute("aria-hidden", "true");
  }
  document.getElementById("menuMaps")?.addEventListener("click", openMapsPicker);
  mapsPickerDoneBtn?.addEventListener("click", closeMapsPicker);

  // === Live location dot + follow mode ===
  // Lime green, distinct from the orange/red pins and blue pending/setup
  // color -- stands out against satellite imagery either way. Continuous
  // watchPosition (not a one-time read) so the dot and the followed view
  // both update live as the driver actually moves, same technique as
  // flightlog-v2's live-location dot.
  const LIVE_LOCATION_COLOR = "#2EFF2E";
  // The map should open showing the PROPERTY, not jump to wherever the
  // user happens to be right now -- the dot (and following) only kicks in
  // once they're actually near this property. 400m comfortably covers a
  // whole complex/campground plus its approach road without being so wide
  // it triggers from elsewhere in town.
  const ARRIVAL_RADIUS_METERS = 400;
  let currentMapCenter = null; // {lat,lng} of whichever property is open, for the arrival check

  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function startLocationFollow() {
    followMode = true;
    updateRecenterBtnVisibility();
    if (locationTracker || typeof navigator === "undefined" || !navigator.geolocation) return;
    locationTracker = { watchId: null, marker: null };
    locationTracker.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        const arrived =
          !!currentMapCenter &&
          distanceMeters(latlng[0], latlng[1], currentMapCenter.lat, currentMapCenter.lng) <= ARRIVAL_RADIUS_METERS;

        if (!arrived) {
          // Not at this property (yet, or anymore) -- no dot, no
          // auto-pan. Drop an existing dot too, so it only ever shows
          // while they're actually there.
          if (locationTracker.marker) {
            locationTracker.marker.remove();
            locationTracker.marker = null;
          }
          updateRecenterBtnVisibility();
          return;
        }

        if (!locationTracker.marker) {
          locationTracker.marker = L.circleMarker(latlng, {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: LIVE_LOCATION_COLOR,
            fillOpacity: 1,
            interactive: false,
          }).addTo(mapLeaflet);
        } else {
          locationTracker.marker.setLatLng(latlng);
        }
        if (followMode && mapLeaflet) {
          mapLeaflet.setView(latlng, mapLeaflet.getZoom(), { animate: true });
        }
        updateRecenterBtnVisibility();
      },
      (err) => {
        // Fails silently on the map itself -- permission denied, no GPS
        // signal, etc. shouldn't ever break the map. Logged for debugging.
        console.warn("Live location tracking error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }
  function stopLocationFollow() {
    if (!locationTracker) return;
    if (typeof navigator !== "undefined" && navigator.geolocation && locationTracker.watchId != null) {
      navigator.geolocation.clearWatch(locationTracker.watchId);
    }
    if (locationTracker.marker) locationTracker.marker.remove();
    locationTracker = null;
  }
  // The recenter button only makes sense once there's an actual dot to
  // recenter to -- before arrival there's nothing to jump back to.
  function updateRecenterBtnVisibility() {
    const show = !followMode && !!locationTracker?.marker;
    recenterBtn?.classList.toggle("hide", !show);
  }
  function recenterOnMe() {
    followMode = true;
    updateRecenterBtnVisibility();
    if (locationTracker?.marker && mapLeaflet) {
      mapLeaflet.setView(locationTracker.marker.getLatLng(), mapLeaflet.getZoom(), { animate: true });
    }
  }
  recenterBtn?.addEventListener("click", recenterOnMe);

  // === Full-screen map view ===
  function openMapView(mapId) {
    const def = MAP_DEFS.find((m) => m.id === mapId);
    if (!def) return;
    currentMapId = mapId;
    currentMapCenter = def.center;
    closeMapsPicker();
    if (mapTitleEl) mapTitleEl.textContent = def.name;
    if (searchInput) searchInput.value = "";
    if (searchMsg) searchMsg.textContent = "";
    setSetupMode(false);

    mapOverlay?.classList.add("is-open");
    mapOverlay?.setAttribute("aria-hidden", "false");

    if (!mapLeaflet && typeof L !== "undefined") {
      // zoomAnimation/fadeAnimation: false matches flightlog-v2's own
      // single-view map setups (field-work.js) -- Leaflet's zoom/fade
      // CSS-transform animation is what causes the sub-pixel tile-seam
      // gaps to show up most, on top of the PaperCSS img-reset fix.
      mapLeaflet = L.map("dd-map-canvas", {
        zoomAnimation: false,
        fadeAnimation: false,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        maxZoom: 22,
      });
      // detectRetina deliberately omitted -- this tile URL has no {r}
      // placeholder, and Leaflet's detectRetina still shifts the
      // requested zoom down by one on any high-DPI screen to compensate,
      // which broke tile loading entirely (grayed-out map). flightlog-v2's
      // own single-property maps (field-work.js) don't set it either --
      // matching that exactly here.
      L.tileLayer("https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: "Tiles &copy; Esri",
      }).addTo(mapLeaflet);
      permanentLayer = L.layerGroup().addTo(mapLeaflet);
      mapLeaflet.on("click", handleMapClick);
      mapLeaflet.on("zoomend", rescaleAllPins);
      // Only a real user-initiated drag fires 'dragstart' -- programmatic
      // setView calls (follow-mode re-centering, search) don't, so this
      // can't fight with either of those.
      mapLeaflet.on("dragstart", () => {
        if (followMode) {
          followMode = false;
          updateRecenterBtnVisibility();
        }
      });
    }

    mapLeaflet.setView([def.center.lat, def.center.lng], 19);
    setTimeout(() => {
      mapLeaflet.invalidateSize();
      renderPermanentPins();
    }, 60);
    startLocationFollow();
  }
  function closeMapView() {
    setSetupMode(false);
    stopLocationFollow();
    currentMapCenter = null;
    mapOverlay?.classList.remove("is-open");
    mapOverlay?.setAttribute("aria-hidden", "true");
  }
  mapBackBtn?.addEventListener("click", closeMapView);

  // === Permanent pins ===
  // Non-interactive outside Setup Mode (so nothing but Search touches
  // them, and taps pass through to the map underneath); interactive and
  // clickable-to-edit while Setup Mode is on.
  function renderPermanentPins() {
    if (!permanentLayer) return;
    permanentLayer.clearLayers();
    pinMarkersByNumber = {};
    const rec = getMapRecord(currentMapId);
    const scale = scaleForZoom(mapLeaflet);
    rec.pins.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: makePinDivIcon(pin.number, pin.rotation || 0, scale, false),
        interactive: setupModeOn,
        keyboard: false,
      });
      if (setupModeOn) {
        marker.on("click", (e) => {
          // Stop this from ALSO registering as a "place a new pin here"
          // tap on the map underneath.
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          startEditingPin(pin);
        });
      }
      permanentLayer.addLayer(marker);
      pinMarkersByNumber[String(pin.number).toLowerCase()] = marker;
    });
  }
  function rescaleAllPins() {
    if (!mapLeaflet) return;
    const scale = scaleForZoom(mapLeaflet);
    const rec = getMapRecord(currentMapId);
    Object.keys(pinMarkersByNumber).forEach((key) => {
      const marker = pinMarkersByNumber[key];
      const pin = rec.pins.find((p) => String(p.number).toLowerCase() === key);
      if (marker && pin) marker.setIcon(makePinDivIcon(pin.number, pin.rotation || 0, scale, false));
    });
    if (pendingMarker) {
      pendingMarker.setIcon(makePinDivIcon(setupNumberInput?.value || pendingDefaultNumber, pendingRotation, scale, true));
      forceReenableDragging(pendingMarker);
    }
  }

  // === Setup Mode ===
  function readyMessage() {
    if (!currentMapId) return "";
    const rec = getMapRecord(currentMapId);
    return "Tap the map to drop pin #" + lowestAvailableNumber(rec) + ", or tap a pin to edit it.";
  }
  // Tears down whatever's currently being placed or edited (if anything),
  // resets the Confirm/Delete buttons back to their default "new pin"
  // shape, and re-renders the permanent layer -- shared by Confirm,
  // Cancel, Delete, and Setup Mode toggling, so all four leave the map in
  // the same clean state.
  function exitPendingEditOrPlace() {
    if (pendingMarker) {
      mapLeaflet?.removeLayer(pendingMarker);
      pendingMarker = null;
    }
    pendingDefaultNumber = null;
    editingPinId = null;
    setupFieldsRow?.classList.add("hide");
    setupActionsRow?.classList.add("hide");
    setupDeleteBtn?.classList.add("hide");
    if (setupConfirmBtn) setupConfirmBtn.textContent = "Confirm";
    renderPermanentPins();
  }

  function setSetupMode(on) {
    setupModeOn = on;
    setupToggleBtn?.classList.toggle("is-active", on);
    setupBar?.classList.toggle("hide", !on);
    exitPendingEditOrPlace();
    if (on && setupInstructions) setupInstructions.textContent = readyMessage();
  }
  setupToggleBtn?.addEventListener("click", () => setSetupMode(!setupModeOn));
  setupExitBtn?.addEventListener("click", () => setSetupMode(false));

  // Pulls one existing permanent pin out for editing: draggable position,
  // adjustable direction/number, plus a Delete option -- unlike a brand
  // new drop, saving here updates that SAME pin in place and never
  // touches the auto-numbering sequence.
  function startEditingPin(pin) {
    if (pendingMarker || !mapLeaflet) return; // already placing/editing something else
    const scale = scaleForZoom(mapLeaflet);
    editingPinId = pin.id;
    pendingRotation = pin.rotation || 0;

    const existingMarker = pinMarkersByNumber[String(pin.number).toLowerCase()];
    if (existingMarker) permanentLayer.removeLayer(existingMarker);

    pendingMarker = L.marker([pin.lat, pin.lng], {
      icon: makePinDivIcon(pin.number, pendingRotation, scale, true),
      draggable: true,
      keyboard: false,
    }).addTo(mapLeaflet);

    if (setupNumberInput) setupNumberInput.value = String(pin.number);
    if (setupRotationInput) setupRotationInput.value = pendingRotation;
    if (setupInstructions) {
      setupInstructions.textContent = "Editing pin #" + pin.number + " — drag to reposition, adjust direction/number, then Save.";
    }
    setupFieldsRow?.classList.remove("hide");
    setupActionsRow?.classList.remove("hide");
    setupDeleteBtn?.classList.remove("hide");
    if (setupConfirmBtn) setupConfirmBtn.textContent = "Save";
  }

  function handleMapClick(e) {
    if (!setupModeOn || !currentMapId) return;
    const rec = getMapRecord(currentMapId);
    const scale = scaleForZoom(mapLeaflet);
    if (pendingMarker) {
      pendingMarker.setLatLng(e.latlng);
    } else {
      pendingDefaultNumber = lowestAvailableNumber(rec);
      pendingRotation = 0;
      pendingMarker = L.marker(e.latlng, {
        icon: makePinDivIcon(pendingDefaultNumber, 0, scale, true),
        draggable: true,
        keyboard: false,
      }).addTo(mapLeaflet);
      if (setupNumberInput) setupNumberInput.value = String(pendingDefaultNumber);
      if (setupRotationInput) setupRotationInput.value = 0;
    }
    if (setupInstructions) {
      setupInstructions.textContent = "Drag to adjust, set the direction, edit the number if needed, then Confirm.";
    }
    setupFieldsRow?.classList.remove("hide");
    setupActionsRow?.classList.remove("hide");
  }

  setupRotationInput?.addEventListener("input", (e) => {
    pendingRotation = Number(e.target.value);
    if (!pendingMarker) return;
    const el = pendingMarker.getElement();
    const line = el?.querySelector(".dd-pin-line");
    if (line) line.style.transform = "translate(-50%,-50%) rotate(" + pendingRotation + "deg)";
  });
  setupNumberInput?.addEventListener("input", (e) => {
    if (!pendingMarker) return;
    const el = pendingMarker.getElement();
    const badge = el?.querySelector(".dd-pin-badge");
    if (badge) badge.textContent = e.target.value || "?";
  });

  function confirmPendingPin() {
    if (!pendingMarker || !currentMapId) return;
    const numberVal = (setupNumberInput?.value || "").trim();
    if (!numberVal) {
      if (setupInstructions) setupInstructions.textContent = "Enter a number before confirming.";
      return;
    }
    const rec = getMapRecord(currentMapId);
    const ll = pendingMarker.getLatLng();

    if (editingPinId) {
      const pin = rec.pins.find((p) => p.id === editingPinId);
      if (pin) {
        pin.number = numberVal;
        pin.lat = ll.lat;
        pin.lng = ll.lng;
        pin.rotation = pendingRotation;
        saveMapsStore();
      }
      exitPendingEditOrPlace();
      if (setupInstructions) setupInstructions.textContent = readyMessage();
      return;
    }

    rec.pins.push({ id: genPinId(), number: numberVal, lat: ll.lat, lng: ll.lng, rotation: pendingRotation });
    // No counter to advance -- the next suggestion is recomputed fresh
    // (readyMessage/handleMapClick both call lowestAvailableNumber) from
    // whatever pins exist now, including this one.
    saveMapsStore();
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  function cancelPendingPin() {
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  function deletePendingPin() {
    if (!editingPinId || !currentMapId) return;
    const rec = getMapRecord(currentMapId);
    rec.pins = rec.pins.filter((p) => p.id !== editingPinId);
    saveMapsStore();
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = "Pin deleted. " + readyMessage();
  }
  setupConfirmBtn?.addEventListener("click", confirmPendingPin);
  setupCancelBtn?.addEventListener("click", cancelPendingPin);
  setupDeleteBtn?.addEventListener("click", deletePendingPin);

  // === Search ===
  function handleSearch() {
    if (!currentMapId || !searchInput) return;
    const q = searchInput.value.trim();
    if (searchMsg) searchMsg.textContent = "";
    if (!q) return;
    const rec = getMapRecord(currentMapId);
    const pin = rec.pins.find((p) => String(p.number).toLowerCase() === q.toLowerCase());
    if (!pin) {
      if (searchMsg) searchMsg.textContent = "Not found";
      return;
    }
    // A search jump is a deliberate move away from the live-location dot
    // too -- same as a manual drag, it should turn follow off (and show
    // the recenter button) rather than have the next GPS fix yank the
    // view straight back off the pin just found.
    if (followMode) {
      followMode = false;
      updateRecenterBtnVisibility();
    }
    mapLeaflet.once("moveend", () => {
      const marker = pinMarkersByNumber[String(pin.number).toLowerCase()];
      const el = marker?.getElement();
      const iconEl = el?.querySelector(".dd-pin-icon");
      if (iconEl) {
        iconEl.classList.remove("is-search-hit");
        void iconEl.offsetWidth; // restart the CSS animation
        iconEl.classList.add("is-search-hit");
      }
    });
    mapLeaflet.setView([pin.lat, pin.lng], Math.max(mapLeaflet.getZoom(), 20), { animate: true });
  }
  searchBtn?.addEventListener("click", handleSearch);
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
})();
