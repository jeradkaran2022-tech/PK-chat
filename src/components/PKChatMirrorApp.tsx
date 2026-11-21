import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatItem,
  LocationHierarchyFilter,
  PKChatSoundEngine,
  VerifiedDisasterAlert,
  getVerifiedLocationAlerts,
  resolveFestivalGreetings,
} from '../lib/pkMirrorEngine';
import { usePkChat } from '../context/PkChatContext';

export {
  PKChatSoundEngine,
  resolveFestivalGreetings,
  getVerifiedLocationAlerts,
  type ChatItem,
  type VerifiedDisasterAlert,
};

const SAMPLE_VERIFIED_ALERTS: VerifiedDisasterAlert[] = [
  {
    id: 'al-1',
    title: 'Heavy Rain & Localized Waterlogging Advisory',
    country: 'Sri Lanka',
    provinceOrState: 'Western Province',
    districtOrCity: 'Colombo',
    villageOrArea: 'all',
    governmentSource: 'National Disaster Relief & Meteorology Authority (Official)',
    isOfficialVerified: true,
    timestamp: 'Verified Official Bulletin',
  },
  {
    id: 'al-2',
    title: 'Coastal Wind & Weather Advisory',
    country: 'Sri Lanka',
    provinceOrState: 'Northern Province',
    districtOrCity: 'Jaffna',
    villageOrArea: 'all',
    governmentSource: 'National Disaster Management Authority (Official)',
    isOfficialVerified: true,
    timestamp: 'Verified Official Bulletin',
  },
];

