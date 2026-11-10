(function () {
  "use strict";

  const API_ME = "/api/auth/me";
  const API_LOGOUT = "/api/auth/logout";
  const API_SECTIONS = "/api/sections";
  const API_POSTS = "/api/posts";
  const API_UPLOAD = "/api/upload";

  const MAX_MESSAGE_LENGTH = 1000;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const authGuard = document.getElementById("auth-guard");
  const dashboardShell = document.getElementById("dashboard-shell");
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("menu-toggle");
  const topbarTitle = document.getElementById("topbar-title");
  const navItems = document.querySelectorAll(".nav-item");
  const logoutBtn = document.getElementById("logout-btn");
  const toastContainer = document.getElementById("toast-container");

  const sectionsEditor = document.getElementById("sections-editor");
  const sectionsMessage = document.getElementById("sections-message");

  const addPostForm = document.getElementById("add-post-form");
  const addSectionSelect = document.getElementById("add-section");
  const addMessageInput = document.getElementById("add-message");
  const addMessageCount = document.getElementById("add-message-count");
  const addSubmitBtn = document.getElementById("add-submit-btn");
  const addResetBtn = document.getElementById("add-reset-btn");
  const addMessage = document.getElementById("add-message");
  const addFileDrop = document.getElementById("add-file-drop");
  const addImageFile = document.getElementById("add-image-file");
  const addFilePreviewWrap = document.getElementById("add-file-preview-wrap");
  const addFilePreview = document.getElementById("add-file-preview");
  const addFileClear = document.getElementById("add-file-clear");
  const addImageUrlInput = document.getElementById("add-image-url");
  const addUrlPreviewWrap = document.getElementById("add-url-preview-wrap");
  const addUrlPreview = document.getElementById("add-url-preview");
  const addSourceTabs = document.querySelectorAll(".image-source-tabs .tab-btn[data-source]");
  const addSourceFilePanel = document.getElementById("add-source-file");
  const addSourceUrlPanel = document.getElementById("add-source-url");

  const filterSectionSelect = document.getElementById("filter-section");
  const filterSearchInput = document.getElementById("filter-search");
  const refreshPostsBtn = document.getElementById("refresh-posts-btn");
  const postsTbody = document.getElementById("posts-tbody");
  const postsMessage = document.getElementById("posts-message");

  const editModal = document.getElementById("edit-modal");
  const editModalClose = document.getElementById("edit-modal-close");
  const editForm = document.getElementById("edit-form");
  const editPostId = document.getElementById("edit-post-id");
  const editSection = document.getElementById("edit-section");
  const editMessageInput = document.getElementById("edit-message");
  const editMessageCount = document.getElementById("edit-message-count");
  const editSubmitBtn = document.getElementById("edit-submit-btn");
  const editCancelBtn = document.getElementById("edit-cancel-btn");
  const editMessageAlert = document.getElementById("edit-message-alert");
  const editCurrentImageWrap = document.getElementById("edit-current-image-wrap");
  const editCurrentImage = document.getElementById("edit-current-image");
  const editNoImageText = document.getElementById("edit-no-image-text");
  const editRemoveCurrentImageBtn = document.getElementById("edit-remove-current-image");
  const editImageFile = document.getElementById("edit-image-file");
  const editFileDrop = document.getElementById("edit-file-drop");
  const editFilePreviewWrap = document.getElementById("edit-file-preview-wrap");
  const editFilePreview = document.getElementById("edit-file-preview");
  const editFileClear = document.getElementById("edit-file-clear");
  const editImageUrlInput = document.getElementById("edit-image-url");
  const editUrlPreviewWrap = document.getElementById("edit-url-preview-wrap");
  const editUrlPreview = document.getElementById("edit-url-preview");
  const editSourceTabs = document.querySelectorAll(".image-source-tabs .tab-btn[data-edit-source]");
  const editSourceFilePanel = document.getElementById("edit-source-file");
  const editSourceUrlPanel = document.getElementById("edit-source-url");

  const deleteModal = document.getElementById("delete-modal");
  const deleteModalClose = document.getElementById("delete-modal-close");
  const deletePostIdInput = document.getElementById("delete-post-id");
  const deleteConfirmBtn = document.getElementById("delete-confirm-btn");
  const deleteCancelBtn = document.getElementById("delete-cancel-btn");
  const deleteMessage = document.getElementById("delete-message");

  const state = {
    sections: [],
    posts: [],
    editingPost: null,
    addImageMode: "file",
    editImageMode: "file",
    editUploadedFile: null,
    editNewImageUrl: "",
    editRemoveCurrent: false,
    addUploadedFile: null,
    isAdding: false,
    isEditing: false,
    isDeleting: false
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(text, type) {
    const toast = document.createElement("div");
    toast.className = "toast " + (type === "error" ? "is-error" : "is-success");
    toast.textContent = text;
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3500);
  }

  function showInlineMessage(el, text, type) {
    el.textContent = text;
    el.classList.remove("is-error", "is-success");
    el.classList.add(type === "success" ? "is-success" : "is-error");
    el.hidden = false;
  }

  function hideInlineMessage(el) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-error", "is-success");
  }

  function formatDate(value) {
    if (!value) return "";
    let date;
    if (typeof value === "object" && typeof value.toDate === "function") {
      date = value.toDate();
    } else if (typeof value === "object" && typeof value._seconds === "number") {
      date = new Date(value._seconds * 1000);
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

  function extractTime(value) {
    if (!value) return 0;
    if (typeof value === "object" && typeof value._seconds === "number") return value._seconds * 1000;
    const date = new Date(value);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function isValidHttpUrl(url) {
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

  async function apiRequest(url, options) {
    const config = Object.assign({ credentials: "include" }, options || {});
    if (!config.headers) config.headers = {};
    if (!config.headers.Accept) config.headers.Accept = "application/json";

    const response = await fetch(url, config);

    if (response.status === 401) {
      window.location.replace("/login.html");
      throw new Error("UNAUTHORIZED");
    }

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      const message = data && typeof data.message === "string" ? data.message : "حدث خطأ، يرجى المحاولة مرة أخرى.";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function checkAuth() {
    try {
      const response = await fetch(API_ME, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "include"
      });
      if (!response.ok) {
        window.location.replace("/login");
        return;
      }
      const data = await response.json();
      if (!data || data.success !== true) {
        window.location.replace("/login");
        return;
      }
      authGuard.hidden = true;
      dashboardShell.hidden = false;
      initDashboard();
    } catch (err) {
      window.location.replace("/login");
    }
  }

  function setActiveView(viewId, title) {
    document.querySelectorAll(".view").forEach(function (view) {
      view.hidden = view.id !== viewId;
    });
    navItems.forEach(function (item) {
      item.classList.toggle("is-active", item.getAttribute("data-view") === viewId);
    });
    topbarTitle.textContent = title;
    if (window.innerWidth <= 900) {
      sidebar.classList.remove("is-open");
    }
  }

  function bindNav() {
    navItems.forEach(function (item) {
      item.addEventListener("click", function () {
        const viewId = item.getAttribute("data-view");
        const titles = {
          "sections-view": "إدارة الأقسام",
          "add-post-view": "إضافة منشور",
          "posts-view": "إدارة المنشورات"
        };
        setActiveView(viewId, titles[viewId] || "لوحة التحكم");
        if (viewId === "posts-view") {
          loadPosts();
        }
      });
    });

    if (menuToggle) {
      menuToggle.addEventListener("click", function () {
        sidebar.classList.toggle("is-open");
      });
    }
  }

  function bindLogout() {
    logoutBtn.addEventListener("click", async function () {
      logoutBtn.disabled = true;
      try {
        await fetch(API_LOGOUT, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" }
        });
      } catch (err) {
        /* تجاهل */
      }
      window.location.replace("/login");
    });
  }

  async function loadSections() {
    sectionsEditor.innerHTML = '<div class="loading-inline"><span class="spinner-sm"></span><span>جاري تحميل الأقسام...</span></div>';
    try {
      const data = await apiRequest(API_SECTIONS, { method: "GET" });
      const sections = Array.isArray(data.data) ? data.data : [];
      state.sections = sections
        .filter(function (item) {
          return item && typeof item.id === "string" && typeof item.name === "string";
        })
        .sort(function (a, b) {
          const ao = typeof a.order === "number" ? a.order : 0;
          const bo = typeof b.order === "number" ? b.order : 0;
          return ao - bo;
        });
      renderSectionsEditor();
      populateSectionSelects();
    } catch (err) {
      sectionsEditor.innerHTML = '<div class="table-empty">تعذر تحميل الأقسام، يرجى المحاولة مرة أخرى.</div>';
      showToast(err.message || "تعذر تحميل الأقسام", "error");
    }
  }

  function renderSectionsEditor() {
    if (state.sections.length === 0) {
      sectionsEditor.innerHTML = '<div class="table-empty">لا توجد أقسام متاحة.</div>';
      return;
    }
    sectionsEditor.innerHTML = "";
    state.sections.forEach(function (section) {
      const card = document.createElement("div");
      card.className = "section-card";

      const label = document.createElement("span");
      label.className = "section-card-label";
      label.textContent = "معرّف القسم: " + section.id;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-input";
      input.value = section.name;
      input.maxLength = 40;
      input.minLength = 2;
      input.setAttribute("data-section-id", section.id);

      const actions = document.createElement("div");
      actions.className = "section-card-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "section-save-btn";
      saveBtn.textContent = "حفظ التغييرات";

      saveBtn.addEventListener("click", function () {
        saveSectionName(section.id, input.value, saveBtn, input);
      });

      actions.appendChild(saveBtn);
      card.appendChild(label);
      card.appendChild(input);
      card.appendChild(actions);
      sectionsEditor.appendChild(card);
    });
  }

  async function saveSectionName(sectionId, newName, saveBtn, input) {
    hideInlineMessage(sectionsMessage);
    const trimmed = String(newName || "").trim();

    if (trimmed.length < 2 || trimmed.length > 40) {
      showInlineMessage(sectionsMessage, "اسم القسم يجب أن يكون بين 2 و40 حرفاً.", "error");
      input.focus();
      return;
    }

    const duplicate = state.sections.some(function (s) {
      return s.id !== sectionId && s.name.trim() === trimmed;
    });
    if (duplicate) {
      showInlineMessage(sectionsMessage, "هذا الاسم مستخدم بالفعل في قسم آخر.", "error");
      input.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "جاري الحفظ...";

    try {
      await apiRequest(API_SECTIONS + "/" + encodeURIComponent(sectionId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      const target = state.sections.find(function (s) { return s.id === sectionId; });
      if (target) target.name = trimmed;
      populateSectionSelects();
      showInlineMessage(sectionsMessage, "تم تحديث اسم القسم بنجاح.", "success");
      showToast("تم تحديث اسم القسم", "success");
    } catch (err) {
      showInlineMessage(sectionsMessage, err.message || "تعذر تحديث القسم.", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "حفظ التغييرات";
    }
  }

  function populateSectionSelects() {
    const options = state.sections.map(function (s) {
      return { value: s.id, label: s.name };
    });

    addSectionSelect.innerHTML = '<option value="">-- اختر القسم --</option>';
    options.forEach(function (opt) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      addSectionSelect.appendChild(el);
    });

    filterSectionSelect.innerHTML = '<option value="">كل الأقسام</option>';
    options.forEach(function (opt) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      filterSectionSelect.appendChild(el);
    });

    editSection.innerHTML = "";
    options.forEach(function (opt) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      editSection.appendChild(el);
    });
  }

  function validateImageFile(file) {
    if (!file) return { ok: false, message: "لم يتم اختيار ملف." };
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { ok: false, message: "نوع الصورة غير مدعوم. المسموح: JPEG أو PNG أو WEBP." };
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { ok: false, message: "حجم الصورة يجب أن يكون 5 ميجا أو أقل." };
    }
    return { ok: true };
  }

  function previewFile(file, previewWrap, previewImg) {
    const reader = new FileReader();
    reader.onload = function (e) {
      previewImg.src = e.target.result;
      previewWrap.hidden = false;
    };
    reader.readAsDataURL(file);
  }

  function bindAddImageTabs() {
    addSourceTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        addSourceTabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        const source = tab.getAttribute("data-source");
        state.addImageMode = source;
        addSourceFilePanel.hidden = source !== "file";
        addSourceUrlPanel.hidden = source !== "url";
      });
    });
  }

  function bindAddImageFile() {
    addFileDrop.addEventListener("click", function () {
      addImageFile.click();
    });

    addImageFile.addEventListener("change", function () {
      const file = addImageFile.files && addImageFile.files[0];
      if (!file) return;
      const result = validateImageFile(file);
      if (!result.ok) {
        showInlineMessage(addMessage, result.message, "error");
        addImageFile.value = "";
        return;
      }
      hideInlineMessage(addMessage);
      state.addUploadedFile = file;
      previewFile(file, addFilePreviewWrap, addFilePreview);
    });

    addFileClear.addEventListener("click", function () {
      state.addUploadedFile = null;
      addImageFile.value = "";
      addFilePreviewWrap.hidden = true;
      addFilePreview.src = "";
    });

    addFileDrop.addEventListener("dragover", function (e) {
      e.preventDefault();
      addFileDrop.classList.add("is-dragover");
    });

    addFileDrop.addEventListener("dragleave", function () {
      addFileDrop.classList.remove("is-dragover");
    });

    addFileDrop.addEventListener("drop", function (e) {
      e.preventDefault();
      addFileDrop.classList.remove("is-dragover");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const result = validateImageFile(file);
      if (!result.ok) {
        showInlineMessage(addMessage, result.message, "error");
        return;
      }
      hideInlineMessage(addMessage);
      state.addUploadedFile = file;
      previewFile(file, addFilePreviewWrap, addFilePreview);
    });
  }

  function bindAddImageUrl() {
    addImageUrlInput.addEventListener("input", function () {
      const value = addImageUrlInput.value.trim();
      if (isValidHttpUrl(value)) {
        addUrlPreview.src = value;
        addUrlPreviewWrap.hidden = false;
      } else {
        addUrlPreviewWrap.hidden = true;
        addUrlPreview.src = "";
      }
    });
  }

  function bindAddMessageCounter() {
    addMessageInput.addEventListener("input", function () {
      const len = addMessageInput.value.length;
      addMessageCount.textContent = String(len);
      if (len > MAX_MESSAGE_LENGTH) {
        addMessageInput.value = addMessageInput.value.slice(0, MAX_MESSAGE_LENGTH);
        addMessageCount.textContent = String(MAX_MESSAGE_LENGTH);
      }
    });
  }

  function resetAddForm() {
    addPostForm.reset();
    state.addUploadedFile = null;
    addFilePreviewWrap.hidden = true;
    addFilePreview.src = "";
    addUrlPreviewWrap.hidden = true;
    addUrlPreview.src = "";
    addMessageCount.textContent = "0";
    hideInlineMessage(addMessage);
    addSourceTabs.forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-source") === "file");
    });
    state.addImageMode = "file";
    addSourceFilePanel.hidden = false;
    addSourceUrlPanel.hidden = true;
  }

  async function uploadImageFile(file) {
    const formData = new FormData();
    formData.append("image", file);
    const data = await apiRequest(API_UPLOAD, {
      method: "POST",
      body: formData
    });
    if (!data || data.success !== true || !data.data || !data.data.url) {
      throw new Error("فشل رفع الصورة، يرجى المحاولة مرة أخرى.");
    }
    return data.data.url;
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    if (state.isAdding) return;
    hideInlineMessage(addMessage);

    const sectionId = addSectionSelect.value;
    const messageText = addMessageInput.value.trim();

    if (!sectionId) {
      showInlineMessage(addMessage, "يرجى اختيار القسم.", "error");
      return;
    }
    if (!messageText) {
      showInlineMessage(addMessage, "يرجى كتابة رسالة المنشور.", "error");
      return;
    }
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      showInlineMessage(addMessage, "الرسالة يجب ألا تتجاوز 1000 حرف.", "error");
      return;
    }

    let imageUrl = "";
    if (state.addImageMode === "url") {
      const urlValue = addImageUrlInput.value.trim();
      if (urlValue) {
        if (!isValidHttpUrl(urlValue)) {
          showInlineMessage(addMessage, "رابط الصورة غير صالح.", "error");
          return;
        }
        imageUrl = urlValue;
      }
    }

    state.isAdding = true;
    addSubmitBtn.disabled = true;
    addSubmitBtn.classList.add("is-loading");

    try {
      if (state.addImageMode === "file" && state.addUploadedFile) {
        imageUrl = await uploadImageFile(state.addUploadedFile);
      }

      await apiRequest(API_POSTS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: sectionId,
          message: messageText,
          imageUrl: imageUrl || null
        })
      });

      showInlineMessage(addMessage, "تم إضافة المنشور بنجاح.", "success");
      showToast("تم إضافة المنشور بنجاح", "success");
      resetAddForm();
      state.posts = [];
    } catch (err) {
      showInlineMessage(addMessage, err.message || "تعذر إضافة المنشور.", "error");
    } finally {
      state.isAdding = false;
      addSubmitBtn.disabled = false;
      addSubmitBtn.classList.remove("is-loading");
    }
  }

  function getSectionName(sectionId) {
    const found = state.sections.find(function (s) { return s.id === sectionId; });
    return found ? found.name : "غير معروف";
  }

  async function loadPosts() {
    postsTbody.innerHTML = '<tr><td colspan="5"><div class="loading-inline"><span class="spinner-sm"></span><span>جاري تحميل المنشورات...</span></div></td></tr>';
    hideInlineMessage(postsMessage);
    try {
      const data = await apiRequest(API_POSTS, { method: "GET" });
      const posts = Array.isArray(data.data) ? data.data : [];
      state.posts = posts
        .filter(function (p) {
          return p && typeof p.id === "string" && typeof p.sectionId === "string";
        })
        .sort(function (a, b) {
          return extractTime(b.createdAt) - extractTime(a.createdAt);
        });
      renderPosts();
    } catch (err) {
      postsTbody.innerHTML = '<tr><td colspan="5"><div class="table-empty">تعذر تحميل المنشورات، يرجى المحاولة مرة أخرى.</div></td></tr>';
      showToast(err.message || "تعذر تحميل المنشورات", "error");
    }
  }

  function getFilteredPosts() {
    const sectionFilter = filterSectionSelect.value;
    const search = filterSearchInput.value.trim().toLowerCase();
    return state.posts.filter(function (post) {
      if (sectionFilter && post.sectionId !== sectionFilter) return false;
      if (search) {
        const msg = (post.message || "").toLowerCase();
        if (msg.indexOf(search) === -1) return false;
      }
      return true;
    });
  }

  function renderPosts() {
    const filtered = getFilteredPosts();
    if (filtered.length === 0) {
      postsTbody.innerHTML = '<tr><td colspan="5"><div class="table-empty">لا توجد منشورات مطابقة.</div></td></tr>';
      return;
    }
    postsTbody.innerHTML = "";
    filtered.forEach(function (post) {
      const tr = document.createElement("tr");

      const tdImg = document.createElement("td");
      if (post.imageUrl && isValidHttpUrl(post.imageUrl)) {
        const img = document.createElement("img");
        img.src = post.imageUrl;
        img.alt = "صورة المنشور";
        img.className = "table-thumb";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        tdImg.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "table-thumb-placeholder";
        ph.textContent = "بدون صورة";
        tdImg.appendChild(ph);
      }

      const tdSection = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "table-section-badge";
      badge.textContent = getSectionName(post.sectionId);
      tdSection.appendChild(badge);

      const tdMsg = document.createElement("td");
      const msgDiv = document.createElement("div");
      msgDiv.className = "table-message";
      msgDiv.textContent = post.message || "";
      tdMsg.appendChild(msgDiv);

      const tdDate = document.createElement("td");
      const dateSpan = document.createElement("span");
      dateSpan.className = "table-date";
      dateSpan.textContent = formatDate(post.createdAt);
      tdDate.appendChild(dateSpan);

      const tdActions = document.createElement("td");
      const actionsWrap = document.createElement("div");
      actionsWrap.className = "table-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "action-btn action-edit";
      editBtn.textContent = "تعديل";
      editBtn.addEventListener("click", function () {
        openEditModal(post);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "action-btn action-delete";
      deleteBtn.textContent = "حذف";
      deleteBtn.addEventListener("click", function () {
        openDeleteModal(post);
      });

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(deleteBtn);
      tdActions.appendChild(actionsWrap);

      tr.appendChild(tdImg);
      tr.appendChild(tdSection);
      tr.appendChild(tdMsg);
      tr.appendChild(tdDate);
      tr.appendChild(tdActions);
      postsTbody.appendChild(tr);
    });
  }

  function bindFilters() {
    filterSectionSelect.addEventListener("change", renderPosts);
    filterSearchInput.addEventListener("input", renderPosts);
    refreshPostsBtn.addEventListener("click", loadPosts);
  }

  function bindEditImageTabs() {
    editSourceTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        editSourceTabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        const source = tab.getAttribute("data-edit-source");
        state.editImageMode = source;
        editSourceFilePanel.hidden = source !== "file";
        editSourceUrlPanel.hidden = source !== "url";
      });
    });
  }

  function bindEditImageFile() {
    editFileDrop.addEventListener("click", function () {
      editImageFile.click();
    });

    editImageFile.addEventListener("change", function () {
      const file = editImageFile.files && editImageFile.files[0];
      if (!file) return;
      const result = validateImageFile(file);
      if (!result.ok) {
        showInlineMessage(editMessageAlert, result.message, "error");
        editImageFile.value = "";
        return;
      }
      hideInlineMessage(editMessageAlert);
      state.editUploadedFile = file;
      previewFile(file, editFilePreviewWrap, editFilePreview);
    });

    editFileClear.addEventListener("click", function () {
      state.editUploadedFile = null;
      editImageFile.value = "";
      editFilePreviewWrap.hidden = true;
      editFilePreview.src = "";
    });

    editFileDrop.addEventListener("dragover", function (e) {
      e.preventDefault();
      editFileDrop.classList.add("is-dragover");
    });

    editFileDrop.addEventListener("dragleave", function () {
      editFileDrop.classList.remove("is-dragover");
    });

    editFileDrop.addEventListener("drop", function (e) {
      e.preventDefault();
      editFileDrop.classList.remove("is-dragover");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const result = validateImageFile(file);
      if (!result.ok) {
        showInlineMessage(editMessageAlert, result.message, "error");
        return;
      }
      hideInlineMessage(editMessageAlert);
      state.editUploadedFile = file;
      previewFile(file, editFilePreviewWrap, editFilePreview);
    });
  }

  function bindEditImageUrl() {
    editImageUrlInput.addEventListener("input", function () {
      const value = editImageUrlInput.value.trim();
      if (isValidHttpUrl(value)) {
        editUrlPreview.src = value;
        editUrlPreviewWrap.hidden = false;
      } else {
        editUrlPreviewWrap.hidden = true;
        editUrlPreview.src = "";
      }
    });
  }

  function bindEditMessageCounter() {
    editMessageInput.addEventListener("input", function () {
      const len = editMessageInput.value.length;
      editMessageCount.textContent = String(len);
      if (len > MAX_MESSAGE_LENGTH) {
        editMessageInput.value = editMessageInput.value.slice(0, MAX_MESSAGE_LENGTH);
        editMessageCount.textContent = String(MAX_MESSAGE_LENGTH);
      }
    });
  }

  function openEditModal(post) {
    state.editingPost = post;
    state.editUploadedFile = null;
    state.editNewImageUrl = "";
    state.editRemoveCurrent = false;
    state.editImageMode = "file";

    editPostId.value = post.id;
    editSection.value = post.sectionId;
    editMessageInput.value = post.message || "";
    editMessageCount.textContent = String((post.message || "").length);

    if (post.imageUrl && isValidHttpUrl(post.imageUrl)) {
      editCurrentImage.src = post.imageUrl;
      editCurrentImageWrap.hidden = false;
      editNoImageText.hidden = true;
    } else {
      editCurrentImage.src = "";
      editCurrentImageWrap.hidden = true;
      editNoImageText.hidden = false;
    }

    editImageFile.value = "";
    editFilePreviewWrap.hidden = true;
    editFilePreview.src = "";
    editImageUrlInput.value = "";
    editUrlPreviewWrap.hidden = true;
    editUrlPreview.src = "";

    editSourceTabs.forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-edit-source") === "file");
    });
    editSourceFilePanel.hidden = false;
    editSourceUrlPanel.hidden = true;

    hideInlineMessage(editMessageAlert);
    editModal.hidden = false;
  }

  function closeEditModal() {
    editModal.hidden = true;
    state.editingPost = null;
    state.editUploadedFile = null;
    state.editRemoveCurrent = false;
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (state.isEditing) return;
    hideInlineMessage(editMessageAlert);

    const postId = editPostId.value;
    const sectionId = editSection.value;
    const messageText = editMessageInput.value.trim();

    if (!postId) {
      showInlineMessage(editMessageAlert, "حدث خطأ، يرجى إعادة فتح النافذة.", "error");
      return;
    }
    if (!sectionId) {
      showInlineMessage(editMessageAlert, "يرجى اختيار القسم.", "error");
      return;
    }
    if (!messageText) {
      showInlineMessage(editMessageAlert, "يرجى كتابة رسالة المنشور.", "error");
      return;
    }
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      showInlineMessage(editMessageAlert, "الرسالة يجب ألا تتجاوز 1000 حرف.", "error");
      return;
    }

    state.isEditing = true;
    editSubmitBtn.disabled = true;
    editSubmitBtn.classList.add("is-loading");

    try {
      let finalImageUrl = state.editingPost ? state.editingPost.imageUrl || "" : "";

      if (state.editRemoveCurrent) {
        finalImageUrl = "";
      }

      if (state.editImageMode === "url") {
        const urlValue = editImageUrlInput.value.trim();
        if (urlValue) {
          if (!isValidHttpUrl(urlValue)) {
            showInlineMessage(editMessageAlert, "رابط الصورة غير صالح.", "error");
            state.isEditing = false;
            editSubmitBtn.disabled = false;
            editSubmitBtn.classList.remove("is-loading");
            return;
          }
          finalImageUrl = urlValue;
        }
      }

      if (state.editImageMode === "file" && state.editUploadedFile) {
        finalImageUrl = await uploadImageFile(state.editUploadedFile);
      }

      await apiRequest(API_POSTS + "/" + encodeURIComponent(postId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: sectionId,
          message: messageText,
          imageUrl: finalImageUrl || null
        })
      });

      showToast("تم تحديث المنشور بنجاح", "success");
      closeEditModal();
      loadPosts();
    } catch (err) {
      showInlineMessage(editMessageAlert, err.message || "تعذر تحديث المنشور.", "error");
    } finally {
      state.isEditing = false;
      editSubmitBtn.disabled = false;
      editSubmitBtn.classList.remove("is-loading");
    }
  }

  function openDeleteModal(post) {
    deletePostIdInput.value = post.id;
    hideInlineMessage(deleteMessage);
    deleteModal.hidden = false;
  }

  function closeDeleteModal() {
    deleteModal.hidden = true;
    deletePostIdInput.value = "";
  }

  async function handleDeleteConfirm() {
    if (state.isDeleting) return;
    const postId = deletePostIdInput.value;
    if (!postId) return;

    hideInlineMessage(deleteMessage);
    state.isDeleting = true;
    deleteConfirmBtn.disabled = true;
    deleteConfirmBtn.classList.add("is-loading");

    try {
      await apiRequest(API_POSTS + "/" + encodeURIComponent(postId), {
        method: "DELETE"
      });
      showToast("تم حذف المنشور بنجاح", "success");
      closeDeleteModal();
      loadPosts();
    } catch (err) {
      showInlineMessage(deleteMessage, err.message || "تعذر حذف المنشور.", "error");
    } finally {
      state.isDeleting = false;
      deleteConfirmBtn.disabled = false;
      deleteConfirmBtn.classList.remove("is-loading");
    }
  }

  function bindModals() {
    editModalClose.addEventListener("click", closeEditModal);
    editCancelBtn.addEventListener("click", closeEditModal);
    editModal.addEventListener("click", function (e) {
      if (e.target === editModal) closeEditModal();
    });

    deleteModalClose.addEventListener("click", closeDeleteModal);
    deleteCancelBtn.addEventListener("click", closeDeleteModal);
    deleteModal.addEventListener("click", function (e) {
      if (e.target === deleteModal) closeDeleteModal();
    });

    editRemoveCurrentImageBtn.addEventListener("click", function () {
      state.editRemoveCurrent = true;
      editCurrentImageWrap.hidden = true;
      editNoImageText.hidden = false;
      editNoImageText.textContent = "سيتم حذف الصورة الحالية عند الحفظ.";
    });

    editForm.addEventListener("submit", handleEditSubmit);
    deleteConfirmBtn.addEventListener("click", handleDeleteConfirm);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!editModal.hidden) closeEditModal();
        if (!deleteModal.hidden) closeDeleteModal();
      }
    });
  }

  function initDashboard() {
    bindNav();
    bindLogout();
    bindAddImageTabs();
    bindAddImageFile();
    bindAddImageUrl();
    bindAddMessageCounter();
    bindEditImageTabs();
    bindEditImageFile();
    bindEditImageUrl();
    bindEditMessageCounter();
    bindFilters();
    bindModals();
    addPostForm.addEventListener("submit", handleAddSubmit);
    addResetBtn.addEventListener("click", function (e) {
      e.preventDefault();
      resetAddForm();
    });
    loadSections();
  }

  checkAuth();
})();
