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
import ExploreWatch from '../screens/ExploreWatch';
import Discover from '../screens/Discover';
import Recommended from '../screens/Recommended';
import Algorithm from '../screens/Algorithm';
import CreatorStudio from '../screens/CreatorStudio';
import AdsSponsors from '../screens/AdsSponsors';
import LiveBroadcasts from '../screens/LiveBroadcasts';
import LiveMatchRoom from '../screens/LiveMatchRoom';

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
      {/* Profile screens have no bottom bar: they open from the Stories header */}
      <Stack.Screen name="Profile" component={Profile} />
      <Stack.Screen name="ProfileList" component={ProfileList} />
      <Stack.Screen name="EditProfile" component={EditProfile} />
      <Stack.Screen name="Conversation" component={Conversation} />
      <Stack.Screen name="NewMessage" component={NewMessage} />
      <Stack.Screen name="Explore" component={withTabBar(Explore, 'Explore')} />
      <Stack.Screen name="Activity" component={withTabBar(Activity, 'Stories')} />
      {/* Full-screen pages: no bottom bar, like the web */}
      <Stack.Screen name="PostDetail" component={PostDetail} />
      <Stack.Screen name="ExploreWatch" component={ExploreWatch} />
      <Stack.Screen name="SearchTag" component={Discover} />
      <Stack.Screen name="Recommended" component={Recommended} />
      <Stack.Screen name="Algorithm" component={Algorithm} />
      <Stack.Screen name="CreatorStudio" component={CreatorStudio} />
      <Stack.Screen name="Ads" component={AdsSponsors} />
      <Stack.Screen name="Live" component={LiveBroadcasts} />
      <Stack.Screen name="LiveMatchRoom" component={LiveMatchRoom} />
    </Stack.Navigator>
  );
}
