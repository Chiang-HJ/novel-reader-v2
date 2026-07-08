import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, ActivityIndicator } from 'react-native';
import { getScramblePieces } from '../utils/comicUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ScrambledImage = ({ uri, novelId, isHorizontal, screenHeight = SCREEN_HEIGHT, screenWidth = SCREEN_WIDTH }) => {
    const [dimensions, setDimensions] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        Image.getSize(uri, (w, h) => {
            if (isMounted) setDimensions({ w, h });
        }, (err) => {
            console.error('Image getSize error:', err);
            if (isMounted) setError(true);
        });
        return () => { isMounted = false; };
    }, [uri]);

    if (error) {
        return (
            <View style={{ width: screenWidth, height: 300, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#ff4444" />
            </View>
        );
    }

    if (!dimensions) {
        return (
            <View style={{ width: screenWidth, height: 300, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#888" />
            </View>
        );
    }

    const { w, h } = dimensions;
    
    // Parse aid, scramble_id, and filename
    let aid = '0';
    try {
        aid = novelId.replace('comic_18comic_', '');
    } catch(e) {}
    
    let filename = '00001.jpg';
    let photo_id = parseInt(aid, 10);
    try {
        const parts = uri.split('/');
        const localFileName = parts[parts.length - 1]; // e.g. 220980_00001.jpg
        const nameParts = localFileName.split('_');
        if (nameParts.length >= 2) {
            photo_id = parseInt(nameParts[0], 10);
            filename = nameParts.slice(1).join('_');
        } else {
            filename = localFileName;
        }
    } catch(e) {}

    const num = getScramblePieces(photo_id, filename);

    // Scaling to screen width (or height if horizontal)
    let displayWidth = screenWidth;
    let displayHeight = h * (screenWidth / w);
    
    if (isHorizontal) {
        if (displayHeight > screenHeight) {
            displayHeight = screenHeight;
            displayWidth = w * (screenHeight / h);
        }
    }

    // If num is 0, the image is NOT scrambled, just render it normally!
    if (num === 0) {
        return (
            <View style={{ width: displayWidth, height: displayHeight }}>
                <Image 
                    source={{ uri }} 
                    style={{ width: displayWidth, height: displayHeight }} 
                    resizeMode="cover"
                />
            </View>
        );
    }

    // Calculate pieces using exact integer coordinates from the original image size
    const pieces = [];
    const move = Math.floor(h / num);
    const over = h % num;

    let currentDstY = 0;

    for (let i = 0; i < num; i++) {
        const y_src = h - (move * (i + 1)) - over;
        
        pieces.push(
            <View key={i} style={{ width: w, height: move, overflow: 'hidden', position: 'absolute', top: currentDstY, left: 0 }}>
                <Image 
                    source={{ uri }} 
                    style={{ 
                        width: w, 
                        height: h, 
                        position: 'absolute', 
                        top: -y_src, 
                        left: 0 
                    }} 
                />
            </View>
        );
        currentDstY += move;
    }

    if (over > 0) {
        const y_src = h - over;
        pieces.push(
            <View key="over" style={{ width: w, height: over, overflow: 'hidden', position: 'absolute', top: currentDstY, left: 0 }}>
                <Image 
                    source={{ uri }} 
                    style={{ 
                        width: w, 
                        height: h, 
                        position: 'absolute', 
                        top: -y_src, 
                        left: 0 
                    }} 
                />
            </View>
        );
    }

    const scale = displayWidth / w;

    return (
        <View style={{ width: displayWidth, height: displayHeight, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            <View style={{ width: w, height: h, transform: [{ scale: scale }] }}>
                {pieces}
            </View>
        </View>
    );
};

export default ScrambledImage;
