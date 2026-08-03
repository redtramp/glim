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
| Additions | - | Close other tabs, export menu refactor, dependency upgrades, Mermaid rendering fixes |
| License | MIT | MIT (includes original copyright) |

If you only need basic functionality, you may continue using the original project. If you need multi-tab enhancements, ongoing fixes, and new interactions, Glim is here for you.

Original copyright: © 2026 Neilooo  
Modification copyright: © 2026 redtramp

---

## Introduction

Glim is a lightweight, fast, WYSIWYG Markdown desktop reader and editor, built with **Tauri 2 + Vue 3 + Rust**.

Small footprint (~10 MB), fast startup, with support for multi-tabs, source editing, formulas, diagrams, code highlighting, file tree, full-text search, and PDF / HTML / DOCX export.

📦 **https://github.com/redtramp/glim/releases/latest**

---

## Key Features

### Multi-Tabs
- Open multiple Markdown files simultaneously, switch via the horizontal tab bar below the toolbar
- Click to switch, middle-click to close; reopening an already open file focuses on the existing tab rather than duplicating it
- Each tab independently retains content, unsaved drafts, edit/preview mode, outline, and scroll position — everything is restored on switch
- Automatically restores the last opened tab list and active tab after app restart
- One-click close other tabs

### Reading
- CommonMark + GitHub Flavored Markdown
- YAML Front Matter parsing and preview
- Code syntax highlighting (highlight.js, 30+ languages)
- Math formulas (KaTeX, loaded on demand)
- Flowcharts / sequence diagrams / mind maps (Mermaid, ✨ fixed C4Dynamic / C4Deployment rendering)
- Task lists / footnotes / Emoji / heading anchors
- Light / dark theme switching with theme preference persistence
- Customizable reading font

### Editing
- CodeMirror 6 source editing mode
- One-click toggle between preview and edit (`Ctrl+E`), with synchronized viewport position based on source lines
- Markdown formatting shortcuts
- `Ctrl+V` to paste images in edit mode, automatically saving and inserting links
- Unsaved changes protection

### Navigation
- Left-side file tree with recursive folder scanning
- Outline (TOC) with scroll-synchronized highlighting and collapsible hierarchical sections
- Three-column draggable dividers with independent show/hide controls
- Internal link navigation and relative path resolution for images

### Search
- `Ctrl+F` for current document search
- `Ctrl+Shift+F` for cross-file full-text search (high-speed Rust backend)

### Export
- **PDF**: Edge headless, WYSIWYG
- **HTML**: Self-contained single file with all resources embedded
- **DOCX**: Pandoc-based route with Word template customization support

### Experience
- Adjustable font size, line height, width, and font for both reading and editing
- Customizable keyboard shortcuts with conflict detection
- File change monitoring with auto-refresh
- Recent files and scroll position persistence
- File association: double-click `.md / .markdown / .mdx` to open directly
- Single-instance operation, drag-and-drop files to open
- Simplified Chinese / English UI switching
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
| `Ctrl+F` | Current document search |
| `Ctrl+Shift+F` | Full-text search |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+= / - / 0` | Zoom in / zoom out / reset font |
| `Esc` | Close modal |

> Shortcuts can be customized in "Settings → View Shortcuts".

---

## Installation

### Windows (Recommended)
- `Glim-*-windows-x64-setup.msi`: Installer version, automatically registers file associations
- `Glim-*-windows-x64-portable.exe`: Portable version, extract and run

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

Tauri 2 · Vue 3 · TypeScript · Vite · markdown-it · CodeMirror 6 · KaTeX · Mermaid · highlight.js · pandoc · notify · tauri-plugin-single-instance · vue-i18n

---

## License

MIT © 2026 Neilooo & redtramp
