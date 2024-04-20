"use strict";
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs-extra");
const mime = require("mime-types");
const path = require("path");
const md5 = require("md5");

const {
  serverDetail,
  serverCreate,
} = require("../controllers/server.controllers");
const { uploadFile } = require("../controllers/upload.controllers");
const { isAuthenticated } = require("../middleware");
const { remoteUpload } = require("../controllers/remote.controllers");
const {
  uploadChunk,
  checkChunks,
} = require("../controllers/upload-chunk.controllers");
const {
  testMerge,
  testData,
  extractAudio,
  extractVideo,
  extractSubtitle,
} = require("../controllers/test.controllers");

router.all("/", async (req, res) => {
  return res.status(200).json({ msg: "Server Upload" });
});

// upload
router.post("/upload", isAuthenticated, uploadFile);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const { file_name } = req.params;
    const tmpPath = path.join(global.dirPublic, "tmp", file_name);
    fs.mkdirSync(tmpPath, { recursive: true });
    cb(null, tmpPath);
  },
  filename: function (req, file, cb) {
    const { item } = req.params;
    const fullname = item;
    cb(null, fullname);
  },
});

const upload = multer({ storage: storage });

router.post("/chunks", isAuthenticated, checkChunks);

router.post(
  "/upload-chunk/:file_name/:item",
  isAuthenticated,
  upload.single("chunk"),
  uploadChunk
);

router.get("/test/:dir", testMerge);
router.get("/test/v/:file", testData);

// server
router.get("/server/detail", serverDetail);
router.get("/server/create", serverCreate);

//remote
router.get("/remote", remoteUpload);

router.all("*", async (req, res) => {
  return res.status(404).json({ error: true, msg: "not found!" });
});

module.exports = router;
