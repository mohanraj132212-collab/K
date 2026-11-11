'use strict';

const crypto = require('node:crypto');

const INTERNAL_EMAIL_DOMAIN = 'admin.kaarigai.com';
const ROLES = {
  PRIMARY_ADMIN: 'primary_admin',
  ADMIN_MEMBER: 'admin_member',
  ADMIN: 'Admin',
  WORKERS: 'Workers'
};

function isFullAdminRole(role) {
  return role === ROLES.PRIMARY_ADMIN || role === ROLES.ADMIN;
}

function isAuthorizedDashboardRole(role) {
  return (
    role === ROLES.PRIMARY_ADMIN ||
    role === ROLES.ADMIN_MEMBER ||
    role === ROLES.ADMIN ||
    role === ROLES.WORKERS
  );
}

function canonicalStoredRole(role, fallback = ROLES.ADMIN_MEMBER) {
  return isAuthorizedDashboardRole(role) ? role : fallback;
}

function normalizeCreateUserRole(rawRole) {
  const val = String(rawRole ?? '').trim();
  if (val === ROLES.ADMIN || val === ROLES.WORKERS) {
    return { valid: true, role: val };
  }
  return {
    valid: false,
    error: 'Role must be either Admin or Workers.'
  };
}

const DEFAULT_PRIMARY_USERNAME = 'Mohan';
const DEFAULT_TEST_ADMIN_USERNAME = 'Mohan123';
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;

function getInitialBootstrapPassword() {
  return typeof process !== 'undefined' && process.env && process.env.KAARIGAI_INITIAL_ADMIN_PASSWORD
    ? String(process.env.KAARIGAI_INITIAL_ADMIN_PASSWORD)
    : '1234';
}

function normalizeUsername(rawName) {
  return String(rawName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function validateUsername(rawName) {
  const clean = normalizeUsername(rawName);
  if (!clean || clean.length < 2) {
    return { valid: false, error: 'Username must be at least 2 characters.' };
  }
  if (clean.length > 50) {
    return { valid: false, error: 'Username must be 50 characters or fewer.' };
  }
  if (/[\x00-\x1f\x7f<>@]/.test(clean)) {
    return { valid: false, error: 'Enter a username without email symbols (@) or angle brackets.' };
  }
  const alnumCount = (clean.match(/[a-zA-Z0-9]/g) || []).length;
  if (alnumCount < 2) {
    return { valid: false, error: 'Username must include at least 2 letters or numbers.' };
  }
  return {
    valid: true,
    username: clean,
    usernameLower: clean.toLowerCase()
  };
}

function usernameToEmailLocalPart(rawName) {
  const clean = normalizeUsername(rawName).toLowerCase();
  const slug = clean
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  return slug || 'admin';
}

function buildInternalEmail(rawName, suffixIndex = 0) {
  const base = usernameToEmailLocalPart(rawName);
  const localPart = suffixIndex > 1 ? `${base}.${suffixIndex}` : base;
  return `${localPart}@${INTERNAL_EMAIL_DOMAIN}`;
}

function formatScryptHash(saltHex, derivedHex) {
  return `scrypt:v1:${saltHex}:${derivedHex}`;
}

function parseStoredPasswordHash(recordOrHash, fallbackSalt = null) {
  if (typeof recordOrHash === 'string' && recordOrHash.startsWith('scrypt:v1:')) {
    const parts = recordOrHash.split(':');
    if (parts.length === 4 && parts[2] && parts[3]) {
      return { salt: parts[2], hash: parts[3] };
    }
  }
  if (recordOrHash && typeof recordOrHash === 'object') {
    if (typeof recordOrHash.passwordHash === 'string' && recordOrHash.passwordHash.startsWith('scrypt:v1:')) {
      return parseStoredPasswordHash(recordOrHash.passwordHash);
    }
    const salt = recordOrHash.passwordSalt || fallbackSalt;
    const hash = recordOrHash.passwordHash;
    if (salt && hash) {
      return { salt: String(salt), hash: String(hash) };
    }
  }
  return null;
}

function hashPasswordScrypt(plainPassword, providedSalt = null) {
  const passwordStr = String(plainPassword ?? '');
  const salt = providedSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passwordStr, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  const hash = derived.toString('hex');
  return {
    salt,
    hash,
    formattedHash: formatScryptHash(salt, hash),
    algorithm: 'scrypt-v1'
  };
}

function verifyPasswordScrypt(plainPassword, recordOrSalt, expectedHashHex = null) {
  if (typeof plainPassword !== 'string') {
    return false;
  }

  let salt = '';
  let expectedHex = '';
  if (expectedHashHex !== null) {
    salt = String(recordOrSalt || '');
    expectedHex = String(expectedHashHex || '');
  } else {
    const parsed = parseStoredPasswordHash(recordOrSalt);
    if (!parsed) return false;
    salt = parsed.salt;
    expectedHex = parsed.hash;
  }

  if (!salt || !expectedHex) {
    return false;
  }

  try {
    const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, expected);
  } catch (_err) {
    return false;
  }
}

/**
 * Firebase Authentication requires >= 6 characters when storing passwords via Admin SDK.
 * When >= 6 characters, sync the exact password to Firebase Auth Email/Password provider.
 * When < 6 characters (such as initial PIN "1234"), use a cryptographically random
 * 32-char placeholder in Firebase Auth while verifying the exact password against the
 * server-only scrypt credential record.
 */
function toFirebaseAuthPassword(plainPassword) {
  const pwd = String(plainPassword ?? '');
  if (pwd.length >= 6) {
    return pwd;
  }
  return `Kg!${crypto.randomBytes(24).toString('base64url')}`;
}

function validatePasswordPair({ newPassword, confirmPassword, requireCurrent = false, currentPassword = '' }) {
  if (requireCurrent) {
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      return { valid: false, status: 400, code: 'MISSING_CURRENT', error: 'Enter your current password.' };
    }
  }
  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    return { valid: false, status: 400, code: 'MISSING_NEW_PASSWORD', error: 'Please enter a password.' };
  }
  if (newPassword.length > 512) {
    return {
      valid: false,
      status: 400,
      code: 'TOO_LONG',
      error: 'Password exceeds maximum supported length (512 characters).'
    };
  }
  if (/[\x00-\x1f\x7f]/.test(newPassword)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_CHARS',
      error: 'Password contains unsupported control characters.'
    };
  }
  if (newPassword !== confirmPassword) {
    return {
      valid: false,
      status: 400,
      code: 'PASSWORD_MISMATCH',
      error: 'Password and confirmation password do not match.'
    };
  }
  if (requireCurrent && newPassword === currentPassword) {
    return {
      valid: false,
      status: 400,
      code: 'PASSWORD_UNCHANGED',
      error: 'New password must differ from your current password.'
    };
  }
  return { valid: true };
}

