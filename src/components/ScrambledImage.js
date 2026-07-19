import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, ActivityIndicator, Text } from 'react-native';
import { getScramblePieces } from '../utils/comicUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ScrambledImage = ({ uri, novelId, isHorizontal, screenHeight = SCREEN_HEIGHT, screenWidth = SCREEN_WIDTH, algorithmMode = 0 }) => {
    const [dimensions, setDimensions] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        Image.getSize(uri, (w, h) => {
            if (isMounted) setDimensions({ w, h });
        }, (err) => {

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
        const localFileName = parts[parts.length - 1];
        const nameParts = localFileName.split('_');
        if (nameParts.length >= 2) {
            photo_id = parseInt(nameParts[0], 10);
            filename = nameParts.slice(1).join('_');
        } else {
            filename = localFileName;
        }
    } catch(e) {}

    const num = getScramblePieces(photo_id, filename);

    let displayWidth = screenWidth;
    let displayHeight = h * (screenWidth / w);
    
    if (isHorizontal) {
        if (displayHeight > screenHeight) {
            displayHeight = screenHeight;
            displayWidth = w * (screenHeight / h);
        }
    }

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

    const pieces = [];
    const move_original = Math.floor(h / num);
    const over = h % num;
    const scale = displayWidth / w;

    // generatePieces returns { y_src, y_dst, move_h, i }
    // y_src: top coordinate in the ORIGINAL scrambled image
    // y_dst: top coordinate in the NEW descrambled image
    // move_h: height of the piece
    const generatePieces = () => {
        const piecesList = [];
        
        if (algorithmMode === 0) {
            // Mode 0: jmcomic-nodejs
            let currentY = 0;
            for (let i = 0; i < num; i++) {
                const isLastSlice = (i === num - 1);
                const sliceHeight = move_original + (isLastSlice ? over : 0);
                const y_src = currentY;
                const y_dst = h - currentY - sliceHeight;
                piecesList.push({ y_src, y_dst, move_h: sliceHeight, i });
                currentY += sliceHeight;
            }
        } else if (algorithmMode === 1) {
            // Mode 1: jmcomic-python
            for (let i = 0; i < num; i++) {
                let move_h = move_original;
                let y_src = h - (move_original * (i + 1)) - over;
                let y_dst = move_original * i;
                if (i === num - 1) {
                    move_h += over;
                } else {
                    y_src += over;
                }
                piecesList.push({ y_src, y_dst, move_h, i });
            }
        } else if (algorithmMode === 2) {
            // Mode 2: Elegant Reverse (Remainder at Bottom)
            for (let i = 0; i < num; i++) {
                const y_dst = i * move_original;
                const y_src = (num - 1 - i) * move_original;
                piecesList.push({ y_src, y_dst, move_h: move_original, i });
            }
            if (over > 0) {
                piecesList.push({ y_src: num * move_original, y_dst: num * move_original, move_h: over, i: 'rem' });
            }
        } else if (algorithmMode === 3) {
            // Mode 3: Elegant Reverse (Remainder at Top)
            if (over > 0) {
                piecesList.push({ y_src: 0, y_dst: 0, move_h: over, i: 'rem' });
            }
            for (let i = 0; i < num; i++) {
                const y_dst = over + (i * move_original);
                const y_src = over + ((num - 1 - i) * move_original);
                piecesList.push({ y_src, y_dst, move_h: move_original, i });
            }
        }
        
        return piecesList;
    };

    const slices = generatePieces();
    
    slices.forEach((slice) => {
        pieces.push(
            <View key={slice.i} style={{ width: w, height: slice.move_h, overflow: 'hidden', position: 'absolute', top: slice.y_dst, left: 0 }}>
                <Image 
                    source={{ uri }} 
                    style={{ 
                        width: w, 
                        height: h, 
                        position: 'absolute', 
                        top: -slice.y_src, 
                        left: 0 
                    }}
                    resizeMode="stretch"
                />
            </View>
        );
    });

    const translateX = -w * (1 - scale) / 2;
    const translateY = -h * (1 - scale) / 2;

    return (
        <View style={{ width: displayWidth, height: displayHeight, overflow: 'hidden', backgroundColor: 'black' }}>
            <View style={{ width: w, height: h, transform: [{ translateX }, { translateY }, { scale }] }}>
                {pieces}
            </View>
            <View style={{ position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 5, zIndex: 999 }}>
                <Text style={{ color: 'red', fontSize: 16, fontWeight: 'bold' }}>
                    Mode: {algorithmMode}
                </Text>
                <Text style={{ color: 'red', fontSize: 16, fontWeight: 'bold' }}>
                    ID: {photo_id} | Num: {num}
                </Text>
                <Text style={{ color: 'red', fontSize: 16, fontWeight: 'bold' }}>
                    File: {filename}
                </Text>
            </View>
        </View>
    );
};

export default ScrambledImage;
