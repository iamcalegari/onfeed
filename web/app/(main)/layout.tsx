import { BottomNav } from "@/components/BottomNav";
import { Toaster } from "@/components/Toaster";
import { TopBar } from "@/components/TopBar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <>
      <TopBar clerkEnabled={clerkEnabled} />
      <main className="mx-auto w-full max-w-md px-4 pb-[calc(5.5rem+max(env(safe-area-inset-bottom),10px))] pt-4">
        {children}
      </main>
      <BottomNav />
      <Toaster />
    </>
  );
}
