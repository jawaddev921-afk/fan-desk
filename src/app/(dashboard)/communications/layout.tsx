import type { ReactNode } from "react";
import { CommunicationsNav } from "./CommunicationsNav.tsx";

export default function CommunicationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page wide creator">
      <CommunicationsNav />
      {children}
    </div>
  );
}
