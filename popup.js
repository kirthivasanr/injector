const injectTextEl = document.getElementById("injectText");
const startBtnEl = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#0f766e";
}

async function loadSavedText() {
  const result = await chrome.storage.local.get("lastInjectText");
  if (typeof result.lastInjectText === "string") {
    injectTextEl.value = result.lastInjectText;
  }
}

async function saveText(text) {
  await chrome.storage.local.set({ lastInjectText: text });
}

injectTextEl.addEventListener("input", () => {
  void saveText(injectTextEl.value);
});

startBtnEl.addEventListener("click", () => {
  const text = injectTextEl.value;

  if (!text.trim()) {
    setStatus("Please enter some text first.", true);
    return;
  }

  startBtnEl.disabled = true;
  setStatus("Starting injection mode...");

  chrome.runtime.sendMessage(
    {
      type: "START_INJECTION_MODE",
      payload: { text }
    },
    (response) => {
      startBtnEl.disabled = false;

      if (chrome.runtime.lastError) {
        setStatus("Error: " + chrome.runtime.lastError.message, true);
        return;
      }

      if (!response || !response.ok) {
        setStatus(response?.error || "Failed to start injection mode.", true);
        return;
      }

      setStatus("Click any page element to inject text.");
      window.close();
    }
  );
});

void loadSavedText();
