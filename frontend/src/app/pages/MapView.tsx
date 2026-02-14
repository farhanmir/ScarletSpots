import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap } from 'react-leaflet';
import { icon as leafletIcon } from 'leaflet';
import { supabase, apiCall } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { MapPin, Users, User, Navigation, LogOut, Menu, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Input } from '../components/ui/input';

interface Lot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity: number;
  campus: string;
  occupiedCount: number;
  availableCount: number;
  occupancyRate: number;
  // Support polygon coordinates for local lots
  coordinates?: [number, number][];
}

interface ParkingSession {
  id: string;
  userId: string;
  lotId: string;
  spotNumber: string;
  latitude: number;
  longitude: number;
  confirmed: boolean;
  startTime: string;
  active: boolean;
}

interface Friend {
  id: string;
  name: string;
  email: string;
  activeSession?: ParkingSession;
}

// Custom map icons
const createCustomIcon = (color: string) => {
  return leafletIcon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
        <path fill="${color}" d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z"/>
        <circle cx="16" cy="16" r="6" fill="white"/>
      </svg>
    `)}`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
};

const redIcon = createCustomIcon('#dc2626');
const greenIcon = createCustomIcon('#16a34a');
const yellowIcon = createCustomIcon('#ca8a04');
const blueIcon = createCustomIcon('#2563eb');

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

