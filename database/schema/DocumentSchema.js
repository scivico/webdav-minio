const { Schema } = require("mongoose");

module.exports.DocumentSchema = new Schema({
    documentId: { type: String, required: true, unique: true },
    title: { type: String, required: true, unique: false },
    createdOn: { type: Date, required: true, unique: false },
    updatedOn: { type: Date, required: true, unique: false },
    extension: { type: String, required: true, unique: false },
    key: { type: String, required: true, unique: false },
})