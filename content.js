(() => {
  if (window.__universalTextInjectorLoaded) return;
  window.__universalTextInjectorLoaded = true;

  const MSG_ENABLE_INJECTION = "ENABLE_INJECTION_MODE";
  const MSG_INJECT_VIA_BG = "INJECT_VIA_BACKGROUND";
  const MSG_PING = "UTI_PING";
  const HIGHLIGHT_CLASS = "uti-hover-outline";
  const STYLE_ID = "uti-highlight-style";

  let isInjectionMode = false;
  let textToInject = "";
  let hoveredElement = null;
  let previousCursor = "";

  function ensureHighlightStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "." + HIGHLIGHT_CLASS + "{outline:2px solid #ef4444!important;outline-offset:1px!important;}" +
      "html.uti-cursor-mode,html.uti-cursor-mode *{cursor:crosshair!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function removeHighlight(el) { if (el) el.classList.remove(HIGHLIGHT_CLASS); }
  function applyHighlight(el) { if (el) el.classList.add(HIGHLIGHT_CLASS); }

  function dispatchInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(el, value) {
    const { set: vs } = Object.getOwnPropertyDescriptor(el, "value") || {};
    const proto = Object.getPrototypeOf(el);
    const { set: ps } = Object.getOwnPropertyDescriptor(proto, "value") || {};
    if (ps && vs !== ps) { ps.call(el, value); return; }
    if (vs) { vs.call(el, value); return; }
    el.value = value;
  }

  function isInsideCodeEditor(el) {
    if (!el || typeof el.closest !== "function") return false;
    return !!(
      el.closest(".ace_editor") ||
      el.closest(".CodeMirror") ||
      el.closest(".cm-editor") ||
      el.closest(".monaco-editor")
    );
  }

  function hasCodeEditorOnPage() {
    return !!(
      document.querySelector(".ace_editor") ||
      document.querySelector(".CodeMirror") ||
      document.querySelector(".cm-editor") ||
      document.querySelector(".monaco-editor")
    );
  }

  function getEditableTarget(el) {
    if (!el) return null;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
    if (el.isContentEditable) return el;
    if (typeof el.closest === "function") {
      const editable = el.closest("[contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']");
      if (editable) return editable;
    }
    if (typeof el.querySelector === "function") {
      const nested = el.querySelector("input, textarea, [contenteditable=''], [contenteditable='true']");
      if (nested instanceof Element) return nested;
    }
    return null;
  }

  function focusInputLikeElement(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
  }

  function replaceContentEditableText(el, text) {
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (!document.execCommand("insertText", false, text)) {
      el.innerText = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function replaceInputLikeText(el, text) {
    focusInputLikeElement(el);
    try { el.setSelectionRange(0, (el.value || "").length); } catch (_) {}
    if (!document.execCommand("insertText", false, text)) {
      setNativeValue(el, text);
      dispatchInputEvents(el);
    }
    focusInputLikeElement(el);
  }

  // Ask background.js to inject into the MAIN world (bypasses CSP)
  function injectViaBackground(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: MSG_INJECT_VIA_BG, payload: { text } },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "No response from background." });
        }
      );
    });
  }

  async function injectText(target, text) {
    // PRIORITY 1: If there's a code editor on the page, use background main-world injection
    if (isInsideCodeEditor(target) || hasCodeEditorOnPage()) {
      const result = await injectViaBackground(text);
      if (result && result.ok) return result;
      // Fall through to standard methods if it fails
    }

    // PRIORITY 2: Standard editable elements
    const editable = getEditableTarget(target);
    if (editable) {
      // Skip hidden editor textareas
      if (editable instanceof HTMLTextAreaElement) {
        const parent = editable.closest(".ace_editor, .CodeMirror, .cm-editor, .monaco-editor");
        if (parent) {
          // Try background injection one more time for this editor
          const result = await injectViaBackground(text);
          if (result && result.ok) return result;
        }
      }

      if (editable instanceof HTMLInputElement) {
        const blocked = new Set(["checkbox", "radio", "file", "button", "submit", "reset", "image"]);
        if (blocked.has(editable.type)) return { ok: false, error: "Unsupported input type: " + editable.type };
        replaceInputLikeText(editable, text);
        return { ok: true, mode: "input" };
      }
      if (editable instanceof HTMLTextAreaElement) {
        replaceInputLikeText(editable, text);
        return { ok: true, mode: "textarea" };
      }
      if (editable.isContentEditable) {
        replaceContentEditableText(editable, text);
        return { ok: true, mode: "contenteditable" };
      }
    }

    // PRIORITY 3: Last resort — try background injection even if no editor detected
    const bgResult = await injectViaBackground(text);
    if (bgResult && bgResult.ok) return bgResult;

    return { ok: false, error: "No editable element or code editor found." };
  }

  function onMouseOver(e) {
    if (!isInjectionMode) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (hoveredElement && hoveredElement !== t) removeHighlight(hoveredElement);
    const container = t.closest(".ace_editor, .CodeMirror, .cm-editor, .monaco-editor");
    hoveredElement = container || t;
    applyHighlight(hoveredElement);
  }

  function onMouseOut(e) {
    if (!isInjectionMode) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const container = t.closest(".ace_editor, .CodeMirror, .cm-editor, .monaco-editor");
    const out = container || t;
    removeHighlight(out);
    if (hoveredElement === out) hoveredElement = null;
  }

  function onKeyDown(e) {
    if (!isInjectionMode) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      exitInjectionMode();
    }
  }

  function exitInjectionMode() {
    isInjectionMode = false;
    textToInject = "";
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (hoveredElement) { removeHighlight(hoveredElement); hoveredElement = null; }
    document.documentElement.classList.remove("uti-cursor-mode");
    if (previousCursor) document.documentElement.style.cursor = previousCursor;
    else document.documentElement.style.removeProperty("cursor");
  }

  async function onClickCapture(e) {
    if (!isInjectionMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = e.target;
    if (!(target instanceof Element)) { exitInjectionMode(); return; }

    const result = await injectText(target, textToInject);
    if (result.ok) {
      console.log("[UTI] ✅ Injected via:", result.mode);
    } else {
      console.warn("[UTI] ❌ Failed:", result.error);
    }
    exitInjectionMode();
  }

  function enterInjectionMode(text) {
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "No text available for injection." };
    }
    if (isInjectionMode) exitInjectionMode();

    ensureHighlightStyle();
    isInjectionMode = true;
    textToInject = text;
    previousCursor = document.documentElement.style.cursor || "";
    document.documentElement.classList.add("uti-cursor-mode");
    document.documentElement.style.cursor = "crosshair";

    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown, true);
    return { ok: true };
  }

const MSG_GET_PAGE_TEXT = "GET_PAGE_TEXT";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // --- PING ---
  if (message?.type === MSG_PING) {
    sendResponse({ pong: true });
    return;
  }

  // --- INJECTION MODE ---
  if (message?.type === MSG_ENABLE_INJECTION) {
    const text = message?.payload?.text ?? "";
    const result = enterInjectionMode(text);
    sendResponse(result);
    return;
  }

  // --- TEXT EXTRACTION ---
  if (message?.type === MSG_GET_PAGE_TEXT) {
    try {
      const text = document.documentElement.innerText || "";
      sendResponse({ ok: true, text });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
    return;
  }
});
})();

