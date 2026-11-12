import React, { useRef } from 'react';
import { View, PanResponder } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BottomBar from '../components/BottomBar';
import Stories from '../screens/Stories';
import Chat from '../screens/Chat';
import Rimlight from '../screens/Rimlight';
import SearchHome from '../screens/SearchHome';

const Tab = createBottomTabNavigator();

// Tab bar: Add opens the full-screen Upload modal instead of a tab
export default function MainTabs() {
  const navigation = useNavigation();
  const activeTab = useRef('Stories');
  const tabOrder = ['Search', 'Chat', 'Stories', 'Rimlight'];
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 55 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 80) return;
      const index = tabOrder.indexOf(activeTab.current);
      const next = tabOrder[Math.max(0, Math.min(tabOrder.length - 1, index + (gesture.dx < 0 ? 1 : -1)))];
      if (next && next !== activeTab.current) navigation.navigate('Main', { screen: next });
    },
  })).current;
  return (
    <View style={{ flex: 1 }} {...swipe.panHandlers}>
    <Tab.Navigator
      initialRouteName="Stories"
      tabBar={({ state, navigation: tabNavigation }) => (
        <BottomBar
          activeTab={(activeTab.current = state.routes[state.index].name)}
          onPress={(name) => tabNavigation.navigate(name === 'Add' ? 'Camera' : name === 'Explore' ? 'Explore' : name)}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Search" component={SearchHome} />
      <Tab.Screen name="Chat" component={Chat} />
      <Tab.Screen name="Stories" component={Stories} />
      <Tab.Screen name="Rimlight" component={Rimlight} />
    </Tab.Navigator>
    </View>
  );
}
