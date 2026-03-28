import { MobileHeader } from "@/components/layout/mobile-header";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-full">
      <Sidebar />
      <div className="flex flex-col flex-1 min-h-0">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
