import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { apiCall } from '../../lib/supabase';
import { toast } from 'sonner';

export default function GeofenceList() {
  const navigate = useNavigate();
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLots();
  }, []);

  const fetchLots = async () => {
    try {
      setLoading(true);
      const data = await apiCall('/lots');
      setLots(data.lots || []);
    } catch (error) {
      toast.error('Failed to load lots');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, isCustom: boolean) => {
    if (!isCustom) {
      toast.error('Cannot delete standard system lots');
      return;
    }
    if (!confirm('Are you sure you want to delete this geofence?')) return;

    try {
      await apiCall(`/lots/custom/${id}`, { method: 'DELETE' });
      toast.success('Geofence deleted');
      fetchLots();
    } catch (error) {
      toast.error('Failed to delete geofence');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Geofences</h1>
          <p className="text-zinc-400 mt-1">Manage parking lot boundaries and metadata</p>
        </div>
        <Button onClick={() => navigate('/admin/geofences/new')} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Geofence
        </Button>
      </div>

      {loading ? (
        <div className="text-white">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lots.map((lot) => (
            <Card key={lot.id} className="bg-zinc-900 border-zinc-800 p-4 hover:border-zinc-700 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-zinc-800 rounded-lg">
                  <MapPin className={`w-6 h-6 ${lot.isCustom ? 'text-blue-400' : 'text-red-500'}`} />
                </div>
                {lot.isCustom && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => handleDelete(lot.id, true)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              <h3 className="text-lg font-semibold text-white mb-1">{lot.name}</h3>
              <p className="text-sm text-zinc-500 mb-4">{lot.campus} Campus</p>
              
              <div className="flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800 pt-3">
                <span>Capacity: {lot.capacity}</span>
                <span className={lot.isCustom ? 'text-blue-400' : 'text-zinc-500'}>
                  {lot.isCustom ? 'Custom' : 'System'}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
