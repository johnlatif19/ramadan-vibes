"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const validator = require("validator");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const cloudinary = require("cloudinary").v2;

const PORT = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET;

const SECTIONS_COLLECTION = "sections";
const POSTS_COLLECTION = "posts";

const COOKIE_NAME = "ramadan_vibes_token";
const JWT_EXPIRES_IN = "8h";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const MAX_MESSAGE_LENGTH = 1000;
const MAX_SECTION_NAME_LENGTH = 40;
const MIN_SECTION_NAME_LENGTH = 2;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DEFAULT_SECTIONS = [
  { id: "ramz", name: "رامز جلال", order: 0 },
  { id: "maddah", name: "المداح", order: 1 },
  { id: "other", name: "شيء آخر", order: 2 }
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}

function normalizePrivateKey(raw) {
  if (!raw) return "";
  return String(raw).replace(/\\n/g, "\n");
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set and at least 32 characters long.");
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be set.");
}

const firebaseProjectId = requiredEnv("FIREBASE_PROJECT_ID");
const firebaseClientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
const firebasePrivateKey = normalizePrivateKey(requiredEnv("FIREBASE_PRIVATE_KEY"));

let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp({
    credential: cert({
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey
    })
  });
} else {
  firebaseApp = getApps()[0];
}

const db = getFirestore(firebaseApp);

cloudinary.config({
  cloud_name: requiredEnv("CLOUDINARY_CLOUD_NAME"),
  api_key: requiredEnv("CLOUDINARY_API_KEY"),
  api_secret: requiredEnv("CLOUDINARY_API_SECRET"),
  secure: true
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("INVALID_FILE_TYPE"));
    }
    return cb(null, true);
  }
});

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

const allowedOrigin = process.env.PUBLIC_ORIGIN || "";
app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (!IS_PRODUCTION && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      if (allowedOrigin && origin === allowedOrigin) {
        return cb(null, true);
      }
      return cb(new Error("CORS_NOT_ALLOWED"));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى." }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "عدد الطلبات كبير، يرجى المحاولة لاحقاً." }
});

app.use("/api/auth/login", loginLimiter);
app.use("/api", generalLimiter);

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/"
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "غير مصرح لك، يرجى تسجيل الدخول." });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== "admin") {
      return res.status(401).json({ success: false, message: "جلسة غير صالحة، يرجى تسجيل الدخول مجدداً." });
    }
    req.admin = decoded;
    return next();
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({ success: false, message: "جلسة منتهية، يرجى تسجيل الدخول." });
  }
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\u0000/g, "").trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (err) {
    return false;
  }
}

function toIsoOrMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function serializeSection(docId, data) {
  return {
    id: docId,
    name: typeof data.name === "string" ? data.name : "",
    order: typeof data.order === "number" ? data.order : 0
  };
}

function serializePost(docId, data) {
  return {
    id: docId,
    sectionId: typeof data.sectionId === "string" ? data.sectionId : "",
    message: typeof data.message === "string" ? data.message : "",
    imageUrl: typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : "",
    createdAt: toIsoOrMillis(data.createdAt),
    updatedAt: toIsoOrMillis(data.updatedAt)
  };
}

