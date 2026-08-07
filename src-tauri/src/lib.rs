use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

// sccache 缓存键只追踪 crate 源码与 dep-info 中的文件, 而 `generate_context!`
// 宏在编译期直接读取 tauri.conf.json —— 该文件不在 dep-info 中, 导致修改配置
// (如 CSP) 后 sccache 仍返回旧宏展开的陈旧产物(旧 CSP 被固化进二进制)。
// 通过 include_str! 将配置文件纳入 dep-info, 配置一变, 缓存键随之失效。
const _TAURI_CONFIG_SENTINEL: &str = include_str!("../tauri.conf.json");

use notify_debouncer_mini::notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;

mod pdf_export;
mod pdf_utils;

use pdf_utils::{current_millis, strip_windows_extended_prefix};

#[cfg(target_os = "windows")]
fn apply_windows_frame_theme(window: &tauri::WebviewWindow, is_dark: bool) {
    let _ = window_vibrancy::apply_mica(window, Some(is_dark));
}

#[cfg(not(target_os = "windows"))]
fn apply_windows_frame_theme(_window: &tauri::WebviewWindow, _is_dark: bool) {}

fn extract_md_path_from_args(argv: &[String]) -> Option<String> {
    for arg in argv.iter().skip(1) {
        if arg.starts_with("--") {
            continue;
        }
        let p = std::path::Path::new(arg);
        if p.is_file() {
            let ext = p
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase());
            if matches!(
                ext.as_deref(),
                Some("md") | Some("markdown") | Some("mdx") | Some("txt")
            ) {
                if let Ok(abs) = std::fs::canonicalize(p) {
                    return Some(strip_windows_extended_prefix(
                        abs.to_string_lossy().to_string(),
                    ));
                }
                return Some(arg.clone());
            }
        }
    }
    None
}
use tauri::{Emitter, State};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<Debouncer<notify_debouncer_mini::notify::RecommendedWatcher>>>,
    current_root: Mutex<Option<PathBuf>>,
}

fn is_markdown_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("md") | Some("markdown") | Some("mdx") | Some("txt")
    )
}

/// 列出指定目录的**直接**子项（仅一层，不递归）。
/// 返回目录与 Markdown 相关文件（md/markdown/mdx/txt），排除隐藏目录、
/// node_modules 与 target，避免整树扫描导致 UI 卡死。
#[tauri::command]
fn list_dir(root: String) -> Result<Vec<DirEntry>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {}", root));
    }
    let mut entries: Vec<DirEntry> = Vec::new();
    let rd = std::fs::read_dir(&root_path).map_err(|e| e.to_string())?;
    for entry in rd.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            entries.push(DirEntry {
                path: path.to_string_lossy().to_string(),
                name,
                is_dir: true,
            });
        } else if path.is_file() && is_markdown_file(&path) {
            entries.push(DirEntry {
                path: path.to_string_lossy().to_string(),
                name,
                is_dir: false,
            });
        }
    }
    // 目录在前，同层按名称排序，保证视觉顺序稳定
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

/// 返回当前用户主目录（如 /home/user），用于无历史文档时文件树的初始根目录。
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(PathBuf::from(home).to_string_lossy().to_string())
}

/// 判断路径是否位于应排除的子树下（与 list_dir 的过滤保持一致）。
/// 排除隐藏目录（.git 等）、node_modules 与构建产物目录 target，
/// 避免对海量目录注册 inotify 监听导致 UI 卡死/事件洪流。
fn is_excluded_path(path: &Path) -> bool {
    path.components().any(|c| {
        let name = c.as_os_str().to_string_lossy();
        name.starts_with('.') || name == "node_modules" || name == "target"
    })
}

