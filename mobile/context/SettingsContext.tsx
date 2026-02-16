import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsContextType {
  showFriends: boolean;
  setShowFriends: (value: boolean) => void;
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

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const value = await AsyncStorage.getItem('showFriends');
        if (value !== null) {
          setShowFriends(JSON.parse(value));
        }
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

  return (
    <SettingsContext.Provider value={{ showFriends, setShowFriends: updateShowFriends }}>
      {children}
    </SettingsContext.Provider>
  );
};
