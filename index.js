const webdav = require('webdav-server').v2;
const express = require('express');
require('dotenv').config()
const AWS = require('aws-sdk');
const S3FileSystem = require('./S3FileSystem');
const mongoDBUrl = process.env.MONGODB_URL;

const userManager = new webdav.SimpleUserManager();
userManager.addUser("TestUser", "TestUser01", true);
const app = express();

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

server.setFileSystem('/webdav', new S3FileSystem(mongoDBUrl), (success) => {
    console.log('READY');
})

server.beforeRequest((arg, next) => {
    setHeaders(arg);
    next();
});

app.use(webdav.extensions.express('/', server));

app.listen(1901);