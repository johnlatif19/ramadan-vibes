(function () {
  "use strict";

  const sectionsContainer = document.getElementById("sections-container");
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const retryBtn = document.getElementById("retry-btn");
  const backToTopBtn = document.getElementById("back-to-top");
  const footerYear = document.getElementById("footer-year");

  const API_SECTIONS = "/api/sections";
  const API_POSTS = "/api/posts";

  if (footerYear) {
    footerYear.textContent = String(new Date().getFullYear());
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isValidImageUrl(url) {
    if (typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (err) {
      return false;
    }
  }

  function formatDate(value) {
    if (!value) return "";
    let date;
    if (typeof value === "object" && typeof value.toDate === "function") {
      date = value.toDate();
    } else if (typeof value === "object" && typeof value._seconds === "number") {
      date = new Date(value._seconds * 1000);
    } else if (typeof value === "number") {
      date = new Date(value);
    } else {
      date = new Date(value);
    }
    if (isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    } catch (err) {
      return date.toLocaleString("ar-EG");
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const payload = await response.json();
    if (!payload || payload.success !== true) {
      throw new Error("Invalid response");
    }
    return payload.data;
  }

  function buildPostCard(post) {
    const article = document.createElement("article");
    article.className = "post-card";

    const message = post && post.message ? String(post.message) : "";
    const imageUrl = post && post.imageUrl ? String(post.imageUrl) : "";
    const createdAt = post ? post.createdAt : null;

    if (isValidImageUrl(imageUrl)) {
      const imageWrap = document.createElement("div");
      imageWrap.className = "post-image-wrap";

      const image = document.createElement("img");
      image.className = "post-image";
      image.src = imageUrl;
      image.alt = "صورة المنشور";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.onerror = function () {
        imageWrap.remove();
      };

      imageWrap.appendChild(image);
      article.appendChild(imageWrap);
    }

    const body = document.createElement("div");
    body.className = "post-body";

    const messageEl = document.createElement("p");
    messageEl.className = "post-message";
    messageEl.textContent = message;
    body.appendChild(messageEl);

    const dateText = formatDate(createdAt);
    if (dateText) {
      const dateEl = document.createElement("span");
      dateEl.className = "post-date";
      dateEl.textContent = dateText;
      body.appendChild(dateEl);
    }

    article.appendChild(body);
    return article;
  }

  function buildEmptySection(sectionName) {
    const empty = document.createElement("div");
    empty.className = "empty-section";
    const strong = document.createElement("strong");
    strong.textContent = "لا توجد منشورات بعد";
    const span = document.createElement("span");
    span.textContent = "سيتم إضافة منشورات جديدة في قسم " + sectionName + " قريباً.";
    empty.appendChild(strong);
    empty.appendChild(span);
    return empty;
  }

  function buildSectionBlock(section, posts) {
    const block = document.createElement("section");
    block.className = "section-block";
    block.setAttribute("data-section-id", section.id);

    const header = document.createElement("div");
    header.className = "section-block-header";

    const marker = document.createElement("span");
    marker.className = "section-marker";
    marker.setAttribute("aria-hidden", "true");

    const name = document.createElement("h3");
    name.className = "section-name";
    name.textContent = section.name;

    const count = document.createElement("span");
    count.className = "section-count";
    count.textContent = posts.length + " منشور";

    header.appendChild(marker);
    header.appendChild(name);
    header.appendChild(count);
    block.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "posts-grid";

    if (posts.length === 0) {
      grid.appendChild(buildEmptySection(section.name));
    } else {
      posts.forEach(function (post) {
        grid.appendChild(buildPostCard(post));
      });
    }

    block.appendChild(grid);
    return block;
  }

  function normalizeSections(rawSections) {
    if (!Array.isArray(rawSections)) return [];
    return rawSections
      .filter(function (item) {
        return item && typeof item.id === "string" && typeof item.name === "string";
      })
      .map(function (item) {
        return { id: item.id, name: item.name, order: typeof item.order === "number" ? item.order : 0 };
      })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function normalizePosts(rawPosts) {
    if (!Array.isArray(rawPosts)) return [];
    return rawPosts.filter(function (item) {
      return item && typeof item.id === "string" && typeof item.sectionId === "string";
    });
  }

  function groupPostsBySection(posts) {
    const map = {};
    posts.forEach(function (post) {
      if (!map[post.sectionId]) map[post.sectionId] = [];
      map[post.sectionId].push(post);
    });
    Object.keys(map).forEach(function (key) {
      map[key].sort(function (a, b) {
        return extractTime(b.createdAt) - extractTime(a.createdAt);
      });
    });
    return map;
  }

  function extractTime(value) {
    if (!value) return 0;
    if (typeof value === "object" && typeof value._seconds === "number") return value._seconds * 1000;
    const date = new Date(value);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function showLoading() {
    if (loadingState) loadingState.hidden = false;
    if (errorState) errorState.hidden = true;
  }

  function hideLoading() {
    if (loadingState) loadingState.hidden = true;
  }

  function showError() {
    if (errorState) errorState.hidden = false;
  }

  function clearSections() {
    sectionsContainer.innerHTML = "";
  }

  async function loadContent() {
    showLoading();
    clearSections();

    try {
      const results = await Promise.all([fetchJson(API_SECTIONS), fetchJson(API_POSTS)]);
      const sections = normalizeSections(results[0]);
      const posts = normalizePosts(results[1]);
      const grouped = groupPostsBySection(posts);

      hideLoading();

      if (sections.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-section";
        const strong = document.createElement("strong");
        strong.textContent = "لا توجد أقسام متاحة";
        const span = document.createElement("span");
        span.textContent = "سيتم عرض الأقسام هنا بمجرد إضافتها.";
        empty.appendChild(strong);
        empty.appendChild(span);
        sectionsContainer.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      sections.forEach(function (section) {
        const sectionPosts = grouped[section.id] || [];
        fragment.appendChild(buildSectionBlock(section, sectionPosts));
      });
      sectionsContainer.appendChild(fragment);
    } catch (err) {
      hideLoading();
      showError();
    }
  }

  function initBackToTop() {
    if (!backToTopBtn) return;
    window.addEventListener("scroll", function () {
      if (window.scrollY > 400) {
        backToTopBtn.hidden = false;
      } else {
        backToTopBtn.hidden = true;
      }
    });
    backToTopBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener("click", loadContent);
  }

  initBackToTop();
  loadContent();
})();