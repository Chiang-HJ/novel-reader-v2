import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import TocScreen from './src/screens/TocScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { DownloadProvider } from './src/context/DownloadContext';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { isDark, colors } = useTheme();
  
  const MyTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={MyTheme}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: '我的書櫃' }}
        />
        <Stack.Screen 
          name="Reader" 
          component={ReaderScreen} 
          options={{ title: '閱讀中' }}
        />
        <Stack.Screen 
          name="Toc" 
          component={TocScreen} 
          options={{ title: '目錄' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DownloadProvider>
        <RootNavigator />
      </DownloadProvider>
    </ThemeProvider>
  );
}
