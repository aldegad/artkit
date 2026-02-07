import ClientLayout from "../../components/layout/ClientLayout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
