'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INTERNAL_EMAIL_DOMAIN,
  ROLES,
  buildInternalEmail,
  createMultiAdminAuthService,
  hashPasswordScrypt,
  verifyPasswordScrypt
} = require('../auth-core');

function createMultiAdminInMemoryAdapter() {
  let bootstrapDoc = null;
  let clock = 1_700_000_000_000;
  let uidCounter = 1;

  const authUsers = new Map(); // uid -> { uid, email, displayName, password, disabled, claims, minTokenEpoch }
  const adminUsers = new Map(); // uid -> public-safe adminUsers/{uid}
  const adminCredentials = new Map(); // uid -> server-only adminCredentials/{uid}
  const adminsAllowlist = new Map(); // uid -> admins/{uid}
  const revokedUids = [];

  const service = createMultiAdminAuthService({
    nowMs: () => clock,

    async getBootstrapState() {
      return bootstrapDoc ? { ...bootstrapDoc } : null;
    },

    async markBootstrapInitialized(data) {
      bootstrapDoc = { ...(bootstrapDoc || {}), ...data };
    },

    async runBootstrapTransaction({ uid, profile, cred, bootstrapDoc: bootPayload }) {
      if (bootstrapDoc && bootstrapDoc.initialized === true) {
        return { createdHere: false, bootstrapDoc: { ...bootstrapDoc } };
      }
      adminUsers.set(uid, { ...profile });
      adminCredentials.set(uid, { ...cred });
      adminsAllowlist.set(uid, { active: true, role: profile.role, sessionVersion: 1 });
      bootstrapDoc = { ...bootPayload };
      return { createdHere: true, bootstrapDoc: { ...bootstrapDoc } };
    },

    async getAdminByUsernameLower(usernameLower) {
      for (const cred of adminCredentials.values()) {
        if (cred.usernameLower === usernameLower) return { ...cred };
      }
      return null;
    },

    async findAdminByInternalEmail(email) {
      for (const cred of adminCredentials.values()) {
        if (cred.internalEmail === email) return { ...cred };
      }
      return null;
    },

    async getAdminByUid(uid) {
      const p = adminUsers.get(uid);
      const c = adminCredentials.get(uid);
      return {
        profile: p ? { ...p } : null,
        cred: c ? { ...c } : null
      };
    },

    async listAdminUsers() {
      return Array.from(adminUsers.values()).map((u) => ({ ...u }));
    },

    async saveNewAdminRecords({ uid, profile, cred, allowlist }) {
      adminUsers.set(uid, { ...profile });
      adminCredentials.set(uid, { ...cred });
      adminsAllowlist.set(uid, { ...(allowlist || { active: true, role: profile.role, sessionVersion: 1 }) });
    },

    async updateAdminRecords(uid, { profilePatch, credPatch, allowlistPatch }) {
      if (profilePatch && adminUsers.has(uid)) {
        const clean = { ...profilePatch };
        delete clean.updatedAtServer;
        adminUsers.set(uid, { ...adminUsers.get(uid), ...clean });
      }
      if (credPatch && adminCredentials.has(uid)) {
        adminCredentials.set(uid, { ...adminCredentials.get(uid), ...credPatch });
      }
      if (allowlistPatch) {
        adminsAllowlist.set(uid, { ...(adminsAllowlist.get(uid) || {}), ...allowlistPatch });
      }
    },

    async deleteAdminRecords(uid) {
      adminUsers.delete(uid);
      adminCredentials.delete(uid);
      adminsAllowlist.delete(uid);
    },

    async createAuthUser({ email, displayName, password }) {
      for (const u of authUsers.values()) {
        if (u.email === email) return { uid: u.uid, email: u.email };
      }
      const uid = `uid-${uidCounter++}`;
      authUsers.set(uid, {
        uid,
        email,
        displayName,
        password,
        disabled: false,
        claims: {},
        tokenEpoch: 1
      });
      return { uid, email };
    },

    async getAuthUserByEmail(email) {
      for (const u of authUsers.values()) {
        if (u.email === email) return { uid: u.uid, email: u.email, disabled: u.disabled };
      }
      return null;
    },

    async getAuthUser(uid) {
      const u = authUsers.get(uid);
      return u ? { uid: u.uid, email: u.email, disabled: u.disabled } : null;
    },

    async updateAuthUser(uid, updates) {
      const u = authUsers.get(uid);
      if (!u) throw new Error('auth/user-not-found');
      if (updates.email !== undefined) u.email = updates.email;
      if (updates.displayName !== undefined) u.displayName = updates.displayName;
      if (updates.password !== undefined) u.password = updates.password;
      if (updates.disabled !== undefined) u.disabled = updates.disabled;
    },

    async setCustomUserClaims(uid, claims) {
      const u = authUsers.get(uid);
      if (u) u.claims = { ...claims };
    },

    async revokeUserTokens(uid) {
      revokedUids.push({ uid, at: clock });
      const u = authUsers.get(uid);
      if (u) u.tokenEpoch += 1;
    },

    async deleteAuthUser(uid) {
      authUsers.delete(uid);
    },

    async createCustomToken(uid, claims) {
      const u = authUsers.get(uid);
      const epoch = u ? u.tokenEpoch : 1;
      return JSON.stringify({ uid, claims, epoch });
    },

    async verifyIdToken(tokenStr) {
      const parsed = JSON.parse(tokenStr);
      const u = authUsers.get(parsed.uid);
      if (!u || parsed.epoch < u.tokenEpoch) {
        throw new Error('auth/id-token-revoked');
      }
      return {
        uid: parsed.uid,
        admin: parsed.claims.admin,
        role: parsed.claims.role,
        username: parsed.claims.username,
        sessionVersion: parsed.claims.sessionVersion
      };
    }
  });

  return {
    service,
    getAuthUser: (uid) => authUsers.get(uid),
    getAuthUserCount: () => authUsers.size,
    getAdminUser: (uid) => adminUsers.get(uid),
    getRevokedUids: () => revokedUids.slice(),
    advanceClock: (ms) => {
      clock += ms;
    }
  };
}

