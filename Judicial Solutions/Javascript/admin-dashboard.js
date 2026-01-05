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

let filesLastToken = null;
const FILES_PAGE_SIZE = 50;

// Posts state
let postsCache = [];
let editingPostId = null;

// Leads state (for filters + view/note)
let allLeadsForms = [];



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

function normalizeStatus(s) {
  return (s || "NEW").toUpperCase();
}

function statusLabel(s) {
  const v = normalizeStatus(s);
  if (v === "IN_PROGRESS") return "In progress";
  if (v === "COMPLETED") return "Closed";
  return "New";
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

function applyFilesFilters() {
  const typeFilter = document.getElementById("file-type-filter");
  const statusFilter = document.getElementById("file-status-filter");
  const searchInput = document.getElementById("file-search");

  const type = (typeFilter?.value || "").trim().toLowerCase();
  const status = (statusFilter?.value || "").trim().toLowerCase();
  const q = (searchInput?.value || "").trim().toLowerCase();

  let filtered = [...filesCache];

  if (type) {
    filtered = filtered.filter((f) => (f.type || "").toLowerCase() === type);
  }
  if (status) {
    filtered = filtered.filter((f) => (f.status || "").toLowerCase() === status);
  }
  if (q) {
    filtered = filtered.filter((f) =>
      (f.title || "").toLowerCase().includes(q)
    );
  }

  renderFilesTable(filtered);
}

function updateFilesPaginationControls() {
  const btn = document.getElementById("filesLoadMoreBtn");
  if (!btn) return;
  btn.style.display = filesLastToken ? "inline-block" : "none";
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

async function updateLead(id, payload = {}) {
  return fetch(`${API_BASE}/forms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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

// ========== Posts: API + UI helpers (Step 9A) ==========
async function fetchPosts() {
  try {
    const res = await fetch(`${API_BASE}/posts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("Error fetching posts:", err);
    return [];
  }
}

async function createPostApi(payload) {
  const res = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create post failed: HTTP ${res.status}`);
  return res.json();
}

async function updatePostApi(id, payload) {
  const res = await fetch(`${API_BASE}/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Update post failed: HTTP ${res.status}`);
  return res.json();
}

async function deletePostApi(id) {
  const res = await fetch(`${API_BASE}/posts/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete post failed: HTTP ${res.status}`);
  }
}

function renderPostsTable(posts) {
  const tbody = document.getElementById("posts-table-body");
  if (!tbody) return;

  if (!posts.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;">No posts yet</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = posts
    .map((p) => {
      const title = p.title || "(no title)";
      const category = p.category || "-";
      const status = p.status || "draft";
      const publishedAt = p.published_at || "-";

      return `
        <tr data-id="${p.id}">
          <td>${title}</td>
          <td>${category}</td>
          <td>${status}</td>
          <td>${publishedAt}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary post-edit-btn">Edit</button>
            <button class="btn btn-sm btn-outline-danger post-delete-btn ms-1">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadPostsFromApi() {
  const posts = await fetchPosts();
  postsCache = posts;
  renderPostsTable(posts);
}

function openPostModal(post) {
  const form = document.getElementById("post-form");
  if (!form) return;

  const titleEl = document.getElementById("postModalLabel");
  const titleInput = document.getElementById("post-title");
  const slugInput = document.getElementById("post-slug");
  const categoryInput = document.getElementById("post-category");
  const statusInput = document.getElementById("post-status");
  const excerptInput = document.getElementById("post-excerpt");
  const contentInput = document.getElementById("post-content");
  const tagsInput = document.getElementById("post-tags");

  if (post) {
    editingPostId = post.id;
    titleEl && (titleEl.textContent = "Edit Post");
    titleInput.value = post.title || "";
    slugInput.value = post.slug || "";
    categoryInput.value = post.category || "";
    statusInput.value = post.status || "draft";
    excerptInput.value = post.excerpt || "";
    contentInput.value = post.content || "";
    tagsInput.value = (post.tags || []).join(", ");
  } else {
    editingPostId = null;
    titleEl && (titleEl.textContent = "New Post");
    form.reset();
    statusInput.value = "draft";
  }

  const modalEl = document.getElementById("postModal");
  if (modalEl && window.bootstrap) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else if (modalEl) {
    modalEl.style.display = "block";
  }
}

function setupPostForm() {
  const form = document.getElementById("post-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("post-title").value.trim();
    const slug = document.getElementById("post-slug").value.trim();
    const category = document.getElementById("post-category").value.trim();
    const status = document.getElementById("post-status").value.trim();
    const excerpt = document.getElementById("post-excerpt").value.trim();
    const content = document.getElementById("post-content").value.trim();
    const tags = document
      .getElementById("post-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    const payload = {
      title,
      slug,
      category,
      status,
      excerpt,
      content,
      tags,
    };

    // if publishing now and no published_at set, set it
    if (status === "published" && !editingPostId) {
      payload.published_at = new Date().toISOString();
    }

    try {
      if (editingPostId) {
        await updatePostApi(editingPostId, payload);
      } else {
        await createPostApi(payload);
      }

      const modalEl = document.getElementById("postModal");
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal && modal.hide();
      } else if (modalEl) {
        modalEl.style.display = "none";
      }

      await loadPostsFromApi();
    } catch (err) {
      console.error("Error saving post:", err);
      alert("Error saving post. See console for details.");
    }
  });
}

function setupPostsTableActions() {
  const tbody = document.getElementById("posts-table-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".post-edit-btn");
    const deleteBtn = e.target.closest(".post-delete-btn");

    if (editBtn) {
      const tr = editBtn.closest("tr");
      const id = tr?.dataset.id;
      const post = postsCache.find((p) => p.id === id);
      if (post) openPostModal(post);
      return;
    }

    if (deleteBtn) {
      const tr = deleteBtn.closest("tr");
      const id = tr?.dataset.id;
      if (!id) return;

      if (!confirm("Delete this post?")) return;

      try {
        await deletePostApi(id);
        await loadPostsFromApi();
      } catch (err) {
        console.error("Error deleting post:", err);
        alert("Error deleting post. See console for details.");
      }
    }
  });
}

