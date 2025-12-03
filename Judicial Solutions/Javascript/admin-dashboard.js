// Javascript/admin-dashboard.js

// Backend API base (API Gateway)
const API_BASE = "https://86isfklr9k.execute-api.ap-south-1.amazonaws.com";

// Protect this page using the demo auth (from admin-auth.js)
if (typeof requireAdminAuth === "function") {
  requireAdminAuth();
}

// ---- Appointments data (loaded from API) ----
let appointments = [];
let editingAppointmentId = null; // null = create, not edit

// Chart + saved cases state
let leadsAppointmentsChart = null;
let caseTypeChart = null;

let savedCases = [];

// Services state
let servicesList = [];
let editingServiceId = null;

// Files & Templates state
let filesCache = [];
let editingFileId = null;


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

// ========== Appointments: stats + chart (Step 6) ==========

function updateAppointmentsStatsFromList() {
  const card = document.getElementById("stat-appointments");
  if (!card) return;

  // Today at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 6 days before today (so total window = 7 days)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  let count = 0;

  for (const appt of appointments) {
    if (!appt.datetime) continue;

    const d = new Date(appt.datetime);
    if (Number.isNaN(d.getTime())) continue;

    // Compare by date only (ignore time of day + timezone noise)
    d.setHours(0, 0, 0, 0);

    if (d >= sevenDaysAgo && d <= today) {
      count++;
    }
  }

  card.textContent = count;
}


function formatAppointmentDate(raw) {
  if (!raw) return "";
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

// ========== Appointments: stats + chart (Step 6) ==========

function updateAppointmentsStatsFromList() {
  const card = document.getElementById("stat-appointments");
  if (!card) return;
  card.textContent = appointments.length;   // total, not 7-day window

  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  let count = 0;

  for (const appt of appointments) {
    if (!appt.datetime) continue;
    const d = new Date(appt.datetime);
    if (Number.isNaN(d.getTime())) continue;
    if (d >= sevenDaysAgo && d <= now) count++;
  }

  card.textContent = count;
}

function updateAppointmentsChartFromList() {
  if (!leadsAppointmentsChart) return;

  const counts = new Array(7).fill(0); // Day -6 ... Today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  for (const appt of appointments) {
    if (!appt.datetime) continue;
    const d = new Date(appt.datetime);
    if (Number.isNaN(d.getTime())) continue;

    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - d) / MS_PER_DAY);

    if (diffDays >= 0 && diffDays <= 6) {
      const idx = 6 - diffDays; // 6 = today, 0 = 6 days ago
      counts[idx]++;
    }
  }

  leadsAppointmentsChart.data.datasets[1].data = counts;
  leadsAppointmentsChart.update();
}

// ========== Saved Cases: API + UI helpers (Step 7A) ==========

