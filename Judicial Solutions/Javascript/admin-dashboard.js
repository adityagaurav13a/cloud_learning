// Javascript/admin-dashboard.js

// Backend API base (API Gateway)
const API_BASE = "https://86isfklr9k.execute-api.ap-south-1.amazonaws.com";


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

// ========== Leads: fetch from backend ==========

// ========== Leads: fetch from backend & 7-day stats (Step 4B) ==========

async function fetchForms() {
  try {
    const res = await fetch(`${API_BASE}/forms`);
    if (!res.ok) {
      console.error("Failed to fetch forms", res.status);
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching forms:", err);
    return [];
  }
}

// card: New Leads (7 days)
function updateLeadStatsFromForms(forms) {
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 6); // last 7 days including today

  let leadsLast7 = 0;

  for (const item of forms) {
    if (!item.created_at) continue;
    const created = new Date(item.created_at);
    if (Number.isNaN(created.getTime())) continue;

    if (created >= sevenDaysAgo && created <= now) {
      leadsLast7++;
    }
  }

  const statEl = document.getElementById("stat-leads");
  if (statEl) {
    statEl.textContent = leadsLast7;
  }
}

async function loadDashboardData() {
  const forms = await fetchForms();
  updateLeadStatsFromForms(forms);
  updateRecentLeadsTable(forms);
  updateLeadsSectionTable(forms);
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatDateTimeReadable(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

// Leads section: full table (Leads / Contact Requests)
function updateLeadsSectionTable(forms) {
  const body = document.getElementById("leads-table-body");
  if (!body) return;

  const sorted = [...forms].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  body.innerHTML = sorted
    .map((f, idx) => {
      const status = f.read ? "Closed" : "New";
      const caseType = f.case_type || "General";
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${f.name || "-"}</td>
          <td>${f.email || "-"}</td>
          <td>${f.phone || "-"}</td>
          <td>${caseType}</td>
          <td>${formatDateTimeReadable(f.created_at)}</td>
          <td><span class="badge bg-${statusColor(status)}">${status}</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1">View</button>
            <button class="btn btn-sm btn-outline-secondary">Note</button>
          </td>
        </tr>`;
    })
    .join("");
}

// Dashboard: Recent Leads table (left small table)
function updateRecentLeadsTable(forms) {
  const body = document.getElementById("recent-leads-body");
  if (!body) return;

  // sort newest first and take top 5
  const sorted = [...forms].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const top = sorted.slice(0, 5);

  body.innerHTML = top
    .map((f) => {
      const name = f.name || "Unknown";
      const type = f.case_type || "General";
      const date = formatDateShort(f.created_at);
      const status = f.read ? "Closed" : "New";
      return `
        <tr>
          <td>${name}</td>
          <td>${type}</td>
          <td>${date}</td>
          <td><span class="badge bg-${statusColor(status)}">${status}</span></td>
        </tr>`;
    })
    .join("");
}


// ========== Main Dashboard JS ==========


document.addEventListener("DOMContentLoaded", () => {
  setupSidebarNavigation();
  setupSidebarToggle();
  populateDummyData();
  initCharts();
  setupCaseSearchMock();

  // override dummy leads with real data
  loadDashboardData();
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

  const refreshBtn = document.getElementById("refresh-leads");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise me-1"></i>Refreshing...';

      const forms = await fetchForms();
      updateLeadStatsFromForms(forms);
      updateRecentLeadsTable(forms);
      updateLeadsSectionTable(forms);

      refreshBtn.disabled = false;
      refreshBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise me-1"></i>Refresh';
    });
  }

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