// 4. Mirror UI Component matching the uploaded PK Chat mobile preview
export const PKChatMirrorApp: React.FC = () => {
  const pkCtx = usePkChat();
  const soundEngineRef = useRef<PKChatSoundEngine | null>(null);
  if (!soundEngineRef.current) {
    soundEngineRef.current = new PKChatSoundEngine();
  }

  const [activeFilter, setActiveFilter] = useState<'All' | 'Groups' | 'Calls' | 'SOS'>('All');
  const [activeTab, setActiveTab] = useState<'Chats' | 'Status' | 'Calls' | 'SOS & Safety'>('Chats');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRinging, setIsRinging] = useState(false);

  // User location context (Country -> Province -> District/City -> Village)
  const [userLocation, setUserLocation] = useState<LocationHierarchyFilter>(() => ({
    country: pkCtx.consentedLocation?.country || pkCtx.selectedCountry?.name || 'Sri Lanka',
    provinceOrState: pkCtx.consentedLocation?.province || 'Western Province',
    districtOrCity: pkCtx.consentedLocation?.district || pkCtx.consentedLocation?.city || 'Colombo',
    villageOrArea: pkCtx.consentedLocation?.city || 'Colombo Central',
  }));

  const statuses = [
    { name: 'Your Status', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=YourStatus', ring: true },
    { name: 'Anish', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Anish', ring: true },
    { name: 'Kavi', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Kavi', ring: true },
    { name: 'App Updates', avatar: 'https://api.dicebear.com/9.x/shapes/svg?seed=PKUpdates', ring: true },
    { name: 'Community', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Community', ring: true },
  ];

  const chats: ChatItem[] = [
    {
      id: '1',
      name: 'Jerad prasanth',
      avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Jerad',
      lastMessage: "We're checking how your message delivery is running.",
      time: '10:08 AM',
      badgeText: '1-3',
      category: 'All',
      online: true,
    },
    {
      id: '2',
      name: 'PK Support',
      avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=PKSupport',
      lastMessage: 'We can receive messaging and live conversation.',
      time: '10:08 AM',
      badgeText: '1-3',
      category: 'All',
      online: true,
      verified: true,
    },
    {
      id: '3',
      name: 'Aadhil',
      avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Aadhil',
      lastMessage: 'You are now connected in PK Chat.',
      time: '10:08 AM',
      badgeText: '1-3',
      category: 'All',
      online: true,
    },
    {
      id: '4',
      name: 'Devinrannil',
      avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Devin',
      lastMessage: 'Heyo minna 😊 Thanks for sending that update.',
      time: '11:09 AM',
      badgeText: '1-3',
      category: 'All',
      online: true,
    },
    {
      id: '5',
      name: 'PK Live Class Study Group',
      avatar: 'https://api.dicebear.com/9.x/shapes/svg?seed=PKClass',
      lastMessage: 'Today 7:00 PM Live Session · Multi-Language Notes Ready',
      time: '11:15 AM',
      badgeText: 'Group',
      category: 'Groups',
      online: true,
      verified: true,
    },
    {
      id: '6',
      name: 'PK Voice & Video Desk',
      avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Calls',
      lastMessage: 'HD Audio & Video translation enabled · Tap ringtone test',
      time: '11:20 AM',
      badgeText: 'HD',
      category: 'Calls',
      online: true,
    },
    {
      id: '7',
      name: 'Trusted Family SOS Circle',
      avatar: 'https://api.dicebear.com/9.x/shapes/svg?seed=SOSCircle',
      lastMessage: 'Verified local government safety & GPS emergency relay ready.',
      time: 'Active',
      badgeText: 'SOS',
      category: 'SOS',
      online: true,
      verified: true,
    },
  ];

  // Combine verified live disaster alerts (when country matches) + hierarchical sample bulletins
  const allAlerts = useMemo<VerifiedDisasterAlert[]>(() => {
    const liveVerified: VerifiedDisasterAlert[] = (pkCtx.disasterAlerts || [])
      .filter((d) => Boolean(d.officialSource && d.officialSource.trim()))
      .map((d) => ({
        id: d.alertId,
        title: d.title,
        country: d.country || userLocation.country,
        provinceOrState: 'all',
        districtOrCity: 'all',
        villageOrArea: 'all',
        governmentSource: d.officialSource,
        isOfficialVerified: true,
        timestamp: d.issuedAt || 'Verified Official Bulletin',
      }));
    return [...liveVerified, ...SAMPLE_VERIFIED_ALERTS];
  }, [pkCtx.disasterAlerts, userLocation.country]);

  const verifiedAlerts = useMemo(
    () => getVerifiedLocationAlerts(allAlerts, userLocation),
    [allAlerts, userLocation]
  );

  const activeFestivals = useMemo(() => resolveFestivalGreetings(new Date()), []);

  useEffect(() => {
    return () => soundEngineRef.current?.stopIncomingRingtone();
  }, []);

  const visibleChats = chats.filter((c) => {
    const matchesFilter = activeFilter === 'All' ? c.category === 'All' : c.category === activeFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleRingtone = () => {
    if (!soundEngineRef.current) return;
    if (isRinging) {
      soundEngineRef.current.stopIncomingRingtone();
      setIsRinging(false);
    } else {
      soundEngineRef.current.startIncomingRingtone();
      setIsRinging(true);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#041326] text-white flex flex-col justify-center items-center p-3">
      {/* Mirror Phone Frame */}
      <div className="w-full max-w-[420px] rounded-[42px] border-[3px] border-cyan-400/40 bg-gradient-to-b from-[#082952] via-[#061c38] to-[#030e1d] shadow-[0_0_50px_rgba(0,180,255,0.25)] overflow-hidden flex flex-col">
        {/* Top Header */}
        <header className="px-4 pt-5 pb-3 flex items-center justify-between border-b border-cyan-400/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-300/60 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.6)]">
              🌐
            </div>
            <span className="text-xl font-bold tracking-wide text-white">PK Chat</span>
          </div>
          <div className="flex items-center gap-2 text-cyan-200">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen((prev) => !prev)}
              className="p-1.5 rounded-full hover:bg-white/10"
              title="Search Mirror Chats"
            >
              🔍
            </button>
            <button
              type="button"
              aria-label="Ringtone Test"
              onClick={toggleRingtone}
              className="p-1.5 rounded-full hover:bg-white/10"
              title={isRinging ? 'Stop PK Chat Ringtone' : 'Test PK Chat Ringtone'}
            >
              {isRinging ? '🔕' : '🔔'}
            </button>
            <button
              type="button"
              aria-label="Open Full PK Chat Workspace"
              onClick={() => pkCtx.setActiveScreen('chat_list')}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/20 border border-cyan-300/40 text-cyan-100 hover:bg-cyan-500/30"
              title="Return to Main PK Chat Workspace"
            >
              Full App
            </button>
          </div>
        </header>

        {/* Search & Location Switcher */}
        {searchOpen && (
          <div className="px-4 py-2 bg-[#061d3a] border-b border-cyan-400/15 space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts or messages..."
              className="w-full px-3 py-1.5 rounded-xl bg-white/10 border border-cyan-400/30 text-xs text-white placeholder:text-cyan-200/60 focus:outline-none focus:border-cyan-300"
            />
            <div className="flex gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  setUserLocation({
                    country: 'Sri Lanka',
                    provinceOrState: 'Western Province',
                    districtOrCity: 'Colombo',
                    villageOrArea: 'Colombo Central',
                  })
                }
                className={`px-2 py-1 rounded-lg border ${
                  userLocation.districtOrCity === 'Colombo'
                    ? 'bg-cyan-500/30 border-cyan-300 text-white'
                    : 'bg-white/5 border-cyan-400/20 text-cyan-200'
                }`}
              >
                Colombo Alerts
              </button>
              <button
                type="button"
                onClick={() =>
                  setUserLocation({
                    country: 'Sri Lanka',
                    provinceOrState: 'Northern Province',
                    districtOrCity: 'Jaffna',
                    villageOrArea: 'Jaffna Town',
                  })
                }
                className={`px-2 py-1 rounded-lg border ${
                  userLocation.districtOrCity === 'Jaffna'
                    ? 'bg-cyan-500/30 border-cyan-300 text-white'
                    : 'bg-white/5 border-cyan-400/20 text-cyan-200'
                }`}
              >
                Jaffna Alerts
              </button>
            </div>
          </div>
        )}

        {/* Status Strip */}
        <section className="px-3 py-3">
          <div className="flex items-start justify-between gap-2 overflow-x-auto no-scrollbar">
            {statuses.map((st) => (
              <div key={st.name} className="flex flex-col items-center min-w-[64px]">
                <div className="relative w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-cyan-400 to-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.55)]">
                  <img
                    src={st.avatar}
                    alt={st.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover bg-[#0a2a52]"
                  />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-[#061c38]" />
                </div>
                <span className="mt-1.5 text-[11px] text-cyan-100/90 truncate max-w-[66px]">
                  {st.name}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-center">
            <span className="w-8 h-1 rounded-full bg-cyan-400/70" />
          </div>
        </section>

        {/* Filter Pills: All | Groups | Calls | SOS */}
        <div className="px-4 pb-3 flex items-center justify-between gap-2">
          {(['All', 'Groups', 'Calls', 'SOS'] as const).map((pill) => {
            const active = activeFilter === pill;
            return (
              <button
                key={pill}
                type="button"
                onClick={() => {
                  setActiveFilter(pill);
                  soundEngineRef.current?.playNotificationTone();
                }}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition border ${
                  active
                    ? 'bg-cyan-400/25 border-cyan-300 text-white shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                    : 'bg-white/5 border-cyan-400/25 text-cyan-100/80 hover:bg-white/10'
                }`}
              >
                {pill}
              </button>
            );
          })}
        </div>

        {/* Verified Location Alert Banner (Only Official Government Verified) */}
        {verifiedAlerts.length > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-2xl bg-sky-950/80 border border-cyan-400/40 text-xs">
            <div className="flex items-center justify-between text-cyan-300 font-semibold">
              <span>
                🛡️ {userLocation.districtOrCity}, {userLocation.country} ({userLocation.villageOrArea})
              </span>
              <span>OFFICIAL</span>
            </div>
            <p className="mt-1 text-white/95">{verifiedAlerts[0].title}</p>
            <p className="text-[10px] text-cyan-200/80 mt-0.5">
              Source: {verifiedAlerts[0].governmentSource}
            </p>
          </div>
        )}

        {/* Active Festival Greeting Banner */}
        {activeFestivals.length > 0 && (
          <div className="mx-4 mb-2 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-300/30 text-[11px] text-cyan-100">
            🎉 {activeFestivals[0].occasion}: {activeFestivals[0].message}
          </div>
        )}

        {/* Chat Cards List */}
        <main className="px-4 space-y-2.5 flex-1 overflow-y-auto pb-3">
          {visibleChats.map((chat) => (
            <div
              key={chat.id}
              className="relative rounded-2xl bg-gradient-to-r from-[#0e3869]/75 to-[#082242]/75 border border-cyan-400/35 p-3 shadow-[inset_0_0_14px_rgba(56,189,248,0.18)]"
            >
              {/* Top-right Security Secured Tag */}
              <div className="flex justify-end mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#061a33] border border-cyan-400/40 text-cyan-200">
                  🔒 Security Secured
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-full p-[2px] bg-cyan-400/70 shrink-0">
                  <img
                    src={chat.avatar}
                    alt={chat.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover bg-[#071c36]"
                  />
                  {chat.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#082242]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 truncate">
                      <span className="font-semibold text-sm text-white truncate">{chat.name}</span>
                      {chat.verified && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-400 text-[#041326] text-[10px] font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-cyan-200/80 shrink-0">{chat.time}</span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-cyan-100/85 line-clamp-2">{chat.lastMessage}</p>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 border border-cyan-300/40 text-cyan-200 shrink-0">
                      {chat.badgeText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </main>

        {/* Bottom Glass Navigation Bar */}
        <nav className="mx-3 mb-3 px-2 py-2 rounded-3xl bg-[#0a284d]/85 backdrop-blur-md border border-cyan-400/35 flex items-center justify-around">
          {(
            [
              { key: 'Chats', icon: '💬', filter: 'All' as const },
              { key: 'Status', icon: '⭕', filter: 'Groups' as const },
              { key: 'Calls', icon: '📞', filter: 'Calls' as const },
              { key: 'SOS & Safety', icon: '🛡️', filter: 'SOS' as const },
            ] as const
          ).map((item) => {
            const isSelected = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveTab(item.key);
                  setActiveFilter(item.filter);
                  soundEngineRef.current?.playNotificationTone();
                }}
                className={`flex flex-col items-center px-3 py-1 rounded-2xl transition ${
                  isSelected
                    ? 'bg-cyan-400/25 border border-cyan-300/60 shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                    : 'opacity-80 hover:opacity-100'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-[11px] font-medium mt-0.5 text-cyan-50">{item.key}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default PKChatMirrorApp;
