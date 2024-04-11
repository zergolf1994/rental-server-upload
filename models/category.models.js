const uuid = require("uuid");
const mongoose = require("mongoose");
const { Mixed } = mongoose.Schema.Types;

exports.CategoryModel = mongoose.model(
  "categorys",
  new mongoose.Schema(
    {
      _id: { type: String, default: () => uuid?.v4() },
      isPublic: { type: Boolean, default: false },
      name: { type: String, require: true, unique: true },
      slug: { type: String, require: true, unique: true },
    },
    {
      timestamps: true,
    }
  )
);
