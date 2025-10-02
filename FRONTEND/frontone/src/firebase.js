import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBI8Tw8MXTW5WrBlDTQ5ESI5qdsYSYuPtY",
  authDomain: "peerverse-c2dbb.firebaseapp.com",
  projectId: "peerverse-c2dbb",
  storageBucket: "peerverse-c2dbb.firebasestorage.app",
  messagingSenderId: "864294444383",
  appId: "1:864294444383:web:123d3571ebbcd802f2eaea",
  measurementId: "G-R7ECT4KYFT"
};

console.log('Initializing Firebase with config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKey: firebaseConfig.apiKey ? 'Present' : 'Missing'
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

console.log('Firebase app initialized:', !!app);
console.log('Firebase auth initialized:', !!auth);

export default app;