async function fetchCases() {
  try {
    const res = await fetch(`${API_BASE}/cases`);
    if (!res.ok) {
      console.error("Failed to fetch cases", res.status);
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching cases:", err);
    return [];
  }
}

function updateSavedCasesStat(cases) {
  const el = document.getElementById("stat-cases");
  if (!el) return;
  el.textContent = cases.length;
}

function updateSavedCasesTable(cases) {
  const body = document.getElementById("saved-cases-body");
  if (!body) return;

  const sorted = [...cases].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  body.innerHTML = sorted
    .map((c) => {
      const title = c.title || "Untitled case";
      const court = c.court || c.court_name || "-";
      const date = (c.date || c.judgment_date || "").toString().slice(0, 10);
      const tagsArr = Array.isArray(c.tags) ? c.tags : [];
      const tagsHtml = tagsArr
        .map((t) => `<span class="badge bg-secondary me-1">${t}</span>`)
        .join("");

      return `
        <tr>
          <td>${title}</td>
          <td>${court}</td>
          <td>${date}</td>
          <td>${tagsHtml}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1">Open</button>
            <button class="btn btn-sm btn-outline-danger">Remove</button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadSavedCasesFromApi() {
  const items = await fetchCases();
  savedCases = items || [];
  updateSavedCasesStat(savedCases);
  updateSavedCasesTable(savedCases);
}

// ========== Services: API + UI helpers (Step 9B + 9C) ==========


async function fetchServices() {
  try {
    const res = await fetch(`${API_BASE}/services`);
    if (!res.ok) {
      console.error("Failed to fetch services", res.status);
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching services:", err);
    return [];
  }
}

async function createService(payload) {
  try {
    const res = await fetch(`${API_BASE}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Failed to create service", res.status, data);
      alert("Error creating service.");
      return null;
    }
    return data;
  } catch (err) {
    console.error("Network error creating service", err);
    alert("Error creating service.");
    return null;
  }
}

async function updateService(id, updates) {
  try {
    const res = await fetch(`${API_BASE}/services/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Failed to update service", res.status, data);
      alert("Error updating service.");
      return null;
    }
    return data;
  } catch (err) {
    console.error("Network error updating service", err);
    alert("Error updating service.");
    return null;
  }
}

async function deleteService(id) {
  try {
    const res = await fetch(`${API_BASE}/services/${id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      console.error("Failed to delete service", res.status);
      alert("Error deleting service.");
      return false;
    }
    return true;
  } catch (err) {
    console.error("Network error deleting service", err);
    alert("Error deleting service.");
    return false;
  }
}

function updateServicesTable(services) {
  const body = document.getElementById("services-table-body");
  if (!body) return;

  const sorted = [...services].sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
  );

  body.innerHTML = sorted
    .map((s) => {
      const shown = s.shown !== false; // default true
      const name = s.name || "Untitled service";
      const category = s.category || s.cat || "-";
      const updated =
        (s.updated_at || s.created_at || "").toString().slice(0, 10);

      return `
        <tr>
          <td>${name}</td>
          <td>${category}</td>
          <td>
            <span class="badge bg-${shown ? "success" : "secondary"}">
              ${shown ? "Visible" : "Hidden"}
            </span>
          </td>
          <td>${updated}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1 btn-service-edit" data-id="${s.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary me-1 btn-service-toggle" data-id="${s.id}">
              ${shown ? "Hide" : "Show"}
            </button>
            <button class="btn btn-sm btn-outline-danger btn-service-delete" data-id="${s.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadServicesFromApi() {
  const items = await fetchServices();
  servicesList = items || [];
  updateServicesTable(servicesList);
}

function openServiceModal(service) {
  const form = document.getElementById("service-form");
  if (!form) return;

  if (service) {
    editingServiceId = service.id;
    document.getElementById("serviceModalLabel").textContent = "Edit Service";
    document.getElementById("service-name").value = service.name || "";
    document.getElementById("service-category").value =
      service.category || "";
    document.getElementById("service-description").value =
      service.description || "";
    document.getElementById("service-shown").checked = service.shown !== false;
  } else {
    editingServiceId = null;
    document.getElementById("serviceModalLabel").textContent = "Add Service";
    form.reset();
    document.getElementById("service-shown").checked = true;
  }

  const modalEl = document.getElementById("serviceModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function setupServiceForm() {
  const form = document.getElementById("service-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("service-name").value.trim();
    const category = document.getElementById("service-category").value.trim();
    const description = document
      .getElementById("service-description")
      .value.trim();
    const shown = document.getElementById("service-shown").checked;

    if (!name) {
      alert("Service name is required.");
      return;
    }

    const payload = { name, category, description, shown };

    let result = null;

    if (editingServiceId) {
      result = await updateService(editingServiceId, payload);
      if (!result) return;

      servicesList = servicesList.map((s) =>
        s.id === editingServiceId ? { ...s, ...result } : s
      );
    } else {
      result = await createService(payload);
      if (!result) return;

      servicesList.unshift(result);
    }

    updateServicesTable(servicesList);

    editingServiceId = null;
    const modalEl = document.getElementById("serviceModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  });
}

function setupServiceTableActions() {
  const body = document.getElementById("services-table-body");
  if (!body) return;

  body.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".btn-service-edit");
    const toggleBtn = e.target.closest(".btn-service-toggle");
    const deleteBtn = e.target.closest(".btn-service-delete");

    if (editBtn) {
      const id = editBtn.getAttribute("data-id");
      const service = servicesList.find((s) => s.id === id);
      if (service) openServiceModal(service);
    } else if (toggleBtn) {
      const id = toggleBtn.getAttribute("data-id");
      const service = servicesList.find((s) => s.id === id);
      if (!service) return;

      const newShown = service.shown === false ? true : false;
      const updated = await updateService(id, { shown: newShown });
      if (!updated) return;

      servicesList = servicesList.map((s) =>
        s.id === id ? { ...s, ...updated } : s
      );
      updateServicesTable(servicesList);
    } else if (deleteBtn) {
      const id = deleteBtn.getAttribute("data-id");
      if (!id) return;

      const ok = confirm("Delete this service?");
      if (!ok) return;

      const success = await deleteService(id);
      if (!success) return;

      servicesList = servicesList.filter((s) => s.id !== id);
      updateServicesTable(servicesList);
    }
  });
}


// ---------- Files & Templates (read only) ----------

async function fetchFiles() {
  try {
    const res = await fetch(`${API_BASE}/files`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching files:", err);
    return [];
  }
}

function renderFilesTable(files) {
  const tbody = document.getElementById("files-table-body");
  if (!tbody) return;

  if (!files.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;">No files found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = files
    .map((file) => {
      const title = file.title || "(no title)";
      const type = file.type || "-";
      const category = file.category || "-";
      const status = file.status || "-";
      const url = file.file_url || "#";

      return `
        <tr data-id="${file.id}">
          <td>${title}</td>
          <td>${type}</td>
          <td>${category}</td>
          <td>${status}</td>
          <td>
            ${file.file_url
              ? `<a href="${url}" target="_blank" rel="noopener noreferrer">Open</a>`
              : "-"}
          </td>
          <td>
            <button class="btn btn-sm btn-outline-primary file-edit-btn">Edit</button>
            <button class="btn btn-sm btn-outline-danger file-delete-btn ms-1">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadFilesFromApi() {
  const files = await fetchFiles();
  filesCache = files;
  renderFilesTable(files);
}

async function createFileApi(payload) {
  const res = await fetch(`${API_BASE}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create file failed: HTTP ${res.status}`);
  return res.json();
}

async function updateFileApi(id, payload) {
  const res = await fetch(`${API_BASE}/files/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Update file failed: HTTP ${res.status}`);
  return res.json();
}

async function deleteFileApi(id) {
  const res = await fetch(`${API_BASE}/files/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete file failed: HTTP ${res.status}`);
  }
}


function openFileModal(file) {
  const titleEl = document.getElementById("fileModalLabel");
  const form = document.getElementById("file-form");
  const titleInput = document.getElementById("file-title");
  const typeInput = document.getElementById("file-type");
  const categoryInput = document.getElementById("file-category");
  const urlInput = document.getElementById("file-url");
  const statusInput = document.getElementById("file-status");
  const descInput = document.getElementById("file-description");
  const tagsInput = document.getElementById("file-tags");

  if (!form) return;

  if (file) {
    editingFileId = file.id;
    titleEl && (titleEl.textContent = "Edit File / Template");
    titleInput.value = file.title || "";
    typeInput.value = file.type || "template";
    categoryInput.value = file.category || "";
    urlInput.value = file.file_url || "";
    statusInput.value = file.status || "active";
    descInput.value = file.description || "";
    tagsInput.value = (file.tags || []).join(", ");
  } else {
    editingFileId = null;
    titleEl && (titleEl.textContent = "Add File / Template");
    form.reset();
    typeInput.value = "template";
    statusInput.value = "active";
  }

  const modalEl = document.getElementById("fileModal");
  if (modalEl && window.bootstrap) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else if (modalEl) {
    modalEl.style.display = "block"; // fallback if no Bootstrap
  }
}

function setupFileForm() {
  const form = document.getElementById("file-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      title: document.getElementById("file-title").value.trim(),
      type: document.getElementById("file-type").value.trim(),
      category: document.getElementById("file-category").value.trim(),
      file_url: document.getElementById("file-url").value.trim(),
      status: document.getElementById("file-status").value.trim(),
      description: document.getElementById("file-description").value.trim(),
      tags: document
        .getElementById("file-tags")
        .value.split(",")
        .map((t) => t.trim())
        .filter((t) => t),
    };

    try {
      if (editingFileId) {
        await updateFileApi(editingFileId, payload);
      } else {
        await createFileApi(payload);
      }

      const modalEl = document.getElementById("fileModal");
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal && modal.hide();
      } else if (modalEl) {
        modalEl.style.display = "none";
      }

      await loadFilesFromApi();
    } catch (err) {
      console.error("Error saving file:", err);
      alert("Error saving file. See console for details.");
    }
  });
}

