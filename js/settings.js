import { auth } from "../firebase.js";

import {
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";


const profileForm = document.getElementById("profileForm");
const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const userIdInput = document.getElementById("userId");
const profileAvatar = document.getElementById("profileAvatar");
const message = document.getElementById("settingsMessage");

const resetPasswordButton = document.getElementById("resetPassword");
const logoutButton = document.getElementById("logoutButton");

let currentUser = null;


// Check required HTML elements
const requiredElements = [
    profileForm,
    displayNameInput,
    emailInput,
    userIdInput,
    profileAvatar,
    message,
    resetPasswordButton,
    logoutButton
];

if (requiredElements.some(element => !element)) {
    console.error("Settings page is missing one or more required HTML elements.");
}


// Show messages
function showMessage(text, type = "success") {
    if (!message) return;

    message.textContent = text;
    message.className = `settings-message ${type}`;
}


// Update profile avatar
function updateAvatar(name) {
    if (!profileAvatar) return;

    const firstLetter = String(name || "U")
        .trim()
        .charAt(0)
        .toUpperCase();

    profileAvatar.textContent = firstLetter || "U";
}


// Authentication state
onAuthStateChanged(
    auth,
    user => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        displayNameInput.value = user.displayName || "";
        emailInput.value = user.email || "";
        userIdInput.value = user.uid;

        updateAvatar(user.displayName);
    },
    error => {
        console.error("Authentication state error:", error);
        showMessage("Unable to verify your account. Please log in again.", "error");
    }
);


// Update profile
profileForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        showMessage("Please wait while your account loads.", "error");
        return;
    }

    const newName = displayNameInput.value.trim();

    if (!newName) {
        showMessage("Please enter a display name.", "error");
        return;
    }

    const saveButton = profileForm.querySelector('button[type="submit"]');

    if (!saveButton) return;

    try {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        await updateProfile(currentUser, {
            displayName: newName
        });

        updateAvatar(newName);

        showMessage("Profile updated successfully.");

    } catch (error) {
        console.error("Profile update error:", error);

        showMessage(
            error.message || "Unable to update profile.",
            "error"
        );

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Profile";
    }
});


// Send password reset email
resetPasswordButton.addEventListener("click", async () => {
    if (!currentUser?.email) {
        showMessage("No registered email address found.", "error");
        return;
    }

    if (resetPasswordButton.disabled) return;

    const confirmed = confirm(
        `Send a password reset email to ${currentUser.email}?`
    );

    if (!confirmed) return;

    try {
        resetPasswordButton.disabled = true;
        resetPasswordButton.textContent = "Sending...";

        await sendPasswordResetEmail(auth, currentUser.email);

        showMessage("Password reset email sent. Check your inbox.");

    } catch (error) {
        console.error("Password reset error:", error);

        showMessage(
            error.message || "Unable to send password reset email.",
            "error"
        );

    } finally {
        resetPasswordButton.disabled = false;
        resetPasswordButton.textContent = "Reset Password";
    }
});


// Sign out
logoutButton.addEventListener("click", async () => {
    if (logoutButton.disabled) return;

    const confirmed = confirm("Are you sure you want to sign out?");

    if (!confirmed) return;

    try {
        logoutButton.disabled = true;
        logoutButton.textContent = "Signing out...";

        await signOut(auth);

        window.location.href = "login.html";

    } catch (error) {
        console.error("Logout error:", error);

        showMessage("Unable to sign out. Please try again.", "error");

        logoutButton.disabled = false;
        logoutButton.textContent = "Sign Out";
    }
});