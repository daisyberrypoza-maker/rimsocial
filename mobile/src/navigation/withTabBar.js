import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import BottomBar from '../components/BottomBar';

// Puts the bottom bar under a pushed screen. Tapping a tab returns to that tab.
// activeTab: which tab the screen belongs to ('ProfileTab' for profile screens).
export default function withTabBar(Screen, activeTab) {
  return function WithTabBar(props) {
    const navigation = useNavigation();
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}><Screen {...props} /></View>
        <BottomBar
          activeTab={activeTab}
          onPress={(name) => {
            if (name === 'Add') navigation.navigate('Camera');
            else if (name === 'Explore') navigation.navigate('Explore');
            else navigation.navigate('Main', { screen: name });
          }}
        />
      </View>
    );
  };
}
