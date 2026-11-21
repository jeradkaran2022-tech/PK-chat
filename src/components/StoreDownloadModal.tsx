import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Landmark,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { appUpdater, AppUpdateState, PK_CHAT_PLAY_STORE_URL } from '../lib/appUpdater';
import { BRAND_LOGO_URL } from '../data/constants';

export function StoreDownloadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { canInstallNatively, isInstalled, isIos, promptInstall } = usePWAInstall();
  const [tab, setTab] = useState<'install' | 'playstore' | 'payouts'>('install');
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<AppUpdateState>(() => appUpdater.getState());

  useEffect(() => {
    return appUpdater.subscribe(setUpdateState);
  }, []);

  if (!open) return null;

  const handleNativeInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setInstallFeedback('PK CHAT has been installed on your home screen!');
    } else if (outcome === 'dismissed') {
      setInstallFeedback('Install prompt dismissed. You can install anytime from the browser menu.');
    } else {
      setInstallFeedback(
        isIos
          ? 'On iPhone/iPad Safari: tap Share (square with up arrow) -> "Add to Home Screen".'
          : 'Open browser menu (⋮) and tap "Install app" or "Add to Home screen" to install PK CHAT.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-sky-950/45 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-2xl w-full max-h-[88vh] flex flex-col rounded-3xl bg-[#e6f4ff]/88 dark:bg-slate-900/92 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/85 shadow-[0_0_16px_rgba(56,189,248,0.5)] shrink-0">
              <img
                src={BRAND_LOGO_URL}
                alt="PK Chat App Icon"
                className="w-full h-full rounded-[14px] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h2 className="text-base font-bold">PK Chat App Install &amp; Google Play Store</h2>
              <p className="text-[11px] text-sky-100">
                Official Icon &amp; Display Name: &quot;PK Chat&quot; · Android, Mobile Web &amp; Desktop
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Close Store & Install Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
          {[
            { id: 'install' as const, label: 'Install Now (PWA)' },
            { id: 'playstore' as const, label: 'Google Play Store' },
            { id: 'payouts' as const, label: 'Bank Account & Payouts' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                tab === item.id
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 dark:text-slate-300">
          {tab === 'install' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 space-y-2">
                <p className="text-sm font-bold text-[#0369a1] dark:text-sky-200 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  <span>Direct Standalone App Installation (Active Now)</span>
                </p>
                <p>
                  PK Chat installs directly to your home screen with the official globe icon and <strong>PK Chat</strong> label underneath on Android, iPhone, iPad, Windows, and Mac.
                </p>
                {isInstalled ? (
                  <p className="font-semibold text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-4 h-4" />
                    PK Chat is already running as an installed app.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    className="mt-2 px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {canInstallNatively ? 'Install PK Chat App Now' : 'Show Install Instructions'}
                    </span>
                  </button>
                )}
              </div>

              {isIos && (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-1.5">
                  <p className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <Share className="w-4 h-4" />
                    <span>iPhone &amp; iPad Safari Installation</span>
                  </p>
                  <p>1. Open PK Chat in <strong>Safari</strong>.</p>
                  <p>2. Tap the <strong>Share</strong> icon at the bottom (or top on iPad) of Safari.</p>
                  <p>3. Scroll down and tap <strong>Add to Home Screen</strong> → confirm name <strong>PK Chat</strong> → <strong>Add</strong>.</p>
                </div>
              )}

              {installFeedback && (
                <p className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-medium">
                  {installFeedback}
                </p>
              )}

              <div className="p-4 rounded-2xl bg-[#d6eeff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 text-[#0284c7] ${updateState.checking ? 'animate-spin' : ''}`} />
                      <span>App Update Check · தானியங்கி அப்டேட் சரிபார்ப்பு</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Current Version: v{updateState.currentVersion} · Latest: v{updateState.latestVersion}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void appUpdater.checkForAppUpdates()}
                    disabled={updateState.checking}
                    className="px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-[11px] font-semibold shrink-0"
                  >
                    {updateState.checking ? 'Checking...' : 'Check for Updates'}
                  </button>
                </div>
                {updateState.statusMessage && (
                  <p className="text-[11px] text-[#0284c7] dark:text-[#38bdf8] font-medium">
                    {updateState.statusMessage}
                  </p>
                )}
                {updateState.error && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">{updateState.error}</p>
                )}
                {updateState.updateAvailable && (
                  <button
                    type="button"
                    onClick={() => void appUpdater.startUpdateFlow('immediate')}
                    disabled={updateState.updating}
                    className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold"
                  >
                    {updateState.updating ? 'Applying Update...' : 'Start Immediate Update'}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'playstore' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Publishing PK Chat to Google Play Store (Listing Name: PK Chat)
              </h3>
              <p>
                All Android adaptive icons (<code>ic_launcher_foreground.png</code>, <code>ic_launcher_background.xml</code>, <code>mipmap-anydpi-v26</code>), legacy round/square <code>mipmap-*</code> icons, <code>app_name = PK Chat</code>, and the 512×512 Play Store icon (<code>/public/store-icons/play-store-512.png</code>) are pre-generated in <code>/android/res/</code>.
              </p>
              <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-[#bae6fd] dark:border-sky-900 space-y-2">
                <p className="font-bold text-[#0369a1] dark:text-sky-200">
                  Google Play In-App Update Engine (Immediate &amp; Flexible Ready)
                </p>
                <p>
                  <code>checkForAppUpdates()</code> and <code>startUpdateFlow()</code> automatically connect to Android Play Core / Capacitor AppUpdate when packaged, or Service Worker + <code>/api/app/version</code> on Web/TWA.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void appUpdater.checkForAppUpdates()}
                    disabled={updateState.checking}
                    className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
                  >
                    {updateState.checking ? 'Checking Play Update...' : 'Run Play / App Update Check'}
                  </button>
                  <a
                    href={PK_CHAT_PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-[#dff1ff]/85 dark:bg-slate-800 border border-[#7dd3fc]/70 dark:border-slate-700 text-[#0369a1] dark:text-slate-100 text-xs font-semibold"
                  >
                    Open Google Play Listing (com.pkchat.app)
                  </a>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 font-mono text-[11px] space-y-1 border border-slate-200 dark:border-slate-800">
                <p>npm run build</p>
                <p>npx cap init &quot;PK Chat&quot; &quot;com.pkchat.app&quot; --web-dir=dist &amp;&amp; npx cap add android</p>
                <p>cp -r android/res/* android/app/src/main/res/</p>
                <p>npx cap sync android &amp;&amp; cd android &amp;&amp; ./gradlew bundleRelease</p>
              </div>
              <p>
                Upload <code>android/app/build/outputs/bundle/release/app-release.aab</code> in Google Play Console with store listing name <strong>PK Chat</strong>.
              </p>
            </div>
          )}

          {tab === 'payouts' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-900 dark:text-rose-200">
                    Never Enter Bank Account, Card, or CVV Numbers Inside Chat
                  </p>
                  <p className="mt-0.5">
                    PK CHAT strictly blocks raw card/CVV payloads and automatically triggers Security Lockdown if card tampering is detected.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-[#0284c7]" />
                  <span>Where Owners Receive Subscription &amp; Ad Payouts Safely:</span>
                </p>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Google Play Console Payouts (Google Play Store Billing ONLY)
                  </p>
                  <p>
                    Google Play Console → Setup → Payments profile → Add merchant bank account &amp; tax verification for $10/yr subscriptions (after 90-day / 3-month free trial), $5/$10 ads, and $100/yr Unlimited Ads &amp; Videos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
