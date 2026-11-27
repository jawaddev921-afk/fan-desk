"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { ClockIcon, FileTextIcon, FolderOpenIcon, ListIcon, SendIcon, WorkflowIcon } from "@/components/common/icons.tsx";

const LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/communications/fan-lists", label: "Fan Lists", icon: <ListIcon /> },
  { href: "/communications/flows", label: "Flows", icon: <WorkflowIcon /> },
  { href: "/communications/scripts", label: `${AI_NAME} Scripts`, icon: <FileTextIcon /> },
  { href: "/communications/message-library", label: "Message Library", icon: <FolderOpenIcon /> },
  { href: "/communications/expired-fans", label: "Expired Fans", icon: <ClockIcon /> },
  { href: "/communications/super-mass", label: "Super Mass", icon: <SendIcon /> },
];

/** The Communications sections (same entries and order as SuperCreator's menu), drawn like the Creator tab's pills. */
export function CommunicationsNav() {
  const path = usePathname();
  return (
    <nav className="tabs-row" aria-label="Communications">
      {LINKS.map((l) => <Link key={l.href} href={l.href} className="tab-btn" aria-current={path.startsWith(l.href) ? "page" : undefined} aria-selected={path.startsWith(l.href)}>{l.icon}<span>{l.label}</span></Link>)}
    </nav>
  );
}
