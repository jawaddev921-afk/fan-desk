"use client";
import { useState } from "react";
import { Select } from "@/components/common/Select.tsx";

const RANGES = [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }];

/** The Statistics tab of a flow. Nothing runs yet, so every number is zero. */
export function FlowStats() {
  const [range, setRange] = useState("30");
  const cards: [string, string][] = [["Total Sales", "$0.00"], ["Fans Bought", "0"], ["Fans Reached", "0"], ["Messages Sent", "0"]];
  return (
    <div className="flow-stats">
      <div className="row"><span className="grow" /><Select ariaLabel="Date range" value={range} onChange={setRange} options={RANGES} /></div>
      <div className="flow-counts" role="tablist"><span role="tab" aria-selected="true" className="on"><b>Overview</b><span className="muted">Summary Report</span></span><span><b>0</b><span className="muted">Started</span></span><span><b>0% (0)</b><span className="muted">Completed</span></span><span><b>0% (0)</b><span className="muted">Running</span></span><span><b>-</b><span className="muted">Goal</span></span></div>
      <div className="flow-cards">{cards.map(([k, v]) => <div className="card" key={k}><span className="muted">{k}</span><b className="big">{v}</b></div>)}</div>
      <div className="card"><b>Sales Over Time</b><div className="empty">No sales data available</div></div>
      <h3 className="sec">Top Performing PPVs</h3>
      <div className="empty">No PPV sales yet.</div>
    </div>
  );
}