function createMultiAdminAuthService(adapter) {
  const nowFn = typeof adapter.nowMs === 'function' ? adapter.nowMs : () => Date.now();

  async function allocateUniqueInternalEmail(username, excludeUid = '') {
    for (let idx = 0; idx < 50; idx += 1) {
      const candidate = buildInternalEmail(username, idx === 0 ? 0 : idx + 1);
      const existingCred = await adapter.findAdminByInternalEmail(candidate);
      if (existingCred && existingCred.uid !== excludeUid) {
        continue;
      }
      if (typeof adapter.getAuthUserByEmail === 'function') {
        const authUser = await adapter.getAuthUserByEmail(candidate);
        if (authUser && authUser.uid !== excludeUid) {
          continue;
        }
      }
      return candidate;
    }
    const randSuffix = crypto.randomBytes(3).toString('hex');
    return `${usernameToEmailLocalPart(username)}.${randSuffix}@${INTERNAL_EMAIL_DOMAIN}`;
  }

  /**
   * Initializes the first Primary Admin (Mohan / 1234) and default test Admin (Mohan123 / 1234)
   * strictly ONCE. Never resets passwords or overwrites existing admins on reload.
   */
  async function ensureInitialPrimaryAdmin() {
    let bootState = await adapter.getBootstrapState();
    let primaryUid = (bootState && bootState.primaryAdminUid) || '';

    if (!bootState || bootState.initialized !== true) {
      const existingList = await adapter.listAdminUsers();
      const existingPrimary = existingList.find((u) => isFullAdminRole(u.role));
      if (existingPrimary) {
        const existingData = await adapter.getAdminByUid(existingPrimary.uid);
        if (existingData && existingData.cred) {
          primaryUid = existingPrimary.uid;
          await adapter.markBootstrapInitialized({
            initialized: true,
            primaryAdminUid: existingPrimary.uid,
            initializedAtMs: nowFn()
          });
          bootState = {
            ...(bootState || {}),
            initialized: true,
            primaryAdminUid: existingPrimary.uid
          };
        }
      }

      if (!bootState || bootState.initialized !== true) {
        const username = DEFAULT_PRIMARY_USERNAME;
        const usernameLower = username.toLowerCase();
        const initialEmail = buildInternalEmail(username);
        const initialPassword = getInitialBootstrapPassword();

        let authUid = '';
        if (typeof adapter.getAuthUserByEmail === 'function') {
          const existingAuth = await adapter.getAuthUserByEmail(initialEmail);
          if (existingAuth && existingAuth.uid) {
            authUid = existingAuth.uid;
          }
        }

        if (!authUid) {
          const created = await adapter.createAuthUser({
            email: initialEmail,
            displayName: username,
            password: toFirebaseAuthPassword(initialPassword)
          });
          authUid = created.uid;
        }

        const now = nowFn();
        const { formattedHash } = hashPasswordScrypt(initialPassword);
        const initialProfile = {
          uid: authUid,
          username,
          role: ROLES.PRIMARY_ADMIN,
          isActive: true,
          sessionVersion: 1,
          createdAtMs: now,
          updatedAtMs: now
        };
        const initialCred = {
          uid: authUid,
          usernameLower,
          internalEmail: initialEmail,
          passwordHash: formattedHash,
          mustChangePassword: false,
          sessionVersion: 1,
          failedAttempts: 0,
          lockedUntilMs: 0,
          createdAtMs: now,
          updatedAtMs: now
        };

        const txResult = await adapter.runBootstrapTransaction({
          uid: authUid,
          profile: initialProfile,
          cred: initialCred,
          bootstrapDoc: {
            initialized: true,
            primaryAdminUid: authUid,
            initializedAtMs: now
          }
        });

        if (txResult && txResult.createdHere) {
          await adapter.setCustomUserClaims(authUid, {
            admin: true,
            role: ROLES.PRIMARY_ADMIN,
            username,
            sessionVersion: 1
          });
        }

        bootState =
          txResult && txResult.bootstrapDoc
            ? txResult.bootstrapDoc
            : { initialized: true, primaryAdminUid: authUid };
        primaryUid = bootState.primaryAdminUid || authUid;
      }
    }

    if (!bootState || bootState.defaultTestAccountSeeded !== true) {
      const testUsername = DEFAULT_TEST_ADMIN_USERNAME;
      const testLower = testUsername.toLowerCase();
      const existingCred = await adapter.getAdminByUsernameLower(testLower);
      let seededUid = existingCred && existingCred.uid ? existingCred.uid : '';

      if (!existingCred) {
        const allUsers = await adapter.listAdminUsers();
        const existingProfile = allUsers.find(
          (u) => normalizeUsername(u.username).toLowerCase() === testLower
        );
        if (existingProfile) {
          seededUid = existingProfile.uid;
        } else {
          const testEmail = await allocateUniqueInternalEmail(testUsername);
          const testPassword = getInitialBootstrapPassword();
          const authCreated = await adapter.createAuthUser({
            email: testEmail,
            displayName: testUsername,
            password: toFirebaseAuthPassword(testPassword)
          });
          seededUid = authCreated.uid;
          const now = nowFn();
          const { formattedHash } = hashPasswordScrypt(testPassword);

          await adapter.saveNewAdminRecords({
            uid: seededUid,
            profile: {
              uid: seededUid,
              username: testUsername,
              role: ROLES.ADMIN,
              isActive: true,
              sessionVersion: 1,
              createdAtMs: now,
              updatedAtMs: now
            },
            cred: {
              uid: seededUid,
              usernameLower: testLower,
              internalEmail: testEmail,
              passwordHash: formattedHash,
              mustChangePassword: false,
              sessionVersion: 1,
              failedAttempts: 0,
              lockedUntilMs: 0,
              createdAtMs: now,
              updatedAtMs: now
            },
            allowlist: {
              active: true,
              role: ROLES.ADMIN,
              sessionVersion: 1
            }
          });

          await adapter.setCustomUserClaims(seededUid, {
            admin: true,
            role: ROLES.ADMIN,
            username: testUsername,
            sessionVersion: 1
          });
        }
      }

      await adapter.markBootstrapInitialized({
        initialized: true,
        primaryAdminUid: primaryUid,
        defaultTestAccountSeeded: true,
        defaultTestAdminUid: seededUid,
        initializedAtMs: nowFn()
      });

      bootState = {
        ...bootState,
        defaultTestAccountSeeded: true,
        defaultTestAdminUid: seededUid
      };
    }

    return bootState;
  }

  async function requireActiveAdminCaller(authorizationHeader, requiredRole = null) {
    const rawHeader = String(authorizationHeader || '');
    const match = rawHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return {
        ok: false,
        status: 401,
        body: { ok: false, code: 'UNAUTHENTICATED', error: 'Missing admin session authorization token.' }
      };
    }

    let decoded;
    try {
      decoded = await adapter.verifyIdToken(match[1].trim());
    } catch (_err) {
      return {
        ok: false,
        status: 401,
        body: { ok: false, code: 'INVALID_TOKEN', error: 'Your admin session has expired. Please sign in again.' }
      };
    }

    if (!decoded || decoded.admin !== true) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, code: 'FORBIDDEN', error: 'Only authorized administrators can perform this action.' }
      };
    }

    const record = await adapter.getAdminByUid(decoded.uid);
    const profile = record && record.profile;
    const cred = record && record.cred;
    if (!profile || !cred || profile.isActive !== true) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, code: 'ACCOUNT_DISABLED', error: 'This administrator account is no longer active.' }
      };
    }

    const currentVersion = Math.max(1, Number(profile.sessionVersion) || 1);
    const tokenVersion = decoded.sessionVersion !== undefined ? Number(decoded.sessionVersion) : null;
    if (tokenVersion !== null && tokenVersion !== currentVersion) {
      return {
        ok: false,
        status: 401,
        body: {
          ok: false,
          code: 'SESSION_INVALIDATED',
          error: 'This admin session has been invalidated. Please sign in again.'
        }
      };
    }

    if (requiredRole && (!isFullAdminRole(profile.role) || !isFullAdminRole(decoded.role))) {
      return {
        ok: false,
        status: 403,
        body: {
          ok: false,
          code: 'PRIMARY_ADMIN_REQUIRED',
          error: 'Only an authorized Admin can manage or create user accounts.'
        }
      };
    }

    return {
      ok: true,
      uid: decoded.uid,
      decoded,
      profile,
      cred
    };
  }

  async function handleLogin({ username, password }) {
    const cleanName = normalizeUsername(username);
    if (!cleanName) {
      return {
        status: 400,
        body: { ok: false, code: 'MISSING_USERNAME', error: 'Please enter your username.' }
      };
    }
    if (typeof password !== 'string' || password.length === 0) {
      return {
        status: 400,
        body: { ok: false, code: 'MISSING_PASSWORD', error: 'Please enter your password.' }
      };
    }

    await ensureInitialPrimaryAdmin();

    const cred = await adapter.getAdminByUsernameLower(cleanName.toLowerCase());
    if (!cred) {
      return {
        status: 401,
        body: {
          ok: false,
          code: 'INVALID_CREDENTIALS',
          error: 'Invalid username or password. Please verify and try again.'
        }
      };
    }

    const record = await adapter.getAdminByUid(cred.uid);
    const profile = record && record.profile;
    if (!profile || profile.isActive !== true) {
      return {
        status: 403,
        body: {
          ok: false,
          code: 'ACCOUNT_DISABLED',
          error: 'This administrator account has been disabled.'
        }
      };
    }

    const authUser = typeof adapter.getAuthUser === 'function' ? await adapter.getAuthUser(cred.uid) : null;
    if (authUser && authUser.disabled) {
      return {
        status: 403,
        body: {
          ok: false,
          code: 'ACCOUNT_DISABLED',
          error: 'This administrator account has been disabled in Firebase Authentication.'
        }
      };
    }

    const now = nowFn();
    if (cred.lockedUntilMs && Number(cred.lockedUntilMs) > now) {
      const waitSecs = Math.max(1, Math.ceil((Number(cred.lockedUntilMs) - now) / 1000));
      return {
        status: 429,
        body: {
          ok: false,
          code: 'TOO_MANY_ATTEMPTS',
          error: `Too many failed sign-in attempts for this account. Please wait ${waitSecs} seconds.`
        }
      };
    }

    const matched = verifyPasswordScrypt(password, cred);
    if (!matched) {
      const nextAttempts = (Number(cred.failedAttempts) || 0) + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
      await adapter.updateAdminRecords(cred.uid, {
        credPatch: {
          failedAttempts: nextAttempts,
          lockedUntilMs: shouldLock ? now + LOCKOUT_MS : 0,
          lastFailedAtMs: now
        }
      });
      return {
        status: shouldLock ? 429 : 401,
        body: {
          ok: false,
          code: shouldLock ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CREDENTIALS',
          error: shouldLock
            ? 'Too many incorrect login attempts. Access temporarily paused for 5 minutes.'
            : 'Invalid username or password. Please verify and try again.'
        }
      };
    }

    const sessionVersion = Math.max(1, Number(profile.sessionVersion) || 1);
    const role = canonicalStoredRole(profile.role, ROLES.WORKERS);

    await adapter.updateAdminRecords(cred.uid, {
      profilePatch: {
        lastLoginAtMs: now
      },
      allowlistPatch: {
        active: true,
        role,
        sessionVersion
      },
      credPatch: {
        failedAttempts: 0,
        lockedUntilMs: 0,
        lastLoginAtMs: now
      }
    });

    await adapter.setCustomUserClaims(cred.uid, {
      admin: true,
      role,
      username: profile.username,
      sessionVersion
    });

    const customToken = await adapter.createCustomToken(cred.uid, {
      admin: true,
      role,
      username: profile.username,
      sessionVersion
    });

    return {
      status: 200,
      body: {
        ok: true,
        customToken,
        uid: cred.uid,
        username: profile.username,
        role,
        mustChangePassword: Boolean(cred.mustChangePassword),
        sessionVersion
      }
    };
  }

  /**
   * Any active admin can change their OWN password by validating currentPassword.
   */
  async function handleChangeOwnPassword({ authorizationHeader, currentPassword, newPassword, confirmPassword }) {
    const authCheck = await requireActiveAdminCaller(authorizationHeader);
    if (!authCheck.ok) {
      return { status: authCheck.status, body: authCheck.body };
    }

    const validation = validatePasswordPair({
      requireCurrent: true,
      currentPassword,
      newPassword,
      confirmPassword
    });
    if (!validation.valid) {
      return {
        status: validation.status,
        body: { ok: false, code: validation.code, error: validation.error }
      };
    }

    const matched = verifyPasswordScrypt(currentPassword, authCheck.cred);
    if (!matched) {
      return {
        status: 401,
        body: { ok: false, code: 'INVALID_CURRENT_PASSWORD', error: 'Current password is incorrect.' }
      };
    }

    const now = nowFn();
    const nextSessionVersion = Math.max(1, Number(authCheck.profile.sessionVersion) || 1) + 1;
    const role = canonicalStoredRole(authCheck.profile.role, ROLES.WORKERS);
    const { formattedHash } = hashPasswordScrypt(newPassword);

    await adapter.updateAuthUser(authCheck.uid, {
      password: toFirebaseAuthPassword(newPassword)
    });

    if (typeof adapter.revokeUserTokens === 'function') {
      await adapter.revokeUserTokens(authCheck.uid);
    }

    await adapter.updateAdminRecords(authCheck.uid, {
      profilePatch: {
        sessionVersion: nextSessionVersion,
        updatedAtServer: true
      },
      allowlistPatch: {
        active: true,
        role,
        sessionVersion: nextSessionVersion
      },
      credPatch: {
        passwordHash: formattedHash,
        mustChangePassword: false,
        sessionVersion: nextSessionVersion,
        failedAttempts: 0,
        lockedUntilMs: 0,
        updatedAtMs: now
      }
    });

    await adapter.setCustomUserClaims(authCheck.uid, {
      admin: true,
      role,
      username: authCheck.profile.username,
      sessionVersion: nextSessionVersion
    });

    const customToken = await adapter.createCustomToken(authCheck.uid, {
      admin: true,
      role,
      username: authCheck.profile.username,
      sessionVersion: nextSessionVersion
    });

    return {
      status: 200,
      body: {
        ok: true,
        customToken,
        role,
        username: authCheck.profile.username,
        sessionVersion: nextSessionVersion,
        message: 'Password Updated Successfully'
      }
    };
  }

  function formatPublicMemberDoc(doc) {
    return {
      uid: doc.uid,
      username: doc.username,
      role: doc.role,
      isActive: doc.isActive !== false,
      createdAtMs: Number(doc.createdAtMs || 0),
      updatedAtMs: Number(doc.updatedAtMs || doc.createdAtMs || 0)
    };
  }

  function sortMemberList(list) {
    return list
      .slice()
      .sort((a, b) => {
        const aIsAdmin = isFullAdminRole(a.role);
        const bIsAdmin = isFullAdminRole(b.role);
        if (aIsAdmin !== bIsAdmin) {
          return aIsAdmin ? -1 : 1;
        }
        return (a.createdAtMs || 0) - (b.createdAtMs || 0);
      })
      .map(formatPublicMemberDoc);
  }

  /**
   * Trusted backend provisioning endpoint for create-user.html.
   * Only an authorized Admin ('Admin' or 'primary_admin') can create Admin or Workers accounts.
   */
  async function handleCreateUser({ authorizationHeader, username, password, role }) {
    const authCheck = await requireActiveAdminCaller(authorizationHeader, ROLES.PRIMARY_ADMIN);
    if (!authCheck.ok) {
      return { status: authCheck.status, body: authCheck.body };
    }

    const nameCheck = validateUsername(username);
    if (!nameCheck.valid) {
      return {
        status: 400,
        body: { ok: false, code: 'INVALID_USERNAME', error: nameCheck.error }
      };
    }

    const pwdCheck = validatePasswordPair({
      requireCurrent: false,
      newPassword: password,
      confirmPassword: password
    });
    if (!pwdCheck.valid) {
      return {
        status: pwdCheck.status,
        body: { ok: false, code: pwdCheck.code, error: pwdCheck.error }
      };
    }

    const roleCheck = normalizeCreateUserRole(role);
    if (!roleCheck.valid) {
      return {
        status: 400,
        body: { ok: false, code: 'INVALID_ROLE', error: roleCheck.error }
      };
    }

    await ensureInitialPrimaryAdmin();

    const existingCred = await adapter.getAdminByUsernameLower(nameCheck.usernameLower);
    const existingUsers = await adapter.listAdminUsers();
    const existingProfile = existingUsers.find(
      (u) => normalizeUsername(u.username).toLowerCase() === nameCheck.usernameLower
    );
    if (existingCred || existingProfile) {
      return {
        status: 409,
        body: {
          ok: false,
          code: 'DUPLICATE_USERNAME',
          error: `Username "${nameCheck.username}" already exists. Please choose another username.`
        }
      };
    }

    const internalEmail = await allocateUniqueInternalEmail(nameCheck.username);
    const authCreated = await adapter.createAuthUser({
      email: internalEmail,
      displayName: nameCheck.username,
      password: toFirebaseAuthPassword(password)
    });

    const now = nowFn();
    const { formattedHash } = hashPasswordScrypt(password);
    const assignedRole = roleCheck.role;
    const newProfile = {
      uid: authCreated.uid,
      username: nameCheck.username,
      role: assignedRole,
      isActive: true,
      sessionVersion: 1,
      createdAtMs: now,
      updatedAtMs: now
    };
    const newCred = {
      uid: authCreated.uid,
      usernameLower: nameCheck.usernameLower,
      internalEmail,
      passwordHash: formattedHash,
      mustChangePassword: false,
      sessionVersion: 1,
      failedAttempts: 0,
      lockedUntilMs: 0,
      createdAtMs: now,
      updatedAtMs: now
    };

    await adapter.saveNewAdminRecords({
      uid: authCreated.uid,
      profile: newProfile,
      cred: newCred,
      allowlist: {
        active: true,
        role: assignedRole,
        sessionVersion: 1
      }
    });

    await adapter.setCustomUserClaims(authCreated.uid, {
      admin: true,
      role: assignedRole,
      username: nameCheck.username,
      sessionVersion: 1
    });

    const members = await adapter.listAdminUsers();
    return {
      status: 201,
      body: {
        ok: true,
        uid: authCreated.uid,
        user: {
          uid: authCreated.uid,
          username: nameCheck.username,
          role: assignedRole,
          createdAtMs: now
        },
        member: formatPublicMemberDoc(newProfile),
        members: sortMemberList(members),
        message: 'User Created Successfully'
      }
    };
  }

  /**
   * Primary Admin Member Management Actions: list | create | updateName | changePassword | delete
   */
  async function handleMemberManagement({ authorizationHeader, action, payload = {} }) {
    const authCheck = await requireActiveAdminCaller(authorizationHeader, ROLES.PRIMARY_ADMIN);
    if (!authCheck.ok) {
      return { status: authCheck.status, body: authCheck.body };
    }

    const op = String(action || '').trim();

    if (op === 'list') {
      const members = await adapter.listAdminUsers();
      return {
        status: 200,
        body: { ok: true, members: sortMemberList(members) }
      };
    }

    if (op === 'create') {
      const nameCheck = validateUsername(payload.username);
      if (!nameCheck.valid) {
        return {
          status: 400,
          body: { ok: false, code: 'INVALID_USERNAME', error: nameCheck.error }
        };
      }

      const pwdCheck = validatePasswordPair({
        requireCurrent: false,
        newPassword: payload.password,
        confirmPassword: payload.confirmPassword
      });
      if (!pwdCheck.valid) {
        return {
          status: pwdCheck.status,
          body: { ok: false, code: pwdCheck.code, error: pwdCheck.error }
        };
      }

      const existingByName = await adapter.getAdminByUsernameLower(nameCheck.usernameLower);
      if (existingByName) {
        return {
          status: 409,
          body: {
            ok: false,
            code: 'DUPLICATE_USERNAME',
            error: `An administrator named "${nameCheck.username}" already exists.`
          }
        };
      }

      const internalEmail = await allocateUniqueInternalEmail(nameCheck.username);
      const authCreated = await adapter.createAuthUser({
        email: internalEmail,
        displayName: nameCheck.username,
        password: toFirebaseAuthPassword(payload.password)
      });

      const now = nowFn();
      const { formattedHash } = hashPasswordScrypt(payload.password);
      const newProfile = {
        uid: authCreated.uid,
        username: nameCheck.username,
        role: ROLES.ADMIN_MEMBER,
        isActive: true,
        sessionVersion: 1,
        createdAtMs: now,
        updatedAtMs: now
      };
      const newCred = {
        uid: authCreated.uid,
        usernameLower: nameCheck.usernameLower,
        internalEmail,
        passwordHash: formattedHash,
        mustChangePassword: false,
        sessionVersion: 1,
        failedAttempts: 0,
        lockedUntilMs: 0,
        createdAtMs: now,
        updatedAtMs: now
      };

      await adapter.saveNewAdminRecords({
        uid: authCreated.uid,
        profile: newProfile,
        cred: newCred,
        allowlist: {
          active: true,
          role: ROLES.ADMIN_MEMBER,
          sessionVersion: 1
        }
      });

      await adapter.setCustomUserClaims(authCreated.uid, {
        admin: true,
        role: ROLES.ADMIN_MEMBER,
        username: nameCheck.username,
        sessionVersion: 1
      });

      const members = await adapter.listAdminUsers();
      return {
        status: 201,
        body: {
          ok: true,
          member: formatPublicMemberDoc(newProfile),
          members: sortMemberList(members),
          message: `Admin member "${nameCheck.username}" created successfully.`
        }
      };
    }

    if (op === 'updateName') {
      const targetUid = String(payload.targetUid || '').trim();
      if (!targetUid) {
        return { status: 400, body: { ok: false, code: 'MISSING_UID', error: 'Missing target administrator ID.' } };
      }

      const nameCheck = validateUsername(payload.newName);
      if (!nameCheck.valid) {
        return { status: 400, body: { ok: false, code: 'INVALID_USERNAME', error: nameCheck.error } };
      }

      const targetData = await adapter.getAdminByUid(targetUid);
      if (!targetData || !targetData.profile || !targetData.cred) {
        return { status: 404, body: { ok: false, code: 'NOT_FOUND', error: 'Administrator account not found.' } };
      }

      const existingByName = await adapter.getAdminByUsernameLower(nameCheck.usernameLower);
      if (existingByName && existingByName.uid !== targetUid) {
        return {
          status: 409,
          body: {
            ok: false,
            code: 'DUPLICATE_USERNAME',
            error: `An administrator named "${nameCheck.username}" already exists.`
          }
        };
      }

      const nextEmail = await allocateUniqueInternalEmail(nameCheck.username, targetUid);
      const targetRole = canonicalStoredRole(targetData.profile.role, ROLES.WORKERS);
      const version = Math.max(1, Number(targetData.profile.sessionVersion) || 1);
      const now = nowFn();

      await adapter.updateAuthUser(targetUid, {
        email: nextEmail,
        displayName: nameCheck.username
      });

      await adapter.setCustomUserClaims(targetUid, {
        admin: true,
        role: targetRole,
        username: nameCheck.username,
        sessionVersion: version
      });

      await adapter.updateAdminRecords(targetUid, {
        profilePatch: {
          username: nameCheck.username,
          updatedAtMs: now,
          updatedAtServer: true
        },
        credPatch: {
          usernameLower: nameCheck.usernameLower,
          internalEmail: nextEmail,
          updatedAtMs: now
        }
      });

      let selfCustomToken = null;
      if (targetUid === authCheck.uid) {
        selfCustomToken = await adapter.createCustomToken(targetUid, {
          admin: true,
          role: targetRole,
          username: nameCheck.username,
          sessionVersion: version
        });
      }

      const members = await adapter.listAdminUsers();
      return {
        status: 200,
        body: {
          ok: true,
          customToken: selfCustomToken,
          members: sortMemberList(members),
          message: `Administrator name updated to "${nameCheck.username}".`
        }
      };
    }

    if (op === 'changePassword') {
      const targetUid = String(payload.targetUid || '').trim();
      if (!targetUid) {
        return { status: 400, body: { ok: false, code: 'MISSING_UID', error: 'Missing target administrator ID.' } };
      }

      const pwdCheck = validatePasswordPair({
        requireCurrent: false,
        newPassword: payload.newPassword,
        confirmPassword: payload.confirmPassword
      });
      if (!pwdCheck.valid) {
        return {
          status: pwdCheck.status,
          body: { ok: false, code: pwdCheck.code, error: pwdCheck.error }
        };
      }

      const targetData = await adapter.getAdminByUid(targetUid);
      if (!targetData || !targetData.profile || !targetData.cred) {
        return { status: 404, body: { ok: false, code: 'NOT_FOUND', error: 'Administrator account not found.' } };
      }

      const now = nowFn();
      const targetRole = canonicalStoredRole(targetData.profile.role, ROLES.WORKERS);
      const nextVersion = Math.max(1, Number(targetData.profile.sessionVersion) || 1) + 1;
      const { formattedHash } = hashPasswordScrypt(payload.newPassword);

      await adapter.updateAuthUser(targetUid, {
        password: toFirebaseAuthPassword(payload.newPassword)
      });

      if (typeof adapter.revokeUserTokens === 'function') {
        await adapter.revokeUserTokens(targetUid);
      }

      await adapter.setCustomUserClaims(targetUid, {
        admin: true,
        role: targetRole,
        username: targetData.profile.username,
        sessionVersion: nextVersion
      });

      await adapter.updateAdminRecords(targetUid, {
        profilePatch: {
          sessionVersion: nextVersion,
          updatedAtMs: now,
          updatedAtServer: true
        },
        allowlistPatch: {
          active: targetData.profile.isActive !== false,
          role: targetRole,
          sessionVersion: nextVersion
        },
        credPatch: {
          passwordHash: formattedHash,
          mustChangePassword: false,
          sessionVersion: nextVersion,
          failedAttempts: 0,
          lockedUntilMs: 0,
          updatedAtMs: now
        }
      });

      let selfCustomToken = null;
      if (targetUid === authCheck.uid) {
        selfCustomToken = await adapter.createCustomToken(targetUid, {
          admin: true,
          role: targetRole,
          username: targetData.profile.username,
          sessionVersion: nextVersion
        });
      }

      const members = await adapter.listAdminUsers();
      return {
        status: 200,
        body: {
          ok: true,
          customToken: selfCustomToken,
          members: sortMemberList(members),
          message: `Password updated for "${targetData.profile.username}".`
        }
      };
    }

    if (op === 'delete') {
      const targetUid = String(payload.targetUid || '').trim();
      if (!targetUid) {
        return { status: 400, body: { ok: false, code: 'MISSING_UID', error: 'Missing target administrator ID.' } };
      }

      if (targetUid === authCheck.uid) {
        return {
          status: 400,
          body: { ok: false, code: 'SELF_DELETE_FORBIDDEN', error: 'You cannot delete your own active admin account.' }
        };
      }

      const allMembers = await adapter.listAdminUsers();
      const targetMember = allMembers.find((m) => m.uid === targetUid);
      if (!targetMember) {
        return { status: 404, body: { ok: false, code: 'NOT_FOUND', error: 'Administrator account not found.' } };
      }

      if (isFullAdminRole(targetMember.role)) {
        const primaryCount = allMembers.filter((m) => isFullAdminRole(m.role)).length;
        if (primaryCount <= 1) {
          return {
            status: 400,
            body: {
              ok: false,
              code: 'LAST_PRIMARY_ADMIN',
              error: 'Cannot delete the last Admin account.'
            }
          };
        }
      }

      if (typeof adapter.revokeUserTokens === 'function') {
        try {
          await adapter.revokeUserTokens(targetUid);
        } catch (_err) {
          // Proceed cleanly if user already deleted in Auth
        }
      }

      if (typeof adapter.deleteAuthUser === 'function') {
        try {
          await adapter.deleteAuthUser(targetUid);
        } catch (err) {
          if (!err || err.code !== 'auth/user-not-found') {
            throw err;
          }
        }
      }

      await adapter.deleteAdminRecords(targetUid);

      const remaining = await adapter.listAdminUsers();
      return {
        status: 200,
        body: {
          ok: true,
          members: sortMemberList(remaining),
          message: `Administrator "${targetMember.username}" has been deleted and access revoked.`
        }
      };
    }

    return {
      status: 400,
      body: { ok: false, code: 'INVALID_ACTION', error: 'Unsupported administrator management action.' }
    };
  }

  return {
    ensureInitialPrimaryAdmin,
    requireActiveAdminCaller,
    handleLogin,
    handleChangeOwnPassword,
    handleCreateUser,
    handleMemberManagement
  };
}

module.exports = {
  INTERNAL_EMAIL_DOMAIN,
  ROLES,
  DEFAULT_PRIMARY_USERNAME,
  DEFAULT_TEST_ADMIN_USERNAME,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  getInitialBootstrapPassword,
  isFullAdminRole,
  isAuthorizedDashboardRole,
  canonicalStoredRole,
  normalizeCreateUserRole,
  normalizeUsername,
  validateUsername,
  usernameToEmailLocalPart,
  buildInternalEmail,
  formatScryptHash,
  parseStoredPasswordHash,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  toFirebaseAuthPassword,
  validatePasswordPair,
  createMultiAdminAuthService
};
