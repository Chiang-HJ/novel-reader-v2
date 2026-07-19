import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DescrambleWebView = forwardRef((props, ref) => {
    const webViewRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    
    // Store promises for pending descramble jobs
    const pendingJobs = useRef({});
    const jobIdCounter = useRef(0);

    const HTML = `
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>body { margin: 0; padding: 0; background: transparent; }</style>
    </head>
    <body>
        <canvas id="canvas"></canvas>
        <script>
            window.addEventListener('message', function(event) {
                try {
                    var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (data && data.type === 'DESCRAMBLE') {
                        var img = new Image();
                        img.onload = function() {
                            var canvas = document.getElementById('canvas');
                            var ctx = canvas.getContext('2d');
                            
                            var w = img.width;
                            var h = img.height;
                            var num = data.num;
                            
                            canvas.width = w;
                            canvas.height = h;
                            
                            if (num === 0 || num === 1) {
                                ctx.drawImage(img, 0, 0);
                            } else {
                                var move = Math.floor(h / num);
                                var over = h % num;
                                
                                var currentDstY = 0;
                                for (var i = 0; i < num; i++) {
                                    var y_src = h - (move * (i + 1)) - over;
                                    ctx.drawImage(img, 0, y_src, w, move, 0, currentDstY, w, move);
                                    currentDstY += move;
                                }
                                if (over > 0) {
                                    var y_src = h - over;
                                    ctx.drawImage(img, 0, y_src, w, over, 0, currentDstY, w, over);
                                }
                            }
                            
                            var resultBase64 = canvas.toDataURL('image/jpeg', 0.9);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'DESCRAMBLE_RESULT', 
                                jobId: data.jobId, 
                                base64: resultBase64 
                            }));
                        };
                        img.onerror = function() {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'DESCRAMBLE_ERROR', 
                                jobId: data.jobId, 
                                error: 'Image load failed in WebView' 
                            }));
                        };
                        
                        var mime = data.mimeType || 'image/jpeg';
                        img.src = "data:" + mime + ";base64," + data.base64;
                    }
                } catch(e) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ 
                        type: 'DESCRAMBLE_ERROR', 
                        jobId: typeof data !== 'undefined' ? data.jobId : -1, 
                        error: e.message 
                    }));
                }
            });
            
            // Notify ready
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        </script>
    </body>
    </html>
    `;

    useImperativeHandle(ref, () => ({
        descramble: (base64, num, mimeType = 'image/jpeg') => {
            return new Promise((resolve, reject) => {
                if (!isReady || !webViewRef.current) {
                    reject(new Error('DescrambleWebView is not ready'));
                    return;
                }
                
                const jobId = jobIdCounter.current++;
                pendingJobs.current[jobId] = { resolve, reject };
                
                const message = JSON.stringify({
                    type: 'DESCRAMBLE',
                    jobId,
                    base64,
                    num,
                    mimeType
                });
                
                webViewRef.current.injectJavaScript(`window.postMessage(${JSON.stringify(message)}, '*'); true;`);
            });
        }
    }));

    const onMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'READY') {
                setIsReady(true);
            } else if (data.type === 'DESCRAMBLE_RESULT') {
                const job = pendingJobs.current[data.jobId];
                if (job) {
                    // Remove the "data:image/jpeg;base64," prefix if it exists, to match React Native FileSystem expectations
                    const cleanBase64 = data.base64.replace(/^data:image\/\w+;base64,/, '');
                    job.resolve(cleanBase64);
                    delete pendingJobs.current[data.jobId];
                }
            } else if (data.type === 'DESCRAMBLE_ERROR') {
                const job = pendingJobs.current[data.jobId];
                if (job) {
                    job.reject(new Error(data.error));
                    delete pendingJobs.current[data.jobId];
                }
            }
        } catch(e) {

        }
    };

    return (
        <View style={styles.maskContainer} pointerEvents="none">
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: HTML }}
                onMessage={onMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                style={{ width: 10, height: 10 }}
            />
            {/* Opaque mask to hide it from the user but keep it visible to iOS */}
            <View style={styles.mask} pointerEvents="none" />
        </View>
    );
});

const styles = StyleSheet.create({
    maskContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 10,
        height: 10,
        overflow: 'hidden',
        zIndex: -1
    },
    mask: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 10,
        height: 10,
        backgroundColor: '#000'
    }
});

export default DescrambleWebView;
