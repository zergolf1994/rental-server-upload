const fs = require("fs-extra");
const path = require("path");
const mime = require("mime-types");
const { Cached } = require("../utils/cache.utils");
const { slugFile } = require("../utils/random");
const { get_video_info } = require("../utils/ffmpeg");
const ffmpeg = require("fluent-ffmpeg");

exports.testMerge = async (req, res) => {
  try {
    const { dir } = req.params;
    const cached = await Cached.chunks.get(dir);
    if (cached.total != cached.current) throw new Error("ไฟล์ไม่สมบูรณ์");

    const tmpPath = path.join(global.dirPublic, "tmp", dir);
    const tmpList = path.join(global.dirPublic, "tmp", `${dir}.txt`);

    const checkItem = Array.from({ length: cached.total }).map((e, i) => {
      const item = i + 1;
      const tmpItem = path.join(tmpPath, item.toString());
      if (!fs.existsSync(tmpItem)) throw new Error("Upload failed");
      return tmpItem;
    });

    const slug = await slugFile(12);
    const save_name = `${slug}.${mime.extension(cached.mime_type)}`;

    const outputPath = path.join(global.dirPublic, "upload", save_name);
    let outputFile = fs.createWriteStream(outputPath);

    checkItem.forEach(function (file) {
      const data = fs.readFileSync(file);
      outputFile.write(data);
    });

    outputFile.end();
    outputFile.on("finish", async function () {
      console.log("finish");
    });

    return res.status(200).json({ save_name });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};

exports.testData = async (req, res) => {
  try {
    const { file } = req.params;

    const pathFile = path.join(global.dirPublic, "upload", file);
    const outputDir = path.join(global.dirPublic, "upload");

    if (!fs.existsSync(pathFile)) throw new Error("ไม่พบไฟล์วิดีโอ");

    const data = await get_video_info(pathFile);
    return res.status(200).json({ ...data });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};

exports.extractVideo = async (req, res) => {
  try {
    const { file } = req.params;

    const pathFile = path.join(global.dirPublic, "upload", file);
    const outputDir = path.join(global.dirPublic, "upload");

    if (!fs.existsSync(pathFile)) throw new Error("ไม่พบไฟล์วิดีโอ");

    const data = await get_video_info(pathFile);

    const video = data?.streams?.find(
      (stream) => stream.codec_type === "video"
    );
    if (!video) {
      return res.json({ error: true, msg: "ไม่พบสตรีมวิดีโอในไฟล์" });
    }

    ffmpeg(pathFile)
      .output(path.join(outputDir, `original_nosound.mp4`))
      .outputOptions(["-an", "-sn"])
      .on("start", function (commandLine) {
        console.log("Starting conversion: " + commandLine);
      })
      .on("progress", function (progress) {
        console.log("progress: ", progress.percent);
      })
      .on("end", function () {
        console.log("\nConversion finished");
      })
      .on("error", function (err, stdout, stderr) {
        console.error("Error converting video:", err);
      })
      .run();
    return res.status(200).json({
      video,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};

exports.extractAudio = async (req, res) => {
  try {
    const { file } = req.params;

    const pathFile = path.join(global.dirPublic, "upload", file);
    const outputDir = path.join(global.dirPublic, "upload");

    if (!fs.existsSync(pathFile)) throw new Error("ไม่พบไฟล์วิดีโอ");

    const data = await get_video_info(pathFile);
    const audio = data?.streams.filter(
      (stream) => stream.codec_type === "audio"
    );
    audio.forEach((stream, index) => {
      const channel = index;
      const audioPath = path.join(outputDir, `audio_${channel + 1}.mp3`);
      // แยกเสียงออกจากวิดีโอ
      ffmpeg(pathFile)
        .output(audioPath)
        .outputOptions("-map", `0:a:${index}`)
        .audioCodec("libmp3lame")
        .on("start", function (commandLine) {
          console.log("Starting conversion: " + commandLine);
        })
        .on("progress", function (progress) {
          console.log("progress: ", progress.percent);
        })
        .on("end", function () {
          console.log("\nConversion finished");
        })
        .run();
    });

    return res.status(200).json({
      audios: audio.map((raw) => {
        const output = {
          codec_type: raw.codec_type,
          title: raw.tags.title,
        };
        return output;
      }),
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};

exports.extractSubtitle = async (req, res) => {
  try {
    const { file } = req.params;

    const pathFile = path.join(global.dirPublic, "upload", file);
    const outputDir = path.join(global.dirPublic, "upload");

    if (!fs.existsSync(pathFile)) throw new Error("ไม่พบไฟล์วิดีโอ");

    const data = await get_video_info(pathFile);

    const subtitle = data?.streams.filter(
      (stream) => stream.codec_type === "subtitle"
    );

    subtitle.forEach((stream, index) => {
      const channel = index;
      const subtitlePath = path.join(outputDir, `subtitle_${channel + 1}.srt`);
      // แยกเสียงออกจากวิดีโอ
      ffmpeg(pathFile)
        .output(subtitlePath)
        .outputOptions("-vn", "-an", "-map", ` 0:s:${stream.index}`)
        .on("start", function (commandLine) {
          console.log("Starting conversion: " + commandLine);
        })
        .on("progress", function (progress) {
          console.log("progress: ", progress.percent);
        })
        .on("end", function () {
          console.log("\nConversion finished");
        })
        .run();
    });

    /*.map((raw) => {
          const output = {
            codec_type: raw.codec_type,
            title: raw.tags.title,
          };
          return output;
        });*/

    return res.status(200).json({
      subtitle,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: true, msg: err?.message });
  }
};
