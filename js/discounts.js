import { auth, db } from "../firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    logActivity,
    createNotification
} from "./activity-logger.js";


const discountTableBody =
    document.getElementById("discountTableBody");

const discountModal =
    document.getElementById("discountModal");

const discountForm =
    document.getElementById("discountForm");


let currentUser = null;
let discounts = [];
let editingDiscountId = null;


// ACTIVITY LOGGING

async function recordDiscountActivity(action, description, title) {
    try {
        await logActivity(action, description);
        await createNotification(title, description, "discount");
    } catch (error) {
        console.error("Discount activity logging error:", error);
    }
}


// HELPERS

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


function money(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR"
    }).format(Number(amount) || 0);
}


function getLocalDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// LOAD DISCOUNTS

async function loadDiscounts() {
    try {
        const discountQuery = query(
            collection(db, "discounts"),
            where("ownerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(discountQuery);

        discounts = snapshot.docs.map(discountDoc => ({
            id: discountDoc.id,
            ...discountDoc.data()
        }));

        renderDiscounts();

    } catch (error) {
        console.error("Discount loading error:", error);

        discountTableBody.innerHTML = `
            <tr>
                <td colspan="8">Unable to load discounts.</td>
            </tr>
        `;
    }
}


// RENDER DISCOUNTS

function renderDiscounts() {
    const search = document
        .getElementById("discountSearch")
        .value.toLowerCase();

    const statusFilter =
        document.getElementById("discountStatusFilter").value;

    const filtered = discounts.filter(discount => {

        const matchesSearch =
            (discount.name || "").toLowerCase().includes(search) ||
            (discount.code || "").toLowerCase().includes(search);

        const matchesStatus =
            statusFilter === "all" ||
            discount.status === statusFilter;

        return matchesSearch && matchesStatus;
    });


    if (filtered.length === 0) {
        discountTableBody.innerHTML = `
            <tr>
                <td colspan="8">No discounts found.</td>
            </tr>
        `;
    } else {

        discountTableBody.innerHTML = filtered.map(discount => {

            const value = discount.type === "percentage"
                ? `${discount.value}%`
                : money(discount.value);

            const maximum = discount.maximumRedemptions
                ? discount.maximumRedemptions
                : "Unlimited";

            return `
                <tr>

                    <td>${escapeHTML(discount.name)}</td>

                    <td>
                        <strong>${escapeHTML(discount.code)}</strong>
                    </td>

                    <td>
                        ${discount.type === "percentage"
                            ? "Percentage"
                            : "Fixed Amount"}
                    </td>

                    <td>${escapeHTML(value)}</td>

                    <td>
                        ${escapeHTML(discount.startDate)}
                        <br>
                        to
                        <br>
                        ${escapeHTML(discount.endDate)}
                    </td>

                    <td>
                        ${Number(discount.usedCount || 0)}
                        /
                        ${escapeHTML(String(maximum))}
                    </td>

                    <td>
                        <span class="status-badge status-${escapeHTML(discount.status)}">
                            ${escapeHTML(discount.status)}
                        </span>
                    </td>

                    <td class="discount-actions">

                        <button
                            type="button"
                            class="edit-discount"
                            data-id="${escapeHTML(discount.id)}">
                            Edit
                        </button>

                        <button
                            type="button"
                            class="toggle-discount"
                            data-id="${escapeHTML(discount.id)}">
                            ${discount.status === "active" ? "Deactivate" : "Activate"}
                        </button>

                        <button
                            type="button"
                            class="delete-discount"
                            data-id="${escapeHTML(discount.id)}">
                            Delete
                        </button>

                    </td>

                </tr>
            `;
        }).join("");
    }

    updateStatistics();
}


// STATISTICS

function updateStatistics() {
    const total = discounts.length;

    const active = discounts.filter(
        item => item.status === "active"
    ).length;

    const inactive = discounts.filter(
        item => item.status === "inactive"
    ).length;

    const redemptions = discounts.reduce(
        (sum, item) => sum + Number(item.usedCount || 0),
        0
    );

    document.getElementById("totalDiscounts").textContent = total;
    document.getElementById("activeDiscounts").textContent = active;
    document.getElementById("inactiveDiscounts").textContent = inactive;
    document.getElementById("totalRedemptions").textContent = redemptions;
}


// MODAL

function openModal(discount = null) {
    discountForm.reset();

    editingDiscountId = discount?.id || null;

    document.getElementById("discountModalTitle").textContent =
        discount ? "Edit Discount" : "Create Discount";

    document.getElementById("discountId").value =
        discount?.id || "";

    document.getElementById("discountName").value =
        discount?.name || "";

    document.getElementById("discountCode").value =
        discount?.code || "";

    document.getElementById("discountType").value =
        discount?.type || "percentage";

    document.getElementById("discountValue").value =
        discount?.value ?? "";

    document.getElementById("minimumPurchase").value =
        discount?.minimumPurchase ?? 0;

    document.getElementById("maximumDiscount").value =
        discount?.maximumDiscount ?? "";

    document.getElementById("discountStartDate").value =
        discount?.startDate || getLocalDate();

    document.getElementById("discountEndDate").value =
        discount?.endDate || getLocalDate();

    document.getElementById("maximumRedemptions").value =
        discount?.maximumRedemptions ?? "";

    document.getElementById("discountStatus").value =
        discount?.status || "active";

    document.getElementById("discountDescription").value =
        discount?.description || "";

    discountModal.classList.add("active");
}


function closeModal() {
    discountModal.classList.remove("active");
    discountForm.reset();
    editingDiscountId = null;
}


// VALIDATE DISCOUNT CODE

function isDuplicateCode(code) {
    return discounts.some(discount =>
        discount.code.toUpperCase() === code.toUpperCase() &&
        discount.id !== editingDiscountId
    );
}


// SAVE DISCOUNT

async function saveDiscount(event) {
    event.preventDefault();

    const saveButton = document.getElementById("saveDiscount");

    try {
        const name = document
            .getElementById("discountName")
            .value.trim();

        const code = document
            .getElementById("discountCode")
            .value.trim()
            .toUpperCase();

        const type =
            document.getElementById("discountType").value;

        const value = Number(
            document.getElementById("discountValue").value
        );

        const minimumPurchase = Number(
            document.getElementById("minimumPurchase").value
        );

        const maximumDiscountInput =
            document.getElementById("maximumDiscount").value;

        const maximumDiscount =
            maximumDiscountInput === ""
                ? null
                : Number(maximumDiscountInput);

        const startDate =
            document.getElementById("discountStartDate").value;

        const endDate =
            document.getElementById("discountEndDate").value;

        const maximumRedemptionsInput =
            document.getElementById("maximumRedemptions").value;

        const maximumRedemptions =
            maximumRedemptionsInput === ""
                ? null
                : Number(maximumRedemptionsInput);

        const status =
            document.getElementById("discountStatus").value;

        const description = document
            .getElementById("discountDescription")
            .value.trim();


        if (!name || !code) {
            alert("Please enter a discount name and code.");
            return;
        }

        if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
            alert("Coupon code must contain 3–30 letters, numbers, hyphens or underscores.");
            return;
        }

        if (isDuplicateCode(code)) {
            alert("This coupon code already exists in your discounts.");
            return;
        }

        if (!Number.isFinite(value) || value <= 0) {
            alert("Enter a valid discount value.");
            return;
        }

        if (type === "percentage" && value > 100) {
            alert("Percentage discount cannot exceed 100%.");
            return;
        }

        if (type !== "percentage" && type !== "fixed") {
            alert("Please select a valid discount type.");
            return;
        }

        if (
            !Number.isFinite(minimumPurchase) ||
            minimumPurchase < 0
        ) {
            alert("Enter a valid minimum purchase amount.");
            return;
        }

        if (
            maximumDiscount !== null &&
            (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)
        ) {
            alert("Maximum discount must be greater than zero.");
            return;
        }

        if (
            maximumRedemptions !== null &&
            (!Number.isInteger(maximumRedemptions) || maximumRedemptions < 1)
        ) {
            alert("Maximum redemptions must be a positive whole number.");
            return;
        }

        if (!startDate || !endDate || endDate < startDate) {
            alert("Please enter valid discount dates.");
            return;
        }

        if (!["active", "inactive"].includes(status)) {
            alert("Please select a valid discount status.");
            return;
        }

        const discountData = {
            name,
            code,
            type,
            value,
            minimumPurchase,
            maximumDiscount,
            startDate,
            endDate,
            maximumRedemptions,
            status,
            description,
            ownerId: currentUser.uid,
            updatedAt: serverTimestamp()
        };


        saveButton.disabled = true;
        saveButton.textContent = "Saving...";


        if (editingDiscountId) {

            const existing = discounts.find(
                item => item.id === editingDiscountId
            );

            if (!existing) {
                throw new Error("Discount not found.");
            }

            discountData.usedCount = existing.usedCount || 0;
            discountData.createdAt = existing.createdAt;

            await updateDoc(
                doc(db, "discounts", editingDiscountId),
                discountData
            );

            await recordDiscountActivity(
                "Discount Updated",
                `Updated discount ${code}.`,
                "Discount Updated"
            );

        } else {

            discountData.usedCount = 0;
            discountData.createdAt = serverTimestamp();

            await addDoc(
                collection(db, "discounts"),
                discountData
            );

            await recordDiscountActivity(
                "Discount Created",
                `Created discount ${code}.`,
                "Discount Created"
            );
        }

        closeModal();

        await loadDiscounts();

        alert("Discount saved successfully!");

    } catch (error) {
        console.error("Discount saving error:", error);

        alert(error.message || "Unable to save discount.");

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Discount";
    }
}


// TOGGLE STATUS

async function toggleDiscount(id) {
    const discount = discounts.find(item => item.id === id);

    if (!discount) return;

    const newStatus =
        discount.status === "active" ? "inactive" : "active";

    try {
        await updateDoc(
            doc(db, "discounts", id),
            {
                status: newStatus,
                updatedAt: serverTimestamp()
            }
        );

        await recordDiscountActivity(
            "Discount Status Changed",
            `Discount ${discount.code} was ${newStatus === "active" ? "activated" : "deactivated"}.`,
            `Discount ${newStatus === "active" ? "Activated" : "Deactivated"}`
        );

        await loadDiscounts();

    } catch (error) {
        console.error("Discount status update error:", error);
        alert("Unable to update discount status.");
    }
}


// DELETE DISCOUNT

async function deleteDiscount(id) {
    const discount = discounts.find(item => item.id === id);

    if (!discount) return;

    if (!confirm(`Delete discount ${discount.code}?`)) return;

    try {
        await deleteDoc(doc(db, "discounts", id));

        await recordDiscountActivity(
            "Discount Deleted",
            `Deleted discount ${discount.code}.`,
            "Discount Deleted"
        );

        await loadDiscounts();

        alert("Discount deleted successfully.");

    } catch (error) {
        console.error("Discount deletion error:", error);
        alert("Unable to delete discount.");
    }
}


// EVENT LISTENERS

document.getElementById("openDiscountModal")
    .addEventListener("click", () => openModal());

document.getElementById("closeDiscountModal")
    .addEventListener("click", closeModal);

document.getElementById("cancelDiscount")
    .addEventListener("click", closeModal);

discountForm.addEventListener("submit", saveDiscount);

document.getElementById("discountSearch")
    .addEventListener("input", renderDiscounts);

document.getElementById("discountStatusFilter")
    .addEventListener("change", renderDiscounts);


discountTableBody.addEventListener("click", event => {

    const editButton = event.target.closest(".edit-discount");
    const toggleButton = event.target.closest(".toggle-discount");
    const deleteButton = event.target.closest(".delete-discount");

    if (editButton) {
        const discount = discounts.find(
            item => item.id === editButton.dataset.id
        );

        if (discount) openModal(discount);
    }

    if (toggleButton) {
        toggleDiscount(toggleButton.dataset.id);
    }

    if (deleteButton) {
        deleteDiscount(deleteButton.dataset.id);
    }
});


// AUTHENTICATION

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    await loadDiscounts();
});