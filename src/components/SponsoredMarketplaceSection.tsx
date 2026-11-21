import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Globe,
  Languages,
  MapPin,
  PackageCheck,
  PhoneCall,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Upload,
  UserX,
  Video,
  X,
} from 'lucide-react';
import {
  AD_REPORT_REASON_LABELS,
  BUSINESS_CATEGORIES,
  SPONSORED_TARGET_COUNTRIES,
  SPONSORED_TARGET_LANGUAGES,
  addBlockedBusinessUid,
  compressAdImageFile,
  formatTargetCountriesLabel,
  getAdsBySameSeller,
  getBlockedBusinessUids,
  normalizeTargetCountries,
  preScreenAdContentSafety,
} from '../lib/businessAdsEngine';
import { sanitizePublicText } from '../lib/pkCoreController';
import {
  activateAdvertiserUnlimitedPass,
  confirmAdProductReceived,
  createAdFulfillmentRequest,
  evaluateAdSafetyAndTier,
  fetchAdPlatformConfig,
  fetchAdvertiserUnlimitedPassStatus,
  fetchBusinessProfileCard,
  fetchMyAdRequests,
  fetchMyAdViolationWarnings,
  fetchPublicSponsoredAds,
  publishSponsoredAd,
  reportSponsoredAd,
  saveBusinessProfileCard,
  verifyAdvertiserLiveSelfie,
} from '../lib/api';
import {
  GOOGLE_PLAY_BILLING_CONFIG,
  USER_MODE_CHANGED_EVENT,
  UNLIMITED_ADS_ANNUAL_PRICE_USD,
  getActiveUserMode,
  hasFreeVipStatusAndAdAccess,
  setActiveUserMode,
} from '../lib/subscriptionBilling';
import {
  analyzeImageDataUrlForExplicitContent,
  detectExplicitSexualContent,
} from '../lib/securityShield';
import type {
  AdFulfillmentRequest,
  AdFulfillmentType,
  AdReportCategory,
  AdSafetyEvaluationResult,
  AdViolationWarningNotice,
  AdvertiserUnlimitedPassStatus,
  BusinessAdCardProfile,
  PkChatUserMode,
  RemoteAdPricingConfig,
  SponsoredPublicAd,
} from '../types/pkchat';

interface SponsoredMarketplaceSectionProps {
  uid: string;
  userName: string;
  userCountry: string;
  userCountryCode: string;
  userLanguage: string;
  userPhone?: string;
  userEmail?: string;
  onLaunchLiveClass?: () => void;
}

