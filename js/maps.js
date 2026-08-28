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

   Pins now live in Supabase (the map_pins table + the dd_create_pin/
   dd_update_pin/dd_delete_pin functions from supabase_setup.sql), same
   pattern as auth.js/forum.js: an in-memory cache (pinsCache, keyed by
   map id) is what all the synchronous rendering code below reads from,
   refreshed with a real fetch right before it matters -- when the maps
   picker opens (so pin counts are accurate) and when a specific map
   opens (so its pins are accurate) -- plus after every create/edit/
   delete. Creating, moving, and deleting pins is admin-only, enforced
   again on the server side (not just by hiding the Setup button) by
   dd_create_pin/dd_update_pin/dd_delete_pin themselves. */

(function () {
  const sb = window.DD.supabaseClient;

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

  // pinsCache[mapId] is null until that map's pins have been fetched at
  // least once (lets the picker show "…" instead of a wrong "0 pins"),
  // then an array of {id, number, lat, lng, rotation} after that.
  // pathsCache[mapId] is the same idea for waypoint paths -- null until
  // fetched, then an array of {id, mapId, points} where points is an
  // ordered list of {lat,lng} (first = Start, last = End).
  let pinsCache = {};
  let pathsCache = {};
  MAP_DEFS.forEach((def) => {
    pinsCache[def.id] = null;
    pathsCache[def.id] = null;
  });

  function mapPinRow(row) {
    return { id: row.id, number: row.number, lat: row.lat, lng: row.lng, rotation: row.rotation || 0 };
  }
  async function refreshPinsForMap(mapId) {
    try {
      const { data, error } = await sb
        .from("map_pins")
        .select("*")
        .eq("map_id", mapId)
        .order("number", { ascending: true });
      if (error || !data) return false;
      pinsCache[mapId] = data.map(mapPinRow);
      return true;
    } catch (err) {
      return false;
    }
  }
  function mapPathRow(row) {
    return { id: row.id, mapId: row.map_id, points: Array.isArray(row.points) ? row.points : [] };
  }
  async function refreshPathsForMap(mapId) {
    try {
      // Ordered oldest-first -- this order is what gives each path its
      // stable display number (1st created = "1", 2nd = "2", ...) and its
      // color, both computed purely from position in this list (see
      // PATH_COLORS/renderPermanentPaths below), not stored on the row.
      const { data, error } = await sb
        .from("map_paths")
        .select("*")
        .eq("map_id", mapId)
        .order("created_at", { ascending: true });
      if (error || !data) return false;
      pathsCache[mapId] = data.map(mapPathRow);
      return true;
    } catch (err) {
      return false;
    }
  }
  // Loads pin counts for every property at once, for the picker screen.
  async function refreshAllPinCounts() {
    await Promise.all(MAP_DEFS.map((def) => refreshPinsForMap(def.id)));
  }
  function getMapRecord(id) {
    return { pins: pinsCache[id] || [], paths: pathsCache[id] || [] };
  }

  async function createPin(mapId, number, lat, lng, rotation) {
    const { data: result, error } = await sb.rpc("dd_create_pin", {
      p_token: window.DD.auth.getToken(),
      p_map_id: mapId,
      p_number: number,
      p_lat: lat,
      p_lng: lng,
      p_rotation: rotation,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function updatePin(pinId, number, lat, lng, rotation) {
    const { data: result, error } = await sb.rpc("dd_update_pin", {
      p_token: window.DD.auth.getToken(),
      p_pin_id: pinId,
      p_number: number,
      p_lat: lat,
      p_lng: lng,
      p_rotation: rotation,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function deletePin(pinId) {
    const { data: result, error } = await sb.rpc("dd_delete_pin", {
      p_token: window.DD.auth.getToken(),
      p_pin_id: pinId,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function createPath(mapId, points) {
    const { data: result, error } = await sb.rpc("dd_create_path", {
      p_token: window.DD.auth.getToken(),
      p_map_id: mapId,
      p_points: points,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function updatePath(pathId, points) {
    const { data: result, error } = await sb.rpc("dd_update_path", {
      p_token: window.DD.auth.getToken(),
      p_path_id: pathId,
      p_points: points,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function deletePath(pathId) {
    const { data: result, error } = await sb.rpc("dd_delete_path", {
      p_token: window.DD.auth.getToken(),
      p_path_id: pathId,
    });
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

  // --- Waypoint path point icons -- same "scales with zoom" approach as
  // the pin badge above, just simpler shapes: a lettered circle for
  // Start/End, a plain dot for anything in between. ---
  const PATH_ENDPOINT_BASE_D = 18;
  const PATH_MID_BASE_D = 9;

  function makePathPointIcon(kind, scale, isPending) {
    // kind: "start" | "end" | "mid"
    scale = scale || 1;
    const pendingClass = isPending ? " is-pending" : "";
    if (kind === "mid") {
      const d = Math.max(6, Math.round(PATH_MID_BASE_D * scale));
      const html = '<div class="dd-path-mid-dot' + pendingClass + '" style="width:' + d + "px;height:" + d + 'px;"></div>';
      return L.divIcon({ html: html, className: "dd-path-div-icon", iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
    }
    const d = Math.max(13, Math.round(PATH_ENDPOINT_BASE_D * scale));
    const fontPx = Math.max(8, Math.round(9 * scale));
    const label = kind === "start" ? "S" : "E";
    const kindClass = kind === "end" ? " dd-path-end" : "";
    const html =
      '<div class="dd-path-endpoint-badge' + kindClass + pendingClass + '" style="width:' + d + "px;height:" + d +
      "px;font-size:" + fontPx + 'px;">' + label + "</div>";
    return L.divIcon({ html: html, className: "dd-path-div-icon", iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
  }

  // --- Per-path numbering/coloring for SAVED waypoint chains ---
  // Each saved path gets a stable number (1, 2, 3, ...) and a color, both
  // computed purely from its position in the oldest-first list fetched by
  // refreshPathsForMap -- nothing is stored on the row for this, so there's
  // no schema/SQL change and no per-map setup to maintain. Numbers/colors
  // are scoped per map (each property's paths are numbered independently)
  // and shift if a path is deleted -- the ones after it move up by one,
  // same as how pin numbers get reused, so there's never a gap.
  //
  // Colors are a fixed rotation of vivid, maximally-distinct hues (picked
  // to stay readable against satellite imagery -- greens/tans/grays --
  // rather than an app-UI palette), so a path never gets more than one
  // fresh color as long as PATH_COLORS.length paths or fewer exist on that
  // map; beyond that it cycles.
  const PATH_COLORS = [
    "#e6194b", // red
    "#4363d8", // blue
    "#f58231", // orange
    "#3cb44b", // green
    "#911eb4", // purple
    "#f032e6", // magenta
    "#42d4f4", // cyan
    "#ffe119", // yellow
    "#fabed4", // pink
    "#000075", // navy
  ];
  function pathColorFor(index) {
    return PATH_COLORS[index % PATH_COLORS.length];
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  // A darker shade of the same hue for the End badge/mid dots, so within
  // one path Start still reads slightly different from End at a glance --
  // same idea as the old fixed teal/dark-teal pair, just per-path now.
  function darkenHex(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const f = 1 - amount;
    const c = (v) => Math.max(0, Math.round(v * f));
    return "#" + [c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  // Picks readable badge text (near-black or white) against a given
  // background color, via standard relative-luminance contrast -- some of
  // the palette above (yellow, pink) are too light for white text.
  function contrastTextColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#1a1a1a" : "#fff";
  }

  function makeSavedPathPointIcon(kind, number, color, scale) {
    // kind: "start" | "end" | "mid"
    scale = scale || 1;
    const isEnd = kind === "end";
    const dotColor = isEnd ? darkenHex(color, 0.28) : color;
    if (kind === "mid") {
      const d = Math.max(6, Math.round(PATH_MID_BASE_D * scale));
      const html =
        '<div class="dd-path-mid-dot" style="width:' + d + "px;height:" + d + "px;background:" + dotColor + ';"></div>';
      return L.divIcon({ html: html, className: "dd-path-div-icon", iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
    }
    const d = Math.max(13, Math.round(PATH_ENDPOINT_BASE_D * scale));
    const fontPx = Math.max(8, Math.round(9 * scale));
    const label = String(number) + (kind === "start" ? "S" : "E");
    const textColor = contrastTextColor(dotColor);
    const html =
      '<div class="dd-path-endpoint-badge" style="width:' + d + "px;height:" + d + "px;font-size:" + fontPx +
      "px;background:" + dotColor + ";color:" + textColor + ';">' + label + "</div>";
    return L.divIcon({ html: html, className: "dd-path-div-icon", iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
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

  let permanentPathsLayer = null;
  let entranceRoadFillLayer = null; // dirt-road ribbon, rendered BELOW the path lines/badges
  let entranceRoadLabelsLayer = null; // "ENTRANCE"/"IN ROAD" text, rendered ABOVE everything
  let pendingPathPoints = []; // [{lat,lng}, ...] while placing a new waypoint chain or editing an existing one
  let pendingPathMarkers = []; // parallel Leaflet markers, one per pendingPathPoints entry
  let pendingPathLine = null; // L.polyline joining pendingPathPoints
  let editingPathId = null; // set while pendingPathPoints represents an EXISTING path being edited, not a new one

  const mapsPickerOverlay = document.getElementById("dd-maps-picker-overlay");
  const mapsPickerBody = document.getElementById("dd-maps-picker-body");
  const mapsPickerDoneBtn = document.getElementById("dd-maps-picker-done");

  const mapOverlay = document.getElementById("dd-map-overlay");
  const mapTitleEl = document.getElementById("dd-map-title");
  const mapBackBtn = document.getElementById("dd-map-back");
  const setupToggleBtn = document.getElementById("dd-map-setup-toggle");
  const coordGridToggleBtn = document.getElementById("dd-map-grid-toggle");
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
  const setupPathUndoBtn = document.getElementById("dd-map-setup-path-undo");
  const setupExitBtn = document.getElementById("dd-map-setup-exit");
  const addWaypointBtn = document.getElementById("dd-map-setup-add-waypoint");
  const crosshairEl = document.getElementById("dd-map-crosshair");
  const searchBar = document.querySelector(".dd-map-searchbar");

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
      count.textContent =
        pinsCache[def.id] === null ? "…" : rec.pins.length + (rec.pins.length === 1 ? " pin placed" : " pins placed");
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
    // Fire-and-forget: shows "…" counts first, then real numbers once
    // this resolves -- same instant-open-then-fill-in feel as the map
    // view itself below.
    refreshAllPinCounts().then(renderMapsPicker);
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

  // === Coordinate grid ("Grid" toggle, admin only) ===
  // A live lat/lng graticule, each line labeled with its actual
  // coordinate -- exists so Claude can ask for a screenshot of it and read
  // real coordinates back off the image, since the live map data isn't
  // reachable directly from the sandbox this runs in. Purely a rendering
  // aid: nothing here is stored, nothing here is admin-only in effect
  // (read access to a graticule isn't sensitive) -- gated to admins only
  // because it's a working tool, not something a driver needs cluttering
  // their view.
  let coordGridOn = false;
  let coordGridLayer = null;

  // Picks a "nice" round degree step (1/2/5 x a power of ten) that gives
  // roughly `targetLines` gridlines across the given span -- same idea as
  // picking readable axis ticks on a chart, just in degrees instead of
  // linear units.
  function niceGridStep(span, targetLines) {
    const raw = span / targetLines;
    const exp = Math.floor(Math.log10(raw));
    const frac = raw / Math.pow(10, exp);
    const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return niceFrac * Math.pow(10, exp);
  }

  function coordGridLabel(text, cssClass) {
    return L.divIcon({
      html: '<span class="dd-coord-grid-label' + (cssClass ? " " + cssClass : "") + '">' + text + "</span>",
      className: "dd-path-div-icon", // reuses the existing "no default Leaflet icon chrome" reset
      iconSize: null,
    });
  }

  function renderCoordGrid() {
    if (!coordGridLayer) return;
    coordGridLayer.clearLayers();
    if (!coordGridOn || !mapLeaflet) return;
    const bounds = mapLeaflet.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    const latStep = niceGridStep(north - south, 7);
    const lngStep = niceGridStep(east - west, 7);
    const lineOpts = { color: "#fff", weight: 1, opacity: 0.6, interactive: false, dashArray: "4 4" };

    const firstLat = Math.ceil(south / latStep) * latStep;
    for (let lat = firstLat; lat <= north; lat += latStep) {
      coordGridLayer.addLayer(L.polyline([[lat, west], [lat, east]], lineOpts));
      coordGridLayer.addLayer(
        L.marker([lat, west], { icon: coordGridLabel(lat.toFixed(5)), interactive: false, keyboard: false })
      );
    }
    const firstLng = Math.ceil(west / lngStep) * lngStep;
    for (let lng = firstLng; lng <= east; lng += lngStep) {
      coordGridLayer.addLayer(L.polyline([[south, lng], [north, lng]], lineOpts));
      coordGridLayer.addLayer(
        L.marker([north, lng], { icon: coordGridLabel(lng.toFixed(5)), interactive: false, keyboard: false })
      );
    }
  }

  coordGridToggleBtn?.addEventListener("click", () => {
    coordGridOn = !coordGridOn;
    coordGridToggleBtn.classList.toggle("is-active", coordGridOn);
    renderCoordGrid();
  });

  // === Full-screen map view ===
  async function openMapView(mapId) {
    const def = MAP_DEFS.find((m) => m.id === mapId);
    if (!def) return;
    currentMapId = mapId;
    currentMapCenter = def.center;
    closeMapsPicker();
    if (mapTitleEl) mapTitleEl.textContent = def.name;
    if (searchInput) searchInput.value = "";
    if (searchMsg) searchMsg.textContent = "";
    // Map creation/editing is admin-only -- once pins exist they're
    // permanent and visible to everyone, but only an admin account can
    // add, move, or delete them. Re-checked every time a map opens so it
    // reflects whoever is currently logged in without needing a reload.
    const session = window.DD.auth && window.DD.auth.getSession();
    setupToggleBtn?.classList.toggle("hide", !(session && session.isAdmin));
    coordGridToggleBtn?.classList.toggle("hide", !(session && session.isAdmin));
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
      entranceRoadFillLayer = L.layerGroup().addTo(mapLeaflet);
      permanentPathsLayer = L.layerGroup().addTo(mapLeaflet);
      entranceRoadLabelsLayer = L.layerGroup().addTo(mapLeaflet);
      coordGridLayer = L.layerGroup().addTo(mapLeaflet);
      mapLeaflet.on("click", handleMapClick);
      mapLeaflet.on("zoomend", rescaleAllPins);
      mapLeaflet.on("moveend zoomend", renderCoordGrid);
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
    setTimeout(() => mapLeaflet.invalidateSize(), 60);
    startLocationFollow();
    // Pins and paths come from the server every time a map opens, so
    // something an admin placed from a different phone shows up here too.
    await Promise.all([refreshPinsForMap(mapId), refreshPathsForMap(mapId)]);
    // Amazon Campground's def.center above is just a rough address geocode
    // from before any real pin/path data existed -- it was landing the
    // initial view well off from the actual property (Heath: "way off to
    // the south east"). Once the real entrance road data is in, recenter
    // on its actual free end instead -- a real coordinate, not a guess.
    // Also updates currentMapCenter so the "am I actually at this
    // property" arrival check (live-location dot/follow, above) measures
    // distance from the right point too.
    if (mapId === "amazon") {
      const combined = getAmazonEntranceCombinedRoute(getMapRecord(mapId));
      if (combined && combined.length) {
        const entrancePoint = combined[0];
        currentMapCenter = entrancePoint;
        mapLeaflet.setView([entrancePoint.lat, entrancePoint.lng], 19, { animate: false });
      }
    }
    renderPermanentPins();
    renderPermanentPaths();
  }
  function closeMapView() {
    setSetupMode(false);
    stopLocationFollow();
    currentMapCenter = null;
    coordGridOn = false;
    coordGridToggleBtn?.classList.remove("is-active");
    coordGridLayer?.clearLayers();
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
    const pinsInteractive = setupModeOn;
    rec.pins.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: makePinDivIcon(pin.number, pin.rotation || 0, scale, false),
        interactive: pinsInteractive,
        keyboard: false,
      });
      if (pinsInteractive) {
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
  // === Permanent waypoint paths ===
  // Interactive-to-edit whenever Setup Mode is on (pins and waypoints are
  // both always live -- there's no separate submode to gate on). The path
  // currently being edited (editingPathId) is skipped here -- it's
  // rendered by renderPendingPath() instead, as draggable points.
  // --- Small planar-approx geometry helpers (meters), used only for the
  // entrance-road overlay below. The area covered by any one property map
  // is small enough (a few hundred meters) that treating degrees as locally
  // flat is accurate to well under a foot -- no need for real geodesy here.
  function metersPerDegreeAt(lat) {
    const latM = 111320;
    const lngM = 111320 * Math.cos((lat * Math.PI) / 180);
    return { latM, lngM };
  }
  function offsetLatLng(p, dxMeters, dyMeters) {
    const { latM, lngM } = metersPerDegreeAt(p.lat);
    return { lat: p.lat + dyMeters / latM, lng: p.lng + dxMeters / lngM };
  }
  function metersBetween(a, b) {
    const { latM, lngM } = metersPerDegreeAt((a.lat + b.lat) / 2);
    const dx = (b.lng - a.lng) * lngM;
    const dy = (b.lat - a.lat) * latM;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Buffers a polyline into a ribbon polygon -- a simple per-vertex
  // perpendicular offset, not a proper miter/bevel join. Good enough for a
  // decorative "this is a road" overlay; not survey-grade, and can pinch
  // slightly at a sharp turn.
  //
  // Takes separate left/right widths (meters) rather than one shared
  // width so the ribbon can be widened asymmetrically -- e.g. the entrance
  // road overlay below needs its extra width to only ever grow toward the
  // side away from the buildings, never toward them. "Left"/"right" here
  // are geometric, facing the points' own direction of travel (index 0 ->
  // last): for a tangent vector (dx, dy) in meters (x=east, y=north),
  // rotating it +90 degrees gives (-dy, dx), which points to the LEFT of
  // that direction of travel (walking due east, "left" is north) -- that's
  // exactly the (nx, ny) below, so `left` uses +(nx,ny) and `right` uses
  // the opposite.
  // Builds a road's dirt-textured ribbon as a set of small, individually
  // simple (non-self-intersecting) polygons instead of one continuous
  // outline -- one quad per segment, plus a small triangle on each side
  // at every interior vertex to fill the wedge between that segment and
  // the next. Safe to overlap freely since the ribbon polygons are drawn
  // with no stroke (see drawTexturedRoad) -- same fill on both sides of
  // any seam just reads as one continuous surface.
  //
  // This replaces an earlier version that built ONE polygon by offsetting
  // every vertex using the AVERAGED direction of its two neighboring
  // segments. That's a fine approximation on a gentle curve, but at a
  // genuinely sharp turn (like Alley Four's turnaround point) the
  // averaged direction can point well off from either actual segment, so
  // the offset point undershoots the real corner -- and the polygon's own
  // edges cross over each other right at that vertex. Rendered with the
  // SVG default even-odd fill rule, that self-crossing shows up as a
  // visible triangular NOTCH cut into the road right at the point of the
  // bend -- confirmed on Heath's live map. Building each segment as its
  // own simple quad, anchored at the two real endpoints rather than an
  // averaged direction, can't produce that self-crossing regardless of
  // how sharp the turn is; the per-vertex fan triangle then closes the
  // gap between adjacent segments' quads without reintroducing it.
  // Normalizes a "widths" argument to one {left,right} object per point --
  // either a single {left,right} (broadcast to every point, the common
  // case for a uniform-width road like Out Road or an alley) or an
  // already-per-point array (In Road, see below: route 1 stays asymmetric
  // near the buildings while route 2 is centered, so its width actually
  // changes partway along the route).
  function widthsForPoints(points, widths) {
    return Array.isArray(widths) ? widths : points.map(() => widths);
  }
  // One segment's own left/right cross-section at both of its endpoints
  // -- the shared building block for buildRibbonPieces (below) and for
  // stitching two separate roads together at fillRibbonJunction. `a` and
  // `b` can each carry their OWN width (rather than one width for the
  // whole segment), so a segment that straddles a width change (e.g.
  // where In Road's asymmetric route 1 meets its centered route 2) comes
  // out as a smooth trapezoid blending from one width to the other,
  // instead of an abrupt jump.
  function segmentQuad(a, aWidth, b, bWidth) {
    const { latM, lngM } = metersPerDegreeAt(a.lat);
    const dxM = (b.lng - a.lng) * lngM;
    const dyM = (b.lat - a.lat) * latM;
    const len = Math.sqrt(dxM * dxM + dyM * dyM) || 1;
    const nx = -dyM / len;
    const ny = dxM / len;
    return {
      aLeft: offsetLatLng(a, nx * aWidth.left, ny * aWidth.left),
      aRight: offsetLatLng(a, -nx * aWidth.right, -ny * aWidth.right),
      bLeft: offsetLatLng(b, nx * bWidth.left, ny * bWidth.left),
      bRight: offsetLatLng(b, -nx * bWidth.right, -ny * bWidth.right),
    };
  }
  // Grows one ribbon piece (quad or triangle) a hair outward from its own
  // centroid before it's drawn. Each piece is its own separate L.polygon
  // (see drawTexturedRoad/fillRibbonJunction below), and two of those that
  // only TOUCH along a shared edge -- even at identical coordinates -- can
  // still show a hairline gap there: the browser anti-aliases each one's
  // boundary independently, and the dark map underneath can peek through
  // that softened seam. That's what showed up as thin dark cracks cutting
  // across Rec Road. Growing every piece a fraction of a meter past its
  // true edge makes neighboring pieces overlap instead of merely touching,
  // which hides the seam -- and since every piece is still its OWN element
  // (not merged into one shape), an overlap just paints the same dirt
  // color twice; it can't create a hole or distort anything, unlike
  // merging pieces into one multi-ring shape would (that's the approach
  // that got reverted -- it touched how every road on the map is built and
  // caused real damage against Heath's actual waypoint data). This only
  // changes each piece's own four-or-so corners by a fraction of a meter.
  const RIBBON_PIECE_OVERLAP_METERS = 0.15;
  function inflatePiece(piece) {
    if (piece.length < 3) return piece;
    const { latM, lngM } = metersPerDegreeAt(piece[0].lat);
    let cLat = 0;
    let cLng = 0;
    piece.forEach((p) => {
      cLat += p.lat;
      cLng += p.lng;
    });
    cLat /= piece.length;
    cLng /= piece.length;
    return piece.map((p) => {
      const dxM = (p.lng - cLng) * lngM;
      const dyM = (p.lat - cLat) * latM;
      const len = Math.hypot(dxM, dyM) || 1;
      const growXM = dxM + (dxM / len) * RIBBON_PIECE_OVERLAP_METERS;
      const growYM = dyM + (dyM / len) * RIBBON_PIECE_OVERLAP_METERS;
      return { lat: cLat + growYM / latM, lng: cLng + growXM / lngM };
    });
  }
  function buildRibbonPieces(points, widths) {
    if (points.length < 2) return [];
    const w = widthsForPoints(points, widths);
    const quads = [];
    const pieces = [];
    for (let i = 0; i < points.length - 1; i++) {
      const quad = segmentQuad(points[i], w[i], points[i + 1], w[i + 1]);
      quads.push(quad);
      pieces.push([quad.aLeft, quad.bLeft, quad.bRight, quad.aRight]);
    }
    for (let i = 1; i < quads.length; i++) {
      const prev = quads[i - 1];
      const cur = quads[i];
      const vertex = points[i];
      // Each triangle is anchored at the real shared vertex with its
      // other two corners at most one width-length away -- always a
      // simple triangle, never self-intersecting, whatever the angle.
      // prev.bLeft/bRight and cur.aLeft/aRight are both computed from
      // this same vertex's own width (w[i]), so they already line up
      // exactly -- no seam even where the width itself is changing here.
      pieces.push([vertex, prev.bLeft, cur.aLeft]);
      pieces.push([vertex, prev.bRight, cur.aRight]);
    }
    return pieces.map(inflatePiece);
  }
  // The road's own true left/right edge AT a closestPointOnPolyline() hit
  // -- i.e. exactly the corners buildRibbonPieces would draw there, using
  // the ORIGINAL segment's direction (hit.point sits ON that segment, so
  // the direction is unchanged) and the width interpolated the same way
  // insertPointOnPolyline's companion argument interpolates it. This is
  // what an alley's own ribbon needs to be bridged onto -- see
  // snapAlleyToRoads below for why: inserting a shared VERTEX into the
  // road's polyline keeps the road itself solid straight through that
  // point, but the alley's own ribbon is a completely separate set of
  // polygons ending in its own flat cap at that same point, angled
  // however the alley happens to run -- nothing so far has ever made
  // that cap actually touch the road's surface.
  function crossSectionAtHit(points, hit, widths) {
    const w = widthsForPoints(points, widths);
    const a = points[hit.segmentIndex];
    const b = points[hit.segmentIndex + 1];
    const wA = w[hit.segmentIndex];
    const wB = w[hit.segmentIndex + 1];
    const hitWidth = { left: wA.left + (wB.left - wA.left) * hit.t, right: wA.right + (wB.right - wA.right) * hit.t };
    const quad = segmentQuad(a, wA, hit.point, hitWidth);
    return { left: quad.bLeft, right: quad.bRight };
  }
  // Same wedge-filling idea as buildRibbonPieces' interior joints, but
  // for stitching two SEPARATE roads' ribbons together at a shared end
  // vertex (In Road's far end / Out Road's near end) -- each road can
  // have its own width, and "left"/"right" don't necessarily correspond
  // between two independently-oriented roads, so this pairs whichever
  // combination of corners is closer together (same trick used elsewhere
  // in this file, e.g. combinePointSequences) before filling the two
  // resulting wedge triangles.
  // Bridges two SEPARATE routes' real end caps with a plain quad (split
  // into 2 triangles along a diagonal so it can never self-intersect,
  // same reasoning as buildRibbonPieces' interior joints) -- no shared
  // vertex assumed, since the two real endpoints these edges sit at can
  // be a genuine gap apart. "left"/"right" don't necessarily correspond
  // between two independently-oriented roads, so pick whichever pairing
  // has the smaller total span (same trick as combinePointSequences).
  function fillRibbonJunction(edgeA, edgeB, fillLayer) {
    const straight = metersBetween(edgeA.left, edgeB.left) + metersBetween(edgeA.right, edgeB.right);
    const crossed = metersBetween(edgeA.left, edgeB.right) + metersBetween(edgeA.right, edgeB.left);
    const paired = straight <= crossed ? { left: edgeB.left, right: edgeB.right } : { left: edgeB.right, right: edgeB.left };
    [
      [edgeA.left, paired.left, paired.right],
      [edgeA.left, paired.right, edgeA.right],
    ]
      .map(inflatePiece)
      .forEach((tri) => {
        fillLayer.addLayer(
          L.polygon(
            tri.map((p) => [p.lat, p.lng]),
            { stroke: false, fillColor: "url(#dd-dirt-pattern)", fillOpacity: 1, interactive: false }
          )
        );
      });
  }
  // The real left/right ribbon-edge points AT one END of a route (index 0
  // if `atStart`, otherwise the last index) -- literally the aLeft/aRight
  // (or bLeft/bRight) corners of that route's own outermost segmentQuad,
  // so this lines up exactly with what buildRibbonPieces actually drew
  // there. For handing to fillRibbonJunction above.
  function ribbonEdgeAtEnd(points, atStart, widths) {
    const w = widthsForPoints(points, widths);
    if (atStart) {
      const bIdx = Math.min(1, points.length - 1);
      const quad = segmentQuad(points[0], w[0], points[bIdx], w[bIdx]);
      return { left: quad.aLeft, right: quad.aRight };
    }
    const aIdx = points.length - 2 >= 0 ? points.length - 2 : points.length - 1;
    const bIdx = points.length - 1;
    const quad = segmentQuad(points[aIdx], w[aIdx], points[bIdx], w[bIdx]);
    return { left: quad.bLeft, right: quad.bRight };
  }
  // Joins two point sequences end-to-end, auto-detecting which pair of
  // endpoints is actually adjacent (and reversing either sequence as
  // needed) by picking whichever of the 4 possible pairings has the
  // smallest gap -- so callers don't have to know in advance which way
  // either path was originally drawn.
  function combinePointSequences(pointsA, pointsB) {
    const aStart = pointsA[0];
    const aEnd = pointsA[pointsA.length - 1];
    const bStart = pointsB[0];
    const bEnd = pointsB[pointsB.length - 1];
    const options = [
      { d: metersBetween(aEnd, bStart), build: () => pointsA.concat(pointsB) },
      { d: metersBetween(aEnd, bEnd), build: () => pointsA.concat(pointsB.slice().reverse()) },
      { d: metersBetween(aStart, bStart), build: () => pointsA.slice().reverse().concat(pointsB) },
      { d: metersBetween(aStart, bEnd), build: () => pointsA.slice().reverse().concat(pointsB.slice().reverse()) },
    ];
    options.sort((x, y) => x.d - y.d);
    return options[0].build();
  }
  // Cumulative per-segment lengths (meters) along a multi-point route --
  // shared by pointAtFraction and pointAndBearingAtDistance below so both
  // walk the same segment table instead of recomputing it separately.
  function routeSegLens(points) {
    const segLens = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const d = metersBetween(points[i], points[i + 1]);
      segLens.push(d);
      total += d;
    }
    return { segLens, total };
  }
  // Just the point (no angle) at a given absolute distance along a
  // multi-point route, clamped to the route's length. Factored out of
  // pointAndBearingAtDistance below so that function can sample this at
  // three nearby distances (for a smoothed angle) without walking the
  // route three separate times by hand.
  function pointAtDistance(points, segLens, total, distance) {
    const target = Math.max(0, Math.min(total, distance));
    let remaining = target;
    for (let i = 0; i < segLens.length; i++) {
      const len = segLens[i];
      if (remaining <= len || i === segLens.length - 1) {
        const t = len ? Math.min(1, remaining / len) : 0;
        const a = points[i];
        const b = points[i + 1];
        return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      }
      remaining -= len;
    }
    const last = points[points.length - 1];
    return { lat: last.lat, lng: last.lng };
  }
  // Degrees (CSS-rotate-ready, clockwise, RAW -- not normalized to stay
  // right-side-up, see renderFlowingRoadText for why that's decided once
  // per word rather than per letter) pointing from a toward b.
  function bearingBetween(a, b) {
    const { latM, lngM } = metersPerDegreeAt(a.lat);
    const dxM = (b.lng - a.lng) * lngM;
    const dyM = (b.lat - a.lat) * latM; // +north
    // Screen x = east, screen y = -north (screen y grows downward) --
    // atan2(screenY, screenX) is then the CSS rotate() angle that points a
    // horizontal glyph from a toward b.
    return (Math.atan2(-dyM, dxM) * 180) / Math.PI;
  }
  // How far to either side of a letter's own position to sample when
  // computing its rotation (see pointAndBearingAtDistance) -- comfortably
  // smaller than a letter's own spacing (FLOW_LETTER_BASE_SPACING_METERS)
  // so it still tracks a real curve rather than flattening it, but wide
  // enough to bridge a single sharp vertex between two waypoints.
  const FLOW_ANGLE_WINDOW_METERS = 1.5;
  // The point AND local direction at a given absolute distance (meters,
  // clamped to the route's length) along a multi-point route -- used to
  // lay individual letters down flowing along the road, each one angled
  // to match the road's direction right where it sits, the way a road
  // name painted on pavement (or a curved road label on a map) follows
  // the road instead of sitting next to it as a flat block of text. The
  // angle is sampled over a short window straddling the target distance
  // (see FLOW_ANGLE_WINDOW_METERS) rather than read off whichever single
  // waypoint-to-waypoint segment the exact distance happens to land on --
  // a hand-placed waypoint chain often has a real vertex (a sharp turn in
  // the recorded path) sitting almost exactly where a letter's own
  // position falls, which made that one letter visibly "kink" relative to
  // its neighbors even though the road's overall curve there reads as
  // smooth (e.g. Rec Road's leading "R" once landed right on such a
  // vertex). Position itself still uses the exact target distance.
  function pointAndBearingAtDistance(points, segLens, total, distance) {
    const here = pointAtDistance(points, segLens, total, distance);
    const before = pointAtDistance(points, segLens, total, distance - FLOW_ANGLE_WINDOW_METERS);
    const after = pointAtDistance(points, segLens, total, distance + FLOW_ANGLE_WINDOW_METERS);
    const angle = bearingBetween(before, after);
    return { lat: here.lat, lng: here.lng, angle };
  }

  // A procedural dirt/gravel texture (mottled tan, no external image) --
  // injected into the page once as a reusable SVG pattern, then referenced
  // by fillColor on the entrance-road ribbon polygon below. feTurbulence
  // gives it grain instead of a flat color, so it actually reads as a
  // texture rather than a solid-color road shape.
  let dirtPatternReady = false;
  function ensureDirtPatternDefs() {
    if (dirtPatternReady) return;
    dirtPatternReady = true;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.innerHTML =
      '<defs>' +
      '<filter id="dd-dirt-noise" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="noise"/>' +
      '<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.30  0 0 0 0.55 0"/>' +
      '</filter>' +
      '<pattern id="dd-dirt-pattern" patternUnits="userSpaceOnUse" width="60" height="60">' +
      '<rect width="60" height="60" fill="#a9835f"/>' +
      '<rect width="60" height="60" filter="url(#dd-dirt-noise)"/>' +
      '</pattern>' +
      '</defs>';
    document.body.appendChild(svg);
  }

  // Both icons below are anchored to their lat/lng with `translate(-50%,
  // -50%)` on the inner span, not Leaflet's iconAnchor -- these render at
  // whatever size their text happens to be (a whole word for ENTRANCE, a
  // single glyph per flow letter), so centering on the actual box the
  // browser lays out is more reliable than guessing a fixed pixel anchor.
  // Without this the label's top-left corner (not its center) sat on the
  // target point, which is what was making it land off to one side of
  // where it was supposed to be.
  function makeEntranceLabelIcon(text) {
    return L.divIcon({
      html: '<span class="dd-entrance-label" style="transform: translate(-50%, -50%)">' + text + "</span>",
      className: "dd-path-div-icon",
      iconSize: null,
    });
  }
  // One letter, positioned/angled to sit flush on the road at that exact
  // point -- see pointAndBearingAtDistance above. translate(-50%,-50%)
  // centers the glyph on its point BEFORE the rotate (CSS transform
  // functions compose right-to-left against the element's own box), so it
  // spins in place around where it's actually sitting rather than around
  // its top-left corner.
  function makeFlowLetterIcon(char, angleDeg, fontPx) {
    return L.divIcon({
      html:
        '<span class="dd-road-flow-letter" style="font-size:' +
        fontPx +
        'px; transform: translate(-50%, -50%) rotate(' +
        angleDeg +
        'deg)">' +
        char +
        "</span>",
      className: "dd-path-div-icon",
      iconSize: null,
    });
  }
  // Base tuning below is "at zoom 19" (ICON_BASE_ZOOM, see scaleForZoom) --
  // both get scaled from there the same way pin/path badges already are,
  // so the letters stay legible instead of squishing together as the real
  // ground-meter gap between them shrinks in pixel terms at a more zoomed
  // out view. First tuning (2.6m/14px) read as "blocky and squished
  // together" per Heath's feedback -- letters were only ~12px apart
  // center-to-center at zoom 19, barely more than their own glyph width.
  const FLOW_LETTER_BASE_SPACING_METERS = 4.2;
  const FLOW_LETTER_BASE_FONT_PX = 13;
  // Whether the whole road's repeated text reads "forwards" (in the
  // direction of increasing distance along the route, i.e. entrance ->
  // junction) or needs flipping to stay upright is decided ONCE for the
  // entire road, from its overall net direction (start point to end
  // point) -- not per repetition and not per letter. Deciding it per
  // repetition (an earlier version of this) let the 25%/50%/75% instances
  // disagree with each other whenever the road's LOCAL heading at one of
  // those points happened to fall on the other side of +/-90 degrees from
  // the road's overall direction, even though the road itself wasn't
  // actually bending that sharply there -- that's what read as one
  // instance ("the very first IN ROAD") facing backwards relative to the
  // other two, like the road was headed out instead of in.
  function overallRouteFlip(points) {
    const first = points[0];
    const last = points[points.length - 1];
    const { latM, lngM } = metersPerDegreeAt(first.lat);
    const dxM = (last.lng - first.lng) * lngM;
    const dyM = (last.lat - first.lat) * latM;
    const angle = (Math.atan2(-dyM, dxM) * 180) / Math.PI;
    return angle > 90 || angle < -90;
  }
  // Lays `text` down letter-by-letter, centered on the given fraction of
  // the route, each letter placed and angled to follow the road's local
  // direction right where it lands (spaces just advance the cursor with no
  // glyph) -- so it reads like a road name painted on the road itself, not
  // a block label floating beside it. `flip` (see overallRouteFlip above)
  // is shared across every repetition on the same road so they all read
  // the same direction; each letter's own angle still follows the local
  // curve, only the flip/order decision is fixed road-wide.
  function renderFlowingRoadText(text, points, segLens, total, centerFraction, layer, scale, flip) {
    // Ground-meter spacing grows as the view zooms out (scale shrinks) so
    // the on-screen gap between letters stays roughly constant instead of
    // collapsing -- the opposite direction from font size below, which
    // shrinks in step with the map's own content like every other badge
    // in this file.
    const letterSpacingMeters = FLOW_LETTER_BASE_SPACING_METERS / scale;
    const fontPx = Math.max(9, Math.round(FLOW_LETTER_BASE_FONT_PX * scale));
    const centerDistance = total * centerFraction;
    const startDistance = centerDistance - ((text.length - 1) * letterSpacingMeters) / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = flip ? text[text.length - 1 - i] : text[i];
      if (ch === " ") continue;
      const distance = startDistance + i * letterSpacingMeters;
      const { lat, lng, angle } = pointAndBearingAtDistance(points, segLens, total, distance);
      const finalAngle = flip ? angle + 180 : angle;
      layer.addLayer(
        L.marker([lat, lng], {
          icon: makeFlowLetterIcon(ch, finalAngle, fontPx),
          interactive: false,
          keyboard: false,
        })
      );
    }
  }

  // The old symmetric 3.5m-total width (1.75m each side) put the road
  // over buildings whenever it was widened, because the buildings sit
  // close along the LEFT side of the route (facing the direction of
  // travel from ENTRANCE toward the junction/orange road -- see Heath's
  // answer 2026-08-27). So the two sides now grow independently: the
  // inside (left, toward the buildings) stays put at the old half-width,
  // and all the extra thickness goes to the outside (right, away from
  // the buildings).
  const ENTRANCE_ROAD_INSIDE_METERS = 1.75; // left -- unchanged, don't grow toward buildings
  const ENTRANCE_ROAD_OUTSIDE_METERS = 4.25; // right -- all the added width lives here

  // Waypoint 3 ("Out Road") has no building crowding it the way the
  // entrance road does, so no need for the asymmetric-widening dance --
  // just a plain thicker ribbon, evenly split and centered directly on
  // the saved path (matches the entrance road's total 6m girth so the
  // two roads read as the same kind of thing).
  const OUT_ROAD_HALF_WIDTH_METERS = 3.0;

  // Every road in this feature ends up the same 6m total girth (entrance
  // road: 1.75+4.25; out road/alleys: 3+3) -- this is how far an alley
  // connection has to land from a road's own endpoint before it's
  // allowed to insert a brand new vertex there (see closestPointOnPolyline's
  // endGuardMeters). Any closer and it snaps directly onto the existing
  // endpoint instead: that endpoint is usually ALSO the road's junction
  // with another road, and inserting a too-close extra vertex right next
  // to it was replacing the junction's real, long-run direction with a
  // short, differently-angled stub -- which is what was actually cutting
  // the road off right where two roads met. Computed from the real width
  // constants (roughly one road-width) rather than hardcoded so it stays
  // sane if those ever change.
  const ALLEY_JUNCTION_GUARD_METERS =
    Math.max(ENTRANCE_ROAD_INSIDE_METERS + ENTRANCE_ROAD_OUTSIDE_METERS, OUT_ROAD_HALF_WIDTH_METERS * 2) / 2 + 0.5;
  // Some alleys are real cut-throughs that touch BOTH In Road and Out Road
  // (e.g. Alley One through Four); others -- Offshoot Alley being the
  // known case -- are a dead-end spur off just ONE road, whose other end
  // simply stops in the woods rather than connecting to anything. Without
  // this cap, snapAlleyToRoads (below) always forced BOTH ends onto some
  // road, picking whichever pairing minimized the COMBINED distance
  // across both ends -- which for a spur meant a genuinely close, correct
  // match on the real end could lose out to a pairing that made the
  // dead-end's forced (nonsense) match slightly less bad, snapping the
  // real junction onto the wrong road entirely. A closest point beyond
  // this distance is treated as "not actually near this road" and left
  // unsnapped instead of forced. Comfortably above a real junction's
  // expected distance (a couple meters, per ALLEY_JUNCTION_GUARD_METERS
  // above, for hand-placed pins) and comfortably below the tens-of-meters
  // gap a genuine dead-end tip sits at.
  const ALLEY_MAX_SNAP_METERS = 6;

  // Amazon Campground specific: waypoint routes 1 and 2 are one continuous
  // real dirt road (per Heath) that just got drawn as two separate
  // waypoint chains -- this renders them as a single textured road with
  // "ENTRANCE" at the free end (route 1's end that ISN'T the join with
  // route 2) and "IN ROAD" repeated a few times along its length, without
  // touching the underlying path data (routes 1/2 stay two separate,
  // independently-editable saved paths; this is a purely visual overlay
  // computed fresh from their current points every render).
  // True when routes 1 and 2 on the current map are the pair the entrance
  // road overlay draws over -- shared with renderPermanentPaths below so
  // it can hide their own line/badges (Heath's call: the dirt road IS
  // routes 1 and 2 now, no need for the numbered waypoint markers too).
  function hasEntranceRoad(rec) {
    return currentMapId === "amazon" && !!rec.paths[0]?.points?.length && !!rec.paths[1]?.points?.length;
  }
  // The route 1 + route 2 join, shared between renderEntranceRoad below and
  // openMapView's initial-view fix -- both need the same real (live,
  // data-driven) entrance coordinate rather than each computing/guessing
  // their own.
  function getAmazonEntranceCombinedRoute(rec) {
    if (!hasEntranceRoad(rec)) return null;
    return combinePointSequences(rec.paths[0].points, rec.paths[1].points);
  }
  // Shifts every point of a route perpendicular to its own local
  // direction, toward the "outside"/right side (same sign convention as
  // segmentQuad's `right`) -- used to turn the raw route into the
  // ribbon's actual visual centerline. `offsetMeters` can be a single
  // number (uniform, e.g. Out Road/alleys where it's just 0) or one
  // number per point (In Road, whose width -- and so its true middle --
  // changes partway along the route).
  function offsetPolylinePerpendicular(points, offsetMeters) {
    if (!offsetMeters) return points;
    const offsets = Array.isArray(offsetMeters) ? offsetMeters : points.map(() => offsetMeters);
    return points.map((p, i) => {
      const off = offsets[i];
      if (!off) return p;
      const prev = points[i - 1] || points[i];
      const next = points[i + 1] || points[i];
      const { latM, lngM } = metersPerDegreeAt(p.lat);
      const dxM = (next.lng - prev.lng) * lngM;
      const dyM = (next.lat - prev.lat) * latM;
      const len = Math.sqrt(dxM * dxM + dyM * dyM) || 1;
      const nx = -dyM / len;
      const ny = dxM / len;
      return offsetLatLng(p, -nx * off, -ny * off);
    });
  }
  // Shared by the entrance road (routes 1+2, asymmetric) and the out road
  // (route 3, symmetric) below -- draws the textured ribbon plus its
  // repeated flowing label, and an optional single start label (only the
  // entrance road uses that part). Doesn't touch/clear any layers itself;
  // callers own that (both draw into the same shared fill/labels layers).
  function drawTexturedRoad(points, opts) {
    ensureDirtPatternDefs();
    // Either a single {left,right} for a uniform-width road (Out Road,
    // alleys) or one {left,right} per point when the width itself changes
    // along the route (In Road: route 1 stays asymmetric near the
    // buildings, route 2 is centered -- see renderEntranceRoad).
    const widths = opts.widths || { left: opts.insideMeters, right: opts.outsideMeters };
    const widthAt = widthsForPoints(points, widths);
    // No stroke on any of these -- every road segment (In Road, Out Road,
    // each alley) is built from several small polygons (see
    // buildRibbonPieces) that only share vertices with their neighbors,
    // not one merged shape. A stroked border around each one draws its
    // own line right along that shared edge too, and wherever several of
    // these polygons converge (every road junction) their borders
    // overlap/cross into a visible ring -- that's what Heath flagged as
    // "weird circles" once the junction-patch circles piled another ring
    // on top of that. Dropping the stroke entirely removes the seam
    // lines; the matching dirt-pattern fill on both sides of a shared
    // edge already reads as one continuous road with no border to draw.
    buildRibbonPieces(points, widthAt).forEach((piece) => {
      opts.fillLayer.addLayer(
        L.polygon(
          piece.map((p) => [p.lat, p.lng]),
          { stroke: false, fillColor: "url(#dd-dirt-pattern)", fillOpacity: 1, interactive: false }
        )
      );
    });

    // The ribbon's real visual middle -- for a symmetric width (inside ==
    // outside, e.g. the out road) this offset is 0 and centerline is just
    // `points` back again; for an asymmetric one (In Road's route 1) it's
    // shifted toward the wider/outside edge so labels sit centered on the
    // road as actually drawn rather than drifting toward the inside edge.
    // Per-point since the width itself can vary along the route.
    const centerOffset = widthAt.map((w) => (w.right - w.left) / 2);
    const centerline = offsetPolylinePerpendicular(points, centerOffset);

    if (opts.startLabelText) {
      const startLabelAt = offsetLatLng(centerline[0], opts.startLabelOffset[0], opts.startLabelOffset[1]);
      opts.labelsLayer.addLayer(
        L.marker([startLabelAt.lat, startLabelAt.lng], {
          icon: makeEntranceLabelIcon(opts.startLabelText),
          interactive: false,
          keyboard: false,
        })
      );
    }

    const { segLens, total } = routeSegLens(centerline);
    const scale = scaleForZoom(mapLeaflet);
    const flip = overallRouteFlip(centerline);
    const labelFractions = opts.labelFractions || [0.25, 0.5, 0.75];
    labelFractions.forEach((frac) => {
      renderFlowingRoadText(opts.labelText, centerline, segLens, total, frac, opts.labelsLayer, scale, flip);
    });
  }
  // Merges/drops points that sit closer together than `minMeters`, always
  // keeping the first and last points untouched -- defensive cleanup for
  // near-duplicate points that can end up sitting right next to each
  // other after junction/alley snapping inserts a new vertex very close
  // to an existing one. A near-zero-length segment between two points
  // makes bufferLineToRibbon's per-vertex tangent (computed from the
  // points on either side) numerically unstable, which can show up as an
  // erratic kink or pinch in the ribbon right at that spot.
  // `companion` (optional), when given, is a same-length parallel array
  // (e.g. per-point widths) kept in sync -- whatever index gets dropped
  // from `points` is dropped from `companion` too, so the two never fall
  // out of alignment.
  function dedupeAdjacentPoints(points, minMeters, companion) {
    if (points.length <= 2) return companion ? { points, companion } : points;
    const result = [points[0]];
    const resultCompanion = companion ? [companion[0]] : null;
    for (let i = 1; i < points.length - 1; i++) {
      if (metersBetween(result[result.length - 1], points[i]) >= minMeters) {
        result.push(points[i]);
        if (resultCompanion) resultCompanion.push(companion[i]);
      }
    }
    result.push(points[points.length - 1]);
    if (resultCompanion) resultCompanion.push(companion[companion.length - 1]);
    return companion ? { points: result, companion: resultCompanion } : result;
  }
  // Amazon Campground specific: waypoint 3 ("Orange road") gets the same
  // textured-road treatment as the entrance road, just as its own single
  // route (no joining needed) and labeled "OUT ROAD" -- per Heath, no
  // building crowds it so the ribbon is a plain symmetric widen-and-center
  // rather than the entrance road's asymmetric one.
  function hasOutRoad(rec) {
    return currentMapId === "amazon" && !!rec.paths[2]?.points?.length && rec.paths[2].points.length >= 2;
  }
  // Orients `points` so whichever of its two ends is closer to
  // `referencePoint` comes first (reversing the array if that's the LAST
  // point, not the first) -- used below to figure out which end of route
  // 3 is the one actually meeting the entrance road, without assuming
  // it was drawn in any particular direction.
  function orientTowardPoint(points, referencePoint) {
    const dStart = metersBetween(points[0], referencePoint);
    const dEnd = metersBetween(points[points.length - 1], referencePoint);
    return dEnd < dStart ? points.slice().reverse() : points;
  }
  // The closest point ON a polyline (not just its nearest vertex -- an
  // actual point along whichever segment it falls on) to `target`, found
  // by projecting `target` onto every segment in local meters and keeping
  // the nearest. Used to connect an alley into the MIDDLE of In Road/Out
  // Road, not just their endpoints -- alleys branch off partway along a
  // road, not necessarily where it happens to start or end.
  // `endGuardMeters`, when passed, keeps a hit that lands on the road's
  // very first or very last segment from inserting a new vertex too
  // close to that road's own outer endpoint -- clamps it exactly onto
  // that endpoint instead (t=0 or t=1, which insertPointOnPolyline
  // already knows to treat as "no insertion needed"). This matters
  // specifically where a road's endpoint is ALSO the junction with
  // another road (e.g. Out Road's start, snapped onto In Road's end):
  // an alley connecting close to that same spot was inserting its own
  // extra vertex right next to it, which replaced the junction's real,
  // long-run direction with a short, differently-angled stub -- and
  // bufferLineToRibbon uses exactly that neighboring vertex to figure
  // out which way the ribbon's edge should point at the endpoint. That's
  // what was actually cutting off the road right where the two joined,
  // and only ever showed up once alleys started landing near there.
  function closestPointOnPolyline(points, target, endGuardMeters) {
    let best = null;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const { latM, lngM } = metersPerDegreeAt(a.lat);
      const bxM = (b.lng - a.lng) * lngM;
      const byM = (b.lat - a.lat) * latM;
      const txM = (target.lng - a.lng) * lngM;
      const tyM = (target.lat - a.lat) * latM;
      const abLenSq = bxM * bxM + byM * byM;
      let t = abLenSq ? (txM * bxM + tyM * byM) / abLenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const projXM = bxM * t;
      const projYM = byM * t;
      const distM = Math.hypot(txM - projXM, tyM - projYM);
      if (!best || distM < best.distM) {
        best = {
          point: { lat: a.lat + projYM / latM, lng: a.lng + projXM / lngM },
          segmentIndex: i,
          t,
          distM,
        };
      }
    }
    if (best && endGuardMeters) {
      if (best.segmentIndex === 0 && metersBetween(points[0], best.point) < endGuardMeters) {
        best = { point: points[0], segmentIndex: 0, t: 0, distM: metersBetween(points[0], target) };
      } else if (
        best.segmentIndex === points.length - 2 &&
        metersBetween(points[points.length - 1], best.point) < endGuardMeters
      ) {
        best = {
          point: points[points.length - 1],
          segmentIndex: points.length - 2,
          t: 1,
          distM: metersBetween(points[points.length - 1], target),
        };
      }
    }
    return best;
  }
  // Inserts a closestPointOnPolyline() hit as a real vertex in `points` --
  // skipped when the hit landed effectively AT an existing vertex (start
  // or end of its segment), so a connection near a road's own endpoint
  // doesn't leave a redundant near-duplicate point sitting right next to
  // it.
  // `companion` (optional): a same-length parallel array (e.g. per-point
  // widths) that gets the interpolated value at the hit's own position
  // (`t` along its segment) spliced in at the same index as the new
  // point, so a road whose width changes along its length (In Road)
  // keeps a sane width at an alley's inserted junction vertex too,
  // instead of losing track of which "zone" that new point is in.
  function insertPointOnPolyline(points, hit, companion) {
    if (hit.t <= 0.001 || hit.t >= 0.999) return { points, companion };
    const copy = points.slice();
    copy.splice(hit.segmentIndex + 1, 0, hit.point);
    let companionCopy = companion;
    // `companion` is only ever a real per-point array for roads that carry
    // varying width along their length (In Road's combined route). Alleys
    // and connectors draw at one flat width (see drawTexturedRoad's
    // insideMeters/outsideMeters calls below), so snapAlleyToRoads/callers
    // pass a single broadcast {left,right} object instead -- same shape
    // widthsForPoints already treats as "same width everywhere". That
    // object has no per-index entries to interpolate or splice, so leave
    // it untouched rather than assuming .slice() exists on it (that
    // assumption is what threw when waypoint 10's alley-to-alley connector
    // snapped onto Alley One/Rec Road: companion was OUT_ROAD_WIDTHS, a
    // plain object, not an array).
    if (Array.isArray(companion)) {
      const a = companion[hit.segmentIndex];
      const b = companion[hit.segmentIndex + 1];
      companionCopy = companion.slice();
      companionCopy.splice(hit.segmentIndex + 1, 0, {
        left: a.left + (b.left - a.left) * hit.t,
        right: a.right + (b.right - a.right) * hit.t,
      });
    }
    return { points: copy, companion: companionCopy };
  }
  // Snaps one alley's two ends onto whichever of In Road/Out Road each is
  // actually closest to (never assuming the alley's own Start is the
  // In Road end), inserting a matching vertex into that road's polyline
  // at the exact connection point so the two ribbons share a real point
  // and touch there -- same idea as the In Road <-> Out Road junction
  // snap above, just against an arbitrary point along the road instead of
  // only its endpoints. Returns the (possibly point-for-point-adjusted)
  // alley + updated in/out road polylines; callers thread the updated
  // road polylines into the next alley so multiple alleys on the same
  // road all end up as real vertices on it.
  function snapAlleyToRoads(alleyPoints, inRoadPolyline, outRoadPolyline, inRoadWidths, outRoadWidths) {
    const start = alleyPoints[0];
    const end = alleyPoints[alleyPoints.length - 1];
    const hitStartIn = closestPointOnPolyline(inRoadPolyline, start, ALLEY_JUNCTION_GUARD_METERS);
    const hitEndIn = closestPointOnPolyline(inRoadPolyline, end, ALLEY_JUNCTION_GUARD_METERS);
    const hitStartOut = closestPointOnPolyline(outRoadPolyline, start, ALLEY_JUNCTION_GUARD_METERS);
    const hitEndOut = closestPointOnPolyline(outRoadPolyline, end, ALLEY_JUNCTION_GUARD_METERS);
    // Decide each end's road independently, by its own closest valid
    // (within ALLEY_MAX_SNAP_METERS) match -- NOT by picking whichever of
    // the two whole-alley pairings has the smaller COMBINED distance
    // across both ends. That total-distance approach was tried first and
    // still picked the wrong road for a dead-end spur (Offshoot Alley):
    // even after adding the cap, it only validated the pairing the sum
    // comparison had already committed to, and for a spur the "wrong"
    // pairing's total can beat the "right" one -- a genuine ~1m match to
    // Out Road lost out because the pairing that used it also forced the
    // free end onto a ~24m match, and summed that was worse than pairing
    // the free end with a merely-bad ~38m match while dragging the real
    // ~1m match's end onto In Road at ~13m instead. Scoring each end on
    // its own merits, independently, avoids that entirely.
    function pickRoad(hitIn, hitOut) {
      const validIn = hitIn.distM <= ALLEY_MAX_SNAP_METERS;
      const validOut = hitOut.distM <= ALLEY_MAX_SNAP_METERS;
      if (!validIn && !validOut) return null;
      if (validIn && (!validOut || hitIn.distM <= hitOut.distM)) return "in";
      return "out";
    }
    let startRoad = pickRoad(hitStartIn, hitStartOut);
    let endRoad = pickRoad(hitEndIn, hitEndOut);
    // Both ends independently wanting the SAME single road isn't a
    // junction this system models (an alley connecting to one road at
    // both ends) -- keep only the closer of the two, free the other,
    // rather than double-connecting to one road and leaving the other
    // untouched entirely.
    if (startRoad && startRoad === endRoad) {
      const startDist = startRoad === "in" ? hitStartIn.distM : hitStartOut.distM;
      const endDist = endRoad === "in" ? hitEndIn.distM : hitEndOut.distM;
      if (startDist <= endDist) endRoad = null;
      else startRoad = null;
    }
    const newAlleyPoints = alleyPoints.slice();
    const startHit = startRoad === "in" ? hitStartIn : startRoad === "out" ? hitStartOut : null;
    const endHit = endRoad === "in" ? hitEndIn : endRoad === "out" ? hitEndOut : null;
    if (startHit) newAlleyPoints[0] = startHit.point;
    if (endHit) newAlleyPoints[newAlleyPoints.length - 1] = endHit.point;
    // The road's own true edge at each connection point -- BEFORE any
    // insertion below, since these hits' segmentIndex refers to the
    // original arrays. See crossSectionAtHit's own comment for why the
    // alley needs this at all (a shared vertex alone doesn't visually
    // connect two separately-built ribbons). null when that end isn't a
    // real connection -- the alley just keeps its own natural end cap
    // there, same as any other dead end.
    const startCrossSection = startHit
      ? crossSectionAtHit(startRoad === "in" ? inRoadPolyline : outRoadPolyline, startHit, startRoad === "in" ? inRoadWidths : outRoadWidths)
      : null;
    const endCrossSection = endHit
      ? crossSectionAtHit(endRoad === "in" ? inRoadPolyline : outRoadPolyline, endHit, endRoad === "in" ? inRoadWidths : outRoadWidths)
      : null;
    // startRoad and endRoad can never both be "in" or both "out" (the
    // same-road conflict above rules that out), so each road polyline
    // gets touched by at most one of the two inserts below.
    let workingInRoad = inRoadPolyline;
    let workingInWidths = inRoadWidths;
    let workingOutRoad = outRoadPolyline;
    if (startRoad === "in") {
      const ins = insertPointOnPolyline(inRoadPolyline, hitStartIn, inRoadWidths);
      workingInRoad = ins.points;
      workingInWidths = ins.companion;
    } else if (endRoad === "in") {
      const ins = insertPointOnPolyline(inRoadPolyline, hitEndIn, inRoadWidths);
      workingInRoad = ins.points;
      workingInWidths = ins.companion;
    }
    if (startRoad === "out") {
      workingOutRoad = insertPointOnPolyline(outRoadPolyline, hitStartOut).points;
    } else if (endRoad === "out") {
      workingOutRoad = insertPointOnPolyline(outRoadPolyline, hitEndOut).points;
    }
    return {
      alleyPoints: newAlleyPoints,
      startCrossSection,
      endCrossSection,
      inRoadPolyline: workingInRoad,
      inRoadWidths: workingInWidths,
      outRoadPolyline: workingOutRoad,
    };
  }
  // Waypoints 4-8 ("Alley One" through "Alley Four", plus "Offshoot
  // Alley") -- each one a short connector between In Road and Out Road,
  // same width as Out Road (no building crowds these either, per Heath).
  // Only rendered once BOTH In Road and Out Road exist, since an alley's
  // whole purpose is bridging the two -- a floating unconnected "alley"
  // wouldn't read as one.
  const ALLEY_DEFS = [
    { pathIndex: 3, label: "ALLEY ONE" },
    { pathIndex: 4, label: "ALLEY TWO" },
    { pathIndex: 5, label: "ALLEY THREE" },
    { pathIndex: 6, label: "ALLEY FOUR" },
    { pathIndex: 7, label: "OFFSHOOT ALLEY" },
    { pathIndex: 8, label: "REC ROAD" },
  ];
  // NOTE: must only match ALLEY_DEFS's own alley slots (currently 3-8) --
  // this is used both to decide which paths get drawn as an alley road
  // AND (in renderPermanentPaths) to decide which paths get their normal
  // line+badges HIDDEN. Earlier this only checked "does this pathIndex
  // have >=2 points", which matched ANY waypoint route past the last
  // defined alley too, hiding its normal display without ever drawing it
  // as a road, so it just silently disappeared from the map entirely.
  // Restricting to ALLEY_DEFS's own indices fixes that: an unrelated
  // waypoint route (the next one past whatever's defined here) falls
  // through to the normal dashed-line rendering like any other path,
  // same as before alleys existed.
  // Waypoint 10 -- a connector between two ALLEYS rather than between the
  // two main roads (per Heath: "connect waypoint 10 from Alley One to Rec
  // Road"). Same rendering machinery as ALLEY_DEFS (same width, same
  // snap-and-bridge system via snapAlleyToRoads/crossSectionAtHit), just
  // aimed at two other alleys' own ribbons instead of In Road/Out Road --
  // snapAlleyToRoads only ever cared about two polylines-with-widths, not
  // which ones specifically, so no new snapping logic is needed. No name
  // requested for this one yet, so it's unlabeled (label: "" -- see
  // drawTexturedRoad/renderFlowingRoadText, an empty string just draws no
  // letters rather than needing a null-text special case).
  const ALLEY_CONNECTOR_DEFS = [{ pathIndex: 9, label: "", fromPathIndex: 3, toPathIndex: 8 }];
  function hasAlleyRoad(rec, pathIndex) {
    return (
      currentMapId === "amazon" &&
      hasEntranceRoad(rec) &&
      hasOutRoad(rec) &&
      ALLEY_DEFS.some((def) => def.pathIndex === pathIndex) &&
      !!rec.paths[pathIndex]?.points?.length &&
      rec.paths[pathIndex].points.length >= 2
    );
  }
  // Same idea as hasAlleyRoad, for an alley-to-alley connector: also
  // requires both ends' own alleys to actually exist, since a connector
  // with nothing real to connect to can't be rendered.
  function hasConnectorRoad(rec, pathIndex) {
    const def = ALLEY_CONNECTOR_DEFS.find((d) => d.pathIndex === pathIndex);
    return (
      !!def &&
      currentMapId === "amazon" &&
      hasEntranceRoad(rec) &&
      hasOutRoad(rec) &&
      hasAlleyRoad(rec, def.fromPathIndex) &&
      hasAlleyRoad(rec, def.toPathIndex) &&
      !!rec.paths[pathIndex]?.points?.length &&
      rec.paths[pathIndex].points.length >= 2
    );
  }
  // Returns true if the overlay actually finished drawing, false if it blew
  // up partway through. Callers (renderPermanentPaths) use this to decide
  // whether it's safe to hide each path's raw dashed line in favor of this
  // overlay -- hasAlleyRoad/hasConnectorRoad only check that the DATA
  // exists, not that this function successfully drew it, so without this
  // signal a bug in here (new alley/connector geometry hitting some edge
  // case the synthetic tests didn't cover) can silently blank the whole
  // road display: the raw lines already got hidden on the data check alone,
  // then this throws before finishing any polygons. Wrapping the whole body
  // means a future bug here degrades to "still see the raw waypoint lines",
  // never a fully blank map.
  function renderEntranceRoad(rec) {
    entranceRoadFillLayer?.clearLayers();
    entranceRoadLabelsLayer?.clearLayers();
    try {

    let combined = getAmazonEntranceCombinedRoute(rec);
    let outRoadPoints = hasOutRoad(rec) ? rec.paths[2].points : null;

    // In Road's width isn't uniform along its whole length: route 1 (the
    // stretch nearest ENTRANCE) stays asymmetric to avoid the buildings
    // that crowd its left side, but route 2 has nothing crowding it --
    // Heath: it needs to be "a centered line like the others" (Out Road,
    // the alleys), same total width, just centered on the real waypoints
    // instead of pushed to one side. Before this, the whole combined
    // route drew with route 1's asymmetric width end to end, which left
    // real dirt-road pavement along route 2 sitting outside the ribbon on
    // one side and short of it on the other. combinePointSequences always
    // puts route 1 first (see its own comment), so the first N1 points of
    // `combined` are route 1 and the rest are route 2 -- this stays true
    // through every reversal option it can pick, just not through the
    // alley-insertion/dedupe steps below, which thread this array (as
    // `combinedWidths`) alongside `combined` to keep every point's width
    // lined up with the point itself.
    let combinedWidths = combined
      ? combined.map((_, i) =>
          i < rec.paths[0].points.length
            ? { left: ENTRANCE_ROAD_INSIDE_METERS, right: ENTRANCE_ROAD_OUTSIDE_METERS }
            : { left: OUT_ROAD_HALF_WIDTH_METERS, right: OUT_ROAD_HALF_WIDTH_METERS }
        )
      : null;

    // Route 2's real final waypoint and route 3's real first waypoint are
    // two independently hand-placed points -- this used to average them
    // into a shared midpoint and DELETE both real points
    // (`combined.slice(0, -1)` drops route 2's actual last point entirely).
    // That's fine when the two are a couple meters apart, but when they're
    // genuinely far apart (confirmed against a real screenshot: Setup Mode
    // showed route 2's real end sitting well off to the side of where the
    // rendered ribbon actually terminates, with the ribbon cutting straight
    // to the fabricated midpoint instead of ever reaching the real point),
    // it silently threw away real, meaningful road length. Both roads now
    // keep their own real endpoints; fillRibbonJunction below bridges
    // whatever visual gap is actually there without deleting any data.
    if (combined && outRoadPoints) {
      outRoadPoints = orientTowardPoint(outRoadPoints, combined[combined.length - 1]);
    }

    // Alleys connect into the MIDDLE of In Road/Out Road, not just their
    // ends -- each one that's present gets snapped in now (updating
    // `combined`/`outRoadPoints` with a real inserted vertex at its
    // connection point on each road) before either road is actually
    // drawn, so both roads' final ribbons already include every alley
    // junction. Processed one at a time so a later alley snaps against
    // whatever the roads look like after any earlier alley already
    // touched them.
    const OUT_ROAD_WIDTHS = { left: OUT_ROAD_HALF_WIDTH_METERS, right: OUT_ROAD_HALF_WIDTH_METERS };
    const alleysToDraw = [];
    if (combined && outRoadPoints) {
      ALLEY_DEFS.forEach((def) => {
        if (!hasAlleyRoad(rec, def.pathIndex)) return;
        const snapped = snapAlleyToRoads(
          rec.paths[def.pathIndex].points,
          combined,
          outRoadPoints,
          combinedWidths,
          OUT_ROAD_WIDTHS
        );
        combined = snapped.inRoadPolyline;
        combinedWidths = snapped.inRoadWidths;
        outRoadPoints = snapped.outRoadPolyline;
        alleysToDraw.push({
          pathIndex: def.pathIndex,
          points: snapped.alleyPoints,
          label: def.label,
          startCrossSection: snapped.startCrossSection,
          endCrossSection: snapped.endCrossSection,
        });
      });
    }

    // Connectors between two ALLEYS (waypoint 10: Alley One <-> Rec
    // Road) run as a second pass, after every main alley above has its
    // final snapped points -- snapAlleyToRoads doesn't care whether the
    // two "roads" it's snapping onto are In/Out Road or another alley's
    // own ribbon, so this reuses it directly, treating the two named
    // alleys' current entries in alleysToDraw as the two roads. Updates
    // those two entries' own points in place (same "insert a real shared
    // vertex" trick as above) so their own drawTexturedRoad call below
    // -- which hasn't run yet, drawing only happens after this whole
    // function's snapping phase -- picks up the junction.
    ALLEY_CONNECTOR_DEFS.forEach((def) => {
      if (!hasConnectorRoad(rec, def.pathIndex)) return;
      const fromEntry = alleysToDraw.find((a) => a.pathIndex === def.fromPathIndex);
      const toEntry = alleysToDraw.find((a) => a.pathIndex === def.toPathIndex);
      if (!fromEntry || !toEntry) return;
      const snapped = snapAlleyToRoads(
        rec.paths[def.pathIndex].points,
        fromEntry.points,
        toEntry.points,
        OUT_ROAD_WIDTHS,
        OUT_ROAD_WIDTHS
      );
      fromEntry.points = snapped.inRoadPolyline;
      toEntry.points = snapped.outRoadPolyline;
      alleysToDraw.push({
        pathIndex: def.pathIndex,
        points: snapped.alleyPoints,
        label: def.label,
        startCrossSection: snapped.startCrossSection,
        endCrossSection: snapped.endCrossSection,
      });
    });

    // Defensive cleanup: all the snapping above can leave two points
    // sitting almost on top of each other (an alley connecting right
    // next to where an earlier alley -- or the in/out road junction --
    // already inserted a vertex), which makes the ribbon's per-vertex
    // tangent at that spot numerically unstable. Dropping near-duplicates
    // now, after all snapping is done but before any ribbon is actually
    // built, keeps every road's own start/end intact (dedupeAdjacentPoints
    // never touches the first/last point).
    const DEDUPE_MIN_METERS = 0.5;
    if (combined) {
      const deduped = dedupeAdjacentPoints(combined, DEDUPE_MIN_METERS, combinedWidths);
      combined = deduped.points;
      combinedWidths = deduped.companion;
    }
    if (outRoadPoints) outRoadPoints = dedupeAdjacentPoints(outRoadPoints, DEDUPE_MIN_METERS);
    alleysToDraw.forEach((alley) => {
      alley.points = dedupeAdjacentPoints(alley.points, DEDUPE_MIN_METERS);
    });

    if (combined) {
      // "ENTRANCE" belongs at route 1's free end -- whichever endpoint of
      // route 1 did NOT get used to join onto route 2. combinePointSequences
      // always puts route 1 first in `combined` (reversed if needed so its
      // free end leads), so centerline[0] IS that free end. Nudged west
      // ("left") and further north per Heath's feedback on earlier rounds.
      // Alley insertions above only ever land strictly BETWEEN existing
      // points, never replacing index 0, so this stays the true free end
      // regardless of how many alleys touched this road.
      drawTexturedRoad(combined, {
        widths: combinedWidths,
        labelText: "IN ROAD",
        startLabelText: "ENTRANCE",
        startLabelOffset: [-4, 14],
        fillLayer: entranceRoadFillLayer,
        labelsLayer: entranceRoadLabelsLayer,
      });
    }

    if (outRoadPoints) {
      drawTexturedRoad(outRoadPoints, {
        insideMeters: OUT_ROAD_HALF_WIDTH_METERS,
        outsideMeters: OUT_ROAD_HALF_WIDTH_METERS,
        labelText: "OUT ROAD",
        startLabelText: null,
        fillLayer: entranceRoadFillLayer,
        labelsLayer: entranceRoadLabelsLayer,
      });
    }

    alleysToDraw.forEach((alley) => {
      drawTexturedRoad(alley.points, {
        insideMeters: OUT_ROAD_HALF_WIDTH_METERS,
        outsideMeters: OUT_ROAD_HALF_WIDTH_METERS,
        labelText: alley.label,
        labelFractions: [0.5],
        startLabelText: null,
        fillLayer: entranceRoadFillLayer,
        labelsLayer: entranceRoadLabelsLayer,
      });
      // Bridge the alley's own two end caps onto the road's real surface
      // at each connection point. Inserting a shared vertex into the
      // road's polyline (snapAlleyToRoads above) keeps the ROAD itself
      // solid straight through that point, but the alley's own ribbon is
      // a completely separate set of polygons ending in its own flat cap
      // at that same coordinate, angled however the alley happens to run
      // -- not the road's local cross-section. Left untouched, the two
      // ribbons only ever meet at a single point, leaving a real
      // triangular gap. See crossSectionAtHit's comment for the full
      // reasoning.
      // A dead-end spur (e.g. Offshoot Alley) only got ONE end snapped --
      // see ALLEY_MAX_SNAP_METERS above -- so the other cross-section is
      // null here. Nothing to bridge there: that end was never forced
      // onto a road, so it just keeps its own natural flat end cap,
      // exactly like any other dead end.
      const alleyWidths = { left: OUT_ROAD_HALF_WIDTH_METERS, right: OUT_ROAD_HALF_WIDTH_METERS };
      if (alley.startCrossSection) {
        const alleyStartEdge = ribbonEdgeAtEnd(alley.points, true, alleyWidths);
        fillRibbonJunction(alleyStartEdge, alley.startCrossSection, entranceRoadFillLayer);
      }
      if (alley.endCrossSection) {
        const alleyEndEdge = ribbonEdgeAtEnd(alley.points, false, alleyWidths);
        fillRibbonJunction(alleyEndEdge, alley.endCrossSection, entranceRoadFillLayer);
      }
    });

    // In Road's real far end and Out Road's real near end are two
    // independent points that may sit a real gap apart (see above -- no
    // longer forced together into a shared midpoint). Bridge that gap
    // using each road's own real end cap, same wedge-filling idea as
    // buildRibbonPieces' interior joints, just applied across two
    // separate roads instead of within one.
    if (combined && outRoadPoints) {
      const entranceEdge = ribbonEdgeAtEnd(combined, false, combinedWidths);
      const outRoadEdge = ribbonEdgeAtEnd(outRoadPoints, true, { left: OUT_ROAD_HALF_WIDTH_METERS, right: OUT_ROAD_HALF_WIDTH_METERS });
      fillRibbonJunction(entranceEdge, outRoadEdge, entranceRoadFillLayer);
    }
    return true;
    } catch (err) {
      console.error(
        "[DriversDough] renderEntranceRoad failed -- showing raw waypoint lines instead of the road overlay. Please send this error to Heath's dev:",
        err
      );
      entranceRoadFillLayer?.clearLayers();
      entranceRoadLabelsLayer?.clearLayers();
      return false;
    }
  }

  function renderPermanentPaths() {
    if (!permanentPathsLayer) return;
    permanentPathsLayer.clearLayers();
    const rec = getMapRecord(currentMapId);
    const scale = scaleForZoom(mapLeaflet);
    const pathsInteractive = setupModeOn;
    const hideAsEntranceRoad = hasEntranceRoad(rec);
    const hideAsOutRoad = hasOutRoad(rec);
    // Render the road/alley overlay FIRST, before deciding whether to hide
    // any path's raw dashed line below -- hasAlleyRoad/hasConnectorRoad
    // only confirm the DATA exists, not that the overlay actually drew.
    // Gating every hide decision on the real outcome means a bug in the
    // overlay renderer falls back to raw waypoint lines instead of a blank
    // map (see renderEntranceRoad's own comment).
    const entranceRoadOk = renderEntranceRoad(rec);
    rec.paths.forEach((path, pathIndex) => {
      if (editingPathId === path.id) return;
      // Routes 1 and 2 are the entrance road, route 3 is the out road,
      // and 4-8 are the alleys -- their dirt-road overlays (below) are
      // their visual now, so normally skip their own colored line + S/E
      // badges entirely rather than drawing both on top of each other.
      //
      // BUT NOT in Setup Mode: this used to hide them unconditionally,
      // which meant once a path became part of a road overlay there was
      // no longer any way to see its real pins OR click into editing it
      // ever again -- the click target that starts an edit was exactly
      // what got hidden. Setup Mode is specifically the admin view for
      // inspecting/managing the real saved data, so it always shows the
      // real pins for every path, road-covered or not.
      if (!pathsInteractive && entranceRoadOk) {
        if (hideAsEntranceRoad && pathIndex < 2) return;
        if (hideAsOutRoad && pathIndex === 2) return;
        if (hasAlleyRoad(rec, pathIndex) || hasConnectorRoad(rec, pathIndex)) return;
      }
      const pathNumber = pathIndex + 1;
      const pathColor = pathColorFor(pathIndex);
      const latlngs = path.points.map((p) => [p.lat, p.lng]);
      const line = L.polyline(latlngs, {
        color: pathColor,
        weight: 4,
        dashArray: "8 8",
        opacity: 0.9,
        interactive: pathsInteractive,
      });
      if (pathsInteractive) {
        line.on("click", (e) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          startEditingPath(path);
        });
      }
      permanentPathsLayer.addLayer(line);
      path.points.forEach((p, i) => {
        const kind = i === 0 ? "start" : i === path.points.length - 1 ? "end" : "mid";
        const marker = L.marker([p.lat, p.lng], {
          icon: makeSavedPathPointIcon(kind, pathNumber, pathColor, scale),
          interactive: pathsInteractive,
          keyboard: false,
        });
        if (pathsInteractive) {
          marker.on("click", (e) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            startEditingPath(path);
          });
        }
        permanentPathsLayer.addLayer(marker);
      });
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
    // Paths: a handful of permanent paths at most, so a full re-render on
    // zoom is simpler than patching each marker in place like pins do.
    renderPermanentPaths();
    if (pendingPathMarkers.length) {
      pendingPathPoints.forEach((p, i) => {
        const kind = i === 0 ? "start" : i === pendingPathPoints.length - 1 ? "end" : "mid";
        pendingPathMarkers[i]?.setIcon(makePathPointIcon(kind, scale, true));
        forceReenableDragging(pendingPathMarkers[i]);
      });
    }
  }

  // === Setup Mode ===
  function readyMessage() {
    if (!currentMapId) return "";
    const rec = getMapRecord(currentMapId);
    return (
      "Tap the map to drop pin #" +
      lowestAvailableNumber(rec) +
      ", or tap a pin/waypoint path to edit it. Use + Waypoint below to mark a road."
    );
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
    if (setupConfirmBtn) {
      setupConfirmBtn.textContent = "Confirm";
      // Waypoints use .disabled as a persistent "fewer than 2 points" gate
      // (see updatePathSetupUI), unlike pins which only ever disable it
      // transiently during a save request -- reset it explicitly here so
      // a leftover disabled state from a waypoint chain can't stick
      // around once you're back to placing pins.
      setupConfirmBtn.disabled = false;
    }
    renderPermanentPins();
  }

  function setSetupMode(on) {
    setupModeOn = on;
    setupToggleBtn?.classList.toggle("is-active", on);
    setupBar?.classList.toggle("hide", !on);
    exitPendingEditOrPlace();
    exitPendingPath();
    crosshairEl?.classList.toggle("hide", !on);
    // The search bar isn't needed while placing pins/waypoints, and just
    // eats vertical space above an already-cramped setup bar.
    searchBar?.classList.toggle("hide", on);
    if (on && setupInstructions) setupInstructions.textContent = readyMessage();
  }
  setupToggleBtn?.addEventListener("click", () => {
    const session = window.DD.auth && window.DD.auth.getSession();
    if (!session || !session.isAdmin) return; // button is hidden for non-admins; this is belt-and-suspenders
    setSetupMode(!setupModeOn);
  });
  setupExitBtn?.addEventListener("click", () => setSetupMode(false));

  // Drops a new waypoint at the current map center -- pan the map, then
  // press the button again for the next point. This (not a map tap) is
  // how waypoints get placed, so a plain tap can always mean "place a
  // pin" without the two colliding.
  addWaypointBtn?.addEventListener("click", () => {
    if (!setupModeOn || !currentMapId || !mapLeaflet || pendingMarker) return;
    const center = mapLeaflet.getCenter();
    pendingPathPoints.push({ lat: center.lat, lng: center.lng });
    renderPendingPath();
    updatePathSetupUI();
  });

  // Pulls one existing permanent pin out for editing: draggable position,
  // adjustable direction/number, plus a Delete option -- unlike a brand
  // new drop, saving here updates that SAME pin in place and never
  // touches the auto-numbering sequence.
  function startEditingPin(pin) {
    if (pendingMarker || pendingPathPoints.length || !mapLeaflet) return; // already placing/editing something else
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
    // Don't let a stray tap discard an in-progress waypoint chain -- with
    // waypoints placed via the button now, a tap during placement should
    // just be a no-op rather than silently starting a new pin.
    if (pendingPathPoints.length) return;
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

  // The map_pins table stores the house number as a real integer (not
  // free text), so this both validates and converts -- "5" is fine,
  // "5a" or "" is not.
  function parsePinNumber(raw) {
    const trimmed = (raw || "").trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return parseInt(trimmed, 10);
  }

  async function confirmPendingPin() {
    if (!pendingMarker || !currentMapId) return;
    const numberInt = parsePinNumber(setupNumberInput?.value);
    if (numberInt === null) {
      if (setupInstructions) setupInstructions.textContent = "Enter a whole number before confirming.";
      return;
    }
    const ll = pendingMarker.getLatLng();
    const mapId = currentMapId;

    if (setupConfirmBtn) setupConfirmBtn.disabled = true;
    const result = editingPinId
      ? await updatePin(editingPinId, numberInt, ll.lat, ll.lng, pendingRotation)
      : await createPin(mapId, numberInt, ll.lat, ll.lng, pendingRotation);
    if (setupConfirmBtn) setupConfirmBtn.disabled = false;

    if (!result || !result.ok) {
      showServerError(result && result.error);
      return;
    }

    // Re-fetch so the pin just created/edited (and its server-assigned
    // id, for a new one) is what's actually on screen -- same
    // refresh-after-mutation pattern forum.js uses.
    await refreshPinsForMap(mapId);
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  function cancelPendingPin() {
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  async function deletePendingPin() {
    if (!editingPinId || !currentMapId) return;
    const mapId = currentMapId;
    const pinId = editingPinId;

    if (setupDeleteBtn) setupDeleteBtn.disabled = true;
    const result = await deletePin(pinId);
    if (setupDeleteBtn) setupDeleteBtn.disabled = false;

    if (!result || !result.ok) {
      showServerError(result && result.error);
      return;
    }

    await refreshPinsForMap(mapId);
    exitPendingEditOrPlace();
    if (setupInstructions) setupInstructions.textContent = "Pin deleted. " + readyMessage();
  }
  // The Confirm/Cancel/Delete row is shared between the Pins and Tree
  // Line tools -- dispatch by whichever placement mode is currently
  // active rather than duplicating the buttons.
  // Pins and waypoints both flow through the same Confirm/Cancel/Delete
  // row -- since there's no exclusive mode anymore, dispatch on whichever
  // one is actually pending, not on a mode flag.
  setupConfirmBtn?.addEventListener("click", () => {
    if (pendingPathPoints.length) confirmPendingPath();
    else confirmPendingPin();
  });
  setupCancelBtn?.addEventListener("click", () => {
    if (pendingPathPoints.length) cancelPendingPath();
    else cancelPendingPin();
  });
  setupDeleteBtn?.addEventListener("click", () => {
    if (editingPathId) deletePendingPathSelection();
    else deletePendingPin();
  });

  // === Waypoint paths (Setup Mode) ===
  // Press + Waypoint to drop points in order at the map's center -- first
  // is the Start, last is the End, anything in between is a waypoint.
  // Confirm saves the whole path at once (unlike pins, which save one at
  // a time). Tapping an existing path pulls it back into this same
  // pending state for editing: drag any point, press + Waypoint to add
  // more to the end, Undo to remove the last one, or Delete.
  function renderPendingPath() {
    if (!mapLeaflet) return;
    pendingPathMarkers.forEach((m) => mapLeaflet.removeLayer(m));
    pendingPathMarkers = [];

    const latlngs = pendingPathPoints.map((p) => [p.lat, p.lng]);
    if (!pendingPathLine) {
      pendingPathLine = L.polyline(latlngs, {
        color: "#55a6d9",
        weight: 4,
        dashArray: "8 8",
        opacity: 0.95,
        interactive: false,
      }).addTo(mapLeaflet);
    } else {
      pendingPathLine.setLatLngs(latlngs);
    }

    const scale = scaleForZoom(mapLeaflet);
    pendingPathPoints.forEach((p, i) => {
      const kind = i === 0 ? "start" : i === pendingPathPoints.length - 1 ? "end" : "mid";
      const marker = L.marker([p.lat, p.lng], {
        icon: makePathPointIcon(kind, scale, true),
        draggable: true,
        keyboard: false,
      }).addTo(mapLeaflet);
      // Dragging only updates that point's position and the line -- it
      // never changes point count, so the markers themselves don't need
      // rebuilding here (that would fight with the drag gesture anyway).
      marker.on("dragend", (ev) => {
        const ll = ev.target.getLatLng();
        pendingPathPoints[i] = { lat: ll.lat, lng: ll.lng };
        if (pendingPathLine) pendingPathLine.setLatLngs(pendingPathPoints.map((pt) => [pt.lat, pt.lng]));
      });
      pendingPathMarkers.push(marker);
    });
  }
  function updatePathSetupUI() {
    setupFieldsRow?.classList.add("hide"); // House #/Direction fields are pin-only
    const n = pendingPathPoints.length;
    const isEditing = !!editingPathId;

    if (setupInstructions) {
      if (n === 0) {
        setupInstructions.textContent = "Pan the map so the Start point is centered, then press + Waypoint.";
      } else if (n === 1) {
        setupInstructions.textContent = "Pan the map, then press + Waypoint again to add the End point.";
      } else if (isEditing) {
        setupInstructions.textContent = "Drag any point to adjust, press + Waypoint to add more, or Save.";
      } else {
        setupInstructions.textContent = "Press + Waypoint to add more points, drag any point to adjust, then Confirm.";
      }
    }

    setupActionsRow?.classList.toggle("hide", n === 0 && !isEditing);
    setupPathUndoBtn?.classList.toggle("hide", n === 0 || (isEditing && n <= 2));
    setupDeleteBtn?.classList.toggle("hide", !isEditing);
    if (setupConfirmBtn) {
      // Only disable for the "started a chain but only have 1 point so
      // far" state -- n === 0 means no chain is pending at all (Confirm
      // is shared with the pin flow, which needs it enabled by default,
      // not stuck disabled from a waypoint chain that's since ended).
      setupConfirmBtn.disabled = n > 0 && n < 2;
      setupConfirmBtn.textContent = isEditing ? "Save" : "Confirm";
    }
  }
  setupPathUndoBtn?.addEventListener("click", () => {
    if (!pendingPathPoints.length) return;
    if (editingPathId && pendingPathPoints.length <= 2) return; // keep at least Start+End while editing
    pendingPathPoints.pop();
    renderPendingPath();
    updatePathSetupUI();
  });

  // Tears down whatever path is currently pending (new or being edited)
  // and re-renders the permanent layer -- shared by Finish/Save, Cancel,
  // Delete, and Setup Mode toggling/switching, same role
  // exitPendingEditOrPlace plays for pins.
  function exitPendingPath() {
    pendingPathMarkers.forEach((m) => mapLeaflet?.removeLayer(m));
    pendingPathMarkers = [];
    if (pendingPathLine) {
      mapLeaflet?.removeLayer(pendingPathLine);
      pendingPathLine = null;
    }
    pendingPathPoints = [];
    editingPathId = null;
    setupActionsRow?.classList.add("hide");
    setupPathUndoBtn?.classList.add("hide");
    setupDeleteBtn?.classList.add("hide");
    if (setupConfirmBtn) {
      setupConfirmBtn.textContent = "Confirm";
      // Belt-and-suspenders reset, same reasoning as
      // exitPendingEditOrPlace's: Confirm is shared with the pin flow, so
      // a stale disabled state from a waypoint chain must never survive
      // past the chain actually ending.
      setupConfirmBtn.disabled = false;
    }
    renderPermanentPaths();
  }
  // Pulls one existing permanent path out for editing -- same idea as
  // startEditingPin, just for an ordered list of points instead of one.
  function startEditingPath(path) {
    if (pendingPathPoints.length || pendingMarker) return; // already placing/editing something else
    editingPathId = path.id;
    pendingPathPoints = path.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    renderPermanentPaths(); // skips this path now that editingPathId is set
    renderPendingPath();
    updatePathSetupUI();
  }

  async function confirmPendingPath() {
    if (pendingPathPoints.length < 2 || !currentMapId) return;
    const mapId = currentMapId;
    const points = pendingPathPoints.map((p) => ({ lat: p.lat, lng: p.lng }));

    if (setupConfirmBtn) setupConfirmBtn.disabled = true;
    const result = editingPathId ? await updatePath(editingPathId, points) : await createPath(mapId, points);
    if (setupConfirmBtn) setupConfirmBtn.disabled = false;

    if (!result || !result.ok) {
      showServerError(result && result.error);
      return;
    }

    await refreshPathsForMap(mapId);
    exitPendingPath();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  function cancelPendingPath() {
    exitPendingPath();
    if (setupInstructions) setupInstructions.textContent = readyMessage();
  }
  async function deletePendingPathSelection() {
    if (!editingPathId || !currentMapId) return;
    const mapId = currentMapId;
    const pathId = editingPathId;

    if (setupDeleteBtn) setupDeleteBtn.disabled = true;
    const result = await deletePath(pathId);
    if (setupDeleteBtn) setupDeleteBtn.disabled = false;

    if (!result || !result.ok) {
      showServerError(result && result.error);
      return;
    }

    await refreshPathsForMap(mapId);
    exitPendingPath();
    updatePathSetupUI();
  }

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
