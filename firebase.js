import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// Replace these values with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyB6Y_wR6Sttc-rZ_gO_bvkqcWJVlvvYTRg",
  authDomain: "subscription-management-c0c8a.firebaseapp.com",
  projectId: "subscription-management-c0c8a",
  storageBucket: "subscription-management-c0c8a.firebasestorage.app",
  messagingSenderId: "778543438157",
  appId: "1:778543438157:web:e6311096ce6f80a00d3f04",
  measurementId: "G-300E6QVXTY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Brightloop Firebase connected successfully!");

export { app, auth, db };