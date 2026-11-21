import React, { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import { publishMobileStatus, subscribeStatuses } from '../services/firebaseService';
import type { MobileStatusUpdate } from '../types/models';

interface UpdatesScreenProps {
  uid: string;
  displayName: string;
}

export function UpdatesScreen({ uid, displayName }: UpdatesScreenProps) {
  const [statuses, setStatuses] = useState<MobileStatusUpdate[]>([]);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const unsub = subscribeStatuses(setStatuses);
    return unsub;
  }, []);

  const handlePostStatus = async () => {
    if (!caption.trim() || posting) return;
    setPosting(true);
    try {
      await publishMobileStatus({
        authorUid: uid,
        authorName: displayName,
        caption,
      });
      setCaption('');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Updates</Text>
      </View>

      <View style={styles.myStatusBox}>
        <View style={styles.myAvatar}>
          <Text style={styles.myAvatarText}>
            {displayName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.myMeta}>
          <Text style={styles.myTitle}>My status</Text>
          <Text style={styles.mySub}>Share a 24-hour text update</Text>
        </View>
      </View>

      <View style={styles.composerCard}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a status update..."
          placeholderTextColor={PKChatPalette.textSecondary}
          style={styles.statusInput}
        />
        <TouchableOpacity
          onPress={handlePostStatus}
          disabled={posting || !caption.trim()}
          style={[
            styles.postBtn,
            (!caption.trim() || posting) && styles.postBtnDisabled,
          ]}
        >
          <Ionicons name="send" size={16} color={PKChatPalette.white} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Recent updates</Text>

      <FlatList
        data={statuses}
        keyExtractor={(item: MobileStatusUpdate) => item.statusId}
        renderItem={({ item }: { item: MobileStatusUpdate }) => (
          <View style={styles.updateRow}>
            <View style={styles.ringAvatar}>
              <Text style={styles.ringAvatarText}>
                {item.authorName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.updateBody}>
              <Text style={styles.updateAuthor}>{item.authorName}</Text>
              <Text style={styles.updateCaption} numberOfLines={2}>
                {item.caption}
              </Text>
              <Text style={styles.updateTime}>
                {new Date(item.createdAtMs).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No recent updates from your contacts.</Text>
          </View>
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
  myStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  myAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myAvatarText: { color: PKChatPalette.white, fontSize: 18, fontWeight: '700' },
  myMeta: { flex: 1 },
  myTitle: { fontSize: 16, fontWeight: '600', color: PKChatPalette.textPrimary },
  mySub: { fontSize: 13, color: PKChatPalette.textSecondary },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  statusInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: PKChatPalette.surfaceMuted,
    paddingHorizontal: 14,
    fontSize: 14,
    color: PKChatPalette.textPrimary,
  },
  postBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: { opacity: 0.45 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PKChatPalette.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: PKChatPalette.surfaceMuted,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PKChatPalette.border,
  },
  ringAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: PKChatPalette.whatsappGreen,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAvatarText: { fontSize: 17, fontWeight: '700', color: PKChatPalette.textPrimary },
  updateBody: { flex: 1, gap: 2 },
  updateAuthor: { fontSize: 15, fontWeight: '600', color: PKChatPalette.textPrimary },
  updateCaption: { fontSize: 14, color: PKChatPalette.textSecondary },
  updateTime: { fontSize: 11, color: PKChatPalette.textSecondary },
  emptyBox: { padding: 36, alignItems: 'center' },
  emptyText: { fontSize: 14, color: PKChatPalette.textSecondary },
});
