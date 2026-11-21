import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { PKChatPalette } from '../theme/colors';
import { computeSilentNaturalLighting } from '../services/beautifyEngine';

interface VideoCallScreenProps {
  peerName: string;
  localDisplayName: string;
  mode: 'video' | 'voice';
  onEndCall: () => void;
}

export function VideoCallScreen({
  peerName,
  localDisplayName,
  mode,
  onEndCall,
}: VideoCallScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isMuted, setIsMuted] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (mode === 'video' && permission && !permission.granted) {
      void requestPermission();
    }
  }, [mode, permission, requestPermission]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Silent background natural lighting profile (zero UI sliders, zero percentages, zero labels)
  const silentLightStyle = useMemo(
    () => computeSilentNaturalLighting(localDisplayName, 0.48),
    [localDisplayName]
  );

  const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const secs = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <SafeAreaView style={styles.root}>
      {/* Clean Remote Stage */}
      <View style={styles.remoteStage}>
        {mode === 'video' && permission?.granted ? (
          <View style={styles.cameraFill}>
            <CameraView style={StyleSheet.absoluteFill} facing={facing} />
            {/* Silent natural lighting & glow tint applied invisibly in background */}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: silentLightStyle.warmOverlayColor,
                  opacity: silentLightStyle.warmOverlayOpacity,
                },
              ]}
            />
          </View>
        ) : (
          <View style={styles.voiceCenter}>
            <View style={styles.peerAvatar}>
              <Text style={styles.peerInitial}>
                {peerName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          </View>
        )}

        {/* Minimal Top Call Header (Name & Timer Only) */}
        <View style={styles.topOverlay}>
          <Text style={styles.peerTitle}>{peerName}</Text>
          <Text style={styles.callTimer}>
            {mins}:{secs}
          </Text>
        </View>
      </View>

      {/* WhatsApp-style Compact Bottom Control Bar (Mute, Flip Camera, Record, End Call) */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => setIsMuted((v) => !v)}
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          accessibilityLabel="Mute"
        >
          <Ionicons
            name={isMuted ? 'mic-off' : 'mic'}
            size={20}
            color={PKChatPalette.white}
          />
          <Text style={styles.controlLabel}>Mute</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFacing((prev) => (prev === 'front' ? 'back' : 'front'))}
          style={styles.controlBtn}
          accessibilityLabel="Flip Camera"
        >
          <Ionicons
            name="camera-reverse"
            size={20}
            color={PKChatPalette.white}
          />
          <Text style={styles.controlLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsRecording((v) => !v)}
          style={[styles.controlBtn, isRecording && styles.controlBtnActive]}
          accessibilityLabel="Record"
        >
          <Ionicons
            name={isRecording ? 'stop-circle' : 'radio-button-on'}
            size={20}
            color={isRecording ? '#FCA5A5' : PKChatPalette.white}
          />
          <Text style={styles.controlLabel}>Record</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onEndCall}
          style={[styles.controlBtn, styles.endCallBtn]}
          accessibilityLabel="End Call"
        >
          <Ionicons
            name="call"
            size={20}
            color={PKChatPalette.white}
            style={{ transform: [{ rotate: '135deg' }] }}
          />
          <Text style={styles.controlLabel}>End</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PKChatPalette.callDarkBg },
  remoteStage: { flex: 1, position: 'relative' },
  cameraFill: { flex: 1 },
  voiceCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: PKChatPalette.headerSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerInitial: { fontSize: 38, fontWeight: '700', color: PKChatPalette.white },
  topOverlay: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  peerTitle: { fontSize: 22, fontWeight: '700', color: PKChatPalette.white },
  callTimer: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(17, 27, 33, 0.92)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PKChatPalette.callButtonSurface,
    gap: 2,
  },
  controlBtnActive: {
    backgroundColor: PKChatPalette.callButtonActive,
  },
  endCallBtn: {
    backgroundColor: PKChatPalette.danger,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: PKChatPalette.white,
  },
});
