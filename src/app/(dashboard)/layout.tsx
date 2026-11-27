import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { meView } from "@/app/api/_lib/views.ts";
import { DialogProvider } from "@/components/common/Dialogs.tsx";
import { SessionProvider } from "@/features/accounts/components/session.tsx";
import { sessionUserFromCookie } from "@/features/auth/service.ts";
import { SyncStateProvider } from "@/features/inbox/components/useSync.tsx";
import { ClientProvider } from "@/lib/client/client.tsx";
import { Shell } from "./Shell.tsx";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // proxy.ts only checks that a cookie exists. This is the real check: the cookie must belong to a live session.
  const user = await sessionUserFromCookie((await headers()).get("cookie"));
  if (!user) redirect("/login?expired=1");
  return (
    <ClientProvider>
      <SessionProvider initialMe={await meView(user)}>
        <SyncStateProvider>
          <DialogProvider><Shell>{children}</Shell></DialogProvider>
        </SyncStateProvider>
      </SessionProvider>
    </ClientProvider>
  );
}
