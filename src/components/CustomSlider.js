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
    const [isSliding, setIsSliding] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    
    const startValueRef = useRef(value);

    useEffect(() => {
        if (!isSliding) {
            setLocalValue(value);
        }
    }, [value, isSliding]);

    // Update localValue safely
    const updateValue = (newValue) => {
        if (newValue < minimumValue) newValue = minimumValue;
        if (newValue > maximumValue) newValue = maximumValue;
        if (step > 0) {
            newValue = Math.round((newValue - minimumValue) / step) * step + minimumValue;
        }
        setLocalValue(newValue);
        if (onValueChange) onValueChange(newValue);
        return newValue;
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                setIsSliding(true);
                if (containerWidth > 0) {
                    const x = evt.nativeEvent.locationX;
                    const newValue = minimumValue + (x / containerWidth) * (maximumValue - minimumValue);
                    const finalValue = updateValue(newValue);
                    startValueRef.current = finalValue;
                } else {
                    startValueRef.current = localValue;
                }
            },
            onPanResponderMove: (evt, gestureState) => {
                if (containerWidth > 0) {
                    const dx = gestureState.dx;
                    const valDelta = (dx / containerWidth) * (maximumValue - minimumValue);
                    updateValue(startValueRef.current + valDelta);
                }
            },
            onPanResponderRelease: () => {
                setIsSliding(false);
                if (onSlidingComplete) {
                    onSlidingComplete(localValue);
                }
            },
            onPanResponderTerminate: () => {
                setIsSliding(false);
            }
        })
    ).current;

    const percent = containerWidth && maximumValue > minimumValue 
        ? ((localValue - minimumValue) / (maximumValue - minimumValue)) * 100 
        : 0;
    const clampedPercent = Math.max(0, Math.min(100, percent));

    return (
        <View 
            style={[style, { justifyContent: 'center' }]} 
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
            collapsable={false}
        >
            {/* Track */}
            <View style={{ 
                height: 4, 
                backgroundColor: maximumTrackTintColor, 
                borderRadius: 2,
                width: '100%',
                position: 'absolute'
            }} />
            <View style={{ 
                height: 4, 
                backgroundColor: minimumTrackTintColor, 
                borderRadius: 2,
                width: `${clampedPercent}%`,
                position: 'absolute'
            }} />
            {/* Thumb */}
            <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: thumbTintColor,
                position: 'absolute',
                left: `${clampedPercent}%`,
                marginLeft: -8,
                elevation: 3,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 2,
            }} />
            {/* Touch overlay */}
            <View 
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'transparent' }}
                {...panResponder.panHandlers}
            />
        </View>
    );
};

export default CustomSlider;
