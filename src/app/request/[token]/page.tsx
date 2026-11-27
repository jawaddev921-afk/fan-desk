import type { Metadata } from "next";
import { RequestForm } from "@/features/creator/components/RequestForm.tsx";

// The link is a secret: never send it on as a referrer, and keep it out of search results.
export const metadata: Metadata = { title: "Fan Desk: your bio", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function RequestPage({ params }: { params: Promise<{ token: string }> }) {
  return <RequestForm token={(await params).token} />;
}
