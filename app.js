const STORAGE_KEY = "copy-paster.commands.v2";

const addForm = document.querySelector("#add-form");
const nameInput = document.querySelector("#name-input");
const commandInput = document.querySelector("#command-input");
const noteInput = document.querySelector("#note-input");
const searchInput = document.querySelector("#search-input");
const searchClear = document.querySelector("#search-clear");
const listEl = document.querySelector("#command-list");
const emptyEl = document.querySelector("#empty");
const countEl = document.querySelector("#count");
const statusEl = document.querySelector("#status");
const exportBtn = document.querySelector("#export-btn");
const importInput = document.querySelector("#import-input");
const syncStatus = document.querySelector("#sync-status");
const authForm = document.querySelector("#auth-form");
const emailField = document.querySelector("#email-field");
const emailInput = document.querySelector("#email-input");
const passwordField = document.querySelector("#password-field");
const passwordInput = document.querySelector("#password-input");
const signInBtn = document.querySelector("#sign-in-btn");
const signUpBtn = document.querySelector("#sign-up-btn");
const resetPasswordBtn = document.querySelector("#reset-password-btn");
const signOutBtn = document.querySelector("#sign-out-btn");
const newPasswordForm = document.querySelector("#new-password-form");
const newPasswordInput = document.querySelector("#new-password-input");
const authSteps = document.querySelector("#auth-steps");
const refreshBtn = document.querySelector("#refresh-btn");
const saveButton = addForm.querySelector("button[type='submit']");
const composerPanel = document.querySelector("#composer-panel");

const url = window.COPY_PASTER_SUPABASE_URL;
const publishableKey = window.COPY_PASTER_SUPABASE_PUBLISHABLE_KEY;
const db = url && publishableKey && window.supabase
  ? window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

let commands = loadCache();
let currentUser = null;
let query = "";
let editingId = null;
let pendingDeleteId = null;
let saving = false;
let statusTimer = 0;

function loadCache() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

function isCommand(item) {
  return item && typeof item.id === "string" && typeof item.command === "string";
}

function normalize(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isCommand).map((item) => ({
    id: item.id,
    name: typeof item.name === "string" ? item.name : "",
    command: item.command,
    note: typeof item.note === "string" ? item.note : "",
    updatedAt: typeof item.updatedAt === "number"
      ? item.updatedAt
      : Date.parse(item.updated_at || "") || Date.now(),
  }));
}

function toCommand(row) {
  return normalize([row])[0];
}

function titleFromCommand(command) {
  const line = command.split("\n").find((part) => part.trim()) || "Command";
  return line.trim().slice(0, 80);
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.add("show");
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => statusEl.classList.remove("show"), isError ? 7000 : 2200);
}

function updateAuthUI() {
  const signedIn = Boolean(currentUser);
  const recovering = !newPasswordForm.hidden;
  const minimized = signedIn && !recovering;
  document.querySelector("#sync-panel").classList.toggle("is-minimized", minimized);
  document.querySelector("#sync-title").textContent = signedIn
    ? currentUser.email || "Signed in"
    : "Sign in";
  authForm.hidden = minimized;
  syncStatus.hidden = minimized;
  emailField.hidden = signedIn;
  passwordField.hidden = signedIn;
  signInBtn.hidden = signedIn;
  signUpBtn.hidden = signedIn;
  resetPasswordBtn.hidden = signedIn;
  authSteps.hidden = signedIn;
  signOutBtn.hidden = !signedIn;
  if (!minimized) {
    syncStatus.textContent = signedIn
      ? `Signed in as ${currentUser.email || "your account"}.`
      : "Same email and password on each computer.";
  }
}

function requireSignIn() {
  if (currentUser) return true;
  showStatus("Sign in before saving commands.", true);
  emailInput.focus();
  return false;
}

async function refreshCommands({ silent = false } = {}) {
  if (!db || !currentUser) {
    render();
    return;
  }
  if (editingId || saving) {
    if (!silent) showStatus("Finish editing before refreshing.", true);
    return;
  }

  syncStatus.textContent = "Loading your commands…";
  const { data, error } = await db
    .from("commands")
    .select("id, name, command, note, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    updateAuthUI();
    showStatus("Could not load commands. Complete the Supabase setup in README.", true);
    return;
  }
  commands = normalize(data);
  persist();
  render();
  updateAuthUI();
  if (!silent) showStatus("Loaded your commands");
}

async function saveCommand(values, id) {
  if (!requireSignIn() || saving) return null;
  saving = true;
  saveButton.disabled = true;
  try {
    const request = id ? db.from("commands").update(values).eq("id", id) : db.from("commands").insert(values);
    const { data, error } = await request.select("id, name, command, note, updated_at").single();
    if (error) throw error;
    return toCommand(data);
  } catch {
    showStatus("Could not save. Check your Supabase table and sign-in settings.", true);
    return null;
  } finally {
    saving = false;
    saveButton.disabled = false;
  }
}

