/**
 * 文件访问授权（fs scope 按需提示）。
 *
 * 预置授权根之外的目录读取会被 tauri-plugin-fs 判为 forbidden path，
 * 此处捕获该类错误并弹出授权提示：用户确认后调用 Rust `allow_dir`
 * 为该目录追加会话级读写授权，再自动重试一次打开。
 * 非授权类错误原样抛出，不打断既有错误提示逻辑。
 */
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { dirOf } from "../utils/path";

/** 插件授权错误文案：debug 构建与 PathForbidden 的 Display 均为 "forbidden path: ..." */
const FORBIDDEN_RE = /forbidden path/i;

export function isForbiddenError(err: unknown): boolean {
  if (typeof err === "string") return FORBIDDEN_RE.test(err);
  const msg = (err as { message?: string } | null)?.message;
  return typeof msg === "string" && FORBIDDEN_RE.test(msg);
}

export function useFsAuthorize() {
  const showGrantDialog = ref(false);
  const grantDir = ref("");
  let grantResolve: ((allowed: boolean) => void) | null = null;

  /** 显示授权提示，返回用户是否授权（已有提示在等待时直接拒绝） */
  function askGrant(dir: string): Promise<boolean> {
    if (grantResolve || !dir) return Promise.resolve(false);
    return new Promise((resolve) => {
      grantDir.value = dir;
      grantResolve = resolve;
      showGrantDialog.value = true;
    });
  }

  function resolveDialog(allowed: boolean) {
    showGrantDialog.value = false;
    const resolve = grantResolve;
    grantResolve = null;
    grantDir.value = "";
    resolve?.(allowed);
  }

  /** 读取文件；命中授权错误时弹提示，授权成功则重试一次（只重试一次，避免死循环） */
  async function readTextFileAuthorized(path: string): Promise<string> {
    try {
      return await readTextFile(path);
    } catch (e) {
      if (!isForbiddenError(e)) throw e;
      const dir = dirOf(path);
      if (!dir || !(await askGrant(dir))) throw e;
      await invoke("allow_dir", { path: dir });
      return await readTextFile(path);
    }
  }

  return { showGrantDialog, grantDir, askGrant, resolveDialog, readTextFileAuthorized };
}
