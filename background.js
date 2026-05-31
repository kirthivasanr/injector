const MSG_START_INJECTION = "START_INJECTION_MODE";
const MSG_ENABLE_INJECTION = "ENABLE_INJECTION_MODE";
const MSG_INJECT_VIA_BG = "INJECT_VIA_BACKGROUND";
const MSG_GET_PAGE_TEXT = "GET_PAGE_TEXT";
const MSG_PING = "UTI_PING";

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || typeof activeTab.id !== "number") {
    throw new Error("No active tab found.");
  }
  return activeTab.id;
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function isContentScriptAlive(tabId) {
  try {
    const response = await sendMessageToTab(tabId, { type: MSG_PING });
    return response && response.pong === true;
  } catch (_err) {
    return false;
  }
}

async function ensureContentScript(tabId) {
  const alive = await isContentScriptAlive(tabId);
  if (alive) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error("Unable to inject content script: " + message);
  }
}

async function sendInjectionMessage(tabId, text, retries = 5, delayMs = 100) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await sendMessageToTab(tabId, {
        type: MSG_ENABLE_INJECTION,
        payload: { text }
      });
      return response;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function startInjectionMode(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("No text provided for injection.");
  }
  const tabId = await getActiveTabId();
  await ensureContentScript(tabId);
  await sendInjectionMessage(tabId, text);
}

async function getPageTextFromActiveTab() {
  const tabId = await getActiveTabId();

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement?.innerText || ""
  });

  const text = results?.[0]?.result;
  return typeof text === "string" ? text : "";
}

// ─── Main world injection function ───
// This runs in the PAGE's JavaScript context, NOT the extension's.
// It has full access to ace, CodeMirror, monaco, editor, etc.
function mainWorldInjector(textToInject) {
  try {
    // 1. Ace Editor
    if (typeof ace !== "undefined") {
      var aceEls = document.querySelectorAll(".ace_editor");
      for (var i = 0; i < aceEls.length; i++) {
        var el = aceEls[i];
        if (el.env && el.env.editor) {
          el.env.editor.setValue(textToInject, 1);
          el.env.editor.clearSelection();
          el.env.editor.focus();
          return { ok: true, mode: "ace" };
        }
      }
      if (aceEls.length > 0) {
        try {
          var ed = ace.edit(aceEls[0]);
          ed.setValue(textToInject, 1);
          ed.clearSelection();
          ed.focus();
          return { ok: true, mode: "ace-edit" };
        } catch (e) { /* continue */ }
      }
    }

    // 2. CodeMirror 5
    var cmEls = document.querySelectorAll(".CodeMirror");
    for (var i = 0; i < cmEls.length; i++) {
      if (cmEls[i].CodeMirror) {
        cmEls[i].CodeMirror.setValue(textToInject);
        cmEls[i].CodeMirror.focus();
        return { ok: true, mode: "cm5" };
      }
    }

    // 3. CodeMirror 6
    var cm6Els = document.querySelectorAll(".cm-editor");
    for (var i = 0; i < cm6Els.length; i++) {
      var view = cm6Els[i].cmView && cm6Els[i].cmView.view;
      if (view && view.dispatch && view.state) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: textToInject } });
        view.focus();
        return { ok: true, mode: "cm6" };
      }
    }

    // 4. Monaco
    if (typeof monaco !== "undefined" && monaco.editor) {
      var editors = (typeof monaco.editor.getEditors === "function") ? monaco.editor.getEditors() : [];
      if (editors.length > 0) {
        editors[0].setValue(textToInject);
        editors[0].focus();
        return { ok: true, mode: "monaco" };
      }
      var models = (typeof monaco.editor.getModels === "function") ? monaco.editor.getModels() : [];
      if (models.length > 0) {
        models[0].setValue(textToInject);
        return { ok: true, mode: "monaco-model" };
      }
    }

    // 5. Global editor variables
    var globals = ["editor", "codeEditor", "aceEditor", "cmEditor", "monacoEditor", "myEditor", "code_editor", "jsEditor", "pyEditor"];
    for (var g = 0; g < globals.length; g++) {
      try {
        var ed = window[globals[g]];
        if (ed && typeof ed.setValue === "function") {
          ed.setValue(textToInject, 1);
          if (typeof ed.clearSelection === "function") ed.clearSelection();
          if (typeof ed.focus === "function") ed.focus();
          return { ok: true, mode: "global-" + globals[g] };
        }
      } catch (e) { /* continue */ }
    }

    // 6. Search ALL iframes for editors too
    // (can't cross-origin, but same-origin iframes work)
    try {
      var iframes = document.querySelectorAll("iframe");
      for (var f = 0; f < iframes.length; f++) {
        try {
          var iframeWin = iframes[f].contentWindow;
          var iframeDoc = iframes[f].contentDocument;
          if (!iframeWin || !iframeDoc) continue;

          // Ace in iframe
          if (typeof iframeWin.ace !== "undefined") {
            var iAceEls = iframeDoc.querySelectorAll(".ace_editor");
            for (var j = 0; j < iAceEls.length; j++) {
              if (iAceEls[j].env && iAceEls[j].env.editor) {
                iAceEls[j].env.editor.setValue(textToInject, 1);
                iAceEls[j].env.editor.clearSelection();
                return { ok: true, mode: "iframe-ace" };
              }
            }
          }

          // CodeMirror in iframe
          var iCmEls = iframeDoc.querySelectorAll(".CodeMirror");
          for (var j = 0; j < iCmEls.length; j++) {
            if (iCmEls[j].CodeMirror) {
              iCmEls[j].CodeMirror.setValue(textToInject);
              return { ok: true, mode: "iframe-cm5" };
            }
          }

          // Global editor in iframe
          if (iframeWin.editor && typeof iframeWin.editor.setValue === "function") {
            iframeWin.editor.setValue(textToInject, 1);
            return { ok: true, mode: "iframe-global-editor" };
          }
        } catch (e) { /* cross-origin, skip */ }
      }
    } catch (e) { /* skip */ }

    return { ok: false, mode: "", error: "No code editor found on this page." };
  } catch (err) {
    return { ok: false, mode: "", error: err.message || String(err) };
  }
}

