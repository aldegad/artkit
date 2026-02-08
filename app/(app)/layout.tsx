import ClientLayout from "@/shared/components/app/layout/ClientLayout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
