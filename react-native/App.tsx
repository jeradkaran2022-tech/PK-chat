import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { User, onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import pkChatLogo from './src/assets/pk-chat-logo.jpeg';
import { mobileAuth } from './src/config/firebase';
import { MainTabs } from './src/navigation/MainTabs';
import { VideoCallScreen } from './src/screens/VideoCallScreen';
import { subscribeSubscription, subscribeUserProfile } from './src/services/firebaseService';
import { createRegistrationTrialState } from './src/services/subscriptionService';
import { PKChatPalette } from './src/theme/colors';
import type { MobileSubscriptionState, MobileUserProfile } from './src/types/models';

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [subscription, setSubscription] = useState<MobileSubscriptionState>(() =>
    createRegistrationTrialState()
  );
  const [activeCall, setActiveCall] = useState<{
    peerName: string;
    mode: 'video' | 'voice';
  } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(mobileAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      return;
    }
    const unsubProfile = subscribeUserProfile(authUser.uid, (nextProfile) => {
      setProfile(
        nextProfile || {
          uid: authUser.uid,
          fullName: authUser.displayName || 'PK Chat Member',
          phoneNumber: authUser.phoneNumber || '',
          about: 'Available on PK Chat',
          dateOfBirth: '2000-01-01',
          country: 'Sri Lanka',
          preferredLanguageCode: 'en',
          preferredLanguageName: 'English',
          createdAtMs: Date.now(),
        }
      );
    });
    const unsubSub = subscribeSubscription(
      authUser.uid,
      authUser.phoneNumber || undefined,
      setSubscription
    );
    return () => {
      unsubProfile();
      unsubSub();
    };
  }, [authUser]);

  if (!authReady) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={PKChatPalette.headerPrimary} />
      </SafeAreaView>
    );
  }

  if (!authUser || !profile) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <View style={styles.logoBadge}>
          <Image source={pkChatLogo} style={styles.logoImage} resizeMode="cover" />
        </View>
        <Text style={styles.title}>Welcome to PK Chat</Text>
        <Text style={styles.subtitle}>
          30-day free trial upon registration, then $10.00 USD/year.
        </Text>
        <TouchableOpacity
          onPress={() => void signInAnonymously(mobileAuth)}
          style={styles.continueBtn}
        >
          <Text style={styles.continueBtnText}>Continue to PK Chat</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <MainTabs
        profile={profile}
        subscription={subscription}
        onStartVideoCall={(peerName) => setActiveCall({ peerName, mode: 'video' })}
        onStartVoiceCall={(peerName) => setActiveCall({ peerName, mode: 'voice' })}
        onSignOut={() => void signOut(mobileAuth)}
      />

      <Modal
        visible={Boolean(activeCall)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveCall(null)}
      >
        {activeCall && (
          <VideoCallScreen
            peerName={activeCall.peerName}
            localDisplayName={profile.fullName}
            mode={activeCall.mode}
            onEndCall={() => setActiveCall(null)}
          />
        )}
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PKChatPalette.surface },
  authContainer: {
    flex: 1,
    backgroundColor: PKChatPalette.headerPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 28,
    backgroundColor: '#01123A',
    padding: 3,
    borderWidth: 2,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%', borderRadius: 24 },
  title: { fontSize: 26, fontWeight: '700', color: PKChatPalette.white },
  subtitle: {
    fontSize: 14,
    color: '#D1FAE5',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 10,
  },
  continueBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: PKChatPalette.whatsappGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: PKChatPalette.textPrimary },
});
