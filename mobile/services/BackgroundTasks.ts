import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPointInPolygon } from '../utils/geofence';

export const PARKING_DETECTION_TASK = 'SCARLETSPOTS_PARKING_DETECTION';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

TaskManager.defineTask(PARKING_DETECTION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundTask] Error:', error.message);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    const latestLocation = locations[locations.length - 1];
    
    // In a real app we would check `latestLocation.coords.speed` or use expo-sensors to verify 
    // we transitioned from driving to walking, but `expo-location` also provides hints.
    // For this blueprint, we'll check if the speed has dropped significantly (e.g., < 2 m/s = walking speed).
    
    const speed = latestLocation.coords.speed;
    
    // We only care if we just stopped driving. We can persist the last known speed to check transitions.
    const lastSpeedStr = await AsyncStorage.getItem('last_known_speed');
    const lastSpeed = lastSpeedStr ? parseFloat(lastSpeedStr) : 0;
    
    await AsyncStorage.setItem('last_known_speed', String(speed));

    // Simple heuristic for Driving -> Walking transition
    // (If we were > 5m/s and now < 2m/s)
    const wasDriving = lastSpeed > 5;
    const isWalkingOrStopped = speed !== null && speed < 2;

    if (wasDriving && isWalkingOrStopped) {
      console.log(`[BackgroundTask] Detected Driving -> Stopped transition at ${latestLocation.coords.latitude}, ${latestLocation.coords.longitude}`);
      
      // Load lots from TanStack Query persist cache or our own KV
      // Since TanStack persists complex structures, it's easier to fetch from an API or dedicated async storage key 
      // where we manually cache lots. But for now, let's assume we can fetch it via api (it will use offline queue if offline).
      // Or safer: read it from our own local cache if we maintained one.

      // For this implementation, we will fetch right now (or fallback to cache)
      try {
        // Ideally, we'd pull from our own custom AsyncStorage key we keep synced, e.g. 'cached_lots'
        // But for this example we'll make a quick un-authenticated pull or check query client
        // Let's assume we maintain a 'cached_lots' string in index.tsx
        const cachedLotsStr = await AsyncStorage.getItem('cached_lots');
        if (cachedLotsStr) {
          const lots = JSON.parse(cachedLotsStr);
          
          for (const lot of lots) {
            if (lot.coordinates && lot.coordinates.length > 2) {
              const inside = isPointInPolygon(
                [latestLocation.coords.latitude, latestLocation.coords.longitude],
                lot.coordinates
              );
              
              if (inside) {
                console.log(`[BackgroundTask] Parked completely inside lot: ${lot.name}`);
                
                // Send Local Notification
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "🚗 ScarletSpots Tracking",
                    body: `Looks like you just parked at ${lot.name}. Tap to confirm your spot.`,
                    data: { lotId: lot.id, action: 'confirm_park' },
                  },
                  trigger: null, // trigger immediately
                });
                
                break; // Stop checking other lots
              }
            }
          }
        }
      } catch (e) {
        console.log('[BackgroundTask] Error checking geofences:', e);
      }
    }
  }
});
