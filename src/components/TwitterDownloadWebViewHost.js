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
                        <Text style={{ color: '#aaa', flex: 1 }}>如遇敏感內容，請先登入推特帳號。影片載入後，系統將自動擷取高畫質下載連結。</Text>
                    </View>
                    <WebView 
                        key={twitterUrl + "_direct"}
                        source={{ uri: twitterUrl }}
                        injectedJavaScript={`
                            (function() {
                                if (window.didInjectTwitterSniffer) return;
                                window.didInjectTwitterSniffer = true;
                                
                                var originalFetch = window.fetch;
                                window.fetch = function() {
                                    var p = originalFetch.apply(this, arguments);
                                    p.then(function(res) {
                                        var url = res.url || '';
                                        if (url.indexOf('TweetDetail') !== -1 || url.indexOf('TweetResultByRestId') !== -1) {
                                            res.clone().json().then(function(data) {
                                                try {
                                                    var mediaList = [];
                                                    JSON.stringify(data, function(key, value) {
                                                        if (key === 'video_info' && value && value.variants) {
                                                            mediaList.push(value);
                                                        }
                                                        return value;
                                                    });
                                                    
                                                    if (mediaList.length > 0) {
                                                        var variants = mediaList[0].variants;
                                                        var mp4s = variants.filter(function(v) { return v.content_type === 'video/mp4'; });
                                                        mp4s.sort(function(a,b) { return (b.bitrate || 0) - (a.bitrate || 0); });
                                                        if (mp4s.length > 0 && !window.didExtractTwitter) {
                                                            window.didExtractTwitter = true;
                                                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', urls: [mp4s[0].url] }));
                                                        }
                                                    }
                                                } catch(e) {}
                                            }).catch(function(){});
                                        }
                                        
                                        if (url.indexOf('video.twimg.com') !== -1 && url.indexOf('.mp4') !== -1) {
                                            if (!window.didExtractTwitter) {
                                                window.didExtractTwitter = true;
                                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', urls: [url] }));
                                            }
                                        }
                                        return res;
                                    });
                                    return p;
                                };
                                
                                var originalXHR = window.XMLHttpRequest;
                                function newXHR() {
                                    var realXHR = new originalXHR();
                                    realXHR.addEventListener("readystatechange", function() {
                                        if(realXHR.readyState === 4 && realXHR.status === 200){
                                            var url = realXHR.responseURL || '';
                                            if (url.indexOf('video.twimg.com') !== -1 && url.indexOf('.mp4') !== -1) {
                                                if (!window.didExtractTwitter) {
                                                    window.didExtractTwitter = true;
                                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', urls: [url] }));
                                                }
                                            }
                                        }
                                    }, false);
                                    return realXHR;
                                }
                                window.XMLHttpRequest = newXHR;
                            })();
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
                source={{ uri: 'https://savetwitter.net/zh-tw' }}
                injectedJavaScript={`
                    setTimeout(function() {
                        var input = document.querySelector('input#s_input') || document.querySelector('input[name="q"]') || document.querySelector('input[type="text"]');
                        var btn = document.querySelector('button.btn-red') || document.querySelector('button#btn-submit') || document.querySelector('button');
                        
                        if (input && btn && !window.didSubmitTwitterForm) {
                            window.didSubmitTwitterForm = true;
                            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, '${twitterUrl}');
                            } else {
                                input.value = '${twitterUrl}';
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            setTimeout(function() {
                                btn.click();
                            }, 500);
                        }

                        var tries = 0;
                        var check = setInterval(function() {
                            tries++;
                            
                            var errorText = document.body.innerText;
                            if (errorText.indexOf('Private video') !== -1 || errorText.indexOf('No video found') !== -1 || errorText.indexOf('私人') !== -1) {
                                clearInterval(check);
                                window.ReactNativeWebView.postMessage('ERROR_NO_VIDEO');
                                return;
                            }

                            // savetwitter usually gives a.btn for downloads
                            var resLinks = document.querySelectorAll('a[href*=".mp4"], a[href*="video.twimg.com"], a.btn-success, a.btn-primary');
                            var validLinks = [];
                            for (var i = 0; i < resLinks.length; i++) {
                                var href = resLinks[i].href || resLinks[i].getAttribute('href');
                                if (href && href.startsWith('http') && (href.indexOf('.mp4') !== -1 || href.indexOf('video.twimg.com') !== -1 || href.indexOf('download') !== -1)) {
                                    validLinks.push(href);
                                }
                            }
                            
                            if (validLinks.length > 0 && !window.didExtractTwitter) {
                                window.didExtractTwitter = true;
                                clearInterval(check);
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auto_twitter_data', urls: [validLinks[0]] }));
                            } else if (tries > 30) {
                                clearInterval(check);
                                window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'Timeout waiting for savetwitter result' }));
                            }
                        }, 1000);
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
