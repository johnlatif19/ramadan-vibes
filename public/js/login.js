(function () {
  "use strict";

  const loginForm = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const togglePasswordBtn = document.getElementById("toggle-password");
  const submitBtn = document.getElementById("submit-btn");
  const formMessage = document.getElementById("form-message");

  const API_LOGIN = "/api/auth/login";
  const API_ME = "/api/auth/me";
  const DASHBOARD_URL = "/dashboard.html";

  const ERROR_MESSAGES = {
    REQUIRED: "يرجى ملء جميع الحقول المطلوبة.",
    USERNAME_INVALID: "اسم المستخدم يجب أن يكون بين 3 و64 حرفاً.",
    PASSWORD_INVALID: "كلمة المرور يجب أن تكون بين 6 و128 حرفاً.",
    INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة.",
    RATE_LIMITED: "محاولات كثيرة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.",
    NETWORK: "تعذر الاتصال بالسيرفر، تحقق من اتصالك وحاول مجدداً.",
    SERVER: "حدث خطأ في السيرفر، يرجى المحاولة لاحقاً.",
    UNKNOWN: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى."
  };

  let isSubmitting = false;

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.classList.remove("is-error", "is-success");
    formMessage.classList.add(type === "success" ? "is-success" : "is-error");
    formMessage.hidden = false;
  }

  function hideMessage() {
    formMessage.hidden = true;
    formMessage.textContent = "";
    formMessage.classList.remove("is-error", "is-success");
  }

  function clearInvalidState() {
    usernameInput.classList.remove("is-invalid");
    passwordInput.classList.remove("is-invalid");
  }

  function setLoading(state) {
    isSubmitting = state;
    submitBtn.disabled = state;
    submitBtn.classList.toggle("is-loading", state);
  }

  function validateUsername(value) {
    const trimmed = value.trim();
    if (trimmed.length < 3 || trimmed.length > 64) return false;
    return /^[A-Za-z0-9_.@\-]+$/.test(trimmed);
  }

  function validatePassword(value) {
    return typeof value === "string" && value.length >= 6 && value.length <= 128;
  }

  function validateForm() {
    clearInvalidState();
    hideMessage();

    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!username.trim() || !password) {
      showMessage(ERROR_MESSAGES.REQUIRED, "error");
      if (!username.trim()) usernameInput.classList.add("is-invalid");
      if (!password) passwordInput.classList.add("is-invalid");
      return null;
    }

    if (!validateUsername(username)) {
      usernameInput.classList.add("is-invalid");
      showMessage(ERROR_MESSAGES.USERNAME_INVALID, "error");
      usernameInput.focus();
      return null;
    }

    if (!validatePassword(password)) {
      passwordInput.classList.add("is-invalid");
      showMessage(ERROR_MESSAGES.PASSWORD_INVALID, "error");
      passwordInput.focus();
      return null;
    }

    return { username: username.trim(), password: password };
  }

  function togglePasswordVisibility() {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePasswordBtn.setAttribute("aria-pressed", isHidden ? "true" : "false");
    togglePasswordBtn.setAttribute("aria-label", isHidden ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const payload = validateForm();
    if (!payload) return;

    setLoading(true);
    hideMessage();

    try {
      const response = await fetch(API_LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }

      if (response.status === 429) {
        showMessage(ERROR_MESSAGES.RATE_LIMITED, "error");
        setLoading(false);
        return;
      }

      if (response.status === 401) {
        showMessage(ERROR_MESSAGES.INVALID_CREDENTIALS, "error");
        passwordInput.value = "";
        passwordInput.focus();
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const serverMessage = data && typeof data.message === "string" ? data.message : ERROR_MESSAGES.SERVER;
        showMessage(serverMessage, "error");
        setLoading(false);
        return;
      }

      if (!data || data.success !== true) {
        showMessage(ERROR_MESSAGES.UNKNOWN, "error");
        setLoading(false);
        return;
      }

      showMessage("تم تسجيل الدخول بنجاح، جاري تحويلك...", "success");
      usernameInput.value = "";
      passwordInput.value = "";

      setTimeout(function () {
        window.location.replace(DASHBOARD_URL);
      }, 700);
    } catch (err) {
      showMessage(ERROR_MESSAGES.NETWORK, "error");
      setLoading(false);
    }
  }

  async function redirectIfAuthenticated() {
    try {
      const response = await fetch(API_ME, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.success === true) {
          window.location.replace(DASHBOARD_URL);
        }
      }
    } catch (err) {
      /* تجاهل - الصفحة تعمل عادي لو التحقق فشل */
    }
  }

  loginForm.addEventListener("submit", handleSubmit);

  togglePasswordBtn.addEventListener("click", togglePasswordVisibility);

  usernameInput.addEventListener("input", function () {
    usernameInput.classList.remove("is-invalid");
    hideMessage();
  });

  passwordInput.addEventListener("input", function () {
    passwordInput.classList.remove("is-invalid");
    hideMessage();
  });

  redirectIfAuthenticated();
})();