import { registerSW } from 'virtual:pwa-register';
import {
  PK_CHAT_ANDROID_PACKAGE,
  PK_CHAT_CLIENT_VERSION,
  PK_CHAT_PLAY_STORE_URL,
} from './appVersion';

export { PK_CHAT_ANDROID_PACKAGE, PK_CHAT_CLIENT_VERSION, PK_CHAT_PLAY_STORE_URL };

export interface NativePlayAppUpdateBridge {
  checkForUpdate?: () => Promise<{ updateAvailable?: boolean; availableVersionCode?: number }>;
  startUpdateFlow?: (options?: { mode?: 'immediate' | 'flexible' }) => Promise<void>;
  getAppUpdateInfo?: () => Promise<{ updateAvailability?: number; availableVersionCode?: number }>;
  performImmediateUpdate?: () => Promise<void>;
  startFlexibleUpdate?: () => Promise<void>;
}

export interface AppUpdateCheckResult {
  updateAvailable: boolean;
  source: 'play_store_native' | 'pwa_service_worker' | 'cloud_version' | 'up_to_date';
  currentVersion: string;
  latestVersion: string;
  playStoreUrl: string;
  releaseNotes?: string;
  checkedAt: string;
  canApplyInPlace: boolean;
}

type UpdateListener = (state: AppUpdateState) => void;

export interface AppUpdateState {
  checking: boolean;
  updating: boolean;
  updateAvailable: boolean;
  source: AppUpdateCheckResult['source'];
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  lastCheckedAt: string | null;
  statusMessage: string | null;
  error: string | null;
}

function getNativePlayUpdateBridge(): NativePlayAppUpdateBridge | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpbAppUpdate?: NativePlayAppUpdateBridge;
    AndroidAppUpdate?: NativePlayAppUpdateBridge;
    Capacitor?: { Plugins?: { AppUpdate?: NativePlayAppUpdateBridge } };
  };
  return win.SpbAppUpdate || win.Capacitor?.Plugins?.AppUpdate || win.AndroidAppUpdate || null;
}

