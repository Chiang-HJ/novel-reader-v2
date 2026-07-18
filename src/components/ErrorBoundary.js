import React from 'react';
import { Text, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';

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
    }

    render() {
        if (this.state.hasError) {
            return (
                <SafeAreaView style={{ flex: 1, backgroundColor: '#b00020', padding: 20 }}>
                    <ScrollView>
                        <Text style={{ fontSize: 22, color: 'white', fontWeight: 'bold' }}>發生錯誤</Text>
                        <Text style={{ fontSize: 14, color: 'white', marginTop: 8 }}>請截圖以下訊息回報：</Text>
                        <Text style={{ color: '#FFD700', marginTop: 16, fontFamily: 'monospace', fontSize: 12 }}>
                            {this.state.error ? this.state.error.toString() : 'Unknown Error'}
                        </Text>
                        <Text style={{ color: '#ffcccc', marginTop: 8, fontFamily: 'monospace', fontSize: 10 }}>
                            {this.state.info ? this.state.info.componentStack : ''}
                        </Text>
                        <TouchableOpacity
                            style={{ marginTop: 30, padding: 14, backgroundColor: 'white', borderRadius: 8 }}
                            onPress={() => this.setState({ hasError: false, error: null, info: null })}
                        >
                            <Text style={{ textAlign: 'center', color: '#b00020', fontWeight: 'bold' }}>重新嘗試</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            );
        }
        return this.props.children;
    }
}