function setupFilesTableActions() {
  const tbody = document.getElementById("files-table-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".file-edit-btn");
    const deleteBtn = e.target.closest(".file-delete-btn");

    if (editBtn) {
      const tr = editBtn.closest("tr");
      const id = tr?.dataset.id;
      const file = filesCache.find((f) => f.id === id);
      if (file) openFileModal(file);
      return;
    }

    if (deleteBtn) {
      const tr = deleteBtn.closest("tr");
      const id = tr?.dataset.id;
      if (!id) return;

      if (!confirm("Delete this file/template?")) return;

      try {
        await deleteFileApi(id);
        await loadFilesFromApi();
      } catch (err) {
        console.error("Error deleting file:", err);
        alert("Error deleting file. See console for details.");
      }
    }
  });
}

// async function initFilesSection() {
//   const files = await fetchFiles();
//   renderFilesTable(files);
// }
async function initFilesSection() {
  await loadFilesFromApi();
  setupFileForm();

  const addBtn = document.getElementById("addFileBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => openFileModal(null));
  }

  setupFilesTableActions();
}



// ========== Leads: fetch from backend & 7-day stats (Step 4B) ==========
async function fetchForms() {
  // ... your existing leads functions continue here
}



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
  updateLeadsChartFromForms(forms);
  updateCaseTypeChartFromForms(forms);
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function getCaseTypeFromForm(item) {
  if (!item) return "General";

  // Prefer explicit fields if you add them later
  const explicit = (item.case_type || item.caseType || item.type || "").toString().toLowerCase();

  // Fallback to form_id (civil-cases, criminal-defense, etc.)
  const source = explicit || (item.form_id || "").toString().toLowerCase();

  if (source.includes("civil")) return "Civil";
  if (source.includes("criminal")) return "Criminal";
  if (source.includes("family")) return "Family";
  if (source.includes("corporate")) return "Corporate";
  if (source.includes("legalcontactform") || source.includes("legalcontact"))
    return "Legal";

  return "General"; // contact-index, legalContactForm, etc.
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
      // const caseType = f.case_type || "General";
      const caseType = getCaseTypeFromForm(f);
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

// Update line chart "Leads" dataset from real forms (last 7 days)
function updateLeadsChartFromForms(forms) {
  if (!leadsAppointmentsChart) return;

  const counts = new Array(7).fill(0); // [Day-6 ... Today]

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  for (const item of forms) {
    if (!item.created_at) continue;

    const d = new Date(item.created_at);
    if (Number.isNaN(d.getTime())) continue;

    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - d) / MS_PER_DAY);

    // 0 = today, 1 = yesterday, ... 6 = 6 days ago
    if (diffDays >= 0 && diffDays <= 6) {
      const idx = 6 - diffDays; // index 6 = today, 0 = 6 days ago
      counts[idx]++;
    }
  }

  leadsAppointmentsChart.data.datasets[0].data = counts;
  leadsAppointmentsChart.update();
}

