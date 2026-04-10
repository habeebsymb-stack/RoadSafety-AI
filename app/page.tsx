import { Header } from '@/components/road-safety/header';
import { Dashboard } from '@/components/road-safety/dashboard';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Dashboard olaMapsApiKey={process.env.OLA_MAPS_API_KEY || ''} />
    </main>
  );
}
