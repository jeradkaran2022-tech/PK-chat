import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import { ChatsScreen } from '../screens/ChatsScreen';
import { UpdatesScreen } from '../screens/UpdatesScreen';
import { CallsScreen } from '../screens/CallsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { MobileSubscriptionState, MobileUserProfile } from '../types/models';

export type MainTabParamList = {
  Chats: undefined;
  Updates: undefined;
  Calls: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

interface MainTabsProps {
  profile: MobileUserProfile;
  subscription: MobileSubscriptionState;
  onStartVideoCall: (peerName: string) => void;
  onStartVoiceCall: (peerName: string) => void;
  onSignOut: () => void;
}

export function MainTabs({
  profile,
  subscription,
  onStartVideoCall,
  onStartVoiceCall,
  onSignOut,
}: MainTabsProps) {
  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: keyof MainTabParamList } }) => ({
        headerShown: false,
        tabBarActiveTintColor: PKChatPalette.headerPrimary,
        tabBarInactiveTintColor: PKChatPalette.textSecondary,
        tabBarStyle: {
          backgroundColor: PKChatPalette.surface,
          borderTopColor: PKChatPalette.border,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'chatbubble-ellipses-outline';
          if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Updates') {
            iconName = focused ? 'disc' : 'disc-outline';
          } else if (route.name === 'Calls') {
            iconName = focused ? 'call' : 'call-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Chats">
        {() => (
          <ChatsScreen
            uid={profile.uid}
            displayName={profile.fullName}
            onStartVideoCall={onStartVideoCall}
            onStartVoiceCall={onStartVoiceCall}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Updates">
        {() => <UpdatesScreen uid={profile.uid} displayName={profile.fullName} />}
      </Tab.Screen>
      <Tab.Screen name="Calls">
        {() => (
          <CallsScreen
            uid={profile.uid}
            onStartVideoCall={onStartVideoCall}
            onStartVoiceCall={onStartVoiceCall}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Profile">
        {() => (
          <ProfileScreen
            profile={profile}
            subscription={subscription}
            onSignOut={onSignOut}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