function matches(command) {
  return !query || `${command.name}\n${command.command}\n${command.note}`.toLowerCase().includes(query);
}

function render() {
  const visible = commands.filter(matches);
  listEl.replaceChildren();
  searchClear.hidden = !query;
  countEl.textContent = query
    ? `${visible.length} of ${commands.length}`
    : commands.length === 1 ? "1 saved" : `${commands.length} saved`;
  if (!visible.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = commands.length
      ? "No commands match that search."
      : currentUser ? "No commands yet. Save one to sync it." : "Sign in to see your saved commands.";
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

function appendToken(parent, type, value) {
  if (!value) return;
  if (!type) {
    parent.append(value);
    return;
  }
  const span = document.createElement("span");
  span.className = `tok tok-${type}`;
  span.textContent = value;
  parent.append(span);
}

function highlightCommand(parent, source) {
  let index = 0;
  let expectCommand = true;
  while (index < source.length) {
    const rest = source.slice(index);
    if (rest[0] === "\n") {
      parent.append("\n");
      index += 1;
      expectCommand = true;
      continue;
    }
    const space = /^[^\S\n]+/.exec(rest);
    if (space) {
      parent.append(space[0]);
      index += space[0].length;
      continue;
    }
    if (rest[0] === "#") {
      const comment = /^#[^\n]*/.exec(rest)[0];
      appendToken(parent, "comment", comment);
      index += comment.length;
      continue;
    }
    if (rest[0] === "'" || rest[0] === "\"") {
      const quote = rest[0];
      let end = 1;
      while (end < rest.length) {
        if (quote === "\"" && rest[end] === "\\") end += 2;
        else if (rest[end] === quote) { end += 1; break; }
        else end += 1;
      }
      appendToken(parent, "str", rest.slice(0, end));
      index += end;
      expectCommand = false;
      continue;
    }
    const operator = /^(?:&&|\|\||>>|<<|[|;&<>])/.exec(rest);
    if (operator) {
      appendToken(parent, "op", operator[0]);
      index += operator[0].length;
      expectCommand = true;
      continue;
    }
    const variable = /^\$[A-Za-z_][\w]*|^\$\{[^}\n]*\}/.exec(rest);
    if (variable) {
      appendToken(parent, "var", variable[0]);
      index += variable[0].length;
      expectCommand = false;
      continue;
    }
    if (expectCommand) {
      const assignment = /^[A-Za-z_][\w]*=(?:"(?:\\.|[^"\\\n])*"|'[^'\n]*'|[^\s|&;<>]*)/.exec(rest);
      if (assignment) {
        appendToken(parent, "var", assignment[0]);
        index += assignment[0].length;
        continue;
      }
    }
    const word = /^[^\s|&;<>]+/.exec(rest);
    if (!word) {
      parent.append(rest[0]);
      index += 1;
      continue;
    }
    if (expectCommand) appendToken(parent, "cmd", word[0]);
    else if (word[0].startsWith("-")) appendToken(parent, "flag", word[0]);
    else appendToken(parent, "arg", word[0]);
    expectCommand = false;
    index += word[0].length;
  }
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
    button("Edit", "ghost", () => { editingId = command.id; pendingDeleteId = null; render(); }),
    button(pendingDeleteId === command.id ? "Confirm delete" : "Delete", pendingDeleteId === command.id ? "confirm" : "danger", () => onDelete(command.id))
  );
  top.append(meta, actions);
  const pre = document.createElement("pre");
  pre.className = "command";
  const code = document.createElement("code");
  highlightCommand(code, command.command);
  pre.append(code);
  wrap.append(top, pre);
  return wrap;
}

function renderEditor(command) {
  const form = document.createElement("form");
  form.className = "edit-form";
  const name = labeledInput("Name", "text", command.name);
  const cmd = labeledInput("Command", "textarea", command.command);
  const note = labeledInput("Note", "text", command.note);
  cmd.querySelector("textarea").required = true;
  const row = document.createElement("div");
  row.className = "form-row";
  const update = button("Update", "primary");
  update.type = "submit";
  row.append(update, button("Cancel", "ghost", () => { editingId = null; render(); }));
  form.append(name, cmd, note, row);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const commandText = cmd.querySelector("textarea").value.trim();
    if (!commandText) return;
    const saved = await saveCommand({
      name: name.querySelector("input").value.trim(), command: commandText,
      note: note.querySelector("input").value.trim(),
    }, command.id);
    if (!saved) return;
    commands = commands.map((item) => item.id === saved.id ? saved : item);
    persist(); editingId = null; render(); showStatus("Command updated");
  });
  return form;
}

function labeledInput(label, type, value) {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const control = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") control.type = type;
  control.value = value;
  if (type === "textarea") { control.rows = 6; control.spellcheck = false; field.classList.add("command-field"); }
  field.append(span, control);
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
    await navigator.clipboard.writeText(command.command);
    showStatus("Copied to clipboard");
  } catch {
    showStatus("Could not copy. Select the command and copy it manually.", true);
  }
}

