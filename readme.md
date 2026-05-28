# Universal Text Injector

A Chrome browser extension for injecting custom text into code editor fields on any webpage — with a single click.

---

## What It Does

Universal Text Injector detects and populates text into web-based code editors automatically. Whether you're testing a coding platform, filling in snippets, or automating repetitive input — this extension handles it in seconds.

---

## Features

### 🧩 Multiple Editor Support
Automatically detects and injects text into:
- **Ace Editor** — widely used in online IDEs
- **CodeMirror 5 & 6** — JavaScript-based editor
- **Monaco Editor** — the engine behind VS Code
- **Generic global editor variables**
- **Editors inside iframes** (same-origin)

### 🖥️ Easy-to-Use Popup Interface
- Paste or type text into the popup window
- Click **"Start Injection Mode"** to inject into the active page
- Status messages confirm success or failure instantly

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Alt + U` | Open the injector popup |
| `Ctrl + Shift + Y` / `Cmd + Shift + Y` | Quick inject using last saved text |

### 🔍 Smart Editor Detection
- Automatically identifies the correct editor type on the page
- Falls back through multiple detection methods if needed
- Supports multiple frames and nested iframes
- Bypasses Content Security Policy (CSP) restrictions

---

## Use Cases

- Quickly filling code snippets into web-based IDEs
- Testing editor behavior on platforms like LeetCode or HackerRank
- Automating repetitive text entry into online code editors


## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer Mode** (top right toggle)
4. Click **"Load unpacked"** and select the project folder
5. The extension icon will appear in your toolbar — you're ready to go

