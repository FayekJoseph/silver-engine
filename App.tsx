import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Platform, View } from 'react-native';
import { ChatScreen } from './src/screens/ChatScreen';
import { COLORS } from './src/constants/theme';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea}>
        <ChatScreen />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 30 : 0,
  },
});