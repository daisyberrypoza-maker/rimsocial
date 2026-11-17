import React from 'react';
import { StatusBar } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

// Same rule as the website: black by default; white only on Stories, Rimlight,
// and the video and image viewers. Renders only while its screen is focused,
// so a pushed screen's bar is never overridden by the one underneath.
export default function PageStatusBar({ light = false }) {
  const focused = useIsFocused();
  if (!focused) return null;
  return light
    ? <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
    : <StatusBar barStyle="light-content" backgroundColor="#000000" />;
}
