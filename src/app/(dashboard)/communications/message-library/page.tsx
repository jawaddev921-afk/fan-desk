"use client";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { LibraryScreen } from "@/features/library/components/LibraryView.tsx";

export default function MessageLibraryPage() {
  return (
    <div className="creator">
      <h2>Message Library</h2>
      <FlashNote />
      <LibraryScreen />
    </div>
  );
}
