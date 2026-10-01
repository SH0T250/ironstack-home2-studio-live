// Platform config. The Firebase web config is PUBLIC BY DESIGN (same project
// as the crew app; security lives in Firestore rules, not in hiding these).
// Set firebaseConfig to null to force local-only mode.
//
// LIVE DEPLOYMENT COPY: this file carries the real H2SEP project config, so
// the dashboard boots as a live client (identity sheet, realtime sync to the
// platform's own ledger). The master repo's copy of this file stays null.
export const firebaseConfig = {
  apiKey: "AIzaSyAMRImRm7n7DsDACwH_71gChJTKRkaciT8",
  authDomain: "h2sep-checklist.firebaseapp.com",
  projectId: "h2sep-checklist",
  storageBucket: "h2sep-checklist.firebasestorage.app",
  messagingSenderId: "820802916628",
  appId: "1:820802916628:web:bb68175f726f1119f4b201",
  measurementId: "G-3GQLPJ1VXS",
};
export const PLATFORM_VERSION = '0.2.0';