#[tauri::command]
async fn start_watch(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    root: String,
) -> Result<(), String> {
    let path = PathBuf::from(&root);
    if !path.exists() {
        return Err(format!("Path not found: {}", root));
    }
    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    let app_handle = app.clone();

    // 建立监听移出主线程执行，避免在大目录上同步建 watch 阻塞 UI。
    let watch_path = path.clone();
    let debouncer = tauri::async_runtime::spawn_blocking(move || {
        let mut debouncer = new_debouncer(
            Duration::from_millis(300),
            move |res: DebounceEventResult| match res {
                Ok(events) => {
                    // 双保险：回调中再过滤一次排除路径，避免被监听噪音刷屏前端
                    let paths: Vec<String> = events
                        .into_iter()
                        .filter(|e| !is_excluded_path(&e.path))
                        .map(|e| e.path.to_string_lossy().to_string())
                        .collect();
                    if !paths.is_empty() {
                        let _ = app_handle.emit("glim-reader://file-changed", paths);
                    }
                }
                Err(error) => {
                    eprintln!("watch error: {error:?}");
                }
            },
        )
        .map_err(|e| e.to_string())?;

        // 只监听根目录本身（NonRecursive）：避免启动时对整棵目录树深度遍历
        // 逐个注册 inotify watch（大目录如 ~/Work 下有数万目录，注册耗时且易触发
        // 系统 watch 上限）。已打开文件的目录由前端通过 watch_path 按需追加监听。
        debouncer
            .watcher()
            .watch(&watch_path, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
        Ok::<_, String>(debouncer)
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(debouncer);
    }
    {
        let mut cur = state.current_root.lock().map_err(|e| e.to_string())?;
        *cur = Some(path);
    }
    Ok(())
}

#[tauri::command]
fn stop_watch(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    let mut cur = state.current_root.lock().map_err(|e| e.to_string())?;
    *cur = None;
    Ok(())
}

/// 追加监听单个目录（NonRecursive）：打开文件后监听其所在目录，用于检测外部修改。
/// 根目录已在 start_watch 中监听；此处仅覆盖已打开文件的目录，避免整树深度监听。
/// 重复监听（notify 返回 AlreadyWatched）与路径不存在时静默忽略。
#[tauri::command]
fn watch_path(state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(debouncer) = guard.as_mut() {
        if let Err(e) = debouncer.watcher().watch(&p, RecursiveMode::NonRecursive) {
            eprintln!("watch_path failed for {}: {e}", p.display());
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchMatch {
    pub path: String,
    pub rel_path: String,
    pub line: usize,
    pub column: usize,
    pub preview: String,
}

/// 最新搜索会话代次:每次新搜索发起时更新;遍历期间发现代次变化即提前中断,
/// 避免过期搜索继续消耗资源(Rust 侧无法直接取消同步遍历,用代次实现协作式取消)。
static SEARCH_SESSION: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn search_in_files(
    root: String,
    query: String,
    case_sensitive: bool,
    max_results: Option<usize>,
    session: Option<u64>,
) -> Result<Vec<SearchMatch>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {}", root));
    }
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    // 单字符查询匹配过多结果，限制长度避免无意义的全量扫描
    if q.len() < 2 {
        return Err("搜索词过短，请输入至少 2 个字符".into());
    }
    let needle = if case_sensitive {
        q.to_string()
    } else {
        q.to_lowercase()
    };
    let limit = max_results.unwrap_or(500);
    let mut results = Vec::new();
    // 跳过超大文件（>500KB），避免内存占用过高和响应缓慢
    const MAX_FILE_SIZE: u64 = 512 * 1024;
    // 将本次搜索标记为最新代次;后续更新的搜索会覆盖该值,使本遍历提前中断
    let my_session = session.unwrap_or(0);
    if my_session != 0 {
        SEARCH_SESSION.store(my_session, Ordering::Relaxed);
    }

    'outer: for entry in WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !(name.starts_with('.') || name == "node_modules" || name == "target")
        })
        .filter_map(|e| e.ok())
    {
        // 协作式取消:有更新的搜索请求(代次变化)时,立即放弃本次遍历
        if my_session != 0 && SEARCH_SESSION.load(Ordering::Relaxed) != my_session {
            break;
        }
        let path = entry.path();
        if !path.is_file() || !is_markdown_file(path) {
            continue;
        }
        let _meta = match entry.metadata() {
            Ok(m) if m.len() > MAX_FILE_SIZE => continue, // 跳过超大文件
            Ok(m) => m,
            Err(_) => continue,
        };
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let rel = path
            .strip_prefix(&root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        for (idx, line) in content.lines().enumerate() {
            // 行内循环同样检查代次,避免大文件内部长时间占用
            if my_session != 0 && SEARCH_SESSION.load(Ordering::Relaxed) != my_session {
                break 'outer;
            }
            let hay = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if let Some(col) = hay.find(&needle) {
                let preview = line.chars().take(200).collect::<String>();
                results.push(SearchMatch {
                    path: path.to_string_lossy().to_string(),
                    rel_path: rel.clone(),
                    line: idx + 1,
                    column: col + 1,
                    preview,
                });
                if results.len() >= limit {
                    break 'outer;
                }
            }
        }
    }
    Ok(results)
}

#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(target_os = "windows")]
fn reg_add(args: Vec<String>) -> Result<(), String> {
    let output = hidden_command("reg")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run reg.exe: {}", e))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

#[cfg(target_os = "windows")]
fn notify_shell_assoc_changed() {
    let _ = hidden_command("ie4uinit.exe").arg("-show").output();
}

#[cfg(target_os = "windows")]
fn register_windows_file_associations() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_path = strip_windows_extended_prefix(exe.to_string_lossy().to_string());
    let open_command = format!("\"{}\" \"%1\"", exe_path);
    let icon = format!("\"{}\",0", exe_path);
    let prog_id = "MDReader.Markdown";
    let app_key = r"HKCU\Software\Classes\Applications\glim-reader.exe";

    reg_add(vec![
        "add".into(),
        format!(r"HKCU\Software\Classes\{}", prog_id),
        "/ve".into(),
        "/d".into(),
        "Markdown Document".into(),
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        format!(r"HKCU\Software\Classes\{}", prog_id),
        "/v".into(),
        "FriendlyTypeName".into(),
        "/d".into(),
        "Markdown Document".into(),
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        format!(r"HKCU\Software\Classes\{}\DefaultIcon", prog_id),
        "/ve".into(),
        "/d".into(),
        icon,
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        format!(r"HKCU\Software\Classes\{}\shell", prog_id),
        "/ve".into(),
        "/d".into(),
        "open".into(),
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        format!(r"HKCU\Software\Classes\{}\shell\open\command", prog_id),
        "/ve".into(),
        "/d".into(),
        open_command.clone(),
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        app_key.into(),
        "/v".into(),
        "FriendlyAppName".into(),
        "/d".into(),
        "Glim Reader".into(),
        "/f".into(),
    ])?;
    reg_add(vec![
        "add".into(),
        format!(r"{}\shell\open\command", app_key),
        "/ve".into(),
        "/d".into(),
        open_command,
        "/f".into(),
    ])?;

    for (ext, content_type) in [
        ("md", "text/markdown"),
        ("markdown", "text/markdown"),
        ("mdx", "text/mdx"),
    ] {
        let ext_name = format!(".{}", ext);
        let ext_key = format!(r"HKCU\Software\Classes\{}", ext_name);
        reg_add(vec![
            "add".into(),
            ext_key.clone(),
            "/ve".into(),
            "/d".into(),
            prog_id.into(),
            "/f".into(),
        ])?;
        reg_add(vec![
            "add".into(),
            ext_key.clone(),
            "/v".into(),
            "Content Type".into(),
            "/d".into(),
            content_type.into(),
            "/f".into(),
        ])?;
        reg_add(vec![
            "add".into(),
            format!(r"{}\OpenWithProgids", ext_key),
            "/v".into(),
            prog_id.into(),
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            "".into(),
            "/f".into(),
        ])?;
        reg_add(vec![
            "add".into(),
            format!(r"{}\OpenWithList\glim-reader.exe", ext_key),
            "/ve".into(),
            "/d".into(),
            "".into(),
            "/f".into(),
        ])?;
        reg_add(vec![
            "add".into(),
            format!(r"{}\SupportedTypes", app_key),
            "/v".into(),
            ext_name,
            "/t".into(),
            "REG_SZ".into(),
            "/d".into(),
            "".into(),
            "/f".into(),
        ])?;
    }

    notify_shell_assoc_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn register_file_associations() -> Result<(), String> {
    register_windows_file_associations()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn register_file_associations() -> Result<(), String> {
    Err("File association registration is only supported on Windows".into())
}

#[tauri::command]
async fn get_system_fonts() -> Result<Vec<tauri_plugin_system_fonts::SystemFont>, String> {
    Ok(tauri_plugin_system_fonts::get_system_fonts().await)
}

#[tauri::command]
fn set_app_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let is_dark = theme == "dark";
    window
        .set_theme(Some(if is_dark {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }))
        .map_err(|e| e.to_string())?;
    apply_windows_frame_theme(&window, is_dark);
    Ok(())
}
#[tauri::command]
fn initial_open_file() -> Option<String> {
    let argv: Vec<String> = std::env::args().collect();
    extract_md_path_from_args(&argv)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Already-running instance: focus window and emit the new file path.
            use tauri::{Emitter, Manager};
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(path) = extract_md_path_from_args(&argv) {
                let _ = app.emit("glim-reader://open-file", path);
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_system_fonts::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            use tauri::Manager;
            app.manage(WatcherState::default());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(None);
                apply_windows_frame_theme(&window, false);
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir,
            get_home_dir,
            start_watch,
            stop_watch,
            watch_path,
            search_in_files,
            initial_open_file,
            register_file_associations,
            set_app_theme,
            get_system_fonts,
            check_pandoc,
            export_with_pandoc,
            pdf_utils::check_pdf_engine,
            pdf_export::export_pdf_via_edge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Debug, Serialize, Clone)]
pub struct PandocInfo {
    pub available: bool,
    pub version: String,
    pub has_xelatex: bool,
}

fn pandoc_cmd() -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("pandoc");
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        Command::new("pandoc")
    }
}

fn run_check(program: &str, arg: &str) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg(arg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn check_pandoc() -> PandocInfo {
    let pandoc = run_check("pandoc", "--version");
    let xelatex = run_check("xelatex", "--version");
    PandocInfo {
        available: pandoc.is_some(),
        version: pandoc
            .as_ref()
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .unwrap_or_default(),
        has_xelatex: xelatex.is_some(),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub html: String,
    pub out_path: String,
    pub format: String,
    pub title: Option<String>,
    pub reference_doc: Option<String>,
}

/// 临时文件守卫:作用域结束时无论成败都删除临时文件,避免 pandoc 中途失败时残留。
struct TempFileGuard(PathBuf);
impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[tauri::command]
fn export_with_pandoc(opts: ExportOptions) -> Result<String, String> {
    let format = opts.format.to_lowercase();
    if !matches!(format.as_str(), "docx" | "html") {
        return Err(format!("Unsupported format: {}", format));
    }

    let tmp_dir = std::env::temp_dir();
    let stamp = current_millis();
    let in_path = tmp_dir.join(format!("glim-reader-export-{}.html", stamp));
    std::fs::write(&in_path, &opts.html)
        .map_err(|e| format!("Failed to write temp html: {}", e))?;
    // 注册守卫:后续任何 Err 提前返回(如 pandoc 启动失败)都会清理临时文件
    let _guard = TempFileGuard(in_path.clone());

    let out_path = PathBuf::from(&opts.out_path);
    if let Some(parent) = out_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).ok();
        }
    }

    let mut cmd = pandoc_cmd();
    cmd.arg("--from").arg("html");
    cmd.arg("--standalone");
    if let Some(title) = &opts.title {
        cmd.arg("--metadata").arg(format!("title={}", title));
    }
    cmd.arg(&in_path);
    cmd.arg("-o").arg(&out_path);

    if format == "html" {
        cmd.arg("--embed-resources");
    }

    if format == "docx" {
        if let Some(ref_doc) = &opts.reference_doc {
            let p = PathBuf::from(ref_doc);
            if !p.exists() {
                return Err(format!("参考文档不存在: {}", ref_doc));
            }
            cmd.arg("--reference-doc").arg(p);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to invoke pandoc: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("pandoc 失败: {}", stderr.trim()));
    }
    Ok(out_path.to_string_lossy().to_string())
}
