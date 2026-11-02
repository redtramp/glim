<script lang="ts">
  /**
   * SettingsDialog.vue → .svelte 迁移要点:
   * - defineProps{visible,floatLayoutEnabled} / defineEmits{close,toggle-float-layout}
   *   → Props + 回调 props onClose / onToggleFloatLayout（源码仅 2 个 emit、2 个 prop，
   *     与任务简报所写"8+ props / 5+ emits"不符，以源码为准）
   * - 3 处 watch(props.visible) → 1 个 $effect：打开时重读模板/AI 配置并装载系统字体，
   *   关闭时收起快捷键弹层；loadFonts 内部读 systemFonts，用 untrack 避免字体就绪后重跑
   * - onMounted(loadCurrentVersion) → onMount（回调不返回 Promise）
   * - computed → $derived / $derived.by；v-show → {#if}（Tab 面板无本地状态，
   *   display 切换与卸载重挂的 panel-in 动画表现一致）
   * - useReadingSettings 解构会固化 settings 快照 → 持有 rs（QuickSettings 同款，Ruling 10）
   * - @click.self → e.target === e.currentTarget（ShortcutsDialog / GrantAccessDialog 先例）
   * - 互斥类串：Tab 激活态、btn/btn primary、association/association column、状态色，
   *   同名工具类（border-b-transparent/border-b-link、grid/flex）分属不同串，避免顺序不定
   * - ShortcutsDialog.vue → .svelte 裸导入；@keyframes panel-in → app.css 全局 panelIn
   */
  import { onMount, untrack } from "svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  // 版本检查走 Tauri http 插件而非 webview fetch:打包版 CSP connect-src
  // 为 default-src 'self',webview fetch 会被拦截导致更新检查恒失败。
  import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
  import { t } from "../i18n/locale.svelte.ts";
  import { useReadingSettings } from "../composables/useReadingSettings.svelte.ts";
  import {
    getCachedPandocRefDoc,
    setCachedPandocRefDoc,
  } from "../composables/useExport";
  import ShortcutsDialog from "./ShortcutsDialog.svelte";
  import {
    getAITemplate,
    setAITemplate,
    resetAITemplate,
    DEFAULT_AI_TEMPLATE,
  } from "../composables/useAnnotations.svelte.ts";
  import {
    getAiSettings,
    setAiSettings,
    resetAiSettings,
    type AiProvider,
    type AiSettings,
  } from "../composables/aiProvider";

  const RELEASE_API =
    "https://api.github.com/repos/redtramp/glim/releases/latest";
  const RELEASE_LATEST_URL =
    "https://github.com/redtramp/glim/releases/latest";

  type UpdateStatus = "idle" | "checking" | "latest" | "available" | "error";

  interface LatestRelease {
    tag_name?: string;
    html_url?: string;
  }

  interface Props {
    visible: boolean;
    floatLayoutEnabled?: boolean;
    onClose?: () => void;
    onToggleFloatLayout?: () => void;
  }

  let {
    visible,
    floatLayoutEnabled,
    onClose,
    onToggleFloatLayout,
  }: Props = $props();

  const rs = useReadingSettings();

  let showShortcuts = $state(false);
  /** 设置面板 Tab:阅读 / AI / 其他 */
  type SettingsTab = "reading" | "ai" | "other";
  let activeTab = $state<SettingsTab>("reading");

  /* 阅读设置行的 label↔控件关联 id（svelte-check a11y_label_has_associated_control;
     $props.id() 每组件仅允许调用一次，按行派生后缀） */
  const uid = $props.id();
  const fontSizeId = `${uid}-font-size`;
  const editorFontSizeId = `${uid}-editor-font-size`;
  const lineHeightId = `${uid}-line-height`;
  const maxWidthId = `${uid}-max-width`;
  const fontFamilyId = `${uid}-font-family`;
  const fontCustomId = `${uid}-font-custom`;
  const editorFontFamilyId = `${uid}-editor-font-family`;
  const editorFontCustomId = `${uid}-editor-font-custom`;
  const floatLayoutId = `${uid}-float-layout`;

  let associationBusy = $state(false);
  let associationStatus = $state<"" | "success" | "error">("");
  let associationMessage = $state("");
  let currentVersion = $state("");
  let updateStatus = $state<UpdateStatus>("idle");
  let updateMessage = $state("");
  let latestVersion = $state("");
  let latestReleaseUrl = $state(RELEASE_LATEST_URL);
  const updateBusy = $derived(updateStatus === "checking");

  function normalizeVersion(version: string): string {
    return version.trim().replace(/^v/i, "");
  }

  function parseVersion(version: string) {
    const [core, pre = ""] = normalizeVersion(version).split("-", 2);
    const nums = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
    return {
      major: nums[0] ?? 0,
      minor: nums[1] ?? 0,
      patch: nums[2] ?? 0,
      pre,
    };
  }

  function compareVersions(a: string, b: string): number {
    const av = parseVersion(a);
    const bv = parseVersion(b);
    for (const key of ["major", "minor", "patch"] as const) {
      if (av[key] > bv[key]) return 1;
      if (av[key] < bv[key]) return -1;
    }
    if (av.pre === bv.pre) return 0;
    if (!av.pre) return 1;
    if (!bv.pre) return -1;
    return av.pre.localeCompare(bv.pre, undefined, { numeric: true });
  }

  async function loadCurrentVersion() {
    try {
      currentVersion = await getVersion();
    } catch {
      currentVersion = "";
    }
  }

  async function fetchLatestRelease(): Promise<LatestRelease> {
    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await tauriFetch(RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LatestRelease;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function checkForUpdates() {
    updateStatus = "checking";
    updateMessage = "";
    try {
      if (!currentVersion) await loadCurrentVersion();
      if (!currentVersion)
        throw new Error(t("settings.versionUnavailable"));

      const release = await fetchLatestRelease();
      const remoteTag = release.tag_name || "";
      if (!remoteTag) throw new Error("Missing tag_name");

      latestVersion = normalizeVersion(remoteTag);
      latestReleaseUrl = release.html_url || RELEASE_LATEST_URL;

      if (compareVersions(latestVersion, currentVersion) > 0) {
        updateStatus = "available";
        updateMessage = t("settings.updateAvailable", {
          version: latestVersion,
        });
      } else {
        updateStatus = "latest";
        updateMessage = t("settings.upToDate", {
          version: currentVersion,
        });
      }
    } catch (e: unknown) {
      updateStatus = "error";
      updateMessage = `${t("settings.updateCheckFailed")}: ${e instanceof Error ? e.message : String(e)}`;
      latestReleaseUrl = RELEASE_LATEST_URL;
    }
  }

  async function openReleasePage() {
    await openUrl(latestReleaseUrl || RELEASE_LATEST_URL);
  }

  let pandocRefDoc = $state(getCachedPandocRefDoc() ?? "");

  async function pickPandocRefDoc() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (typeof selected === "string") {
      pandocRefDoc = selected;
      setCachedPandocRefDoc(selected);
    }
  }

  function clearPandocRefDoc() {
    pandocRefDoc = "";
    setCachedPandocRefDoc(null);
  }

  onMount(() => {
    void loadCurrentVersion();
  });

  /** 「复制给 AI」模板:进入设置时读取,编辑即持久化 */
  let aiTemplate = $state(getAITemplate());
  function onAiTemplateInput(e: Event) {
    aiTemplate = (e.target as HTMLTextAreaElement).value;
    setAITemplate(aiTemplate);
  }
  function restoreAiTemplate() {
    resetAITemplate();
    aiTemplate = DEFAULT_AI_TEMPLATE;
  }

  /** AI 面板设置:进入设置时读取,编辑即持久化(模式同 aiTemplate) */
  let aiSettings = $state(getAiSettings());
  function patchAiSettings(patch: Partial<AiSettings>) {
    // 写入后回读:编辑配置会触发 setAiSettings 的自动启用,回读保证复选框同步
    setAiSettings(patch);
    aiSettings = getAiSettings();
  }
  function onAiProviderChange(e: Event) {
    patchAiSettings({
      provider: (e.target as HTMLSelectElement).value as AiProvider,
    });
  }
  function restoreAiSettings() {
    resetAiSettings();
    aiSettings = getAiSettings();
  }

  /** baseUrl 输入占位:按所选服务类型给出常见地址示例 */
  const baseUrlPlaceholder = $derived.by(() => {
    switch (aiSettings.provider) {
      case "anthropic":
        return "https://api.anthropic.com";
      case "azure":
        return "https://your-resource.openai.azure.com";
      case "gemini":
        return "https://generativelanguage.googleapis.com";
      case "openai":
        return "https://api.openai.com/v1";
      default:
        return "http://localhost:11434";
    }
  });

  /** model 输入占位:按所选服务类型给出常见模型示例 */
  const modelPlaceholder = $derived.by(() => {
    switch (aiSettings.provider) {
      case "anthropic":
        return "claude-3-5-sonnet-latest";
      case "gemini":
        return "gemini-2.5-flash";
      case "openai":
        return "gpt-4o-mini";
      default:
        return "qwen2.5";
    }
  });

  /** 端点(服务地址)填写说明:紧贴输入框,按所选服务类型给出示例与拼接规则 */
  const baseUrlHint = $derived.by(() => {
    switch (aiSettings.provider) {
      case "anthropic":
        return t("settings.aiBaseUrlAnthropicHint");
      case "azure":
        return t("settings.aiBaseUrlAzureHint");
      case "gemini":
        return t("settings.aiBaseUrlGeminiHint");
      case "openai":
        return t("settings.aiBaseUrlOpenaiHint");
      default:
        return t("settings.aiBaseUrlOllamaHint");
    }
  });

  let systemFonts = $state<{ name: string }[]>([]);

  async function loadFonts() {
    if (systemFonts.length > 0) return;
    systemFonts = await rs.loadSystemFonts();
  }

  const allFontOptions = $derived.by(() => {
    const opts = rs.fontOptions as Array<{ value: string; label: string }>;
    return [
      ...opts,
      ...systemFonts.map((f) => ({ value: f.name, label: f.name })),
    ];
  });

  const allEditorFontOptions = $derived.by(() => {
    const opts = rs.editorFontOptions as Array<{
      value: string;
      label: string;
    }>;
    return [
      ...opts,
      ...systemFonts.map((f) => ({ value: f.name, label: f.name })),
    ];
  });

  async function registerAssociations() {
    associationBusy = true;
    associationStatus = "";
    associationMessage = "";
    try {
      await invoke("register_file_associations");
      associationStatus = "success";
      associationMessage = t("settings.associationSuccess");
    } catch (e) {
      associationStatus = "error";
      associationMessage = `${t("settings.associationFailed")}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      associationBusy = false;
    }
  }

  /* 原 3 处 watch(props.visible):打开时重读模板/AI 配置并装载系统字体,
     关闭时收起快捷键弹层。loadFonts 会读 systemFonts(字体就绪写回会触发
     effect 重跑),用 untrack 包裹避免字体加载完成后重跑覆盖用户编辑。 */
  $effect(() => {
    if (!visible) {
      showShortcuts = false;
      return;
    }
    aiTemplate = getAITemplate();
    aiSettings = getAiSettings();
    untrack(() => {
      void loadFonts();
    });
  });

  function onOverlayClick(e: MouseEvent): void {
    // 原 @click.self:仅点击遮罩自身时关闭
    if (e.target === e.currentTarget) onClose?.();
  }

  /* —— 互斥类串（同名工具类同 layer 内顺序不可控，按态拆完整类串） —— */

  /* 设置 Tab:基础态带 hover 换色,激活态带下划线/字重且不参与 hover */
  const TAB_BASE =
    "settings-tab px-4 py-[7px] bg-transparent border-none border-b-2 " +
    "border-b-solid -mb-px text-fg-muted text-[12.5px] cursor-pointer " +
    "transition-[color,border-color] duration-[120ms] ease-[ease]";
  const TAB_REST = TAB_BASE + " border-b-transparent hover:text-fg";
  const TAB_ACTIVE = TAB_BASE + " border-b-link text-link font-semibold";

  /* 阅读设置三列行:标签(80px) / 控件(1fr) / 数值(60px) */
  const ROW =
    "row grid grid-cols-[80px_1fr_60px] items-center gap-3 my-2.5 text-xs";

  /* 自定义字体名输入:占两列(原 .text-input grid-column: 2 / span 2) */
  const TEXT_INPUT =
    "text-input col-start-2 col-span-2 px-2 py-1 bg-bg-btn text-fg " +
    "border border-border rounded text-xs outline-none focus:border-link";

  /* 分区行:标题+说明在左,操作在右;column 变体单列拉伸(AI 面板) */
  const ASSOC =
    "association grid grid-cols-[1fr_auto] items-center gap-4 mt-4.5 " +
    "pt-3.5 border-t border-border";
  const ASSOC_COLUMN =
    "association grid grid-cols-1 items-stretch gap-4 mt-4.5 pt-3.5 " +
    "border-t border-border";

  /* 状态行:success/error 互斥换色,均不与基础态叠加 */
  const STATUS_BASE = "association-status mt-1.5 text-[12px]";
  const STATUS_OK = STATUS_BASE + " text-link";
  const STATUS_ERR = STATUS_BASE + " text-[color:var(--mdr-danger)]";

  const updateStatusCls = $derived(
    updateStatus === "available" || updateStatus === "latest"
      ? STATUS_OK
      : updateStatus === "error"
        ? STATUS_ERR
        : STATUS_BASE
  );
  const assocStatusCls = $derived(
    associationStatus === "success"
      ? STATUS_OK
      : associationStatus === "error"
        ? STATUS_ERR
        : STATUS_BASE
  );

  /* 路径展示:RTL 截断(原样保留 direction/unicode-bidi 两个任意属性) */
  const REF_DOC_PATH =
    "ref-doc-path inline-block max-w-[240px] overflow-hidden " +
    "text-ellipsis whitespace-nowrap align-bottom " +
    "[direction:rtl] [unicode-bidi:plaintext]";

  /* 普通按钮与 primary 互斥:primary 与原 .btn.primary 同权覆盖 hover 换色,
     故 primary 不带 hover:bg-*;active 仅为原模板保留的标记类(原样式无对应规则) */
  const BTN =
    "btn text-[13px] px-3.5 py-[5px] border border-border bg-bg-btn " +
    "text-fg rounded-md cursor-pointer hover:bg-bg-btn-hover";
  const BTN_PRIMARY =
    "btn primary text-[13px] px-3.5 py-[5px] border border-link bg-link " +
    "text-white rounded-md cursor-pointer";

  /* AI 配置行:标签列固定右对齐 / 控件列等宽(grid);整行开关改 flex 不带 grid */
  const AI_ROW =
    "ai-row grid grid-cols-[108px_1fr] gap-x-[14px] items-center " +
    "text-xs mb-3 last:mb-0";
  const AI_ROW_FULL =
    "ai-row ai-row-full flex items-center gap-[9px] text-xs mb-3 last:mb-0";
  const AI_ROW_LABEL =
    "col-start-1 text-right text-fg-muted";
  const AI_CTRL =
    "ai-ctrl col-start-2 w-full px-[9px] py-[5px] border border-border " +
    "rounded-md bg-bg-btn text-fg text-[11.5px] box-border outline-none " +
    "[font-family:var(--ui-font)] focus:border-link";
  const AI_CTRL_SELECT = AI_CTRL + " max-h-[200px]";
  const AI_TEMPLATE =
    "ai-template-input w-full px-2.5 py-2 bg-bg-btn text-fg " +
    "border border-border rounded text-[11.5px] leading-[1.6] " +
    "outline-none resize-y box-border " +
    "[font-family:var(--editor-font-family,monospace)] focus:border-link";
  const AI_HINT =
    "ai-hint px-[11px] py-2 rounded-lg bg-bg-btn border border-border " +
    "text-fg-muted text-[11px] leading-[1.6] mt-0.5";
</script>

{#if visible}
  <div
    class="overlay fixed inset-0 z-30 flex items-center justify-center bg-overlay"
    role="presentation"
    onclick={onOverlayClick}
  >
    <div
      class="dialog bg-bg border border-border rounded-lg px-6 py-5 min-w-[420px] max-w-[min(720px,92vw)] max-h-[calc(100vh-48px)] overflow-y-auto overscroll-contain shadow-[0_20px_50px_rgba(0,0,0,0.3)] text-fg"
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
    >
      <div class="title mb-3.5 flex justify-between text-[15px] font-semibold">
        {t("settings.title")}
        <button
          class="close border-none bg-transparent text-fg-muted cursor-pointer text-[14px]"
          onclick={onClose}
        >
          ✕
        </button>
      </div>

      <!-- 设置分类 Tab:阅读 / AI / 其他 -->
      <div class="settings-tabs mb-1.5 flex gap-1 border-b border-border">
        <button
          class={activeTab === "reading" ? TAB_ACTIVE : TAB_REST}
          onclick={() => (activeTab = "reading")}
        >
          {t("settings.tabReading")}
        </button>
        <button
          class={activeTab === "ai" ? TAB_ACTIVE : TAB_REST}
          onclick={() => (activeTab = "ai")}
        >
          {t("settings.tabAI")}
        </button>
        <button
          class={activeTab === "other" ? TAB_ACTIVE : TAB_REST}
          onclick={() => (activeTab = "other")}
        >
          {t("settings.tabOther")}
        </button>
      </div>

      <!-- ════ 阅读设置 ════ -->
      {#if activeTab === "reading"}
        <div class="settings-tab-panel animate-[panelIn_0.16s_ease]">
          <div class="settings-grid grid grid-cols-2 gap-x-6 max-[680px]:grid-cols-1">
            <div class={ROW}>
              <label class="text-fg-muted" for={fontSizeId}>{t("settings.fontSize")}</label>
              <input
                type="range"
                id={fontSizeId}
                value={rs.settings.fontSize}
                min="10"
                max="28"
                step="1"
                oninput={(e) =>
                  rs.setFontSize(Number((e.target as HTMLInputElement).value))}
              />
              <span class="value text-right text-fg-muted tabular-nums"
                >{rs.settings.fontSize}px</span
              >
            </div>

            <div class={ROW}>
              <label class="text-fg-muted" for={editorFontSizeId}>{t("settings.editorFontSize")}</label>
              <input
                type="range"
                id={editorFontSizeId}
                value={rs.settings.editorFontSize}
                min="12"
                max="24"
                step="1"
                oninput={(e) =>
                  rs.setEditorFontSize(
                    Number((e.target as HTMLInputElement).value)
                  )}
              />
              <span class="value text-right text-fg-muted tabular-nums"
                >{rs.settings.editorFontSize}px</span
              >
            </div>

            <div class={ROW}>
              <label class="text-fg-muted" for={lineHeightId}>{t("settings.lineHeight")}</label>
              <input
                type="range"
                id={lineHeightId}
                value={rs.settings.lineHeight}
                min="1.3"
                max="2.2"
                step="0.05"
                oninput={(e) =>
                  rs.setLineHeight(Number((e.target as HTMLInputElement).value))}
              />
              <span class="value text-right text-fg-muted tabular-nums"
                >{rs.settings.lineHeight.toFixed(2)}</span
              >
            </div>

            <div class={ROW}>
              <label class="text-fg-muted" for={maxWidthId}>{t("settings.maxWidth")}</label>
              <input
                type="range"
                id={maxWidthId}
                value={rs.settings.maxWidth}
                min="640"
                max="1320"
                step="20"
                oninput={(e) =>
                  rs.setMaxWidth(Number((e.target as HTMLInputElement).value))}
              />
              <span class="value text-right text-fg-muted tabular-nums"
                >{rs.settings.maxWidth}px</span
              >
            </div>

            <div class={ROW}>
              <label class="text-fg-muted" for={fontFamilyId}>{t("settings.fontFamily")}</label>
              <div class="font-select-wrapper relative col-start-2 col-span-2 max-w-[260px]">
                <select
                  class="w-full appearance-none px-2 py-1 bg-bg-btn text-fg border border-border rounded text-xs outline-none max-h-[200px] focus:border-link"
                  id={fontFamilyId}
                  value={rs.settings.fontFamily}
                  onchange={(e) =>
                    rs.setFontFamily((e.target as HTMLSelectElement).value)}
                >
                  {#each allFontOptions as opt (opt.value)}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if rs.settings.fontFamily === "custom"}
              <div class={ROW}>
                <label class="text-fg-muted" for={fontCustomId}>{t("settings.fontCustom")}</label>
                <input
                  type="text"
                  class={TEXT_INPUT}
                  id={fontCustomId}
                  value={rs.settings.fontCustom}
                  placeholder={t("settings.fontCustomPlaceholder")}
                  oninput={(e) =>
                    rs.setFontCustom((e.target as HTMLInputElement).value)}
                />
              </div>
            {/if}

            <div class={ROW}>
              <label class="text-fg-muted" for={editorFontFamilyId}>{t("settings.editorFontFamily")}</label>
              <div class="font-select-wrapper relative col-start-2 col-span-2 max-w-[260px]">
                <select
                  class="w-full appearance-none px-2 py-1 bg-bg-btn text-fg border border-border rounded text-xs outline-none max-h-[200px] focus:border-link"
                  id={editorFontFamilyId}
                  value={rs.settings.editorFontFamily}
                  onchange={(e) =>
                    rs.setEditorFontFamily(
                      (e.target as HTMLSelectElement).value
                    )}
                >
                  {#each allEditorFontOptions as opt (opt.value)}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if rs.settings.editorFontFamily === "custom"}
              <div class={ROW}>
                <label class="text-fg-muted" for={editorFontCustomId}>{t("settings.editorFontCustom")}</label>
                <input
                  type="text"
                  class={TEXT_INPUT}
                  id={editorFontCustomId}
                  value={rs.settings.editorFontCustom}
                  placeholder={t("settings.fontCustomPlaceholder")}
                  oninput={(e) =>
                    rs.setEditorFontCustom((e.target as HTMLInputElement).value)}
                />
              </div>
            {/if}

            <div class={ROW}>
              <label class="text-fg-muted" for={floatLayoutId}>{t("settings.floatLayout")}</label>
              <button
                class={BTN + (floatLayoutEnabled ? " active" : "")}
                id={floatLayoutId}
                onclick={() => onToggleFloatLayout?.()}
              >
                {floatLayoutEnabled
                  ? t("float.floatLayoutOn")
                  : t("float.floatLayoutOff")}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- ════ 其他设置 ════ -->
      {#if activeTab === "other"}
        <div class="settings-tab-panel animate-[panelIn_0.16s_ease]">
          <div class={ASSOC}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("settings.updateCheck")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {t("settings.currentVersion", { version: currentVersion || "-" })}
              </div>
              {#if updateMessage}
                <div class={updateStatusCls}>{updateMessage}</div>
              {/if}
            </div>
            <div class="update-actions flex items-center gap-2">
              <button class={BTN} disabled={updateBusy} onclick={checkForUpdates}>
                {updateBusy
                  ? t("settings.checkingUpdate")
                  : t("settings.checkUpdate")}
              </button>
              {#if updateStatus === "available" || updateStatus === "error"}
                <button class={BTN_PRIMARY} onclick={openReleasePage}>
                  {t("settings.openReleasePage")}
                </button>
              {/if}
            </div>
          </div>

          <div class={ASSOC}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("settings.pandocTemplate")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {#if pandocRefDoc}
                  <span class={REF_DOC_PATH} title={pandocRefDoc}
                    >{pandocRefDoc}</span
                  >
                {:else}
                  {t("settings.pandocTemplateHint")}
                {/if}
              </div>
            </div>
            <div class="update-actions flex items-center gap-2">
              <button class={BTN} onclick={pickPandocRefDoc}>
                {t("settings.chooseTemplate")}
              </button>
              {#if pandocRefDoc}
                <button class={BTN} onclick={clearPandocRefDoc}>
                  {t("settings.clearTemplate")}
                </button>
              {/if}
            </div>
          </div>

          <div class={ASSOC}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("settings.fileAssociation")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {t("settings.fileAssociationHint")}
              </div>
              {#if associationMessage}
                <div class={assocStatusCls}>{associationMessage}</div>
              {/if}
            </div>
            <button
              class={BTN}
              disabled={associationBusy}
              onclick={registerAssociations}
            >
              {associationBusy
                ? t("settings.registering")
                : t("settings.registerAssociation")}
            </button>
          </div>

          <div class={ASSOC}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("shortcuts.title")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {t("shortcuts.hint")}
              </div>
            </div>
            <button class={BTN} onclick={() => (showShortcuts = true)}>
              {t("shortcuts.view")}
            </button>
          </div>
        </div>
      {/if}

      <!-- ════ AI 设置 ════ -->
      {#if activeTab === "ai"}
        <div class="settings-tab-panel animate-[panelIn_0.16s_ease]">
          <div class={ASSOC_COLUMN}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("settings.aiTemplate")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {t("settings.aiTemplateHint")}
              </div>
            </div>
            <textarea
              class={AI_TEMPLATE}
              rows="6"
              value={aiTemplate}
              oninput={onAiTemplateInput}
            ></textarea>
            <div class="update-actions flex items-center gap-2">
              <button class={BTN} onclick={restoreAiTemplate}>
                {t("settings.restoreDefaultTemplate")}
              </button>
            </div>
          </div>

          <div class={ASSOC_COLUMN + " ai-settings"}>
            <div>
              <div class="association-title text-[13px] font-semibold">
                {t("settings.aiPanel")}
              </div>
              <div class="association-hint mt-1 text-[12px] text-fg-muted leading-normal">
                {t("settings.aiPanelHint")}
              </div>
            </div>

            <!-- AI 配置:方案 A —— 统一列宽表单(左标签固定列右对齐,输入框等宽等高,提示收底部) -->
            <div class="ai-grid mt-1">
              <label class={AI_ROW_FULL}>
                <input
                  type="checkbox"
                  class="m-0"
                  checked={aiSettings.enabled}
                  onchange={(e) =>
                    patchAiSettings({
                      enabled: (e.target as HTMLInputElement).checked,
                    })}
                />
                <span>{t("settings.aiEnabled")}</span>
              </label>

              <label class={AI_ROW}>
                <span class={AI_ROW_LABEL}>{t("settings.aiProvider")}</span>
                <select
                  class={AI_CTRL_SELECT}
                  value={aiSettings.provider}
                  onchange={onAiProviderChange}
                >
                  <option value="ollama">{t("settings.aiProviderOllama")}</option>
                  <option value="openai">{t("settings.aiProviderOpenai")}</option>
                  <option value="anthropic">{t("settings.aiProviderAnthropic")}</option>
                  <option value="azure">{t("settings.aiProviderAzure")}</option>
                  <option value="gemini">{t("settings.aiProviderGemini")}</option>
                </select>
              </label>

              <label class={AI_ROW}>
                <span class={AI_ROW_LABEL}>{t("settings.aiBaseUrl")}</span>
                <input
                  class={AI_CTRL}
                  value={aiSettings.baseUrl}
                  placeholder={baseUrlPlaceholder}
                  oninput={(e) =>
                    patchAiSettings({
                      baseUrl: (e.target as HTMLInputElement).value,
                    })}
                />
              </label>

              {#if aiSettings.provider !== "ollama"}
                <label class={AI_ROW}>
                  <span class={AI_ROW_LABEL}>{t("settings.aiApiKey")}</span>
                  <input
                    type="password"
                    class={AI_CTRL}
                    value={aiSettings.apiKey}
                    placeholder={t("settings.aiApiKeyPlaceholder")}
                    oninput={(e) =>
                      patchAiSettings({
                        apiKey: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
              {/if}

              <!-- Azure 需部署名称(拼入 URL 路径);Ollama 无需 model,Azure 用 deployment 标识模型 -->
              {#if aiSettings.provider === "azure"}
                <label class={AI_ROW}>
                  <span class={AI_ROW_LABEL}>{t("settings.aiDeployment")}</span>
                  <input
                    class={AI_CTRL}
                    value={aiSettings.deployment}
                    placeholder={t("settings.aiDeploymentPlaceholder")}
                    oninput={(e) =>
                      patchAiSettings({
                        deployment: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
              {/if}

              {#if aiSettings.provider !== "ollama" && aiSettings.provider !== "azure"}
                <label class={AI_ROW}>
                  <span class={AI_ROW_LABEL}>{t("settings.aiModel")}</span>
                  <input
                    class={AI_CTRL}
                    value={aiSettings.model}
                    placeholder={modelPlaceholder}
                    oninput={(e) =>
                      patchAiSettings({
                        model: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
              {/if}

              <!-- 端点填写说明:统一收在字段底部,占满两列,按所选服务类型给出示例与拼接规则 -->
              <div class={AI_HINT}>{baseUrlHint}</div>
            </div>

            <div class="update-actions flex items-center gap-2">
              <button class={BTN} onclick={restoreAiSettings}>
                {t("settings.restoreAiSettings")}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <div class="footer mt-4.5 flex justify-end gap-2">
        <button class={BTN} onclick={rs.reset}>{t("settings.reset")}</button>
        <button class={BTN_PRIMARY} onclick={onClose}>{t("settings.done")}</button>
      </div>
    </div>
  </div>
{/if}

<ShortcutsDialog visible={showShortcuts} onClose={() => (showShortcuts = false)} />
