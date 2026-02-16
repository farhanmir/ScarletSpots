import React from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { Marker } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';

interface Friend {
  id: string;
  name: string;
  avatarUrl: string;
  latitude: number;
  longitude: number;
  lastActive: string;
}

// Mock API call
const fetchFriends = async (): Promise<Friend[]> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return [
    {
      id: '1',
      name: 'Sarah',
      avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
      latitude: 40.5018,
      longitude: -74.4500, // Near the student center
      lastActive: '2m ago',
    },
    {
      id: '2',
      name: 'Mike',
      avatarUrl: 'https://i.pravatar.cc/150?u=mike',
      latitude: 40.5200,
      longitude: -74.4600, // Livingston
      lastActive: '5m ago',
    },
    {
      id: '3',
      name: 'Jessica',
      avatarUrl: 'https://i.pravatar.cc/150?u=jessica',
      latitude: 40.5050,
      longitude: -74.4450,
      lastActive: 'Just now',
    }
  ];
};

export default function FriendMarkers() {
  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: fetchFriends,
    refetchInterval: 60000, // Poll every minute
  });

  return (
    <>
      {friends.map((friend) => (
        <Marker
          key={friend.id}
          coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
          zIndex={15} // Above lots (10), below clusters (20)
        >
          <View style={styles.container}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
              <View style={styles.statusIndicator} />
            </View>
            <View style={styles.nameTag}>
               <Text style={styles.nameText}>{friend.name}</Text>
            </View>
          </View>
        </Marker>
      ))}
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
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981', // Online green
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
  }
});
