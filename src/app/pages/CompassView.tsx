import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase, apiCall } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { ArrowLeft, Navigation } from 'lucide-react';

interface ParkingSession {
  id: string;
  lotId: string;
  spotNumber: string;
  latitude: number;
  longitude: number;
  startTime: string;
}

export default function CompassView() {
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [distance, setDistance] = useState<number>(0);
  const [bearing, setBearing] = useState<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    fetchActiveSession();
  }, []);

  useEffect(() => {
    // Watch user location
    let watchId: number;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Location error:', error);
        },
        { enableHighAccuracy: true, maximumAge: 1000 },
      );
    }

    // Watch device orientation
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setHeading(event.alpha);
      }
    };

    // Request permission for iOS
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((permission: string) => {
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  useEffect(() => {
    if (userLocation && activeSession) {
      // Calculate distance and bearing
      const dist = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        activeSession.latitude,
        activeSession.longitude,
      );
      setDistance(dist);

      const bear = calculateBearing(
        userLocation.lat,
        userLocation.lng,
        activeSession.latitude,
        activeSession.longitude,
      );
      setBearing(bear);
    }
  }, [userLocation, activeSession]);

  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      // navigate('/');
    }
  };

  const fetchActiveSession = async () => {
    try {
      const data = await apiCall('/park/session/active');
      if (!data.session) {
        navigate('/map');
        return;
      }
      setActiveSession(data.session);
    } catch (error) {
      console.error('Fetch session error:', error);
      navigate('/map');
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);

    return ((θ * 180) / Math.PI + 360) % 360; // Bearing in degrees
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const arrowRotation = bearing - heading;

  return (
    <div className='h-screen w-full flex flex-col bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950'>
      {/* Header */}
      <div className='bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800 p-4 flex items-center justify-between'>
        <Button variant='ghost' size='icon' onClick={() => navigate('/map')} className='text-white'>
          <ArrowLeft className='w-5 h-5' />
        </Button>
        <h1 className='text-white font-bold'>Knight Needle</h1>
        <div className='w-10' />
      </div>

      {/* Compass View */}
      <div className='flex-1 flex flex-col items-center justify-center p-8'>
        {/* Distance */}
        <div className='text-center mb-8'>
          <div className='text-6xl font-bold text-white mb-2'>{formatDistance(distance)}</div>
          <div className='text-zinc-400'>to your car</div>
          {activeSession && (
            <div className='text-red-500 font-semibold mt-2'>Spot {activeSession.spotNumber}</div>
          )}
        </div>

        {/* Compass Circle */}
        <div className='relative w-80 h-80 mb-8'>
          {/* Outer circle */}
          <div className='absolute inset-0 rounded-full border-4 border-zinc-800 bg-zinc-900/50 backdrop-blur-sm' />

          {/* Cardinal directions */}
          <div className='absolute top-4 left-1/2 -translate-x-1/2 text-white font-bold text-lg'>
            N
          </div>
          <div className='absolute bottom-4 left-1/2 -translate-x-1/2 text-zinc-500 font-bold text-lg'>
            S
          </div>
          <div className='absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-lg'>
            W
          </div>
          <div className='absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-lg'>
            E
          </div>

          {/* Center point */}
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='w-4 h-4 bg-white rounded-full' />
          </div>

          {/* Arrow pointing to car */}
          <div
            className='absolute inset-0 flex items-center justify-center transition-transform duration-100 ease-out'
            style={{ transform: `rotate(${arrowRotation}deg)` }}
          >
            <div className='relative'>
              {/* Scarlet Lance/Arrow */}
              <svg
                width='120'
                height='120'
                viewBox='0 0 120 120'
                className='drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]'
              >
                {/* Lance shaft */}
                <rect x='57' y='30' width='6' height='60' fill='#dc2626' />
                {/* Lance tip */}
                <polygon points='60,10 50,30 70,30' fill='#dc2626' />
                {/* Lance guard */}
                <rect x='50' y='28' width='20' height='4' fill='#991b1b' />
              </svg>
            </div>
          </div>

          {/* Pulse effect when close */}
          {distance < 50 && (
            <div className='absolute inset-0 rounded-full border-4 border-red-500 animate-ping' />
          )}
        </div>

        {/* Instructions */}
        <div className='text-center text-zinc-400 max-w-sm'>
          {distance < 10 ? (
            <p className='text-red-500 font-semibold text-lg'>You're here! 🎉</p>
          ) : distance < 50 ? (
            <p className='text-yellow-500 font-semibold'>Almost there! Keep going.</p>
          ) : (
            <p>Follow the red lance to find your car</p>
          )}
        </div>

        {/* Debug info (optional) */}
        {userLocation && (
          <div className='mt-8 text-xs text-zinc-600 space-y-1'>
            <div>Heading: {Math.round(heading)}°</div>
            <div>Bearing: {Math.round(bearing)}°</div>
            <div>Arrow: {Math.round(arrowRotation)}°</div>
          </div>
        )}
      </div>
    </div>
  );
}
