import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FriendFilterMode = 'all' | 'same_lot' | 'nearby';

interface SettingsContextType {
  showFriends: boolean;
  setShowFriends: (value: boolean) => void;
  friendFilterMode: FriendFilterMode;
  setFriendFilterMode: (mode: FriendFilterMode) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showFriends, setShowFriends] = useState(true);
  const [friendFilterMode, setFriendFilterMode] = useState<FriendFilterMode>('all');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const showVal = await AsyncStorage.getItem('showFriends');
        if (showVal !== null) setShowFriends(JSON.parse(showVal));

        const filterVal = await AsyncStorage.getItem('friendFilterMode');
        if (filterVal !== null) setFriendFilterMode(filterVal as FriendFilterMode);
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    loadSettings();
  }, []);

  const updateShowFriends = async (value: boolean) => {
    setShowFriends(value);
    try {
      await AsyncStorage.setItem('showFriends', JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  const updateFriendFilterMode = async (mode: FriendFilterMode) => {
    setFriendFilterMode(mode);
    try {
      await AsyncStorage.setItem('friendFilterMode', mode);
    } catch (e) {
      console.error('Failed to save friend filter mode', e);
    }
  };

  return (
    <SettingsContext.Provider value={{
      showFriends,
      setShowFriends: updateShowFriends,
      friendFilterMode,
      setFriendFilterMode: updateFriendFilterMode,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};
