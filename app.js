const REPO = "Patios/Copy-paster";
const BRANCH = "main";
const FILE_PATH = "commands.json";
const CONTENTS_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const STORAGE_KEY = "copy-paster.commands.v1";
const TOKEN_KEY = "copy-paster.github-token";
const SYNCED_KEY = "copy-paster.synced";
const SETUP_TEXT =
  "Commands are stored in this GitHub repo. Another computer sees them when you open or refresh this page. Paste a token here to save.";
const CONNECTED_TEXT = "Connected. A save here shows up on your other computers after a refresh.";

const addForm = document.querySelector("#add-form");
const nameInput = document.querySelector("#name-input");
const commandInput = document.querySelector("#command-input");
const noteInput = document.querySelector("#note-input");
const searchInput = document.querySelector("#search-input");
const listEl = document.querySelector("#command-list");
const emptyEl = document.querySelector("#empty");
const countEl = document.querySelector("#count");
const statusEl = document.querySelector("#status");
const exportBtn = document.querySelector("#export-btn");
const importInput = document.querySelector("#import-input");
const syncStatus = document.querySelector("#sync-status");
const tokenForm = document.querySelector("#token-form");
const tokenField = document.querySelector("#token-field");
const tokenInput = document.querySelector("#token-input");
const tokenSave = document.querySelector("#token-save");
const tokenLink = document.querySelector("#token-link");
const tokenSteps = document.querySelector("#token-steps");
const forgetTokenBtn = document.querySelector("#forget-token");
const refreshBtn = document.querySelector("#refresh-btn");
const saveButton = addForm.querySelector("button[type='submit']");

let commands = loadCache();
let fileSha = null;
let query = "";
let editingId = null;
let pendingDeleteId = null;
let publishing = false;
let statusTimer = 0;

function loadCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return normalize(parsed);
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || "").trim();
}

function isCommand(item) {
  return item && typeof item.id === "string" && typeof item.command === "string";
}

