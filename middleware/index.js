const { merge } = require("lodash");
const jwt = require("jsonwebtoken");

exports.isAuthenticated = async (req, res, next) => {
  try {
    if (!req?.headers?.authorization) throw new Error("Something went wrong.");
    const authorization = req?.headers?.authorization?.split(" ");
    const bearer = authorization?.at(1);

    const verify = jwt.verify(bearer, process.env.JWT_SECRET);

    merge(req, { user: verify });
    return next();
  } catch (error) {
    return res.status(401).json({ error: true, message: error?.message });
  }
};