async function onDelete(id) {
  if (pendingDeleteId !== id) { pendingDeleteId = id; render(); return; }
  if (!requireSignIn()) return;
  const { error } = await db.from("commands").delete().eq("id", id);
  if (error) { showStatus("Could not delete that command.", true); return; }
  commands = commands.filter((command) => command.id !== id);
  pendingDeleteId = null;
  persist(); render(); showStatus("Command deleted");
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = commandInput.value.trim();
  if (!command) return;
  const saved = await saveCommand({ name: nameInput.value.trim(), command, note: noteInput.value.trim() });
  if (!saved) return;
  commands.unshift(saved);
  persist(); addForm.reset(); composerPanel.open = false; query = ""; searchInput.value = ""; render(); searchInput.focus();
  showStatus("Command saved");
});

function applySearch() {
  query = searchInput.value.trim().toLowerCase();
  pendingDeleteId = null;
  render();
}

searchInput.addEventListener("input", applySearch);
searchInput.addEventListener("search", applySearch);
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  applySearch();
  searchInput.focus();
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(commands, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "copy-paster-commands.json";
  link.click();
  URL.revokeObjectURL(link.href);
  showStatus(commands.length ? "Exported commands" : "Exported an empty list");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file || !requireSignIn()) return;
  try {
    const incoming = normalize(JSON.parse(await file.text())).filter((item) => item.command.trim());
    const existing = new Set(commands.map((item) => item.command));
    const fresh = incoming.filter((item) => !existing.has(item.command));
    if (!fresh.length) { showStatus("Those commands are already saved"); return; }
    const { data, error } = await db.from("commands").insert(fresh.map(({ name, command, note }) => ({ name, command, note }))).select("id, name, command, note, updated_at");
    if (error) throw error;
    commands = [...normalize(data), ...commands];
    persist(); render(); showStatus(`Imported ${data.length}`);
  } catch {
    showStatus("Import needs a JSON list of commands.", true);
  }
});

function authCredentials() {
  return {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db) { showStatus("Supabase is not configured.", true); return; }
  signInBtn.disabled = true;
  const { error } = await db.auth.signInWithPassword(authCredentials());
  signInBtn.disabled = false;
  if (error) { showStatus(error.message || "Could not sign in.", true); return; }
  passwordInput.value = "";
  showStatus("Signed in");
});

signUpBtn.addEventListener("click", async () => {
  if (!db) { showStatus("Supabase is not configured.", true); return; }
  if (!authForm.reportValidity()) return;
  signUpBtn.disabled = true;
  const { data, error } = await db.auth.signUp(authCredentials());
  signUpBtn.disabled = false;
  if (error) { showStatus(error.message || "Could not create the account.", true); return; }
  passwordInput.value = "";
  const alreadyRegistered = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
  if (alreadyRegistered) showStatus("That email is already registered. Sign in, or email yourself a password reset.", true);
  else if (data.session) showStatus("Account created");
  else showStatus("Account created. Confirm it from the email Supabase sends, then sign in.");
});

resetPasswordBtn.addEventListener("click", async () => {
  if (!db) { showStatus("Supabase is not configured.", true); return; }
  const email = emailInput.value.trim();
  if (!email) { emailInput.focus(); showStatus("Enter the email address first.", true); return; }
  resetPasswordBtn.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`,
  });
  resetPasswordBtn.disabled = false;
  if (error) {
    const limited = error.status === 429 || error.code === "over_email_send_rate_limit";
    showStatus(
      limited
        ? "Supabase has paused outgoing email for a while. Open the confirmation or reset message already in your inbox, then try again later."
        : error.message || "Could not send the reset email.",
      true
    );
    return;
  }
  showStatus("Check your email for a link to set a new password.");
});

newPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { error } = await db.auth.updateUser({ password: newPasswordInput.value });
  if (error) { showStatus(error.message || "Could not save the new password.", true); return; }
  newPasswordInput.value = "";
  newPasswordForm.hidden = true;
  showStatus("Password updated. You are signed in.");
});

signOutBtn.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  currentUser = null; commands = []; persist(); updateAuthUI(); render(); showStatus("Signed out");
});

refreshBtn.addEventListener("click", () => refreshCommands());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshCommands({ silent: true }); });

async function initialise() {
  if (!db) { syncStatus.textContent = "Supabase configuration is missing."; showStatus("Supabase configuration is missing.", true); render(); return; }
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") newPasswordForm.hidden = false;
    currentUser = session?.user || null;
    updateAuthUI();
    if (currentUser) void refreshCommands({ silent: true });
    else { commands = []; render(); }
  });
  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;
  updateAuthUI(); render();
  if (currentUser) await refreshCommands({ silent: true });
}

if (document.documentElement.dataset.gate === "open") initialise();
else document.addEventListener("copy-paster-open", initialise, { once: true });
