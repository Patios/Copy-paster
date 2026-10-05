const STORAGE_KEY = "copy-paster.commands.v1";

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

let commands = load();
let query = "";
let editingId = null;
let pendingDeleteId = null;
let statusTimer = 0;

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCommand);
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

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  statusTimer = window.setTimeout(() => statusEl.classList.remove("show"), 1800);
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
      : "No commands yet. Save one above and it will stay in this browser.";
    return;
  }

  emptyEl.hidden = true;
  const fragment = document.createDocumentFragment();

  for (const command of visible) {
    const item = document.createElement("li");
    item.className = "card";
    item.dataset.id = command.id;

    if (editingId === command.id) {
      item.append(renderEditor(command));
    } else {
      item.append(renderCard(command));
    }

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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextCommand = cmd.querySelector("textarea").value.trim();
    if (!nextCommand) return;
    command.name = name.querySelector("input").value.trim();
    command.command = nextCommand;
    command.note = note.querySelector("input").value.trim();
    command.updatedAt = Date.now();
    editingId = null;
    persist();
    render();
    showStatus("Command updated");
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

function onDelete(id) {
  if (pendingDeleteId !== id) {
    pendingDeleteId = id;
    render();
    return;
  }

  commands = commands.filter((command) => command.id !== id);
  pendingDeleteId = null;
  if (editingId === id) editingId = null;
  persist();
  render();
  showStatus("Command deleted");
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = commandInput.value.trim();
  if (!command) return;

  commands.unshift({
    id: uid(),
    name: nameInput.value.trim(),
    command,
    note: noteInput.value.trim(),
    updatedAt: Date.now(),
  });
  persist();
  addForm.reset();
  query = "";
  searchInput.value = "";
  render();
  showStatus("Command saved");
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
    if (!Array.isArray(parsed)) throw new Error("expected array");
    const incoming = parsed
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : uid(),
        name: typeof item.name === "string" ? item.name.trim() : "",
        command: typeof item.command === "string" ? item.command.trim() : "",
        note: typeof item.note === "string" ? item.note.trim() : "",
        updatedAt: Date.now(),
      }))
      .filter((item) => item.command);

    if (!incoming.length) throw new Error("empty");

    const seen = new Set(commands.map((command) => command.command));
    const fresh = incoming.filter((item) => {
      if (seen.has(item.command)) return false;
      seen.add(item.command);
      return true;
    });

    commands = [...fresh, ...commands];
    persist();
    render();
    showStatus(fresh.length ? `Imported ${fresh.length}` : "Those commands are already saved");
  } catch {
    showStatus("Import needs a JSON list of commands.", true);
  }
});

render();
