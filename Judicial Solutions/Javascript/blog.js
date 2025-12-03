const API_BASE = "https://86isfklr9k.execute-api.ap-south-1.amazonaws.com";

async function fetchPublishedPosts() {
  try {
    const res = await fetch(`${API_BASE}/posts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];

    // Only show published posts
    return items.filter((p) => (p.status || "").toLowerCase() === "published");
  } catch (err) {
    console.error("Error loading posts:", err);
    return [];
  }
}

function renderBlogList(posts) {
  const container = document.getElementById("blog-list");
  if (!container) return;

  if (!posts.length) {
    container.innerHTML = `<p>No articles published yet. Please check back soon.</p>`;
    return;
  }

  container.innerHTML = posts
    .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""))
    .map((p) => {
      const title = p.title || "(Untitled)";
      const excerpt =
        p.excerpt || (p.content || "").slice(0, 160).trim() + "...";
      const category = p.category || "General";
      const publishedAt = p.published_at
        ? new Date(p.published_at).toLocaleDateString()
        : "";

      return `
        <article class="blog-card" style="border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); background:#fff;">
          <div style="font-size: 0.75rem; text-transform: uppercase; color:#555;">
            ${category}${publishedAt ? " • " + publishedAt : ""}
          </div>

          <h2 style="margin: 6px 0 8px; font-size: 1.25rem;">
            <a href="blog-post.html?id=${encodeURIComponent(
              p.id
            )}" style="text-decoration:none; color:#1d3557;">
              ${title}
            </a>
          </h2>

          <p style="margin: 0 0 10px; color:#444;">${excerpt}</p>

          <a href="blog-post.html?id=${encodeURIComponent(
            p.id
          )}" style="font-size:0.9rem;">
            Read more →
          </a>
        </article>
      `;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const posts = await fetchPublishedPosts();
  renderBlogList(posts);
});
