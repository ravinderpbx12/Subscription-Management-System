import { auth, db } from "../firebase.js";

import {
    logActivity,
    createNotification
} from "./activity-logger.js";

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

const invoiceTableBody = document.getElementById("invoiceTableBody");
const invoiceModal = document.getElementById("invoiceModal");
const invoiceForm = document.getElementById("invoiceForm");
const invoiceItems = document.getElementById("invoiceItems");

let currentUser = null;
let invoices = [];
let customers = [];
let editingInvoiceId = null;


// ACTIVITY LOGGER
async function recordInvoiceActivity(action, description, title) {
    try {
        await logActivity(action, description);

        await createNotification(
            title,
            description,
            "invoice"
        );

    } catch (error) {
        console.error("Invoice activity logging error:", error);
    }
}


const money = amount =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR"
    }).format(Number(amount) || 0);


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


function generateInvoiceNumber() {
    const date = getLocalDate().replaceAll("-", "");
    const random = Math.floor(1000 + Math.random() * 9000);

    return `INV-${date}-${random}`;
}


function calculateTotals() {
    let subtotal = 0;

    document.querySelectorAll(".invoice-item-row").forEach(row => {
        const quantity = Number(row.querySelector(".item-quantity").value) || 0;
        const price = Number(row.querySelector(".item-price").value) || 0;

        subtotal += quantity * price;
    });

    const taxRate = Number(document.getElementById("invoiceTax").value) || 0;
    const taxAmount = subtotal * taxRate / 100;
    const total = subtotal + taxAmount;

    document.getElementById("invoiceSubtotal").textContent = money(subtotal);
    document.getElementById("invoiceTaxAmount").textContent = money(taxAmount);
    document.getElementById("invoiceGrandTotal").textContent = money(total);

    return {
        subtotal,
        taxRate,
        taxAmount,
        total
    };
}


function addItemRow(item = {}) {
    const row = document.createElement("div");

    row.className = "invoice-item-row";

    row.innerHTML = `
        <input
            type="text"
            class="item-description"
            placeholder="Item description"
            value="${escapeHTML(item.description || "")}"
            required
        >

        <input
            type="number"
            class="item-quantity"
            min="1"
            step="1"
            value="${item.quantity || 1}"
            required
        >

        <input
            type="number"
            class="item-price"
            min="0"
            step="0.01"
            value="${item.price ?? 0}"
            required
        >

        <button type="button" class="remove-invoice-item">✕</button>
    `;

    invoiceItems.appendChild(row);

    row.querySelector(".remove-invoice-item").addEventListener("click", () => {
        row.remove();

        if (!invoiceItems.querySelector(".invoice-item-row")) {
            addItemRow();
        }

        calculateTotals();
    });

    row.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", calculateTotals);
    });

    calculateTotals();
}


