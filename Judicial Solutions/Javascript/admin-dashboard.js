// Javascript/admin-dashboard.js

// Protect this page using the demo auth (from admin-auth.js)
if (typeof requireAdminAuth === "function") {
  requireAdminAuth();
}

// ---- Appointments data (in-memory demo) ----
let appointments = [
  {
    client: "Sanjay Patel",
    type: "Corporate",
    datetime: "2025-11-27T11:00",
    mode: "In person",
    status: "Confirmed",
  },
  {
    client: "Neha Gupta",
    type: "Family",
    datetime: "2025-11-27T16:30",
    mode: "Video",
    status: "Pending",
  },
  {
    client: "Vikas Singh",
    type: "Criminal",
    datetime: "2025-11-28T10:00",
    mode: "Phone",
    status: "Confirmed",
  },
];

function formatAppointmentDate(raw) {
  if (!raw) return "";
  // If already formatted like "27 Nov, 11:00 AM", just return
  if (raw.includes(",")) return raw;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const datePart = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

document.addEventListener("DOMContentLoaded", () => {
  setupSidebarNavigation();
  setupSidebarToggle();
  populateDummyData();
  initCharts();
  setupCaseSearchMock();
});

/* ========== Sidebar Navigation ========== */
function setupSidebarNavigation() {
  const links = document.querySelectorAll(".sidebar-menu .nav-link[data-section]");
  const sections = document.querySelectorAll(".admin-section");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = link.getAttribute("data-section");

      // activate link
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      // show target section
      sections.forEach((sec) => {
        if (sec.id === target) sec.classList.remove("d-none");
        else sec.classList.add("d-none");
      });

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Also allow non-sidebar elements (like "View all") to navigate
  document.querySelectorAll("[data-section]").forEach((el) => {
    if (!el.classList.contains("nav-link")) {
      el.addEventListener("click", (e) => {
        const target = el.getAttribute("data-section");
        const sidebarLink = document.querySelector(
          `.sidebar-menu .nav-link[data-section="${target}"]`
        );
        if (sidebarLink) sidebarLink.click();
      });
    }
  });
}

/* ========== Sidebar Toggle (Mobile) ========== */
function setupSidebarToggle() {
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");

  if (!menuToggle || !sidebar) return;

  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("active");
  });
}