// Update donut chart from real form case types
function updateCaseTypeChartFromForms(forms) {
  if (!caseTypeChart) return;

  const counts = {
    Civil: 0,
    Criminal: 0,
    Family: 0,
    Corporate: 0,
    Legal: 0,
    General: 0,
  };

  for (const f of forms) {
    const type = getCaseTypeFromForm(f);
    counts[type] = (counts[type] || 0) + 1;
  }

  caseTypeChart.data.datasets[0].data = [
    counts.Civil,
    counts.Criminal,
    counts.Family,
    counts.Corporate,
    counts.Legal,
    counts.General,
  ];

  caseTypeChart.update();
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
      // const type = f.case_type || "General";
      const type = getCaseTypeFromForm(f);
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

  // Appointments: real backend data (Step 6 finished)
  loadAppointmentsFromApi()

  // Hook appointment form + table actions
  setupAppointmentForm();
  setupAppointmentTableActions();

  // When clicking "Add manual appointment", reset to create mode
  const addBtn = document.getElementById("addAppointmentBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      editingAppointmentId = null;

      const form = document.getElementById("appointment-form");
      if (form) form.reset();
      const statusSelect = document.getElementById("appointment-status");
      if (statusSelect) statusSelect.value = "Pending";

      const title = document.getElementById("appointmentModalLabel");
      if (title) title.textContent = "Add Manual Appointment";

      if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = "Save appointment";
      }
    });
  }

  // Saved cases: real backend data (Step 7A)
  loadSavedCasesFromApi();

  // Services
  loadServicesFromApi();
  setupServiceForm();
  setupServiceTableActions();

  // "Add service" button
  const addServiceBtn = document.getElementById("addServiceBtn");
  if (addServiceBtn) {
    addServiceBtn.addEventListener("click", () => {
      openServiceModal(null); // create mode
    });
  }

  initFilesSection();  
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
}

