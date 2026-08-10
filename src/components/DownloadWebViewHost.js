import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { useDownload } from '../context/DownloadContext';
import { useTheme } from '../context/ThemeContext';
import { Feather } from '@expo/vector-icons';

/**
 * Non-intrusive Download WebView Host:
 * - Runs completely hidden in the background for 99% of normal operations.
 * - When interactive verification is required, renders as a small, non-blocking floating card in the corner.
 * - Never dims or blocks the user from reading or interacting with the rest of the application.
 */
export default function DownloadWebViewHost() {
    const { 
        scrapeUrl, 
        isCaptchaBlocked, 
        webViewRef, 
        onWebViewMessage, 
        activeTask, 
        cancelDownload 
    } = useDownload();
    const { colors } = useTheme();
    const [isMinimized, setIsMinimized] = useState(false);

    if (!scrapeUrl) return null;

    const checkScript = `
        (function() {
            var _challengeStart = 0;

            function check() {
                try {
                    if (window.location.href === 'about:blank' || !document.documentElement) return;

                    // Inject CSS to hide heavy elements and save CPU/Battery
                    if (!document.getElementById('nr-anti-heat')) {
                        var s = document.createElement('style');
                        s.id = 'nr-anti-heat';
                        s.innerHTML = 'img, video, iframe, canvas, div[class*="ad"] { display: none !important; }';
                        document.head.appendChild(s);
                    }

                    var title = document.title || '';
                    var html = document.documentElement.outerHTML || '';
                    var lower = (title + ' ' + html).toLowerCase();
                    
                    var isChallenge = title.indexOf('Just a moment') !== -1 ||
                                      title.indexOf('Cloudflare') !== -1 ||
                                      title.indexOf('Attention Required') !== -1 ||
                                      lower.indexOf('enable javascript and cookies to continue') !== -1 ||
                                      lower.indexOf('turnstile') !== -1 ||
                                      lower.indexOf('challenge-running') !== -1 ||
                                      document.getElementById('challenge-running') !== null ||
                                      document.getElementById('turnstile-wrapper') !== null;
                    
                    if (isChallenge) {
                        if (!_challengeStart) {
                            _challengeStart = Date.now();
                        }
                        var elapsed = Date.now() - _challengeStart;

                        // First 4.5 seconds: let Cloudflare JS solve automatically in background
                        if (elapsed < 4500) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'challengeWaiting',
                                url: window.location.href,
                                title: title 
                            }));
                        } else {
                            // After 4.5s: interactive captcha requiring user touch
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'captchaBlocked',
                                url: window.location.href,
                                title: title 
                            }));
                        }
                    } else {
                        _challengeStart = 0;
                        if (html.length > 200 && (html.indexOf('<body') !== -1 || html.indexOf('<div') !== -1)) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'pageLoaded', 
                                html: html,
                                url: window.location.href,
                                title: title
                            }));
                        }
                    }
                } catch(e) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.toString() }));
                }
            }

            if (!window.__nr_checker_installed) {
                window.__nr_checker_installed = true;
                setInterval(check, 600);
            }
            check();
        })();
        true;
    `;

    return (
        <View style={styles.rootOverlay} pointerEvents="box-none">
            {/* When interactive captcha is needed, show a small non-blocking floating card */}
            {isCaptchaBlocked && (
                <View style={styles.floatingWrapper} pointerEvents="box-none">
                    {isMinimized ? (
                        <TouchableOpacity
                            style={[styles.minimizedPill, { backgroundColor: colors.surface }]}
                            onPress={() => setIsMinimized(false)}
                            activeOpacity={0.8}
                        >
                            <Feather name="shield" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                            <Text style={[styles.minimizedText, { color: colors.text }]}>
                                🔒 安全驗證中 (點此展開)
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={[styles.floatingCard, { backgroundColor: colors.surface }]}>
                            <View style={styles.cardHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Feather name="shield" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                                        安全驗證 (請點擊勾選)
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    <TouchableOpacity 
                                        style={styles.headerActionBtn}
                                        onPress={() => setIsMinimized(true)}
                                    >
                                        <Feather name="minus" size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={styles.headerActionBtn}
                                        onPress={() => activeTask && cancelDownload(activeTask.url)}
                                    >
                                        <Feather name="x" size={16} color="#FF3B30" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.cardWebviewBox}>
                                <WebView
                                    ref={webViewRef}
                                    source={{ uri: scrapeUrl }}
                                    injectedJavaScript={checkScript}
                                    onLoadEnd={() => {
                                        if (webViewRef.current) {
                                            webViewRef.current.injectJavaScript(checkScript);
                                        }
                                    }}
                                    onMessage={onWebViewMessage}
                                    javaScriptEnabled={true}
                                    domStorageEnabled={true}
                                    sharedCookiesEnabled={true}
                                    thirdPartyCookiesEnabled={true}
                                    userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
                                />
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* When no interactive captcha is needed, keep the WebView fully alive in the background */}
            {!isCaptchaBlocked && (
                <View style={styles.hiddenBackgroundBox} pointerEvents="none">
                    <WebView
                        ref={webViewRef}
                        source={{ uri: scrapeUrl }}
                        injectedJavaScript={checkScript}
                        onLoadEnd={() => {
                            if (webViewRef.current) {
                                webViewRef.current.injectJavaScript(checkScript);
                            }
                        }}
                        onMessage={onWebViewMessage}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    rootOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
    },
    hiddenBackgroundBox: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        bottom: -100,
        left: -100,
    },
    floatingWrapper: {
        position: 'absolute',
        bottom: 30,
        right: 16,
        alignItems: 'flex-end',
    },
    floatingCard: {
        width: 300,
        height: 220,
        borderRadius: 16,
        padding: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    cardTitle: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    headerActionBtn: {
        padding: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    cardWebviewBox: {
        flex: 1,
        borderRadius: 10,
        overflow: 'hidden',
    },
    minimizedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    minimizedText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
