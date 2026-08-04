# Glim

> 一个安静的阅读微光 —— 多标签 Markdown 阅读器  
> A quiet light for your Markdown tabs

**简体中文** | [English](README.en.md)

[![release](https://img.shields.io/github/v/release/redtramp/glim?include_prereleases&color=blue)](https://github.com/redtramp/glim/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![downloads](https://img.shields.io/github/downloads/redtramp/glim/total)](https://github.com/redtramp/glim/releases)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20-experimental-lightgrey)](https://github.com/redtramp/glim/releases)

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
| 新增 | - | 多标签增强、懒加载文件树、三模式侧栏、查找替换、打印导出、Word 模板、检查更新、快捷键自定义、CriticMarkup 批注、审阅面板、AI 面板 |
| 协议 | MIT | MIT（含原版权） |

如果你仅需基础功能，可继续使用原项目；如需多标签增强、持续修复与新交互，欢迎使用 Glim。

原始版权：© 2026 Neilooo  
修改版权：© 2026 redtramp

---

## 简介

Glim 是一个轻量、快速、所见即所得的 Markdown 桌面阅读器与编辑器，基于 **Tauri 2 + Vue 3 + Rust** 构建。

体积小（约 10 MB），启动快，支持多标签页、源码编辑、公式、图表、代码高亮、懒加载文件树、全文搜索，以及 PDF / HTML / DOCX 导出与打印。

📦 **https://github.com/redtramp/glim/releases/latest**

---

## 主要特性

### 多标签页
- 同时打开多个 Markdown 文件，工具栏下方水平标签栏切换
- 点击切换、中键关闭，再次打开已打开的文件会聚焦到对应标签而非重复打开
- 每个标签独立保留内容、未保存草稿、编辑/预览模式、大纲和滚动位置，切换即恢复现场
- 应用重启后自动恢复上次打开的标签列表与激活项
- 关闭其他 / 左侧 / 右侧标签

### 阅读
- CommonMark + GitHub Flavored Markdown
- YAML Front Matter 解析与预览
- 代码语法高亮（highlight.js）
- 数学公式（KaTeX，按需加载）
- 流程图 / 时序图 / 思维导图等（Mermaid）
- 任务列表 / 脚注 / Emoji / 标题锚点
- 亮 / 暗主题切换，记忆主题偏好
- 阅读字号、行高、宽度、字体可调（支持自定义字体与系统字体）

### 编辑
- CodeMirror 6 源码编辑模式
- 预览 / 编辑一键切换（`Ctrl+E`），按源码行同步视口位置
- 加粗 / 斜体 / 下划线 / 高亮 / 行内代码等格式化快捷键
- 查找替换（`Ctrl+F` / `Ctrl+H`）与跳转行（`Ctrl+G`）
- 编辑模式下 `Ctrl+V` 粘贴图片，自动保存并插入链接
- 未保存修改保护

### 批注与审阅
- **CriticMarkup 批注**：选中文本后浮动工具栏出现，支持删除、新增、替换、高亮、评论五种批注类型，即时应用 CriticMarkup 语法标记
- **审阅面板**：解析文档中的批注，逐条显示类型、行号、内容，支持逐条接受/拒绝与全部接受/全部拒绝，点击条目聚焦到文档对应行
- **一键复制给 AI**：将全文（含批注）填入模板，写入剪贴板，供用户粘贴到 AI 对话审阅

### AI 面板
- 选中文本后执行**摘要、翻译、解释**，或按批注**改写**全文
- 结果以 Markdown 渲染展示，支持复制结果与应用到文档
- 支持 **Ollama**（本地默认，无需 API Key）与 **OpenAI 兼容**服务（需 API Key）
- 配置持久化，经 Tauri http 插件绕过 CSP/CORS 限制

### 导航
- 左侧文件树：**懒加载、非递归**——只列当前目录的直接子项，目录默认折叠，点击三角符号才加载下一级；顶部 `..` 可返回上一级目录
- 左侧面板三种模式：文件树 / 全文搜索 / 大纲，一键切换
- 大纲（TOC）滚动同步高亮，可折叠，可置于左侧或右侧
- 三栏可拖拽分隔条，侧栏与目录独立显隐
- 内部链接跳转与图片相对路径解析
- 有历史文档时文件树定位到文档所在目录；无历史文档时显示用户主目录

### 查找
- `Ctrl+F` 当前文档查找，`Ctrl+H` 查找替换
- `Ctrl+Shift+F` 跨文件全文搜索（Rust 后端高速，结果按文件分组）

### 导出与打印
- **PDF**：Edge headless，所见即所得
- **HTML**：自包含单文件，资源全部内嵌
- **DOCX**：pandoc 路线，支持 Word 参考模板定制
- **打印**：`Ctrl+P` 直接打印当前文档

### 体验
- 阅读与编辑器字号、行高、宽度、字体独立可调
- 快捷键自定义，冲突检测与重置
- 文件变更监听，自动刷新文件树
- 外部修改检测：文件被外部程序修改时提示，可查看差异、重新加载或忽略
- 最近文件与滚动位置记忆
- 文件关联：双击 `.md / .markdown / .mdx` 直接打开，可在设置中重新注册
- 单例运行，命令行 / 拖拽打开文件
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
| `Ctrl+H` | 查找替换 |
| `Ctrl+G` | 跳转到行 |
| `Ctrl+Shift+F` | 全文搜索（左侧面板） |
| `Ctrl+Shift+C` | 复制批注给 AI |
| `Ctrl+Shift+A` | 打开 AI 面板 |
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+P` | 打印 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+= / - / 0` | 放大 / 缩小 / 重置字号 |
| `Ctrl+滚轮` | 缩放字号 |
| `Esc` | 关闭弹窗 |

> 快捷键可在「设置 → 查看快捷键」中查看与自定义。

---

## 设置

- 阅读与编辑字号、行高、最大宽度、字体（内置字体 + 系统字体 + 自定义）
- 大纲（TOC）位置：左侧 / 右侧
- AI 提供商配置：Ollama 地址 / OpenAI 兼容 API Key 与端点
- Word 导出参考模板（.docx）
- 文件关联注册（`.md / .markdown / .mdx`）
- 查看 / 自定义快捷键
- 检查更新
- 主题与界面语言切换

---

## 安装

### Windows（推荐）
- `glim-reader-*-windows-x64-setup.msi`：安装版，自动注册文件关联
- `glim-reader-*-windows-x64-portable.exe`：绿色版，解压即用

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

Tauri 2 · Vue 3 · TypeScript · Vite · markdown-it · CodeMirror 6 · KaTeX · Mermaid · highlight.js · vue-i18n · pandoc · notify · tauri-plugin-single-instance / dialog / fs / opener / http / window-state / system-fonts

---

## 许可

MIT © 2026 Neilooo & redtramp