function normalize(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isCommand).map((item) => ({
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    command: item.command,
    note: typeof item.note === "string" ? item.note : "",
    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
  }));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFromCommand(command) {
  const line = command.split("\n").find((part) => part.trim()) || "Command";
  return line.trim().slice(0, 80);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(content) {
  const binary = atob(String(content || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function authHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.add("show");
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => statusEl.classList.remove("show"), isError ? 4200 : 2200);
}

function updateTokenUI() {
  const connected = Boolean(getToken());
  tokenField.hidden = connected;
  tokenSave.hidden = connected;
  tokenLink.hidden = connected;
  tokenSteps.hidden = connected;
  forgetTokenBtn.hidden = !connected;
  if (!connected) syncStatus.textContent = SETUP_TEXT;
}

async function fetchRemote() {
  const response = await fetch(`${CONTENTS_URL}?ref=${BRANCH}&t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (response.status === 404) return { commands: [], sha: null };
  if (!response.ok) {
    const error = new Error("load failed");
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  let parsed = [];
  try {
    parsed = JSON.parse(decodeBase64(data.content));
  } catch {
    const error = new Error("invalid json");
    error.status = 422;
    throw error;
  }
  return { commands: normalize(parsed), sha: data.sha || null };
}

async function refreshFromGitHub({ silent } = {}) {
  if (editingId || publishing) {
    if (!silent) showStatus("Finish editing before refreshing.", true);
    return false;
  }

  syncStatus.textContent = "Loading shared commands…";
  try {
    const remote = await fetchRemote();
    fileSha = remote.sha;
    const firstSync = localStorage.getItem(SYNCED_KEY) !== "1";
    if (firstSync) {
      const seen = new Set(remote.commands.map((item) => item.command));
      const extra = commands.filter((item) => item.command && !seen.has(item.command));
      if (extra.length && getToken()) {
        const published = await push([...extra, ...remote.commands], "Publish commands saved in this browser", {
          success: "Published commands from this browser.",
        });
        if (published) localStorage.setItem(SYNCED_KEY, "1");
        return published;
      }
      if (extra.length) {
        commands = [...extra, ...remote.commands];
        persist();
        render();
        syncStatus.textContent = SETUP_TEXT;
        return true;
      }
    }

    commands = remote.commands;
    localStorage.setItem(SYNCED_KEY, "1");
    persist();
    render();
    syncStatus.textContent = getToken() ? CONNECTED_TEXT : SETUP_TEXT;
    if (!silent) showStatus("Loaded the shared list");
    return true;
  } catch {
    syncStatus.textContent = getToken() ? "Could not load the shared list." : SETUP_TEXT;
    showStatus("Could not load commands from GitHub.", true);
    render();
    return false;
  }
}

async function push(next, message, options = {}) {
  const token = getToken();
  if (!token) {
    showStatus("Add a GitHub token to share this list with your other computers.", true);
    tokenInput.focus();
    return false;
  }
  if (publishing) return false;

  publishing = true;
  saveButton.disabled = true;
  try {
    if (!fileSha) {
      const remote = await fetchRemote();
      fileSha = remote.sha;
    }

    const body = {
      message,
      content: encodeBase64(`${JSON.stringify(next, null, 2)}\n`),
      branch: BRANCH,
    };
    if (fileSha) body.sha = fileSha;

    const response = await fetch(CONTENTS_URL, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 409 || response.status === 422) {
      const remote = await fetchRemote().catch(() => null);
      if (remote) fileSha = remote.sha;
      showStatus("The list changed on GitHub. Refresh, then try again.", true);
      return false;
    }

    if (response.status === 401 || response.status === 403) {
      showStatus("GitHub rejected the token. It needs Contents read and write on Patios/Copy-paster.", true);
      return false;
    }

    if (!response.ok) {
      showStatus("Could not publish the list to GitHub.", true);
      return false;
    }

    const data = await response.json();
    fileSha = data.content && data.content.sha ? data.content.sha : fileSha;
    commands = next;
    localStorage.setItem(SYNCED_KEY, "1");
    persist();
    render();
    syncStatus.textContent = CONNECTED_TEXT;
    showStatus(options.success || "Saved. Refresh this page on your other computer.");
    return true;
  } catch {
    showStatus("Could not reach GitHub.", true);
    return false;
  } finally {
    publishing = false;
    saveButton.disabled = false;
  }
}

async function tokenCanWrite(token) {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 401) return { ok: false, reason: "GitHub rejected that token." };
  if (!response.ok) return { ok: false, reason: "Could not check that token with GitHub." };
  const repo = await response.json();
  if (!repo.permissions || !repo.permissions.push) {
    return { ok: false, reason: "That token cannot edit this repo. Set Contents to Read and write." };
  }
  return { ok: true };
}

function matches(command) {
  if (!query) return true;
  const haystack = `${command.name || ""}\n${command.command}\n${command.note || ""}`.toLowerCase();
  return haystack.includes(query);
}

function render() {
  const visible = commands.filter(matches);
  listEl.replaceChildren();
  countEl.textContent = commands.length === 1 ? "1 saved" : `${commands.length} saved`;

  if (!visible.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = commands.length
      ? "No commands match that search."
      : "No shared commands yet. Save one and it will show up on your other computers.";
    return;
  }

  emptyEl.hidden = true;
  const fragment = document.createDocumentFragment();

  for (const command of visible) {
    const item = document.createElement("li");
    item.className = "card";
    item.dataset.id = command.id;
    item.append(editingId === command.id ? renderEditor(command) : renderCard(command));
    fragment.append(item);
  }

  listEl.append(fragment);
}

function renderCard(command) {
  const wrap = document.createElement("div");
  const top = document.createElement("div");
  top.className = "card-top";

  const meta = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = command.name || titleFromCommand(command.command);
  meta.append(title);

  if (command.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = command.note;
    meta.append(note);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(
    button("Copy", "primary", () => onCopy(command)),
    button("Edit", "ghost", () => {
      editingId = command.id;
      pendingDeleteId = null;
      render();
    }),
    button(pendingDeleteId === command.id ? "Confirm delete" : "Delete", pendingDeleteId === command.id ? "confirm" : "danger", () =>
      onDelete(command.id)
    )
  );

  top.append(meta, actions);

  const pre = document.createElement("pre");
  pre.className = "command";
  const code = document.createElement("code");
  code.textContent = command.command;
  pre.append(code);
  wrap.append(top, pre);
  return wrap;
}

function renderEditor(command) {
  const form = document.createElement("form");
  form.className = "edit-form";

  const name = labeledInput("Name", "text", command.name || "");
  const cmd = labeledInput("Command", "textarea", command.command);
  const note = labeledInput("Note", "text", command.note || "");
  cmd.querySelector("textarea").required = true;

  const row = document.createElement("div");
  row.className = "form-row";
  const save = button("Update", "primary");
  save.type = "submit";
  const cancel = button("Cancel", "ghost", () => {
    editingId = null;
    render();
  });
  cancel.type = "button";
  row.append(save, cancel);
  form.append(name, cmd, note, row);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextCommand = cmd.querySelector("textarea").value.trim();
    if (!nextCommand) return;
    const next = commands.map((item) =>
      item.id === command.id
        ? {
            ...item,
            name: name.querySelector("input").value.trim(),
            command: nextCommand,
            note: note.querySelector("input").value.trim(),
            updatedAt: Date.now(),
          }
        : item
    );
    const previousEditing = editingId;
    editingId = null;
    const ok = await push(next, "Update a saved command", { success: "Command updated" });
    if (!ok) {
      editingId = previousEditing;
      render();
    }
  });

  return form;
}

function labeledInput(label, type, value) {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  field.append(span);
  const control = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") control.type = type;
  control.value = value;
  if (type === "textarea") {
    control.rows = 4;
    control.spellcheck = false;
  }
  field.append(control);
  return field;
}

function button(label, variant, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `btn ${variant}`;
  el.textContent = label;
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

async function onCopy(command) {
  try {
    await copyText(command.command);
    showStatus("Copied to clipboard");
  } catch {
    showStatus("Could not copy. Select the command and copy it manually.", true);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("copy failed");
  }
}

async function onDelete(id) {
  if (pendingDeleteId !== id) {
    pendingDeleteId = id;
    render();
    return;
  }

  const next = commands.filter((command) => command.id !== id);
  const previousPending = pendingDeleteId;
  pendingDeleteId = null;
  const ok = await push(next, "Delete a saved command", { success: "Command deleted" });
  if (!ok) {
    pendingDeleteId = previousPending;
    render();
  }
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = commandInput.value.trim();
  if (!command) return;

  const next = [
    {
      id: uid(),
      name: nameInput.value.trim(),
      command,
      note: noteInput.value.trim(),
      updatedAt: Date.now(),
    },
    ...commands,
  ];
  const ok = await push(next, "Save a terminal command");
  if (!ok) return;
  addForm.reset();
  query = "";
  searchInput.value = "";
  nameInput.focus();
});

searchInput.addEventListener("input", () => {
  query = searchInput.value.trim().toLowerCase();
  pendingDeleteId = null;
  render();
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(commands, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "copy-paster-commands.json";
  link.click();
  URL.revokeObjectURL(url);
  showStatus(commands.length ? "Exported commands" : "Exported an empty list");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files && importInput.files[0];
  importInput.value = "";
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const incoming = normalize(
      Array.isArray(parsed)
        ? parsed.map((item) => ({
            ...item,
            id: typeof item.id === "string" ? item.id : uid(),
            command: typeof item.command === "string" ? item.command.trim() : "",
            name: typeof item.name === "string" ? item.name.trim() : "",
            note: typeof item.note === "string" ? item.note.trim() : "",
          }))
        : []
    ).filter((item) => item.command);

    if (!incoming.length) throw new Error("empty");

    const seen = new Set(commands.map((command) => command.command));
    const fresh = incoming.filter((item) => {
      if (seen.has(item.command)) return false;
      seen.add(item.command);
      return true;
    });

    if (!fresh.length) {
      showStatus("Those commands are already saved");
      return;
    }

    await push([...fresh, ...commands], "Import saved commands", {
      success: `Imported ${fresh.length}`,
    });
  } catch {
    showStatus("Import needs a JSON list of commands.", true);
  }
});

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;
  tokenSave.disabled = true;
  try {
    const check = await tokenCanWrite(token);
    if (!check.ok) {
      showStatus(check.reason, true);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
    tokenInput.value = "";
    updateTokenUI();
    syncStatus.textContent = CONNECTED_TEXT;
    showStatus("Token saved in this browser");
    await refreshFromGitHub({ silent: true });
  } catch {
    showStatus("Could not reach GitHub.", true);
  } finally {
    tokenSave.disabled = false;
  }
});

forgetTokenBtn.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  updateTokenUI();
  showStatus("Token removed from this browser");
});

refreshBtn.addEventListener("click", () => {
  refreshFromGitHub();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshFromGitHub({ silent: true });
});

updateTokenUI();
render();
refreshFromGitHub({ silent: true });
