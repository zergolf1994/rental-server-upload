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
const md5 = require("md5");
const { CategoryModel } = require("../models/category.models");
exports.uploadChunk = async (req, res) => {
  try {
    const { userId } = get(req, "user");
    const { file_name, item } = req.params;
    const { total, mime_type, categorySlug } = req.body;
    const tmpPath = path.join(global.dirPublic, "tmp", md5(file_name));
    const uploadPath = path.join(global.dirPublic, "upload");
    fs.mkdirSync(uploadPath, { recursive: true });

    if (total != item) {
      return res.status(201).end();
    }
    //รวมไฟล์

    const BufferUpload = Array.from({ length: total }).map((e, i) => {
      const item = i + 1;
      const tmpItem = path.join(tmpPath, item.toString());
      if (!fs.existsSync(tmpItem)) throw new Error("Upload failed");
      return fs.readFileSync(tmpItem);
    });

    if (!BufferUpload?.length) throw new Error("Buffer failed");

    const slug = await slugFile(12);
    const save_name = `${slug}.${mime.extension(mime_type)}`;
    const newFilePath = path.join(uploadPath, save_name);

    const mergeFile = Buffer.concat(BufferUpload);
    fs.writeFileSync(newFilePath, mergeFile);
    fs.rmSync(tmpPath, { recursive: true, force: true });

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
      title: file_name,
      mimeType: mime_type,
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
      mimeType: mime_type,
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
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};
