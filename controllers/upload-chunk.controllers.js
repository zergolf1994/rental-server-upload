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
const { Cached } = require("../utils/cache.utils");

exports.checkChunks = async (req, res) => {
  try {
    const { userId } = get(req, "user");
    const { name, size, mime_type, chunks, total } = req.body;
    const hashmd5 = md5(name + size);

    let check = Cached.chunks.get(hashmd5);
    if (check?.error) {
      console.log("new upload");
      const cache_data = {
        md5: hashmd5,
        file_name: name,
        mime_type: mime_type,
        size: size,
        current: 1,
        total: total,
        chunks: chunks,
      };
      check = Cached.chunks.save(hashmd5, cache_data);
    }

    return res.status(200).json(check);
  } catch (err) {
    return res.status(400).json({ error: true, msg: err?.message });
  }
};
exports.uploadChunk = async (req, res) => {
  try {
    const { userId } = get(req, "user");
    const { file_name, item } = req.params;

    const { total, mime_type, categorySlug, folderSlug } = req.body;

    let cache_data = Cached.chunks.get(file_name);
    if (cache_data?.error) {
      throw new Error("ไม่พบข้อมูล");
    }

    const tmpPath = path.join(global.dirPublic, "tmp", file_name);
    const uploadPath = path.join(global.dirPublic, "upload");
    fs.mkdirSync(uploadPath, { recursive: true });

    if (cache_data.total != item) {
      cache_data.current = Number(item) + 1;
      await Cached.chunks.save(file_name, cache_data);
      return res.status(201).end();
    }
    //รวมไฟล์
    const BufferUpload = Array.from({ length: cache_data.total }).map(
      (e, i) => {
        const item = i + 1;
        const tmpItem = path.join(tmpPath, item.toString());
        if (!fs.existsSync(tmpItem)) throw new Error("Upload failed");
        return fs.readFileSync(tmpItem);
      }
    );

    if (!BufferUpload?.length) throw new Error("Buffer failed");
    const slug = await slugFile(12);
    const save_name = `${slug}.${mime.extension(cache_data.mime_type)}`;
    const newFilePath = path.join(uploadPath, save_name);

    const mergeFile = Buffer.concat(BufferUpload);
    fs.writeFileSync(newFilePath, mergeFile);
    fs.rmSync(tmpPath, { recursive: true, force: true });
    await Cached.chunks.delete(file_name);

    const server = await getLocalServer();
    if (!server) {
      fs.unlinkSync(newFilePath);
      return res.status(500).json({
        error: true,
        message: "The destination server was not found.",
      });
    }
    const video = await get_video_details(newFilePath);

    if (video.error) {
      fs.unlinkSync(newFilePath);
      throw new Error(video.msg);
    }
    let dataSave = {
      userId,
      slug,
      title: cache_data.file_name,
      mimeType: cache_data.mime_type,
      size: video?.size,
      duration: video?.duration,
      highest: video?.highest,
    };

    if (categorySlug) {
      const cat = await CategoryModel.findOne({ slug: categorySlug }).select(
        `_id`
      );
      if (cat?._id) {
        dataSave.categoryId = cat?._id;
      }
    }
    if (folderSlug) {
      const fol = await FileModel.findOne({
        slug: folderSlug,
        mimeType: "dir",
      }).select(`_id`);

      if (fol?._id) {
        dataSave.folderId = fol?._id;
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
      mimeType: cache_data.mime_type,
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
