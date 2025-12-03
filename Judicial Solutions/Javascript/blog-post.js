const API_BASE = "https://86isfklr9k.execute-api.ap-south-1.amazonaws.com";

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function fetchPostById(id) {
  const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Very simple Markdown -> HTML converter (headings, bullets, paragraphs)
function markdownToHtml(md) {
  if (!md) return "";

  // Escape basic HTML to avoid accidental tags
  md = md.replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;");

  const lines = md.split(/\r?\n/);
  const htmlParts = [];
  let inList = false;

  function closeList() {
    if (inList) {
      htmlParts.push("</ul>");
      inList = false;
    }
  }

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      // blank line = paragraph break
      closeList();
      htmlParts.push("<p></p>");
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      closeList();
      htmlParts.push(`<h3>${line.slice(4)}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      htmlParts.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      htmlParts.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }

    // Bulleted list: - item
    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("+ ")) {
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      const text = line.slice(2);
      htmlParts.push(`<li>${text}</li>`);
      continue;
    }

    // Numbered list: 1. item
    const numberedMatch = line.match(/^\d+\. (.+)$/);
    if (numberedMatch) {
      if (!inList) {
        htmlParts.push("<ol>");
        inList = true;
      }
      htmlParts.push(`<li>${numberedMatch[1]}</li>`);
      continue;
    }

    // Normal paragraph
    closeList();
    htmlParts.push(`<p>${line}</p>`);
  }

  closeList();

  // Merge empty <p></p> appropriately
  return htmlParts
    .filter(Boolean)
    .join("\n")
    .replace(/<p><\/p>/g, "<br>");
}

function renderPost(post) {
  const titleEl = document.getElementById("post-title");
  const metaEl = document.getElementById("post-meta");
  const excerptEl = document.getElementById("post-excerpt");
  const contentEl = document.getElementById("post-content");

  const title = post.title || "(Untitled)";
  const category = post.category || "General";
  const publishedAt = post.published_at
    ? new Date(post.published_at).toLocaleDateString()
    : "";
  const excerpt = post.excerpt || "";
  const content = post.content || "";

  if (titleEl) titleEl.textContent = title;
  if (metaEl) {
    metaEl.textContent = publishedAt
      ? `${category} • ${publishedAt}`
      : category;
  }
  if (excerptEl) excerptEl.textContent = excerpt;

  if (contentEl) {
    contentEl.innerHTML = markdownToHtml(content);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = getQueryParam("id");
  if (!id) {
    const titleEl = document.getElementById("post-title");
    if (titleEl) titleEl.textContent = "Post not found";
    return;
  }

  try {
    const post = await fetchPostById(id);
    renderPost(post);
  } catch (err) {
    console.error("Error loading post:", err);
    const titleEl = document.getElementById("post-title");
    if (titleEl) titleEl.textContent = "Post not found";
  }
});