test('maps internal usernames to @admin.kaarigai.com emails cleanly and hashes with unique salts', () => {
  assert.equal(buildInternalEmail('Mohan'), `mohan@${INTERNAL_EMAIL_DOMAIN}`);
  assert.equal(buildInternalEmail('Rohith'), `rohith@${INTERNAL_EMAIL_DOMAIN}`);
  assert.equal(buildInternalEmail('Rohith Kumar'), `rohith.kumar@${INTERNAL_EMAIL_DOMAIN}`);

  const h1 = hashPasswordScrypt('1234');
  const h2 = hashPasswordScrypt('1234');
  assert.notEqual(h1.formattedHash, h2.formattedHash);
  assert.equal(verifyPasswordScrypt('1234', { passwordHash: h1.formattedHash }), true);
  assert.equal(verifyPasswordScrypt('wrong', { passwordHash: h1.formattedHash }), false);
});

test('bootstraps Mohan / 1234 once as Primary Admin, rejects wrong credentials, and never resets on reload', async () => {
  const ctx = createMultiAdminInMemoryAdapter();

  // Bad login rejects cleanly while bootstrapping Mohan once
  const wrongRes = await ctx.service.handleLogin({ username: 'Mohan', password: 'wrong' });
  assert.equal(wrongRes.status, 401);

  // Mohan / 1234 succeeds (case-insensitive Admin Name support)
  const okRes = await ctx.service.handleLogin({ username: 'mohan', password: '1234' });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.ok, true);
  assert.equal(okRes.body.username, 'Mohan');
  assert.equal(okRes.body.role, ROLES.PRIMARY_ADMIN);

  const mohanProfile = ctx.getAdminUser(okRes.body.uid);
  assert.equal(mohanProfile.username, 'Mohan');
  assert.equal(mohanProfile.role, ROLES.PRIMARY_ADMIN);
  assert.equal(mohanProfile.isActive, true);
  assert.equal(mohanProfile.passwordHash, undefined);
  assert.equal(mohanProfile.password, undefined);

  const mohanAuth = ctx.getAuthUser(okRes.body.uid);
  assert.equal(mohanAuth.email, `mohan@${INTERNAL_EMAIL_DOMAIN}`);
  assert.equal(mohanAuth.claims.role, ROLES.PRIMARY_ADMIN);
  assert.equal(mohanAuth.claims.admin, true);

  // Change Mohan's password from 1234 -> Mohan@2026!
  const changed = await ctx.service.handleChangeOwnPassword({
    authorizationHeader: `Bearer ${okRes.body.customToken}`,
    currentPassword: '1234',
    newPassword: 'Mohan@2026!',
    confirmPassword: 'Mohan@2026!'
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);
  assert.equal(ctx.getAuthUser(okRes.body.uid).password, 'Mohan@2026!');

  // Re-running bootstrap NEVER resets Mohan back to 1234
  await ctx.service.ensureInitialPrimaryAdmin();
  const oldPinAttempt = await ctx.service.handleLogin({ username: 'Mohan', password: '1234' });
  assert.equal(oldPinAttempt.status, 401);
  const newPwdAttempt = await ctx.service.handleLogin({ username: 'Mohan', password: 'Mohan@2026!' });
  assert.equal(newPwdAttempt.status, 200);
});

