const webdav = require('webdav-server').v2;
const express = require('express');
const cors = require("cors");
const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require("body-parser");
require('dotenv').config();
const MinIOFileSystem = require('./MinIOFileSystem');
const { DocumentModel } = require('./database/dbHelper');
const bucketName = process.env.BUCKET_NAME;
const minioEndpoint = process.env.MINIO_ENDPOINT;
const minioPort = process.env.MINIO_PORT;
const minioAccessKey = process.env.MINIO_ACCESS_KEY;
const minioSecretKey = process.env.MINIO_SECRET_KEY;

const userManager = new webdav.SimpleUserManager();
userManager.addUser("TestUser", "TestUser01", true);
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

const setHeaders = (arg) => {
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
};

const server = new webdav.WebDAVServer({
    httpAuthentication: new HTTPNoAuthentication(userManager, 'Default realm')
});

server.setFileSystem('/webdav', new MinIOFileSystem(), (success) => {
    console.log('READY');
});

server.beforeRequest((arg, next) => {
    setHeaders(arg);
    next();
});

app.get("/getFiles", cors(), async (req, res) => {
    try {
        const files = await DocumentModel.find({});
        res.status(200).json({ files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/getSignedUrl", cors(), async (req, res) => {
    try {
        const { filename, type } = req.body;
        const extension = filename.split(".").pop();
        const documentId = uuidv4();

        const minioClient = new Minio.Client({
            endPoint: minioEndpoint,
            port: 9000,
            useSSL: false,
            accessKey: minioAccessKey,
            secretKey: minioSecretKey
        });

        // Genera una URL firmada
        const signedUrl = await minioClient.presignedPutObject(
            bucketName,
            `${documentId}.${extension}`, // Aquí podrías utilizar `${documentId}.${extension}`
            60 // La duración de la URL firmada en segundos
        );

        const file = {
            documentId: documentId,
            title: filename.replace(`.${extension}`, "").trim(),
            createdOn: new Date(),
            updatedOn: new Date(),
            extension: extension,
            key: `${documentId}.${extension}`,
        };

        await DocumentModel.create(file);
        res.status(200).json({ signedUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use(webdav.extensions.express('/', server));

app.listen(1901);