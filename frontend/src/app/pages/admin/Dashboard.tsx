import { Card } from '../../components/ui/card';
import { Activity, Users, Map, Clock } from 'lucide-react';

export default function AdminDashboard() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Active Sessions', value: '124', icon: Activity, color: 'text-green-500' },
          { label: 'Total Users', value: '1,053', icon: Users, color: 'text-blue-500' },
          { label: 'Geofences', value: '42', icon: Map, color: 'text-purple-500' },
          { label: 'Avg Park Time', value: '4h 12m', icon: Clock, color: 'text-orange-500' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`w-8 h-8 opacity-80 ${stat.color}`} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 p-6 h-96 flex items-center justify-center">
          <p className="text-zinc-500">Live Heatmap Placeholder</p>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 p-6 h-96 flex items-center justify-center">
          <p className="text-zinc-500">Occupancy Trends Placeholder</p>
        </Card>
      </div>
    </div>
  );
}
