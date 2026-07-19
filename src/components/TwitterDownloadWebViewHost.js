import React from 'react';
import { View, Modal, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTwitterDownload } from '../context/TwitterDownloadContext';

const TwitterDownloadWebViewHost = () => {
    const { activeTwitterTask, handleWebViewMessage, cancelTwitterDownload } = useTwitterDownload();

    if (!activeTwitterTask) return null;

    const { url: twitterUrl, isDirectExtract } = activeTwitterTask;

    if (isDirectExtract) {
        return (
            <Modal visible={true} animationType="slide">
                <View style={{ flex: 1, backgroundColor: '#121212', paddingTop: 50 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333' }}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>推特深度解析 (私人推文)</Text>
                        <TouchableOpacity onPress={cancelTwitterDownload}>
                            <Text style={{ color: '#ff4444', fontSize: 16 }}>取消</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: '#aaa', flex: 1 }}>請手動貼上網址並點擊解析，一旦影片載入，系統將自動背景下載。</Text>
                    </View>
                    <WebView 
                        key={twitterUrl + "_direct"}
                        source={{ uri: 'https://snapany.com/zh-Hant/twitter' }}
                        injectedJavaScript={`
                            setTimeout(function() {
                                var input = document.querySelector('input[type="url"]') || document.querySelector('input[name="url"]') || document.querySelector('input');
                                var btn = document.querySelector('button[type="submit"]') || document.querySelector('button');
                                if (input && btn && !input.value) {
                                    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                    if (nativeInputValueSetter) {
                                        nativeInputValueSetter.call(input, '${twitterUrl}');
                                    } else {
                                        input.value = '${twitterUrl}';
                                    }
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                    
                                    setInterval(function() {
                                        var resLinks = document.querySelectorAll('a[href*=".mp4"], a[download]');
                                        var validLink = null;
                                        for (var i = 0; i < resLinks.length; i++) {
                                            if (resLinks[i].href && resLinks[i].href.startsWith('http') && !resLinks[i].href.includes('snapany.com')) {
                                                validLink = resLinks[i].href;
                                                break;
                                            }
                                        }
                                        if (validLink && !window.didExtractTwitter) {
                                            window.didExtractTwitter = true;
                                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', url: validLink }));
                                        }
                                    }, 1000);
                                }
                            }, 2000);
                            true;
                        `}
                        onMessage={handleWebViewMessage}
                        javaScriptEnabled={true}
                        originWhitelist={['https://*', 'http://*']}
                    />
                </View>
            </Modal>
        );
    }

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, overflow: 'hidden', opacity: 0 }} pointerEvents="none">
            <WebView 
                key={twitterUrl + "_auto"}
                source={{ uri: 'https://snapany.com/zh-Hant/twitter' }}
                injectedJavaScript={`
                    setTimeout(function() {
                        var input = document.querySelector('input[type="url"]') || document.querySelector('input[name="url"]') || document.querySelector('input');
                        var btn = document.querySelector('button[type="submit"]') || document.querySelector('button');
                        if (input && btn) {
                            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, '${twitterUrl}');
                            } else {
                                input.value = '${twitterUrl}';
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            setTimeout(function() {
                                btn.click();
                                
                                var tries = 0;
                                var check = setInterval(function() {
                                    tries++;
                                    var resLinks = document.querySelectorAll('a[href*=".mp4"], a[download]');
                                    var validLink = null;
                                    for (var i = 0; i < resLinks.length; i++) {
                                        if (resLinks[i].href && resLinks[i].href.startsWith('http') && !resLinks[i].href.includes('snapany.com')) {
                                            validLink = resLinks[i].href;
                                            break;
                                        }
                                    }
                                    
                                    if (validLink) {
                                        clearInterval(check);
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', url: validLink }));
                                    } else if (tries > 20) {
                                        clearInterval(check);
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'Timeout waiting for SnapAny result' }));
                                    }
                                }, 1000);
                            }, 500);
                        } else {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'SnapAny form not found' }));
                        }
                    }, 2000);
                    true;
                `}
                onMessage={handleWebViewMessage}
                javaScriptEnabled={true}
                originWhitelist={['https://*', 'http://*']}
            />
        </View>
    );
};

export default TwitterDownloadWebViewHost;
