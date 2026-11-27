import { redirect } from "next/navigation";

export default function LibraryPage() {
  redirect("/communications/message-library"); // the old address of the message library
}
