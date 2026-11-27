"use client";
import { useState } from "react";
import { Select } from "./Select.tsx";

const PAGE_SIZE = 10;
const SIZES = [10, 20, 50].map((n) => ({ value: String(n), label: `${n} / page` }));

type PagerProps = { total: number; page: number; onPage: (p: number) => void; size: number; onSize: (n: number) => void };

/** Paging for a list: the rows of the current page and the props for <Pager>. */
export function usePaging<T>(rows: readonly T[]): { slice: T[]; setPage: (p: number) => void; pager: PagerProps } {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages);
  return { slice: rows.slice((at - 1) * size, at * size), setPage, pager: { total: rows.length, page: at, onPage: setPage, size, onSize: (n) => { setSize(n); setPage(1); } } };
}

export function Pager({ total, page, onPage, size, onSize }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= PAGE_SIZE) return null;
  // long lists show the first page, the last page and the neighbours of the current one, with "..." between
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {shown.map((p, i) => (
        <span key={p} className="pager-item">
          {i > 0 && p - shown[i - 1]! > 1 && <span className="muted">…</span>}
          <button type="button" className={p === page ? "ghost on" : "ghost"} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>{p}</button>
        </span>
      ))}
      <button type="button" className="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      <Select ariaLabel="Page size" value={String(size)} onChange={(v) => onSize(Number(v))} options={SIZES} />
    </nav>
  );
}
