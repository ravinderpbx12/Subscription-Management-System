const sidebar = document.getElementById("sidebar");
const menu = document.getElementById("menu");

menu.addEventListener("click", () => {
    sidebar.classList.toggle("show");
});

document.addEventListener("click", (event) => {
    if (
        window.innerWidth <= 760 &&
        sidebar.classList.contains("show") &&
        !sidebar.contains(event.target) &&
        !menu.contains(event.target)
    ) {
        sidebar.classList.remove("show");
    }
});

document.getElementById("closeNotice").addEventListener("click", () => {
    document.getElementById("notice").remove();
});

document.getElementById("create").addEventListener("click", () => {
    window.location.href = "subscriptions.html";
});

document.getElementById("export").addEventListener("click", () => {
    window.print();
});

document.getElementById("filter").addEventListener("click", () => {
    alert("Date filtering will be connected when the reports module is implemented.");
});

const currentPage = location.pathname.split("/").pop() || "dashboard.html";

document.querySelectorAll(".sidebar nav a").forEach((link) => {
    link.classList.toggle(
        "active",
        link.getAttribute("href") === currentPage
    );
});