async function ensureDefaultSections() {
  const sectionsRef = db.collection(SECTIONS_COLLECTION);
  const snapshot = await sectionsRef.get();

  if (snapshot.empty) {
    const batch = db.batch();
    DEFAULT_SECTIONS.forEach(function (section) {
      const ref = sectionsRef.doc(section.id);
      batch.set(ref, {
        name: section.name,
        order: section.order,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    return;
  }

  const existingIds = new Set();
  snapshot.forEach(function (doc) {
    existingIds.add(doc.id);
  });

  const missing = DEFAULT_SECTIONS.filter(function (s) {
    return !existingIds.has(s.id);
  });

  if (missing.length > 0) {
    const batch = db.batch();
    missing.forEach(function (section) {
      const ref = sectionsRef.doc(section.id);
      batch.set(ref, {
        name: section.name,
        order: section.order,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
}

let sectionsReadyPromise = null;
function getSectionsReady() {
  if (!sectionsReadyPromise) {
    sectionsReadyPromise = ensureDefaultSections().catch(function (err) {
      sectionsReadyPromise = null;
      throw err;
    });
  }
  return sectionsReadyPromise;
}

app.get("/api/health", function (req, res) {
  return res.json({ success: true, data: { status: "ok" } });
});

app.post("/api/auth/login", async function (req, res) {
  try {
    const body = req.body || {};
    const username = sanitizeText(body.username, 64);
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "يرجى إدخال اسم المستخدم وكلمة المرور." });
    }

    if (!validator.isLength(username, { min: 3, max: 64 }) || !/^[A-Za-z0-9_.@\-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: "اسم المستخدم غير صالح." });
    }

    if (!validator.isLength(password, { min: 6, max: 128 })) {
      return res.status(400).json({ success: false, message: "كلمة المرور غير صالحة." });
    }

    const usernameMatches = validator.equals(username, ADMIN_USERNAME);
    let passwordMatches = false;
    if (usernameMatches) {
      passwordMatches = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    }

    if (!usernameMatches || !passwordMatches) {
      return res.status(401).json({ success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    }

    const token = signToken({ role: "admin", username: username });
    setAuthCookie(res, token);

    return res.json({
      success: true,
      data: { username: username, role: "admin" }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "حدث خطأ في السيرفر، يرجى المحاولة لاحقاً." });
  }
});

app.post("/api/auth/logout", function (req, res) {
  clearAuthCookie(res);
  return res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, function (req, res) {
  return res.json({
    success: true,
    data: { username: req.admin.username, role: req.admin.role }
  });
});

app.get("/api/sections", async function (req, res) {
  try {
    await getSectionsReady();
    const snapshot = await db.collection(SECTIONS_COLLECTION).orderBy("order", "asc").get();
    const sections = [];
    snapshot.forEach(function (doc) {
      sections.push(serializeSection(doc.id, doc.data()));
    });
    return res.json({ success: true, data: sections });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر جلب الأقسام." });
  }
});

app.put("/api/sections/:id", requireAuth, async function (req, res) {
  try {
    const sectionId = String(req.params.id || "").trim();
    if (!sectionId || !/^[a-zA-Z0-9_-]+$/.test(sectionId)) {
      return res.status(400).json({ success: false, message: "معرّف القسم غير صالح." });
    }

    const body = req.body || {};
    const newName = sanitizeText(body.name, MAX_SECTION_NAME_LENGTH);

    if (!validator.isLength(newName, { min: MIN_SECTION_NAME_LENGTH, max: MAX_SECTION_NAME_LENGTH })) {
      return res.status(400).json({
        success: false,
        message: "اسم القسم يجب أن يكون بين 2 و40 حرفاً."
      });
    }

    if (/[<>]/.test(newName)) {
      return res.status(400).json({ success: false, message: "اسم القسم يحتوي على أحرف غير مسموحة." });
    }

    const sectionRef = db.collection(SECTIONS_COLLECTION).doc(sectionId);
    const sectionSnap = await sectionRef.get();
    if (!sectionSnap.exists) {
      return res.status(404).json({ success: false, message: "القسم غير موجود." });
    }

    const allSectionsSnap = await db.collection(SECTIONS_COLLECTION).get();
    let duplicate = false;
    allSectionsSnap.forEach(function (doc) {
      if (doc.id !== sectionId) {
        const data = doc.data() || {};
        if (typeof data.name === "string" && data.name.trim() === newName) {
          duplicate = true;
        }
      }
    });

    if (duplicate) {
      return res.status(409).json({ success: false, message: "هذا الاسم مستخدم بالفعل في قسم آخر." });
    }

    await sectionRef.update({
      name: newName,
      updatedAt: FieldValue.serverTimestamp()
    });

    return res.json({ success: true, data: { id: sectionId, name: newName } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر تحديث القسم." });
  }
});

app.get("/api/posts", async function (req, res) {
  try {
    const snapshot = await db.collection(POSTS_COLLECTION).orderBy("createdAt", "desc").get();
    const posts = [];
    snapshot.forEach(function (doc) {
      posts.push(serializePost(doc.id, doc.data()));
    });
    return res.json({ success: true, data: posts });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر جلب المنشورات." });
  }
});

app.post("/api/posts", requireAuth, async function (req, res) {
  try {
    await getSectionsReady();
    const body = req.body || {};
    const sectionId = sanitizeText(body.sectionId, 64);
    const messageText = sanitizeText(body.message, MAX_MESSAGE_LENGTH);
    const rawImageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!sectionId) {
      return res.status(400).json({ success: false, message: "يرجى اختيار القسم." });
    }
    if (!messageText || messageText.length === 0) {
      return res.status(400).json({ success: false, message: "يرجى كتابة رسالة المنشور." });
    }
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: "الرسالة يجب ألا تتجاوز 1000 حرف." });
    }

    const sectionSnap = await db.collection(SECTIONS_COLLECTION).doc(sectionId).get();
    if (!sectionSnap.exists) {
      return res.status(400).json({ success: false, message: "القسم غير موجود." });
    }

    let imageUrl = "";
    if (rawImageUrl) {
      if (!isValidHttpUrl(rawImageUrl)) {
        return res.status(400).json({ success: false, message: "رابط الصورة غير صالح." });
      }
      imageUrl = rawImageUrl;
    }

    const newPostRef = db.collection(POSTS_COLLECTION).doc();
    await newPostRef.set({
      sectionId: sectionId,
      message: messageText,
      imageUrl: imageUrl,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    const created = await newPostRef.get();
    return res.status(201).json({
      success: true,
      data: serializePost(created.id, created.data())
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر إضافة المنشور." });
  }
});

app.put("/api/posts/:id", requireAuth, async function (req, res) {
  try {
    const postId = String(req.params.id || "").trim();
    if (!postId || !/^[a-zA-Z0-9_-]+$/.test(postId)) {
      return res.status(400).json({ success: false, message: "معرّف المنشور غير صالح." });
    }

    const body = req.body || {};
    const sectionId = sanitizeText(body.sectionId, 64);
    const messageText = sanitizeText(body.message, MAX_MESSAGE_LENGTH);
    const hasImageField = Object.prototype.hasOwnProperty.call(body, "imageUrl");
    const rawImageUrl = hasImageField && typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;

    if (!sectionId) {
      return res.status(400).json({ success: false, message: "يرجى اختيار القسم." });
    }
    if (!messageText) {
      return res.status(400).json({ success: false, message: "يرجى كتابة رسالة المنشور." });
    }
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ success: false, message: "الرسالة يجب ألا تتجاوز 1000 حرف." });
    }

    const sectionSnap = await db.collection(SECTIONS_COLLECTION).doc(sectionId).get();
    if (!sectionSnap.exists) {
      return res.status(400).json({ success: false, message: "القسم غير موجود." });
    }

    const postRef = db.collection(POSTS_COLLECTION).doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return res.status(404).json({ success: false, message: "المنشور غير موجود." });
    }

    let finalImageUrl = postSnap.data().imageUrl || "";

    if (hasImageField) {
      if (rawImageUrl === null || rawImageUrl === "") {
        finalImageUrl = "";
      } else if (!isValidHttpUrl(rawImageUrl)) {
        return res.status(400).json({ success: false, message: "رابط الصورة غير صالح." });
      } else {
        finalImageUrl = rawImageUrl;
      }
    }

    await postRef.update({
      sectionId: sectionId,
      message: messageText,
      imageUrl: finalImageUrl,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await postRef.get();
    return res.json({
      success: true,
      data: serializePost(updated.id, updated.data())
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر تحديث المنشور." });
  }
});

app.delete("/api/posts/:id", requireAuth, async function (req, res) {
  try {
    const postId = String(req.params.id || "").trim();
    if (!postId || !/^[a-zA-Z0-9_-]+$/.test(postId)) {
      return res.status(400).json({ success: false, message: "معرّف المنشور غير صالح." });
    }

    const postRef = db.collection(POSTS_COLLECTION).doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return res.status(404).json({ success: false, message: "المنشور غير موجود." });
    }

    const data = postSnap.data() || {};
    const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

    await postRef.delete();

    if (imageUrl && imageUrl.indexOf("res.cloudinary.com") !== -1) {
      const publicId = extractCloudinaryPublicId(imageUrl);
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId, { invalidate: true });
        } catch (err) {
          /* تجاهل أخطاء حذف الصورة من Cloudinary */
        }
      }
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "تعذر حذف المنشور." });
  }
});

function extractCloudinaryPublicId(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return null;
    let rest = parts.slice(uploadIndex + 1);
    if (rest.length > 0 && /^v\d+$/.test(rest[0])) {
      rest = rest.slice(1);
    }
    if (rest.length === 0) return null;
    const last = rest[rest.length - 1];
    const withoutExt = last.replace(/\.[^.]+$/, "");
    rest[rest.length - 1] = withoutExt;
    return rest.join("/");
  } catch (err) {
    return null;
  }
}

app.post("/api/upload", requireAuth, function (req, res) {
  upload.single("image")(req, res, async function (err) {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: "حجم الصورة يجب أن يكون 5 ميجا أو أقل." });
      }
      if (err.message === "INVALID_FILE_TYPE") {
        return res.status(400).json({ success: false, message: "نوع الصورة غير مدعوم. المسموح: JPEG أو PNG أو WEBP." });
      }
      return res.status(400).json({ success: false, message: "تعذر معالجة الصورة." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "لم يتم اختيار صورة." });
    }

    try {
      const uploadResult = await new Promise(function (resolve, reject) {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "ramadan-vibes/posts",
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [{ quality: "auto", fetch_format: "auto" }]
          },
          function (error, result) {
            if (error) return reject(error);
            return resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      if (!uploadResult || !uploadResult.secure_url) {
        return res.status(500).json({ success: false, message: "تعذر رفع الصورة." });
      }

      return res.json({
        success: true,
        data: {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        }
      });
    } catch (uploadErr) {
      return res.status(500).json({ success: false, message: "تعذر رفع الصورة، يرجى المحاولة مرة أخرى." });
    }
  });
});

app.use("/api", function (req, res) {
  return res.status(404).json({ success: false, message: "المسار غير موجود." });
});

const publicDir = path.join(__dirname, "public");

app.use(
  express.static(publicDir, {
    index: false,
    extensions: ["html"],
    maxAge: IS_PRODUCTION ? "7d" : 0,
    setHeaders: function (res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  })
);

app.get("/", function (req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/index.html", function (req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", function (req, res) {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/login.html", function (req, res) {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/dashboard", function (req, res) {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/dashboard.html", function (req, res) {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.use(function (req, res) {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.use(function (err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err && err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ success: false, message: "الوصول غير مسموح من هذا المصدر." });
  }
  if (req.path && req.path.indexOf("/api") === 0) {
    return res.status(500).json({ success: false, message: "حدث خطأ غير متوقع." });
  }
  return res.status(500).sendFile(path.join(publicDir, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, function () {
    console.log("Ramadan Vibes server is running on port " + PORT);
  });
}

module.exports = app;
