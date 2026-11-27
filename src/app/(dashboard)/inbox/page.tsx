import { ChatIcon } from "@/components/common/icons.tsx";

export default function InboxHome() {
  return <div className="empty-hero"><span aria-hidden="true"><ChatIcon /></span><b>No chat open</b><p>Pick a fan on the left to read the conversation.</p></div>;
}