/* ========== Appointments helpers ========== */

// ========== Appointments: API helpers ==========

async function fetchAppointments() {
  try {
    const res = await fetch(`${API_BASE}/appointments`);
    if (!res.ok) {
      console.error("Failed to fetch appointments", res.status);
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching appointments:", err);
    return [];
  }
}

async function createAppointment(payload) {
  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Failed to create appointment", res.status, data);
      alert("Error saving appointment.");
      return null;
    }
    return data;
  } catch (err) {
    console.error("Network error creating appointment", err);
    alert("Error saving appointment.");
    return null;
  }
}

async function updateAppointment(id, updates) {
  try {
    const res = await fetch(`${API_BASE}/appointments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Failed to update appointment", res.status, data);
      alert("Error updating appointment.");
      return null;
    }
    return data;
  } catch (err) {
    console.error("Network error updating appointment", err);
    alert("Error updating appointment.");
    return null;
  }
}

async function deleteAppointment(id) {
  try {
    const res = await fetch(`${API_BASE}/appointments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      console.error("Failed to delete appointment", res.status);
      alert("Error deleting appointment.");
      return false;
    }
    return true;
  } catch (err) {
    console.error("Network error deleting appointment", err);
    alert("Error deleting appointment.");
    return false;
  }
}

async function loadAppointmentsFromApi() {
  const items = await fetchAppointments();
  appointments = items || [];

  renderAppointmentsTable();
  renderAppointmentsPreview();
  updateAppointmentsStatsFromList();
  updateAppointmentsChartFromList();
}