// Handle main-world injection request from content script
async function handleMainWorldInjection(text, sendResponse) {
  try {
    const tabId = await getActiveTabId();

    // Execute the injector function in the page's MAIN world
    // This bypasses CSP and has full access to page JS variables
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: mainWorldInjector,
      args: [text]
    });

    // Check results from all frames
    for (const frame of results) {
      if (frame.result && frame.result.ok) {
        sendResponse(frame.result);
        return;
      }
    }

    // No frame succeeded
    const lastError = results.length > 0 && results[0].result
      ? results[0].result.error
      : "No editor found in any frame.";
    sendResponse({ ok: false, error: lastError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResponse({ ok: false, error: "Background injection failed: " + msg });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MSG_GET_PAGE_TEXT) {
    (async () => {
      try {
        const text = await getPageTextFromActiveTab();
        sendResponse({ ok: true, text });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error: errorMessage });
      }
    })();
    return true;
  }

  // Handle injection start from popup
  if (message?.type === MSG_START_INJECTION) {
    const text = message?.payload?.text ?? "";
    (async () => {
      try {
        await chrome.storage.local.set({ lastInjectText: text });
        await startInjectionMode(text);
        sendResponse({ ok: true });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error: errorMessage });
      }
    })();
    return true;
  }

  // Handle main-world injection request from content script
  if (message?.type === MSG_INJECT_VIA_BG) {
    const text = message?.payload?.text ?? "";
    handleMainWorldInjection(text, sendResponse);
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "start-injection-mode") return;

  (async () => {
    try {
      const result = await chrome.storage.local.get("lastInjectText");
      const text = typeof result.lastInjectText === "string" ? result.lastInjectText : "";
      if (!text.trim()) {
        console.warn("[UTI] No saved text to inject.");
        return;
      }
      await startInjectionMode(text);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[UTI] Shortcut failed:", errorMessage);
    }
  })();
});