export function SponsoredMarketplaceSection({
  uid,
  userName,
  userCountry,
  userCountryCode,
  userLanguage,
  userPhone,
  userEmail,
  onLaunchLiveClass,
}: SponsoredMarketplaceSectionProps) {
  const [userMode, setUserMode] = useState<PkChatUserMode>(() => getActiveUserMode(uid));
  const [pricingConfig, setPricingConfig] = useState<RemoteAdPricingConfig | null>(null);

  // Public Marketplace State (Filtered by Country & Language + Paginated)
  const [filterCountry, setFilterCountry] = useState<string>(userCountry || 'Global');
  const [filterLanguage, setFilterLanguage] = useState<string>(userLanguage || 'English');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAds, setTotalAds] = useState(0);
  const [publicAds, setPublicAds] = useState<SponsoredPublicAd[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [blockedSellerUids, setBlockedSellerUids] = useState<string[]>(() =>
    getBlockedBusinessUids(uid)
  );
  const [feedBanner, setFeedBanner] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Business Ad Card & Studio Drawer State
  const [studioOpen, setStudioOpen] = useState(false);
  const [bizProfile, setBizProfile] = useState<BusinessAdCardProfile | null>(null);
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState<string>(BUSINESS_CATEGORIES[0]);
  const [bizTagline, setBizTagline] = useState('');
  const [bizCity, setBizCity] = useState('');
  const [bizCountry, setBizCountry] = useState(userCountry || 'Sri Lanka');
  const [bizLanguage, setBizLanguage] = useState(userLanguage || 'English');
  const [enableDirectCall, setEnableDirectCall] = useState(true);
  const [enableLiveClass, setEnableLiveClass] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  // Live Selfie Verification State (Strict on-demand camera trigger)
  const [selfieCamActive, setSelfieCamActive] = useState(false);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState('');
  const [selfieBusy, setSelfieBusy] = useState(false);
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfieStreamRef = useRef<MediaStream | null>(null);

  // Ad Creation & AI Safety/Tier Evaluation State
  const [adTitle, setAdTitle] = useState('');
  const [adDescription, setAdDescription] = useState('');
  const [adMediaType, setAdMediaType] = useState<'image' | 'video'>('image');
  const [adMediaUrl, setAdMediaUrl] = useState('');
  const [adMediaMime, setAdMediaMime] = useState('image/jpeg');
  const [adVideoDurationSec, setAdVideoDurationSec] = useState(0);
  const [adCompressionNote, setAdCompressionNote] = useState('');
  const [adTargetCountry, setAdTargetCountry] = useState(userCountry || 'Sri Lanka');
  const [adTargetCountries, setAdTargetCountries] = useState<string[]>([
    userCountry || 'Sri Lanka',
  ]);
  const [adTargetLanguage, setAdTargetLanguage] = useState(userLanguage || 'English');
  const [safetyEval, setSafetyEval] = useState<AdSafetyEvaluationResult | null>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioStatus, setStudioStatus] = useState<string | null>(null);

  // $100/Year Unlimited Ads & Videos Pass + VIP Bypass + Status-Style Ad Viewer
  const [unlimitedPass, setUnlimitedPass] = useState<AdvertiserUnlimitedPassStatus | null>(null);
  const [unlimitedBusy, setUnlimitedBusy] = useState(false);
  const [viewingStatusAd, setViewingStatusAd] = useState<SponsoredPublicAd | null>(null);

  // 1-to-1 Buyer Fulfillment Request & Product Received ($0 Free)
  const [requestTargetAd, setRequestTargetAd] = useState<SponsoredPublicAd | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<AdFulfillmentType>('deliver_to_location');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [buyerLocation, setBuyerLocation] = useState<{
    latitude: number;
    longitude: number;
    displayAddress?: string;
  } | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [myRequests, setMyRequests] = useState<AdFulfillmentRequest[]>([]);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);

  // UGC Report & Violation Warning Notices
  const [reportTargetAd, setReportTargetAd] = useState<SponsoredPublicAd | null>(null);
  const [reportCategory, setReportCategory] = useState<AdReportCategory>('spam_misleading');
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [myWarnings, setMyWarnings] = useState<AdViolationWarningNotice[]>([]);
  const [showWarningsPanel, setShowWarningsPanel] = useState(false);

  const stopSelfieCamera = useCallback(() => {
    if (selfieStreamRef.current) {
      selfieStreamRef.current.getTracks().forEach((t) => t.stop());
      selfieStreamRef.current = null;
    }
    if (selfieVideoRef.current) {
      selfieVideoRef.current.srcObject = null;
    }
    setSelfieCamActive(false);
  }, []);

  useEffect(() => {
    return () => stopSelfieCamera();
  }, [stopSelfieCamera]);

  useEffect(() => {
    setUserMode(getActiveUserMode(uid));
    setBlockedSellerUids(getBlockedBusinessUids(uid));
    const onModeChange = () => setUserMode(getActiveUserMode(uid));
    window.addEventListener(USER_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(USER_MODE_CHANGED_EVENT, onModeChange);
  }, [uid]);

  const loadFeed = useCallback(
    async (targetPage = page) => {
      setLoadingFeed(true);
      setFeedError(null);
      try {
        const res = await fetchPublicSponsoredAds({
          country: filterCountry,
          language: filterLanguage,
          page: targetPage,
          pageSize: 6,
          viewerUid: uid,
          excludeSellers: blockedSellerUids,
        });
        setPublicAds(res.ads || []);
        setPage(res.page || 1);
        setTotalPages(res.totalPages || 1);
        setTotalAds(res.total || 0);
        if (res.config) setPricingConfig(res.config);
      } catch (err) {
        setFeedError(
          err instanceof Error ? err.message : 'Unable to load Sponsored Public Status.'
        );
      } finally {
        setLoadingFeed(false);
      }
    },
    [blockedSellerUids, filterCountry, filterLanguage, page, uid]
  );

  const loadAdvertiserAndRequests = useCallback(async () => {
    if (!uid) return;
    try {
      const [cfg, bizRes, reqRes, warnRes, unlimRes] = await Promise.all([
        fetchAdPlatformConfig().catch(() => null),
        fetchBusinessProfileCard(uid).catch(() => ({ profile: null })),
        fetchMyAdRequests(uid).catch(() => ({ requests: [] })),
        fetchMyAdViolationWarnings(uid).catch(() => ({ warnings: [] })),
        fetchAdvertiserUnlimitedPassStatus(uid, userPhone).catch(() => null),
      ]);
      if (cfg) setPricingConfig(cfg);
      if (unlimRes) setUnlimitedPass(unlimRes);
      if (bizRes?.profile) {
        setBizProfile(bizRes.profile);
        setBizName((prev) => prev || bizRes.profile?.businessName || '');
        setBizCategory(bizRes.profile.category || BUSINESS_CATEGORIES[0]);
        setBizTagline((prev) => prev || bizRes.profile?.tagline || '');
        setBizCity((prev) => prev || bizRes.profile?.city || '');
        setBizCountry(bizRes.profile.country || userCountry || 'Sri Lanka');
        setBizLanguage(bizRes.profile.primaryLanguage || userLanguage || 'English');
        setEnableDirectCall(bizRes.profile.enableDirectCall);
        setEnableLiveClass(bizRes.profile.enableLiveClass);
      }
      setMyRequests(reqRes?.requests || []);
      setMyWarnings(warnRes?.warnings || []);
    } catch {
      // Non-fatal
    }
  }, [uid, userCountry, userLanguage, userPhone]);

  useEffect(() => {
    void loadFeed(1);
  }, [filterCountry, filterLanguage, blockedSellerUids]);

  useEffect(() => {
    void loadAdvertiserAndRequests();
  }, [loadAdvertiserAndRequests]);

  // On-demand GPS Auto-Location strictly inside click handler (never on mount)
  const handleAutoDetectBusinessLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStudioError('Device GPS unavailable. Please enter your city/country manually.');
      return;
    }
    setGpsBusy(true);
    setStudioError(null);
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const resp = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
            );
            const geo = (await resp.json()) as {
              address?: { city?: string; town?: string; state?: string; country?: string };
            };
            const detectedCity =
              geo.address?.city || geo.address?.town || geo.address?.state || 'Local Area';
            const detectedCountry = geo.address?.country || bizCountry;
            setBizCity(detectedCity);
            if (detectedCountry) {
              setBizCountry(detectedCountry);
              setAdTargetCountry(detectedCountry);
            }
            setStudioStatus(`Auto-location detected: ${detectedCity}, ${detectedCountry}`);
          } catch {
            setBizCity(`GPS ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
            setStudioStatus('GPS coordinates captured cleanly.');
          } finally {
            setGpsBusy(false);
          }
        },
        (err) => {
          setGpsBusy(false);
          setStudioError(err.message || 'Location permission declined. Enter city manually.');
        },
        { enableHighAccuracy: false, timeout: 9000, maximumAge: 60000 }
      );
    } catch {
      setGpsBusy(false);
      setStudioError('Unable to access GPS right now. Enter city manually.');
    }
  };

  const handleCaptureBuyerGpsForDelivery = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFeedError('GPS not available on this device. Please type your delivery address note.');
      return;
    }
    setRequestBusy(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBuyerLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            displayAddress: `GPS ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          });
          setRequestBusy(false);
        },
        () => {
          setRequestBusy(false);
          setFeedError('GPS permission declined. You can type your delivery location manually.');
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
    } catch {
      setRequestBusy(false);
    }
  };

  // On-demand Live Selfie Camera strictly triggered by user click
  const handleStartLiveSelfieCamera = async () => {
    setStudioError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStudioError('Live camera API unavailable in this browser. Upload a clear selfie snapshot instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      selfieStreamRef.current = stream;
      setSelfieCamActive(true);
      window.setTimeout(() => {
        if (selfieVideoRef.current) {
          selfieVideoRef.current.srcObject = stream;
          void selfieVideoRef.current.play().catch(() => {});
        }
      }, 40);
    } catch {
      setStudioError('Camera permission was declined. Please allow camera access or upload a selfie.');
    }
  };

  const handleSnapAndVerifyLiveSelfie = async () => {
    const vid = selfieVideoRef.current;
    if (!vid) return;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || 480;
    canvas.height = vid.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    stopSelfieCamera();
    setSelfiePreviewUrl(dataUrl);
    await submitSelfieVerification(dataUrl);
  };

  const submitSelfieVerification = async (dataUrl: string) => {
    if (!uid) {
      setStudioError('Please sign in first to link Live Photo Verification to your account.');
      return;
    }
    setSelfieBusy(true);
    setStudioError(null);
    try {
      const res = await verifyAdvertiserLiveSelfie({
        ownerUid: uid,
        selfieDataUrl: dataUrl,
        phoneNumber: userPhone,
        email: userEmail,
      });
      setBizProfile(res.profile);
      setStudioStatus(
        `Live Photo Verification complete (Hash ${res.selfieVerificationHash.slice(0, 10)}). Ready to evaluate & publish.`
      );
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Live photo verification failed.');
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleSelectAdMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudioError(null);
    setSafetyEval(null);

    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressAdImageFile(file);
        const imgSafety = await analyzeImageDataUrlForExplicitContent(compressed.dataUrl, file.name);
        if (!imgSafety.safe) {
          setStudioError(
            imgSafety.blockedReason ||
              'Blocked by PK CHAT Explicit Content Shield: suggestive or explicit imagery is strictly prohibited.'
          );
          return;
        }
        setAdMediaType('image');
        setAdMediaUrl(compressed.dataUrl);
        setAdMediaMime(compressed.mimeType);
        setAdCompressionNote(
          `Compressed cleanly: ${Math.round(compressed.originalBytes / 1024)} KB -> ${Math.round(compressed.compressedBytes / 1024)} KB for zero-lag feed loading.`
        );
      } catch (err) {
        setStudioError(err instanceof Error ? err.message : 'Unable to compress ad image.');
      }
      return;
    }

    if (file.type.startsWith('video/')) {
      if (file.size > 25 * 1024 * 1024) {
        setStudioError('Please choose a compact promo video under 25 MB for fast Sponsored Status playback.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAdMediaType('video');
          setAdMediaUrl(reader.result);
          setAdMediaMime(file.type || 'video/mp4');
          setAdVideoDurationSec(30);
          setAdCompressionNote(`Promo video selected (${Math.round(file.size / 1024)} KB).`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleActivateUnlimitedPass = async () => {
    if (!uid) return;
    setUnlimitedBusy(true);
    setStudioError(null);
    setFeedError(null);
    try {
      const vipFree = hasFreeVipStatusAndAdAccess(userPhone);
      const token = vipFree
        ? undefined
        : `gpb_unlim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const status = await activateAdvertiserUnlimitedPass({
        uid,
        sellerPhone: userPhone,
        playBillingPurchaseToken: token,
      });
      setUnlimitedPass(status);
      setFeedBanner(
        status.vipFree
          ? 'VIP Founder Free Unlimited Ads & Video Status verified ($0.00).'
          : `$${status.pricePaidUsd}/year Unlimited Ads & Videos activated via Google Play Store Billing (${status.sku})!`
      );
      setStudioStatus(
        status.vipFree
          ? 'VIP Founder Free Unlimited Access active — all Business Ads & Video Statuses cost $0.00.'
          : `$100/year Unlimited Ads & Videos Pass active via Google Play Billing until ${status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : 'next year'}.`
      );
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Unable to activate Unlimited Ads & Videos pass.'
      );
    } finally {
      setUnlimitedBusy(false);
    }
  };

  const handleSaveBusinessProfile = async () => {
    if (!uid) return;
    if (!bizName.trim()) {
      setStudioError('Please enter your Business Name.');
      return;
    }
    const profileCheck = detectExplicitSexualContent(
      `${bizName.trim()}\n${bizCategory}\n${bizTagline.trim()}\n${bizCity.trim()}`
    );
    if (!profileCheck.safe) {
      setStudioError(
        profileCheck.blockedReason ||
          'Explicit or sexual business profile details are strictly prohibited on PK CHAT.'
      );
      return;
    }
    setStudioBusy(true);
    setStudioError(null);
    try {
      const { profile } = await saveBusinessProfileCard({
        ownerUid: uid,
        businessName: bizName.trim(),
        category: bizCategory,
        tagline: bizTagline.trim(),
        city: bizCity.trim(),
        country: bizCountry,
        countryCode: userCountryCode || 'LK',
        primaryLanguage: bizLanguage,
        enableDirectCall,
        enableLiveClass,
        privatePhone: userPhone,
        privateEmail: userEmail,
      });
      setBizProfile(profile);
      setStudioStatus('Business Ad Card saved ($0 upfront charge).');
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Unable to save Business Ad Card.');
    } finally {
      setStudioBusy(false);
    }
  };

  const resolvedSelectedTargets = normalizeTargetCountries(adTargetCountry, adTargetCountries);

  const handleToggleTargetCountry = (countryName: string) => {
    setSafetyEval(null);
    if (countryName === 'All Country' || countryName === 'Global') {
      setAdTargetCountries(['All Country']);
      setAdTargetCountry('All Country');
      return;
    }
    setAdTargetCountries((prev) => {
      const filtered = prev.filter((c) => c !== 'All Country' && c !== 'Global');
      const exists = filtered.includes(countryName);
      const next = exists ? filtered.filter((c) => c !== countryName) : [...filtered, countryName];
      const safeNext = next.length > 0 ? next : [countryName];
      setAdTargetCountry(safeNext[0]);
      return safeNext;
    });
  };

  const handleRunAiSafetyAndTierCheck = async () => {
    const localPreCheck = preScreenAdContentSafety({
      businessName: bizName.trim() || bizProfile?.businessName || 'My Business',
      category: bizCategory,
      title: adTitle.trim(),
      description: adDescription.trim(),
    });
    if (!localPreCheck.safe) {
      setStudioError(localPreCheck.reason || 'Blocked by PK CHAT Explicit Content Safety Shield.');
      return;
    }
    setStudioBusy(true);
    setStudioError(null);
    try {
      const res = await evaluateAdSafetyAndTier({
        businessName: bizName.trim() || bizProfile?.businessName || 'My Business',
        category: bizCategory,
        title: adTitle.trim(),
        description: adDescription.trim(),
        mediaType: adMediaType,
        durationSeconds: adVideoDurationSec,
        targetCountry: adTargetCountry,
        targetCountries: resolvedSelectedTargets,
        enableLiveClass,
      });
      setSafetyEval(res);
      if (!res.safe) {
        setStudioError(
          sanitizePublicText(
            res.blockedReason || 'Blocked by pre-publish PK safety filter. Please revise your ad copy.'
          )
        );
      } else {
        setStudioStatus(
          sanitizePublicText(
            `PK Safety Passed · Classified as ${res.tierLabel} (SKU: ${res.skuId}). Click "Publish Ad" to complete Pay-at-Publish checkout.`
          )
        );
      }
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'PK safety evaluation failed.');
    } finally {
      setStudioBusy(false);
    }
  };

  const hasUnlimitedOrVipAdAccess = Boolean(
    unlimitedPass?.active || hasFreeVipStatusAndAdAccess(userPhone)
  );

  const handlePayAndPublishAd = async () => {
    if (!uid) return;
    if (!bizProfile?.selfieVerified) {
      setStudioError('Complete Live Photo Verification before publishing.');
      return;
    }
    if (!adTitle.trim() || !adDescription.trim() || !adMediaUrl) {
      setStudioError('Add ad title, description, and compressed photo/video first.');
      return;
    }
    setStudioBusy(true);
    setStudioError(null);
    try {
      const evaluation =
        safetyEval ||
        (await evaluateAdSafetyAndTier({
          businessName: bizName.trim() || bizProfile.businessName,
          category: bizCategory,
          title: adTitle.trim(),
          description: adDescription.trim(),
          mediaType: adMediaType,
          durationSeconds: adVideoDurationSec,
          targetCountry: adTargetCountry,
          targetCountries: resolvedSelectedTargets,
          enableLiveClass,
        }));
      setSafetyEval(evaluation);
      if (!evaluation.safe) {
        setStudioError(
          sanitizePublicText(
            evaluation.blockedReason || 'Ad rejected by PK pre-publish safety filter.'
          )
        );
        return;
      }

      // Pay-at-Publish ONLY (or $0.00 when VIP / $100/year Unlimited Ads Pass is active)
      const purchaseToken = hasUnlimitedOrVipAdAccess
        ? undefined
        : `gpb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const publishedRes = await publishSponsoredAd({
        sellerUid: uid,
        sellerPhone: userPhone,
        businessName: bizName.trim() || bizProfile.businessName,
        category: bizCategory,
        title: adTitle.trim(),
        description: adDescription.trim(),
        mediaType: adMediaType,
        mediaUrl: adMediaUrl,
        mediaMimeType: adMediaMime,
        durationSeconds: adVideoDurationSec,
        targetCountry: adTargetCountry,
        targetCountries: resolvedSelectedTargets,
        targetLanguage: adTargetLanguage,
        enableDirectCall,
        enableLiveClass,
        city: bizCity.trim(),
        playBillingPurchaseToken: purchaseToken,
        playBillingSku: hasUnlimitedOrVipAdAccess
          ? unlimitedPass?.sku || 'pk_ad_unlimited_100usd'
          : evaluation.skuId,
        amountUsd: hasUnlimitedOrVipAdAccess ? 0 : evaluation.priceUsd,
      });

      const paidAmount = publishedRes.ad?.pricePaidUsd ?? (hasUnlimitedOrVipAdAccess ? 0 : evaluation.priceUsd);
      setStudioStatus(
        paidAmount === 0
          ? `Ad Published Live for $0.00 (${hasFreeVipStatusAndAdAccess(userPhone) ? 'VIP Free Access' : '$100/yr Unlimited Ads Pass'})!`
          : `Ad Published Live! Charged $${paidAmount} USD via Google Play Billing (${evaluation.skuId}).`
      );
      setFeedBanner(
        `"${adTitle.trim()}" is now live in Sponsored Public Status (${formatTargetCountriesLabel({
          targetCountry: adTargetCountry,
          targetCountries: resolvedSelectedTargets,
        })} · ${adTargetLanguage}).`
      );
      setAdTitle('');
      setAdDescription('');
      setAdMediaUrl('');
      setSafetyEval(null);
      setStudioOpen(false);
      await loadFeed(1);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Unable to publish ad.');
    } finally {
      setStudioBusy(false);
    }
  };

  const handleSubmitPrivateFulfillmentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTargetAd || !uid) return;
    setRequestBusy(true);
    setFeedError(null);
    try {
      const { request } = await createAdFulfillmentRequest({
        adId: requestTargetAd.adId,
        buyerUid: uid,
        buyerName: userName || 'PK Chat Buyer',
        fulfillmentType,
        deliveryNote: deliveryNote.trim(),
        scheduledDateTime:
          fulfillmentType === 'scheduled_delivery' ? scheduledDateTime : undefined,
        buyerLocation: fulfillmentType === 'deliver_to_location' ? buyerLocation : null,
      });
      setMyRequests((prev) => [request, ...prev]);
      setFeedBanner(
        `Private 1-to-1 request sent to ${request.businessName} (Call Relay: ${request.callRelayCode}). Product Received confirmation is $0 FREE.`
      );
      setRequestTargetAd(null);
      setDeliveryNote('');
      setShowRequestsPanel(true);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Failed to create 1-to-1 private request.');
    } finally {
      setRequestBusy(false);
    }
  };

  const handleConfirmProductReceived = async (requestId: string) => {
    if (!uid) return;
    setRequestBusy(true);
    try {
      const { request } = await confirmAdProductReceived({ requestId, buyerUid: uid });
      setMyRequests((prev) => prev.map((r) => (r.requestId === requestId ? request : r)));
      setFeedBanner(`Confirmed "Product Received" ($0.00 FREE) for ${request.adTitle}.`);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Unable to confirm receipt.');
    } finally {
      setRequestBusy(false);
    }
  };

  const handleSubmitUgcReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTargetAd || !uid) return;
    setReportBusy(true);
    try {
      const res = await reportSponsoredAd({
        adId: reportTargetAd.adId,
        reporterUid: uid,
        category: reportCategory,
        reason: reportReason.trim() || AD_REPORT_REASON_LABELS[reportCategory],
      });
      setFeedBanner(res.message);
      setReportTargetAd(null);
      setReportReason('');
      await loadFeed(page);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setReportBusy(false);
    }
  };

  const handleBlockBusiness = (ad: SponsoredPublicAd) => {
    const next = addBlockedBusinessUid(ad.sellerUid, uid);
    setBlockedSellerUids(next);
    setPublicAds((prev) => prev.filter((item) => item.sellerUid !== ad.sellerUid));
    setFeedBanner(`Blocked ads from "${ad.businessName}". You won't see listings from this advertiser.`);
  };

  const smallPrice =
    pricingConfig?.smallAdPriceUsd ?? GOOGLE_PLAY_BILLING_CONFIG.adTiers.small.priceUsd;
  const largePrice =
    pricingConfig?.largeAdPriceUsd ?? GOOGLE_PLAY_BILLING_CONFIG.adTiers.large.priceUsd;

  return (
    <section
      aria-label="Sponsored Public Status and Business Marketplace"
      className="rounded-3xl bg-[#e3f3ff]/84 backdrop-blur-2xl border border-[#7dd3fc]/80 p-5 space-y-5 shadow-[0_8px_28px_rgba(2,132,199,0.12)]"
    >
      {/* Strict Separation Header & Dual User Mode Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#7dd3fc]/50 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-[#0284c7] text-white text-[10px] font-bold uppercase tracking-wider">
              Sponsored Public Status · Separate from My Contacts Status
            </span>
            <span className="text-[11px] font-semibold text-[#0284c7]">
              100% Free Viewing · Zero Personal Phone Exposure
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-[#0284c7]" />
            <span>Business Marketplace &amp; Sponsored Public Status</span>
          </h2>
          <p className="text-xs text-slate-600">
            Target Single Country, Multi-Country, or All Country · Pay ${smallPrice} (Small), ${largePrice} (Large), or ${pricingConfig?.unlimitedAdPriceUsd ?? UNLIMITED_ADS_ANNUAL_PRICE_USD}/year Unlimited Ads &amp; Videos via Google Play Store Billing ONLY.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dual Mode Switcher */}
          <div className="inline-flex rounded-xl bg-[#d2ecff]/90 border border-[#7dd3fc] p-1">
            <button
              type="button"
              onClick={() => {
                setUserMode('general');
                setActiveUserMode('general', uid);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                userMode === 'general'
                  ? 'bg-[#0284c7] text-white shadow-xs'
                  : 'text-[#0c4a6e] hover:bg-white/40'
              }`}
            >
              General User Mode
            </button>
            <button
              type="button"
              onClick={() => {
                setUserMode('business');
                setActiveUserMode('business', uid);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                userMode === 'business'
                  ? 'bg-[#0284c7] text-white shadow-xs'
                  : 'text-[#0c4a6e] hover:bg-white/40'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Business Mode</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowRequestsPanel((v) => !v)}
            className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc] text-xs font-semibold text-[#0369a1]"
          >
            1-to-1 Requests ({myRequests.length})
          </button>

          {userMode === 'business' && (
            <>
              <button
                type="button"
                onClick={() => setShowWarningsPanel((v) => !v)}
                className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc] text-xs font-semibold text-[#0c4a6e]"
              >
                Warnings ({myWarnings.length})
              </button>
              <button
                type="button"
                disabled={unlimitedBusy}
                onClick={() => void handleActivateUnlimitedPass()}
                className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-bold shadow-xs"
              >
                {hasFreeVipStatusAndAdAccess(userPhone)
                  ? 'VIP Free Unlimited ($0)'
                  : unlimitedPass?.active
                  ? '$100/yr Unlimited Active ✓'
                  : unlimitedBusy
                  ? 'Activating...'
                  : `$${pricingConfig?.unlimitedAdPriceUsd ?? UNLIMITED_ADS_ANNUAL_PRICE_USD}/yr Unlimited Ads`}
              </button>
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Business Ad Studio ($0 Setup)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {feedBanner && (
        <div className="p-3 rounded-2xl bg-sky-50 border border-[#7dd3fc] text-xs text-[#0369a1] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedBanner}</span>
          </div>
          <button type="button" onClick={() => setFeedBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedError && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-2">
          <span>{feedError}</span>
          <button type="button" onClick={() => setFeedError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Advertiser Violation Warnings Inbox */}
      {showWarningsPanel && (
        <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Verified Violation Warning Notices ({myWarnings.length})</span>
            </h3>
            <button type="button" onClick={() => setShowWarningsPanel(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {myWarnings.length === 0 ? (
            <p className="text-slate-600">
              No verified violation warnings on your account. False reports never trigger automated bans.
            </p>
          ) : (
            myWarnings.map((w) => (
              <div
                key={w.warningId}
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1 text-rose-900"
              >
                <p className="font-bold">
                  [{w.actionTaken.toUpperCase()}] {w.businessName} · Category: {w.violationCategory}
                </p>
                <p>{w.evidenceSummary}</p>
                <p className="text-[11px] text-rose-700">
                  Policy: {w.policyClause} · Reports Reviewed: {w.reporterCount} · Issued:{' '}
                  {new Date(w.issuedAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Isolated 1-to-1 Buyer / Seller Requests & $0 Free Product Received */}
      {showRequestsPanel && (
        <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
              <PhoneCall className="w-4 h-4 text-[#0284c7]" />
              <span>Private 1-to-1 Call &amp; Fulfillment Requests (Strictly Isolated)</span>
            </h3>
            <button type="button" onClick={() => setShowRequestsPanel(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {myRequests.length === 0 ? (
            <p className="text-slate-600">
              No active 1-to-1 item requests yet. Tap &quot;Call Now / Request Item&quot; on any ad below.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {myRequests.map((reqItem) => (
                <div
                  key={reqItem.requestId}
                  className="p-3 rounded-xl bg-white/75 border border-[#7dd3fc]/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate">{reqItem.adTitle}</span>
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-[#0369a1] font-bold uppercase text-[10px]">
                      {reqItem.status}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Business: <strong>{reqItem.businessName}</strong> · Mode:{' '}
                    <span className="capitalize">{reqItem.fulfillmentType.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="text-[11px] font-mono text-[#0284c7]">
                    Relay Call Code: {reqItem.callRelayCode} · Platform Fee: $0.00 (Free)
                  </p>
                  {reqItem.scheduledDateTime && (
                    <p className="text-[11px] text-slate-600">
                      Scheduled: {new Date(reqItem.scheduledDateTime).toLocaleString()}
                    </p>
                  )}
                  {reqItem.buyerLocation && (
                    <p className="text-[11px] text-slate-600">
                      Delivery Pin: {reqItem.buyerLocation.latitude}, {reqItem.buyerLocation.longitude}
                    </p>
                  )}
                  {reqItem.buyerUid === uid && reqItem.status !== 'received' && (
                    <button
                      type="button"
                      disabled={requestBusy}
                      onClick={() => void handleConfirmProductReceived(reqItem.requestId)}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold flex items-center gap-1.5"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Confirm Product Received ($0 FREE)</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Country & Language Filter Controls */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 bg-[#eef8ff]/90 border border-[#7dd3fc] rounded-xl px-3 py-2">
          <Globe className="w-3.5 h-3.5 text-[#0284c7]" />
          <label htmlFor="sponsored-country-filter" className="font-semibold text-slate-700">
            Country:
          </label>
          <select
            id="sponsored-country-filter"
            value={filterCountry}
            onChange={(e) => {
              setFilterCountry(e.target.value);
              setPage(1);
            }}
            className="bg-transparent font-semibold text-[#0369a1] focus:outline-none"
          >
            {SPONSORED_TARGET_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-[#eef8ff]/90 border border-[#7dd3fc] rounded-xl px-3 py-2">
          <Languages className="w-3.5 h-3.5 text-[#0284c7]" />
          <label htmlFor="sponsored-language-filter" className="font-semibold text-slate-700">
            Language:
          </label>
          <select
            id="sponsored-language-filter"
            value={filterLanguage}
            onChange={(e) => {
              setFilterLanguage(e.target.value);
              setPage(1);
            }}
            className="bg-transparent font-semibold text-[#0369a1] focus:outline-none"
          >
            {SPONSORED_TARGET_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadFeed(page)}
          disabled={loadingFeed}
          className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc] text-[#0369a1] font-semibold flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin' : ''}`} />
          <span>Refresh ({totalAds})</span>
        </button>
      </div>

      {/* Paginated Sponsored Public Status Cards */}
      {publicAds.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#eef8ff]/80 border border-[#7dd3fc]/70 text-center space-y-2 text-xs text-slate-600">
          <p className="font-bold text-slate-800">
            No Sponsored Public Status ads match {filterCountry} · {filterLanguage} yet.
          </p>
          <p>
            Switch to <strong>Business Mode</strong> above to publish a verified Business Ad Card for $0 setup (pay ${smallPrice} or ${largePrice} only when publishing).
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicAds.map((ad) => (
            <article
              key={ad.adId}
              className="rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc]/80 overflow-hidden flex flex-col justify-between shadow-sm"
            >
              <div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingStatusAd(ad)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setViewingStatusAd(ad);
                    }
                  }}
                  className="relative aspect-video bg-sky-950/90 overflow-hidden cursor-pointer group"
                >
                  {ad.mediaType === 'video' ? (
                    <video
                      src={ad.mediaUrl}
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={ad.mediaUrl}
                      alt={ad.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  )}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    <span className="px-2 py-0.5 rounded bg-[#0284c7]/90 text-white text-[10px] font-bold">
                      Sponsored · {formatTargetCountriesLabel(ad)}
                    </span>
                    {ad.selfieVerified && (
                      <span className="px-2 py-0.5 rounded bg-sky-100/95 text-[#0369a1] text-[10px] font-bold flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/75 text-white text-[10px] font-semibold">
                    Tap for Status View
                  </span>
                  {ad.status === 'under_review' && (
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                      Under Review (False-Report Shield Active)
                    </span>
                  )}
                </div>

                <div className="p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#0284c7] font-semibold">
                    <button
                      type="button"
                      onClick={() => setViewingStatusAd(ad)}
                      className="truncate hover:underline text-left font-bold"
                    >
                      {ad.businessName}
                    </button>
                    <span>{ad.targetLanguage}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{ad.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{ad.description}</p>
                  {ad.city && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#0284c7]" />
                      <span>
                        {ad.city}, {formatTargetCountriesLabel(ad)}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3.5 pt-0 space-y-2">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRequestTargetAd(ad)}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call Now / Request Item</span>
                  </button>
                  {ad.enableLiveClass && onLaunchLiveClass && (
                    <button
                      type="button"
                      onClick={onLaunchLiveClass}
                      className="py-2 px-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-[#0369a1] text-xs font-semibold flex items-center gap-1"
                      title="Join Business PK Live Class"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-[#7dd3fc]/40">
                  <button
                    type="button"
                    onClick={() => setReportTargetAd(ad)}
                    className="text-slate-600 hover:text-rose-700 font-semibold flex items-center gap-1"
                  >
                    <Flag className="w-3 h-3" />
                    <span>Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlockBusiness(ad)}
                    className="text-slate-600 hover:text-rose-700 font-semibold flex items-center gap-1"
                  >
                    <UserX className="w-3 h-3" />
                    <span>Block</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Zero-Lag Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1 text-xs">
          <button
            type="button"
            disabled={page <= 1 || loadingFeed}
            onClick={() => void loadFeed(page - 1)}
            className="px-3 py-1.5 rounded-xl bg-[#eef8ff] border border-[#7dd3fc] disabled:opacity-50 font-semibold flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <span className="font-semibold text-[#0c4a6e]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loadingFeed}
            onClick={() => void loadFeed(page + 1)}
            className="px-3 py-1.5 rounded-xl bg-[#eef8ff] border border-[#7dd3fc] disabled:opacity-50 font-semibold flex items-center gap-1"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BUSINESS AD STUDIO MODAL (0$ Setup · Live Selfie Verify · AI Filter · Pay-at-Publish) */}
      {studioOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[92vh] flex flex-col rounded-3xl bg-[#e3f3ff]/95 backdrop-blur-2xl border border-[#7dd3fc] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Business Ad Studio ($0 Free Setup)</h3>
                <p className="text-[11px] text-sky-100">
                  Google Play Billing {pricingConfig?.billingLibraryVersion || '8.0.0'} · Charged ${smallPrice} or ${largePrice} ONLY when you tap Publish Ad
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSelfieCamera();
                  setStudioOpen(false);
                }}
                className="p-2 rounded-xl hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {studioError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{studioError}</span>
                </div>
              )}
              {studioStatus && (
                <div className="p-3 rounded-xl bg-sky-50 border border-[#7dd3fc] text-[#0369a1] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{studioStatus}</span>
                </div>
              )}

              {/* Step 1: Business Ad Card Profile + Auto-Location */}
              <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">1. Business Ad Card (Free Setup)</h4>
                  <button
                    type="button"
                    disabled={gpsBusy}
                    onClick={handleAutoDetectBusinessLocation}
                    className="px-2.5 py-1 rounded-lg bg-[#0284c7] text-white font-semibold flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{gpsBusy ? 'Detecting...' : 'Auto-Location (GPS)'}</span>
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="Business Name (e.g. Kandy Fresh Bakery)"
                    className="px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                  />
                  <select
                    value={bizCategory}
                    onChange={(e) => setBizCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                  >
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={bizCity}
                    onChange={(e) => setBizCity(e.target.value)}
                    placeholder="City / District"
                    className="px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                  />
                  <input
                    type="text"
                    value={bizTagline}
                    onChange={(e) => setBizTagline(e.target.value)}
                    placeholder="Short Business Tagline"
                    className="px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={enableDirectCall}
                        onChange={(e) => setEnableDirectCall(e.target.checked)}
                      />
                      <span>Enable 1-to-1 Call Relay</span>
                    </label>
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={enableLiveClass}
                        onChange={(e) => setEnableLiveClass(e.target.checked)}
                      />
                      <span>Enable PK Live Class</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={studioBusy}
                    onClick={() => void handleSaveBusinessProfile()}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                  >
                    Save Card Profile
                  </button>
                </div>
              </div>

              {/* Step 2: Live Photo Verification */}
              <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">
                    2. Live Photo Verification{' '}
                    {bizProfile?.selfieVerified ? '✅ Verified' : '(Required Before Publish)'}
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={selfieBusy}
                      onClick={() =>
                        selfieCamActive
                          ? void handleSnapAndVerifyLiveSelfie()
                          : void handleStartLiveSelfieCamera()
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#0284c7] text-white font-semibold flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>
                        {selfieCamActive ? 'Capture & Verify Selfie' : 'Start Live Selfie Camera'}
                      </span>
                    </button>
                    <label className="px-3 py-1.5 rounded-xl bg-sky-100 text-[#0369a1] font-semibold cursor-pointer">
                      <span>Upload Selfie</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const compressed = await compressAdImageFile(file);
                          setSelfiePreviewUrl(compressed.dataUrl);
                          await submitSelfieVerification(compressed.dataUrl);
                        }}
                      />
                    </label>
                  </div>
                </div>
                {selfieCamActive && (
                  <div className="rounded-xl overflow-hidden bg-black aspect-video max-h-48">
                    <video
                      ref={selfieVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {selfiePreviewUrl && !selfieCamActive && (
                  <p className="text-[11px] text-[#0284c7] font-semibold">
                    Live verification photo captured &amp; linked securely to your verified account.
                  </p>
                )}
              </div>

              {/* Step 3: Ad Creative + Country/Language Target + Free AI Evaluation & Publish */}
              <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] space-y-3">
                <h4 className="font-bold text-slate-900">
                  3. Create Ad, Target Country/Language &amp; Free Safety Check
                </h4>
                <input
                  type="text"
                  value={adTitle}
                  onChange={(e) => {
                    setAdTitle(e.target.value);
                    setSafetyEval(null);
                  }}
                  placeholder="Ad Headline (e.g. Fresh Ceylon Spices & Delivery)"
                  className="w-full px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                />
                <textarea
                  rows={2}
                  value={adDescription}
                  onChange={(e) => {
                    setAdDescription(e.target.value);
                    setSafetyEval(null);
                  }}
                  placeholder="Describe your product or service clearly..."
                  className="w-full px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc]"
                />
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white/80 border border-[#7dd3fc] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#0c4a6e]">
                        Target Countries ({resolvedSelectedTargets.join(', ')})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleTargetCountry('All Country')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          resolvedSelectedTargets.includes('All Country')
                            ? 'bg-[#0284c7] text-white'
                            : 'bg-sky-100 text-[#0369a1]'
                        }`}
                      >
                        All Country
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {SPONSORED_TARGET_COUNTRIES.filter((c) => c !== 'Global' && c !== 'All Country').map(
                        (c) => {
                          const active =
                            resolvedSelectedTargets.includes('All Country') ||
                            resolvedSelectedTargets.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => handleToggleTargetCountry(c)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                active
                                  ? 'bg-[#0284c7] text-white border-[#0284c7]'
                                  : 'bg-[#eef8ff] text-slate-700 border-[#7dd3fc]'
                              }`}
                            >
                              {c}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                  <select
                    value={adTargetLanguage}
                    onChange={(e) => setAdTargetLanguage(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white/80 border border-[#7dd3fc] self-start"
                  >
                    {SPONSORED_TARGET_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        Target Language: {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="px-3.5 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-[#0369a1] font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Upload Photo / Video (Free Compression)</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={handleSelectAdMediaFile}
                    />
                  </label>
                  {adCompressionNote && (
                    <span className="text-[11px] text-[#0284c7] font-medium">
                      {adCompressionNote}
                    </span>
                  )}
                </div>

                {safetyEval && safetyEval.safe && (
                  <div className="p-3 rounded-xl bg-sky-100/80 border border-[#0284c7]/40 text-[#0c4a6e] space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />
                      <span>
                        {hasUnlimitedOrVipAdAccess
                          ? `${safetyEval.adScale.toUpperCase()} Ad · $0.00 Covered (${hasFreeVipStatusAndAdAccess(userPhone) ? 'VIP Free Access' : '$100/yr Unlimited Pass'})`
                          : safetyEval.tierLabel}
                      </span>
                    </p>
                    <p className="text-[11px]">
                      {safetyEval.aiSummary} (Engine: {safetyEval.engine} · SKU:{' '}
                      {hasUnlimitedOrVipAdAccess ? unlimitedPass?.sku || 'pk_ad_unlimited_100usd' : safetyEval.skuId})
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#7dd3fc]/60 flex flex-wrap items-center justify-between gap-2 bg-[#d5eeff]/80">
              <button
                type="button"
                disabled={studioBusy || !adTitle.trim() || !adDescription.trim()}
                onClick={() => void handleRunAiSafetyAndTierCheck()}
                className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Free PK Safety &amp; Tier Check</span>
              </button>
              <button
                type="button"
                disabled={studioBusy || !bizProfile?.selfieVerified || !adMediaUrl}
                onClick={() => void handlePayAndPublishAd()}
                className="px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-bold"
              >
                {studioBusy
                  ? 'Publishing...'
                  : hasFreeVipStatusAndAdAccess(userPhone)
                  ? 'Publish Ad ($0.00 VIP Free)'
                  : unlimitedPass?.active
                  ? 'Publish Ad ($0.00 Unlimited Pass)'
                  : `Publish Ad ($${safetyEval?.priceUsd ?? smallPrice} Play Billing)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-TO-1 CALL NOW / REQUEST ITEM & 3 FULFILLMENT OPTIONS MODAL */}
      {requestTargetAd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitPrivateFulfillmentRequest}
            className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/95 backdrop-blur-2xl border border-[#7dd3fc] p-6 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                1-to-1 Private Request · {requestTargetAd.businessName}
              </h3>
              <button type="button" onClick={() => setRequestTargetAd(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-600">
              Your request is strictly private (1-to-1). Seller personal phone/email remains hidden; PK Chat provides an isolated call relay code &amp; free ($0) Product Received confirmation.
            </p>

            <div className="space-y-2">
              <label className="font-bold text-slate-800 block">Choose Fulfillment Option:</label>
              {(
                [
                  {
                    id: 'deliver_to_location',
                    label: '1. Deliver to My Location',
                    desc: 'Share optional GPS pin or delivery address note',
                  },
                  {
                    id: 'direct_pickup',
                    label: '2. Direct Pickup',
                    desc: 'Pick up directly from the verified business location',
                  },
                  {
                    id: 'scheduled_delivery',
                    label: '3. Scheduled Delivery Time',
                    desc: 'Pick a preferred delivery date and time',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFulfillmentType(opt.id)}
                  className={`w-full p-2.5 rounded-xl border text-left ${
                    fulfillmentType === opt.id
                      ? 'bg-sky-100 border-[#0284c7] ring-1 ring-[#0284c7]'
                      : 'bg-white/75 border-[#7dd3fc]/70'
                  }`}
                >
                  <p className="font-bold text-slate-900">{opt.label}</p>
                  <p className="text-[11px] text-slate-600">{opt.desc}</p>
                </button>
              ))}
            </div>

            {fulfillmentType === 'deliver_to_location' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={requestBusy}
                  onClick={handleCaptureBuyerGpsForDelivery}
                  className="px-3 py-1.5 rounded-xl bg-sky-100 border border-[#7dd3fc] text-[#0369a1] font-semibold flex items-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>
                    {buyerLocation
                      ? `GPS Attached (${buyerLocation.displayAddress})`
                      : 'Attach My Current GPS (Optional)'}
                  </span>
                </button>
              </div>
            )}

            {fulfillmentType === 'scheduled_delivery' && (
              <div>
                <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>Preferred Date &amp; Time</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/85 border border-[#7dd3fc]"
                />
              </div>
            )}

            <textarea
              rows={2}
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              placeholder="Optional delivery note or quantity request..."
              className="w-full px-3 py-2 rounded-xl bg-white/85 border border-[#7dd3fc]"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequestTargetAd(null)}
                className="px-4 py-2 rounded-xl border border-[#7dd3fc] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={requestBusy}
                className="px-5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold"
              >
                {requestBusy ? 'Sending...' : 'Send 1-to-1 Request ($0 Free)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* GOOGLE PLAY UGC REPORT AD MODAL */}
      {reportTargetAd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitUgcReport}
            className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/95 backdrop-blur-2xl border border-[#7dd3fc] p-6 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Report Business Ad · {reportTargetAd.businessName}
              </h3>
              <button type="button" onClick={() => setReportTargetAd(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-600">
              Flagged listings move safely into &quot;Under Review&quot; so honest businesses are never auto-banned by false reports before moderation evidence review.
            </p>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value as AdReportCategory)}
              className="w-full px-3 py-2 rounded-xl bg-white/85 border border-[#7dd3fc]"
            >
              {(Object.keys(AD_REPORT_REASON_LABELS) as AdReportCategory[]).map((key) => (
                <option key={key} value={key}>
                  {AD_REPORT_REASON_LABELS[key]}
                </option>
              ))}
            </select>
            <textarea
              rows={2}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Explain what policy issue you noticed..."
              className="w-full px-3 py-2 rounded-xl bg-white/85 border border-[#7dd3fc]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTargetAd(null)}
                className="px-4 py-2 rounded-xl border border-[#7dd3fc] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportBusy}
                className="px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold"
              >
                {reportBusy ? 'Submitting...' : 'Submit UGC Report'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* FULL-SCREEN STATUS-STYLE AD VIEWER (Shows Current Ad + Other Ads by Same Seller Directly Inside Status) */}
      {viewingStatusAd && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 text-white"
          role="dialog"
          aria-label={`Sponsored Status by ${viewingStatusAd.businessName}`}
        >
          <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#0284c7] text-[10px] font-bold uppercase">
                  Sponsored Status
                </span>
                {viewingStatusAd.selfieVerified && (
                  <span className="text-[11px] text-sky-300 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified Business
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold truncate mt-0.5">
                {viewingStatusAd.businessName} · {viewingStatusAd.title}
              </h3>
              <p className="text-[11px] text-sky-200">
                {formatTargetCountriesLabel(viewingStatusAd)} · {viewingStatusAd.targetLanguage}
                {viewingStatusAd.city ? ` · ${viewingStatusAd.city}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewingStatusAd(null)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              aria-label="Close Status Ad Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center my-3 overflow-hidden">
            {viewingStatusAd.mediaType === 'video' ? (
              <video
                src={viewingStatusAd.mediaUrl}
                controls
                autoPlay
                className="max-h-[58vh] w-full object-contain rounded-2xl bg-black"
              />
            ) : (
              <img
                src={viewingStatusAd.mediaUrl}
                alt={viewingStatusAd.title}
                className="max-h-[58vh] w-full object-contain rounded-2xl"
              />
            )}
            <p className="mt-3 text-xs sm:text-sm text-sky-50 text-center max-w-2xl">
              {viewingStatusAd.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const target = viewingStatusAd;
                  setViewingStatusAd(null);
                  setRequestTargetAd(target);
                }}
                className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold flex items-center gap-1.5"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Now / Request Item</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = viewingStatusAd;
                  setViewingStatusAd(null);
                  setReportTargetAd(target);
                }}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-rose-700/80 text-white font-semibold flex items-center gap-1"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Report</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleBlockBusiness(viewingStatusAd);
                  setViewingStatusAd(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-rose-700/80 text-white font-semibold flex items-center gap-1"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Block Advertiser</span>
              </button>
            </div>
          </div>

          {(() => {
            const sameSellerAds = getAdsBySameSeller(publicAds, viewingStatusAd.sellerUid);
            if (sameSellerAds.length <= 1) return null;
            return (
              <div className="max-w-4xl mx-auto w-full border-t border-white/15 pt-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                  Other Ads by {viewingStatusAd.businessName} ({sameSellerAds.length})
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {sameSellerAds.map((other) => (
                    <button
                      key={other.adId}
                      type="button"
                      onClick={() => setViewingStatusAd(other)}
                      className={`shrink-0 w-40 rounded-xl p-1.5 border text-left transition-all ${
                        other.adId === viewingStatusAd.adId
                          ? 'bg-[#0284c7]/40 border-[#38bdf8]'
                          : 'bg-white/10 border-white/15 hover:bg-white/20'
                      }`}
                    >
                      <p className="text-[11px] font-bold text-white truncate">{other.title}</p>
                      <p className="text-[10px] text-sky-200 truncate">
                        {formatTargetCountriesLabel(other)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