function renderAppointmentsTable() {
  const tbody = document.getElementById("appointments-table-body");
  if (!tbody) return;

  tbody.innerHTML = appointments
    .map((a) => {
      const caseType = a.case_type || a.type || "General";
      return `
        <tr>
          <td>${a.client}</td>
          <td>${caseType}</td>
          <td>${formatAppointmentDate(a.datetime)}</td>
          <td>${a.mode}</td>
          <td><span class="badge bg-${statusColor(a.status)}">${a.status}</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1 btn-appointment-edit" data-id="${a.id}">Reschedule</button>
            <button class="btn btn-sm btn-outline-danger btn-appointment-delete" data-id="${a.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join("");
}


function renderAppointmentsPreview() {
  const tbody = document.getElementById("upcoming-appointments-body");
  if (!tbody) return;

  const upcoming = appointments.slice(0, 3);

  tbody.innerHTML = upcoming
    .map((a) => {
      const caseType = a.case_type || a.type || "General";
      return `
    <tr>
      <td>${a.client}</td>
      <td>${caseType}</td>
      <td>${formatAppointmentDate(a.datetime)}</td>
      <td>${a.mode}</td>
      <td><span class="badge bg-${statusColor(a.status)}">${a.status}</span></td>
    </tr>`
    })
    .join("");
}

function setupAppointmentTableActions() {
  const tbody = document.getElementById("appointments-table-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".btn-appointment-edit");
    const deleteBtn = e.target.closest(".btn-appointment-delete");

    if (editBtn) {
      const id = editBtn.getAttribute("data-id");
      openEditAppointment(id);
    } else if (deleteBtn) {
      const id = deleteBtn.getAttribute("data-id");
      if (!id) return;
      const ok = confirm("Delete this appointment?");
      if (!ok) return;

      const success = await deleteAppointment(id);
      if (!success) return;

      appointments = appointments.filter((a) => a.id !== id);
      renderAppointmentsTable();
      renderAppointmentsPreview();
      updateAppointmentsStatsFromList();
      updateAppointmentsChartFromList();
    }
  });
}

function openEditAppointment(id) {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) return;

  editingAppointmentId = id;

  const form = document.getElementById("appointment-form");
  if (!form) return;

  document.getElementById("appointment-client").value = appt.client || "";
  document.getElementById("appointment-type").value =
    appt.case_type || appt.type || "";
  document.getElementById("appointment-datetime").value = appt.datetime || "";
  document.getElementById("appointment-mode").value = appt.mode || "In person";
  document.getElementById("appointment-status").value =
    appt.status || "Pending";

  const title = document.getElementById("appointmentModalLabel");
  if (title) title.textContent = "Edit / Reschedule Appointment";

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Update appointment";

  const modalEl = document.getElementById("appointmentModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function setupAppointmentForm() {
  const form = document.getElementById("appointment-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const client = document.getElementById("appointment-client").value.trim();
    const type = document.getElementById("appointment-type").value.trim();
    const datetimeRaw = document.getElementById("appointment-datetime").value;
    const mode = document.getElementById("appointment-mode").value;
    const status = document.getElementById("appointment-status").value;

    if (!client || !type || !datetimeRaw) {
      return;
    }

    const payload = {
      client,
      case_type: type,
      datetime: datetimeRaw,
      mode,
      status,
    };

    let result = null;

    if (editingAppointmentId) {
      // UPDATE
      result = await updateAppointment(editingAppointmentId, payload);
      if (!result) return;

      // replace in local list
      appointments = appointments.map((a) =>
        a.id === editingAppointmentId ? { ...a, ...result } : a
      );
    } else {
      // CREATE
      result = await createAppointment(payload);
      if (!result) return;

      appointments.unshift(result);
    }

    renderAppointmentsTable();
    renderAppointmentsPreview();
    updateAppointmentsStatsFromList();
    updateAppointmentsChartFromList();

    // Reset edit mode
    editingAppointmentId = null;
    form.reset();
    document.getElementById("appointment-status").value = "Pending";

    const title = document.getElementById("appointmentModalLabel");
    if (title) title.textContent = "Add Manual Appointment";

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Save appointment";

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
  leadsAppointmentsChart = new Chart(leadsCanvas, {
    type: "line",
    data: {
      labels: ["Day -6", "Day -5", "Day -4", "Day -3", "Day -2", "Day -1", "Today"],
      datasets: [
        {
          label: "Leads",
          data: [0, 0, 0, 0, 0, 0, 0],   // will be replaced with real data
          tension: 0.4,
        },
        {
          label: "Appointments",
          data: [0, 0, 0, 0, 0, 0, 0], // will be filled from appointments list
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
    caseTypeChart = new Chart(caseTypeCanvas, {
      type: "doughnut",
      data: {
        labels: ["Civil", "Criminal", "Family", "Corporate", "Legal", "General"],
        datasets: [
          {
            data: [0, 0, 0, 0, 0, 0], // will be filled from real data
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
      updateLeadsChartFromForms(forms);
      updateCaseTypeChartFromForms(forms);

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