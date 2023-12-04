const webdav = require('webdav-server').v2;
const express = require('express');
const cors = require("cors");
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require("body-parser");
require('dotenv').config()
const S3FileSystem = require('./S3FileSystem');
const Database = require('./database/dbHelper');
const mongoDBUrl = process.env.MONGODB_URL;
const bucketName = process.env.BUCKET_NAME;

const userManager = new webdav.SimpleUserManager();
userManager.addUser("TestUser", "TestUser01", true);
const app = express();
// app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = new Database();
const connection = db.createConnection(mongoDBUrl);
const documentModel = db.getModel(connection, 'document', 'documents');

var HTTPNoAuthentication = (function () {
    function HTTPNoAuthentication(userManager, realm) {
        if (realm === void 0) { realm = 'realm'; }
        this.userManager = userManager;
        this.realm = realm;
    }
    HTTPNoAuthentication.prototype.askForAuthentication = function () {
        return {
            'WWW-Authenticate': 'Basic realm="' + this.realm + '"'
        };
    };
    HTTPNoAuthentication.prototype.getUser = function (ctx, callback) {
        var _this = this;
        _this.userManager.getDefaultUser(function (defaultUser) {
            callback(null, defaultUser);
        });
    };
    return HTTPNoAuthentication;
}());

function setHeaders(arg) {
    if (arg.request.method === "OPTIONS") {
        arg.response.setHeader(
            "Access-Control-Allow-Methods",
            "PROPPATCH,PROPFIND,OPTIONS,DELETE,UNLOCK,COPY,LOCK,MKCOL,MOVE,HEAD,POST,PUT,GET"
        );
        arg.response.setHeader(
            "allow",
            "PROPPATCH,PROPFIND,OPTIONS,DELETE,UNLOCK,COPY,LOCK,MKCOL,MOVE,HEAD,POST,PUT,GET"
        );
        arg.response.setHeader("Access-Control-Allow-Headers", "*");
        arg.response.setHeader("Access-Control-Allow-Origin", "*");
    }
    arg.response.setHeader("MS-Author-Via", "DAV");
}

const server = new webdav.WebDAVServer({
    httpAuthentication: new HTTPNoAuthentication(userManager, 'Default realm')
});

server.setFileSystem('/webdav', new S3FileSystem(mongoDBUrl, documentModel), (success) => {
    console.log('READY');
})

server.beforeRequest((arg, next) => {
    setHeaders(arg);
    next();
});

app.get("/getFiles", cors(), async (req, res) => {
    const files = await documentModel.find({});
    res.json({ files })
})

app.post("/getSignedUrl", cors(), async (req, res) => {
    const s3 = new AWS.S3({ region: 'us-east-1' });
    const { filename, type } = req.body;
    const extension = filename.split(".").pop();
    const documentId = uuidv4();
    const signedUrl = await s3.getSignedUrlPromise('putObject', {
        Bucket: bucketName,
        Key: `${documentId}.${extension}`,
        ContentType: type,
        Expires: 60,
    });

    const file = {
        documentId: documentId,
        title: filename.replace(`.${extension}`, "").trim(),
        createdOn: new Date(),
        updatedOn: new Date(),
        extension: extension,
        key: `${documentId}.${extension}`,
    }

    await documentModel.create(file);
    res.json({ signedUrl })
})

app.use(webdav.extensions.express('/', server));

app.listen(1901);