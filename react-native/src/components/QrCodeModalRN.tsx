import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import pkChatLogo from '../assets/pk-chat-logo.jpeg';
import { PKChatPalette } from '../theme/colors';
import {
  issueMobileQrToken,
  revokeMobileQrToken,
  verifyMobileQrCode,
  type MobileQrMatrix,
  type MobileQrProfilePayload,
  type MobileQrTokenResponse,
} from '../services/qrService';
import type { MobileUserProfile } from '../types/models';

export type QrModalInitialTabRN = 'my_code' | 'scan_code';

interface QrCodeModalRNProps {
  visible: boolean;
  initialTab?: QrModalInitialTabRN;
  profile: MobileUserProfile;
  onClose: () => void;
  onVerifiedStartCall?: (peerName: string, mode: 'voice' | 'video') => void;
  onVerifiedConnect?: (peer: MobileQrProfilePayload) => void;
}

/**
 * Center PK Chat Unity Badge (Globe, Dove, and Unity Human Figures).
 */
function PkUnityCenterLogoRN() {
  return (
    <View style={styles.centerBadgeRing}>
      <Image source={pkChatLogo} style={styles.centerLogoImage} resizeMode="cover" />
    </View>
  );
}

function QrMatrixGridRN({ matrix }: { matrix: MobileQrMatrix }) {
  const cellSize = Math.floor(216 / matrix.size);
  const boardSize = cellSize * matrix.size;
  const rows: number[][] = [];
  for (let r = 0; r < matrix.size; r += 1) {
    rows.push(matrix.data.slice(r * matrix.size, (r + 1) * matrix.size));
  }

  return (
    <View style={styles.qrFrame}>
      <View style={{ width: boardSize, height: boardSize }}>
        {rows.map((row, rIdx) => (
          <View key={rIdx} style={{ flexDirection: 'row' }}>
            {row.map((val, cIdx) => (
              <View
                key={cIdx}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: val ? '#0F172A' : '#FFFFFF',
                }}
              />
            ))}
          </View>
        ))}
        <View style={styles.centerOverlay} pointerEvents="none">
          <PkUnityCenterLogoRN />
        </View>
      </View>
    </View>
  );
}

