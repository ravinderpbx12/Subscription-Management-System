import { auth, db } from "../firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("authMessage");

// REGISTER
if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        try {
            const result = await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

            await setDoc(doc(db, "users", result.user.uid), {
                name,
                email,
                role: "staff",
                createdAt: serverTimestamp()
            });

            message.textContent = "Account created successfully!";
            message.style.color = "green";

            window.location.href = "login.html";

        } catch (error) {
            message.textContent = error.message;
            message.style.color = "red";
        }
    });
}

// LOGIN
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        try {
            await signInWithEmailAndPassword(auth, email, password);

            window.location.href = "../dashboard.html";

        } catch (error) {
            message.textContent = error.message;
            message.style.color = "red";
        }
    });
}