/** The one loading state: a spinning ring with a soft glow and a label. `full` centres it on the whole screen. */
export function Loading({ label = "Loading", full }: { label?: string; full?: boolean }) {
  return (
    <div className={full ? "loading full" : "loading"} role="status" aria-live="polite">
      <span className="loading-ring" aria-hidden="true" />
      <span className="loading-text">{label}<i>.</i><i>.</i><i>.</i></span>
    </div>
  );
}
