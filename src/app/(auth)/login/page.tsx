import { AuthForm } from "@/features/auth/components/AuthForm.tsx";
import { config } from "@/lib/config.ts";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  return (
    <AuthForm
      key="login"
      mode="login"
      allowSignup={config.allowSignup}
      initialEmail={one(q.email)}
      notice={q.expired ? "Your session ended. Please log in again." : undefined}
    />
  );
}
