import { VerifyEmail } from "@/features/auth/components/VerifyEmail.tsx";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VerifyPage({ searchParams }: Props) {
  const q = await searchParams;
  return <VerifyEmail token={typeof q.token === "string" ? q.token : ""} />;
}
