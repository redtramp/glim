# Glim

> A quiet light for your Markdown tabs  
> 一个安静的阅读微光 —— 多标签 Markdown 阅读器

**English** | [简体中文](README.md)

[![release](https://img.shields.io/github/v/release/redtramp/glim?include_prereleases&color=blue)](https://github.com/redtramp/glim/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![downloads](https://img.shields.io/github/downloads/redtramp/glim/total)](https://github.com/redtramp/glim/releases)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20-experimental-lightgrey)](https://github.com/redtramp/glim/releases)

**Glim** is an active fork of https://github.com/Neilooo/md-reader, independently maintained.

- Upstream last commit: 2026-07-23, PRs have been unresponsive for an extended period
- This repository has been independently evolving since 2026-07-25 and is currently 60+ commits ahead of upstream
- The original project's MIT license and copyright notices are fully retained; modifications in this repository are released under the same MIT license

---

## Relationship with the Original Project

| | Neilooo/md-reader | Glim (this repository) |
|---|---|---|
| Status | Low activity | Actively maintained |
| Platforms | Windows primarily | Windows + macOS / Linux experimental builds |
| Additions | - | Multi-tab enhancements, lazy-loading file tree, floating layout, CriticMarkup annotations, review panel, AI panel |
| License | MIT | MIT (includes original copyright) |

If you only need basic functionality, you may continue using the original project. If you need multi-tab enhancements, ongoing fixes, and new interactions, Glim is here for you.

Original copyright: © 2026 Neilooo  
Modification copyright: © 2026 redtramp

---

## Introduction

Glim is a lightweight, fast, WYSIWYG Markdown desktop reader and editor, built with **Tauri 2 + Vue 3 + Rust**.

Small footprint (~10 MB), fast startup, with support for multi-tabs, source editing, formulas, diagrams, code highlighting, a lazy-loading file tree, full-text search, and PDF / HTML / DOCX export plus printing.

📦 **https://github.com/redtramp/glim/releases/latest**

---

## Key Features

### Floating Layout (default)
- 40px floating left toolbar + right section-marker rail, full-width immersive reading without sidebars compressing content
- 15 icon buttons grouped by navigation / content / actions / tools: file tree, recent, search, annotations, bookmarks, new file, open file, open folder, export, edit/preview toggle, AI, settings, help, language toggle, theme toggle
- Language toggle button (🌐) dynamically shows current language ("中"/"En"), click to switch between Chinese and English UI
- Theme toggle button (🌓) one-click switch between light and dark themes
- Edit/preview toggle button (✎/👁) dynamically changes icon based on current mode
- Right section markers: current / read / unread status dots plus bookmark squares, click to jump, hover shows title tooltip, scroll-synced highlight
- Outline display reworked: the former right-side outline panel (TocPanel / RightRail) was removed in favor of a bottom-right capsule mini-TOC (TocCapsule) plus the right section markers; the heading list expands on demand as a floating overlay without consuming reading width
- Floating top tab bar always visible, still allows document switching in edit mode
- 8 frosted-glass floating panels: file tree, recent, full-text search, annotations, bookmarks, AI assistant, quick settings, help documentation
- Help panel: usage guide, shortcut list, tab operations, annotation features, search features
- Outline panel supports title search, Ctrl+click collapse, parent-heading level highlight
- Responsive breakpoints for desktop / tablet / phone; mobile bottom toolbar with bottom-sheet panels
- Classic / floating dual layouts switchable, preference persisted

### Multi-Tabs
- Open multiple Markdown files simultaneously, switch via the horizontal tab bar below the toolbar
- Click to switch, middle-click to close; reopening an already open file focuses on the existing tab rather than duplicating it
- Each tab independently retains content, unsaved drafts, edit/preview mode, outline, and scroll position — everything is restored on switch
- Automatically restores the last opened tab list and active tab after app restart
- Close other / left / right tabs

### Reading
- CommonMark + GitHub Flavored Markdown
- YAML Front Matter parsing and preview
- Code syntax highlighting (highlight.js)
- Math formulas (KaTeX, loaded on demand)
- Flowcharts / sequence diagrams / mind maps and more (Mermaid)
- Task lists / footnotes / Emoji / heading anchors
- Light / dark theme switching with theme preference persistence
- Adjustable reading font size, line height, width, and font family (custom fonts and system fonts supported)

### Editing
- CodeMirror 6 source editing mode
- One-click toggle between preview and edit (`Ctrl+E`), with synchronized viewport position based on source lines
- Formatting shortcuts: bold / italic / underline / highlight / inline code
- Find & replace (`Ctrl+F` / `Ctrl+H`) and go-to-line (`Ctrl+G`)
- `Ctrl+V` to paste images in edit mode, automatically saving and inserting links
- Unsaved changes protection

### Annotations & Review
- **CriticMarkup annotations**: select text to reveal a floating toolbar (grouped into Clipboard / AI / Annotations bands, a frosted-glass overlay), supporting deletion, insertion, substitution, highlighting, and comments — instantly applied as CriticMarkup syntax
- **Review panel**: parses annotations in the document, displaying each by type, line number, and content; supports accept/reject individually or accept/reject all; click an entry to focus the corresponding line
- **One-click copy to AI**: fills the full document (with annotations) into a template, writes to the clipboard for pasting into an AI chat

### AI Panel
- Execute **summarize, translate, explain** on selected text, or **rewrite** the full document based on annotations
- Results rendered in Markdown, with copy-result and apply-to-document support
- Supports 5 providers: **Ollama** (local default, no API Key), **OpenAI-compatible** (including DeepSeek / Zhipu / Volcengine / OpenRouter), **Anthropic Claude**, **Azure OpenAI**, and **Google Gemini** (the latter four require an API Key)
- Provider-specific example URLs and fill-in hints; editing any config field auto-enables the panel
- Azure requires a deployment name; endpoint URLs auto-complete paths like `/chat/completions`
- Configuration persisted, requests routed through the Tauri http plugin to bypass CSP/CORS restrictions

### Navigation
- Floating file tree (🗂): **lazy-loading, non-recursive** — only lists direct children of the current directory, directories collapsed by default, clicking the caret loads the next level on demand; the `..` entry at the top goes up one level
- Floating panels: file tree / recent / full-text search / annotations / bookmarks / AI assistant / quick settings
- Right section markers + bottom-right capsule mini-TOC (TocCapsule): scroll-synchronized highlighting, collapsible, supports title search; the outline stays as a small capsule that expands into a floating heading list
- Internal link navigation and relative path resolution for images
- With a history document, the file tree is rooted at the document's directory; without one, it shows the user's home directory

### Search
- `Ctrl+F` for current document search, `Ctrl+H` for find & replace
- `Ctrl+Shift+F` for cross-file full-text search (high-speed Rust backend, results grouped by file)

### Export & Print
- **PDF**: Edge headless, WYSIWYG
- **HTML**: Self-contained single file with all resources embedded
- **DOCX**: Pandoc-based route with Word reference template support
- **Print**: `Ctrl+P` to print the current document directly

### Experience
- Independent font size, line height, width, and font family for reading and editing
- Customizable keyboard shortcuts with conflict detection and reset
- File change monitoring with automatic file tree refresh
- External modification detection: a prompt appears when a file is modified outside the app, with options to view the diff, reload, or ignore
- Recent files and scroll position persistence
- File association: double-click `.md / .markdown / .mdx` to open directly, re-registrable in Settings
- Single-instance operation, open files from command line / drag-and-drop
- Simplified Chinese / English UI switching (🌐 button in left floating menu, current language dynamically shown)
- Update checking with one-click navigation to the download page

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+E` | Toggle preview / edit mode |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+L` | Highlight |
| `` Ctrl+Shift+` `` | Inline code |
| `Ctrl+F` | Search in current document |
| `Ctrl+H` | Find & replace |
| `Ctrl+G` | Go to line |
| `Ctrl+Shift+F` | Full-text search (sidebar) |
| `Ctrl+Shift+C` | Copy annotations to AI |
| `Ctrl+D` | Toggle bookmark |
| `Ctrl+E` | Open file tree panel |
| `Ctrl+Shift+A` | Open annotations panel |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+P` | Print |
| `Ctrl+,` | Open settings |
| `Ctrl+= / - / 0` | Zoom in / zoom out / reset font size |
| `Ctrl+Wheel` | Zoom font size |
| `Esc` | Close modal |

> Shortcuts can be viewed and customized in "Settings → View Shortcuts".

---

## Settings

- Reading & editor font size, line height, max width, and font family (built-in + system + custom fonts)
- Floating layout toggle (classic / floating dual layouts)
- Settings dialog split into "Reading / AI / Other" tabs; the AI tab configures Ollama / OpenAI-compatible / Anthropic / Azure / Gemini service URL, API Key, and model or deployment name
- Word export reference template (.docx)
- File association registration (`.md / .markdown / .mdx`)
- View / customize keyboard shortcuts
- Check for updates
- Theme and UI language switching

---

## Installation

### Windows (Recommended)
- `glim-reader-*-windows-x64-setup.msi`: Installer version, automatically registers file associations
- `glim-reader-*-windows-x64-portable.exe`: Portable version, extract and run

### macOS / Linux (Experimental)
- macOS: `.dmg` / `.app.tar.gz`
- Linux: `.AppImage` / `.deb` / `.rpm`

> The experimental builds are unsigned. On macOS, right-click to open or run `xattr -dr com.apple.quarantine "Glim.app"`.

---

## Development

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

Requirements: Node.js ≥ 18, pnpm ≥ 8, Rust ≥ 1.77, WebView2 Runtime, VS Build Tools.

---

## Tech Stack

Tauri 2 · Vue 3 · TypeScript · Vite · markdown-it · CodeMirror 6 · KaTeX · Mermaid · highlight.js · vue-i18n · pandoc · notify · tauri-plugin-single-instance / dialog / fs / opener / http / window-state / system-fonts

---

## License

MIT © 2026 Neilooo & redtramp
