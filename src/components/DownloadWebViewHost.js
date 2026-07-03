import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useDownload } from '../context/DownloadContext';
import { useTheme } from '../context/ThemeContext';

/**
 * This component renders the download WebView.
 * It MUST be placed inside a proper View in App.js, NOT inside Context.Provider.
 * This is the correct iOS-safe architecture.
 */
export default function DownloadWebViewHost() {
    const { scrapeUrl, scrapeMode, isCaptchaBlocked, webViewRef, onWebViewMessage } = useDownload();
    const { colors } = useTheme();

    if (!scrapeUrl) return null;

    const isVisible = isCaptchaBlocked;

    return (
        <View
            style={isVisible ? [styles.container, styles.visible] : styles.hidden}
            pointerEvents={isVisible ? 'auto' : 'none'}
        >
            {isVisible && (
                <Text style={[styles.tip, { backgroundColor: colors.surface, color: colors.text }]}>
                    {isCaptchaBlocked
                        ? '防護網啟動中，請先勾選「我不是機器人」以繼續下載'
                        : '請稍候，正在載入中...'}
                </Text>
            )}
            <View style={[styles.webviewWrapper, isVisible ? styles.webviewVisible : styles.webviewHidden]}>
                <WebView
                    ref={webViewRef}
                    source={{ uri: scrapeUrl }}
                    injectedJavaScript={`
                        var _checkDone = false;
                        var _checkInterval = setInterval(function() {
                            if (_checkDone) return;
                            var title = document.title || '';
                            if (title.indexOf('Just a moment') === -1 &&
                                title.indexOf('Cloudflare') === -1 &&
                                title.indexOf('Attention Required') === -1) {
                                _checkDone = true;
                                clearInterval(_checkInterval);
                                try {
                                    var mode = '${scrapeMode}';
                                    if (mode === 'chapter') {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: document.body.innerHTML }));
                                    } else {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'novelInfoHtml', html: document.body.innerHTML, url: window.location.href }));
                                    }
                                } catch(e) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.toString() }));
                                }
                            }
                        }, 1000);
                        true;
                    `}
                    onMessage={onWebViewMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
    },
    visible: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    hidden: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -1,
        opacity: 0,
    },
    tip: {
        textAlign: 'center',
        padding: 12,
        fontSize: 14,
        fontWeight: 'bold',
        borderRadius: 8,
        marginBottom: 10,
        overflow: 'hidden',
    },
    webviewWrapper: {
        width: '100%',
        borderRadius: 8,
        overflow: 'hidden',
    },
    webviewVisible: {
        height: 400,
    },
    webviewHidden: {
        flex: 1,
    },
});
