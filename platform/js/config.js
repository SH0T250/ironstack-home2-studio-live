// Platform config. The Firebase web config is PUBLIC BY DESIGN (same project
// as the crew app; security lives in Firestore rules, not in hiding these).
// Set firebaseConfig to null to force local-only mode.
//
// THIS MASTER COPY STAYS null (isolated local review). The live deployment
// (ironstack-home2-studio-live) carries the real config in its own copy of
// this file; that is the only difference between the two builds.
export const firebaseConfig = null; // Isolated local preview: backend disabled.
export const PLATFORM_VERSION = '0.2.0';
