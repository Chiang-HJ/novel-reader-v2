import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        this.setState({ error, info });
        console.error('ErrorBoundary caught an error:', error, info);
        if (typeof this.props.onError === 'function') {
            try {
                this.props.onError(error, info);
            } catch (e) {
                console.error('Error in ErrorBoundary onError callback:', e);
            }
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, info: null });
    };

    handleSecondaryReset = () => {
        this.handleReset();
        if (typeof this.props.onReset === 'function') {
            try {
                this.props.onReset();
            } catch (e) {
                console.error('Error in ErrorBoundary onReset callback:', e);
            }
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <SafeAreaView style={styles.container}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <Text style={styles.title}>⚠️ 應用程式發生未預期的錯誤</Text>
                        <Text style={styles.subtitle}>已自動保護背景下載與書架資料，請嘗試以下救援選項：</Text>
                        
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>
                                {this.state.error ? (this.state.error?.message || this.state.error.toString()) : '未知錯誤'}
                            </Text>
                            {this.state.info && this.state.info.componentStack ? (
                                <Text style={styles.stackText}>
                                    {this.state.info.componentStack.trim().split('\n').slice(0, 5).join('\n')}
                                </Text>
                            ) : null}
                        </View>
                        
                        <TouchableOpacity
                            style={styles.buttonPrimary}
                            onPress={this.handleReset}
                        >
                            <Text style={styles.buttonPrimaryText}>🔄 重新嘗試載入本頁</Text>
                        </TouchableOpacity>

                        {this.props.onReset ? (
                            <TouchableOpacity
                                style={styles.buttonSecondary}
                                onPress={this.handleSecondaryReset}
                            >
                                <Text style={styles.buttonSecondaryText}>🏠 返回首頁</Text>
                            </TouchableOpacity>
                        ) : null}
                    </ScrollView>
                </SafeAreaView>
            );
        }
        return this.props.children;
    }
}

const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
        padding: 20
    },
    scrollContent: {
        paddingVertical: 20
    },
    title: {
        fontSize: 20,
        color: '#ff4d4f',
        fontWeight: 'bold',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 14,
        color: '#bfbfbf',
        marginBottom: 16,
        lineHeight: 20
    },
    errorBox: {
        backgroundColor: '#2a2a2a',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#434343',
        marginBottom: 24
    },
    errorText: {
        color: '#ffa39e',
        fontFamily: monoFont,
        fontSize: 13,
        fontWeight: '600'
    },
    stackText: {
        color: '#8c8c8c',
        fontFamily: monoFont,
        fontSize: 11,
        marginTop: 8
    },
    buttonPrimary: {
        backgroundColor: '#1890ff',
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 12,
        alignItems: 'center'
    },
    buttonPrimaryText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    buttonSecondary: {
        backgroundColor: '#333',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#555'
    },
    buttonSecondaryText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    }
});
