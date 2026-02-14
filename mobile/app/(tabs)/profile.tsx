import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthProvider';
import { Stack, useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { session, user, loading, signOut } = useAuth();
  const router = useRouter();

  // If not logged in, we should ideally be redirected by root index.tsx
  // But strictly for this screen:
  if (!loading && !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Not logged in</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth/login')}>
          <Text style={styles.buttonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header handled by Tabs or Stack? Inner stack if needed. Context usually implies Tabs header is hidden */}
       <View style={styles.content}>
          <View style={styles.avatarPlaceholder}>
             <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.uid}>ID: {user?.id}</Text>

          {/* Vehicle Management Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Vehicles</Text>
            <Text style={styles.sectionText}>No vehicles added yet.</Text>
            <TouchableOpacity style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Vehicle</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
       </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    padding: 20,
  },
  text: { color: 'white' },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  email: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  uid: {
    color: '#666',
    fontSize: 12,
  },
  section: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sectionText: {
    color: '#999',
    marginBottom: 15,
  },
  addButton: {
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#dc2626',
    padding: 10,
    borderRadius: 8,
  },
  buttonText: { color: 'white' },
  signOutButton: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 30,
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
