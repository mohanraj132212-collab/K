'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createMultiAdminAuthService } = require('./auth-core');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const adminAuth = admin.auth();

function toTimestampMs(val, fallbackMs = 0) {
  if (!val) return fallbackMs;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
  }
  return fallbackMs;
}

function buildFirestoreMultiAdminService() {
  const adminUsersCol = db.collection('adminUsers');
  const adminCredsCol = db.collection('adminCredentials');
  const adminsAllowCol = db.collection('admins');
  const bootstrapRef = db.collection('settings').doc('adminBootstrap');
  const securityMetaRef = db.collection('settings').doc('security');

  function formatProfileDoc(snapData, uidFallback = '') {
    if (!snapData) return null;
    const createdAtMs = toTimestampMs(snapData.createdAt, Number(snapData.createdAtMs || 0));
    const updatedAtMs = toTimestampMs(snapData.updatedAt, Number(snapData.updatedAtMs || createdAtMs));
    return {
      uid: String(snapData.uid || uidFallback || ''),
      username: String(snapData.username || ''),
      role: String(snapData.role || 'admin_member'),
      isActive: snapData.isActive !== false,
      sessionVersion: Math.max(1, Number(snapData.sessionVersion) || 1),
      createdAtMs,
      updatedAtMs
    };
  }

  return createMultiAdminAuthService({
    async getBootstrapState() {
      const snap = await bootstrapRef.get();
      return snap.exists ? snap.data() : null;
    },

    async markBootstrapInitialized(data) {
      const payload = {
        initializedAt: admin.firestore.FieldValue.serverTimestamp(),
        initializedAtMs: Number(data.initializedAtMs || Date.now())
      };
      if (data.initialized !== undefined) {
        payload.initialized = Boolean(data.initialized);
      }
      if (data.primaryAdminUid) {
        payload.primaryAdminUid = String(data.primaryAdminUid);
      }
      if (data.defaultTestAccountSeeded !== undefined) {
        payload.defaultTestAccountSeeded = Boolean(data.defaultTestAccountSeeded);
      }
      if (data.defaultTestAdminUid !== undefined) {
        payload.defaultTestAdminUid = String(data.defaultTestAdminUid || '');
      }
      await bootstrapRef.set(payload, { merge: true });
    },

    async runBootstrapTransaction({ uid, profile, cred, bootstrapDoc }) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(bootstrapRef);
        if (snap.exists && snap.data() && snap.data().initialized === true) {
          return { createdHere: false, bootstrapDoc: snap.data() };
        }

        const profilePayload = {
          uid: profile.uid,
          username: profile.username,
          role: profile.role,
          isActive: profile.isActive !== false,
          sessionVersion: profile.sessionVersion || 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        tx.set(adminUsersCol.doc(uid), profilePayload);
        tx.set(adminCredsCol.doc(uid), {
          ...cred,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        tx.set(adminsAllowCol.doc(uid), {
          active: true,
          role: profile.role,
          sessionVersion: profile.sessionVersion || 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        tx.set(bootstrapRef, {
          initialized: true,
          primaryAdminUid: uid,
          initializedAt: admin.firestore.FieldValue.serverTimestamp(),
          initializedAtMs: bootstrapDoc.initializedAtMs
        });
        tx.set(
          securityMetaRef,
          {
            isPasswordInitialized: true,
            mustChangePassword: false,
            sessionVersion: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        return { createdHere: true, bootstrapDoc };
      });
    },

    async getAdminByUsernameLower(usernameLower) {
      const snap = await adminCredsCol.where('usernameLower', '==', usernameLower).limit(1).get();
      if (snap.empty) return null;
      return snap.docs[0].data();
    },

    async findAdminByInternalEmail(email) {
      const snap = await adminCredsCol.where('internalEmail', '==', email).limit(1).get();
      if (snap.empty) return null;
      return snap.docs[0].data();
    },

    async getAdminByUid(uid) {
      const [profileSnap, credSnap] = await Promise.all([
        adminUsersCol.doc(uid).get(),
        adminCredsCol.doc(uid).get()
      ]);
      return {
        profile: profileSnap.exists ? formatProfileDoc(profileSnap.data(), uid) : null,
        cred: credSnap.exists ? credSnap.data() : null
      };
    },

    async listAdminUsers() {
      const snap = await adminUsersCol.get();
      return snap.docs.map((d) => formatProfileDoc(d.data(), d.id));
    },

    async saveNewAdminRecords({ uid, profile, cred, allowlist }) {
      const batch = db.batch();
      batch.set(adminUsersCol.doc(uid), {
        uid: profile.uid,
        username: profile.username,
        role: profile.role,
        isActive: profile.isActive !== false,
        sessionVersion: profile.sessionVersion || 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batch.set(adminCredsCol.doc(uid), {
        ...cred,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batch.set(adminsAllowCol.doc(uid), {
        ...(allowlist || { active: true, role: profile.role, sessionVersion: 1 }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
    },

    async updateAdminRecords(uid, { profilePatch, credPatch, allowlistPatch }) {
      const batch = db.batch();
      if (profilePatch) {
        const cleanProfile = { ...profilePatch };
        delete cleanProfile.updatedAtServer;
        delete cleanProfile.usernameLower;
        delete cleanProfile.updatedAtMs;
        cleanProfile.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.set(adminUsersCol.doc(uid), cleanProfile, { merge: true });
      }
      if (credPatch) {
        batch.set(
          adminCredsCol.doc(uid),
          {
            ...credPatch,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
      if (allowlistPatch) {
        batch.set(
          adminsAllowCol.doc(uid),
          {
            ...allowlistPatch,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
      await batch.commit();
    },

    async deleteAdminRecords(uid) {
      const batch = db.batch();
      batch.delete(adminUsersCol.doc(uid));
      batch.delete(adminCredsCol.doc(uid));
      batch.delete(adminsAllowCol.doc(uid));
      await batch.commit();
    },

    async createAuthUser({ email, displayName, password }) {
      try {
        const userRecord = await adminAuth.createUser({
          email,
          displayName,
          password,
          emailVerified: true,
          disabled: false
        });
        return { uid: userRecord.uid, email: userRecord.email };
      } catch (err) {
        if (err && err.code === 'auth/email-already-exists') {
          const existing = await adminAuth.getUserByEmail(email);
          return { uid: existing.uid, email: existing.email };
        }
        throw err;
      }
    },

    async getAuthUserByEmail(email) {
      try {
        const userRecord = await adminAuth.getUserByEmail(email);
        return { uid: userRecord.uid, email: userRecord.email, disabled: userRecord.disabled };
      } catch (err) {
        if (err && err.code === 'auth/user-not-found') return null;
        throw err;
      }
    },

    async getAuthUser(uid) {
      try {
        const userRecord = await adminAuth.getUser(uid);
        return { uid: userRecord.uid, email: userRecord.email, disabled: userRecord.disabled };
      } catch (err) {
        if (err && err.code === 'auth/user-not-found') return null;
        throw err;
      }
    },

    async updateAuthUser(uid, updates) {
      const payload = {};
      if (updates.email !== undefined) payload.email = updates.email;
      if (updates.displayName !== undefined) payload.displayName = updates.displayName;
      if (updates.password !== undefined) payload.password = updates.password;
      if (updates.disabled !== undefined) payload.disabled = updates.disabled;
      await adminAuth.updateUser(uid, payload);
    },

    async setCustomUserClaims(uid, claims) {
      await adminAuth.setCustomUserClaims(uid, claims);
    },

    async revokeUserTokens(uid) {
      await adminAuth.revokeRefreshTokens(uid);
    },

    async deleteAuthUser(uid) {
      await adminAuth.deleteUser(uid);
    },

    async verifyIdToken(token) {
      return adminAuth.verifyIdToken(token, true);
    },

    async createCustomToken(uid, claims) {
      return adminAuth.createCustomToken(uid, claims);
    }
  });
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_err) {
      return {};
    }
  }
  return {};
}

exports.adminLogin = onRequest(
  {
    region: 'us-central1',
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      const body = readJsonBody(req);
      const service = buildFirestoreMultiAdminService();
      const result = await service.handleLogin({
        username: body.username,
        password: body.password
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('adminLogin error:', err && err.message ? err.message : err);
      res.status(500).json({
        ok: false,
        error: 'Unable to process login request securely right now.'
      });
    }
  }
);

exports.adminChangePassword = onRequest(
  {
    region: 'us-central1',
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      const body = readJsonBody(req);
      const service = buildFirestoreMultiAdminService();
      const result = await service.handleChangeOwnPassword({
        authorizationHeader: req.headers.authorization || '',
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        confirmPassword: body.confirmPassword
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('adminChangePassword error:', err && err.message ? err.message : err);
      res.status(500).json({
        ok: false,
        error: 'Unable to update admin password securely right now.'
      });
    }
  }
);

exports.adminCreateUser = onRequest(
  {
    region: 'us-central1',
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      const body = readJsonBody(req);
      const service = buildFirestoreMultiAdminService();
      const result = await service.handleCreateUser({
        authorizationHeader: req.headers.authorization || '',
        username: body.username,
        password: body.password,
        role: body.role
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('adminCreateUser error:', err && err.message ? err.message : err);
      res.status(500).json({
        ok: false,
        error: 'Unable to create user account securely right now.'
      });
    }
  }
);

exports.adminMembers = onRequest(
  {
    region: 'us-central1',
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      const body = readJsonBody(req);
      const service = buildFirestoreMultiAdminService();
      const result = await service.handleMemberManagement({
        authorizationHeader: req.headers.authorization || '',
        action: body.action,
        payload: body
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('adminMembers error:', err && err.message ? err.message : err);
      res.status(500).json({
        ok: false,
        error: 'Unable to complete administrator management request right now.'
      });
    }
  }
);
