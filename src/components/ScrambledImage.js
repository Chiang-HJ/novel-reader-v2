import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, ActivityIndicator, Text } from 'react-native';
import { getScramblePieces } from '../utils/comicUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ScrambledImage = ({ uri, novelId, isHorizontal, screenHeight = SCREEN_HEIGHT, screenWidth = SCREEN_WIDTH, algorithmMode = 0 }) => {
    const [dimensions, setDimensions] = useState({ w: screenWidth, h: screenWidth * 1.5 }); // Default fallback
    const [error, setError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

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

    const num = getScramblePieces(photo_id, filename, novelId);

    let displayWidth = screenWidth;
    let displayHeight = h * (screenWidth / w);
    
    if (isHorizontal) {
        if (displayHeight > screenHeight) {
            displayHeight = screenHeight;
            displayWidth = w * (screenHeight / h);
        }
    }

    const move_original = Math.floor(h / num);
    const over = h % num;
    const scale = displayWidth / w;

    // generatePieces returns { y_src, y_dst, move_h, i }
    // y_src: top coordinate in the ORIGINAL scrambled image
    // y_dst: top coordinate in the NEW descrambled image
    // move_h: height of the piece
    const generatePieces = React.useCallback(() => {
        const piecesList = [];
        let type = 'vertical';
        
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
        } else if (algorithmMode === 4 || algorithmMode === 5 || algorithmMode === 6) {
            // Mode 4/5/6: Boylove horizontal descramble
            // Exactly mirrors the site's do_mergeImg(ctx, img, w, h, src, num):
            //   for i = 1..num:
            //     if h >= 4000: copy straight (no scramble)
            //     elif i == num (last): src_x=0, dst_x=floor(w/num)*(num-1), width=remainder
            //     else: src_x = w - floor(w/num)*i, dst_x = floor(w/num)*(i-1), width=floor(w/num)
            type = 'horizontal';
            
            // num of pieces: mode 6 = 10, otherwise use what the site uses (usually 13)
            const currentNum = (algorithmMode === 6) ? 10 : 13;
            const pieceW = Math.floor(w / currentNum);
            
            if (h >= 4000) {
                // Tall images: the site does NOT scramble them, just copies straight
                piecesList.push({ x_src: 0, x_dst: 0, move_w: w, i: 1 });
            } else {
                for (let i = 1; i <= currentNum; i++) {
                    if (i === currentNum) {
                        // Last piece: remainder from left edge of source
                        const lastW = w - pieceW * (currentNum - 1);
                        piecesList.push({
                            x_src: 0,
                            x_dst: pieceW * (currentNum - 1),
                            move_w: lastW,
                            i
                        });
                    } else {
                        piecesList.push({
                            x_src: w - pieceW * i,
                            x_dst: pieceW * (i - 1),
                            move_w: pieceW,
                            i
                        });
                    }
                }
            }
        }
        
        return { type, pieces: piecesList };
    }, [algorithmMode, w, h, num, move_original, over]);

    const pieces = React.useMemo(() => {
        const { type, pieces: piecesList } = generatePieces();
        const scaledW = w * scale;
        const scaledH = h * scale;
        const result = [];

        piecesList.forEach((slice) => {
            if (type === 'vertical') {
                result.push(
                    <View key={slice.i} style={{ 
                        width: scaledW, 
                        height: slice.move_h * scale, 
                        overflow: 'hidden', 
                        position: 'absolute', 
                        top: slice.y_dst * scale, 
                        left: 0 
                    }}>
                        <Image 
                            source={{ uri }} 
                            style={{ 
                                width: scaledW, 
                                height: scaledH, 
                                position: 'absolute', 
                                top: -slice.y_src * scale, 
                                left: 0 
                            }} 
                        />
                    </View>
                );
            } else if (type === 'horizontal') {
                const useTransform = (algorithmMode === 5 || algorithmMode === 6);
                
                result.push(
                    <View key={slice.i} style={{
                        width: slice.move_w * scale,
                        height: scaledH,
                        overflow: 'hidden',
                        position: 'absolute',
                        top: 0,
                        left: slice.x_dst * scale
                    }}>
                        <Image
                            source={{ uri }}
                            style={{
                                width: scaledW,
                                height: scaledH,
                                position: 'absolute',
                                top: 0,
                                left: useTransform ? 0 : -slice.x_src * scale,
                                transform: useTransform ? [{ translateX: -slice.x_src * scale }] : []
                            }}
                        />
                    </View>
                );
            }
        });
        return result;
    }, [generatePieces, w, h, scale, uri]);

    if (error) {
        return (
            <View style={{ width: screenWidth, height: 300, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#ff4444" />
            </View>
        );
    }

    if (!isLoaded && !error) {
        // Render a hidden image to get its size, while showing a loading indicator
        return (
            <View style={{ width: screenWidth, height: 300, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#888" />
                <Image 
                    source={{ uri }} 
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} 
                    onLoad={(e) => {
                        const { width, height } = e.nativeEvent.source;
                        if (width > 0 && height > 0) {
                            setDimensions({ w: width, h: height });
                        }
                        setIsLoaded(true);
                    }}
                    onError={() => setError(true)}
                />
            </View>
        );
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

    return (
        <View style={{ width: displayWidth, height: displayHeight, overflow: 'hidden', backgroundColor: 'black' }}>
            <View style={{ width: displayWidth, height: displayHeight }}>
                {pieces}
            </View>
        </View>
    );
};

export default ScrambledImage;
