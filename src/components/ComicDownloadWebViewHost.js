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
                        // Force scroll to trigger lazy loading
                        window.scrollBy(0, 1000);
                        
                        // Force lazy images to load
                        var allLazyImgs = document.querySelectorAll('img[data-original]');
                        for(var j=0; j<allLazyImgs.length; j++) {
                            if (!allLazyImgs[j].getAttribute('src') || allLazyImgs[j].getAttribute('src').includes('blank.gif')) {
                                allLazyImgs[j].setAttribute('src', allLazyImgs[j].getAttribute('data-original'));
                            }
                        }

                        // Find all canvases on the page (descrambled images)
                        var canvases = document.querySelectorAll('canvas');
                        // Also check for any img inside the reader area
                        var readerImgs = document.querySelectorAll('.panel-body img, .scramble-page img, div[id*="photo"] img, .owl-lazy');
                        
                        // Track canvas count stability
                        if (canvases.length > 0) {
                            if (canvases.length === lastCanvasCount) {
                                stableCount++;
                            } else {
                                stableCount = 0;
                                lastCanvasCount = canvases.length;
                            }
                        }
                        
                        // If canvases are stable for 3+ checks and we have some, extract them
                        if (canvases.length > 0 && stableCount >= 3) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            
                            var imgs = [];
                            for(var i=0; i<canvases.length; i++) {
                                try {
                                    imgs.push(canvases[i].toDataURL('image/jpeg', 0.8));
                                } catch(ce) {
                                    // canvas is tainted (cross-origin), skip
                                }
                            }
                            if (imgs.length > 0) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', images: imgs }));
                            } else {
                                // Canvas tainted - fall back to collecting raw image URLs
                                // STRICT filter: only get images that are actual comic pages
                                var allImgs = document.querySelectorAll('img[id^="album_photo_"], .scramble-page img');
                                var fallbackImgs = [];
                                for(var fi=0; fi<allImgs.length; fi++) {
                                    var fsrc = allImgs[fi].getAttribute('data-original') || allImgs[fi].getAttribute('src') || '';
                                    if (fsrc && fsrc.indexOf('blank.gif') === -1 && fsrc.indexOf('placeholder') === -1 && fsrc.indexOf('logo') === -1) {
                                        if (fsrc.indexOf('//') === 0) fsrc = 'https:' + fsrc;
                                        if (fsrc.indexOf('http') === 0) fallbackImgs.push(fsrc);
                                    }
                                }
                                
                                if (fallbackImgs.length > 0) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', images: fallbackImgs }));
                                } else {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', error: 'canvas tainted and no fallback img URLs found' }));
                                }
                            }
                        }
                        // Fallback: use img src directly if no canvases after a while
                        else if (retryCount > 15 && canvases.length === 0 && readerImgs.length > 0) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            
                            var imgs = [];
                            for(var i=0; i<readerImgs.length; i++) {
                                var src = readerImgs[i].getAttribute('data-original') || readerImgs[i].getAttribute('data-src') || readerImgs[i].getAttribute('src');
                                if (src && !src.includes('blank.gif') && !src.includes('placeholder')) {
                                    if (src.startsWith('//')) src = 'https:' + src;
                                    imgs.push(src);
                                }
                            }
                            if (imgs.length > 0) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', images: imgs }));
                            } else {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', error: 'no images found' }));
                            }
                        }
                        else if (retryCount > 60) {
                            _checkDone = true;
                            clearInterval(_checkInterval);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'photoData', error: 'timeout (' + canvases.length + ' canvas, ' + readerImgs.length + ' imgs, stable=' + stableCount + ')' }));
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
