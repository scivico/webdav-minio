const { connect, connection, model } = require("mongoose")
const mongoDBUrl = process.env.MONGODB_URL;

connect(mongoDBUrl);
const db = connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    console.log('Connected to MongoDB');
})

const { DocumentSchema } = require("./schema/DocumentSchema")

module.exports.DocumentModel = model('Document', DocumentSchema, "documents");