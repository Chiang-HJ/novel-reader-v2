import React, { useState, useEffect, useRef } from 'react';
import { View, Image, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * BoyloveImage
 * Step 1: A hidden WebView reads the scrambled image as base64, runs the exact
 *         do_mergeImg() Canvas logic from boylove.cc, then exports the result
 *         as a base64 PNG and posts it back via ReactNativeWebView.postMessage.
 * Step 2: Once the descrambled base64 is received, the WebView is unmounted
 *         and a normal <Image> is shown. This restores all touch/zoom gestures.
 */
const BoyloveImage = ({ uri, screenWidth = SCREEN_WIDTH, needsDescrambling = true }) => {
    const [scrambledB64, setScrambledB64] = useState(null);
    const [mimeType, setMimeType] = useState('image/jpeg');
    const [descrambledB64, setDescrambledB64] = useState(null);
    const [imgHeight, setImgHeight] = useState(screenWidth * 1.5);
    const [error, setError] = useState(false);

    // Reset whenever the URI changes
    useEffect(() => {
        let cancelled = false;
        setScrambledB64(null);
        setDescrambledB64(null);
        setError(false);
        setImgHeight(screenWidth * 1.5);

        const load = async () => {
            try {
                const lower = (uri || '').toLowerCase();
                let mime = 'image/jpeg';
                if (lower.endsWith('.webp')) mime = 'image/webp';
                else if (lower.endsWith('.png')) mime = 'image/png';

                const b64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                if (!cancelled) {
                    setMimeType(mime);
                    setScrambledB64(b64);
                }
            } catch (e) {
                if (!cancelled) setError(true);
            }
        };

        if (uri) load();
        return () => { cancelled = true; };
    }, [uri]);

    // Step 1: hidden WebView does the descrambling
    // The HTML loads the scrambled image, runs do_mergeImg(), then exports
    // the canvas as a PNG data URL and posts it back.
    const webViewHtml = scrambledB64 ? `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000">
<canvas id="c" style="display:none"></canvas>
<script>
(function() {
    var num = 13;
    var img = new Image();
    img.onload = function() {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var canvas = document.getElementById('c');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');

        // Exact copy of boylove's do_mergeImg logic, OR bypass if not needed
        if (!${needsDescrambling} || h >= 4000) {
            ctx.drawImage(img, 0, 0, w, h);
        } else {
            for (var i = 1; i <= num; i++) {
                if (i === num) {
                    var lastW = w - Math.floor(w/num)*(num-1);
                    ctx.drawImage(img,
                        0, 0, lastW, h,
                        Math.floor(w/num)*(num-1), 0, lastW, h
                    );
                } else {
                    var pw = Math.floor(w/num);
                    ctx.drawImage(img,
                        w - pw*i, 0, pw, h,
                        pw*(i-1), 0, pw, h
                    );
                }
            }
        }

        // Export the descrambled image as JPEG and send back to React Native
        var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'done',
            dataUrl: dataUrl,
            aspectRatio: h / w
        }));
    };
    img.onerror = function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
    };
    img.src = 'data:${mimeType};base64,${scrambledB64}';
})();
</script>
</body>
</html>` : null;

    const onWebViewMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'done' && data.dataUrl) {
                setImgHeight(screenWidth * data.aspectRatio);
                setDescrambledB64(data.dataUrl);
            } else if (data.type === 'error') {
                setError(true);
            }
        } catch (e) {}
    };

    if (error) {
        return <View style={{ width: screenWidth, height: 200, backgroundColor: '#111' }} />;
    }

    // Step 2: Once descrambled, show a normal <Image> (gestures work normally)
    if (descrambledB64) {
        return (
            <View style={{ width: screenWidth, height: imgHeight }}>
                <Image
                    source={{ uri: descrambledB64 }}
                    style={{ width: screenWidth, height: imgHeight }}
                    resizeMode="contain"
                />
            </View>
        );
    }

    // Step 1: Hidden WebView processing + loading indicator
    return (
        <View style={{ width: screenWidth, height: imgHeight, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#888" />
            {webViewHtml && (
                <WebView
                    source={{ html: webViewHtml }}
                    style={StyleSheet.absoluteFill}
                    onMessage={onWebViewMessage}
                    javaScriptEnabled={true}
                    originWhitelist={['*']}
                    scrollEnabled={false}
                    // Make it invisible — it's just a processing step
                    opacity={0}
                    pointerEvents="none"
                />
            )}
        </View>
    );
};

export default BoyloveImage;
