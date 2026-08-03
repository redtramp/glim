# Glim

> 一个安静的阅读微光 —— 多标签 Markdown 阅读器  
> A quiet light for your Markdown tabs

**简体中文** | [English](README.en.md)

https://img.shields.io/github/v/release/redtramp/glim?include_prereleases&color=blue](https://github.com/redtramp/glim/releases)
https://img.shields.io/badge/license-MIT-green](LICENSE)
https://img.shields.io/github/downloads/redtramp/glim/total](https://github.com/redtramp/glim/releases)
https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20(experimental-lightgrey)]()

**Glim 是 https://github.com/Neilooo/md-reader 的独立维护分支（active fork）。**

- 上游最后提交：2026-07-23，PR 长期无响应
- 本仓库自 2026-07-25 起独立演进，当前领先上游 60+ commits
- 原项目 MIT 协议与版权声明完整保留，本仓库修改部分以相同 MIT 协议发布

---

## 与原项目关系

| | Neilooo/md-reader | Glim（本仓库） |
|---|---|---|
| 状态 | 低活跃 | 主动维护 |
| 平台 | Windows 为主 | Windows + macOS / Linux 实验构建 |
| 新增 | - | 关闭其他标签、导出菜单重构、依赖升级、Mermaid 渲染修复 |
| 协议 | MIT | MIT（含原版权） |

如果你仅需基础功能，可继续使用原项目；如需多标签增强、持续修复与新交互，欢迎使用 Glim。

原始版权：© 2026 Neilooo  
修改版权：© 2026 redtramp

---

## 简介

Glim 是一个轻量、快速、所见即所得的 Markdown 桌面阅读器与编辑器，基于 **Tauri 2 + Vue 3 + Rust** 构建。

体积小（约 10 MB），启动快，支持多标签页、源码编辑、公式、图表、代码高亮、文件树、全文搜索、PDF / HTML / DOCX 导出。

📦 **https://github.com/redtramp/glim/releases/latest**

---

## 主要特性

### 多标签页
- 同时打开多个 Markdown 文件，工具栏下方水平标签栏切换
- 点击切换、中键关闭，再次打开已打开的文件会聚焦到对应标签而非重复打开
- 每个标签独立保留内容、未保存草稿、编辑/预览模式、大纲和滚动位置，切换即恢复现场
- 应用重启后自动恢复上次打开的标签列表与激活项
- 一键关闭其他标签

### 阅读
- CommonMark + GitHub Flavored Markdown
- YAML Front Matter 解析与预览
- 代码语法高亮（highlight.js，30+ 语言）
- 数学公式（KaTeX，按需加载）
- 流程图 / 时序图 / 思维导图（Mermaid，✨ 修复 C4Dynamic / C4Deployment 渲染）
- 任务列表 / 脚注 / Emoji / 标题锚点
- 亮 / 暗主题切换，记忆主题偏好
- 可自定义阅读字体

### 编辑
- CodeMirror 6 源码编辑模式
- 预览 / 编辑一键切换（`Ctrl+E`），按源码行同步视口位置
- Markdown 格式化快捷键
- 编辑模式下 `Ctrl+V` 粘贴图片，自动保存并插入链接
- 未保存修改保护

### 导航
- 左侧文件树，递归扫描文件夹
- 大纲（TOC）滚动同步高亮，支持分级展开折叠
- 三栏可拖拽分隔条，独立显隐
- 内部链接跳转与图片相对路径解析

### 查找
- `Ctrl+F` 当前文档查找
- `Ctrl+Shift+F` 跨文件全文搜索（Rust 后端高速）

### 导出
- **PDF**：Edge headless，所见即所得
- **HTML**：自包含单文件，资源全部内嵌
- **DOCX**：pandoc 路线，支持 Word 模板定制

### 体验
- 阅读与编辑器字号、行高、宽度、字体可调
- 快捷键自定义，冲突检测
- 文件变更监听，自动刷新
- 最近文件与滚动位置记忆
- 文件关联：`.md / .markdown / .mdx` 双击直接打开
- 单例运行，拖拽文件直接打开
- 简体中文 / English 界面切换
- 检查更新，一键跳转下载页

---

## 快捷键

| 键 | 动作 |
|---|---|
| `Ctrl+E` | 切换预览 / 编辑模式 |
| `Ctrl+B` | 加粗 |
| `Ctrl+I` | 斜体 |
| `Ctrl+U` | 下划线 |
| `Ctrl+L` | 高亮 |
| `` Ctrl+Shift+` `` | 行内代码 |
| `Ctrl+F` | 当前文档查找 |
| `Ctrl+Shift+F` | 全文搜索 |
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+= / - / 0` | 放大 / 缩小 / 重置字体 |
| `Esc` | 关闭弹窗 |

> 快捷键可在「设置 → 查看快捷键」中自定义。

---

## 安装

### Windows（推荐）
- `Glim-*-windows-x64-setup.msi`：安装版，自动注册文件关联
- `Glim-*-windows-x64-portable.exe`：绿色版，解压即用

### macOS / Linux（实验版）
- macOS：`.dmg` / `.app.tar.gz`
- Linux：`.AppImage` / `.deb` / `.rpm`

> 实验版未签名，macOS 需右键打开或执行 `xattr -dr com.apple.quarantine "Glim.app"`。

---

## 开发

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

环境要求：Node.js ≥ 18、pnpm ≥ 8、Rust ≥ 1.77、WebView2 Runtime、VS Build Tools。

---

## 技术栈

Tauri 2 · Vue 3 · TypeScript · Vite · markdown-it · CodeMirror 6 · KaTeX · Mermaid · highlight.js · pandoc · notify · tauri-plugin-single-instance · vue-i18n

---

## 许可

MIT © 2026 Neilooo & redtramp
