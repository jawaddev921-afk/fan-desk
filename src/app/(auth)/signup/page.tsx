import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/AuthForm.tsx";
import { config } from "@/lib/config.ts";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function SignupPage({ searchParams }: Props) {
  if (!config.allowSignup) redirect("/login");
  const q = await searchParams;
  return <AuthForm key="signup" mode="signup" allowSignup initialEmail={one(q.email)} />;
}
