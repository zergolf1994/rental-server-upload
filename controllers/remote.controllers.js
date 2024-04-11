const path = require("path");
const fs = require("fs-extra");
const { MediaModel } = require("../models/media.models");
const {
  getLocalServer,
  getStorageServer,
  updateDiskLocalServer,
} = require("../utils/server.utils");
const { SCPRemote } = require("../utils/scp.utils");

exports.remoteUpload = async (req, res) => {
  try {
    const upload = await getLocalServer();

    const medias = await MediaModel.aggregate([
      {
        $match: {
          serverId: upload?._id,
          quality: "original",
        },
      },
      { $sample: { size: 1 } },
    ]);

    if (!medias?.length) throw new Error("Media Not found");
    const media = medias[0];
    const local_file = path.join(global.dirPublic, "upload", media.file_name);

    if (!fs.existsSync(local_file)) throw new Error(`Local File Not found`);

    const storage = await getStorageServer();
    if (!storage) throw new Error("Storage Not found");
    const scp_data = await SCPRemote({
      ssh: storage.auth,
      save_dir: `/home/original`,
      file: {
        file_name: media.file_name,
      },
    });

    if (!scp_data?.error) {
      const updateDb = await MediaModel.updateOne(
        { _id: media?._id },
        {
          serverId: storage?.serverId,
        }
      );
      if (updateDb?.modifiedCount) {
        fs.unlinkSync(local_file);
      }

      await updateDiskLocalServer();
    }
    return res.json(scp_data);
  } catch (err) {
    return res.json({ error: true, msg: err?.message });
  }
};
