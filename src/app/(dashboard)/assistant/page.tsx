"use client";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { AI_NAME } from "@/config/ai.ts";
import { AiEngineCard } from "@/features/accounts/components/AiEngineCard.tsx";
import { SettingsForm } from "@/features/accounts/components/SettingsForm.tsx";
import { UsageCard } from "@/features/assistant/components/UsageCard.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";

// The engine card (which model writes, the user's Claude key) and the settings form belong to the accounts feature, the usage card to the assistant feature; this page shows them together.
export default function AssistantPage() {
  return (
    <div className="page assistant-page">
      <div className="row"><h2 className="grow">{AI_NAME}</h2><AccountSelect /></div>
      <FlashNote />
      <AiEngineCard />
      <div className="note">{AI_NAME} writes drafts in the creator&apos;s voice; a person approves each one before it is sent. When a fan tips, buys, or asks whether they are talking to a bot, the chat is handed to a human.</div>
      <SettingsForm />
      <div className="mt14"><UsageCard /></div>
    </div>
  );
}