// ---------- Files & Templates (read only) ----------

async function fetchFiles(cursor = null) {
  try {
    const params = new URLSearchParams();
    params.set("limit", FILES_PAGE_SIZE.toString());
    if (cursor) params.set("last", cursor);

    const url = `${API_BASE}/files?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    filesLastToken = data.last || null;
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
              ? `<a href="#" class="file-open-link" data-id="${file.id}">Open</a>`
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

async function loadFilesFromApi(reset = true) {
  if (reset) {
    filesCache = [];
    filesLastToken = null;
  }

  const newItems = await fetchFiles(filesLastToken);
  filesCache = [...filesCache, ...newItems];

  applyFilesFilters();
  updateFilesPaginationControls();
  updateFilesStatFromCache();
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

    const fileInput = document.getElementById("file-upload");
    const selectedFile = fileInput?.files?.[0] || null;

    let fileUrl = document.getElementById("file-url").value.trim();
    
    // debugging logs
    console.log("selectedFile =", selectedFile);
    console.log("initial fileUrl =", fileUrl);

    try {
      // 1) If a file is selected, upload to S3 via presigned URL
      if (selectedFile) {
        const presignRes = await fetch(`${API_BASE}/files/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedFile.name,
            content_type: selectedFile.type || "application/octet-stream",
          }),
        });

        if (!presignRes.ok) {
          throw new Error(`Presign failed: HTTP ${presignRes.status}`);
        }
        const presignData = await presignRes.json();

        await fetch(presignData.upload_url, {
          method: "PUT",
          headers: {
            "Content-Type": selectedFile.type || "application/octet-stream",
          },
          body: selectedFile,
        });

        fileUrl = presignData.file_url;
        document.getElementById("file-url").value = fileUrl;
      }

      // 2) Build payload
      const payload = {
        title: document.getElementById("file-title").value.trim(),
        type: document.getElementById("file-type").value.trim(),
        category: document.getElementById("file-category").value.trim(),
        file_url: fileUrl,
        status: document.getElementById("file-status").value.trim(),
        description: document.getElementById("file-description").value.trim(),
        tags: document
          .getElementById("file-tags")
          .value.split(",")
          .map((t) => t.trim())
          .filter((t) => t),
      };

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

      if (fileInput) fileInput.value = "";
      await loadFilesFromApi(true);
    } catch (err) {
      console.error("Error saving file:", err);
      alert("Error saving file / upload. See console for details.");
    }
  });
}

