import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getImportJobAction } from "@/app/actions";
import { ImportProgress } from "@/components/ImportProgress";

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { jobId } = await params;
  const job = await getImportJobAction(jobId);

  return <ImportProgress jobId={jobId} initialJob={job} />;
}
