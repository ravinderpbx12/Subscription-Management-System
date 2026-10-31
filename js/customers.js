import { auth, db } from "../firebase.js";

import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const customerCollection = collection(db, "customers");

const customerForm = document.getElementById("customerForm");
const customerTableBody = document.getElementById("customerTableBody");

const modal = document.getElementById("customerModal");
const message = document.getElementById("customerMessage");

let customers = [];

const user = auth.currentUser;

function showMessage(text, color = "green") {
    message.textContent = text;
    message.style.color = color;
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

// LOAD CUSTOMERS
async function loadCustomers() {

    try {
        const q = query(
            customerCollection,
            where("ownerId", "==", auth.currentUser.uid),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        customers = snapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
        }));

        renderCustomers();

    } catch (error) {
        console.error(error);

        customerTableBody.innerHTML =
            `<tr><td colspan="6">Unable to load customers.</td></tr>`;
    }
}

// DISPLAY CUSTOMERS
function renderCustomers() {

    const search = document
        .getElementById("searchCustomer")
        .value.toLowerCase();

    const status = document.getElementById("statusFilter").value;

    const filtered = customers.filter(customer => {

        const matchesSearch =
            customer.name.toLowerCase().includes(search) ||
            customer.email.toLowerCase().includes(search);

        const matchesStatus =
            status === "all" || customer.status === status;

        return matchesSearch && matchesStatus;
    });

    document.getElementById("totalCustomers").textContent =
        customers.length;

    document.getElementById("activeCustomers").textContent =
        customers.filter(c => c.status === "active").length;

    if (!filtered.length) {
        customerTableBody.innerHTML =
            `<tr><td colspan="6">No customers found.</td></tr>`;
        return;
    }

    customerTableBody.innerHTML = filtered.map(customer => `
        <tr>
            <td>${escapeHTML(customer.name)}</td>
            <td>${escapeHTML(customer.email)}</td>
            <td>${escapeHTML(customer.phone || "-")}</td>
            <td>${escapeHTML(customer.company || "-")}</td>
            <td>
                <span class="status-badge ${customer.status}">
                    ${escapeHTML(customer.status)}
                </span>
            </td>
            <td>
                <button data-action="edit" data-id="${escapeHTML(customer.id)}">
                    Edit
                </button>

                <button data-action="delete" data-id="${escapeHTML(customer.id)}">
                    Delete
                </button>
            </td>
        </tr>
    `).join("");
}

// ADD / UPDATE CUSTOMER
customerForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const currentUser = auth.currentUser;

    if (!currentUser) {
        showMessage("Please log in again.", "red");
        return;
    }

    const id = document.getElementById("customerId").value;

    const customerData = {
        name: document.getElementById("customerName").value.trim(),
        email: document.getElementById("customerEmail").value.trim(),
        phone: document.getElementById("customerPhone").value.trim(),
        company: document.getElementById("customerCompany").value.trim(),
        status: document.getElementById("customerStatus").value
    };

    try {

        if (id) {

            const customerRef = doc(db, "customers", id);

            await updateDoc(customerRef, customerData);

            showMessage("Customer updated successfully!");

        } else {

            await addDoc(customerCollection, {
                ...customerData,
                ownerId: currentUser.uid,
                createdAt: serverTimestamp()
            });

            showMessage("Customer added successfully!");
        }

        customerForm.reset();
        document.getElementById("customerId").value = "";

        setTimeout(() => {
            modal.style.display = "none";
            loadCustomers();
        }, 500);

    } catch (error) {
        console.error(error);
        showMessage(error.message, "red");
    }
});

// EDIT / DELETE ACTIONS
customerTableBody.addEventListener("click", async (event) => {

    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const customer = customers.find(c => c.id === id);

    if (!customer) return;

    if (action === "edit") {

        document.getElementById("customerId").value = customer.id;
        document.getElementById("customerName").value = customer.name;
        document.getElementById("customerEmail").value = customer.email;
        document.getElementById("customerPhone").value = customer.phone || "";
        document.getElementById("customerCompany").value = customer.company || "";
        document.getElementById("customerStatus").value = customer.status;

        document.getElementById("modalTitle").textContent = "Edit Customer";

        modal.style.display = "flex";

    }

    if (action === "delete") {

        if (!confirm("Are you sure you want to delete this customer?")) {
            return;
        }

        try {

            await deleteDoc(doc(db, "customers", id));

            await loadCustomers();

        } catch (error) {
            alert("Unable to delete customer.");
            console.error(error);
        }
    }
});

// OPEN MODAL
document.getElementById("addCustomerBtn").addEventListener("click", () => {

    customerForm.reset();

    document.getElementById("customerId").value = "";
    document.getElementById("modalTitle").textContent = "Add Customer";

    modal.style.display = "flex";

});

// CLOSE MODAL
document.getElementById("closeModalBtn").addEventListener("click", () => {
    modal.style.display = "none";
});

// SEARCH AND FILTER
document.getElementById("searchCustomer").addEventListener("input", renderCustomers);

document.getElementById("statusFilter").addEventListener("change", renderCustomers);

// INITIAL LOAD
loadCustomers();