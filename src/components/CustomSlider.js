import React, { useState, useRef, useEffect } from 'react';
import { View, PanResponder } from 'react-native';

const CustomSlider = ({
    minimumValue = 0,
    maximumValue = 1,
    step = 0,
    value = 0,
    onValueChange,
    onSlidingComplete,
    minimumTrackTintColor = '#007AFF',
    maximumTrackTintColor = '#b3b3b3',
    thumbTintColor = '#007AFF',
    style
}) => {
    const [containerWidth, setContainerWidth] = useState(0);
    const containerWidthRef = useRef(0);
    const [isSliding, setIsSliding] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    
    // Store all dynamic props in a ref to avoid stale closures in PanResponder
    const propsRef = useRef({ minimumValue, maximumValue, step, onValueChange, onSlidingComplete });
    
    useEffect(() => {
        propsRef.current = { minimumValue, maximumValue, step, onValueChange, onSlidingComplete };
    }, [minimumValue, maximumValue, step, onValueChange, onSlidingComplete]);
    
    const startValueRef = useRef(value);

    useEffect(() => {
        if (!isSliding) {
            setLocalValue(value);
        }
    }, [value, isSliding]);

    // Update localValue safely
    const updateValue = (newValue) => {
        const p = propsRef.current;
        if (isNaN(newValue) || !isFinite(newValue)) newValue = p.minimumValue;
        if (newValue < p.minimumValue) newValue = p.minimumValue;
        if (newValue > p.maximumValue) newValue = p.maximumValue;
        if (p.step > 0) {
            newValue = Math.round((newValue - p.minimumValue) / p.step) * p.step + p.minimumValue;
        }
        setLocalValue(newValue);
        if (p.onValueChange) p.onValueChange(newValue);
        return newValue;
    };

    const panResponder = useRef(
        PanResponder.create({
            // Force capture phase so ScrollView doesn't steal touches
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                setIsSliding(true);
                const currentWidth = containerWidthRef.current;
                const p = propsRef.current;
                if (currentWidth > 0) {
                    const x = evt.nativeEvent.locationX;
                    const newValue = p.minimumValue + (x / currentWidth) * (p.maximumValue - p.minimumValue);
                    const finalValue = updateValue(newValue);
                    startValueRef.current = finalValue;
                } else {
                    startValueRef.current = localValue;
                }
            },
            onPanResponderMove: (evt, gestureState) => {
                const currentWidth = containerWidthRef.current;
                const p = propsRef.current;
                if (currentWidth > 0) {
                    const dx = gestureState.dx;
                    const valDelta = (dx / currentWidth) * (p.maximumValue - p.minimumValue);
                    updateValue(startValueRef.current + valDelta);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                setIsSliding(false);
                const p = propsRef.current;
                
                const currentWidth = containerWidthRef.current;
                let finalValue = startValueRef.current;
                if (currentWidth > 0) {
                    const dx = gestureState.dx;
                    const valDelta = (dx / currentWidth) * (p.maximumValue - p.minimumValue);
                    finalValue = updateValue(startValueRef.current + valDelta);
                }
                if (p.onSlidingComplete) p.onSlidingComplete(finalValue);
            },
            onPanResponderTerminate: () => {
                setIsSliding(false);
            }
        })
    ).current;

    let percent = containerWidth && maximumValue > minimumValue 
        ? ((localValue - minimumValue) / (maximumValue - minimumValue)) * 100 
        : 0;
    if (isNaN(percent) || !isFinite(percent)) percent = 0;
    const clampedPercent = Math.max(0, Math.min(100, percent));

    return (
        <View 
            style={[{ height: 40, minHeight: 40, justifyContent: 'center' }, style]} 
            onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setContainerWidth(w);
                containerWidthRef.current = w;
            }}
            collapsable={false}
        >
            {/* Background Track */}
            <View style={{ 
                height: 4, 
                backgroundColor: maximumTrackTintColor, 
                borderRadius: 2,
                width: '100%',
                position: 'absolute',
                top: 18,
                left: 0
            }} />
            {/* Foreground Track */}
            <View style={{ 
                height: 4, 
                backgroundColor: minimumTrackTintColor, 
                borderRadius: 2,
                width: `${clampedPercent}%`,
                position: 'absolute',
                top: 18,
                left: 0
            }} />
            {/* Thumb */}
            <View style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: thumbTintColor,
                position: 'absolute',
                left: `${clampedPercent}%`,
                marginLeft: -10,
                top: 10,
                elevation: 3,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 2,
            }} />
            {/* Touch overlay */}
            <View 
                style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, backgroundColor: 'transparent' }}
                {...panResponder.panHandlers}
            />
        </View>
    );
};

export default CustomSlider;
