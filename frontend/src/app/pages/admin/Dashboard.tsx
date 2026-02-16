import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Activity, Users, Map, Layers } from 'lucide-react';
import { apiCall } from '../../lib/supabase';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';


interface LotStats {
  id: string;
  name: string;
  campus: string;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  occupancyRate: number;
}

interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  totalGeofences: number;
  totalCapacity: number;
  lots: LotStats[];
}

const STAT_CARDS = [
  { key: 'activeSessions' as const, label: 'Active Sessions', icon: Activity, color: 'text-green-500' },
  { key: 'totalUsers' as const, label: 'Total Users', icon: Users, color: 'text-blue-500' },
  { key: 'totalGeofences' as const, label: 'Geofences', icon: Map, color: 'text-purple-500' },
  { key: 'totalCapacity' as const, label: 'Total Capacity', icon: Layers, color: 'text-orange-500' },
];

const getBarColor = (rate: number) => {
  if (rate >= 90) return '#dc2626';
  if (rate >= 70) return '#ca8a04';
  return '#16a34a';
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = (await apiCall('/admin/stats')) as AdminStats;
        setStats(data);
      } catch (err: any) {
        console.error('[Dashboard] Error fetching stats:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-900 rounded-xl border border-zinc-800" />
          ))}
        </div>
        <div className="h-64 bg-zinc-900 rounded-xl border border-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto text-center">
        <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Dashboard</h2>
        <p className="text-zinc-400">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    );
  }


  const occupiedData = stats?.lots.map(lot => ({
    name: lot.name,
    Occupied: lot.occupiedCount,
    Available: lot.availableCount,
    rate: lot.occupancyRate
  })).sort((a, b) => b.rate - a.rate) || [];

  const uniqueCampuses = Array.from(new Set(stats?.lots.map(lot => lot.campus).filter(Boolean))).sort();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-zinc-400">Overview of system activity and parking status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.key} className="bg-zinc-900 border-zinc-800 p-6 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-white">
                    {stats?.[stat.key]?.toLocaleString() || '0'}
                  </p>
                </div>
              </div>
              <div className={`p-3 rounded-full bg-zinc-800/50 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Lot Occupancy Modal Trigger */}
        <Dialog>
          <DialogTrigger asChild>
            <Card className="bg-zinc-900 border-zinc-800 p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-full bg-blue-500/10 text-blue-500">
                  <Activity className="w-6 h-6" />
                </div>
                <Users className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Lot Occupancy Analysis</h3>
              <p className="text-sm text-zinc-400">View real-time occupancy charts for all parking lots.</p>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle>Lot Occupancy Analysis</DialogTitle>
              <DialogDescription>
                Real-time breakdown of occupied vs. available spots across all campuses.
              </DialogDescription>
            </DialogHeader>
            

            <Tabs defaultValue="all" className="w-full mt-4">
              <TabsList className="bg-zinc-800 text-zinc-400">
                <TabsTrigger value="all" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white">All Campuses</TabsTrigger>
                {uniqueCampuses.map(campus => (
                  <TabsTrigger key={campus} value={campus} className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                    {campus}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4 outline-none">
                {occupiedData.length > 0 ? (
                  <div className="h-[500px] w-full border border-transparent">
                     {/* Debug Data */}
                     {/* <pre className="text-xs text-zinc-500 overflow-hidden h-20">{JSON.stringify(occupiedData.slice(0,2), null, 2)}</pre> */}
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={occupiedData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="#888" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100} 
                          interval={0}
                          tick={{fontSize: 12}}
                        />
                        <YAxis stroke="#888" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                          cursor={{fill: 'rgba(255, 255, 255, 0.05)'}}
                        />
                        <Bar dataKey="Occupied" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]}>
                          {occupiedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.rate)} />
                          ))}
                        </Bar>
                        <Bar dataKey="Available" stackId="a" fill="#27272a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[500px] flex items-center justify-center text-zinc-500">
                    No data available via stats API
                  </div>
                )}
              </TabsContent>

              {uniqueCampuses.map(campus => (
                <TabsContent key={campus} value={campus} className="mt-4 outline-none">
                  <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={occupiedData.filter(d => {
                          const lot = stats?.lots.find(l => l.name === d.name);
                          return lot?.campus === campus;
                        })}
                        margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="#888" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100} 
                          interval={0}
                          tick={{fontSize: 12}}
                        />
                        <YAxis stroke="#888" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                          cursor={{fill: 'rgba(255, 255, 255, 0.05)'}}
                        />
                        <Bar dataKey="Occupied" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]}>
                          {occupiedData
                            .filter(d => {
                              const lot = stats?.lots.find(l => l.name === d.name);
                              return lot?.campus === campus;
                            })
                            .map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getBarColor(entry.rate)} />
                            ))
                          }
                        </Bar>
                        <Bar dataKey="Available" stackId="a" fill="#27272a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Lot Details Modal Trigger */}
        <Dialog>
          <DialogTrigger asChild>
            <Card className="bg-zinc-900 border-zinc-800 p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-full bg-purple-500/10 text-purple-500">
                  <Map className="w-6 h-6" />
                </div>
                <Layers className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Detailed Lot Status</h3>
              <p className="text-sm text-zinc-400">View comprehensive list of lots, capacities, and live rates.</p>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle>Lot Status Details</DialogTitle>
              <DialogDescription>
                Comprehensive view of all parking lot statistics.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="all" className="w-full mt-4">
              <TabsList className="bg-zinc-800 text-zinc-400">
                <TabsTrigger value="all" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white">All Campuses</TabsTrigger>
                {uniqueCampuses.map(campus => (
                  <TabsTrigger key={campus} value={campus} className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white">
                    {campus}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-sm">
                        <th className="py-3 px-4 font-medium">Lot</th>
                        <th className="py-3 px-4 font-medium">Campus</th>
                        <th className="py-3 px-4 font-medium text-right">Capacity</th>
                        <th className="py-3 px-4 font-medium text-right">Occupied</th>
                        <th className="py-3 px-4 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {stats?.lots.sort((a, b) => b.occupancyRate - a.occupancyRate).map((lot) => (
                        <tr key={lot.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{lot.name}</td>
                          <td className="py-3 px-4 text-zinc-400">{lot.campus || '-'}</td>
                          <td className="py-3 px-4 text-right text-zinc-300">{lot.capacity}</td>
                          <td className="py-3 px-4 text-right text-zinc-300">{lot.occupiedCount}</td>
                          <td className="py-3 px-4 text-right">
                            <span 
                              className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: `${getBarColor(lot.occupancyRate)}20`, 
                                color: getBarColor(lot.occupancyRate) 
                              }}
                            >
                              {lot.occupancyRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {uniqueCampuses.map(campus => (
                <TabsContent key={campus} value={campus} className="mt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400 text-sm">
                          <th className="py-3 px-4 font-medium">Lot</th>
                          <th className="py-3 px-4 font-medium">Campus</th>
                          <th className="py-3 px-4 font-medium text-right">Capacity</th>
                          <th className="py-3 px-4 font-medium text-right">Occupied</th>
                          <th className="py-3 px-4 font-medium text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {stats?.lots
                          .filter(lot => lot.campus === campus)
                          .sort((a, b) => b.occupancyRate - a.occupancyRate)
                          .map((lot) => (
                            <tr key={lot.id} className="hover:bg-zinc-800/30 transition-colors">
                              <td className="py-3 px-4 font-medium text-white">{lot.name}</td>
                              <td className="py-3 px-4 text-zinc-400">{lot.campus || '-'}</td>
                              <td className="py-3 px-4 text-right text-zinc-300">{lot.capacity}</td>
                              <td className="py-3 px-4 text-right text-zinc-300">{lot.occupiedCount}</td>
                              <td className="py-3 px-4 text-right">
                                <span 
                                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                                  style={{ 
                                    backgroundColor: `${getBarColor(lot.occupancyRate)}20`, 
                                    color: getBarColor(lot.occupancyRate) 
                                  }}
                                >
                                  {lot.occupancyRate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
