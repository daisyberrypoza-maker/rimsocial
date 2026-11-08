import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { onToast } from '../lib/toast';
import { colors } from '../theme';

// Shows the latest toast message at the bottom for about 2.5 seconds
export default function Toast() {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    let timer;
    const off = onToast((text) => {
      setMessage(text);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2500);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  if (!message) return null;
  return (
    <Pressable style={styles.toast} onPress={() => setMessage(null)} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 16, right: 16, bottom: 100, alignSelf: 'center', maxWidth: '90%',
    backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16, zIndex: 50,
  },
  text: { color: colors.text, fontSize: 14, textAlign: 'center' },
});
