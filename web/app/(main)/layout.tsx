import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <>
      <Header clerkEnabled={clerkEnabled} />
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
