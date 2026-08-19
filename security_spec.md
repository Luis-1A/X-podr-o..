# Security Specification & Threat Model

## Data Invariants
1. A user can only read, create, and update their own document in `/users/{uid}`.
2. A user can only access, create, update, and delete their own subcollections `/users/{uid}/favorites/{mangaId}`, `/users/{uid}/history/{historyId}`, `/users/{uid}/progress/{mangaId}`, and `/users/{uid}/settings/preferences`.
3. Global mangas catalog `/mangas/{mangaId}` and `/mangas/{mangaId}/chapters/{chapterId}` can be read by any authenticated or anonymous user, but can only be created/updated by authenticated users or admins with valid schema.
4. User PII (such as email) in `/users/{uid}` cannot be read by other users.
5. Users cannot elevate their own role to 'admin' unless verified against admin records.

## Dirty Dozen Payloads (Targeting Firestore Security)
1. **Malicious UID Impersonation:** User A attempts to write to `/users/userB` -> Expected: `PERMISSION_DENIED`.
2. **Favorite Steal:** User A attempts to read `/users/userB/favorites/manga123` -> Expected: `PERMISSION_DENIED`.
3. **History Tampering:** User A attempts to delete `/users/userB/history/item123` -> Expected: `PERMISSION_DENIED`.
4. **Progress Spoofing:** User A attempts to overwrite `/users/userB/progress/manga123` -> Expected: `PERMISSION_DENIED`.
5. **Settings Hijack:** User A attempts to update `/users/userB/settings/preferences` -> Expected: `PERMISSION_DENIED`.
6. **Role Escalation:** User A attempts to set `role: "admin"` on `/users/userA` -> Expected: `PERMISSION_DENIED`.
7. **Unbounded Payload Attack:** User attempts to insert a 2MB string into title or description -> Expected: `PERMISSION_DENIED`.
8. **Invalid Path / Document ID Injection:** User attempts to pass invalid characters in `mangaId` -> Expected: `PERMISSION_DENIED`.
9. **Unauthenticated Write:** An unauthenticated visitor attempts to write to `/users/any/favorites` -> Expected: `PERMISSION_DENIED`.
10. **Ghost Fields Injection:** User attempts to write unauthorized fields like `isVip: true` to `/users/{uid}` -> Expected: `PERMISSION_DENIED`.
11. **Malicious Chapter Deletion:** Standard user attempts to delete global `/mangas/{mangaId}` -> Expected: `PERMISSION_DENIED`.
12. **PII Query Scraping:** Unauthenticated user attempts a collection group list on `/users` -> Expected: `PERMISSION_DENIED`.