function setupFilesTableActions() {
  const tbody = document.getElementById("files-table-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const openLink = e.target.closest(".file-open-link");
    const editBtn = e.target.closest(".file-edit-btn");
    const deleteBtn = e.target.closest(".file-delete-btn");

    if (openLink) {
      e.preventDefault();
      const id = openLink.dataset.id;
      if (!id) return;

      try {
        const res = await fetch(`${API_BASE}/files/download/${id}`);
        if (!res.ok) throw new Error(`Download URL failed: HTTP ${res.status}`);
        const data = await res.json();
        if (data.download_url) {
          window.open(data.download_url, "_blank");
        }
      } catch (err) {
        console.error("Error getting download URL:", err);
        alert("Could not generate download link. See console for details.");
      }
      return;
    }

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
        await loadFilesFromApi(true);
      } catch (err) {
        console.error("Error deleting file:", err);
        alert("Error deleting file. See console for details.");
      }
    }
  });
}

async function initFilesSection() {
  await loadFilesFromApi(true);
  setupFileForm();

  const addBtn = document.getElementById("addFileBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => openFileModal(null));
  }

  setupFilesTableActions();

  const typeFilter = document.getElementById("file-type-filter");
  const statusFilter = document.getElementById("file-status-filter");
  const searchInput = document.getElementById("file-search");
  const loadMoreBtn = document.getElementById("filesLoadMoreBtn");

  [typeFilter, statusFilter].forEach((el) => {
    if (el) el.addEventListener("change", applyFilesFilters);
  });
  if (searchInput) {
    searchInput.addEventListener("input", applyFilesFilters);
  }
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => loadFilesFromApi(false));
  }
}

