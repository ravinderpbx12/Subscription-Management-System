import { auth, db } from "../firebase.js";

import {
    logActivity,
    createNotification
} from "./activity-logger.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


const customersCollection = collection(db, "customers");
const productsCollection = collection(db, "products");
const plansCollection = collection(db, "plans");
const subscriptionsCollection = collection(db, "subscriptions");

const form = document.getElementById("subscriptionForm");
const tableBody = document.getElementById("subscriptionTableBody");
const modal = document.getElementById("subscriptionModal");
const message = document.getElementById("subscriptionMessage");

let customers = [];
let products = [];
let plans = [];
let subscriptions = [];
let currentUser = null;


// ACTIVITY LOGGER
async function recordSubscriptionActivity(action, description, title) {
    try {
        await logActivity(action, description);

        await createNotification(
            title,
            description,
            "subscription"
        );

    } catch (error) {
        console.error("Subscription activity logging error:", error);
    }
}


function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


function showMessage(text, color = "green") {
    message.textContent = text;
    message.style.color = color;
}


function formatDate(value) {
    if (!value) return "-";

    const date = new Date(`${value}T00:00:00`);

    return date.toLocaleDateString("en-IN");
}


function addBillingPeriod(startDate, interval) {
    const date = new Date(`${startDate}T12:00:00`);

    if (interval === "monthly") {
        date.setMonth(date.getMonth() + 1);
    } else if (interval === "quarterly") {
        date.setMonth(date.getMonth() + 3);
    } else if (interval === "yearly") {
        date.setFullYear(date.getFullYear() + 1);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function addDays(startDate, days) {
    const date = new Date(`${startDate}T12:00:00`);
    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// LOAD ALL REQUIRED DATA

async function loadCollection(collectionRef) {
    const q = query(
        collectionRef,
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));
}


async function loadAllData() {
    customers = await loadCollection(customersCollection);
    products = await loadCollection(productsCollection);
    plans = await loadCollection(plansCollection);
    subscriptions = await loadCollection(subscriptionsCollection);

    populateDropdowns();
    renderSubscriptions();
}


// POPULATE DROPDOWNS

function populateDropdowns() {
    const customerSelect = document.getElementById("subscriptionCustomer");
    const productSelect = document.getElementById("subscriptionProduct");

    customerSelect.innerHTML = '<option value="">Select Customer</option>';
    productSelect.innerHTML = '<option value="">Select Product</option>';

    customers
        .filter(customer => customer.status === "active")
        .forEach(customer => {
            const option = document.createElement("option");
            option.value = customer.id;
            option.textContent = customer.name;
            customerSelect.appendChild(option);
        });

    products
        .filter(product => product.status === "active")
        .forEach(product => {
            const option = document.createElement("option");
            option.value = product.id;
            option.textContent = product.name;
            productSelect.appendChild(option);
        });

    updatePlanDropdown();
}


function updatePlanDropdown(selectedPlanId = "") {
    const productId = document.getElementById("subscriptionProduct").value;
    const planSelect = document.getElementById("subscriptionPlan");

    planSelect.innerHTML = '<option value="">Select Plan</option>';

    plans
        .filter(plan =>
            plan.productId === productId &&
            plan.status === "active"
        )
        .forEach(plan => {
            const option = document.createElement("option");
            option.value = plan.id;
            option.textContent =
                `${plan.name} — ₹${Number(plan.price).toFixed(2)}`;

            planSelect.appendChild(option);
        });

    planSelect.value = selectedPlanId;
}


document.getElementById("subscriptionProduct")
    .addEventListener("change", () => updatePlanDropdown());


// RENDER SUBSCRIPTIONS

function renderSubscriptions() {
    const search = document
        .getElementById("searchSubscription")
        .value.trim()
        .toLowerCase();

    const statusFilter =
        document.getElementById("subscriptionStatusFilter").value;

    const filtered = subscriptions.filter(subscription => {
        const customer = customers.find(
            c => c.id === subscription.customerId
        );

        const matchesSearch =
            (customer?.name || "").toLowerCase().includes(search);

        const matchesStatus =
            statusFilter === "all" ||
            subscription.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    document.getElementById("totalSubscriptions").textContent =
        subscriptions.length;

    document.getElementById("activeSubscriptions").textContent =
        subscriptions.filter(s => s.status === "active").length;

    document.getElementById("trialSubscriptions").textContent =
        subscriptions.filter(s => s.status === "trial").length;

    document.getElementById("cancelledSubscriptions").textContent =
        subscriptions.filter(s => s.status === "cancelled").length;

    if (!filtered.length) {
        tableBody.innerHTML = `
            <tr><td colspan="8">No subscriptions found.</td></tr>
        `;
        return;
    }

    tableBody.innerHTML = filtered.map(subscription => {
        const customer = customers.find(
            c => c.id === subscription.customerId
        );

        const product = products.find(
            p => p.id === subscription.productId
        );

        const plan = plans.find(
            p => p.id === subscription.planId
        );

        return `
            <tr>
                <td>${escapeHTML(customer?.name || "Unknown")}</td>
                <td>${escapeHTML(product?.name || "Unknown")}</td>
                <td>${escapeHTML(plan?.name || "Unknown")}</td>
                <td>₹${Number(subscription.price).toFixed(2)}</td>
                <td>${formatDate(subscription.startDate)}</td>
                <td>${formatDate(subscription.nextBillingDate)}</td>
                <td>
                    <span class="subscription-status ${escapeHTML(subscription.status)}">
                        ${escapeHTML(subscription.status)}
                    </span>
                </td>
                <td>
                    <button data-action="edit" data-id="${escapeHTML(subscription.id)}">
                        Edit
                    </button>

                    <button data-action="delete" data-id="${escapeHTML(subscription.id)}">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}


// RESET FORM

function resetForm() {
    form.reset();

    document.getElementById("subscriptionId").value = "";
    document.getElementById("subscriptionModalTitle").textContent =
        "Create Subscription";

    updatePlanDropdown();

    message.textContent = "";
}


// OPEN MODAL

document.getElementById("addSubscriptionBtn")
    .addEventListener("click", () => {

        if (!customers.some(c => c.status === "active")) {
            alert("Add an active customer first.");
            return;
        }

        if (!products.some(p => p.status === "active")) {
            alert("Add an active product first.");
            return;
        }

        resetForm();

        document.getElementById("subscriptionStart").value =
            new Date().toLocaleDateString("en-CA");

        modal.style.display = "flex";
    });


// CLOSE MODAL

document.getElementById("closeSubscriptionModal")
    .addEventListener("click", () => {
        modal.style.display = "none";
    });


// SAVE SUBSCRIPTION

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) return;

    const id = document.getElementById("subscriptionId").value;

    const customerId =
        document.getElementById("subscriptionCustomer").value;

    const productId =
        document.getElementById("subscriptionProduct").value;

    const planId =
        document.getElementById("subscriptionPlan").value;

    const startDate =
        document.getElementById("subscriptionStart").value;

    const status =
        document.getElementById("subscriptionStatus").value;

    const customer = customers.find(c => c.id === customerId);
    const product = products.find(p => p.id === productId);
    const plan = plans.find(p => p.id === planId);

    if (!customer || !product || !plan ||
        plan.productId !== productId) {
        showMessage("Please select a valid customer, product and plan.", "red");
        return;
    }

    if (!startDate) {
        showMessage("Select a start date.", "red");
        return;
    }

    const today = new Date().toLocaleDateString("en-CA");

    if (startDate < today) {
        showMessage("Start date cannot be in the past.", "red");
        return;
    }

    const trialEndDate = plan.trialDays > 0
        ? addDays(startDate, plan.trialDays)
        : null;

    const nextBillingDate = plan.trialDays > 0
        ? trialEndDate
        : addBillingPeriod(startDate, plan.billingInterval);

    const subscriptionData = {
        customerId,
        productId,
        planId,

        customerName: customer.name,
        productName: product.name,
        planName: plan.name,

        price: Number(plan.price),
        currency: "INR",
        billingInterval: plan.billingInterval,

        startDate,
        trialEndDate,
        nextBillingDate,

        status,

        updatedAt: serverTimestamp()
    };

    const saveButton =
        document.getElementById("saveSubscriptionBtn");

    saveButton.disabled = true;

    try {
        if (id) {
            const existing = subscriptions.find(s => s.id === id);

            if (!existing) {
                throw new Error("Subscription not found.");
            }

            if (existing.status === "cancelled" ||
                existing.status === "expired") {
                throw new Error("This subscription cannot be edited.");
            }

            await updateDoc(doc(db, "subscriptions", id), subscriptionData);

            await recordSubscriptionActivity(
                "Subscription Updated",
                `Updated subscription for ${customer.name} (${plan.name})`,
                "Subscription Updated"
            );

        } else {
            await addDoc(subscriptionsCollection, {
                ...subscriptionData,
                ownerId: currentUser.uid,
                createdAt: serverTimestamp()
            });

            await recordSubscriptionActivity(
                "Subscription Created",
                `Created subscription for ${customer.name} (${plan.name})`,
                "Subscription Created"
            );
        }

        await loadAllData();

        modal.style.display = "none";
        resetForm();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "red");

    } finally {
        saveButton.disabled = false;
    }
});


// EDIT AND DELETE

tableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const subscription = subscriptions.find(s => s.id === id);

    if (!subscription) return;

    if (action === "edit") {
        if (subscription.status === "cancelled" ||
            subscription.status === "expired") {
            alert("Cancelled or expired subscriptions cannot be edited.");
            return;
        }

        resetForm();

        document.getElementById("subscriptionId").value = subscription.id;
        document.getElementById("subscriptionCustomer").value =
            subscription.customerId;

        document.getElementById("subscriptionProduct").value =
            subscription.productId;

        updatePlanDropdown(subscription.planId);

        document.getElementById("subscriptionStart").value =
            subscription.startDate;

        document.getElementById("subscriptionStatus").value =
            subscription.status;

        document.getElementById("subscriptionModalTitle").textContent =
            "Edit Subscription";

        modal.style.display = "flex";
    }

    if (action === "delete") {
        if (!confirm("Delete this subscription record?")) return;

        try {
            await deleteDoc(doc(db, "subscriptions", id));

            await recordSubscriptionActivity(
                "Subscription Deleted",
                `Deleted subscription for ${subscription.customerName || "Unknown customer"} (${subscription.planName || "Unknown plan"})`,
                "Subscription Deleted"
            );

            await loadAllData();

        } catch (error) {
            console.error(error);
            alert("Unable to delete subscription.");
        }
    }
});


// SEARCH AND FILTER

document.getElementById("searchSubscription")
    .addEventListener("input", renderSubscriptions);

document.getElementById("subscriptionStatusFilter")
    .addEventListener("change", renderSubscriptions);


// AUTHENTICATION

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        await loadAllData();

    } catch (error) {
        console.error(error);

        tableBody.innerHTML = `
            <tr><td colspan="8">Unable to initialize subscriptions.</td></tr>
        `;
    }
});