import { auth } from "../firebase.js";

import {
    signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

        try {
            await signOut(auth);

            window.location.replace("auth/login.html");

        } catch (error) {
            console.error("Logout failed:", error);
            alert("Unable to logout. Please try again.");
        }

    });

}