function updateFilesStatFromCache() {
  const el = document.getElementById("stat-files");
  if (!el) return;
  el.textContent = filesCache.length || 0;
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
  allLeadsForms = (forms || []).map((f) => ({
    ...f,
    status: f.status || "NEW",
  }));

  updateLeadStatsFromForms(allLeadsForms);
  updateRecentLeadsTable(allLeadsForms);
  applyLeadsFiltersAndRender();        // instead of direct table render
  updateLeadsChartFromForms(allLeadsForms);
  updateCaseTypeChartFromForms(allLeadsForms);
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
      const rawStatus = (f.status || "NEW").toUpperCase();
      const status = statusLabel(f.status);

      const caseType = getCaseTypeFromForm(f);
      const id = f.id || f.form_id || f.pk || "";
      const hasNote = (f.internal_note || "").trim().length > 0;

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
            <button class="btn btn-sm btn-outline-primary me-1 btn-lead-view" data-id="${id}">View</button>
            <button
              class="btn btn-sm me-1 btn-lead-note
                    ${hasNote ? "btn-secondary" : "btn-outline-secondary"}"
              data-id="${id}">
              ${hasNote ? "Noted ✓" : "Note"}
            </button>

            <div class="dropdown d-inline">
              <button class="btn btn-sm btn-outline-dark dropdown-toggle"
                      data-bs-toggle="dropdown">
                More
              </button>

              <ul class="dropdown-menu">
                <li>
                  <button
                    class="dropdown-item btn-schedule-from-lead"
                    data-id="${id}">
                    Schedule Appointment
                  </button>
                </li>

                <li>
                  <a class="dropdown-item btn-lead-complete"
                    data-id="${id}"
                    href="#">
                    Complete
                  </a>
                </li>

                <li>
                  <a class="dropdown-item btn-lead-reopen"
                    data-id="${id}"
                    href="#">
                    Reopen
                  </a>
                </li>

                <li><hr class="dropdown-divider"></li>

                <li>
                  <a class="dropdown-item text-danger btn-lead-delete"
                    data-id="${id}"
                    href="#">
                    Delete
                  </a>
                </li>
              </ul>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

// --- Leads filters + actions ---

function getLeadsFilterControls() {
  const section = document.getElementById("leads-section");
  if (!section) return {};
  const searchInput = section.querySelector("input.form-control-sm");
  const selects = section.querySelectorAll("select.form-select-sm");
  const statusSelect = selects[0];
  const caseTypeSelect = selects[1];
  return { searchInput, statusSelect, caseTypeSelect };
}

function applyLeadsFiltersAndRender() {
  const forms = allLeadsForms || [];
  const { searchInput, statusSelect, caseTypeSelect } = getLeadsFilterControls();

  const search = (searchInput?.value || "").trim().toLowerCase();
  const statusVal = (statusSelect?.value || "all").toLowerCase() || "all";
  const caseTypeVal = caseTypeSelect?.value || "all";

  const filtered = forms.filter((f) => {
    let ok = true;

    if (search) {
      const text = `${f.name || ""} ${f.email || ""}`.toLowerCase();
      ok = ok && text.includes(search);
    }

    if (statusVal !== "all") {
      const s = (f.status || "NEW").toLowerCase();
      ok = ok && s === statusVal;
    }

    if (caseTypeVal !== "all") {
      const ct = getCaseTypeFromForm(f);
      ok = ok && ct === caseTypeVal;
    }

    return ok;
  });

  updateLeadsSectionTable(filtered);
}

function setupLeadsFilters() {
  const { searchInput, statusSelect, caseTypeSelect } = getLeadsFilterControls();
  if (searchInput) searchInput.addEventListener("input", applyLeadsFiltersAndRender);
  if (statusSelect) statusSelect.addEventListener("change", applyLeadsFiltersAndRender);
  if (caseTypeSelect) caseTypeSelect.addEventListener("change", applyLeadsFiltersAndRender);
}

function buildLeadUpdatePayload(form) {
  return {    // backend can sync this
    internal_note: form.internal_note || "",
  };
}

function setupLeadsTableActions() {
  const body = document.getElementById("leads-table-body");
  if (!body) return;

  body.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".btn-lead-view");
    const noteBtn = e.target.closest(".btn-lead-note");
    if (!viewBtn && !noteBtn) return;

    const id = viewBtn?.dataset.id || noteBtn?.dataset.id;
    const form = (allLeadsForms || []).find(
      (f) => String(f.id || f.form_id || f.pk) === String(id)
    );
    if (!form) return;

    if (viewBtn) {
      alert(
        `Lead details\n\n` +
          `Name: ${form.name || "-"}\n` +
          `Email: ${form.email || "-"}\n` +
          `Phone: ${form.phone || "-"}\n` +
          `Case type: ${getCaseTypeFromForm(form)}\n` +
          `Received: ${formatDateTimeReadable(form.created_at)}\n\n` +
          `Message:\n${form.message || form.details || "-"}\n\n` +
          `Internal note:\n${form.internal_note || "-"}`
      );
      if (e.target.classList.contains("btn-lead-reopen")) {
        if (!confirm("Reopen this lead and move it back to In Progress?")) return;

        updateLead(id, { status: "NEW" }).then(() => {
          const f = allLeadsForms.find(x => x.id === id);
          if (f) f.status = "IN_PROGRESS";
          applyLeadsFiltersAndRender();
      });
      }
    } else if (noteBtn) {
      const existing = form.internal_note || "";
      const note = prompt("Add / update internal note:", existing);
      if (note === null) return;
      updateLead(id, { internal_note: note, status: "IN_PROGRESS" }).then(() => {
        form.internal_note = note;
        form.status = "IN_PROGRESS";
        applyLeadsFiltersAndRender();
      });
      // later: send to backend
    }
  });
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

  const sorted = [...forms].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const top = sorted.slice(0, 5);

  body.innerHTML = top
    .map((f) => {
      const name = f.name || "Unknown";
      const type = getCaseTypeFromForm(f);
      const date = formatDateShort(f.created_at);
      const label = statusLabel(f.status);

      return `
        <tr>
          <td>${name}</td>
          <td>${type}</td>
          <td>${date}</td>
          <td><span class="badge bg-${statusColor(label)}">${label}</span></td>
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
  setupLeadsFilters();
  setupLeadsTableActions();

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
    // Appointment mode → meeting toggle (GLOBAL)
    (function setupAppointmentModeToggle() {
      const modeSelect = document.getElementById("appointment-mode");
      const meetingLaterGroup = document.getElementById("meetingLaterGroup");
      const meetingLinkGroup = document.getElementById("meetingLinkGroup");
      const laterToggle = document.getElementById("meeting-later-toggle");
      const meetingLinkInput = document.getElementById("appointment-meeting-link");

      if (!modeSelect || !meetingLaterGroup || !meetingLinkGroup) return;

      function handleModeChange() {
        if (modeSelect.value === "MEETING") {
          meetingLaterGroup.classList.remove("d-none");
          meetingLinkGroup.classList.remove("d-none");
        } else {
          meetingLaterGroup.classList.add("d-none");
          meetingLinkGroup.classList.add("d-none");
          if (laterToggle) laterToggle.checked = false;
          if (meetingLinkInput) meetingLinkInput.value = "";
        }
      }

      modeSelect.addEventListener("change", handleModeChange);

      // run once for edit / reschedule / programmatic open
      handleModeChange();
    })();
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
  
  // Posts
  initPostsSection();
});

async function initPostsSection() {
  await loadPostsFromApi();
  setupPostForm();

  const addPostBtn = document.getElementById("addPostBtn");
  if (addPostBtn) {
    addPostBtn.addEventListener("click", () => openPostModal(null));
  }

  setupPostsTableActions();
}


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

      // 🔴 NEW: auto-hide sidebar on mobile after navigation
      if (window.innerWidth < 992) {
        const sidebar = document.getElementById("sidebar");
        sidebar?.classList.remove("active");
      }
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

  // Existing click toggle
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("active");
  });

  // NEW: auto-hide when scrolling down on small screens
  let lastScrollY = window.scrollY;

  window.addEventListener("scroll", () => {
    // only on mobile / tablet (same breakpoint as Bootstrap lg)
    if (window.innerWidth >= 992) return;

    const current = window.scrollY;
    const scrollingDown = current > lastScrollY + 10;

    if (scrollingDown && sidebar.classList.contains("active")) {
      sidebar.classList.remove("active");
    }

    lastScrollY = current;
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

function cycleAppointmentStatus(current) {
  const flow = ["Pending", "Confirmed", "Completed", "Cancelled"];
  const idx = flow.indexOf(current || "Pending");
  const nextIndex = (idx === -1 ? 0 : (idx + 1) % flow.length);
  return flow[nextIndex];
}

function buildAppointmentUpdatePayload(appt) {
  return {
    client: appt.client,
    case_type: appt.case_type || appt.type,
    datetime: appt.datetime,
    mode: appt.mode,
    status: appt.status,
  };
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

function renderAppointmentStatus(a) {
  if (a.status !== "Confirmed") return a.status;
  if (a.mode === "MEETING") {
    if (a.meeting_link === "LINK_PENDING") {
      return "Confirmed / Link will be shared";
    }
    return `Confirmed / <a href="${a.meeting_link}" target="_blank">Join Meeting</a>`;
  }
  if (a.mode === "CALL")
    return `Confirmed / ${a.contact_info || "-"}`;
  if (a.mode === "IN_PERSON")
    return `Confirmed / ${a.location || "Office"}`;
  return "Confirmed";
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
          <td>${a.mode === "IN_PERSON" ? "In Person" : a.mode === "CALL" ? "Phone Call" : "Video Meeting"}</td>
          <td>
            <span
              class="badge appt-status-badge bg-${statusColor(a.status)}"
              data-id="${a.id}"
            >
              ${renderAppointmentStatus(a)}
            </span>
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1 btn-appointment-edit" data-id="${a.id}">
              Reschedule
            </button>
            <button class="btn btn-sm btn-outline-danger btn-appointment-delete" data-id="${a.id}">
              Delete
            </button>
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
          <td>
            <span
              class="badge appt-status-badge bg-${statusColor(a.status)}"
              data-id="${a.id}"
            >
              ${a.status}
            </span>
          </td>
        </tr>`;
    })
    .join("");
}