test('full Multi-Admin workflow: add Rohith, enforce member role limits, edit name, change password, delete Rohith', async () => {
  const ctx = createMultiAdminInMemoryAdapter();

  // 1. Mohan / 1234 -> Login successful
  const mohanLogin = await ctx.service.handleLogin({ username: 'Mohan', password: '1234' });
  assert.equal(mohanLogin.status, 200);
  let mohanToken = mohanLogin.body.customToken;
  const mohanUid = mohanLogin.body.uid;

  // 2. Duplicate Mohan or Rohith creation checks & adding Rohith
  const dupMohan = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'create',
    payload: { username: 'mohan', password: 'Password1!', confirmPassword: 'Password1!' }
  });
  assert.equal(dupMohan.status, 409);

  const addRohith = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'create',
    payload: { username: 'Rohith', password: 'Rohith@123', confirmPassword: 'Rohith@123' }
  });
  assert.equal(addRohith.status, 201);
  assert.equal(addRohith.body.member.username, 'Rohith');
  assert.equal(addRohith.body.member.role, ROLES.ADMIN_MEMBER);
  const rohithUid = addRohith.body.member.uid;
  assert.equal(ctx.getAuthUser(rohithUid).email, `rohith@${INTERNAL_EMAIL_DOMAIN}`);
  assert.equal(ctx.getAuthUser(rohithUid).claims.role, ROLES.ADMIN_MEMBER);
  assert.equal(ctx.getAdminUser(rohithUid).passwordHash, undefined);

  // 3. Rohith logs in with his own credentials
  const rohithLogin1 = await ctx.service.handleLogin({ username: 'Rohith', password: 'Rohith@123' });
  assert.equal(rohithLogin1.status, 200);
  assert.equal(rohithLogin1.body.role, ROLES.ADMIN_MEMBER);
  const rohithToken = rohithLogin1.body.customToken;

  // 4. Rohith (admin_member) is blocked from listing, creating, editing, or deleting members
  for (const forbiddenAction of ['list', 'create', 'updateName', 'changePassword', 'delete']) {
    const res = await ctx.service.handleMemberManagement({
      authorizationHeader: `Bearer ${rohithToken}`,
      action: forbiddenAction,
      payload: { targetUid: mohanUid, username: 'Hacker', password: 'x', confirmPassword: 'x', newName: 'X', newPassword: 'y' }
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PRIMARY_ADMIN_REQUIRED');
  }

  // 5. Primary Admin edits Rohith's name -> Firebase Auth email & Firestore profile update consistently
  const renameRes = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'updateName',
    payload: { targetUid: rohithUid, newName: 'Rohith Sharma' }
  });
  assert.equal(renameRes.status, 200);
  assert.equal(ctx.getAdminUser(rohithUid).username, 'Rohith Sharma');
  assert.equal(ctx.getAuthUser(rohithUid).displayName, 'Rohith Sharma');
  assert.equal(ctx.getAuthUser(rohithUid).email, `rohith.sharma@${INTERNAL_EMAIL_DOMAIN}`);

  // Rename back to Rohith or log in as Rohith Sharma
  const loginRenamed = await ctx.service.handleLogin({ username: 'Rohith Sharma', password: 'Rohith@123' });
  assert.equal(loginRenamed.status, 200);

  // 6. Primary Admin changes Rohith's password -> New password works, Old password rejected
  const changeRohithPwd = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'changePassword',
    payload: { targetUid: rohithUid, newPassword: 'Rohith#2026', confirmPassword: 'Rohith#2026' }
  });
  assert.equal(changeRohithPwd.status, 200);

  const oldPwdTry = await ctx.service.handleLogin({ username: 'Rohith Sharma', password: 'Rohith@123' });
  assert.equal(oldPwdTry.status, 401);
  const newPwdTry = await ctx.service.handleLogin({ username: 'Rohith Sharma', password: 'Rohith#2026' });
  assert.equal(newPwdTry.status, 200);

  // Old token before password change is revoked
  const staleChange = await ctx.service.handleChangeOwnPassword({
    authorizationHeader: `Bearer ${rohithToken}`,
    currentPassword: 'Rohith#2026',
    newPassword: 'Another!1',
    confirmPassword: 'Another!1'
  });
  assert.equal(staleChange.status, 401);

  // 7. Last Primary Admin cannot delete themselves
  const selfDelete = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'delete',
    payload: { targetUid: mohanUid }
  });
  assert.equal(selfDelete.status, 400);

  // 8. Delete Rohith -> Auth account & Firestore profile deleted, login fails, Mohan retains Primary Admin permissions
  const delRohith = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'delete',
    payload: { targetUid: rohithUid }
  });
  assert.equal(delRohith.status, 200);
  assert.equal(ctx.getAuthUser(rohithUid), undefined);
  assert.equal(ctx.getAdminUser(rohithUid), undefined);

  const deletedLogin = await ctx.service.handleLogin({ username: 'Rohith Sharma', password: 'Rohith#2026' });
  assert.equal(deletedLogin.status, 401);

  const mohanStillListed = await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'list'
  });
  assert.equal(mohanStillListed.status, 200);
  assert.equal(mohanStillListed.body.members.length, 2);
  assert.equal(mohanStillListed.body.members.some((m) => m.username === 'Mohan' && m.role === ROLES.PRIMARY_ADMIN), true);
  assert.equal(mohanStillListed.body.members.some((m) => m.username === 'Mohan123' && m.role === ROLES.ADMIN), true);
});