// LOAD CUSTOMERS
async function loadCustomers() {
    const customerQuery = query(
        collection(db, "customers"),
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(customerQuery);

    customers = snapshot.docs.map(customerDoc => ({
        id: customerDoc.id,
        ...customerDoc.data()
    }));

    const select = document.getElementById("invoiceCustomer");

    select.innerHTML = `<option value="">Select Customer</option>`;

    customers.forEach(customer => {
        const option = document.createElement("option");

        option.value = customer.id;
        option.textContent = customer.name || customer.email || "Unnamed Customer";

        select.appendChild(option);
    });
}


// LOAD INVOICES
async function loadInvoices() {
    try {
        const invoiceQuery = query(
            collection(db, "invoices"),
            where("ownerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(invoiceQuery);

        invoices = snapshot.docs.map(invoiceDoc => ({
            id: invoiceDoc.id,
            ...invoiceDoc.data()
        }));

        renderInvoices();

    } catch (error) {
        console.error("Invoice loading error:", error);

        invoiceTableBody.innerHTML = `
            <tr><td colspan="7">Unable to load invoices.</td></tr>
        `;
    }
}


// RENDER INVOICES
function renderInvoices() {
    const search = document.getElementById("invoiceSearch").value.toLowerCase();
    const statusFilter = document.getElementById("invoiceStatusFilter").value;

    const filtered = invoices.filter(invoice => {
        const matchesSearch =
            (invoice.invoiceNumber || "").toLowerCase().includes(search) ||
            (invoice.customerName || "").toLowerCase().includes(search);

        const matchesStatus =
            statusFilter === "all" || invoice.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        invoiceTableBody.innerHTML = `
            <tr><td colspan="7">No invoices found.</td></tr>
        `;
    } else {
        invoiceTableBody.innerHTML = filtered.map(invoice => `
            <tr>
                <td>${escapeHTML(invoice.invoiceNumber)}</td>
                <td>${escapeHTML(invoice.customerName)}</td>
                <td>${escapeHTML(invoice.issueDate)}</td>
                <td>${escapeHTML(invoice.dueDate)}</td>
                <td>${money(invoice.total)}</td>
                <td>
                    <span class="status-badge status-${escapeHTML(invoice.status)}">
                        ${escapeHTML(invoice.status)}
                    </span>
                </td>
                <td class="invoice-actions">
                    <button type="button"
                        class="view-invoice"
                        data-id="${escapeHTML(invoice.id)}">
                        Print
                    </button>

                    <button type="button"
                        class="edit-invoice"
                        data-id="${escapeHTML(invoice.id)}">
                        Edit
                    </button>

                    <button type="button"
                        class="delete-invoice"
                        data-id="${escapeHTML(invoice.id)}">
                        Delete
                    </button>
                </td>
            </tr>
        `).join("");
    }

    updateStatistics();
}


// UPDATE STATISTICS
function updateStatistics() {
    const total = invoices.length;

    const paid = invoices.filter(item => item.status === "paid").length;

    const pending = invoices.filter(item =>
        ["draft", "sent", "overdue"].includes(item.status)
    ).length;

    const totalAmount = invoices
        .filter(item => item.status !== "cancelled")
        .reduce((sum, item) => sum + Number(item.total || 0), 0);

    document.getElementById("totalInvoices").textContent = total;
    document.getElementById("paidInvoices").textContent = paid;
    document.getElementById("pendingInvoices").textContent = pending;
    document.getElementById("totalInvoiceAmount").textContent = money(totalAmount);
}


// OPEN MODAL
function openModal(invoice = null) {
    invoiceModal.classList.add("active");

    invoiceForm.reset();
    invoiceItems.innerHTML = "";

    editingInvoiceId = invoice?.id || null;

    document.getElementById("invoiceModalTitle").textContent =
        invoice ? "Edit Invoice" : "Create Invoice";

    document.getElementById("invoiceId").value = invoice?.id || "";

    document.getElementById("invoiceNumber").value =
        invoice?.invoiceNumber || generateInvoiceNumber();

    document.getElementById("issueDate").value =
        invoice?.issueDate || getLocalDate();

    document.getElementById("dueDate").value =
        invoice?.dueDate || getLocalDate();

    document.getElementById("invoiceStatus").value =
        invoice?.status || "draft";

    document.getElementById("invoiceTax").value =
        invoice?.taxRate ?? 0;

    document.getElementById("invoiceNotes").value =
        invoice?.notes || "";

    document.getElementById("invoiceCustomer").value =
        invoice?.customerId || "";

    if (invoice?.items?.length) {
        invoice.items.forEach(item => addItemRow(item));
    } else {
        addItemRow();
    }

    calculateTotals();
}


// CLOSE MODAL
function closeModal() {
    invoiceModal.classList.remove("active");
    invoiceForm.reset();
    invoiceItems.innerHTML = "";
    editingInvoiceId = null;
}


// SAVE INVOICE
async function saveInvoice(event) {
    event.preventDefault();

    const saveButton = document.getElementById("saveInvoice");

    if (!currentUser) {
        alert("Please log in first.");
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        const customerId = document.getElementById("invoiceCustomer").value;

        const customer = customers.find(item => item.id === customerId);

        if (!customer) {
            throw new Error("Please select a valid customer.");
        }

        const issueDate = document.getElementById("issueDate").value;
        const dueDate = document.getElementById("dueDate").value;

        if (!issueDate || !dueDate) {
            throw new Error("Please select invoice dates.");
        }

        if (dueDate < issueDate) {
            throw new Error("Due date cannot be earlier than issue date.");
        }

        const items = [];

        document.querySelectorAll(".invoice-item-row").forEach(row => {
            const description = row.querySelector(".item-description").value.trim();
            const quantity = Number(row.querySelector(".item-quantity").value);
            const price = Number(row.querySelector(".item-price").value);

            if (
                !description ||
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                !Number.isFinite(price) ||
                price < 0
            ) {
                throw new Error("Please enter valid invoice item details.");
            }

            items.push({
                description,
                quantity,
                price,
                amount: quantity * price
            });
        });

        if (items.length === 0) {
            throw new Error("Add at least one invoice item.");
        }

        const totals = calculateTotals();

        if (
            !Number.isFinite(totals.total) ||
            totals.taxRate < 0 ||
            totals.taxRate > 100
        ) {
            throw new Error("Please enter a valid tax percentage.");
        }

        const invoiceData = {
            invoiceNumber: document.getElementById("invoiceNumber").value,
            customerId,
            customerName: customer.name || customer.email || "Customer",
            issueDate,
            dueDate,
            items,
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: document.getElementById("invoiceStatus").value,
            notes: document.getElementById("invoiceNotes").value.trim(),
            ownerId: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        if (editingInvoiceId) {
            const existingInvoice = invoices.find(
                item => item.id === editingInvoiceId
            );

            if (!existingInvoice) {
                throw new Error("Invoice not found.");
            }

            await updateDoc(
                doc(db, "invoices", editingInvoiceId),
                invoiceData
            );

            await recordInvoiceActivity(
                "Invoice Updated",
                `Updated invoice ${invoiceData.invoiceNumber} for ${invoiceData.customerName}.`,
                "Invoice Updated"
            );

        } else {
            invoiceData.createdAt = serverTimestamp();

            await addDoc(collection(db, "invoices"), invoiceData);

            await recordInvoiceActivity(
                "Invoice Created",
                `Created invoice ${invoiceData.invoiceNumber} for ${invoiceData.customerName}.`,
                "Invoice Created"
            );
        }

        closeModal();
        await loadInvoices();

        alert("Invoice saved successfully!");

    } catch (error) {
        console.error("Invoice saving error:", error);
        alert(error.message || "Unable to save invoice.");

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Invoice";
    }
}


// DELETE INVOICE
async function deleteInvoice(id) {
    const invoice = invoices.find(item => item.id === id);

    if (!invoice) return;

    if (!confirm(`Delete invoice ${invoice.invoiceNumber}?`)) return;

    try {
        await deleteDoc(doc(db, "invoices", id));

        await recordInvoiceActivity(
            "Invoice Deleted",
            `Deleted invoice ${invoice.invoiceNumber} for ${invoice.customerName}.`,
            "Invoice Deleted"
        );

        await loadInvoices();

        alert("Invoice deleted successfully.");

    } catch (error) {
        console.error(error);
        alert("Unable to delete invoice.");
    }
}


// PRINT INVOICE
function printInvoice(id) {
    const invoice = invoices.find(item => item.id === id);

    if (!invoice) return;

    const itemsHTML = invoice.items.map(item => `
        <tr>
            <td>${escapeHTML(item.description)}</td>
            <td>${item.quantity}</td>
            <td>${money(item.price)}</td>
            <td>${money(item.amount)}</td>
        </tr>
    `).join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        alert("Please allow pop-ups to print invoices.");
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHTML(invoice.invoiceNumber)}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 40px;
                    color: #222;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    border-bottom: 2px solid #ddd;
                    padding-bottom: 20px;
                }

                h1 { color: #2563eb; }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 30px;
                }

                th, td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }

                th { background: #f3f4f6; }

                .totals {
                    margin-left: auto;
                    margin-top: 25px;
                    width: 250px;
                }

                .totals p {
                    display: flex;
                    justify-content: space-between;
                }

                .notes { margin-top: 30px; }

                @media print {
                    button { display: none; }
                }
            </style>
        </head>

        <body>
            <div class="header">
                <div>
                    <h1>BRIGHTLOOP</h1>
                    <p>Subscription Management</p>
                </div>

                <div>
                    <h2>INVOICE</h2>
                    <p>${escapeHTML(invoice.invoiceNumber)}</p>
                </div>
            </div>

            <h3>Bill To</h3>
            <p>${escapeHTML(invoice.customerName)}</p>

            <p>Issue Date: ${escapeHTML(invoice.issueDate)}</p>
            <p>Due Date: ${escapeHTML(invoice.dueDate)}</p>
            <p>Status: ${escapeHTML(invoice.status)}</p>

            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Amount</th>
                    </tr>
                </thead>

                <tbody>${itemsHTML}</tbody>
            </table>

            <div class="totals">
                <p><span>Subtotal</span><strong>${money(invoice.subtotal)}</strong></p>
                <p><span>Tax (${invoice.taxRate}%)</span><strong>${money(invoice.taxAmount)}</strong></p>
                <hr>
                <p><span>Total</span><strong>${money(invoice.total)}</strong></p>
            </div>

            <div class="notes">
                <h3>Notes</h3>
                <p>${escapeHTML(invoice.notes || "Thank you for your business.")}</p>
            </div>

            <script>
                window.onload = () => window.print();
            <\/script>
        </body>
        </html>
    `);

    printWindow.document.close();
}


// EVENT LISTENERS

document.getElementById("openInvoiceModal").addEventListener("click", () => {
    openModal();
});

document.getElementById("closeInvoiceModal").addEventListener("click", closeModal);
document.getElementById("cancelInvoice").addEventListener("click", closeModal);

document.getElementById("addInvoiceItem").addEventListener("click", () => {
    addItemRow();
});

document.getElementById("invoiceTax").addEventListener("input", calculateTotals);

document.getElementById("invoiceSearch").addEventListener("input", renderInvoices);

document.getElementById("invoiceStatusFilter").addEventListener("change", renderInvoices);

invoiceForm.addEventListener("submit", saveInvoice);


invoiceTableBody.addEventListener("click", event => {
    const editButton = event.target.closest(".edit-invoice");
    const deleteButton = event.target.closest(".delete-invoice");
    const printButton = event.target.closest(".view-invoice");

    if (editButton) {
        const invoice = invoices.find(item => item.id === editButton.dataset.id);

        if (invoice) openModal(invoice);
    }

    if (deleteButton) {
        deleteInvoice(deleteButton.dataset.id);
    }

    if (printButton) {
        printInvoice(printButton.dataset.id);
    }
});


// AUTHENTICATION

auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    try {
        await loadCustomers();
        await loadInvoices();

    } catch (error) {
        console.error("Invoice initialization error:", error);
        alert("Unable to initialize invoice management.");
    }
});