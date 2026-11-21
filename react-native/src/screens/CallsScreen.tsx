import React, { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import { subscribeCallsHistory } from '../services/firebaseService';
import { QrCodeModalRN } from '../components/QrCodeModalRN';
import type { MobileCallRecord, MobileUserProfile } from '../types/models';

interface CallsScreenProps {
  uid: string;
  onStartVideoCall: (peerName: string) => void;
  onStartVoiceCall: (peerName: string) => void;
}

export function CallsScreen({
  uid,
  onStartVideoCall,
  onStartVoiceCall,
}: CallsScreenProps) {
  const [calls, setCalls] = useState<MobileCallRecord[]>([]);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);

  const scannerProfile: MobileUserProfile = {
    uid,
    fullName: 'PK Chat Member',
    phoneNumber: '',
    about: 'Available on PK Chat',
    dateOfBirth: '2000-01-01',
    country: 'Sri Lanka',
    preferredLanguageCode: 'en',
    preferredLanguageName: 'English',
    createdAtMs: Date.now(),
  };

  useEffect(() => {
    const unsub = subscribeCallsHistory(uid, setCalls);
    return unsub;
  }, [uid]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
      </View>

      <View style={styles.quickActionRow}>
        <TouchableOpacity
          onPress={() => setQrScannerOpen(true)}
          style={styles.quickCard}
        >
          <Ionicons name="qr-code-outline" size={20} color={PKChatPalette.headerPrimary} />
          <Text style={styles.quickText}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onStartVoiceCall('PK Chat Contact')}
          style={styles.quickCard}
        >
          <Ionicons name="call" size={20} color={PKChatPalette.headerPrimary} />
          <Text style={styles.quickText}>Voice Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onStartVideoCall('PK Chat Contact')}
          style={styles.quickCard}
        >
          <Ionicons name="videocam" size={20} color={PKChatPalette.headerPrimary} />
          <Text style={styles.quickText}>Video Call</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Recent</Text>

      <FlatList
        data={calls}
        keyExtractor={(item: MobileCallRecord) => item.callId}
        renderItem={({ item }: { item: MobileCallRecord }) => (
          <View style={styles.callRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.peerName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.callInfo}>
              <Text
                style={[
                  styles.peerName,
                  item.direction === 'missed' && styles.missedText,
                ]}
              >
                {item.peerName}
              </Text>
              <View style={styles.callMeta}>
                <Ionicons
                  name={item.direction === 'incoming' ? 'arrow-down' : 'arrow-up'}
                  size={13}
                  color={
                    item.direction === 'missed'
                      ? PKChatPalette.danger
                      : PKChatPalette.whatsappGreen
                  }
                />
                <Text style={styles.timeText}>
                  {new Date(item.timestampMs).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() =>
                item.mediaType === 'video'
                  ? onStartVideoCall(item.peerName)
                  : onStartVoiceCall(item.peerName)
              }
              style={styles.callBackBtn}
            >
              <Ionicons
                name={item.mediaType === 'video' ? 'videocam' : 'call'}
                size={21}
                color={PKChatPalette.headerPrimary}
              />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No recent calls recorded yet.</Text>
          </View>
        }
      />

      <QrCodeModalRN
        visible={qrScannerOpen}
        initialTab="scan_code"
        profile={scannerProfile}
        onClose={() => setQrScannerOpen(false)}
        onVerifiedStartCall={(peerName, mode) =>
          mode === 'video' ? onStartVideoCall(peerName) : onStartVoiceCall(peerName)
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PKChatPalette.surface },
  header: {
    backgroundColor: PKChatPalette.headerPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 21, fontWeight: '700', color: PKChatPalette.white },
  quickActionRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
  },
  quickCard: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: PKChatPalette.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickText: { fontSize: 14, fontWeight: '600', color: PKChatPalette.textPrimary },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: PKChatPalette.textSecondary,
    backgroundColor: PKChatPalette.surfaceMuted,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PKChatPalette.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: PKChatPalette.white, fontSize: 16, fontWeight: '700' },
  callInfo: { flex: 1, gap: 2 },
  peerName: { fontSize: 16, fontWeight: '600', color: PKChatPalette.textPrimary },
  missedText: { color: PKChatPalette.danger },
  callMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, color: PKChatPalette.textSecondary },
  callBackBtn: { padding: 8 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: PKChatPalette.textSecondary },
});