function compareSemverOrDate(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

class AppUpdateManager {
  private state: AppUpdateState = {
    checking: false,
    updating: false,
    updateAvailable: false,
    source: 'up_to_date',
    currentVersion: PK_CHAT_CLIENT_VERSION,
    latestVersion: PK_CHAT_CLIENT_VERSION,
    releaseNotes: 'Latest global translation, Security Shield & SOS release active.',
    lastCheckedAt: null,
    statusMessage: null,
    error: null,
  };

  private listeners = new Set<UpdateListener>();
  private swRegistered = false;
  private swUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private swWaitingAvailable = false;

  getState(): AppUpdateState {
    return this.state;
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => {
      try {
        fn(this.state);
      } catch {
        // Ignore subscriber cleanup errors
      }
    });
  }

  ensureServiceWorkerRegistered(): void {
    if (this.swRegistered || typeof window === 'undefined') return;
    this.swRegistered = true;
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh: () => {
          this.swWaitingAvailable = true;
          this.setState({
            updateAvailable: true,
            source: 'pwa_service_worker',
            statusMessage: 'New PK Chat update downloaded and ready to apply.',
          });
        },
        onOfflineReady: () => {
          // Offline cache ready silently
        },
        onRegisterError: (error) => {
          console.warn('PK CHAT SW registration warning:', error);
        },
      });
      this.swUpdateFn = updateSW;
    } catch {
      // Ignore in restricted preview iframes
    }
  }

  /**
   * Checks Google Play Store In-App Update bridge (if running inside Android APK/TWA),
   * PWA Service Worker update status, and live cloud release version endpoint.
   */
  async checkForAppUpdates(): Promise<AppUpdateCheckResult> {
    this.ensureServiceWorkerRegistered();
    this.setState({ checking: true, error: null });
    const checkedAt = new Date().toISOString();

    try {
      // 1. Native Android Play Store In-App Update bridge check (if wrapped in APK / Capacitor / Play Core)
      const nativeBridge = getNativePlayUpdateBridge();
      if (nativeBridge) {
        if (nativeBridge.checkForUpdate) {
          const nativeInfo = await nativeBridge.checkForUpdate();
          if (nativeInfo?.updateAvailable) {
            const res: AppUpdateCheckResult = {
              updateAvailable: true,
              source: 'play_store_native',
              currentVersion: PK_CHAT_CLIENT_VERSION,
              latestVersion: nativeInfo.availableVersionCode
                ? `Play build ${nativeInfo.availableVersionCode}`
                : 'New Play Store Release',
              playStoreUrl: PK_CHAT_PLAY_STORE_URL,
              releaseNotes: 'Google Play Store In-App Update ready for installation.',
              checkedAt,
              canApplyInPlace: true,
            };
            this.setState({
              checking: false,
              updateAvailable: true,
              source: 'play_store_native',
              latestVersion: res.latestVersion,
              releaseNotes: res.releaseNotes || '',
              lastCheckedAt: checkedAt,
              statusMessage: 'New version available on Google Play Store.',
            });
            return res;
          }
        } else if (nativeBridge.getAppUpdateInfo) {
          const info = await nativeBridge.getAppUpdateInfo();
          // Android Play Core AppUpdateManager UPDATE_AVAILABLE === 2
          if (info?.updateAvailability === 2) {
            const res: AppUpdateCheckResult = {
              updateAvailable: true,
              source: 'play_store_native',
              currentVersion: PK_CHAT_CLIENT_VERSION,
              latestVersion: info.availableVersionCode
                ? `Play build ${info.availableVersionCode}`
                : 'New Play Store Release',
              playStoreUrl: PK_CHAT_PLAY_STORE_URL,
              releaseNotes: 'Google Play Store update ready.',
              checkedAt,
              canApplyInPlace: true,
            };
            this.setState({
              checking: false,
              updateAvailable: true,
              source: 'play_store_native',
              latestVersion: res.latestVersion,
              releaseNotes: res.releaseNotes || '',
              lastCheckedAt: checkedAt,
              statusMessage: 'New version available on Google Play Store.',
            });
            return res;
          }
        }
      }

      // 2. Live Service Worker check
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting || this.swWaitingAvailable) {
              this.swWaitingAvailable = true;
              const res: AppUpdateCheckResult = {
                updateAvailable: true,
                source: 'pwa_service_worker',
                currentVersion: PK_CHAT_CLIENT_VERSION,
                latestVersion: `${PK_CHAT_CLIENT_VERSION}+new`,
                playStoreUrl: PK_CHAT_PLAY_STORE_URL,
                releaseNotes: 'Fresh PK Chat bundle cached in background and ready to apply.',
                checkedAt,
                canApplyInPlace: true,
              };
              this.setState({
                checking: false,
                updateAvailable: true,
                source: 'pwa_service_worker',
                latestVersion: res.latestVersion,
                releaseNotes: res.releaseNotes || '',
                lastCheckedAt: checkedAt,
                statusMessage: 'App update ready — tap Update Now to apply.',
              });
              return res;
            }
          }
        } catch {
          // Non-fatal in iframe dev mode
        }
      }

      // 3. Authoritative server version check (/api/app/version)
      let latestVersion = PK_CHAT_CLIENT_VERSION;
      let releaseNotes = 'PK Chat is running the latest verified build.';
      let serverSaysUpdate = false;

      if (typeof fetch !== 'undefined') {
        const resp = await fetch(
          `/api/app/version?clientVersion=${encodeURIComponent(PK_CHAT_CLIENT_VERSION)}`,
          { cache: 'no-store' }
        );
        if (resp.ok) {
          const data = (await resp.json()) as {
            latestVersion?: string;
            updateAvailable?: boolean;
            releaseNotes?: string;
          };
          if (data.latestVersion) {
            latestVersion = data.latestVersion;
            serverSaysUpdate =
              Boolean(data.updateAvailable) ||
              compareSemverOrDate(latestVersion, PK_CHAT_CLIENT_VERSION) > 0;
          }
          if (data.releaseNotes) {
            releaseNotes = data.releaseNotes;
          }
        }
      }

      const result: AppUpdateCheckResult = {
        updateAvailable: serverSaysUpdate,
        source: serverSaysUpdate ? 'cloud_version' : 'up_to_date',
        currentVersion: PK_CHAT_CLIENT_VERSION,
        latestVersion,
        playStoreUrl: PK_CHAT_PLAY_STORE_URL,
        releaseNotes,
        checkedAt,
        canApplyInPlace: true,
      };

      this.setState({
        checking: false,
        updateAvailable: serverSaysUpdate,
        source: result.source,
        latestVersion,
        releaseNotes,
        lastCheckedAt: checkedAt,
        statusMessage: serverSaysUpdate
          ? `New version ${latestVersion} is available. Tap Update Now to refresh.`
          : `You are up to date (v${PK_CHAT_CLIENT_VERSION}).`,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Auto-update check failed.';
      this.setState({
        checking: false,
        lastCheckedAt: checkedAt,
        error: message,
      });
      return {
        updateAvailable: false,
        source: 'up_to_date',
        currentVersion: PK_CHAT_CLIENT_VERSION,
        latestVersion: PK_CHAT_CLIENT_VERSION,
        playStoreUrl: PK_CHAT_PLAY_STORE_URL,
        checkedAt,
        canApplyInPlace: false,
      };
    }
  }

  /**
   * Executes Immediate or Flexible update flow:
   * - Play Store native bridge when running inside an Android APK/TWA
   * - Service Worker activation + clean reload for PWA / Web
   */
  async startUpdateFlow(mode: 'immediate' | 'flexible' = 'immediate'): Promise<void> {
    this.setState({ updating: true, error: null });
    try {
      const nativeBridge = getNativePlayUpdateBridge();
      if (nativeBridge) {
        if (nativeBridge.startUpdateFlow) {
          await nativeBridge.startUpdateFlow({ mode });
          this.setState({ updating: false, statusMessage: 'Play Store update flow started.' });
          return;
        }
        if (mode === 'immediate' && nativeBridge.performImmediateUpdate) {
          await nativeBridge.performImmediateUpdate();
          this.setState({ updating: false, statusMessage: 'Immediate Play Store update started.' });
          return;
        }
        if (nativeBridge.startFlexibleUpdate) {
          await nativeBridge.startFlexibleUpdate();
          this.setState({ updating: false, statusMessage: 'Flexible Play Store update started.' });
          return;
        }
      }

      if (this.swUpdateFn && this.swWaitingAvailable) {
        await this.swUpdateFn(true);
        this.setState({
          updating: false,
          updateAvailable: false,
          statusMessage: 'Applying update...',
        });
        return;
      }

      if (typeof window !== 'undefined' && window.location?.reload) {
        window.location.reload();
      }
    } catch (err) {
      this.setState({
        updating: false,
        error: err instanceof Error ? err.message : 'Failed to start update flow.',
      });
    }
  }

  dismissBanner(): void {
    this.setState({ updateAvailable: false });
  }
}

export const appUpdater = new AppUpdateManager();
