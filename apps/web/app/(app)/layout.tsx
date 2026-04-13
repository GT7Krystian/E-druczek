import Navbar from '@/components/Navbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {/* Desktop: offset for sidebar */}
      <main className="md:ml-56 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
