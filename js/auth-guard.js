import { auth, db } from "../firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.replace("auth/login.html");
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            await signOut(auth);
            window.location.replace("auth/login.html");
            return;
        }

        const userData = userSnap.data();

        // Display logged-in user's name
        const nameElement = document.getElementById("userName");

        if (nameElement) {
            nameElement.textContent = userData.name;
        }

        console.log("Authenticated:", userData.name);
        console.log("Role:", userData.role);

    } catch (error) {
        console.error("Authentication error:", error);
        alert("Unable to verify your account. Please try again.");
        await signOut(auth);
        window.location.replace("auth/login.html");
    }
});