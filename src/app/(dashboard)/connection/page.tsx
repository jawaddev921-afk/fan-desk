import { ConnectionView } from "@/features/accounts/components/ConnectionView.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { SetupCard } from "../SetupCard.tsx";

export default async function ConnectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return (
    <div className="page">
      <FlashNote />
      <SetupCard welcome={q.welcome === "1"} />
      <ConnectionView />
    </div>
  );
}
