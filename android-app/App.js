import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from './src/theme';

import PairScreen from './src/screens/PairScreen';
import CameraScreen from './src/screens/CameraScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <NavigationContainer theme={{ dark: true, colors: { primary: COLORS.accent, background: COLORS.bg, card: COLORS.bgCard, text: COLORS.text, border: COLORS.border, notification: COLORS.red } }}>
        <Stack.Navigator initialRouteName="Pair" screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: COLORS.bg } }}>
          <Stack.Screen name="Pair" component={PairScreen} />
          <Stack.Screen name="Camera" component={CameraScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
