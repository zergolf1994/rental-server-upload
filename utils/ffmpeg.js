const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs-extra");

exports.get_video_info = async (url) => {
  try {
    return new Promise((resolve, reject) => {
      ffmpeg(url).ffprobe((err, data) => {
        if (err) {
          resolve({ error: true });
        }
        resolve(data);
      });
    });
  } catch (error) {
    return { error: true };
  }
};

exports.get_video_details = async (file_default) => {
  try {
    const { format, streams } = await this.get_video_info(file_default);

    const videoStream = streams.find((stream) => stream.codec_type === "video");

    if (!videoStream) throw new Error("streams not found");

    let { width, height } = videoStream;
    if (!width && !height) throw new Error("Dimention error");

    if (!format.size) throw new Error("size error");

    let data = {
      video_type: width > height ? "horizontal" : "vertical",
      useType: "height",
    };
    let output = {
      dimention: `${width}x${height}`,
      size: format.size,
      duration: Math.floor(format.duration),
    };
    if (data.video_type == "horizontal") {
      if (width >= 1920 || height >= 1080) {
        output.highest = 1080;
      } else if (width >= 1280 || height >= 720) {
        output.highest = 720;
      } else if (width >= 854 || height >= 480) {
        output.highest = 480;
      } else {
        output.highest = 360;
      }
    } else {
      if (width >= 1080 || height >= 1920) {
        output.highest = 1080;
      } else if (width >= 720 || height >= 1280) {
        output.highest = 720;
      } else if (width >= 480 || height >= 854) {
        output.highest = 480;
      } else {
        output.highest = 360;
      }
    }

    return output;
  } catch (error) {
    return { error: true, msg: error?.message };
  }
};
