const multer = require("multer");
const fs = require("fs-extra");
const mime = require("mime-types");
const path = require("path");
const { get } = require("lodash");

const { slugFile, slugMedia } = require("../utils/random");
const { FileModel } = require("../models/file.models");
const { MediaModel } = require("../models/media.models");
const {
  getLocalServer,
  getStorageServer,
  updateDiskLocalServer,
} = require("../utils/server.utils");
const { SCPRemote } = require("../utils/scp.utils");
const { get_video_details } = require("../utils/ffmpeg");
const { CategoryModel } = require("../models/category.models");

exports.uploadFile = async (req, res) => {
  try {
    const { userId } = get(req, "user");

    const maxSizeUpload = 1024 * 1024 * 1024 * 5;
    const abortPath = path.join(global.dirPublic, "aborted");
    const tmpPath = path.join(global.dirPublic, "tmp");
    const uploadPath = path.join(global.dirPublic, "upload");

    fs.mkdirSync(abortPath, { recursive: true });
    fs.mkdirSync(tmpPath, { recursive: true });
    fs.mkdirSync(uploadPath, { recursive: true });

    const slug = await slugFile(12);

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, path.join(tmpPath));
      },
      filename: function (req, file, cb) {
        const fullname = slug + "." + mime.extension(file.mimetype);
        cb(null, fullname);
        req.on("aborted", () => {
          fs.renameSync(
            path.join(tmpPath, fullname),
            path.join(abortPath, fullname)
          );
        });
      },
    });

    const upload = multer({
      storage: storage,
      fileFilter: function (req, file, callback) {
        const { mimetype } = file;
        file.originalname = Buffer.from(file.originalname, "latin1").toString(
          "utf8"
        );
        if (!mimetype.startsWith("video")) {
          return callback(new Error("Unsupported Media Type"));
        } else if (parseInt(req.headers["content-length"]) > maxSizeUpload) {
          return callback(new Error("Content Too Large"));
        } else {
          //console.log('Accepted file.');
          return callback(null, true);
        }
      },
      limits: {
        fileSize: maxSizeUpload,
      }, // 5 GB
    }).single("file");

    upload(req, res, async (err) => {
      if (err) {
        if (err.message == "Content Too Large")
          return res.status(413).json({ error: true, msg: err.message });
        else if (err.message == "Unsupported Media Type")
          return res.status(415).json({ error: true, msg: err.message });
        else return res.status(400).json({ error: true, msg: err.message });
      }

      const { categorySlug } = req.body;
      const { originalname, mimetype, size } = req.file;
      const save_name = `${slug}.${mime.extension(mimetype)}`;
      // ตำแหน่งเดิมของไฟล์
      const oldFilePath = path.join(tmpPath, save_name);

      // ตำแหน่งใหม่ที่ต้องการย้ายไฟล์ไป
      const newFilePath = path.join(uploadPath, save_name);

      // ย้ายไฟล์
      fs.renameSync(oldFilePath, newFilePath);

      const server = await getLocalServer();
      if (!server) {
        fs.unlinkSync(newFilePath);
        return res.status(500).json({
          error: true,
          message: "The destination server was not found.",
        });
      }

      const video = await get_video_details(newFilePath);

      let dataSave = {
        userId,
        slug,
        title: originalname,
        originalTitle: originalname,
        mimeType: mimetype,
        size: video?.size,
        duration: video?.duration,
        highest: video?.highest,
      };

      if (categorySlug) {
        const cat = await CategoryModel.findOne({ slug: categorySlug }).select(`_id`);
        if (cat?._id) {
          dataSave.categoryId = cat?._id;
        }
      }

      const fileSave = await FileModel.create(dataSave);

      if (!fileSave?._id) {
        fs.unlinkSync(newFilePath);
        return res
          .status(400)
          .json({ error: true, msg: "Something went wrong." });
      }

      let dataMedia = {
        fileId: fileSave?._id,
        file_name: save_name,
        quality: "original",
        size: video?.size,
        dimention: video?.dimention,
        mimeType: mimetype,
        serverId: server._id,
        slug: await slugMedia(12),
      };

      const storage = await getStorageServer();
      if (storage?.auth) {
        const scp_data = await SCPRemote({
          ssh: storage.auth,
          save_dir: `/home/original`,
          file: {
            file_name: dataMedia.file_name,
          },
        });

        if (!scp_data?.error) {
          dataMedia.serverId = storage.serverId;
        }
      }

      const mediaSave = await MediaModel.create(dataMedia);

      if (!mediaSave?._id) {
        await FileModel.deleteOne({ _id: fileSave._id });
        fs.unlinkSync(newFilePath);
        return res.status(500).json({ error: true });
      }

      if (dataMedia.serverId != server._id) {
        fs.unlinkSync(newFilePath);
      } else {
        await updateDiskLocalServer();
      }
      return res.status(201).json({
        msg: "File uploaded successfully.",
        slug,
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};
