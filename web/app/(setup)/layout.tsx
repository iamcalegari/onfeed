export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-creme">
      <main className="mx-auto w-full max-w-md px-4 py-6">
        {children}
      </main>
    </div>
  );
}
