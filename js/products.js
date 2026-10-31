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


const productCollection = collection(db, "products");

const productForm = document.getElementById("productForm");
const productTableBody = document.getElementById("productTableBody");
const productModal = document.getElementById("productModal");
const productMessage = document.getElementById("productMessage");

let products = [];
let currentUser = null;


// ACTIVITY LOGGER
async function recordProductActivity(action, description, title) {
    try {
        await logActivity(action, description);

        await createNotification(
            title,
            description,
            "product"
        );

    } catch (error) {
        console.error("Product activity logging error:", error);
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
    productMessage.textContent = text;
    productMessage.style.color = color;
}


// LOAD PRODUCTS
async function loadProducts() {
    if (!currentUser) return;

    try {
        const productQuery = query(
            productCollection,
            where("ownerId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(productQuery);

        products = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        products.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });

        renderProducts();

    } catch (error) {
        console.error("Product loading error:", error);

        productTableBody.innerHTML = `
            <tr>
                <td colspan="6">Unable to load products.</td>
            </tr>
        `;
    }
}


// DISPLAY PRODUCTS
function renderProducts() {
    const search = document
        .getElementById("searchProduct")
        .value.trim()
        .toLowerCase();

    const status = document.getElementById("productStatusFilter").value;

    const filteredProducts = products.filter(product => {
        const matchesSearch =
            (product.name || "").toLowerCase().includes(search) ||
            (product.code || "").toLowerCase().includes(search) ||
            (product.category || "").toLowerCase().includes(search);

        const matchesStatus =
            status === "all" || product.status === status;

        return matchesSearch && matchesStatus;
    });

    document.getElementById("totalProducts").textContent =
        products.length;

    document.getElementById("activeProducts").textContent =
        products.filter(p => p.status === "active").length;

    document.getElementById("inactiveProducts").textContent =
        products.filter(p => p.status === "inactive").length;

    if (filteredProducts.length === 0) {
        productTableBody.innerHTML = `
            <tr>
                <td colspan="6">No products found.</td>
            </tr>
        `;
        return;
    }

    productTableBody.innerHTML = filteredProducts.map(product => `
        <tr>
            <td>${escapeHTML(product.name)}</td>
            <td>${escapeHTML(product.code)}</td>
            <td>${escapeHTML(product.category)}</td>
            <td>${escapeHTML(product.description || "-")}</td>
            <td>
                <span class="product-status ${escapeHTML(product.status)}">
                    ${escapeHTML(product.status)}
                </span>
            </td>
            <td>
                <button
                    type="button"
                    data-action="edit"
                    data-id="${escapeHTML(product.id)}"
                >Edit</button>

                <button
                    type="button"
                    data-action="delete"
                    data-id="${escapeHTML(product.id)}"
                >Delete</button>
            </td>
        </tr>
    `).join("");
}


// RESET FORM
function resetProductForm() {
    productForm.reset();
    document.getElementById("productId").value = "";
    document.getElementById("productModalTitle").textContent = "Add Product";
    productMessage.textContent = "";
}


// OPEN MODAL
document.getElementById("addProductBtn").addEventListener("click", () => {
    resetProductForm();
    productModal.style.display = "flex";
});


// CLOSE MODAL
document.getElementById("closeProductModal").addEventListener("click", () => {
    productModal.style.display = "none";
});


// ADD / UPDATE PRODUCT
productForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        showMessage("Please log in first.", "red");
        return;
    }

    const id = document.getElementById("productId").value;

    const productData = {
        name: document.getElementById("productName").value.trim(),
        code: document.getElementById("productCode").value.trim(),
        category: document.getElementById("productCategory").value.trim(),
        description: document.getElementById("productDescription").value.trim(),
        status: document.getElementById("productStatus").value
    };

    if (!productData.name || !productData.code || !productData.category) {
        showMessage("Please complete all required fields.", "red");
        return;
    }

    const saveButton = document.getElementById("saveProductBtn");
    saveButton.disabled = true;

    try {
        if (id) {
            // UPDATE PRODUCT
            const productRef = doc(db, "products", id);

            await updateDoc(productRef, {
                ...productData,
                updatedAt: serverTimestamp()
            });

            await recordProductActivity(
                "Product Updated",
                `Updated product: ${productData.name}`,
                "Product Updated"
            );

            showMessage("Product updated successfully!");

        } else {
            // CREATE PRODUCT
            await addDoc(productCollection, {
                ...productData,
                ownerId: currentUser.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            await recordProductActivity(
                "Product Created",
                `Created product: ${productData.name}`,
                "Product Created"
            );

            showMessage("Product added successfully!");
        }

        await loadProducts();

        productModal.style.display = "none";
        resetProductForm();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "red");

    } finally {
        saveButton.disabled = false;
    }
});


// EDIT / DELETE PRODUCTS
productTableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const product = products.find(item => item.id === id);

    if (!product) return;

    if (action === "edit") {
        document.getElementById("productId").value = product.id;
        document.getElementById("productName").value = product.name;
        document.getElementById("productCode").value = product.code;
        document.getElementById("productCategory").value = product.category;
        document.getElementById("productDescription").value =
            product.description || "";
        document.getElementById("productStatus").value = product.status;

        document.getElementById("productModalTitle").textContent =
            "Edit Product";

        productModal.style.display = "flex";
    }

    if (action === "delete") {
        const confirmed = confirm(
            `Delete product "${product.name}"?`
        );

        if (!confirmed) return;

        try {
            await deleteDoc(doc(db, "products", id));

            await recordProductActivity(
                "Product Deleted",
                `Deleted product: ${product.name}`,
                "Product Deleted"
            );

            await loadProducts();

            showMessage("Product deleted successfully!");

        } catch (error) {
            console.error(error);
            alert("Unable to delete product.");
        }
    }
});


// SEARCH AND FILTER
document.getElementById("searchProduct")
    .addEventListener("input", renderProducts);

document.getElementById("productStatusFilter")
    .addEventListener("change", renderProducts);


// WAIT FOR AUTHENTICATION
onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;
    loadProducts();
});