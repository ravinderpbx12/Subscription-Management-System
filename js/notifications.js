import { auth, db } from "../firebase.js";

import {
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";


const notificationsList = document.getElementById("notificationsList");
const activityList = document.getElementById("activityList");
const message = document.getElementById("notificationMessage");
const unreadCount = document.getElementById("unreadCount");

const markAllReadButton = document.getElementById("markAllRead");
const refreshButton = document.getElementById("refreshNotifications");

let currentUser = null;
let notifications = [];
let activities = [];
let isLoading = false;


// Show messages
function showMessage(text, type = "success") {
    if (!message) return;

    message.textContent = text;
    message.className = `notification-message ${type}`;
}


// Escape HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return replacements[character];
    });
}


// Convert Firestore timestamp or date value
function getTimestamp(value) {
    if (!value) return 0;

    if (typeof value.toDate === "function") {
        return value.toDate().getTime();
    }

    const timestamp = new Date(value).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
}


// Format date
function formatDate(value) {
    const timestamp = getTimestamp(value);

    if (!timestamp) return "Date unavailable";

    return new Date(timestamp).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


// Load only the current user's documents
async function loadCollection(collectionName) {
    if (!currentUser) return [];

    const userQuery = query(
        collection(db, collectionName),
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(userQuery);

    return snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));
}


// Load notifications and activity logs
async function loadData() {
    if (!currentUser || isLoading) return;

    isLoading = true;

    if (refreshButton) {
        refreshButton.disabled = true;
    }

    showMessage("Loading updates...");

    try {
        const [notificationResult, activityResult] =
            await Promise.allSettled([
                loadCollection("notifications"),
                loadCollection("activityLogs")
            ]);

        const errors = [];

        if (notificationResult.status === "fulfilled") {
            notifications = notificationResult.value;
        } else {
            notifications = [];
            errors.push("notifications");

            console.error(
                "Notification loading error:",
                notificationResult.reason
            );
        }

        if (activityResult.status === "fulfilled") {
            activities = activityResult.value;
        } else {
            activities = [];
            errors.push("activity logs");

            console.error(
                "Activity loading error:",
                activityResult.reason
            );
        }

        renderNotifications();
        renderActivities();

        if (errors.length) {
            showMessage(
                `Could not load: ${errors.join(", ")}. Check Firestore rules.`,
                "error"
            );
        } else {
            showMessage("Updates loaded successfully.");
        }

    } catch (error) {
        console.error("Loading updates error:", error);
        showMessage("Unable to load updates.", "error");

    } finally {
        isLoading = false;

        if (refreshButton) {
            refreshButton.disabled = false;
        }
    }
}


// Render notifications
function renderNotifications() {
    if (!notificationsList || !unreadCount) return;

    const unread = notifications.filter(item => item.read !== true);

    unreadCount.textContent = `Unread: ${unread.length}`;

    if (markAllReadButton) {
        markAllReadButton.disabled = unread.length === 0;
    }

    if (!notifications.length) {
        notificationsList.innerHTML = `
            <p class="notification-empty">
                You don't have any notifications yet.
            </p>
        `;
        return;
    }

    const sorted = [...notifications].sort((a, b) => {
        return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
    });

    notificationsList.innerHTML = sorted.map(item => `
        <article class="notification-item ${item.read ? "read" : "unread"}">
            <div class="notification-dot"></div>

            <div class="notification-content">
                <div class="notification-title-row">
                    <h3>${escapeHTML(item.title || "Notification")}</h3>

                    <span class="notification-type">
                        ${escapeHTML(item.type || "general")}
                    </span>
                </div>

                <p>${escapeHTML(item.message || "")}</p>

                <small>
                    ${escapeHTML(formatDate(item.createdAt))}
                </small>

                <div class="notification-actions">
                    ${item.read ? "" : `
                        <button
                            type="button"
                            class="notification-link"
                            data-action="read"
                            data-id="${escapeHTML(item.id)}">
                            Mark as read
                        </button>
                    `}

                    <button
                        type="button"
                        class="notification-link delete"
                        data-action="delete"
                        data-id="${escapeHTML(item.id)}">
                        Delete
                    </button>
                </div>
            </div>
        </article>
    `).join("");
}


// Render activity logs
function renderActivities() {
    if (!activityList) return;

    if (!activities.length) {
        activityList.innerHTML = `
            <p class="notification-empty">
                No activity has been recorded yet.
            </p>
        `;
        return;
    }

    const sorted = [...activities]
        .sort((a, b) => {
            return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
        })
        .slice(0, 50);

    activityList.innerHTML = sorted.map(item => `
        <article class="activity-item">
            <div class="activity-marker"></div>

            <div>
                <h3>${escapeHTML(item.action || "Account activity")}</h3>

                <p>${escapeHTML(item.description || "")}</p>

                <small>
                    ${escapeHTML(formatDate(item.createdAt))}
                </small>
            </div>
        </article>
    `).join("");
}


// Handle individual notification actions
notificationsList.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button || button.disabled || !currentUser) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const notification = notifications.find(item => item.id === id);

    if (!notification) {
        showMessage("Notification not found.", "error");
        return;
    }

    if (action === "delete") {
        const confirmed = confirm("Delete this notification?");

        if (!confirmed) return;
    }

    button.disabled = true;

    try {
        if (action === "read") {
            await updateDoc(doc(db, "notifications", id), {
                read: true
            });

            showMessage("Notification marked as read.");

        } else if (action === "delete") {
            await deleteDoc(doc(db, "notifications", id));

            showMessage("Notification deleted.");
        }

        await loadData();

    } catch (error) {
        console.error("Notification action error:", error);

        showMessage(
            "Unable to update notification. Please try again.",
            "error"
        );

        button.disabled = false;
    }
});


// Mark all notifications as read
if (markAllReadButton) {
    markAllReadButton.addEventListener("click", async () => {
        if (!currentUser || markAllReadButton.disabled) return;

        const unread = notifications.filter(
            item => item.read !== true
        );

        if (!unread.length) {
            showMessage("There are no unread notifications.");
            return;
        }

        markAllReadButton.disabled = true;

        try {
            await Promise.all(
                unread.map(item =>
                    updateDoc(
                        doc(db, "notifications", item.id),
                        { read: true }
                    )
                )
            );

            showMessage("All notifications marked as read.");

            await loadData();

        } catch (error) {
            console.error("Mark all read error:", error);

            showMessage(
                "Unable to update all notifications.",
                "error"
            );

            markAllReadButton.disabled = false;
        }
    });
}


// Refresh notifications
if (refreshButton) {
    refreshButton.addEventListener("click", loadData);
}


// Authentication
onAuthStateChanged(
    auth,
    user => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;
        loadData();
    },
    error => {
        console.error("Authentication error:", error);
        showMessage("Unable to verify your account.", "error");
    }
);