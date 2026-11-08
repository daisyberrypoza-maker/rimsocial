import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import Login from '../screens/Login';
import Upload from '../screens/Upload';
import StoryViewer from '../screens/StoryViewer';
import Profile from '../screens/Profile';
import ProfileList from '../screens/ProfileList';
import EditProfile from '../screens/EditProfile';
import Conversation from '../screens/Conversation';
import NewMessage from '../screens/NewMessage';
import Explore from '../screens/Explore';
import Activity from '../screens/Activity';
import PostDetail from '../screens/PostDetail';
import withTabBar from './withTabBar';

const Stack = createNativeStackNavigator();

// Signed out: only Login. Signed in: the tabs, with full screens pushed on top.
// Profile lists are pushed screens, so Back returns to the profile they came from.
export default function RootNavigator({ signedIn }) {
  if (!signedIn) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={Login} />
      </Stack.Navigator>
    );
  }
  return (
    <Stack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Upload" component={Upload} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="StoryViewer" component={StoryViewer} options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      {/* Profile screens keep the bottom bar, like the web app */}
      <Stack.Screen name="Profile" component={withTabBar(Profile, 'ProfileTab')} />
      <Stack.Screen name="ProfileList" component={withTabBar(ProfileList, 'ProfileTab')} />
      <Stack.Screen name="EditProfile" component={EditProfile} />
      <Stack.Screen name="Conversation" component={Conversation} />
      <Stack.Screen name="NewMessage" component={NewMessage} />
      <Stack.Screen name="Explore" component={withTabBar(Explore, 'Stories')} />
      <Stack.Screen name="Activity" component={withTabBar(Activity, 'Stories')} />
      <Stack.Screen name="PostDetail" component={withTabBar(PostDetail, 'Rimlight')} />
    </Stack.Navigator>
  );
}
