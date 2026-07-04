import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const THEMES = {
    minimalist: {
        id: 'minimalist',
        name: '原生極簡風',
        isDark: false,
        colors: {
            background: '#f2f2f7',
            surface: '#ffffff',
            text: '#1c1c1e',
            textSecondary: '#8e8e93',
            border: '#e5e5ea',
            primary: '#007aff',
            highlight: '#ffd60a',
            danger: '#ff3b30',
            overlay: 'rgba(0,0,0,0.4)',
        }
    },
    soft: {
        id: 'soft',
        name: '柔和護眼風',
        isDark: false,
        colors: {
            background: '#fcf9f2',
            surface: '#f3ead8',
            text: '#4a3f35',
            textSecondary: '#8a7d72',
            border: '#e6d9c6',
            primary: '#8b6b61',
            highlight: '#e3c598',
            danger: '#d9534f',
            overlay: 'rgba(74, 63, 53, 0.4)',
        }
    },
    cyberpunk: {
        id: 'cyberpunk',
        name: '科技暗黑風',
        isDark: true,
        colors: {
            background: '#0d1117',
            surface: '#161b22',
            text: '#c9d1d9',
            textSecondary: '#8b949e',
            border: '#30363d',
            primary: '#58a6ff',
            highlight: '#3b3b3b',
            danger: '#f85149',
            overlay: 'rgba(0,0,0,0.7)',
        }
    },
    softDark: {
        id: 'softDark',
        name: '高級柔和深色',
        isDark: true,
        colors: {
            background: '#1C1E21',
            surface: '#24272B',
            text: 'rgba(255, 255, 255, 0.85)',
            textSecondary: 'rgba(255, 255, 255, 0.5)',
            border: '#363A40',
            primary: '#60A5FA',
            highlight: 'rgba(96, 165, 250, 0.2)',
            danger: '#F87171',
            overlay: 'rgba(0,0,0,0.6)',
        }
    }
};

export const ThemeProvider = ({ children }) => {
    const [currentThemeId, setCurrentThemeId] = useState('softDark'); // Default to new premium theme
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        loadTheme();
        return () => {
            isMounted.current = false;
        };
    }, []);

    const loadTheme = async () => {
        try {
            // First check the new multi-theme key
            const savedThemeId = await AsyncStorage.getItem('@app_theme_id');
            if (!isMounted.current) return;
            if (savedThemeId && THEMES[savedThemeId]) {
                setCurrentThemeId(savedThemeId);
                return;
            }
            
            // Fallback for older version
            const legacyDark = await AsyncStorage.getItem('@theme_isDark');
            if (!isMounted.current) return;
            if (legacyDark !== null) {
                setCurrentThemeId(JSON.parse(legacyDark) ? 'softDark' : 'minimalist');
            }
        } catch (e) {
            console.warn('Failed to load theme:', e);
        }
    };

    const changeTheme = async (themeId) => {
        try {
            if (THEMES[themeId]) {
                setCurrentThemeId(themeId);
                await AsyncStorage.setItem('@app_theme_id', themeId);
            }
        } catch (e) {
            console.warn('Failed to save theme:', e);
        }
    };

    // Keep toggleTheme for backwards compatibility during transition, mapping to minimal <-> cyberpunk
    const toggleTheme = () => {
        if (currentThemeId === 'cyberpunk') {
            changeTheme('minimalist');
        } else {
            changeTheme('cyberpunk');
        }
    };

    const activeTheme = THEMES[currentThemeId];

    const contextValue = {
        themeId: activeTheme.id,
        isDark: activeTheme.isDark,
        colors: activeTheme.colors,
        changeTheme,
        toggleTheme,
        themeName: activeTheme.name,
        availableThemes: Object.values(THEMES).map(t => ({ id: t.id, name: t.name }))
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
