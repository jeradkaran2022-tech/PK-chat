# PK CHAT – Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: Private phone numbers, email addresses, and account recovery metadata reside in `/users/{userId}` and `/emergency_contacts/{contactId}`, readable and writable ONLY by the owning user (`request.auth.uid == userId`) or a verified administrator (`isAdmin()`). Public-facing profile records in `/user_profiles/{userId}` contain zero phone/email PII.
2. **Identity Integrity**: Every user-owned document (`user_devices`, `language_preferences`, `contacts`, `user_settings`, `subscriptions`, `payment_records`, `emergency_contacts`, `sos_alerts`, `notifications`, `security_logs`) must enforce `incoming().userId == request.auth.uid` (or `ownerId` / `senderId`) on creation and prevent ownership transfer (`incoming().userId == existing().userId`) on update.
3. **Path Variable Hardening**: All single-document `get`, `create`, `update`, and `delete` operations validate document IDs against `^[a-zA-Z0-9_-]+$` with max length 128 characters.
4. **Chat & Group Participation Gate**: Messages in `/messages/{messageId}` and translations in `/translated_messages/{translationId}` can only be read or created by verified participants listed in `participantIds` (bounded `<= 50`) or `targetUserId == request.auth.uid`.
5. **Immutable Audit & Financial Integrity**: `createdAt` timestamps are immutable and verified against `request.time` on creation. Subscription `payment_records` never store raw card numbers or CVV (`!('cardNumber' in data) && !('cvv' in data)`).
6. **Privilege Escalation Guard**: Users cannot self-assign admin roles in `/admin_users/{adminUid}` or inject shadow fields (`role`, `isAdmin`, `verifiedOfficial`) via `keys().hasOnly(...)` allowlists.
7. **Terminal State Locking**: Once an `sos_alerts` record reaches `resolved` or `cancelled`, or a `call_records` session reaches `ended` or `missed`, non-admin users cannot mutate it back to an active state.
11. **Query Enforcement**: Every `allow list` rule evaluates `resource.data` against `request.auth.uid` (or `isAdmin()`) without `get()`/`exists()` calls, preventing unauthorized collection scraping and O(n) read amplification.
12. **Zero-Trust Hashed Phone Discovery**: `/phone_directory/{phoneHash}` stores irreversible SHA-256 hashes (64-char hex, zero raw phone numbers), disables client `list` scraping, and allows instant owner deletion/opt-out. `/contact_requests/{requestId}` enforces sender/receiver-only visibility and terminal-state locking once `accepted`, `cancelled`, or `declined`.
13. **Server/Admin-Only Security Posture**: `/system_security/{docId}`, `/security_incidents/{incidentId}`, `/security_audit_logs/{auditId}`, and `/gmail_approvals/{approvalId}` are never writable by ordinary users (`isAdmin()` only; audit logs append-only with `update: if false, delete: if false`).
14. **Emergency Lockdown Enforcement**: When `/system_security/global` has `status == 'LOCKDOWN'`, dangerous mutations (`messages`, `call_records`, account PII changes on `users`, `user_devices`, `user_settings`, `contact_requests`, `phone_directory`) are blocked at the database layer (`!isSystemLockedDown() || isAdmin()`).
15. **Zero-Deletion Guarantee During Lockdown**: Messages (`/messages`, `/chats`, `/group_chats`) and user accounts (`/users`, `/user_profiles`) can NEVER be deleted during `LOCKDOWN`, even by administrators (`&& !isSystemLockedDown()`).
16. **Owner-Verified Approvals**: Only authenticated owner emails (`jeradkaran2022@gmail.com`, `Jeradprasanth27@gmail.com`) with `email_verified == true` can manage `/gmail_approvals` or execute allowlisted remediations.
17. **1-to-1 Call Signal Role Enforcement**: In `/calls/{callId}`, only `callerId` can initiate `ringing` calls (`callerId == request.auth.uid && receiverId != request.auth.uid`), only `receiverId` can transition `ringing` to `accepted` or `rejected`, either participant can transition an active/ringing call to `ended`, and terminal states (`rejected`, `ended`) are permanently locked.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on User Profile**: `{ "uid": "u1", "fullName": "Alice", "isAdmin": true }` -> Rejected by `keys().hasOnly(...)`.
2. **Ownership Spoofing on Contact Creation**: `{ "ownerId": "victim_uid", "contactUid": "u2", "displayName": "Bob", ... }` sent by `attacker_uid` -> Rejected by `incoming().ownerId == request.auth.uid`.
3. **Blanket User PII Read**: Unauthenticated or cross-user `get(/users/victim_uid)` -> Rejected by `isOwner(userId) || isAdmin()`.
4. **1.5KB Document ID Poisoning**: Creating `/messages/<1500-char-id>` -> Rejected by `isValidId(messageId)`.
5. **Client-Forged Timestamp**: `{ ..., "createdAt": "2020-01-01T00:00:00Z" }` -> Rejected by `incoming().createdAt == request.time`.
6. **Card Number / CVV Storage Attempt**: `{ "userId": "u1", "cardNumber": "4111...", "cvv": "123", ... }` on `/payment_records/{id}` -> Rejected by `keys().hasOnly(...)`.
7. **Self-Assigned Admin Record**: Authenticated non-admin writing `/admin_users/attacker_uid` -> Rejected by `isAdmin()`.
8. **Fabricated Official Disaster Alert**: Non-admin creating `/disaster_alerts/fake_tsunami` -> Rejected by `isAdmin()`.
9. **Terminal State Re-Activation**: Updating an `sos_alerts` doc from `status: "resolved"` back to `status: "active"` by non-admin -> Rejected by terminal state guard.
10. **Unverified Email Admin Spoof**: Token with `email: "jeradkaran2022@gmail.com"` and `email_verified: false` -> Rejected by `request.auth.token.email_verified == true`.
11. **Oversized Message Payload (Denial of Wallet)**: Sending `/messages/{id}` with `originalText` > 10,000 characters -> Rejected by `.size() <= 10000`.
12. **Unfiltered List Scraping**: Querying `/messages` or `/phone_directory` without owner/participant constraint -> Rejected by `allow list`.
13. **Phone Hash Directory Scraping**: Listing `/phone_directory` as a regular user -> Rejected by `allow list: if isAdmin()`.
14. **Self-Accepting Own Contact Request**: Sender attempting to update `/contact_requests/{id}` to `status: "accepted"` -> Rejected (`senderId` can only set `cancelled`).
15. **Ordinary User Disabling Global Lockdown**: Authenticated non-admin writing `{ "status": "NORMAL", "threatResolved": true }` to `/system_security/global` -> Rejected by `isAdmin()`.
16. **Message Sending Blocked During LOCKDOWN**: Authenticated chat participant creating `/messages/{id}` while `/system_security/global.status == "LOCKDOWN"` -> Rejected by `!isSystemLockedDown()`.
17. **Account or Message Deletion Blocked During LOCKDOWN**: Attempting `delete` on `/messages/{id}` or `/users/{uid}` while `/system_security/global.status == "LOCKDOWN"` -> Rejected by `!isSystemLockedDown()`.
18. **Non-Admin Reading Global Security Incidents**: Regular user listing `/security_incidents` -> Rejected by `allow get, list: if isAdmin()`.
19. **Non-Admin Forging Gmail Approval Decision**: Regular user creating or updating `/gmail_approvals/{id}` -> Rejected by `isAdmin()`.
20. **Cross-User Profile Media Overwrite**: Authenticated user `attacker_uid` attempting `update` on `/profile_media/victim_uid` -> Rejected by `isOwner(userId)` & `incoming().userId == existing().userId`.
21. **Blocked Viewer or Nobody-Visibility Profile Media Read**: Blocked user or stranger attempting `get(/profile_media/target_uid)` when blocked or visibility is `contacts`/`nobody` -> Rejected by backend Firestore privacy gate.
22. **Caller Self-Accepting Call Invite**: `callerId` attempting to update `/calls/{callId}` from `ringing` to `accepted` -> Rejected (`receiverId` gate).
23. **Re-activating Ended or Rejected Call**: Non-admin attempting to update `/calls/{callId}` after `status` is `ended` or `rejected` -> Rejected by terminal state lock.