function setupAppointmentTableActions() {
  const tbody = document.getElementById("appointments-table-body");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const statusBadge = e.target.closest(".appt-status-badge");
    if (statusBadge) {
      const id = statusBadge.dataset.id;
      const appt = appointments.find((a) => a.id === id);
      if (!appt) return;

      const newStatus = cycleAppointmentStatus(appt.status);
      const updated = await updateAppointment(id, { status: newStatus });
      if (!updated) return;
      appt.status = updated.status;

      // later: send update to backend with buildAppointmentUpdatePayload(appt)
      // console.log("Appointment status update:", buildAppointmentUpdatePayload(appt));

      renderAppointmentsTable();
      renderAppointmentsPreview();
      updateAppointmentsStatsFromList();
      updateAppointmentsChartFromList();
      return;
    }
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

// function openEditAppointment(id) {

//   const appt = appointments.find((a) => a.id === id);
//   if (!appt) return;

//   editingAppointmentId = id;
//   // restore lead info  
//   document.getElementById("appointment-lead-id").value = appt.lead_id || "";
//   document.getElementById("appointment-lead-name").value = appt.client || "";

//   const form = document.getElementById("appointment-form");
//   if (!form) return;
//   document.getElementById("appointment-lead").value = appt.lead_id || "";
//   document.getElementById("appointment-type").value =
//     appt.case_type || appt.type || "";
//   document.getElementById("appointment-datetime").value = appt.datetime ? appt.datetime.slice(0, 16) : "";
//   document.getElementById("appointment-mode").value = appt.mode || "IN_PERSON";
//   document.getElementById("appointment-status").value =
//     appt.status || "Pending";

//   const title = document.getElementById("appointmentModalLabel");
//   if (title) title.textContent = "Edit / Reschedule Appointment";

//   const submitBtn = form.querySelector('button[type="submit"]');
//   if (submitBtn) submitBtn.textContent = "Update appointment";

//   const modalEl = document.getElementById("appointmentModal");
//   const modal = bootstrap.Modal.getOrCreateInstance(
//     document.getElementById("appointmentModal")
//   );
//   modal.show();
// }
function openEditAppointment(id) {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) return;

  editingAppointmentId = id;

  const leadNameEl = document.getElementById("appointment-lead-name");
  const leadIdEl = document.getElementById("appointment-lead-id");
  const typeEl = document.getElementById("appointment-type");
  const datetimeEl = document.getElementById("appointment-datetime");
  const modeEl = document.getElementById("appointment-mode");
  const statusEl = document.getElementById("appointment-status");

  if (!leadNameEl || !leadIdEl || !typeEl || !datetimeEl || !modeEl || !statusEl) {
    console.error("Appointment modal elements missing in DOM");
    return;
  }

  const modeSelect = document.getElementById("appointment-mode");
  const laterWrapper = document.getElementById("meeting-later-wrapper");

  modeSelect.addEventListener("change", () => {
    laterWrapper.style.display =
      modeSelect.value === "MEETING" ? "block" : "none";
  });

  leadNameEl.value = appt.client || "";
  leadIdEl.value = appt.lead_id || "";
  typeEl.value = appt.case_type || "";
  datetimeEl.value = appt.datetime ? appt.datetime.slice(0, 16) : "";
  modeEl.value = appt.mode || "IN_PERSON";
  statusEl.value = appt.status || "Pending";

  const modalEl = document.getElementById("appointmentModal");
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}


