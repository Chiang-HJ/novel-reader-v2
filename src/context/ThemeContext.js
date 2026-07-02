import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem('@theme_isDark');
            if (savedTheme !== null) {
                setIsDark(JSON.parse(savedTheme));
            }
        } catch (e) {
            console.warn('Failed to load theme:', e);
        }
    };

    const toggleTheme = async () => {
        try {
            const newTheme = !isDark;
            setIsDark(newTheme);
            await AsyncStorage.setItem('@theme_isDark', JSON.stringify(newTheme));
        } catch (e) {
            console.warn('Failed to save theme:', e);
        }
    };

    // Define colors for both themes
    const theme = {
        isDark,
        toggleTheme,
        colors: {
            background: isDark ? '#121212' : '#f5f5f5',
            surface: isDark ? '#1e1e1e' : '#ffffff',
            text: isDark ? '#e0e0e0' : '#333333',
            textSecondary: isDark ? '#a0a0a0' : '#666666',
            border: isDark ? '#333333' : '#eeeeee',
            primary: '#10b981',
            highlight: isDark ? '#4a4a4a' : '#ffe066',
            danger: '#ff4444',
            overlay: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)'
        }
    };

    return (
        <ThemeContext.Provider value={theme}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
