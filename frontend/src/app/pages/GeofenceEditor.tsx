import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents } from 'react-leaflet';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { ArrowLeft, Save, Trash2, Undo } from 'lucide-react';
import { useNavigate, useSearchParams, useParams } from 'react-router';
import { apiCall, supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { icon as leafletIcon } from 'leaflet';

import { Label } from '../components/ui/label';

// Custom marker icon for polygon vertices
const vertexIcon = leafletIcon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="white" stroke="#dc2626" stroke-width="4"/>
    </svg>
  `)}`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function MapEvents({ onMapClick }: { onMapClick: (e: any) => void }) {
  useMapEvents({
    click: onMapClick,
  });
  return null;
}

export default function GeofenceEditor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { id } = useParams();

  const [points, setPoints] = useState<[number, number][]>([]);
  const [lotName, setLotName] = useState(searchParams.get('name') || '');
  const [campus, setCampus] = useState(searchParams.get('campus') || 'College Ave');
  const [capacity, setCapacity] = useState('50');

  // Initialize map center based on params or default
  const initialLat = parseFloat(searchParams.get('lat') || '40.5008');
  const initialLng = parseFloat(searchParams.get('lng') || '-74.4474');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        toast.error('You must be logged in to create geofences');
      }
    });

    if (id && id !== 'new') {
      const fetchLot = async () => {
        try {
          const data = await apiCall(`/lot/${id}`);
          if (data.total_capacity || data.capacity) {
             setCapacity(String(data.total_capacity || data.capacity || 50));
          }
           if (data.lot) {
            setLotName(data.lot.name);
            setCampus(data.lot.campus);
            setPoints(data.lot.coordinates || []);
            if (data.lot.capacity) setCapacity(String(data.lot.capacity));
          }
        } catch (error) {
          console.error(error);
          toast.error('Failed to load geofence details');
        }
      };
      fetchLot();
    }
  }, [id]);

  const handleMapClick = (e: any) => {
    const { lat, lng } = e.latlng;
    setPoints((prev) => [...prev, [lat, lng]]);
  };

  const handleDragVertex = (index: number, e: any) => {
    const { lat, lng } = e.target.getLatLng();
    setPoints((prev) => {
      const newPoints = [...prev];
      newPoints[index] = [lat, lng];
      return newPoints;
    });
  };

  const handleUndo = () => {
    setPoints((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all points?')) {
      setPoints([]);
    }
  };

  const handleSave = async () => {
    if (!lotName) {
      toast.error('Please enter a lot name');
      return;
    }
    if (points.length < 3) {
      toast.error('A parking lot needs at least 3 points');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Please log in to save geofences');
      navigate('/'); // Redirect to login
      return;
    }

    try {
      const payload = {
        name: lotName,
        campus,
        coordinates: points,
        capacity: parseInt(capacity) || 50,
      };

      if (id && id !== 'new') {
        await apiCall(`/lots/custom/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiCall('/lots/custom', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      toast.success('Geofence saved successfully!');

      // Clear local storage params if present
      if (searchParams.get('lat')) {
        navigate('/admin/geofence');
      } else {
        // Reset form if not redirecting
        setPoints([]);
        setLotName('');
      }
    } catch (error: any) {
      console.error('Save geofence error:', error);
      if (error.message && error.message.includes('Unauthorized')) {
        toast.error('Session expired. Please log in again.');
        navigate('/');
      } else {
        toast.error(error.message || 'Failed to save geofence');
      }
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/map')}
            className="text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-white font-bold text-lg">Geofence Editor</h1>
            <p className="text-zinc-400 text-xs text-left">Click map to draw boundaries</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={points.length === 0}
            className="border-zinc-700 text-white bg-zinc-800 hover:bg-zinc-700"
          >
            <Undo className="w-4 h-4 mr-2" />
            Undo
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={points.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          center={[initialLat, initialLng]}
          zoom={17}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <MapEvents onMapClick={handleMapClick} />

          {/* Polygon Preview */}
          {points.length > 0 && (
            <Polygon
              positions={points}
              pathOptions={{
                color: '#dc2626',
                fillColor: '#dc2626',
                fillOpacity: 0.4,
              }}
            />
          )}

          {/* Draggable Vertices */}
          {points.map((point, index) => (
            <Marker
              key={index}
              position={point}
              icon={vertexIcon}
              draggable={true}
              eventHandlers={{
                drag: (e) => handleDragVertex(index, e),
              }}
            />
          ))}
        </MapContainer>

        {/* Editor Sidebar / Floating Card */}
        <Card className="absolute top-4 right-4 w-80 bg-zinc-900/90 backdrop-blur-sm border-zinc-800 p-4 shadow-xl z-[400]">
          <h2 className="text-white font-semibold mb-4">Lot Details</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lotName" className="text-zinc-300">Lot Name</Label>
              <Input
                id="lotName"
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                placeholder="e.g. Lot 26"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campus" className="text-zinc-300">Campus</Label>
              <select
                id="campus"
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                className="w-full bg-zinc-800 border-zinc-700 text-white rounded-md h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                <option value="College Ave">College Ave</option>
                <option value="Busch">Busch</option>
                <option value="Livingston">Livingston</option>
                <option value="Cook/Douglass">Cook/Douglass</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity" className="text-zinc-300">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="pt-2 text-xs text-zinc-500">
              <p>Points: {points.length}</p>
              <p>Click map to add points. Drag white dots to adjust.</p>
            </div>

            <Button
              onClick={handleSave}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Geofence
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
