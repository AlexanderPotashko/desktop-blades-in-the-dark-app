// Thin typed wrappers over the rulebook commands in src-tauri/src/rulebook/commands.rs.
// Errors arrive as `{ kind, message }` and reject with db.ts's DbError.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { DbError, type DbErrorKind } from './db';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'kind' in e && 'message' in e) {
      const { kind, message } = e as { kind: DbErrorKind; message: string };
      throw new DbError(kind, String(message));
    }
    throw new DbError('Unknown', e instanceof Error ? e.message : String(e));
  }
}

export interface RulebookInfo {
  id: string;
  title: string;
  importedAt: string;
  pages: number;
}
export interface RbPage {
  pdf: number;
  book: number;
  text: string;
}
export interface RbSeg {
  text: string;
  hit: boolean;
}
export interface RbHit {
  pdf: number;
  book: number;
  snippet: RbSeg[];
}
export interface RbTocEntry {
  title: string;
  /** book page */
  page: number;
  level: number;
}
export interface RbBookmark {
  id: string;
  page: number;
  title: string;
  createdAt: string;
}

/** Opens the system file dialog (Rust side) and returns the picked file's bytes; null = cancelled. */
export async function pickSource(extensions: string[]): Promise<Uint8Array | null> {
  const buf = await invoke<ArrayBuffer>('rb_pick_source', { extensions });
  return buf.byteLength ? new Uint8Array(buf) : null;
}

/** One transaction; replaces a rulebook with the same title after a backup. */
export const importPages = (title: string, lang: 'ru' | 'en', pages: { pdf: number; book: number; text: string }[], toc: RbTocEntry[]) =>
  invoke<RulebookInfo>('rb_import_pages', { title, lang, pages, toc });
export const search = (query: string, limit = 50) => invoke<RbHit[]>('rb_search', { query, limit });
export const getPage = (pdf: number) => invoke<RbPage>('rb_page', { pdf });
export const getPageByBook = (book: number) => invoke<RbPage>('rb_page_by_book', { book });
export const getToc = () => invoke<RbTocEntry[]>('rb_toc');
export const listRulebooks = () => invoke<RulebookInfo[]>('rb_list');
export const deleteRulebook = (id: string) => invoke<void>('rb_delete', { id });
export const addBookmark = (page: number, title: string) => invoke<string>('rb_add_bookmark', { page, title });
export const listBookmarks = () => invoke<RbBookmark[]>('rb_list_bookmarks');
export const deleteBookmark = (id: string) => invoke<void>('rb_delete_bookmark', { id });
