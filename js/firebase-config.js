const firebaseConfig = {
  apiKey: "AIzaSyDme1Dvbp1oC1t7jybR8aQJ2fTxMXBoaVg",
  authDomain: "lost-and-f.firebaseapp.com",
  projectId: "lost-and-f",
  storageBucket: "lost-and-f.firebasestorage.app",
  messagingSenderId: "935045439552",
  appId: "1:935045439552:web:171f117567656e3f0f7fa5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
