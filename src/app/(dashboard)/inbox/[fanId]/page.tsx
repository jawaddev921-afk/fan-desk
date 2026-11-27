import { Conversation } from "./Conversation.tsx";

export default async function FanPage({ params }: { params: Promise<{ fanId: string }> }) {
  const { fanId } = await params;
  return <Conversation fanId={fanId} />;
}
