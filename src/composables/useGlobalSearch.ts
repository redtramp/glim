import { invoke } from "@tauri-apps/api/core";

export interface SearchMatch {
  path: string;
  rel_path: string;
  line: number;
  column: number;
  preview: string;
}

let searchSessionSeq = 0;

/**
 * 发起全局搜索。
 *
 * @param session 会话代次:调用方传入单调递增值;后端遍历期间会检查该代次是否
 *   仍为最新,一旦有更新的搜索发起(代次变化),旧遍历会提前中断,避免过期结果
 *   继续占用资源。调用方可使用 searchNextSession() 获取新代次。
 */
export async function searchInFiles(
  root: string,
  query: string,
  caseSensitive: boolean,
  maxResults = 500,
  session = 0
): Promise<SearchMatch[]> {
  if (!root || !query.trim()) return [];
  return await invoke<SearchMatch[]>("search_in_files", {
    root,
    query,
    caseSensitive,
    maxResults,
    session,
  });
}

/** 返回一个单调递增的搜索会话代次(每次新搜索调用一次) */
export function nextSearchSession(): number {
  searchSessionSeq += 1;
  return searchSessionSeq;
}
