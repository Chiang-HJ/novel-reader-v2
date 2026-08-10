import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useComicDownload } from '../context/ComicDownloadContext';
import { useTheme } from '../context/ThemeContext';

export default function ComicDownloadWebViewHost() {
    const { scrapeUrl, scrapeMode, scrapeId, webViewRef, onWebViewMessage } = useComicDownload();
    const { colors } = useTheme();

    const modeType = scrapeMode === 'album' ? 'albumData' : 'photoData';

    // The script to inject
    const injectedScript = `
        (function() {
            var _checkDone = false;
            var retryCount = 0;
            var lastCanvasCount = 0;
            var stableCount = 0;
            var _checkInterval = setInterval(function() {
                if (_checkDone) return;
                retryCount++;
                
                var mode = '${scrapeMode}';
                
                try {
                    // Detect Cloudflare
                    if (document.title.includes('Just a moment') || document.title.includes('Cloudflare') || document.title.includes('Attention Required')) {
                        if (retryCount > 30) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: mode === 'album' ? 'albumData' : 'photoData', error: 'Cloudflare block' }));
                        }
                        return;
                    }

                    if (mode === 'album') {
                        if (document.querySelector('.episode') || document.querySelector('.btn-toolbar') || document.querySelector('.list-col') || document.querySelector('a[href*="/photo/"]')) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            var extractedAuthor = '';
                            try {
                                var authorEls = document.querySelectorAll('a[href*="search_query"], a[href*="main_tag"]');
                                for(var i=0; i<authorEls.length; i++) {
                                    var el = authorEls[i];
                                    var parent = el.parentElement;
                                    if(parent && (parent.innerText.includes('作者') || parent.getAttribute('data-original-title') === '作者')) {
                                        extractedAuthor = el.innerText.trim();
                                        break;
                                    }
                                }
                                if(!extractedAuthor) {
                                    var authorTag = document.querySelector('[data-original-title="作者"] a');
                                    if(authorTag) extractedAuthor = authorTag.innerText.trim();
                                }
                            } catch(e) {}
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'albumData', html: document.body.innerHTML, author: extractedAuthor }));
                        } else if (retryCount > 20) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'albumData', error: 'timeout: no chapters found' }));
                        }
                    } else if (mode === 'photo') {
                        // Inject CSS to hide everything to save GPU/CPU
                        if (!document.getElementById('anti-heat-css')) {
                            var style = document.createElement('style');
                            style.id = 'anti-heat-css';
                            style.innerHTML = 'img, video, iframe, canvas, div[class*="ad"] { display: none !important; }';
                            document.head.appendChild(style);
                        }

                        // Just find the raw image URLs, no need to scroll or render canvases!
                        // The offline DescrambleWebView handles the actual descrambling.
                        var readerImgs = document.querySelectorAll('img[id^="album_photo_"], .scramble-page img, .panel-body img[data-original], div[id*="photo"] img');
                        var imgs = [];
                        
                        for(var i=0; i<readerImgs.length; i++) {
                            var src = readerImgs[i].getAttribute('data-original') || readerImgs[i].getAttribute('src') || '';
                            if (src && !src.includes('blank.gif') && !src.includes('placeholder') && !src.includes('logo')) {
                                if (src.startsWith('//')) src = 'https:' + src;
                                if (src.startsWith('http')) {
                                    if (imgs.indexOf(src) === -1) imgs.push(src);
                                }
                            }
                        }
                        
                        // Wait until we find a reasonable amount of images or timeout
                        if (imgs.length > 0) {
                            if (imgs.length === lastCanvasCount) {
                                stableCount++;
                            } else {
                                stableCount = 0;
                                lastCanvasCount = imgs.length;
                            }
                            
                            if (stableCount >= 2) {
                                _checkDone = true;
                                clearInterval(_checkInterval);
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', images: imgs, cookies: document.cookie }));
                            }
                        } else if (retryCount > 30) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', error: 'timeout: no images found' }));
                        }
                    }
                } catch (e) {
                    _checkDone = true;
                    clearInterval(_checkInterval);
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: mode === 'album' ? 'albumData' : 'photoData', error: e.message }));
                }
            }, 1000);
        })();
        true;
    `;

    if (!scrapeUrl) return null;

    const handleError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;

        var errMsg = 'Network error: ' + (nativeEvent.description || 'unknown') + ' (code: ' + (nativeEvent.code || '?') + ')';
        onWebViewMessage({
            nativeEvent: {
                data: JSON.stringify({ type: modeType, error: errMsg })
            }
        });
    };

    const handleHttpError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;

        var errMsg = 'HTTP error: ' + (nativeEvent.statusCode || '?');
        onWebViewMessage({
            nativeEvent: {
                data: JSON.stringify({ type: modeType, error: errMsg })
            }
        });
    };

    return (
        <View style={styles.hidden} pointerEvents="none">
            <WebView
                key={scrapeId}
                ref={webViewRef}
                source={{ uri: scrapeUrl }}
                sharedCookiesEnabled={true}
                thirdPartyCookiesEnabled={true}
                originWhitelist={['*']}
                injectedJavaScript={injectedScript}
                onMessage={onWebViewMessage}
                userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
                onError={handleError}
                onHttpError={handleHttpError}
                style={{ width: 1000, height: 2000 }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    hidden: { width: 1, height: 1, position: 'absolute', top: -1000, opacity: 0 }
});