test('create-user flow: seeds Mohan123 once as Admin, provisions Admin & Workers accounts, rejects duplicates and non-admins', async () => {
  const ctx = createMultiAdminInMemoryAdapter();

  // 1. Default test account Mohan123 / 1234 (Role: Admin) works immediately on first login
  const testAdminLogin = await ctx.service.handleLogin({ username: 'Mohan123', password: '1234' });
  assert.equal(testAdminLogin.status, 200);
  assert.equal(testAdminLogin.body.username, 'Mohan123');
  assert.equal(testAdminLogin.body.role, ROLES.ADMIN);
  const mohan123Uid = testAdminLogin.body.uid;
  assert.equal(ctx.getAdminUser(mohan123Uid).role, 'Admin');
  assert.equal(ctx.getAuthUser(mohan123Uid).email, `mohan123@${INTERNAL_EMAIL_DOMAIN}`);

  const adminToken = testAdminLogin.body.customToken;

  // 2. Unauthenticated visitor cannot create user accounts
  const anonCreate = await ctx.service.handleCreateUser({
    authorizationHeader: '',
    username: 'PublicHacker',
    password: 'hack',
    role: 'Admin'
  });
  assert.equal(anonCreate.status, 401);

  // 3. Invalid role is rejected strictly (only Admin or Workers allowed)
  const badRole = await ctx.service.handleCreateUser({
    authorizationHeader: `Bearer ${adminToken}`,
    username: 'TestBadRole',
    password: 'Password1!',
    role: 'SuperUser'
  });
  assert.equal(badRole.status, 400);

  // 4. Duplicate username (case-insensitive) is rejected
  const dupCreate = await ctx.service.handleCreateUser({
    authorizationHeader: `Bearer ${adminToken}`,
    username: 'mohan123',
    password: 'Password1!',
    role: 'Admin'
  });
  assert.equal(dupCreate.status, 409);

  // 5. Provision a Workers account cleanly without storing plaintext password or internalEmail in adminUsers
  const createWorker = await ctx.service.handleCreateUser({
    authorizationHeader: `Bearer ${adminToken}`,
    username: 'WorkerRavi',
    password: 'Work@2026',
    role: 'Workers'
  });
  assert.equal(createWorker.status, 201);
  assert.equal(createWorker.body.message, 'User Created Successfully');
  const workerUid = createWorker.body.uid;
  assert.equal(ctx.getAdminUser(workerUid).username, 'WorkerRavi');
  assert.equal(ctx.getAdminUser(workerUid).role, 'Workers');
  assert.equal(ctx.getAdminUser(workerUid).password, undefined);
  assert.equal(ctx.getAdminUser(workerUid).passwordHash, undefined);
  assert.equal(ctx.getAdminUser(workerUid).internalEmail, undefined);
  assert.equal(ctx.getAuthUser(workerUid).email, `workerravi@${INTERNAL_EMAIL_DOMAIN}`);
  assert.equal(ctx.getAuthUser(workerUid).claims.role, 'Workers');

  // 6. Provision another Admin account
  const createSecondAdmin = await ctx.service.handleCreateUser({
    authorizationHeader: `Bearer ${adminToken}`,
    username: 'PriyaAdmin',
    password: 'Priya@2026',
    role: 'Admin'
  });
  assert.equal(createSecondAdmin.status, 201);
  assert.equal(ctx.getAdminUser(createSecondAdmin.body.uid).role, 'Admin');

  // 7. Workers user can sign in and receives Workers role, but is forbidden from creating users or deleting Admins
  const workerLogin = await ctx.service.handleLogin({ username: 'WorkerRavi', password: 'Work@2026' });
  assert.equal(workerLogin.status, 200);
  assert.equal(workerLogin.body.role, 'Workers');

  const workerCreateTry = await ctx.service.handleCreateUser({
    authorizationHeader: `Bearer ${workerLogin.body.customToken}`,
    username: 'RogueAdmin',
    password: 'Password1!',
    role: 'Admin'
  });
  assert.equal(workerCreateTry.status, 403);

  // 8. Second Admin keeps Admin role across login and own password change, and Mohan123 does not reset on bootstrap re-run
  const changed = await ctx.service.handleChangeOwnPassword({
    authorizationHeader: `Bearer ${adminToken}`,
    currentPassword: '1234',
    newPassword: 'Mohan123!Updated',
    confirmPassword: 'Mohan123!Updated'
  });
  assert.equal(changed.status, 200);
  await ctx.service.ensureInitialPrimaryAdmin();
  const oldPin = await ctx.service.handleLogin({ username: 'Mohan123', password: '1234' });
  assert.equal(oldPin.status, 401);
  const newPwd = await ctx.service.handleLogin({ username: 'Mohan123', password: 'Mohan123!Updated' });
  assert.equal(newPwd.status, 200);
  assert.equal(newPwd.body.role, 'Admin');
});

