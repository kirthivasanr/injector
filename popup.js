// --- TAB SWITCHING ---
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

const openShortcutSettingsBtn = document.getElementById("openShortcutSettingsBtn");

if (openShortcutSettingsBtn) {
  openShortcutSettingsBtn.addEventListener("click", async () => {
    const shortcutUrl = "chrome://extensions/shortcuts";

    try {
      await chrome.tabs.create({ url: shortcutUrl });
    } catch (_err) {
      try {
        await chrome.runtime.openOptionsPage();
      } catch (_optionsErr) {
        console.warn("Open the browser shortcuts page manually:", shortcutUrl);
      }
    }
  });
}

// --- TEXT EXTRACTION ---
const extractBtn = document.getElementById("extractTextBtn");
const textArea = document.getElementById("textDumpArea");

if (extractBtn) {
  extractBtn.addEventListener("click", async () => {
    textArea.value = "Extracting...";

    try {
      chrome.runtime.sendMessage({ type: "GET_PAGE_TEXT" }, (response) => {
        if (chrome.runtime.lastError) {
          textArea.value = "Error: " + chrome.runtime.lastError.message;
          return;
        }

        if (response?.ok) {
          textArea.value = response.text;
        } else {
          textArea.value = response?.error || "Failed to extract text.";
        }
      });

    } catch (err) {
      textArea.value = "Exception: " + err.toString();
    }
  });
}

const startBtn = document.getElementById("startBtn");
const injectTextArea = document.getElementById("injectText");
const status = document.getElementById("status");

if (startBtn) {
  startBtn.addEventListener("click", async () => {
    const text = injectTextArea.value;

    if (!text.trim()) {
      status.textContent = "Enter text first.";
      return;
    }

    status.textContent = "Starting injection...";

    try {
      chrome.runtime.sendMessage(
        {
          type: "START_INJECTION_MODE",
          payload: { text }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            status.textContent = "Error: " + chrome.runtime.lastError.message;
            return;
          }

          if (response?.ok) {
            status.textContent = "Click on a field to inject.";
          } else {
            status.textContent = "Failed: " + (response?.error || "Unknown error");
          }
        }
      );
    } catch (err) {
      status.textContent = "Exception: " + err.toString();
    }
  });
}