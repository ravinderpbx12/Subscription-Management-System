import { auth, db } from "../firebase.js";

import {
    addDoc,
    collection,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


export async function logActivity(action, description) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("User is not authenticated.");
    }

    return addDoc(collection(db, "activityLogs"), {
        ownerId: user.uid,
        action,
        description,
        createdAt: serverTimestamp()
    });
}


export async function createNotification(title, message, type = "general") {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("User is not authenticated.");
    }

    return addDoc(collection(db, "notifications"), {
        ownerId: user.uid,
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp()
    });
}