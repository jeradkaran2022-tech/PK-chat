/**
 * PK CHAT — Automated Firebase Emulator Security Rules Test Suite
 * Tests both AUTHORIZED (assertSucceeds) and UNAUTHORIZED (assertFails) access
 * across user profiles, chats, messages, translations, audio/video calls,
 * admin privilege boundaries, global security lockdown, and safety collections.
 *
 * Run locally with Java + Firebase CLI installed:
 *   npm run test:rules
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payloadSummary: string;
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on User Profile',
    collection: 'user_profiles',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: '{ uid: "u1", fullName: "Alice", isAdmin: true }',
  },
  {
    id: 2,
    name: 'Ownership Spoofing on Contact Creation',
    collection: 'contacts',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: '{ ownerId: "victim_uid", contactUid: "u2", displayName: "Bob" } as attacker_uid',
  },
  {
    id: 3,
    name: 'Blanket User PII Read',
    collection: 'users',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Non-owner reading /users/victim_uid',
  },
  {
    id: 4,
    name: 'Oversized Document ID Poisoning (1.5KB)',
    collection: 'messages',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Document ID exceeding 128 chars or containing invalid symbols',
  },
  {
    id: 5,
    name: 'Client-Forged Timestamp',
    collection: 'messages',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'createdAt != request.time',
  },
  {
    id: 6,
    name: 'Card Number / CVV Storage Attempt',
    collection: 'payment_records',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: '{ paymentId: "p1", userId: "u1", cardNumber: "4111...", cvv: "123" }',
  },
  {
    id: 7,
    name: 'Self-Assigned Admin Record',
    collection: 'admin_users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Regular user writing /admin_users/attacker_uid',
  },
  {
    id: 8,
    name: 'Fabricated Official Disaster Alert',
    collection: 'disaster_alerts',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Non-admin creating /disaster_alerts/fake_tsunami',
  },
  {
    id: 9,
    name: 'Terminal SOS State Re-Activation',
    collection: 'sos_alerts',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Non-admin changing status from resolved back to active',
  },
  {
    id: 10,
    name: 'Unverified Email Admin Spoof',
    collection: 'admin_users',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Token email matches admin but email_verified == false',
  },
  {
    id: 11,
    name: 'Oversized Message Payload (Denial of Wallet)',
    collection: 'messages',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'originalText.length > 10000',
  },
  {
    id: 12,
    name: 'Unfiltered Collection List Scraping',
    collection: 'messages',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Query without participantIds constraint matching request.auth.uid',
  },
  {
    id: 13,
    name: 'Phone Hash Directory Enumeration',
    collection: 'phone_directory',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Non-admin attempting list() on /phone_directory',
  },
  {
    id: 14,
    name: 'Sender Self-Accepting Contact Request',
    collection: 'contact_requests',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Sender setting status to accepted instead of cancelled',
  },
  {
    id: 15,
    name: 'Ordinary User Altering Global Security Posture',
    collection: 'system_security',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Non-admin setting status to NORMAL on /system_security/global',
  },
  {
    id: 16,
    name: 'Message Sending Blocked During LOCKDOWN',
    collection: 'messages',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Creating /messages/{id} while /system_security/global.status == LOCKDOWN',
  },
  {
    id: 17,
    name: 'Message and User Account Deletion Blocked During LOCKDOWN',
    collection: 'messages',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Deleting /messages/{id} or /users/{uid} during LOCKDOWN',
  },
  {
    id: 18,
    name: 'Non-Admin Listing Global Security Incidents',
    collection: 'security_incidents',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Regular authenticated user listing /security_incidents',
  },
  {
    id: 19,
    name: 'Non-Admin Forging Gmail Approval Decision',
    collection: 'gmail_approvals',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Regular user writing /gmail_approvals/{id} with status approved',
  },
  {
    id: 20,
    name: 'Cross-User Profile Media Mutation',
    collection: 'profile_media',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'attacker_uid attempting update on /profile_media/victim_uid',
  },
  {
    id: 21,
    name: 'Blocked or Hidden Profile Media Access',
    collection: 'profile_media',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Blocked user or non-contact reading /profile_media/{uid} with contacts/nobody visibility',
  },
  {
    id: 22,
    name: 'Caller Self-Accepting Outgoing Call',
    collection: 'calls',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'callerId attempting to set status to accepted on /calls/{callId}',
  },
  {
    id: 23,
    name: 'Re-Activating Terminal Rejected/Ended Call',
    collection: 'calls',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payloadSummary: 'Participant attempting to revert /calls/{callId} from ended back to ringing',
  },
];

const PROJECT_ID = 'pk-chhat';
const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const OWNER_ADMIN_EMAIL = 'jeradkaran2022@gmail.com';
const serverTs = () => firebase.firestore.FieldValue.serverTimestamp();
const futureTs = (offsetMs = 3600_000) =>
  firebase.firestore.Timestamp.fromMillis(Date.now() + offsetMs);

interface TestStats {
  passed: number;
  failed: number;
}

async function runCase(
  stats: TestStats,
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    stats.passed += 1;
    console.log(`PASS: ${label}`);
  } catch (err) {
    stats.failed += 1;
    console.error(`FAIL: ${label}`, err);
  }
}

export async function runFirestoreSecurityTests(): Promise<void> {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
    },
  });

  const stats: TestStats = { passed: 0, failed: 0 };

  const alice = () =>
    testEnv
      .authenticatedContext('alice_uid', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();
  const bob = () =>
    testEnv
      .authenticatedContext('bob_uid', {
        email: 'bob@example.com',
        email_verified: true,
      })
      .firestore();
  const mallory = () =>
    testEnv
      .authenticatedContext('mallory_uid', {
        email: 'mallory@example.com',
        email_verified: true,
      })
      .firestore();
  const unverified = () =>
    testEnv
      .authenticatedContext('unverified_uid', {
        email: 'unverified@example.com',
        email_verified: false,
      })
      .firestore();
  const ownerAdmin = () =>
    testEnv
      .authenticatedContext('owner_admin_uid', {
        email: OWNER_ADMIN_EMAIL,
        email_verified: true,
      })
      .firestore();
  const supportAdmin = () =>
    testEnv
      .authenticatedContext('support_admin_uid', {
        email: 'support@pkchat.app',
        email_verified: true,
      })
      .firestore();
  const spoofedAdmin = () =>
    testEnv
      .authenticatedContext('spoof_admin_uid', {
        email: OWNER_ADMIN_EMAIL,
        email_verified: false,
      })
      .firestore();
  const anon = () => testEnv.unauthenticatedContext().firestore();

  try {
    await testEnv.clearFirestore();

    // Seed baseline data using security rules disabled
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const now = firebase.firestore.Timestamp.now();

      await db.collection('admin_users').doc('support_admin_uid').set({
        uid: 'support_admin_uid',
        email: 'support@pkchat.app',
        role: 'support_admin',
        mfaVerified: true,
        createdAt: now,
      });

      await db.collection('users').doc('alice_uid').set({
        uid: 'alice_uid',
        phoneNumber: '+94770001111',
        email: 'alice@example.com',
        country: 'Sri Lanka',
        countryDialCode: '+94',
        accountStatus: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('user_profiles').doc('alice_uid').set({
        uid: 'alice_uid',
        fullName: 'Alice Jayawardena',
        country: 'Sri Lanka',
        countryCode: 'LK',
        preferredLanguage: 'ta',
        preferredLanguageName: 'Tamil',
        profileVisibility: 'contacts',
        blockedUserIds: ['mallory_uid'],
        onlineStatus: 'online',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('user_profiles').doc('nobody_uid').set({
        uid: 'nobody_uid',
        fullName: 'Private User',
        country: 'Sri Lanka',
        countryCode: 'LK',
        preferredLanguage: 'en',
        preferredLanguageName: 'English',
        profileVisibility: 'nobody',
        blockedUserIds: [],
        onlineStatus: 'offline',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('contacts').doc('cnt_alice_uid_bob_uid').set({
        ownerId: 'alice_uid',
        contactUid: 'bob_uid',
        displayName: 'Bob',
        country: 'India',
        preferredLanguage: 'en',
        blocked: false,
        reported: false,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('profile_media').doc('alice_uid').set({
        userId: 'alice_uid',
        avatarDataUrl: 'https://example.com/alice.png',
        coverDataUrl: '',
        avatarMimeType: 'image/png',
        coverMimeType: '',
        about: 'Hello',
        bio: 'Developer',
        statusMessage: 'Online',
        profileVisibility: 'contacts',
        profilePhotoVisibility: 'contacts',
        aboutVisibility: 'contacts',
        blockedUserIds: ['mallory_uid'],
        syncVersion: 1,
        updatedAt: now,
      });

      await db.collection('chats').doc('chat_alice_uid_bob_uid').set({
        chatId: 'chat_alice_uid_bob_uid',
        participantIds: ['alice_uid', 'bob_uid'],
        createdBy: 'alice_uid',
        e2eeEnabled: true,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('group_chats').doc('grp_team_1').set({
        groupId: 'grp_team_1',
        name: 'PK Core',
        createdBy: 'alice_uid',
        memberIds: ['alice_uid', 'bob_uid'],
        adminIds: ['alice_uid'],
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('messages').doc('msg_seed_1').set({
        messageId: 'msg_seed_1',
        chatId: 'chat_alice_uid_bob_uid',
        chatType: 'direct',
        participantIds: ['alice_uid', 'bob_uid'],
        senderId: 'alice_uid',
        senderName: 'Alice Jayawardena',
        senderLanguage: 'ta',
        messageType: 'text',
        originalText: 'Vanakkam Bob',
        e2eeEnabled: true,
        deleted: false,
        deliveredTo: ['alice_uid'],
        readBy: ['alice_uid'],
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('sos_alerts').doc('sos_resolved_1').set({
        alertId: 'sos_resolved_1',
        userId: 'alice_uid',
        userName: 'Alice Jayawardena',
        status: 'resolved',
        alertOrigin: 'user_generated',
        emergencyServicesNotified: false,
        shareLiveLocation: false,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('calls').doc('call_ended_1').set({
        callId: 'call_ended_1',
        callerId: 'alice_uid',
        receiverId: 'bob_uid',
        callerName: 'Alice Jayawardena',
        receiverName: 'Bob',
        callType: 'video',
        status: 'ended',
        expiresAt: new Date(Date.now() + 45_000).toISOString(),
        createdAt: now,
        updatedAt: now,
        endedAt: now,
      });

      await db.collection('system_security').doc('global').set({
        stateId: 'global',
        status: 'NORMAL',
        threatLevel: 'low',
        reasonCode: 'BASELINE',
        restrictLogin: false,
        restrictMessages: false,
        restrictAccountChanges: false,
        restrictCalls: false,
        recheckIntervalSeconds: 30,
        threatResolved: true,
        updatedBy: 'owner_admin_uid',
        updatedAt: now,
      });
    });

    // --- 1. User Accounts, Profiles & Private Media ---
    await runCase(stats, 'Authorized: Owner reads own /users PII record', async () => {
      await assertSucceeds(alice().collection('users').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Unauthenticated user denied reading /users', async () => {
      await assertFails(anon().collection('users').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Non-owner denied reading /users/alice_uid', async () => {
      await assertFails(bob().collection('users').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Non-admin denied listing /users', async () => {
      await assertFails(alice().collection('users').limit(10).get());
    });

    await runCase(stats, 'Unauthorized: Shadow field isAdmin rejected on /user_profiles', async () => {
      await assertFails(
        mallory().collection('user_profiles').doc('mallory_uid').set({
          uid: 'mallory_uid',
          fullName: 'Mallory',
          country: 'US',
          countryCode: 'US',
          preferredLanguage: 'en',
          preferredLanguageName: 'English',
          onlineStatus: 'online',
          isAdmin: true,
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Verified user lists /user_profiles with limit(50)', async () => {
      await assertSucceeds(bob().collection('user_profiles').limit(50).get());
    });

    await runCase(stats, 'Unauthorized: Unbounded /user_profiles scan without limit blocked', async () => {
      await assertFails(bob().collection('user_profiles').get());
    });

    await runCase(stats, 'Unauthorized: Blocked user denied get on /user_profiles/alice_uid', async () => {
      await assertFails(mallory().collection('user_profiles').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Nobody visibility profile denied to other users', async () => {
      await assertFails(bob().collection('user_profiles').doc('nobody_uid').get());
    });

    await runCase(stats, 'Authorized: Contact reads contacts-only /profile_media/alice_uid', async () => {
      await assertSucceeds(bob().collection('profile_media').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Blocked non-contact denied /profile_media/alice_uid', async () => {
      await assertFails(mallory().collection('profile_media').doc('alice_uid').get());
    });

    await runCase(stats, 'Unauthorized: Cross-user mutation of /profile_media denied', async () => {
      await assertFails(
        mallory().collection('profile_media').doc('alice_uid').update({
          about: 'Hacked',
          updatedAt: serverTs(),
        })
      );
    });

    // --- 2. Chats, Group Chats, Messages & Translations ---
    await runCase(stats, 'Authorized: Participant reads direct chat and sends valid message', async () => {
      await assertSucceeds(bob().collection('chats').doc('chat_alice_uid_bob_uid').get());
      await assertSucceeds(
        bob().collection('messages').doc('msg_bob_1').set({
          messageId: 'msg_bob_1',
          chatId: 'chat_alice_uid_bob_uid',
          chatType: 'direct',
          participantIds: ['alice_uid', 'bob_uid'],
          senderId: 'bob_uid',
          senderName: 'Bob',
          senderLanguage: 'en',
          messageType: 'text',
          originalText: 'Hello Alice!',
          e2eeEnabled: true,
          deleted: false,
          deliveredTo: ['bob_uid'],
          readBy: ['bob_uid'],
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Recipient appends own UID to readBy / deliveredTo', async () => {
      await assertSucceeds(
        bob().collection('messages').doc('msg_seed_1').update({
          deliveredTo: ['alice_uid', 'bob_uid'],
          readBy: ['alice_uid', 'bob_uid'],
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Sender soft-deletes own message', async () => {
      await assertSucceeds(
        alice().collection('messages').doc('msg_seed_1').update({
          deleted: true,
          originalText: 'This message was deleted.',
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Participant creates linked translated_message', async () => {
      await assertSucceeds(
        bob().collection('translated_messages').doc('tr_msg_bob_1_alice').set({
          messageId: 'msg_bob_1',
          chatId: 'chat_alice_uid_bob_uid',
          targetUserId: 'alice_uid',
          participantIds: ['alice_uid', 'bob_uid'],
          sourceLanguage: 'en',
          targetLanguage: 'ta',
          translatedText: 'வணக்கம் ஆலிஸ்!',
          engine: 'gemini-2.5-flash',
          createdAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Non-participant denied reading direct chat & message', async () => {
      await assertFails(mallory().collection('chats').doc('chat_alice_uid_bob_uid').get());
      await assertFails(mallory().collection('messages').doc('msg_seed_1').get());
      await assertFails(
        mallory()
          .collection('translated_messages')
          .where('participantIds', 'array-contains', 'alice_uid')
          .get()
      );
    });

    await runCase(stats, 'Unauthorized: Non-participant denied injecting message into existing chat', async () => {
      await assertFails(
        mallory().collection('messages').doc('msg_forged_1').set({
          messageId: 'msg_forged_1',
          chatId: 'chat_alice_uid_bob_uid',
          chatType: 'direct',
          participantIds: ['alice_uid', 'bob_uid', 'mallory_uid'],
          senderId: 'mallory_uid',
          senderName: 'Mallory',
          senderLanguage: 'en',
          messageType: 'text',
          originalText: 'Injected!',
          e2eeEnabled: false,
          deleted: false,
          deliveredTo: ['mallory_uid'],
          readBy: ['mallory_uid'],
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Non-participant denied deleting or editing someone else message', async () => {
      await assertFails(
        bob().collection('messages').doc('msg_seed_1').update({
          deleted: true,
          originalText: 'Tampered',
          updatedAt: serverTs(),
        })
      );
      await assertFails(alice().collection('messages').doc('msg_seed_1').delete());
    });

    await runCase(stats, 'Unauthorized: Unfiltered messages list & forged timestamp blocked', async () => {
      await assertFails(mallory().collection('messages').limit(10).get());
      await assertFails(
        alice().collection('messages').doc('msg_bad_ts').set({
          messageId: 'msg_bad_ts',
          chatId: 'chat_alice_uid_bob_uid',
          chatType: 'direct',
          participantIds: ['alice_uid', 'bob_uid'],
          senderId: 'alice_uid',
          senderName: 'Alice',
          senderLanguage: 'ta',
          messageType: 'text',
          originalText: 'Backdated',
          e2eeEnabled: true,
          deleted: false,
          createdAt: firebase.firestore.Timestamp.fromMillis(1_000_000),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Spoofing typingUserId or lastSenderId in chat blocked', async () => {
      await assertFails(
        bob().collection('chats').doc('chat_alice_uid_bob_uid').update({
          typingUserId: 'alice_uid',
          updatedAt: serverTs(),
        })
      );
    });

    // --- 3. Audio & Video Calls (calls & call_records) ---
    await runCase(stats, 'Authorized: Caller starts call, receiver accepts, participant ends', async () => {
      await assertSucceeds(
        bob().collection('calls').doc('call_live_1').set({
          callId: 'call_live_1',
          callerId: 'bob_uid',
          receiverId: 'alice_uid',
          callerName: 'Bob',
          receiverName: 'Alice',
          callType: 'audio',
          status: 'ringing',
          expiresAt: new Date(Date.now() + 45_000).toISOString(),
          createdAt: serverTs(),
          updatedAt: serverTs(),
          endedAt: null,
        })
      );
      await assertSucceeds(
        alice().collection('calls').doc('call_live_1').update({
          status: 'accepted',
          updatedAt: serverTs(),
        })
      );
      await assertSucceeds(
        bob().collection('calls').doc('call_live_1').update({
          status: 'ended',
          endedAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Caller creates call_record and participant updates answer', async () => {
      await assertSucceeds(
        alice().collection('call_records').doc('rec_1').set({
          callId: 'rec_1',
          callerId: 'alice_uid',
          callerName: 'Alice',
          participantIds: ['alice_uid', 'bob_uid'],
          callType: 'video',
          status: 'ringing',
          sourceLanguage: 'ta',
          targetLanguage: 'en',
          durationSeconds: 0,
          offerSdp: 'v=0-offer',
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
      await assertSucceeds(
        bob().collection('call_records').doc('rec_1').update({
          status: 'active',
          answerSdp: 'v=0-answer',
          durationSeconds: 12,
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Blocked caller denied starting /calls invite to Alice', async () => {
      await assertFails(
        mallory().collection('calls').doc('call_spam_1').set({
          callId: 'call_spam_1',
          callerId: 'mallory_uid',
          receiverId: 'alice_uid',
          callType: 'audio',
          status: 'ringing',
          expiresAt: new Date(Date.now() + 45_000).toISOString(),
          createdAt: serverTs(),
          updatedAt: serverTs(),
          endedAt: null,
        })
      );
    });

    await runCase(stats, 'Unauthorized: Caller self-accept & terminal call reactivation blocked', async () => {
      await assertSucceeds(
        alice().collection('calls').doc('call_live_2').set({
          callId: 'call_live_2',
          callerId: 'alice_uid',
          receiverId: 'bob_uid',
          callType: 'audio',
          status: 'ringing',
          expiresAt: new Date(Date.now() + 45_000).toISOString(),
          createdAt: serverTs(),
          updatedAt: serverTs(),
          endedAt: null,
        })
      );
      await assertFails(
        alice().collection('calls').doc('call_live_2').update({
          status: 'accepted',
          updatedAt: serverTs(),
        })
      );
      await assertFails(
        bob().collection('calls').doc('call_ended_1').update({
          status: 'ringing',
          updatedAt: serverTs(),
        })
      );
      await assertFails(mallory().collection('call_records').doc('rec_1').get());
    });

    // --- 4. Admin Privilege Protection, Security Lockdown & Compliance ---
    await runCase(stats, 'Unauthorized: Ordinary user & support_admin denied writing /admin_users', async () => {
      await assertFails(
        mallory().collection('admin_users').doc('mallory_uid').set({
          uid: 'mallory_uid',
          email: 'mallory@example.com',
          role: 'owner',
          mfaVerified: true,
          createdAt: serverTs(),
        })
      );
      await assertFails(
        supportAdmin().collection('admin_users').doc('mallory_uid').set({
          uid: 'mallory_uid',
          email: 'mallory@example.com',
          role: 'owner',
          mfaVerified: true,
          createdAt: serverTs(),
        })
      );
      await assertFails(supportAdmin().collection('admin_users').doc('support_admin_uid').delete());
      await assertFails(spoofedAdmin().collection('admin_users').limit(10).get());
    });

    await runCase(stats, 'Authorized: Owner admin manages /admin_users & triggers LOCKDOWN', async () => {
      await assertSucceeds(
        ownerAdmin().collection('admin_users').doc('new_sec_admin').set({
          uid: 'new_sec_admin',
          email: 'sec@pkchat.app',
          role: 'security_admin',
          mfaVerified: true,
          createdAt: serverTs(),
        })
      );
      await assertSucceeds(
        ownerAdmin().collection('system_security').doc('global').update({
          status: 'LOCKDOWN',
          threatLevel: 'critical',
          reasonCode: 'TEST_LOCKDOWN',
          restrictMessages: true,
          restrictCalls: true,
          threatResolved: false,
          updatedBy: 'owner_admin_uid',
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Ordinary user blocked from altering security, sending during LOCKDOWN', async () => {
      await assertFails(
        mallory().collection('system_security').doc('global').update({
          status: 'NORMAL',
          updatedAt: serverTs(),
        })
      );
      await assertFails(mallory().collection('security_incidents').limit(10).get());
      await assertFails(
        mallory().collection('gmail_approvals').doc('fake_app').set({
          approvalId: 'fake_app',
          incidentId: 'inc_1',
          ownerEmail: OWNER_ADMIN_EMAIL,
          actionId: 'VERIFY_AND_RECOVER',
          status: 'approved',
          expiresAt: futureTs(),
          createdAt: serverTs(),
        })
      );
      await assertFails(
        alice().collection('messages').doc('msg_during_lockdown').set({
          messageId: 'msg_during_lockdown',
          chatId: 'chat_alice_uid_bob_uid',
          chatType: 'direct',
          participantIds: ['alice_uid', 'bob_uid'],
          senderId: 'alice_uid',
          senderName: 'Alice',
          senderLanguage: 'ta',
          messageType: 'text',
          originalText: 'Blocked by lockdown',
          e2eeEnabled: true,
          deleted: false,
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Unauthorized: Unverified user, CVV injection, terminal SOS tamper, disaster spoof', async () => {
      await assertFails(
        unverified().collection('users').doc('unverified_uid').set({
          uid: 'unverified_uid',
          country: 'LK',
          countryDialCode: '+94',
          accountStatus: 'active',
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
      await assertFails(
        alice().collection('payment_records').doc('pay_bad_1').set({
          paymentId: 'pay_bad_1',
          userId: 'alice_uid',
          amountUsd: 5,
          currency: 'USD',
          status: 'succeeded_test',
          provider: 'test_mode_gateway',
          description: 'Pro Plan',
          cardNumber: '4111111111111111',
          createdAt: serverTs(),
        })
      );
      await assertFails(
        alice().collection('sos_alerts').doc('sos_resolved_1').update({
          status: 'active',
          updatedAt: serverTs(),
        })
      );
      await assertFails(
        mallory().collection('disaster_alerts').doc('fake_tsunami').set({
          alertId: 'fake_tsunami',
          hazardType: 'tsunami',
          title: 'Fake Alert',
          officialSource: 'Fake',
          location: 'Coast',
          severity: 'extreme',
          issuedAt: serverTs(),
          status: 'active',
          verifiedOfficial: true,
        })
      );
      await assertFails(mallory().collection('phone_directory').limit(10).get());
    });

    await runCase(stats, 'Unauthorized: Blocked user cannot send contact_requests or create direct chat with blocker', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const adm = ctx.firestore();
        await adm.collection('profile_media').doc('bob_uid').set({
          userId: 'bob_uid',
          avatarDataUrl: '',
          coverDataUrl: '',
          avatarMimeType: '',
          coverMimeType: '',
          about: 'Hi',
          bio: '',
          statusMessage: '',
          profileVisibility: 'everyone',
          profilePhotoVisibility: 'everyone',
          aboutVisibility: 'everyone',
          blockedUserIds: ['mallory_uid'],
          syncVersion: 1,
          updatedAt: new Date(),
        });
      });

      await assertFails(
        mallory().collection('contact_requests').doc('req_blocked_1').set({
          requestId: 'req_blocked_1',
          senderId: 'mallory_uid',
          senderName: 'Mallory',
          senderCountry: 'UK',
          senderPreferredLanguage: 'en',
          senderPreferredLanguageName: 'English',
          receiverId: 'bob_uid',
          receiverName: 'Bob',
          status: 'pending',
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );

      await assertFails(
        mallory().collection('chats').doc('chat_mallory_bob_blocked').set({
          chatId: 'chat_mallory_bob_blocked',
          participantIds: ['mallory_uid', 'bob_uid'],
          createdBy: 'mallory_uid',
          e2eeEnabled: true,
          createdAt: serverTs(),
          updatedAt: serverTs(),
        })
      );
    });

    await runCase(stats, 'Authorized: Mixed-case verified owner email retains admin privileges', async () => {
      const mixedCaseOwner = testEnv
        .authenticatedContext('mixed_owner_uid', {
          email: 'JeradPrasanth27@gmail.com',
          email_verified: true,
        })
        .firestore();
      await assertSucceeds(mixedCaseOwner.collection('admin_users').limit(5).get());
    });

    await runCase(stats, 'Authorized/Unauthorized: Phone number uniqueness & privacy in phone_directory', async () => {
      const hashAlice = '1111111111111111111111111111111111111111111111111111111111111111';
      await assertSucceeds(
        alice().collection('phone_directory').doc(hashAlice).set({
          phoneHash: hashAlice,
          userId: 'alice_uid',
          fullName: 'Alice',
          country: 'Sri Lanka',
          preferredLanguage: 'en',
          preferredLanguageName: 'English',
          discoverable: false,
          updatedAt: serverTs(),
        })
      );

      // Non-discoverable phone hash metadata must remain private from other users
      await assertFails(bob().collection('phone_directory').doc(hashAlice).get());

      // Another user cannot overwrite, steal, or delete Alice's registered phone number hash
      await assertFails(
        bob().collection('phone_directory').doc(hashAlice).set({
          phoneHash: hashAlice,
          userId: 'bob_uid',
          fullName: 'Bob',
          country: 'Sri Lanka',
          preferredLanguage: 'en',
          preferredLanguageName: 'English',
          discoverable: true,
          updatedAt: serverTs(),
        })
      );
      await assertFails(
        bob().collection('phone_directory').doc(hashAlice).update({
          discoverable: true,
          updatedAt: serverTs(),
        })
      );
      await assertFails(bob().collection('phone_directory').doc(hashAlice).delete());

      // Owner Alice can update visibility or release her old phone hash when changing numbers
      await assertSucceeds(
        alice().collection('phone_directory').doc(hashAlice).update({
          discoverable: true,
          updatedAt: serverTs(),
        })
      );
      await assertSucceeds(bob().collection('phone_directory').doc(hashAlice).get());
      await assertSucceeds(alice().collection('phone_directory').doc(hashAlice).delete());
    });

    // --- 5. WhatsApp-style Status / Updates Security ---
    await runCase(stats, 'Authorized & Unauthorized: Status 24h privacy, view receipts, reactions & delete', async () => {
      await assertSucceeds(
        ownerAdmin().collection('system_security').doc('global').update({
          status: 'NORMAL',
          restrictMessages: false,
          restrictCalls: false,
          threatResolved: true,
          updatedBy: 'owner_admin_uid',
          updatedAt: serverTs(),
        })
      );

      await assertSucceeds(
        alice().collection('statuses').doc('stat_alice_1').set({
          statusId: 'stat_alice_1',
          userId: 'alice_uid',
          authorName: 'Alice Jayawardena',
          mediaType: 'text',
          textContent: 'Good morning PK CHAT!',
          backgroundColor: '#075E54',
          fontStyle: 'sans',
          privacyMode: 'only_share_with',
          authorizedViewerIds: ['alice_uid', 'bob_uid'],
          excludedViewerIds: [],
          allowedViewerIds: ['bob_uid'],
          viewedByUids: [],
          viewers: [],
          reactions: [],
          createdAt: serverTs(),
          expiresAt: futureTs(24 * 3600 * 1000),
        })
      );

      // Selected contact Bob can read and mark viewed + react
      await assertSucceeds(bob().collection('statuses').doc('stat_alice_1').get());
      await assertSucceeds(
        bob().collection('statuses').doc('stat_alice_1').update({
          viewedByUids: ['bob_uid'],
          viewers: [{ viewerId: 'bob_uid', viewerName: 'Bob', viewedAt: new Date().toISOString() }],
          reactions: [{ userId: 'bob_uid', userName: 'Bob', emoji: '❤️', reactedAt: new Date().toISOString() }],
        })
      );

      // Unauthorized user Mallory cannot read or react or delete
      await assertFails(mallory().collection('statuses').doc('stat_alice_1').get());
      await assertFails(
        mallory().collection('statuses').doc('stat_alice_1').update({
          viewedByUids: ['bob_uid', 'mallory_uid'],
        })
      );
      await assertFails(bob().collection('statuses').doc('stat_alice_1').delete());

      // Bob cannot tamper with Alice status textContent
      await assertFails(
        bob().collection('statuses').doc('stat_alice_1').update({
          textContent: 'Hacked text!',
        })
      );

      // Owner Alice can delete her own status
      await assertSucceeds(alice().collection('statuses').doc('stat_alice_1').delete());
    });

    // --- 6. QR Token Security (Zero PII, Capability-Based Lookup, Terminal Revocation) ---
    await runCase(stats, 'Authorized & Unauthorized: qr_tokens capability create, lookup, revoke & lock', async () => {
      await assertSucceeds(
        alice().collection('qr_tokens').doc('qr_alice_1').set({
          tokenId: 'qr_alice_1',
          userId: 'alice_uid',
          fullName: 'Alice Jayawardena',
          country: 'Sri Lanka',
          countryCode: 'LK',
          preferredLanguage: 'si',
          preferredLanguageName: 'Sinhala',
          about: 'Available on PK Chat',
          status: 'active',
          issuedAt: serverTs(),
          expiresAt: futureTs(365 * 24 * 3600 * 1000),
          updatedAt: serverTs(),
        })
      );

      // Authenticated scanner Bob can look up specific active QR token
      await assertSucceeds(bob().collection('qr_tokens').doc('qr_alice_1').get());

      // Attacker Mallory cannot list other users' QR tokens or inject PII/tamper
      await assertFails(mallory().collection('qr_tokens').get());
      await assertFails(
        mallory().collection('qr_tokens').doc('qr_alice_1').update({
          about: 'Hijacked',
          updatedAt: serverTs(),
        })
      );

      // Owner Alice can revoke token cleanly; terminal revoked state locks further updates
      await assertSucceeds(
        alice().collection('qr_tokens').doc('qr_alice_1').update({
          status: 'revoked',
          updatedAt: serverTs(),
        })
      );
      await assertFails(
        alice().collection('qr_tokens').doc('qr_alice_1').update({
          status: 'active',
          updatedAt: serverTs(),
        })
      );
      await assertFails(bob().collection('qr_tokens').doc('qr_alice_1').get());

      // Owner Alice can delete her revoked token
      await assertSucceeds(alice().collection('qr_tokens').doc('qr_alice_1').delete());
    });

    console.log(`\nSecurity Test Summary: ${stats.passed} passed, ${stats.failed} failed.`);
    assert.equal(stats.failed, 0, `${stats.failed} security rules tests failed`);
  } finally {
    await testEnv.cleanup();
  }
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('firestore.rules.test.ts');

if (isDirectRun) {
  runFirestoreSecurityTests().catch((err) => {
    console.error('Firestore rules unit test execution failed:', err);
    process.exit(1);
  });
}
