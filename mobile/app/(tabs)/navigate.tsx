import { View, Text, StyleSheet } from 'react-native';

// This screen is never shown — the Navigate tab is disabled in the tab bar.
// This file exists only to satisfy expo-router's file-based routing.
export default function NavigateScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Navigation coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#666',
    fontSize: 16,
  },
});