/* ========== Dummy Data for Tables / Lists ========== */
function populateDummyData() {
  // Recent Leads (Dashboard preview)
  const recentLeads = [
    { name: "Rohit Kumar", type: "Civil", date: "26 Nov", status: "New" },
    { name: "Priya Sharma", type: "Family", date: "25 Nov", status: "In progress" },
    { name: "Aman Verma", type: "Criminal", date: "23 Nov", status: "Closed" },
  ];
  const recentLeadsBody = document.getElementById("recent-leads-body");
  if (recentLeadsBody) {
    recentLeadsBody.innerHTML = recentLeads
      .map(
        (l) => `
      <tr>
        <td>${l.name}</td>
        <td>${l.type}</td>
        <td>${l.date}</td>
        <td><span class="badge bg-${statusColor(l.status)}">${l.status}</span></td>
      </tr>`
      )
      .join("");
  }

  // Appointments: full table + dashboard preview + form handling
  renderAppointmentsTable();
  renderAppointmentsPreview();
  setupAppointmentForm();

  // Leads table (full)
  const leadsTableBody = document.getElementById("leads-table-body");
  if (leadsTableBody) {
    const leads = [
      {
        id: 1,
        name: "Rohit Kumar",
        email: "rohit@example.com",
        phone: "+91 98765 00001",
        type: "Civil",
        received: "26 Nov, 10:20 AM",
        status: "New",
      },
      {
        id: 2,
        name: "Priya Sharma",
        email: "priya@example.com",
        phone: "+91 98765 00002",
        type: "Family",
        received: "25 Nov, 6:45 PM",
        status: "In progress",
      },
      {
        id: 3,
        name: "Aman Verma",
        email: "aman@example.com",
        phone: "+91 98765 00003",
        type: "Criminal",
        received: "23 Nov, 3:10 PM",
        status: "Closed",
      },
    ];
    leadsTableBody.innerHTML = leads
      .map(
        (l) => `
      <tr>
        <td>${l.id}</td>
        <td>${l.name}</td>
        <td>${l.email}</td>
        <td>${l.phone}</td>
        <td>${l.type}</td>
        <td>${l.received}</td>
        <td><span class="badge bg-${statusColor(l.status)}">${l.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">View</button>
          <button class="btn btn-sm btn-outline-secondary">Note</button>
        </td>
      </tr>`
      )
      .join("");
  }

  // Services table
  const servicesTableBody = document.getElementById("services-table-body");
  if (servicesTableBody) {
    const services = [
      {
        name: "Civil Disputes",
        cat: "Civil",
        show: true,
        updated: "24 Nov",
      },
      {
        name: "Criminal Defense",
        cat: "Criminal",
        show: true,
        updated: "20 Nov",
      },
      {
        name: "Family & Matrimonial",
        cat: "Family",
        show: true,
        updated: "19 Nov",
      },
      {
        name: "Corporate & Compliance",
        cat: "Corporate",
        show: false,
        updated: "15 Nov",
      },
    ];
    servicesTableBody.innerHTML = services
      .map(
        (s) => `
      <tr>
        <td>${s.name}</td>
        <td>${s.cat}</td>
        <td>
          <span class="badge bg-${s.show ? "success" : "secondary"}">
            ${s.show ? "Visible" : "Hidden"}
          </span>
        </td>
        <td>${s.updated}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Edit</button>
          <button class="btn btn-sm btn-outline-secondary">Preview</button>
        </td>
      </tr>`
      )
      .join("");
  }

  // Blog table
  const blogBody = document.getElementById("blog-table-body");
  if (blogBody) {
    const posts = [
      { title: "Understanding Civil Litigation", status: "Published", date: "10 Nov 2025" },
      { title: "How to Prepare for a Court Hearing", status: "Draft", date: "-" },
      { title: "Rights of an Accused in India", status: "Published", date: "02 Nov 2025" },
    ];
    blogBody.innerHTML = posts
      .map(
        (p) => `
      <tr>
        <td>${p.title}</td>
        <td>
          <span class="badge bg-${p.status === "Published" ? "success" : "secondary"}">
            ${p.status}
          </span>
        </td>
        <td>${p.date}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Edit</button>
          <button class="btn btn-sm btn-outline-secondary">View</button>
        </td>
      </tr>`
      )
      .join("");
  }

  // Users table
  const usersBody = document.getElementById("users-table-body");
  if (usersBody) {
    const users = [
      {
        name: "Admin",
        email: "admin@judicialsolutions.in",
        role: "Super Admin",
        lastLogin: "Today, 10:14 PM",
      },
      {
        name: "Associate 1",
        email: "associate1@judicialsolutions.in",
        role: "Lawyer",
        lastLogin: "Yesterday, 4:25 PM",
      },
      {
        name: "Assistant",
        email: "assistant@judicialsolutions.in",
        role: "Assistant",
        lastLogin: "2 days ago",
      },
    ];
    usersBody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.lastLogin}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Edit</button>
          <button class="btn btn-sm btn-outline-danger">Disable</button>
        </td>
      </tr>`
      )
      .join("");
  }

  // Files table
  const filesBody = document.getElementById("files-table-body");
  if (filesBody) {
    const files = [
      {
        name: "Civil-Suit-Template.docx",
        cat: "Template",
        size: "120 KB",
        uploaded: "12 Nov 2025",
      },
      {
        name: "Client-Agreement.pdf",
        cat: "Agreement",
        size: "340 KB",
        uploaded: "08 Nov 2025",
      },
      {
        name: "Bail-Application-Sample.docx",
        cat: "Criminal",
        size: "90 KB",
        uploaded: "01 Nov 2025",
      },
    ];
    filesBody.innerHTML = files
      .map(
        (f) => `
      <tr>
        <td>${f.name}</td>
        <td>${f.cat}</td>
        <td>${f.size}</td>
        <td>${f.uploaded}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Download</button>
          <button class="btn btn-sm btn-outline-danger">Delete</button>
        </td>
      </tr>`
      )
      .join("");
  }

  // Saved cases table (placeholder)
  const savedCasesBody = document.getElementById("saved-cases-body");
  if (savedCasesBody) {
    const cases = [
      {
        title: "ABC vs State of X (2020)",
        court: "Supreme Court of India",
        date: "2020-03-15",
        tags: ["Criminal", "Bail"],
      },
      {
        title: "XYZ Pvt Ltd vs PQR Traders (2018)",
        court: "Delhi High Court",
        date: "2018-09-22",
        tags: ["Civil", "Contract"],
      },
    ];
    savedCasesBody.innerHTML = cases
      .map(
        (c) => `
      <tr>
        <td>${c.title}</td>
        <td>${c.court}</td>
        <td>${c.date}</td>
        <td>${c.tags.map((t) => `<span class="badge bg-secondary me-1">${t}</span>`).join("")}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Open</button>
          <button class="btn btn-sm btn-outline-danger">Remove</button>
        </td>
      </tr>`
      )
      .join("");
  }
}

/* ========== Appointments helpers ========== */

function renderAppointmentsTable() {
  const tbody = document.getElementById("appointments-table-body");
  if (!tbody) return;

  tbody.innerHTML = appointments
    .map(
      (a) => `
    <tr>
      <td>${a.client}</td>
      <td>${a.type}</td>
      <td>${formatAppointmentDate(a.datetime)}</td>
      <td>${a.mode}</td>
      <td><span class="badge bg-${statusColor(a.status)}">${a.status}</span></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary me-1">Details</button>
        <button class="btn btn-sm btn-outline-secondary">Reschedule</button>
      </td>
    </tr>`
    )
    .join("");
}

function renderAppointmentsPreview() {
  const tbody = document.getElementById("upcoming-appointments-body");
  if (!tbody) return;

  const upcoming = appointments.slice(0, 3);

  tbody.innerHTML = upcoming
    .map(
      (a) => `
    <tr>
      <td>${a.client}</td>
      <td>${a.type}</td>
      <td>${formatAppointmentDate(a.datetime)}</td>
      <td><span class="badge bg-${statusColor(a.status)}">${a.status}</span></td>
    </tr>`
    )
    .join("");
}

function setupAppointmentForm() {
  const form = document.getElementById("appointment-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const client = document.getElementById("appointment-client").value.trim();
    const type = document.getElementById("appointment-type").value.trim();
    const datetimeRaw = document.getElementById("appointment-datetime").value;
    const mode = document.getElementById("appointment-mode").value;
    const status = document.getElementById("appointment-status").value;

    if (!client || !type || !datetimeRaw) {
      return;
    }

    const prettyDate = formatAppointmentDate(datetimeRaw);

    // Add new appointment at the start
    appointments.unshift({
      client,
      type,
      datetime: prettyDate,
      mode,
      status,
    });

    // Re-render tables
    renderAppointmentsTable();
    renderAppointmentsPreview();

    // Reset form & default status
    form.reset();
    document.getElementById("appointment-status").value = "Pending";

    // Close modal
    const modalEl = document.getElementById("appointmentModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  });
}

/* ========== Status badge color helper ========== */
function statusColor(status) {
  switch (status) {
    case "New":
    case "Pending":
      return "warning";
    case "In progress":
      return "info";
    case "Confirmed":
    case "Closed":
    case "Completed":
      return "success";
    case "Cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

/* ========== Charts ========== */
function initCharts() {
  const leadsCanvas = document.getElementById("leadsAppointmentsChart");
  if (leadsCanvas && window.Chart) {
    new Chart(leadsCanvas, {
      type: "line",
      data: {
        labels: ["Day -6", "Day -5", "Day -4", "Day -3", "Day -2", "Day -1", "Today"],
        datasets: [
          {
            label: "Leads",
            data: [2, 4, 3, 5, 4, 3, 7],
            tension: 0.4,
          },
          {
            label: "Appointments",
            data: [1, 2, 1, 3, 2, 2, 4],
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
          },
        },
        scales: {
          x: {
            ticks: {
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    });
  }

  const caseTypeCanvas = document.getElementById("caseTypeChart");
  if (caseTypeCanvas && window.Chart) {
    new Chart(caseTypeCanvas, {
      type: "doughnut",
      data: {
        labels: ["Civil", "Criminal", "Family", "Corporate"],
        datasets: [
          {
            data: [40, 25, 20, 15],
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              font: { size: 11 },
            },
          },
        },
      },
    });
  }
}

/* ========== Case Research (Mock API) ========== */
function setupCaseSearchMock() {
  const form = document.getElementById("case-search-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("case-query").value.trim();
    const year = document.getElementById("case-year").value.trim();
    const court = document.getElementById("case-court").value.trim();

    const meta = document.getElementById("case-results-meta");
    const body = document.getElementById("case-results-body");

    if (!query) {
      meta.textContent = "Please enter some keywords to search.";
      body.innerHTML = "";
      return;
    }

    // Later you’ll call your real backend API here.
    // For now we simulate with mock data:
    const mockResults = [
      {
        title: `Sample case related to "${query}"`,
        court: court || "Supreme Court of India",
        date: year || "2020",
        citation: "2020 SCC 123",
        url: "#",
      },
      {
        title: `Another judgment on "${query}"`,
        court: "Delhi High Court",
        date: "2019",
        citation: "2019 DLT 456",
        url: "#",
      },
    ];

    meta.textContent = `Showing ${mockResults.length} result(s) for "${query}" (mock data).`;
    body.innerHTML = mockResults
      .map(
        (c) => `
      <tr>
        <td>${c.title}</td>
        <td>${c.court}</td>
        <td>${c.date}</td>
        <td>${c.citation}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1">Open</button>
          <button class="btn btn-sm btn-outline-success">Save</button>
        </td>
      </tr>`
      )
      .join("");
  });
}