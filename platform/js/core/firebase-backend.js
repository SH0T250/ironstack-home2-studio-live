// Firebase backend for the platform store.
//
// SAFETY: the platform writes to its OWN collection
//   projects/h2sep/platform_rooms/{docId}
// The live crew app's collection (projects/h2sep/rooms) is never read for
// writes and never touched by this file. Cutover merges the two deliberately,
// with a backup and Austin's approval, not as a side effect of running this.
//
// Realtime: onSnapshot listeners push remote changes into the store within
// seconds. Offline: Firestore persistentLocalCache keeps working with no
// signal and flushes the queue on reconnect.

import { initializeApp } from '../../firebase/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from '../../firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED, collection, doc, onSnapshot, updateDoc, setDoc,
  getDoc, serverTimestamp, deleteField,
} from '../../firebase/firebase-firestore.js';
import { isAbsent } from './store.js';

export const PLATFORM_COLLECTION = ['projects', 'h2sep', 'platform_rooms'];

export class FirebaseBackend {
  constructor(config) {
    this.app = initializeApp(config);
    this.db = initializeFirestore(this.app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    });
    this.auth = getAuth(this.app);
    this.uid = null;
    this.ready = false;
    this.fromCache = false;
    this.pending = 0;
    this._onChange = null;
    this._onStatus = null;
  }

  // Writes are blocked until a uid exists: a write queued before sign-in is
  // rejected at sync time and vanishes silently. This is the crew app's rule.
  async start({ onChange, onStatus }) {
    this._onChange = onChange;
    this._onStatus = onStatus;
    await new Promise(resolve => {
      onAuthStateChanged(this.auth, user => {
        if (user) { this.uid = user.uid; this.ready = true; this._status(); resolve(); }
      });
      signInAnonymously(this.auth).catch(err => {
        this._status('sign-in blocked: ' + err.code);
      });
    });
    this._listen();
  }

  _status(msg) {
    this._onStatus && this._onStatus({
      ready: this.ready, uid: this.uid, fromCache: this.fromCache,
      pending: this.pending, message: msg || null,
    });
  }

  _listen() {
    const col = collection(this.db, ...PLATFORM_COLLECTION);
    onSnapshot(col, { includeMetadataChanges: true }, snap => {
      this.fromCache = snap.metadata.fromCache;
      this.pending = snap.docs.filter(d => d.metadata.hasPendingWrites).length;
      const docs = {};
      snap.forEach(d => { docs[d.id] = d.data(); });
      this._onChange && this._onChange(docs);
      this._status();
    }, err => this._status('listener error: ' + err.code));
  }

  isWriteReady() { return this.ready && !!this.uid; }

  // patch is a map of field paths -> values, exactly like the local backend,
  // so one call site serves both. updateDoc with dotted paths never rewrites
  // sibling fields, which is what protects another person's check-off.
  async patch(docId, patch) {
    if (!this.isWriteReady()) throw new Error('not signed in yet');
    const ref = doc(this.db, ...PLATFORM_COLLECTION, docId);
    const withStamp = { updatedAt: serverTimestamp() };
    // ABSENT means "this field never existed": delete it rather than write null.
    for (const [k, v] of Object.entries(patch)) withStamp[k] = isAbsent(v) ? deleteField() : v;
    await updateDoc(ref, withStamp);
  }

  // Create ONLY when the document really does not exist. A merge write is not
  // safe here: an empty map in the payload (items: {}) is a leaf in the merge
  // field mask, so Firestore writes the empty map OVER the live one and every
  // record in it is gone. Read first, write only into an empty slot.
  async createIfMissing(docId, data) {
    if (!this.isWriteReady()) throw new Error('not signed in yet');
    const ref = doc(this.db, ...PLATFORM_COLLECTION, docId);
    const snap = await getDoc(ref);
    if (snap.exists()) return false;
    await setDoc(ref, data);
    return true;
  }
}
