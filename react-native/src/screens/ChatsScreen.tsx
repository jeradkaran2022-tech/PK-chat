import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import {
  sendChatTextMessage,
  subscribeChatMessages,
  subscribeDirectChats,
} from '../services/firebaseService';
import { QrCodeModalRN } from '../components/QrCodeModalRN';
import type { MobileChatMessage, MobileChatThread, MobileUserProfile } from '../types/models';

interface ChatsScreenProps {
  uid: string;
  displayName: string;
  onStartVideoCall: (peerName: string) => void;
  onStartVoiceCall: (peerName: string) => void;
}

export function ChatsScreen({
  uid,
  displayName,
  onStartVideoCall,
  onStartVoiceCall,
}: ChatsScreenProps) {
  const [threads, setThreads] = useState<MobileChatThread[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeThread, setActiveThread] = useState<MobileChatThread | null>(null);
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [qrScannerOpen, setQrScannerOpen] = useState(false);

  const scannerProfile: MobileUserProfile = {
    uid,
    fullName: displayName || 'PK Chat Member',
    phoneNumber: '',
    about: 'Available on PK Chat',
    dateOfBirth: '2000-01-01',
    country: 'Sri Lanka',
    preferredLanguageCode: 'en',
    preferredLanguageName: 'English',
    createdAtMs: Date.now(),
  };

  useEffect(() => {
    const unsub = subscribeDirectChats(uid, setThreads);
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }
    const unsub = subscribeChatMessages(activeThread.chatId, setMessages);
    return unsub;
  }, [activeThread?.chatId]);

  const filteredThreads = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.lastMessageText.toLowerCase().includes(q)
    );
  }, [threads, searchText]);

  const handleSend = async () => {
    if (!activeThread || !composerText.trim()) return;
    const draft = composerText;
    setComposerText('');
    await sendChatTextMessage({
      chatId: activeThread.chatId,
      senderUid: uid,
      senderName: displayName,
      text: draft,
    });
  };

  if (activeThread) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => setActiveThread(null)}
            style={styles.iconBtn}
            accessibilityLabel="Back to chats"
          >
            <Ionicons name="arrow-back" size={22} color={PKChatPalette.white} />
          </TouchableOpacity>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {activeThread.title.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.chatHeaderMeta}>
            <Text style={styles.chatHeaderTitle} numberOfLines={1}>
              {activeThread.title}
            </Text>
            <Text style={styles.chatHeaderSub} numberOfLines={1}>
              online
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onStartVideoCall(activeThread.title)}
            style={styles.iconBtn}
            accessibilityLabel="Video call"
          >
            <Ionicons name="videocam" size={22} color={PKChatPalette.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onStartVoiceCall(activeThread.title)}
            style={styles.iconBtn}
            accessibilityLabel="Voice call"
          >
            <Ionicons name="call" size={20} color={PKChatPalette.white} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.conversationBody}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            data={messages}
            keyExtractor={(item: MobileChatMessage) => item.messageId}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }: { item: MobileChatMessage }) => {
              const isMine = item.senderUid === uid;
              return (
                <View
                  style={[
                    styles.bubble,
                    isMine ? styles.outgoingBubble : styles.incomingBubble,
                  ]}
                >
                  <Text style={styles.bubbleText}>{item.text}</Text>
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.bubbleTime}>
                      {new Date(item.createdAtMs).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {isMine && (
                      <Ionicons
                        name="checkmark-done"
                        size={14}
                        color={PKChatPalette.brandAccent}
                      />
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyConversation}>
                <Text style={styles.emptyNotice}>
                  Messages are end-to-end encrypted on PK Chat.
                </Text>
              </View>
            }
          />

          <View style={styles.composerRow}>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder="Message"
              placeholderTextColor={PKChatPalette.textSecondary}
              style={styles.composerInput}
            />
            <TouchableOpacity
              onPress={handleSend}
              style={styles.sendCircle}
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={18} color={PKChatPalette.white} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.brandTitle}>PK Chat</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            onPress={() => setQrScannerOpen(true)}
            style={styles.iconBtn}
            accessibilityLabel="Scan QR code"
          >
            <Ionicons name="qr-code-outline" size={21} color={PKChatPalette.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onStartVideoCall('PK Chat Contact')}
            style={styles.iconBtn}
            accessibilityLabel="Camera"
          >
            <Ionicons name="camera-outline" size={22} color={PKChatPalette.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={PKChatPalette.textSecondary} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search chats..."
          placeholderTextColor={PKChatPalette.textSecondary}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={filteredThreads}
        keyExtractor={(item: MobileChatThread) => item.chatId}
        renderItem={({ item }: { item: MobileChatThread }) => (
          <TouchableOpacity
            onPress={() => setActiveThread(item)}
            style={styles.threadRow}
          >
            <View style={styles.threadAvatar}>
              <Text style={styles.threadAvatarText}>
                {item.title.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.threadContent}>
              <View style={styles.threadHeader}>
                <Text style={styles.threadTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.threadTime}>
                  {new Date(item.lastMessageAtMs).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={styles.threadSubRow}>
                <Text style={styles.threadPreview} numberOfLines={1}>
                  {item.lastMessageText}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Your verified PK Chat conversations appear here.
            </Text>
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
  topBar: {
    backgroundColor: PKChatPalette.headerPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    flex: 1,
    fontSize: 21,
    fontWeight: '700',
    color: PKChatPalette.white,
  },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  searchWrap: {
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 21,
    backgroundColor: PKChatPalette.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: PKChatPalette.textPrimary,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PKChatPalette.border,
  },
  threadAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadAvatarText: { color: PKChatPalette.white, fontSize: 18, fontWeight: '700' },
  threadContent: { flex: 1, gap: 4 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  threadTitle: { fontSize: 16, fontWeight: '600', color: PKChatPalette.textPrimary, flex: 1 },
  threadTime: { fontSize: 12, color: PKChatPalette.textSecondary },
  threadSubRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  threadPreview: { flex: 1, fontSize: 14, color: PKChatPalette.textSecondary },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: PKChatPalette.whatsappGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: PKChatPalette.white },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: PKChatPalette.white, fontWeight: '700', fontSize: 15 },
  chatHeaderMeta: { flex: 1 },
  chatHeaderTitle: { fontSize: 16, fontWeight: '700', color: PKChatPalette.white },
  chatHeaderSub: { fontSize: 12, color: '#D1FAE5' },
  conversationBody: { flex: 1, backgroundColor: PKChatPalette.chatBackground },
  messagesList: { padding: 12, gap: 8 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  outgoingBubble: {
    alignSelf: 'flex-end',
    backgroundColor: PKChatPalette.outgoingBubble,
  },
  incomingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: PKChatPalette.incomingBubble,
  },
  bubbleText: { fontSize: 15, color: PKChatPalette.textPrimary, lineHeight: 20 },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  bubbleTime: { fontSize: 11, color: PKChatPalette.textSecondary },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
    backgroundColor: PKChatPalette.chatBackground,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: PKChatPalette.surface,
    paddingHorizontal: 16,
    fontSize: 15,
    color: PKChatPalette.textPrimary,
  },
  sendCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyConversation: { paddingVertical: 40, alignItems: 'center' },
  emptyNotice: {
    fontSize: 12,
    color: PKChatPalette.textSecondary,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emptyList: { padding: 48, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: PKChatPalette.textPrimary },
  emptySubtitle: { fontSize: 13, color: PKChatPalette.textSecondary, textAlign: 'center' },
});
