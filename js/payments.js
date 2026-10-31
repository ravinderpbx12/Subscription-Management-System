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


const paymentTableBody = document.getElementById("paymentTableBody");
const paymentModal = document.getElementById("paymentModal");
const paymentForm = document.getElementById("paymentForm");

let currentUser = null;
let payments = [];
let invoices = [];
let editingPaymentId = null;


// ACTIVITY LOGGING

async function recordPaymentActivity(action, description, title) {
    try {
        await logActivity(action, description);
        await createNotification(title, description, "payment");
    } catch (error) {
        console.error("Payment activity logging error:", error);
    }
}


// HELPERS

function money(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR"
    }).format(Number(amount) || 0);
}


function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


function getLocalDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function generatePaymentNumber() {
    const date = getLocalDate().replaceAll("-", "");
    const random = Math.floor(1000 + Math.random() * 9000);

    return `PAY-${date}-${random}`;
}


// LOAD INVOICES

async function loadInvoices() {
    const invoiceQuery = query(
        collection(db, "invoices"),
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(invoiceQuery);

    invoices = snapshot.docs.map(invoiceDoc => ({
        id: invoiceDoc.id,
        ...invoiceDoc.data()
    }));

    const select = document.getElementById("paymentInvoice");

    select.innerHTML = `<option value="">Select Invoice</option>`;

    invoices
        .filter(invoice => invoice.status !== "cancelled")
        .forEach(invoice => {
            const option = document.createElement("option");

            option.value = invoice.id;
            option.textContent =
                `${invoice.invoiceNumber} — ${invoice.customerName} (${money(invoice.total)})`;

            select.appendChild(option);
        });
}


// LOAD PAYMENTS

async function loadPayments() {
    try {
        const paymentQuery = query(
            collection(db, "payments"),
            where("ownerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(paymentQuery);

        payments = snapshot.docs.map(paymentDoc => ({
            id: paymentDoc.id,
            ...paymentDoc.data()
        }));

        renderPayments();

    } catch (error) {
        console.error("Payment loading error:", error);

        paymentTableBody.innerHTML = `
            <tr>
                <td colspan="8">Unable to load payment records.</td>
            </tr>
        `;
    }
}


// RENDER PAYMENTS

function renderPayments() {
    const search = document
        .getElementById("paymentSearch")
        .value.toLowerCase();

    const statusFilter =
        document.getElementById("paymentStatusFilter").value;

    const filtered = payments.filter(payment => {
        const matchesSearch =
            (payment.paymentNumber || "").toLowerCase().includes(search) ||
            (payment.invoiceNumber || "").toLowerCase().includes(search) ||
            (payment.customerName || "").toLowerCase().includes(search);

        const matchesStatus =
            statusFilter === "all" ||
            payment.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        paymentTableBody.innerHTML = `
            <tr>
                <td colspan="8">No payment records found.</td>
            </tr>
        `;
    } else {
        paymentTableBody.innerHTML = filtered.map(payment => `
            <tr>
                <td>${escapeHTML(payment.paymentNumber)}</td>
                <td>${escapeHTML(payment.invoiceNumber)}</td>
                <td>${escapeHTML(payment.customerName)}</td>
                <td>${escapeHTML(payment.paymentDate)}</td>
                <td>${escapeHTML(formatMethod(payment.method))}</td>
                <td>${money(payment.amount)}</td>

                <td>
                    <span class="status-badge status-${escapeHTML(payment.status)}">
                        ${escapeHTML(payment.status)}
                    </span>
                </td>

                <td class="payment-actions">

                    <button
                        type="button"
                        class="edit-payment"
                        data-id="${escapeHTML(payment.id)}">
                        Edit
                    </button>

                    <button
                        type="button"
                        class="delete-payment"
                        data-id="${escapeHTML(payment.id)}">
                        Delete
                    </button>

                </td>
            </tr>
        `).join("");
    }

    updateStatistics();
}


function formatMethod(method) {
    const methods = {
        upi: "UPI",
        bank_transfer: "Bank Transfer",
        cash: "Cash",
        cheque: "Cheque",
        other: "Other"
    };

    return methods[method] || method || "—";
}


// STATISTICS

function updateStatistics() {
    const completed = payments.filter(
        payment => payment.status === "completed"
    );

    const completedAmount = completed.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
    );

    const pending = payments.filter(
        payment => payment.status === "pending"
    ).length;

    const failed = payments.filter(
        payment => payment.status === "failed"
    ).length;

    document.getElementById("totalPayments").textContent =
        payments.length;

    document.getElementById("completedAmount").textContent =
        money(completedAmount);

    document.getElementById("pendingPayments").textContent =
        pending;

    document.getElementById("failedPayments").textContent =
        failed;
}


// MODAL

function openModal(payment = null) {
    paymentForm.reset();

    editingPaymentId = payment?.id || null;

    document.getElementById("paymentModalTitle").textContent =
        payment ? "Edit Payment" : "Record Payment";

    document.getElementById("paymentId").value =
        payment?.id || "";

    document.getElementById("paymentNumber").value =
        payment?.paymentNumber || generatePaymentNumber();

    document.getElementById("paymentInvoice").value =
        payment?.invoiceId || "";

    document.getElementById("paymentDate").value =
        payment?.paymentDate || getLocalDate();

    document.getElementById("paymentAmount").value =
        payment?.amount ?? "";

    document.getElementById("paymentMethod").value =
        payment?.method || "";

    document.getElementById("paymentStatus").value =
        payment?.status || "completed";

    document.getElementById("paymentReference").value =
        payment?.reference || "";

    document.getElementById("paymentNotes").value =
        payment?.notes || "";

    paymentModal.classList.add("active");
}


function closeModal() {
    paymentModal.classList.remove("active");
    paymentForm.reset();
    editingPaymentId = null;
}


// SAVE PAYMENT

async function savePayment(event) {
    event.preventDefault();

    const saveButton = document.getElementById("savePayment");

    try {
        const invoiceId =
            document.getElementById("paymentInvoice").value;

        const invoice = invoices.find(
            item => item.id === invoiceId
        );

        if (!invoice) {
            alert("Please select a valid invoice.");
            return;
        }

        const amount = Number(
            document.getElementById("paymentAmount").value
        );

        if (!Number.isFinite(amount) || amount <= 0) {
            alert("Enter a valid payment amount.");
            return;
        }

        const paymentDate =
            document.getElementById("paymentDate").value;

        const method =
            document.getElementById("paymentMethod").value;

        const status =
            document.getElementById("paymentStatus").value;

        if (!paymentDate || !method || !status) {
            alert("Please complete all required fields.");
            return;
        }

        const paymentData = {
            paymentNumber:
                document.getElementById("paymentNumber").value,

            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,

            customerId: invoice.customerId,
            customerName: invoice.customerName,

            paymentDate,
            amount,
            method,
            status,

            reference:
                document.getElementById("paymentReference").value.trim(),

            notes:
                document.getElementById("paymentNotes").value.trim(),

            ownerId: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        if (editingPaymentId) {
            const existingPayment = payments.find(
                item => item.id === editingPaymentId
            );

            if (!existingPayment) {
                throw new Error("Payment record not found.");
            }

            await updateDoc(
                doc(db, "payments", editingPaymentId),
                paymentData
            );

            await recordPaymentActivity(
                "Payment Updated",
                `Updated payment ${paymentData.paymentNumber} of ${money(paymentData.amount)}.`,
                "Payment Updated"
            );

        } else {
            paymentData.createdAt = serverTimestamp();

            await addDoc(
                collection(db, "payments"),
                paymentData
            );

            await recordPaymentActivity(
                "Payment Recorded",
                `Recorded payment ${paymentData.paymentNumber} of ${money(paymentData.amount)}.`,
                "Payment Recorded"
            );
        }

        closeModal();

        await loadPayments();

        alert("Payment record saved successfully!");

    } catch (error) {
        console.error("Payment saving error:", error);

        alert(error.message || "Unable to save payment.");

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Payment";
    }
}


// DELETE PAYMENT

async function deletePayment(id) {
    const payment = payments.find(item => item.id === id);

    if (!payment) return;

    const confirmed = confirm(
        `Delete payment record ${payment.paymentNumber}?`
    );

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "payments", id));

        await recordPaymentActivity(
            "Payment Deleted",
            `Deleted payment ${payment.paymentNumber} of ${money(payment.amount)}.`,
            "Payment Deleted"
        );

        await loadPayments();

        alert("Payment record deleted.");

    } catch (error) {
        console.error("Payment deletion error:", error);
        alert("Unable to delete payment.");
    }
}


// EVENT LISTENERS

document.getElementById("openPaymentModal")
    .addEventListener("click", () => openModal());

document.getElementById("closePaymentModal")
    .addEventListener("click", closeModal);

document.getElementById("cancelPayment")
    .addEventListener("click", closeModal);

paymentForm.addEventListener("submit", savePayment);

document.getElementById("paymentSearch")
    .addEventListener("input", renderPayments);

document.getElementById("paymentStatusFilter")
    .addEventListener("change", renderPayments);

paymentTableBody.addEventListener("click", event => {
    const editButton = event.target.closest(".edit-payment");
    const deleteButton = event.target.closest(".delete-payment");

    if (editButton) {
        const payment = payments.find(
            item => item.id === editButton.dataset.id
        );

        if (payment) openModal(payment);
    }

    if (deleteButton) {
        deletePayment(deleteButton.dataset.id);
    }
});


// AUTHENTICATION

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        await loadInvoices();
        await loadPayments();

    } catch (error) {
        console.error("Payment module initialization error:", error);
        alert("Unable to initialize payment management.");
    }
});