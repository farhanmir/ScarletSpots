import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '@/context/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Stack } from 'expo-router';

export default function ProfileScreen() {
  const { session, user, loading, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  async function handleAuth() {
    setAuthLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) Alert.alert('Login Error', error.message);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) Alert.alert('Signup Error', error.message);
        else Alert.alert('Success', 'Check your email for confirmation!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  if (session && user) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Profile', headerShown: true }} />
        <View style={styles.content}>
          <View style={styles.avatarPlaceholder}>
             <Text style={styles.avatarText}>{user.email?.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.uid}>ID: {user.id}</Text>

          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isLogin ? 'Login' : 'Sign Up', headerShown: true }} />
      <View style={styles.authForm}>
        <Text style={styles.headerTitle}>ScarletSpots</Text>
        <Text style={styles.headerSubtitle}>{isLogin ? 'Welcome back' : 'Create an account'}</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry={true}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity 
          style={styles.authButton} 
          onPress={handleAuth}
          disabled={authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.authButtonText}>{isLogin ? 'Sign In' : 'Sign Up'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Dark background
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  authForm: {
    gap: 15,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: 'white',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    fontSize: 16,
  },
  authButton: {
    backgroundColor: '#dc2626',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  authButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  switchText: {
    color: '#999',
    fontSize: 14,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  email: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  uid: {
    color: '#666',
    fontSize: 12,
  },
  signOutButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 20,
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
});
