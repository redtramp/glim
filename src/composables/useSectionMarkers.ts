import { ref, computed, watch, onUnmounted, type Ref } from "vue";
import type { Heading } from "./useMarkdown";

export type MarkerState = "past" | "current" | "future";

export interface SectionMarker {
  id: string;
  text: string;
  level: number;
  state: MarkerState;
  scrollTop: number;
  isBookmark: boolean;
}

export interface BookmarkEntry {
  id: string;
  scrollTop: number;
  label?: string;
}

const STORAGE_KEY = "glim-reader-section-bookmarks";
const SCROLL_OFFSET = 16;
const SCROLL_TOLERANCE = 1;
const SCROLL_END_TIMEOUT = 300;

function loadBookmarks(): BookmarkEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveBookmarks(entries: BookmarkEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useSectionMarkers(
  headings: Ref<Heading[]>,
  viewerEl: Ref<HTMLElement | null>,
  bodyRef: Ref<HTMLElement | null>,
) {
  const markers = ref<SectionMarker[]>([]);
  const activeId = ref("");
  const bookmarks = ref<BookmarkEntry[]>(loadBookmarks());

  let isScrollingProgrammatically = false;

  function buildScrollTopMap(): Map<string, number> {
    const map = new Map<string, number>();
    const body = bodyRef.value;
    if (!body) return map;

    for (const h of headings.value) {
      const el = body.querySelector(`#${CSS.escape(h.id)}`);
      if (!el) continue;
      const container = viewerEl.value;
      const top = container
        ? el.getBoundingClientRect().top + container.scrollTop - container.getBoundingClientRect().top
        : el.getBoundingClientRect().top + window.scrollY;
      map.set(h.id, Math.max(0, top - SCROLL_OFFSET));
    }
    return map;
  }

  function rebuildMarkers(): void {
    const scrollMap = buildScrollTopMap();
    const container = viewerEl.value;
    const scrollTop = container ? container.scrollTop : 0;

    let currentIdx = -1;
    for (let i = 0; i < headings.value.length; i++) {
      const st = scrollMap.get(headings.value[i].id) ?? 0;
      if (st <= scrollTop + SCROLL_TOLERANCE) {
        currentIdx = i;
      }
    }

    if (currentIdx < 0 && headings.value.length > 0) {
      currentIdx = 0;
    }

    const result: SectionMarker[] = headings.value.map((h, i) => {
      const st = scrollMap.get(h.id) ?? 0;
      const state: MarkerState = i < currentIdx ? "past" : i === currentIdx ? "current" : "future";
      if (state === "current") activeId.value = h.id;
      return { id: h.id, text: h.text, level: h.level, state, scrollTop: st, isBookmark: false };
    });

    if (headings.value.length === 0) {
      activeId.value = "";
    }

    const scrollHeight = viewerEl.value?.scrollHeight ?? Infinity;
    for (const bm of bookmarks.value) {
      if (result.length > 0 && bm.scrollTop > scrollHeight) continue;
      result.push({
        id: `bm-${bm.id}`, text: bm.label ?? "🔖", level: 0,
        state: "future", scrollTop: bm.scrollTop, isBookmark: true,
      });
    }

    result.sort((a, b) => a.scrollTop - b.scrollTop);
    markers.value = result;
  }

  function jumpTo(id: string): void {
    const marker = markers.value.find((m) => m.id === id);
    if (!marker || !viewerEl.value) return;
    isScrollingProgrammatically = true;
    viewerEl.value.scrollTo({ top: marker.scrollTop, behavior: "smooth" });
    activeId.value = id;
    const onScrollEnd = () => {
      isScrollingProgrammatically = false;
      viewerEl.value?.removeEventListener("scroll", onScrollEnd);
    };
    viewerEl.value.addEventListener("scroll", onScrollEnd, { once: true });
    setTimeout(() => { isScrollingProgrammatically = false; }, SCROLL_END_TIMEOUT);
  }

  function addBookmark(scrollTop: number, label?: string): void {
    const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    bookmarks.value = [...bookmarks.value, { id, scrollTop, label }];
    saveBookmarks(bookmarks.value);
    rebuildMarkers();
  }

  function removeBookmark(id: string): void {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== id);
    saveBookmarks(bookmarks.value);
    rebuildMarkers();
  }

  function getBookmarks(): BookmarkEntry[] {
    return bookmarks.value;
  }

  function clearBookmarks(): void {
    bookmarks.value = [];
    saveBookmarks([]);
    rebuildMarkers();
  }

  let rafId: number | null = null;
  function onScroll(): void {
    if (isScrollingProgrammatically) return;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      rebuildMarkers();
    });
  }

  let scrollTarget: HTMLElement | null = null;
  watch(
    () => headings.value,
    () => rebuildMarkers(),
    { deep: true }
  );

  watch(
    () => viewerEl.value,
    (el, oldEl) => {
      if (oldEl) oldEl.removeEventListener("scroll", onScroll);
      if (el) {
        el.addEventListener("scroll", onScroll, { passive: true });
        scrollTarget = el;
      }
      rebuildMarkers();
    },
    { immediate: true }
  );

  onUnmounted(() => {
    if (scrollTarget) scrollTarget.removeEventListener("scroll", onScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return {
    markers: computed(() => markers.value),
    activeId: computed(() => activeId.value),
    jumpTo, addBookmark, removeBookmark, getBookmarks, clearBookmarks, rebuildMarkers,
  };
}