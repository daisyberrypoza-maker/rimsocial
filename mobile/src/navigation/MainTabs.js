import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BottomBar from '../components/BottomBar';
import Stories from '../screens/Stories';
import Chat from '../screens/Chat';
import Rimlight from '../screens/Rimlight';
import Profile from '../screens/Profile';

const Tab = createBottomTabNavigator();

// Tab bar: Add opens the full-screen Upload modal instead of a tab
export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Stories"
      tabBar={({ state, navigation }) => (
        <BottomBar
          activeTab={state.routes[state.index].name}
          onPress={(name) => navigation.navigate(name === 'Add' ? 'Upload' : name === 'Explore' ? 'Explore' : name)}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Stories" component={Stories} />
      <Tab.Screen name="Chat" component={Chat} />
      <Tab.Screen name="Rimlight" component={Rimlight} />
      <Tab.Screen name="ProfileTab" component={Profile} initialParams={{ username: 'me' }} />
    </Tab.Navigator>
  );
}
