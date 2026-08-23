// js/forum.js
// The Pit Stop — driver forum (hamburger menu label: "Forum"). Four fixed
// boards: Shift Swap (structured swap requests), General Chat, App Issues,
// Feature Requests (plain discussion threads + replies).
//
// Talks to the real Supabase backend now (forum_threads/forum_replies
// tables + the dd_create_thread/dd_add_reply/dd_toggle_swap_status/
// dd_delete_thread/dd_delete_reply functions from supabase_setup.sql).
// Posts made here are visible to every driver, not just the phone that
// made them.
//
// Data-flow pattern: getBoardThreads()/getThread() stay SYNCHRONOUS (the
// rendering code below expects an instant answer, same as it always
// has) by reading from an in-memory cache (threadsCache) instead of
// hitting the network on every render. That cache gets refreshed with a
// real fetch from Supabase right before anything reads it fresh: when
// the Forum is opened, and after any post/reply/delete/toggle. This is
// the same "cache + refresh at the right moments" approach auth.js uses
// for the login session.
(function () {
  window.DD = window.DD || {};

  const sb = window.DD.supabaseClient;

  const BOARDS = [
    { id: "shift-swap", name: "Shift Swap", description: "Looking to trade or cover a shift?", type: "swap" },
    { id: "general-chat", name: "General Chat", description: "Anything driver-related.", type: "discussion" },
    { id: "app-issues", name: "App Issues", description: "Something broken or confusing?", type: "discussion" },
    { id: "feature-requests", name: "Feature Requests", description: "Ideas for Driver's Dough.", type: "discussion" },
    { id: "codes", name: "Codes", description: "New codes, or codes that stopped working.", type: "discussion" },
  ];

  function boardById(id) {
    return BOARDS.find((b) => b.id === id) || null;
  }

  function getCurrentUser() {
    const session = window.DD.auth && window.DD.auth.getSession();
    return session ? { id: session.id, name: session.name } : { id: null, name: "You" };
  }
  function getToken() {
    return window.DD.auth && window.DD.auth.getToken();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatRelativeTime(ms) {
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // --- Data: cache + refresh ----------------------------------------------
  let threadsCache = [];

  function mapReplyRow(row) {
    return {
      id: row.id,
      body: row.body,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: new Date(row.created_at).getTime(),
    };
  }
  function mapThreadRow(row) {
    const replies = (row.forum_replies || []).map(mapReplyRow).sort((a, b) => a.createdAt - b.createdAt);
    return {
      id: row.id,
      boardId: row.board_id,
      type: row.type,
      title: row.title,
      body: row.body,
      date: row.swap_date,
      shift: row.swap_shift,
      note: row.note,
      status: row.status,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: new Date(row.created_at).getTime(),
      replies,
    };
  }

  // Refetches every thread (with its replies nested in, in one request)
  // from Supabase. There are only four boards for a small crew of
  // drivers, so pulling everything at once is simpler than fetching
  // per-board and plenty fast enough.
  async function refreshCache() {
    try {
      const { data, error } = await sb.from("forum_threads").select("*, forum_replies(*)").order("created_at", { ascending: false });
      if (error || !data) return false;
      threadsCache = data.map(mapThreadRow);
      return true;
    } catch (err) {
      return false;
    }
  }

  // --- Data operations ------------------------------------------------
  function getBoardThreads(boardId) {
    const threads = threadsCache.filter((t) => t.boardId === boardId);
    const board = boardById(boardId);
    if (board && board.type === "swap") {
      // Open requests first (soonest shift date first), filled ones after.
      return threads.slice().sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        if (a.status === "open") return (a.date || "").localeCompare(b.date || "");
        return b.createdAt - a.createdAt;
      });
    }
    return threads.slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  function getThread(id) {
    return threadsCache.find((t) => t.id === id) || null;
  }

  async function createThread(boardId, data) {
    const board = boardById(boardId);
    const { data: result, error } = await sb.rpc("dd_create_thread", {
      p_token: getToken(),
      p_board_id: boardId,
      p_type: board ? board.type : "discussion",
      p_title: data.title ?? null,
      p_body: data.body ?? null,
      p_swap_date: data.date ?? null,
      p_swap_shift: data.shift ?? null,
      p_note: data.note ?? null,
    });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function addReply(threadId, body) {
    const { data: result, error } = await sb.rpc("dd_add_reply", { p_token: getToken(), p_thread_id: threadId, p_body: body });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function toggleSwapStatus(threadId) {
    const { data: result, error } = await sb.rpc("dd_toggle_swap_status", { p_token: getToken(), p_thread_id: threadId });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function deleteThread(threadId) {
    const { data: result, error } = await sb.rpc("dd_delete_thread", { p_token: getToken(), p_thread_id: threadId });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }
  async function deleteReply(threadId, replyId) {
    const { data: result, error } = await sb.rpc("dd_delete_reply", { p_token: getToken(), p_reply_id: replyId });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    return result;
  }

  window.DD.forum = { BOARDS, getCurrentUser, getBoardThreads, getThread, createThread, addReply, toggleSwapStatus, deleteThread, deleteReply };

  // --- UI ------------------------------------------------------------
  const menuBtn = document.getElementById("hamburgerBtn");
  const menuForum = document.getElementById("menuForum");
  const overlay = document.getElementById("dd-forum-overlay");
  const backBtn = document.getElementById("dd-forum-back");
  const titleEl = document.getElementById("dd-forum-title");
  const bodyEl = document.getElementById("dd-forum-body");
  const doneBtn = document.getElementById("dd-forum-done");

  function closeHamburgerMenuLocal() {
    const menu = document.getElementById("hamburgerMenu");
    menu?.classList.remove("is-open");
    menu?.setAttribute("aria-hidden", "true");
    menuBtn?.setAttribute("aria-expanded", "false");
  }

  function showLoading() {
    if (bodyEl) bodyEl.innerHTML = '<p class="dd-calc-waiting">Loading…</p>';
  }
  function showServerError(error) {
    window.DD.modal?.show({
      top: "COULDN'T DO THAT",
      bottom: (error || "Something went wrong. Try again.").toUpperCase(),
      okText: "OK",
    });
  }

  let view = "boards"; // "boards" | "board" | "thread"
  let activeBoardId = null;
  let activeThreadId = null;
  let showNewForm = false;

  async function openForum() {
    closeHamburgerMenuLocal();
    view = "boards";
    activeBoardId = null;
    activeThreadId = null;
    showNewForm = false;
    overlay?.classList.add("is-open");
    overlay?.setAttribute("aria-hidden", "false");
    showLoading();
    await refreshCache();
    render();
  }
  function closeForum() {
    overlay?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
  }
  menuForum?.addEventListener("click", openForum);
  doneBtn?.addEventListener("click", closeForum);

  backBtn?.addEventListener("click", () => {
    if (view === "thread") {
      view = "board";
      activeThreadId = null;
      render();
    } else if (view === "board") {
      view = "boards";
      activeBoardId = null;
      showNewForm = false;
      render();
    }
  });

  function render() {
    if (view === "boards") renderBoards();
    else if (view === "board") renderBoard();
    else if (view === "thread") renderThread();
  }

  // === Boards list ===
  function renderBoards() {
    if (titleEl) titleEl.textContent = "The Pit Stop";
    backBtn?.classList.add("hide");
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "dd-forum-scroll";
    BOARDS.forEach((board) => {
      const threads = getBoardThreads(board.id);
      const item = document.createElement("div");
      item.className = "dd-forum-board-item";
      const left = document.createElement("div");
      const name = document.createElement("span");
      name.className = "dd-forum-board-name";
      name.textContent = board.name;
      const desc = document.createElement("span");
      desc.className = "dd-forum-board-desc";
      desc.textContent = board.description;
      left.appendChild(name);
      left.appendChild(desc);
      const count = document.createElement("span");
      count.className = "dd-forum-board-count";
      if (board.type === "swap") {
        const openCount = threads.filter((t) => t.status === "open").length;
        count.textContent = openCount ? openCount + " open" : "—";
      } else {
        count.textContent = threads.length ? threads.length + (threads.length === 1 ? " thread" : " threads") : "—";
      }
      item.appendChild(left);
      item.appendChild(count);
      item.addEventListener("click", () => {
        view = "board";
        activeBoardId = board.id;
        showNewForm = false;
        render();
      });
      wrap.appendChild(item);
    });
    bodyEl.appendChild(wrap);
  }

  // === Board (thread list) ===
  function renderBoard() {
    const board = boardById(activeBoardId);
    if (!board) {
      view = "boards";
      render();
      return;
    }
    if (titleEl) titleEl.textContent = board.name;
    backBtn?.classList.remove("hide");
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "btn-primary dd-forum-new-btn";
    newBtn.textContent = showNewForm ? "Cancel" : board.type === "swap" ? "+ New Swap Request" : "+ New Thread";
    newBtn.addEventListener("click", () => {
      showNewForm = !showNewForm;
      renderBoard();
    });
    bodyEl.appendChild(newBtn);

    if (showNewForm) bodyEl.appendChild(buildNewThreadForm(board));

    const wrap = document.createElement("div");
    wrap.className = "dd-forum-scroll";
    const threads = getBoardThreads(board.id);
    if (!threads.length) {
      const empty = document.createElement("p");
      empty.className = "dd-calc-waiting";
      empty.textContent = "Waiting for Data";
      wrap.appendChild(empty);
    } else {
      threads.forEach((thread) => wrap.appendChild(buildThreadListItem(board, thread)));
    }
    bodyEl.appendChild(wrap);
  }

  function buildThreadListItem(board, thread) {
    const item = document.createElement("div");
    item.className = "dd-forum-thread-item";

    const head = document.createElement("div");
    head.className = "dd-forum-thread-head";
    const title = document.createElement("span");
    title.className = "dd-forum-thread-title";
    title.textContent = board.type === "swap" ? formatSwapHeadline(thread) : thread.title;
    head.appendChild(title);
    if (board.type === "swap") {
      const badge = document.createElement("span");
      badge.className = "dd-forum-badge " + (thread.status === "open" ? "is-open" : "is-filled");
      badge.textContent = thread.status === "open" ? "Open" : "Filled";
      head.appendChild(badge);
    }
    item.appendChild(head);

    if (board.type === "swap" && thread.note) {
      const note = document.createElement("div");
      note.className = "dd-forum-thread-note";
      note.textContent = thread.note;
      item.appendChild(note);
    } else if (board.type !== "swap" && thread.body) {
      const note = document.createElement("div");
      note.className = "dd-forum-thread-note";
      note.textContent = thread.body;
      item.appendChild(note);
    }

    const meta = document.createElement("div");
    meta.className = "dd-forum-meta";
    const replyCount = thread.replies.length;
    meta.textContent =
      thread.authorName + " · " + formatRelativeTime(thread.createdAt) + " · " + replyCount + (replyCount === 1 ? " reply" : " replies");
    item.appendChild(meta);

    item.addEventListener("click", () => {
      view = "thread";
      activeThreadId = thread.id;
      render();
    });
    return item;
  }

  function formatSwapHeadline(thread) {
    const parts = [];
    if (thread.date) parts.push(formatDateNice(thread.date));
    if (thread.shift) parts.push(thread.shift);
    return parts.length ? parts.join(" — ") : "Shift Swap Request";
  }
  function formatDateNice(dateStr) {
    // dateStr is "YYYY-MM-DD" from <input type="date">; parse as LOCAL, not
    // UTC, or it can print as the day before.
    const [y, m, d] = (dateStr || "").split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function buildNewThreadForm(board) {
    const form = document.createElement("div");
    form.className = "dd-forum-form";
    const msg = document.createElement("div");
    msg.className = "dd-forum-form-msg hide";
    form.appendChild(msg);

    let fields;
    if (board.type === "swap") {
      fields = buildSwapFields();
    } else {
      fields = buildDiscussionFields();
    }
    form.appendChild(fields.el);

    const actions = document.createElement("div");
    actions.className = "dd-forum-form-actions";
    const postBtn = document.createElement("button");
    postBtn.type = "button";
    postBtn.className = "btn-primary";
    postBtn.textContent = "Post";
    const cancelBtn2 = document.createElement("button");
    cancelBtn2.type = "button";
    cancelBtn2.className = "btn-secondary";
    cancelBtn2.textContent = "Cancel";
    cancelBtn2.addEventListener("click", () => {
      showNewForm = false;
      renderBoard();
    });
    postBtn.addEventListener("click", async () => {
      const data = fields.getData();
      if (!data) {
        msg.textContent = fields.errorMsg;
        msg.classList.remove("hide");
        return;
      }
      postBtn.disabled = true;
      const result = await createThread(board.id, data);
      postBtn.disabled = false;
      if (!result || !result.ok) {
        msg.textContent = (result && result.error) || "Couldn't post that. Try again.";
        msg.classList.remove("hide");
        return;
      }
      showNewForm = false;
      showLoading();
      await refreshCache();
      renderBoard();
    });
    actions.appendChild(cancelBtn2);
    actions.appendChild(postBtn);
    form.appendChild(actions);
    return form;
  }

  function buildDiscussionFields() {
    const el = document.createElement("div");
    const titleField = document.createElement("div");
    titleField.className = "dd-forum-field";
    titleField.innerHTML = '<label for="dd-forum-new-title">Title</label>';
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = "dd-forum-new-title";
    titleInput.autocomplete = "off";
    titleField.appendChild(titleInput);

    const bodyField = document.createElement("div");
    bodyField.className = "dd-forum-field";
    bodyField.innerHTML = '<label for="dd-forum-new-body">Details</label>';
    const bodyInput = document.createElement("textarea");
    bodyInput.id = "dd-forum-new-body";
    bodyInput.rows = 4;
    bodyField.appendChild(bodyInput);

    el.appendChild(titleField);
    el.appendChild(bodyField);

    return {
      el,
      errorMsg: "Enter a title before posting.",
      getData() {
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();
        if (!title) return null;
        return { title, body };
      },
    };
  }

  function buildSwapFields() {
    const el = document.createElement("div");
    const dateField = document.createElement("div");
    dateField.className = "dd-forum-field";
    dateField.innerHTML = '<label for="dd-forum-new-date">Date</label>';
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.id = "dd-forum-new-date";
    dateField.appendChild(dateInput);

    const shiftField = document.createElement("div");
    shiftField.className = "dd-forum-field";
    shiftField.innerHTML = '<label for="dd-forum-new-shift">Shift</label>';
    const shiftInput = document.createElement("input");
    shiftInput.type = "text";
    shiftInput.id = "dd-forum-new-shift";
    shiftInput.placeholder = "e.g. 5pm–10pm";
    shiftInput.autocomplete = "off";
    shiftField.appendChild(shiftInput);

    const noteField = document.createElement("div");
    noteField.className = "dd-forum-field";
    noteField.innerHTML = '<label for="dd-forum-new-note">Note (optional)</label>';
    const noteInput = document.createElement("textarea");
    noteInput.id = "dd-forum-new-note";
    noteInput.rows = 3;
    noteField.appendChild(noteInput);

    el.appendChild(dateField);
    el.appendChild(shiftField);
    el.appendChild(noteField);

    return {
      el,
      errorMsg: "Enter a date and shift before posting.",
      getData() {
        const date = dateInput.value;
        const shift = shiftInput.value.trim();
        const note = noteInput.value.trim();
        if (!date || !shift) return null;
        return { date, shift, note, status: "open" };
      },
    };
  }

  // === Thread detail ===
  function renderThread() {
    const thread = getThread(activeThreadId);
    if (!thread) {
      view = "board";
      render();
      return;
    }
    const board = boardById(thread.boardId);
    if (titleEl) titleEl.textContent = board ? board.name : "Thread";
    backBtn?.classList.remove("hide");
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "dd-forum-scroll";

    const currentUser = getCurrentUser();
    const isOwn = thread.authorId === currentUser.id;

    const post = document.createElement("div");
    post.className = "dd-forum-post";

    if (board && board.type === "swap") {
      const badge = document.createElement("span");
      badge.className = "dd-forum-badge " + (thread.status === "open" ? "is-open" : "is-filled");
      badge.textContent = thread.status === "open" ? "Open" : "Filled";
      post.appendChild(badge);

      const fields = document.createElement("div");
      fields.className = "dd-forum-swap-fields";
      fields.style.marginTop = "0.5rem";
      fields.innerHTML =
        '<span class="dd-forum-swap-label">Date</span><span>' + escapeHtml(formatDateNice(thread.date)) + "</span>" +
        '<span class="dd-forum-swap-label">Shift</span><span>' + escapeHtml(thread.shift) + "</span>";
      post.appendChild(fields);

      if (thread.note) {
        const body = document.createElement("div");
        body.className = "dd-forum-post-body";
        body.textContent = thread.note;
        post.appendChild(body);
      }
    } else {
      const title = document.createElement("div");
      title.className = "dd-forum-post-title";
      title.textContent = thread.title;
      post.appendChild(title);
      const body = document.createElement("div");
      body.className = "dd-forum-post-body";
      body.textContent = thread.body || "";
      post.appendChild(body);
    }

    const meta = document.createElement("div");
    meta.className = "dd-forum-meta";
    meta.style.marginTop = "0.5rem";
    meta.textContent = thread.authorName + " · " + formatRelativeTime(thread.createdAt);
    post.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "dd-forum-post-actions";
    if (board && board.type === "swap") {
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn-secondary";
      toggleBtn.textContent = thread.status === "open" ? "Mark Filled" : "Reopen";
      toggleBtn.addEventListener("click", async () => {
        toggleBtn.disabled = true;
        const result = await toggleSwapStatus(thread.id);
        if (!result || !result.ok) {
          toggleBtn.disabled = false;
          showServerError(result && result.error);
          return;
        }
        await refreshCache();
        renderThread();
      });
      actions.appendChild(toggleBtn);
    }
    if (isOwn) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => confirmDeleteThread(thread));
      actions.appendChild(delBtn);
    }
    if (actions.children.length) post.appendChild(actions);

    wrap.appendChild(post);

    const repliesTitle = document.createElement("div");
    repliesTitle.className = "dd-forum-replies-title";
    repliesTitle.textContent = thread.replies.length ? "Replies" : "No Replies Yet";
    wrap.appendChild(repliesTitle);

    thread.replies.forEach((reply) => {
      const r = document.createElement("div");
      r.className = "dd-forum-reply";
      const body = document.createElement("div");
      body.className = "dd-forum-reply-body";
      body.textContent = reply.body;
      r.appendChild(body);
      const meta2 = document.createElement("div");
      meta2.className = "dd-forum-meta";
      meta2.textContent = reply.authorName + " · " + formatRelativeTime(reply.createdAt);
      r.appendChild(meta2);
      if (reply.authorId === currentUser.id) {
        const actionsRow = document.createElement("div");
        actionsRow.className = "dd-forum-reply-actions";
        const del = document.createElement("button");
        del.type = "button";
        del.className = "dd-forum-reply-delete";
        del.textContent = "Delete";
        del.addEventListener("click", () => confirmDeleteReply(thread, reply));
        actionsRow.appendChild(del);
        r.appendChild(actionsRow);
      }
      wrap.appendChild(r);
    });

    const replyForm = document.createElement("div");
    replyForm.className = "dd-forum-reply-form";
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Write a reply…";
    const postReplyBtn = document.createElement("button");
    postReplyBtn.type = "button";
    postReplyBtn.className = "btn-primary";
    postReplyBtn.textContent = "Post Reply";
    postReplyBtn.addEventListener("click", async () => {
      const body = textarea.value.trim();
      if (!body) return;
      postReplyBtn.disabled = true;
      const result = await addReply(thread.id, body);
      postReplyBtn.disabled = false;
      if (!result || !result.ok) {
        showServerError(result && result.error);
        return;
      }
      await refreshCache();
      renderThread();
    });
    replyForm.appendChild(textarea);
    replyForm.appendChild(postReplyBtn);
    wrap.appendChild(replyForm);

    bodyEl.appendChild(wrap);
  }

  function confirmDeleteThread(thread) {
    window.DD.modal?.show({
      top: "DELETE POST",
      bottom: "THIS WILL DELETE THIS POST AND ITS REPLIES",
      okText: "Delete",
      cancelText: "Cancel",
      danger: true,
      onOk: async () => {
        const result = await deleteThread(thread.id);
        if (!result || !result.ok) {
          showServerError(result && result.error);
          return;
        }
        view = "board";
        activeThreadId = null;
        await refreshCache();
        render();
      },
    });
  }
  function confirmDeleteReply(thread, reply) {
    window.DD.modal?.show({
      top: "DELETE REPLY",
      bottom: "THIS WILL DELETE THIS REPLY",
      okText: "Delete",
      cancelText: "Cancel",
      danger: true,
      onOk: async () => {
        const result = await deleteReply(thread.id, reply.id);
        if (!result || !result.ok) {
          showServerError(result && result.error);
          return;
        }
        await refreshCache();
        renderThread();
      },
    });
  }
})();