function setupAppointmentForm() {
  const form = document.getElementById("appointment-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = document.getElementById("appointment-type").value.trim();
    const datetimeRaw = document.getElementById("appointment-datetime").value;
    const mode = document.getElementById("appointment-mode").value;
    const status = document.getElementById("appointment-status").value;
    const location = document.getElementById("appointment-location")?.value;

    if (!type || !datetimeRaw) {
      return;
    }

    const leadId = document.getElementById("appointment-lead-id").value;
    if (!leadId) {
      alert("Please schedule appointment from a lead.");
      return;
    }

    const selectedLead = allLeadsForms.find(l => l.id === leadId);
    if (!selectedLead) {
      alert("Lead data not found.");
      return;
    }

    const shareLater = document.getElementById("meeting-later-toggle")?.checked;

    const payload = {
      lead_id: leadId,
      client: document.getElementById("appointment-lead-name").value,
      case_type: type,
      datetime: datetimeRaw,
      mode,
      status,
    };

    if (mode === "IN_PERSON") {
      payload.location = location || "Office";
    }

    if (mode === "CALL") {
      payload.contact_info = selectedLead.phone || selectedLead.email || "";
    }

    if (mode === "MEETING") {
    if (shareLater) {
      payload.meeting_link = "LINK_PENDING";
    } else {
      payload.meeting_link = generateMeetingLink();
    }
  }

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

function generateMeetingLink() {
  return `https://meet.jit.si/JudicialSolutions-${Date.now()}`;
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
      allLeadsForms = forms.filter(f => !f.is_deleted);
      updateLeadStatsFromForms(allLeadsForms);
      updateRecentLeadsTable(allLeadsForms);
      applyLeadsFiltersAndRender();
      updateLeadsChartFromForms(allLeadsForms);
      updateCaseTypeChartFromForms(allLeadsForms);

      refreshBtn.disabled = false;
      refreshBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise me-1"></i>Refresh';
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const leadSelect = document.getElementById("appointment-lead");
    const leadId = leadSelect?.value;

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
  document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-id]");
  if (!target) return;

  if (target.tagName === "A") e.preventDefault();

  const id = target.dataset.id;

  // Complete
  if (target.classList.contains("btn-lead-complete")) {
    updateLead(id, { status: "COMPLETED" }).then(() => {
      const form = allLeadsForms.find(x => x.id === id);
      if (form) form.status = "COMPLETED";
      applyLeadsFiltersAndRender();
    });
  }

  // Delete (soft)
  if (target.classList.contains("btn-lead-delete")) {
    if (!confirm("Delete this lead?")) return;
    updateLead(id, { is_deleted: true }).then(() => {
      allLeadsForms = allLeadsForms.filter(x => x.id !== id);
      applyLeadsFiltersAndRender();
    });
  }

  // Reopen
  if (target.classList.contains("btn-lead-reopen")) {
    if (!confirm("Reopen this lead?")) return;
    updateLead(id, { status: "IN_PROGRESS" }).then(() => {
      const form = allLeadsForms.find(x => x.id === id);
      if (form) form.status = "IN_PROGRESS";
      applyLeadsFiltersAndRender();
    });
  }
});

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-schedule-from-lead");
    if (!btn) return;

    e.preventDefault();

    const leadId = btn.dataset.id;
    const lead = allLeadsForms.find(l => String(l.id) === String(leadId));
    if (!lead) {
      alert("Lead not found");
      return;
    }

    // Fill modal fields
    document.getElementById("appointment-lead-name").value = lead.name;
    document.getElementById("appointment-lead-id").value = lead.id;

    // Optional: auto-fill case type
    const caseInput = document.getElementById("appointment-type");
    if (caseInput && lead.case_type) {
      caseInput.value = lead.case_type;
    }

    // Open modal
    const modal = bootstrap.Modal.getOrCreateInstance(
      document.getElementById("appointmentModal")
    );
    modal.show();
  });
}