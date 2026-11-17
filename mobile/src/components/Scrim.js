import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

// Dark top and bottom, faded middle: the same stops as the website's Discover tiles.
export default function Scrim() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="rsScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity="0.5" />
          <Stop offset="0.18" stopColor="#000" stopOpacity="0.12" />
          <Stop offset="0.4" stopColor="#000" stopOpacity="0" />
          <Stop offset="0.62" stopColor="#000" stopOpacity="0" />
          <Stop offset="0.82" stopColor="#000" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.78" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#rsScrim)" />
    </Svg>
  );
}
