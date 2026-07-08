import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import FolderScreen from './src/screens/FolderScreen';
import VaultScreen from './src/screens/VaultScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import TocScreen from './src/screens/TocScreen';
import BlogFeedScreen from './src/screens/BlogFeedScreen';
import WyblogsFeedScreen from './src/screens/WyblogsFeedScreen';
import JMComicFeedScreen from './src/screens/JMComicFeedScreen';
import ComicReaderScreen from './src/screens/ComicReaderScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { DownloadProvider } from './src/context/DownloadContext';
import { ComicDownloadProvider } from './src/context/ComicDownloadContext';
import DownloadWebViewHost from './src/components/DownloadWebViewHost';
import ComicDownloadWebViewHost from './src/components/ComicDownloadWebViewHost';
import ErrorBoundary from './src/components/ErrorBoundary';

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
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: '我的書架' }} />
        <Stack.Screen name="Folder" component={FolderScreen} options={({ route }) => ({ title: route.params.folderName || '資料夾' })} />
        <Stack.Screen name="Vault" component={VaultScreen} options={{ title: '私密金庫' }} />
        <Stack.Screen name="Reader" component={ReaderScreen} options={{ title: '閱讀中' }} />
        <Stack.Screen name="Toc" component={TocScreen} options={{ title: '目錄' }} />
        <Stack.Screen name="BlogFeed" component={BlogFeedScreen} options={{ title: '語錄集' }} />
        <Stack.Screen name="WyblogsFeed" component={WyblogsFeedScreen} options={{ title: 'Wyblogs 小說' }} />
        <Stack.Screen name="JMComicFeed" component={JMComicFeedScreen} options={{ title: '禁漫天堂 (18comic)' }} />
        <Stack.Screen name="ComicReader" component={ComicReaderScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppContent() {
  return (
    // This View is the single root. Both Navigator and WebViewHost live as siblings inside it.
    <View style={{ flex: 1 }}>
      <RootNavigator />
      {/* WebView for download engine — rendered as sibling to navigator, NOT inside Provider */}
      <DownloadWebViewHost />
      <ComicDownloadWebViewHost />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <DownloadProvider>
            <ComicDownloadProvider>
              <AppContent />
            </ComicDownloadProvider>
          </DownloadProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
