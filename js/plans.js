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


const plansCollection = collection(db, "plans");
const productsCollection = collection(db, "products");

const planForm = document.getElementById("planForm");
const plansGrid = document.getElementById("plansGrid");
const planModal = document.getElementById("planModal");
const planMessage = document.getElementById("planMessage");

let plans = [];
let products = [];
let currentUser = null;


// ACTIVITY LOGGER
async function recordPlanActivity(action, description, title) {
    try {
        await logActivity(action, description);

        await createNotification(
            title,
            description,
            "plan"
        );

    } catch (error) {
        console.error("Plan activity logging error:", error);
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
    planMessage.textContent = text;
    planMessage.style.color = color;
}


// LOAD PRODUCTS FOR DROPDOWN
async function loadProducts() {
    const productQuery = query(
        productsCollection,
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(productQuery);

    products = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));

    const productSelect = document.getElementById("planProduct");

    productSelect.innerHTML = '<option value="">Select Product</option>';

    products
        .filter(product => product.status === "active")
        .forEach(product => {
            const option = document.createElement("option");

            option.value = product.id;
            option.textContent = product.name;

            productSelect.appendChild(option);
        });
}


// LOAD PLANS
async function loadPlans() {
    if (!currentUser) return;

    try {
        const planQuery = query(
            plansCollection,
            where("ownerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(planQuery);

        plans = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        plans.sort((a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );

        renderPlans();

    } catch (error) {
        console.error("Plan loading error:", error);
        plansGrid.textContent = "Unable to load subscription plans.";
    }
}


// DISPLAY PLANS
function renderPlans() {
    const search = document
        .getElementById("searchPlan")
        .value.trim()
        .toLowerCase();

    const status = document.getElementById("planStatusFilter").value;

    const filteredPlans = plans.filter(plan => {

        const matchesSearch =
            (plan.name || "").toLowerCase().includes(search) ||
            (plan.description || "").toLowerCase().includes(search);

        const matchesStatus =
            status === "all" || plan.status === status;

        return matchesSearch && matchesStatus;
    });

    document.getElementById("totalPlans").textContent = plans.length;

    document.getElementById("activePlans").textContent =
        plans.filter(plan => plan.status === "active").length;

    document.getElementById("inactivePlans").textContent =
        plans.filter(plan => plan.status === "inactive").length;

    if (!filteredPlans.length) {
        plansGrid.innerHTML = "<p>No subscription plans found.</p>";
        return;
    }

    plansGrid.innerHTML = filteredPlans.map(plan => {

        const product = products.find(p => p.id === plan.productId);

        const features = (plan.features || [])
            .map(feature => `<li>${escapeHTML(feature)}</li>`)
            .join("");

        return `
            <article class="plan-card">

                <div class="plan-card-top">
                    <span class="plan-status ${escapeHTML(plan.status)}">
                        ${escapeHTML(plan.status)}
                    </span>

                    <span class="plan-billing">
                        ${escapeHTML(plan.billingInterval)}
                    </span>
                </div>

                <h2>${escapeHTML(plan.name)}</h2>

                <p class="plan-product">
                    ${escapeHTML(product?.name || "Product unavailable")}
                </p>

                <h3>
                    ₹${Number(plan.price).toFixed(2)}
                    <small>/ ${escapeHTML(plan.billingInterval)}</small>
                </h3>

                <p>${escapeHTML(plan.description || "")}</p>

                <p class="plan-trial">
                    Free trial: ${Number(plan.trialDays)} days
                </p>

                <ul>${features}</ul>

                <div class="plan-card-actions">
                    <button
                        data-action="edit"
                        data-id="${escapeHTML(plan.id)}"
                    >Edit</button>

                    <button
                        data-action="delete"
                        data-id="${escapeHTML(plan.id)}"
                    >Delete</button>
                </div>

            </article>
        `;
    }).join("");
}


// RESET FORM
function resetPlanForm() {
    planForm.reset();

    document.getElementById("planId").value = "";
    document.getElementById("trialDays").value = 0;

    document.getElementById("planModalTitle").textContent =
        "Create Subscription Plan";

    planMessage.textContent = "";
}


// OPEN MODAL
document.getElementById("addPlanBtn").addEventListener("click", () => {

    resetPlanForm();

    if (products.filter(p => p.status === "active").length === 0) {
        alert("Please create an active product before creating a plan.");
        return;
    }

    planModal.style.display = "flex";
});


// CLOSE MODAL
document.getElementById("closePlanModal").addEventListener("click", () => {
    planModal.style.display = "none";
});


// SAVE PLAN
planForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) return;

    const id = document.getElementById("planId").value;

    const price = Number(document.getElementById("planPrice").value);
    const trialDays = Number(document.getElementById("trialDays").value);

    const productId = document.getElementById("planProduct").value;

    const selectedProduct = products.find(p => p.id === productId);

    if (!selectedProduct || selectedProduct.status !== "active") {
        showMessage("Select a valid active product.", "red");
        return;
    }

    if (!Number.isFinite(price) || price < 0 ||
        !Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
        showMessage("Enter a valid price and trial duration.", "red");
        return;
    }

    const features = document.getElementById("planFeatures")
        .value.split("\n")
        .map(feature => feature.trim())
        .filter(Boolean);

    const planData = {
        name: document.getElementById("planName").value.trim(),
        productId,
        description: document.getElementById("planDescription").value.trim(),
        price,
        currency: "INR",
        billingInterval: document.getElementById("billingInterval").value,
        trialDays,
        features,
        status: document.getElementById("planStatus").value
    };

    if (!planData.name) {
        showMessage("Enter a plan name.", "red");
        return;
    }

    const saveButton = document.getElementById("savePlanBtn");
    saveButton.disabled = true;

    try {

        if (id) {

            // UPDATE PLAN
            await updateDoc(doc(db, "plans", id), {
                ...planData,
                updatedAt: serverTimestamp()
            });

            await recordPlanActivity(
                "Plan Updated",
                `Updated subscription plan: ${planData.name}`,
                "Plan Updated"
            );

            showMessage("Plan updated successfully!");

        } else {

            // CREATE PLAN
            await addDoc(plansCollection, {
                ...planData,
                ownerId: currentUser.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            await recordPlanActivity(
                "Plan Created",
                `Created subscription plan: ${planData.name}`,
                "Plan Created"
            );

            showMessage("Plan created successfully!");
        }

        await loadPlans();

        planModal.style.display = "none";
        resetPlanForm();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "red");

    } finally {
        saveButton.disabled = false;
    }
});


// EDIT AND DELETE
plansGrid.addEventListener("click", async event => {

    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const plan = plans.find(item => item.id === id);

    if (!plan) return;

    if (action === "edit") {

        document.getElementById("planId").value = plan.id;
        document.getElementById("planName").value = plan.name;
        document.getElementById("planProduct").value = plan.productId;
        document.getElementById("planDescription").value =
            plan.description || "";
        document.getElementById("planPrice").value = plan.price;
        document.getElementById("billingInterval").value =
            plan.billingInterval;
        document.getElementById("trialDays").value = plan.trialDays;
        document.getElementById("planFeatures").value =
            (plan.features || []).join("\n");
        document.getElementById("planStatus").value = plan.status;

        document.getElementById("planModalTitle").textContent =
            "Edit Subscription Plan";

        planModal.style.display = "flex";
    }

    if (action === "delete") {

        const confirmed = confirm(
            `Delete the plan "${plan.name}"?`
        );

        if (!confirmed) return;

        try {
            await deleteDoc(doc(db, "plans", id));

            await recordPlanActivity(
                "Plan Deleted",
                `Deleted subscription plan: ${plan.name}`,
                "Plan Deleted"
            );

            await loadPlans();

        } catch (error) {
            console.error(error);
            alert("Unable to delete plan.");
        }
    }
});


// SEARCH AND FILTER
document.getElementById("searchPlan")
    .addEventListener("input", renderPlans);

document.getElementById("planStatusFilter")
    .addEventListener("change", renderPlans);


// AUTHENTICATION
onAuthStateChanged(auth, async user => {

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        await loadProducts();
        await loadPlans();
    } catch (error) {
        console.error(error);
        plansGrid.textContent = "Unable to initialize plans.";
    }
});