export default function MapView() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>([40.5008, -74.4474]); // College Ave default
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [spotNumber, setSpotNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedLocation, setSearchedLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const navigate = useNavigate();
  const mapRef = useRef<any>(null);

  // Mock building data for demo
  const BUILDINGS: Record<string, { lat: number; lng: number; name: string }> = {
    'student center': { lat: 40.5026, lng: -74.4517, name: 'College Ave Student Center' },
    'the yard': { lat: 40.4996, lng: -74.4477, name: 'The Yard @ College Ave' },
    'alexander library': { lat: 40.5005, lng: -74.4487, name: 'Alexander Library' },
    werblin: { lat: 40.5233, lng: -74.4587, name: 'Werblin Recreation Center' },
  };

  useEffect(() => {
    checkAuth();
    initializeLots();
    fetchLots();
    fetchActiveSession();
    fetchFriends();

    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.log('Location error:', error);
        },
      );
    }
  }, []);

  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      // navigate('/');
    }
  };

  const initializeLots = async () => {
    try {
      await apiCall('/lots/init', { method: 'POST' });
    } catch (error) {
      console.error('Initialize lots error:', error);
    }
  };

  const fetchLots = async () => {
    try {
      const data = await apiCall('/lots');
      if (data.lots) {
        setLots(data.lots);
      }
    } catch (error) {
      console.error('Fetch lots error:', error);
      toast.error('Failed to load parking lots');
    }
  };

  const fetchActiveSession = async () => {
    try {
      const data = await apiCall('/park/session/active');
      setActiveSession(data.session);
    } catch (error) {
      console.error('Fetch session error:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      const data = await apiCall('/friends');
      setFriends(data.friends);
    } catch (error) {
      console.error('Fetch friends error:', error);
    }
  };

  const handleParkHere = async (lot: Lot) => {
    if (!spotNumber) {
      toast.error('Please enter a spot number');
      return;
    }

    try {
      await apiCall('/park/session', {
        method: 'POST',
        body: JSON.stringify({
          lotId: lot.id,
          spotNumber,
          latitude: lot.latitude,
          longitude: lot.longitude,
          confirmed: true,
        }),
      });

      toast.success(`Parked at ${lot.name}, Spot ${spotNumber}`);
      setSelectedLot(null);
      setSpotNumber('');
      fetchActiveSession();
      fetchLots();
    } catch (error: any) {
      console.error('Park error:', error);
      toast.error(error.message || 'Failed to save parking spot');
    }
  };

  const handleEndSession = async () => {
    try {
      await apiCall('/park/session/end', { method: 'POST' });
      toast.success('Parking session ended');
      setActiveSession(null);
      fetchLots();
    } catch (error: any) {
      console.error('End session error:', error);
      toast.error(error.message || 'Failed to end session');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return 'bg-red-600';
    if (rate >= 70) return 'bg-yellow-600';
    return 'bg-green-600';
  };

  const getOccupancyLabel = (rate: number) => {
    if (rate >= 90) return 'Full';
    if (rate >= 70) return 'Busy';
    return 'Available';
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery.toLowerCase();

    // Check local lots first (exact name match or includes)
    const foundLot = lots.find((l) => l.name.toLowerCase().includes(query));
    if (foundLot) {
      setSearchedLocation({ lat: foundLot.latitude, lng: foundLot.longitude, name: foundLot.name });
      setUserLocation([foundLot.latitude, foundLot.longitude]);
      toast.success(`Found ${foundLot.name}`);
      setSearchQuery('');
      return;
    }

    // Fallback to mock buildings
    const entry = Object.entries(BUILDINGS).find(([key]) => key.includes(query));

    if (entry) {
      const building = entry[1];
      setSearchedLocation(building);
      setUserLocation([building.lat, building.lng]); // Pan to building
      toast.success(`Found ${building.name}`);
      setSearchQuery('');
    } else {
      toast.error('Location not found.');
      setSearchedLocation(null);
    }
  };

  return (
    <div className='h-screen w-full flex flex-col bg-zinc-950'>
      {/* Header with Search and Menu */}
      <div className='bg-zinc-900 border-b border-zinc-800 p-4 flex items-center gap-3 z-10 relative'>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant='ghost' size='icon' className='text-white shrink-0'>
              <Menu className='w-6 h-6' />
            </Button>
          </SheetTrigger>
          <SheetContent
            side='left'
            className='bg-zinc-900 border-r border-zinc-800 text-white w-80 p-0'
          >
            <SheetHeader className='p-6 border-b border-zinc-800'>
              <div className='flex items-center gap-3 mb-2'>
                <div className='w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center'>
                  <MapPin className='w-5 h-5 text-white' />
                </div>
                <SheetTitle className='text-white font-bold text-xl'>ScarletSpots</SheetTitle>
              </div>
              <p className='text-zinc-400 text-xs'>Menu</p>
            </SheetHeader>

            <div className='p-4 space-y-6'>
              <div className='space-y-2'>
                <Button
                  onClick={() => navigate('/profile')}
                  className='w-full justify-start bg-transparent hover:bg-zinc-800 text-white text-base font-normal h-12'
                >
                  <User className='w-5 h-5 mr-3 text-zinc-400' />
                  Profile
                </Button>
                <Button
                  onClick={() => navigate('/friends')}
                  className='w-full justify-start bg-transparent hover:bg-zinc-800 text-white text-base font-normal h-12'
                >
                  <Users className='w-5 h-5 mr-3 text-zinc-400' />
                  Friends
                </Button>
                <Button
                  onClick={() => navigate('/admin/geofence')}
                  className='w-full justify-start bg-transparent hover:bg-zinc-800 text-white text-base font-normal h-12'
                >
                  <Settings className='w-5 h-5 mr-3 text-zinc-400' />
                  Geofence Editor
                </Button>
              </div>

              <div className='border-t border-zinc-800 pt-6'>
                <h3 className='text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-4 px-2'>
                  Legend
                </h3>
                <div className='space-y-3 px-2'>
                  <div className='flex items-center gap-3'>
                    <div className='w-3 h-3 bg-red-600 rounded-full' />
                    <span className='text-sm text-zinc-300'>Can't Park (Full/Restricted)</span>
                  </div>
                  <div className='flex items-center gap-3'>
                    <div className='w-3 h-3 bg-yellow-600 rounded-full' />
                    <span className='text-sm text-zinc-300'>Park at Your Own Risk</span>
                  </div>
                  <div className='flex items-center gap-3'>
                    <div className='w-3 h-3 bg-green-600 rounded-full' />
                    <span className='text-sm text-zinc-300'>Permit Acquired (Available)</span>
                  </div>
                  <div className='flex items-center gap-3'>
                    <div className='w-3 h-3 bg-blue-600 rounded-full' />
                    <span className='text-sm text-zinc-300'>Friends</span>
                  </div>
                </div>
              </div>

              <div className='border-t border-zinc-800 pt-6'>
                <Button
                  onClick={handleSignOut}
                  className='w-full justify-start bg-zinc-800 hover:bg-zinc-700 text-red-400'
                >
                  <LogOut className='w-4 h-4 mr-2' />
                  Sign Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <form onSubmit={handleSearch} className='flex-1 relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400' />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Find building...'
            className='pl-9 bg-zinc-800 border-zinc-700 text-white w-full placeholder:text-zinc-500'
          />
        </form>
      </div>

      {/* Active Session Banner */}
      {activeSession && (
        <div className='bg-red-600 p-3 flex items-center justify-between'>
          <div className='text-white text-sm'>
            <p className='font-semibold'>Currently Parked</p>
            <p className='text-red-100'>Spot {activeSession.spotNumber}</p>
          </div>
          <div className='flex gap-2'>
            <Button
              size='sm'
              onClick={() => navigate('/compass')}
              className='bg-white text-red-600 hover:bg-red-50'
            >
              <Navigation className='w-4 h-4 mr-1' />
              Find
            </Button>
            <Button
              size='sm'
              onClick={handleEndSession}
              variant='outline'
              className='border-white text-white hover:bg-red-700'
            >
              End
            </Button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className='flex-1 relative'>
        <MapContainer center={userLocation} zoom={15} className='h-full w-full' ref={mapRef}>
          <MapUpdater center={userLocation} />

          {/* Dark theme tiles */}
          <TileLayer
            url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* User location */}
          <Marker position={userLocation} icon={blueIcon}>
            <Popup>
              <div className='text-sm'>
                <p className='font-semibold'>You are here</p>
              </div>
            </Popup>
          </Marker>

          {/* Parking lots */}
          {lots.map((lot) => {
            const occupancyColor =
              lot.occupancyRate >= 90 ? '#dc2626' : lot.occupancyRate >= 70 ? '#ca8a04' : '#16a34a';

            return (
              <div key={lot.id}>
                <Circle
                  center={[lot.latitude, lot.longitude]}
                  radius={100}
                  pathOptions={{
                    fillColor: occupancyColor,
                    fillOpacity: 0.2,
                    color: occupancyColor,
                    weight: 2,
                  }}
                />
                <Marker
                  position={[lot.latitude, lot.longitude]}
                  icon={
                    lot.occupancyRate >= 90
                      ? redIcon
                      : lot.occupancyRate >= 70
                        ? yellowIcon
                        : greenIcon
                  }
                  eventHandlers={{
                    click: () => setSelectedLot(lot),
                  }}
                >
                  <Popup>
                    <div className='min-w-[200px]'>
                      <h3 className='font-bold text-sm mb-1'>{lot.name}</h3>
                      <p className='text-xs text-zinc-600 mb-2'>{lot.campus}</p>
                      <div className='space-y-1 text-xs'>
                        <div className='flex justify-between'>
                          <span>Available:</span>
                          <span className='font-semibold'>
                            {lot.availableCount} / {lot.capacity}
                          </span>
                        </div>
                        <div className='flex items-center gap-2'>
                          <div className='flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden'>
                            <div
                              className={`h-full ${getOccupancyColor(lot.occupancyRate)}`}
                              style={{ width: `${lot.occupancyRate}%` }}
                            />
                          </div>
                          <span className='font-semibold'>{Math.round(lot.occupancyRate)}%</span>
                        </div>
                      </div>
                      <Button
                        variant='link'
                        size='sm'
                        className='p-0 h-auto text-red-400 mt-2 text-xs'
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/admin/geofence?lat=${lot.latitude}&lng=${lot.longitude}&name=${encodeURIComponent(lot.name)}&campus=${encodeURIComponent(lot.campus)}`,
                          );
                        }}
                      >
                        Geofence This Lot
                      </Button>
                    </div>
                  </Popup>
                </Marker>
              </div>
            );
          })}

          {/* Render Polygons for User-Created Lots */}
          {lots
            .filter((l) => l.coordinates)
            .map((lot) => (
              <Polygon
                key={`poly-${lot.id}`}
                positions={lot.coordinates!}
                pathOptions={{
                  color: '#ca8a04', // Yellow for custom/risk
                  fillColor: '#ca8a04',
                  fillOpacity: 0.4,
                }}
              />
            ))}

          {/* Friend parking spots */}
          {friends.map((friend) => {
            if (!friend.activeSession) return null;
            return (
              <Marker
                key={friend.id}
                position={[friend.activeSession.latitude, friend.activeSession.longitude]}
                icon={blueIcon}
              >
                <Popup>
                  <div className='text-sm'>
                    <p className='font-semibold'>{friend.name}</p>
                    <p className='text-xs text-zinc-600'>Spot {friend.activeSession.spotNumber}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Searched Location Marker */}
          {searchedLocation && (
            <Marker position={[searchedLocation.lat, searchedLocation.lng]} icon={redIcon}>
              <Popup>
                <div className='text-sm font-bold'>{searchedLocation.name}</div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Lot Info Card */}
        {selectedLot && !activeSession && (
          <div className='absolute bottom-4 left-4 right-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl z-[500]'>
            <div className='flex items-start justify-between mb-3'>
              <div>
                <h3 className='text-white font-bold'>{selectedLot.name}</h3>
                <p className='text-zinc-400 text-sm'>{selectedLot.campus}</p>
              </div>
              <Badge className={getOccupancyColor(selectedLot.occupancyRate)}>
                {getOccupancyLabel(selectedLot.occupancyRate)}
              </Badge>
            </div>

            <div className='flex items-center gap-2 text-zinc-300 text-sm mb-3'>
              <MapPin className='w-4 h-4' />
              <span>{selectedLot.availableCount} spots available</span>
            </div>

            <div className='flex gap-2'>
              <input
                type='text'
                placeholder='Spot number'
                value={spotNumber}
                onChange={(e) => setSpotNumber(e.target.value)}
                className='flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder:text-zinc-500'
              />
              <Button
                onClick={() => handleParkHere(selectedLot)}
                className='bg-red-600 hover:bg-red-700 text-white'
              >
                Park Here
              </Button>
            </div>
          </div>
        )}

        {/* Floating Legend (Simplified/Matching) */}
        <div className='absolute top-4 right-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl p-3 text-xs space-y-2 z-[400]'>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-red-500'>R</span>
            <span className='text-zinc-300'>Can't Park</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-yellow-500'>Y</span>
            <span className='text-zinc-300'>Risk</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='font-bold text-green-500'>G</span>
            <span className='text-zinc-300'>Permit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