export function QrCodeModalRN({
  visible,
  initialTab = 'my_code',
  profile,
  onClose,
  onVerifiedStartCall,
  onVerifiedConnect,
}: QrCodeModalRNProps) {
  const [activeTab, setActiveTab] = useState<QrModalInitialTabRN>(initialTab);
  const [permission, requestPermission] = useCameraPermissions();
  const [tokenData, setTokenData] = useState<MobileQrTokenResponse | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [verifiedPeer, setVerifiedPeer] = useState<MobileQrProfilePayload | null>(null);

  useEffect(() => {
    if (!visible) {
      setVerifiedPeer(null);
      setScanError(null);
      return;
    }
    setActiveTab(initialTab);
    setLoadingToken(true);
    issueMobileQrToken(profile)
      .then((res) => setTokenData(res))
      .catch((err) => setScanError(err instanceof Error ? err.message : 'Server unreachable'))
      .finally(() => setLoadingToken(false));
  }, [visible, initialTab, profile]);

  const handleBarcodeScanned = async (event: { data: string }) => {
    if (verifying || verifiedPeer || !event.data) return;
    setVerifying(true);
    setScanError(null);
    try {
      const res = await verifyMobileQrCode(event.data, profile.uid);
      setVerifiedPeer(res.profile);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to verify scanned QR code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResetQr = async () => {
    setLoadingToken(true);
    setScanError(null);
    try {
      const next = await revokeMobileQrToken(profile);
      setTokenData(next);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to reset QR code.');
    } finally {
      setLoadingToken(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} accessibilityLabel="Close QR">
            <Ionicons name="arrow-back" size={22} color={PKChatPalette.white} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>QR code</Text>
          {activeTab === 'my_code' && (
            <TouchableOpacity onPress={handleResetQr} style={styles.resetBtn}>
              <Ionicons name="refresh" size={20} color={PKChatPalette.white} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => {
              setActiveTab('my_code');
              setVerifiedPeer(null);
            }}
            style={[styles.tabBtn, activeTab === 'my_code' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, activeTab === 'my_code' && styles.tabTextActive]}>
              MY CODE
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('scan_code')}
            style={[styles.tabBtn, activeTab === 'scan_code' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, activeTab === 'scan_code' && styles.tabTextActive]}>
              SCAN CODE
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'my_code' ? (
          <View style={styles.myCodeBody}>
            <View style={styles.profileCard}>
              <Text style={styles.profileName}>{profile.fullName}</Text>
              <Text style={styles.profileSub}>PK Chat contact</Text>
              {loadingToken || !tokenData?.qrMatrix ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={PKChatPalette.headerPrimary} />
                </View>
              ) : (
                <QrMatrixGridRN matrix={tokenData.qrMatrix} />
              )}
              <Text style={styles.helperText}>
                Your QR code is private. Scan with PK Chat to connect or start a call immediately.
              </Text>
            </View>
          </View>
        ) : verifiedPeer ? (
          <View style={styles.verifiedBody}>
            <View style={styles.verifiedCard}>
              <Ionicons name="shield-checkmark" size={34} color={PKChatPalette.whatsappGreen} />
              <Text style={styles.verifiedName}>{verifiedPeer.fullName}</Text>
              <Text style={styles.verifiedMeta}>
                {verifiedPeer.country} · {verifiedPeer.preferredLanguageName}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => {
                    onVerifiedConnect?.(verifiedPeer);
                    onClose();
                  }}
                  style={styles.primaryAction}
                >
                  <Ionicons name="chatbubble" size={18} color={PKChatPalette.white} />
                  <Text style={styles.actionText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    onVerifiedStartCall?.(verifiedPeer.fullName, 'voice');
                    onClose();
                  }}
                  style={styles.secondaryAction}
                >
                  <Ionicons name="call" size={18} color={PKChatPalette.white} />
                  <Text style={styles.actionText}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : !permission?.granted ? (
          <View style={styles.permissionBox}>
            <Ionicons name="qr-code-outline" size={44} color={PKChatPalette.headerPrimary} />
            <Text style={styles.permissionTitle}>Camera access needed to scan QR codes</Text>
            <TouchableOpacity onPress={requestPermission} style={styles.primaryAction}>
              <Text style={styles.actionText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.scannerContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.reticleOverlay}>
              <View style={styles.reticleBox} />
              <Text style={styles.scanHint}>Point camera at a PK Chat QR code</Text>
              {scanError && <Text style={styles.scanErrorText}>{scanError}</Text>}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PKChatPalette.surfaceMuted },
  topBar: {
    backgroundColor: PKChatPalette.headerPrimary,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  topTitle: { flex: 1, fontSize: 19, fontWeight: '700', color: PKChatPalette.white },
  resetBtn: { padding: 4 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: PKChatPalette.headerPrimary,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PKChatPalette.white },
  tabText: { fontSize: 13, fontWeight: '700', color: '#A7F3D0' },
  tabTextActive: { color: PKChatPalette.white },
  myCodeBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  profileCard: {
    width: '100%',
    backgroundColor: PKChatPalette.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  profileName: { fontSize: 19, fontWeight: '700', color: PKChatPalette.textPrimary },
  profileSub: { fontSize: 13, color: PKChatPalette.textSecondary },
  loadingBox: { width: 228, height: 228, alignItems: 'center', justifyContent: 'center' },
  qrFrame: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: PKChatPalette.white,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBadgeRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PKChatPalette.white,
    borderWidth: 2,
    borderColor: '#0284C7',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  centerLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  helperText: {
    fontSize: 12,
    color: PKChatPalette.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  reticleOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  reticleBox: {
    width: 230,
    height: 230,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#34D399',
  },
  scanHint: {
    color: PKChatPalette.white,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scanErrorText: {
    color: '#FCA5A5',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  permissionTitle: { fontSize: 15, fontWeight: '600', color: PKChatPalette.textPrimary, textAlign: 'center' },
  verifiedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  verifiedCard: {
    width: '100%',
    backgroundColor: PKChatPalette.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  verifiedName: { fontSize: 20, fontWeight: '700', color: PKChatPalette.textPrimary },
  verifiedMeta: { fontSize: 13, color: PKChatPalette.textSecondary },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PKChatPalette.headerPrimary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PKChatPalette.brandAccent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  actionText: { color: PKChatPalette.white, fontWeight: '700', fontSize: 14 },
});
