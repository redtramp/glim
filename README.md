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
| 新增 | - | 多标签增强、懒加载文件树、悬浮布局、CriticMarkup 批注、审阅面板、AI 面板 |
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

### 悬浮布局（默认）
- 左侧 40px 悬浮工具栏 + 右侧章节标记点窄条，正文全宽沉浸阅读，不因侧栏被压缩
- 15 个图标按钮，按导航 / 内容 / 动作 / 工具分组：文件树、最近文档、搜索、批注列表、书签、新建、打开文件、打开文件夹、导出、编辑/预览切换、AI、设置、帮助、语言切换、主题切换
- 语言切换按钮（🌐）动态显示当前语言（"中"/"En"），点击立即切换中英文界面
- 主题切换按钮（🌓）一键切换亮色/暗色主题
- 编辑/预览切换按钮（✎/👁）根据当前模式动态变换图标
- 右侧章节标记点：当前章节 / 已读 / 未读状态圆点 + 书签方块，点击跳转、悬停显示标题 tooltip、滚动联动高亮
- 大纲展示重构：移除原右侧独立大纲栏（TocPanel / RightRail），改为右下角胶囊迷你目录（TocCapsule）+ 右侧章节标记点；标题列表按需悬浮展开，不占用正文宽度
- 顶部悬浮 Tab 条常驻显示，编辑模式下仍可切换文档
- 8 个磨砂玻璃浮层面板：文件树、最近文档、全文搜索、批注列表、书签、AI 助手、快速设置、帮助文档
- 帮助面板：使用说明、快捷键列表、标签页操作、批注功能、搜索功能
- 大纲浮层支持标题搜索、Ctrl+点击折叠、父标题层级高亮
- 响应式断点：桌面 / 平板 / 手机四档，移动端底部工具栏 + 浮层底部弹出
- 经典 / 悬浮双布局可切换，偏好持久化

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
- **CriticMarkup 批注**：选中文本后浮动工具栏出现（剪贴板 / AI / 批注三带分组，磨砂玻璃浮层），支持删除、新增、替换、高亮、评论五种批注类型，即时应用 CriticMarkup 语法标记
- **审阅面板**：解析文档中的批注，逐条显示类型、行号、内容，支持逐条接受/拒绝与全部接受/全部拒绝，点击条目聚焦到文档对应行
- **一键复制给 AI**：将全文（含批注）填入模板，写入剪贴板，供用户粘贴到 AI 对话审阅

### AI 面板
- 选中文本后执行**摘要、翻译、解释**，或按批注**改写**全文
- 结果以 Markdown 渲染展示，支持复制结果与应用到文档
- 支持 5 类服务：**Ollama**（本地默认，无需 API Key）、**OpenAI 兼容**（含 DeepSeek / 智谱 / 火山方舟 / OpenRouter 等）、**Anthropic Claude**、**Azure OpenAI**、**Google Gemini**（后四类需 API Key）
- 按服务类型给出常见服务地址示例与填写提示；编辑任一配置项即自动启用面板
- Azure 需填写部署名称；服务地址支持自动补全 `/chat/completions` 等接口路径
- 配置持久化，经 Tauri http 插件绕过 CSP/CORS 限制

### 导航
- 左侧悬浮文件树（🗂）：**懒加载、非递归**——只列当前目录的直接子项，目录默认折叠，点击三角符号才加载下一级；顶部 `..` 可返回上一级目录
- 左侧悬浮面板：文件树 / 最近文档 / 全文搜索 / 批注列表 / 书签 / AI 助手 / 快速设置
- 右侧章节标记点 + 右下角胶囊迷你目录（TocCapsule）：滚动同步高亮，可折叠，支持标题搜索；大纲以小胶囊形式常驻，展开为悬浮标题列表
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
- 简体中文 / English 界面切换（左侧悬浮菜单 🌐 按钮，当前语言动态显示）
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
| `Ctrl+D` | 添加 / 删除书签 |
| `Ctrl+E` | 打开文件树浮层 |
| `Ctrl+Shift+A` | 打开批注列表浮层 |
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
- 悬浮布局开关（经典 / 悬浮双布局切换）
- 设置面板分「阅读 / AI / 其他」三个标签页；AI 标签页配置 Ollama / OpenAI 兼容 / Anthropic / Azure / Gemini 的服务地址、API Key、模型或部署名称
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
