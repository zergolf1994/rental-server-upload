const path = require("path");
const fs = require("fs-extra");
const { unlinkSync } = require("fs");

class Cacheder {
  chunks = {
    get: (md5) => {
      try {
        const _dir = path.join(global.dirPublic, "tmp"),
          _file = path.join(_dir, `${md5}.json`);

        if (!fs.existsSync(_dir)) {
          fs.mkdirSync(_dir, { recursive: true });
        }

        if (!fs.existsSync(_file)) throw new Error("not found");

        const read = fs.readFileSync(_file, "utf8");
        return JSON.parse(read);
      } catch (error) {
        return { error: true, msg: error?.message };
      }
    },
    save: (md5, data) => {
      try {
        const _dir = path.join(global.dirPublic, "tmp"),
          _file = path.join(_dir, `${md5}.json`);

        if (!fs.existsSync(_dir)) {
          fs.mkdirSync(_dir, { recursive: true });
        }
        fs.writeFileSync(_file, JSON.stringify(data), "utf8");

        return data;
      } catch (error) {
        return { error: true, msg: error?.message };
      }
    },
    delete: (md5) => {
      try {
        const _dir = path.join(global.dirPublic, "tmp"),
          _file = path.join(_dir, `${md5}.json`);

        if (!fs.existsSync(_dir)) {
          fs.mkdirSync(_dir, { recursive: true });
        }
        fs.unlinkSync(_file);
        return true;
      } catch (error) {
        return { error: true, msg: error?.message };
      }
    },
  };
}
exports.Cached = new Cacheder();
