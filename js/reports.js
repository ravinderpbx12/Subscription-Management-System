import { auth, db } from "../firebase.js";

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";


const message = document.getElementById("reportMessage");

let reportData = {
    customers: [],
    subscriptions: [],
    invoices: [],
    payments: [],
    discounts: []
};

let currentUser = null;


// HELPERS

function formatCurrency(amount, currency = "INR") {
    try {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: currency || "INR",
            maximumFractionDigits: 2
        }).format(Number(amount) || 0);
    } catch (error) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(Number(amount) || 0);
    }
}


function getDateObject(value) {
    if (!value) return null;

    let date;

    if (typeof value.toDate === "function") {
        date = value.toDate();
    } else if (value instanceof Date) {
        date = value;
    } else {
        date = new Date(value);
    }

    return Number.isNaN(date.getTime()) ? null : date;
}


function formatDate(value) {
    const date = getDateObject(value);

    if (!date) return "—";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


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


// LOAD COLLECTIONS

async function loadCollection(collectionName) {
    const collectionQuery = query(
        collection(db, collectionName),
        where("ownerId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(collectionQuery);

    return snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}


// LOAD REPORTS

async function loadReports() {
    if (!currentUser) return;

    message.textContent = "Loading reports...";

    try {
        const results = await Promise.allSettled([
            loadCollection("customers"),
            loadCollection("subscriptions"),
            loadCollection("invoices"),
            loadCollection("payments"),
            loadCollection("discounts")
        ]);

        const collectionNames = [
            "customers",
            "subscriptions",
            "invoices",
            "payments",
            "discounts"
        ];

        const errors = [];

        results.forEach((result, index) => {
            if (result.status === "fulfilled") {
                reportData[collectionNames[index]] = result.value;
            } else {
                reportData[collectionNames[index]] = [];

                errors.push(collectionNames[index]);

                console.error(
                    `Could not load ${collectionNames[index]}:`,
                    result.reason
                );
            }
        });

        renderReports();

        if (errors.length) {
            message.textContent =
                `Some reports could not load: ${errors.join(", ")}. Check your Firestore rules and collection names.`;
        } else {
            message.textContent = "Reports updated successfully.";
        }

    } catch (error) {
        console.error("Reports error:", error);

        message.textContent =
            "Unable to load reports. Please try again.";
    }
}


// RENDER REPORTS

function renderReports() {
    renderMetrics();
    renderMonthlyPayments();
    renderSubscriptionBreakdown();
    renderInvoiceBreakdown();
    renderPaymentBreakdown();
    renderRecentPayments();
}


// METRICS

function renderMetrics() {
    const customers = reportData.customers;
    const subscriptions = reportData.subscriptions;
    const invoices = reportData.invoices;
    const payments = reportData.payments;

    const activeCount = subscriptions.filter(
        item => item.status === "active"
    ).length;

    const completedPayments = payments.filter(
        item => item.status === "completed"
    );

    const recordedRevenue = completedPayments.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0
    );

    const pendingAmount = invoices
        .filter(item => [
            "pending",
            "unpaid",
            "overdue"
        ].includes(String(item.status || "").toLowerCase()))
        .reduce(
            (sum, item) => sum + (Number(item.total) || 0),
            0
        );

    document.getElementById("totalCustomers").textContent =
        customers.length;

    document.getElementById("activeSubscriptions").textContent =
        activeCount;

    document.getElementById("totalRevenue").textContent =
        formatCurrency(recordedRevenue);

    document.getElementById("pendingInvoices").textContent =
        formatCurrency(pendingAmount);
}


// MONTHLY PAYMENTS CHART

function renderMonthlyPayments() {
    const container = document.getElementById("monthlyRevenueChart");

    const completedPayments = reportData.payments.filter(
        item => item.status === "completed"
    );

    const monthlyTotals = {};

    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const date = new Date(
            now.getFullYear(),
            now.getMonth() - i,
            1
        );

        const key = `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(2, "0")}`;

        monthlyTotals[key] = {
            label: date.toLocaleDateString("en-IN", {
                month: "short",
                year: "2-digit"
            }),
            total: 0
        };
    }

    completedPayments.forEach(payment => {
        const date = getDateObject(payment.paymentDate);

        if (!date) return;

        const key = `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(2, "0")}`;

        if (monthlyTotals[key]) {
            monthlyTotals[key].total +=
                Number(payment.amount) || 0;
        }
    });

    const months = Object.values(monthlyTotals);

    const maximum = Math.max(
        ...months.map(item => item.total),
        1
    );

    container.innerHTML = months.map(item => {
        const height = (item.total / maximum) * 100;

        return `
            <div class="chart-column">

                <div class="chart-value">
                    ${escapeHTML(formatCurrency(item.total))}
                </div>

                <div class="chart-bar-area">
                    <div
                        class="chart-bar"
                        style="height: ${height}%"
                        title="${escapeHTML(formatCurrency(item.total))}"
                    ></div>
                </div>

                <span class="chart-month">
                    ${escapeHTML(item.label)}
                </span>

            </div>
        `;
    }).join("");
}


// GENERIC BREAKDOWN

function renderBreakdown(containerId, items, statuses) {
    const container = document.getElementById(containerId);

    if (!items.length) {
        container.innerHTML =
            `<p class="chart-empty">No records available.</p>`;
        return;
    }

    const counts = {};

    statuses.forEach(status => {
        counts[status] = 0;
    });

    items.forEach(item => {
        const status = String(
            item.status || "unknown"
        ).toLowerCase();

        if (counts[status] === undefined) {
            counts[status] = 0;
        }

        counts[status]++;
    });

    const total = items.length;

    container.innerHTML = Object.entries(counts)
        .map(([status, count]) => {
            const percentage = total
                ? (count / total) * 100
                : 0;

            return `
                <div class="breakdown-item">

                    <div class="breakdown-label">
                        <span>
                            ${escapeHTML(status.replaceAll("_", " "))}
                        </span>

                        <strong>${count}</strong>
                    </div>

                    <div class="breakdown-track">
                        <div
                            class="breakdown-fill"
                            style="width: ${percentage}%"
                        ></div>
                    </div>

                </div>
            `;
        }).join("");
}


// SUBSCRIPTION BREAKDOWN

function renderSubscriptionBreakdown() {
    renderBreakdown(
        "subscriptionBreakdown",
        reportData.subscriptions,
        ["active", "trial", "cancelled", "expired", "paused"]
    );
}


// INVOICE BREAKDOWN

function renderInvoiceBreakdown() {
    renderBreakdown(
        "invoiceBreakdown",
        reportData.invoices,
        ["paid", "pending", "unpaid", "overdue", "cancelled"]
    );
}


// PAYMENT BREAKDOWN

function renderPaymentBreakdown() {
    renderBreakdown(
        "paymentBreakdown",
        reportData.payments,
        ["completed", "pending", "failed", "refunded"]
    );
}


// RECENT PAYMENTS

function renderRecentPayments() {
    const container = document.getElementById("recentPayments");

    const recentPayments = [...reportData.payments]
        .sort((a, b) => {
            const dateA = getDateObject(a.paymentDate);
            const dateB = getDateObject(b.paymentDate);

            return (dateB?.getTime() || 0) -
                (dateA?.getTime() || 0);
        })
        .slice(0, 10);

    if (!recentPayments.length) {
        container.innerHTML = `
            <tr>
                <td colspan="6">No payment records found.</td>
            </tr>
        `;

        return;
    }

    container.innerHTML = recentPayments.map(payment => `
        <tr>

            <td>
                ${escapeHTML(payment.paymentNumber || payment.id)}
            </td>

            <td>
                ${escapeHTML(payment.customerName || "—")}
            </td>

            <td>
                ${escapeHTML(formatDate(payment.paymentDate))}
            </td>

            <td>
                ${escapeHTML(payment.method || "—")}
            </td>

            <td>
                ${escapeHTML(formatCurrency(
                    payment.amount,
                    payment.currency
                ))}
            </td>

            <td>
                <span class="report-status ${escapeHTML(
                    String(payment.status || "unknown").toLowerCase()
                )}">
                    ${escapeHTML(payment.status || "Unknown")}
                </span>
            </td>

        </tr>
    `).join("");
}


// EXPORT CSV

function exportCSV() {
    const rows = [
        [
            "Report Type",
            "Record ID",
            "Customer",
            "Date",
            "Amount",
            "Status"
        ]
    ];

    reportData.payments.forEach(payment => {
        rows.push([
            "Payment",
            payment.paymentNumber || payment.id,
            payment.customerName || "",
            formatDate(payment.paymentDate),
            payment.amount ?? 0,
            payment.status || ""
        ]);
    });

    reportData.invoices.forEach(invoice => {
        rows.push([
            "Invoice",
            invoice.invoiceNumber || invoice.id,
            invoice.customerName || "",
            formatDate(invoice.issueDate),
            invoice.total ?? 0,
            invoice.status || ""
        ]);
    });

    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
    ).join("\n");

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "brightloop-reports.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}


// EVENT LISTENERS

document.getElementById("refreshReports")
    .addEventListener("click", loadReports);

document.getElementById("exportReports")
    .addEventListener("click", exportCSV);


// AUTHENTICATION

onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    loadReports();
});