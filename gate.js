/** SHA-256 of the site password. Same password as the kids schedule page. */
const PASSWORD_SHA256 = "d48fff5413d963aa76f41e27639788329a28b61a139466e45d64c5dc0c852032";
const REMEMBER_KEY = "copy-paster-remember-unlock";
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

const gateForm = document.querySelector("#gate-form");
const gatePassword = document.querySelector("#gate-password");
const gateRemember = document.querySelector("#gate-remember");
const gateError = document.querySelector("#gate-error");
const gateSubmit = gateForm.querySelector("button[type='submit']");
const gateDismiss = document.querySelector("#gate-dismiss");
const gateReopen = document.querySelector("#gate-reopen");
const page = document.querySelector(".page");

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rememberUnlock() {
  localStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({ hash: PASSWORD_SHA256, expiresAt: Date.now() + REMEMBER_MS })
  );
}

function forgetUnlock() {
  localStorage.removeItem(REMEMBER_KEY);
}

function hasRememberedUnlock() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "");
    if (parsed.hash !== PASSWORD_SHA256 || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      forgetUnlock();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function openPage() {
  document.documentElement.dataset.gate = "open";
  page.inert = false;
  document.dispatchEvent(new Event("copy-paster-open"));
}

function setDismissed(dismissed) {
  document.documentElement.dataset.gate = dismissed ? "dismissed" : "locked";
  page.inert = true;
  if (!dismissed) gatePassword.focus();
}

if (hasRememberedUnlock()) openPage();
else setDismissed(false);

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gateSubmit.disabled = true;
  const matches = (await sha256Hex(gatePassword.value.trim())) === PASSWORD_SHA256;
  gateSubmit.disabled = gatePassword.value.trim() === "";
  if (!matches) {
    gateError.hidden = false;
    gatePassword.focus();
    return;
  }
  if (gateRemember.checked) rememberUnlock();
  else forgetUnlock();
  gatePassword.value = "";
  gateError.hidden = true;
  openPage();
});

gatePassword.addEventListener("input", () => {
  gateError.hidden = true;
  gateSubmit.disabled = gatePassword.value.trim() === "";
});
gateSubmit.disabled = true;

gateDismiss.addEventListener("click", () => setDismissed(true));
gateReopen.addEventListener("click", () => setDismissed(false));
