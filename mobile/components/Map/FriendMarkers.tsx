import React, { useEffect, useState, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { Marker, Region } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { authApiCall, supabase } from '../../lib/supabase';
import { useSettings } from '@/context/SettingsContext';

interface FriendData {
  id: string;
  friend_id: string;
  name: string;
  status: string;
  parked: boolean;
  avatar: string | null;
  sharing_enabled?: boolean;
  latitude?: number;
  longitude?: number;
  lot_id?: string;
}

const fetchFriendsWithLocation = async (): Promise<FriendData[]> => {
  try {
    const data = await authApiCall('/friends');
    if (!data?.friends) return [];

    // Only return friends who have location data and sharing enabled
    return data.friends.filter(
      (f: FriendData) => f.sharing_enabled !== false && f.latitude && f.longitude
    );
  } catch {
    return [];
  }
};

const isMarkerInRegion = (marker: FriendData, region: Region) => {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  const northeast = {
    latitude: latitude + latitudeDelta / 2,
    longitude: longitude + longitudeDelta / 2,
  };
  const southwest = {
    latitude: latitude - latitudeDelta / 2,
    longitude: longitude - longitudeDelta / 2,
  };

  return (
    marker.latitude! >= southwest.latitude &&
    marker.latitude! <= northeast.latitude &&
    marker.longitude! >= southwest.longitude &&
    marker.longitude! <= northeast.longitude
  );
};

export default function FriendMarkers({ region }: { region: Region | null }) {
  const { friendFilterMode } = useSettings();

  const { data: friendsData = [] } = useQuery({
    queryKey: ['friend_markers'],
    queryFn: fetchFriendsWithLocation,
    refetchInterval: 15000, // Refresh every 15s
  });

  // Realtime overrides
  const [realtimeLocations, setRealtimeLocations] = useState<Record<string, { lat: number, lng: number }>>({});
  const channelsRef = useRef<Record<string, any>>({});
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Cleanup all channels on unmount
      Object.keys(channelsRef.current).forEach(id => {
        supabase.removeChannel(channelsRef.current[id]);
      });
      channelsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (friendsData.length === 0) {
      // Clear all if no friends
      Object.keys(channelsRef.current).forEach(id => {
        supabase.removeChannel(channelsRef.current[id]);
      });
      channelsRef.current = {};
      return;
    }

    const currentFriendIds = new Set(friendsData.map(f => f.friend_id));
    const activeFriendIds = new Set(Object.keys(channelsRef.current));

    // 1. Remove channels for friends no longer in the list
    activeFriendIds.forEach(id => {
      if (!currentFriendIds.has(id)) {
        supabase.removeChannel(channelsRef.current[id]);
        delete channelsRef.current[id];
      }
    });

    // 2. Add channels for new friends
    friendsData.forEach(friend => {
      if (friend.friend_id && !channelsRef.current[friend.friend_id]) {
        console.log(`[FriendMarkers] Subscribing to user-location:${friend.friend_id}`);
        const channel = supabase.channel(`user-location:${friend.friend_id}`)
          .on('broadcast', { event: 'location_update' }, ({ payload }) => {
            if (isMounted.current) {
              setRealtimeLocations(prev => ({
                ...prev,
                [payload.userId]: { lat: payload.latitude, lng: payload.longitude }
              }));
            }
          })
          .subscribe();
        
        channelsRef.current[friend.friend_id] = channel;
      }
    });
  }, [friendsData]);

  const friends = useMemo(() => {
    return friendsData.map(f => {
      const rt = realtimeLocations[f.friend_id];
      if (rt) {
        return { ...f, latitude: rt.lat, longitude: rt.lng };
      }
      return f;
    });
  }, [friendsData, realtimeLocations]);

  // Apply filter mode
  const filteredFriends = React.useMemo(() => {
    let friendsToDisplay = friends;
    switch (friendFilterMode) {
      case 'same_lot':
        // Only show friends who are parked
        friendsToDisplay = friends.filter(f => f.parked);
        break;
      case 'nearby':
        // For now, show all with location — true proximity check would
        // need the user's own coordinates passed in as a prop
        friendsToDisplay = friends;
        break;
      case 'all':
      default:
        friendsToDisplay = friends;
    }

    if (!region) {
      return friendsToDisplay;
    }

    return friendsToDisplay;
  }, [friends, friendFilterMode]);

  if (filteredFriends.length === 0) return null;

  return (
    <>
      {filteredFriends.map((friend) => {
        if (!friend.latitude || !friend.longitude) return null;

        return (
          <Marker
            key={friend.id}
            coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
            zIndex={15}
          >
            <View style={styles.container}>
              <View style={styles.avatarContainer}>
                {friend.avatar ? (
                  <Image source={{ uri: friend.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>
                      {friend.name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View style={[
                  styles.statusIndicator,
                  { backgroundColor: friend.parked ? '#3b82f6' : '#10b981' }
                ]} />
              </View>
              <View style={styles.nameTag}>
                <Text style={styles.nameText}>{friend.name}</Text>
              </View>
            </View>
          </Marker>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#cbd5e1',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarPlaceholder: {
    backgroundColor: '#71717a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameTag: {
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  nameText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
