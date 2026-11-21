import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import {
  activateAnnualSubscription,
  updateProfileBasics,
  updateProfileDob,
} from '../services/firebaseService';
import { evaluateSubscription } from '../services/subscriptionService';
import { QrCodeModalRN } from '../components/QrCodeModalRN';
import type { MobileSubscriptionState, MobileUserProfile } from '../types/models';

interface ProfileScreenProps {
  profile: MobileUserProfile;
  subscription: MobileSubscriptionState;
  onSignOut: () => void;
}

export function ProfileScreen({
  profile,
  subscription,
  onSignOut,
}: ProfileScreenProps) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [about, setAbout] = useState(profile.about);
  const [dobInput, setDobInput] = useState(profile.dateOfBirth || '2000-01-01');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const subSummary = useMemo(
    () => evaluateSubscription(profile.phoneNumber, subscription),
    [profile.phoneNumber, subscription]
  );

  const handleSaveProfile = async () => {
    if (busy) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const normalizedDob = /^\d{4}-\d{2}-\d{2}$/.test(dobInput.trim())
        ? dobInput.trim()
        : profile.dateOfBirth;
      await updateProfileBasics(profile.uid, {
        fullName: fullName.trim() || profile.fullName,
        about: about.trim() || 'Available on PK Chat',
        dateOfBirth: normalizedDob,
      });
      await updateProfileDob(profile.uid, normalizedDob);
      setSaveMessage('Profile & Date of Birth saved');
    } finally {
      setBusy(false);
    }
  };

  const handleActivateAnnual = async () => {
    setBusy(true);
    try {
      await activateAnnualSubscription(profile.uid);
      setSaveMessage('Annual $10.00 USD subscription activated');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(fullName || 'P').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileHeaderInfo}>
            <Text style={styles.profileName}>{fullName}</Text>
            <Text style={styles.profilePhone}>
              {profile.phoneNumber || 'Phone linked'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setQrVisible(true)}
            style={styles.qrIconBtn}
            accessibilityLabel="My PK Chat QR Code"
          >
            <Ionicons name="qr-code-outline" size={24} color={PKChatPalette.headerPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account Settings</Text>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              style={styles.fieldInput}
              placeholder="Your name"
              placeholderTextColor={PKChatPalette.textSecondary}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>About</Text>
            <TextInput
              value={about}
              onChangeText={setAbout}
              style={styles.fieldInput}
              placeholder="Available on PK Chat"
              placeholderTextColor={PKChatPalette.textSecondary}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Date of Birth (DOB)</Text>
            <TextInput
              value={dobInput}
              onChangeText={setDobInput}
              style={styles.fieldInput}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              placeholderTextColor={PKChatPalette.textSecondary}
            />
          </View>

          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={busy}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>

          {saveMessage && <Text style={styles.savedNotice}>{saveMessage}</Text>}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.subHeaderRow}>
            <Ionicons name="card-outline" size={20} color={PKChatPalette.headerPrimary} />
            <Text style={styles.sectionTitle}>PK Chat Subscription</Text>
          </View>
          <Text style={styles.subBadge}>{subSummary.badgeText}</Text>
          <Text style={styles.subDescription}>{subSummary.descriptionText}</Text>

          {!subSummary.isVipFounder && (
            <TouchableOpacity
              onPress={handleActivateAnnual}
              disabled={busy}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>
                Subscribe · $10.00 USD / year
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={18} color={PKChatPalette.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <QrCodeModalRN
        visible={qrVisible}
        initialTab="my_code"
        profile={profile}
        onClose={() => setQrVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PKChatPalette.surfaceMuted },
  header: {
    backgroundColor: PKChatPalette.headerPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 21, fontWeight: '700', color: PKChatPalette.white },
  scrollBody: { padding: 16, gap: 14 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PKChatPalette.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: PKChatPalette.white },
  profileHeaderInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 18, fontWeight: '700', color: PKChatPalette.textPrimary },
  profilePhone: { fontSize: 13, color: PKChatPalette.textSecondary },
  qrIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PKChatPalette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    backgroundColor: PKChatPalette.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: PKChatPalette.textPrimary },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PKChatPalette.border,
    paddingBottom: 10,
  },
  fieldLabel: {
    width: 128,
    fontSize: 13,
    fontWeight: '600',
    color: PKChatPalette.textSecondary,
  },
  fieldInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: PKChatPalette.surfaceMuted,
    paddingHorizontal: 12,
    fontSize: 14,
    color: PKChatPalette.textPrimary,
    textAlign: 'left',
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: PKChatPalette.headerPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: PKChatPalette.white, fontSize: 14, fontWeight: '700' },
  savedNotice: { fontSize: 12, fontWeight: '600', color: PKChatPalette.headerSecondary },
  subHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subBadge: { fontSize: 15, fontWeight: '700', color: PKChatPalette.headerPrimary },
  subDescription: { fontSize: 13, color: PKChatPalette.textSecondary, lineHeight: 19 },
  secondaryBtn: {
    height: 42,
    borderRadius: 12,
    backgroundColor: PKChatPalette.brandAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: PKChatPalette.white, fontSize: 14, fontWeight: '700' },
  signOutBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: PKChatPalette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: PKChatPalette.danger },
});