test('per-account brute-force lockout isolates accounts and unlocks after cooldown', async () => {
  const ctx = createMultiAdminInMemoryAdapter();
  const mohanLogin = await ctx.service.handleLogin({ username: 'Mohan', password: '1234' });
  const mohanToken = mohanLogin.body.customToken;

  await ctx.service.handleMemberManagement({
    authorizationHeader: `Bearer ${mohanToken}`,
    action: 'create',
    payload: { username: 'Rohith', password: 'Rohith@123', confirmPassword: 'Rohith@123' }
  });

  // 8 wrong attempts on Rohith lock ONLY Rohith
  for (let i = 0; i < 8; i += 1) {
    const r = await ctx.service.handleLogin({ username: 'Rohith', password: 'bad-' + i });
    assert.equal(r.status, i === 7 ? 429 : 401);
  }
  const lockedRohith = await ctx.service.handleLogin({ username: 'Rohith', password: 'Rohith@123' });
  assert.equal(lockedRohith.status, 429);

  // Mohan can still sign in cleanly
  const mohanStillOk = await ctx.service.handleLogin({ username: 'Mohan', password: '1234' });
  assert.equal(mohanStillOk.status, 200);

  // Rohith unlocks after cooldown
  ctx.advanceClock(6 * 60 * 1000);
  const rohithRecovered = await ctx.service.handleLogin({ username: 'Rohith', password: 'Rohith@123' });
  assert.equal(rohithRecovered.status, 200);
});
