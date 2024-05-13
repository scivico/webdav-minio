'use strict';

const webdav = require('webdav-server').v2;
const AWS = require('aws-sdk');
var MimeLookup = require('mime-lookup');
var mime = new MimeLookup(require('mime-db'));
const Minio = require('minio');
const _ = require('lodash');
var etag = require('etag');
const { DocumentModel } = require('./database/dbHelper');
const bucketName = process.env.BUCKET_NAME;
const minioEndpoint = process.env.MINIO_ENDPOINT;
const minioPort = process.env.MINIO_PORT;
const minioAccessKey = process.env.MINIO_ACCESS_KEY;
const minioSecretKey = process.env.MINIO_SECRET_KEY;

module.exports = class MinIOFileSystem extends webdav.FileSystem {

    useCache = false;
    resources = {};

    constructor() {
        super();
        this.useCache = false;
    }

    getRemotePath(path) {
        var pathStr = path.toString();
        if (pathStr === '/')
            return '';
        else
            return pathStr;
    }

    getPathInformation(path) {
        const pathParts = path.paths;
        const documentVersion = pathParts[1];
        const documentId = pathParts[0];

        return { documentVersion, documentId };
    }

    getMetaData(path, callback) {
        const { documentId } = this.getPathInformation(path);
        if (this.useCache && this.resources[documentId] && this.resources[documentId].metadata) {
            callback(undefined, this.resources[documentId].metadata);
        } else {
            if (path.isRoot()) {
                callback(undefined, {
                    '.tag': 'folder',
                    name: '',
                    size: 0
                });
            } else {
                DocumentModel.findOne({ documentId }).then(document => {
                    if (!this.resources[documentId]) {
                        this.resources[documentId].metadata = {};
                    }
                    this.resources[documentId].metadata = document;
                    callback(undefined, document);
                }).catch(err => {
                    callback(err);
                });
            }
        }
    }

    getFileData(key, version, callback) {
        const minioClient = new Minio.Client({
            endPoint: minioEndpoint,
            port: 9000,
            useSSL: false,
            accessKey: minioAccessKey,
            secretKey: minioSecretKey
        });

        minioClient.listObjectVersions({
            Bucket: bucketName,
            Prefix: key
        }, (e, versionData) => {
            if (e) {
                callback(webdav.Errors.ResourceNotFound);
            }
            const isLatest = version === "latest";
            const requestedVersion = isLatest ? _.first(versionData.Versions, (x) => x.IsLatest).VersionId : documentVersion;
            let params = {
                Key: key,
                Bucket: bucketName
            }
            if (versionData.Versions.length) params.VersionId = requestedVersion;

            minioClient.getObject(params, (err, fileData) => {
                if (err) {
                    callback(webdav.Errors.ResourceNotFound);
                }

                callback(undefined, { size: fileData.ContentLength, content: fileData.Body });
            })
        })
    }

    _rename(pathFrom, newName, ctx, callback) {
        //Rename not supported
    }

    _create(path, ctx, callback) {
        //Create not supported
    }

    _delete(path, ctx, callback) {
        //Delete not supported
    };

    _openWriteStream(path, ctx, callback) {
        this.getMetaData(path, (err, metadata) => {
            if (err) {
                callback(webdav.Errors.ResourceNotFound);
            }

            const documentKey = metadata.key;
            let content = [];
            let stream = new webdav.VirtualFileWritable(content);
            stream.on('finish', () => {
                const minioClient = new Minio.Client({
                    endPoint: minioEndpoint,
                    port: 9000,
                    useSSL: false,
                    accessKey: minioAccessKey,
                    secretKey: minioSecretKey
                });

                minioClient.putObject({
                    Bucket: bucketName,
                    Key: documentKey,
                    Body: Buffer.concat(content)
                }, (err, data) => {
                    if (err) {
                        console.log(err);
                    }
                });
            });
            DocumentModel.updateOne({ documentId: metadata.documentId }, {
                $set: {
                    updatedOn: new Date().toISOString()
                }
            }).then(data => {
                callback(null, stream);
            })

        })
    };

    _openReadStream(path, ctx, callback) {
        this.getMetaData(path, (err, metadata) => {
            if (err) {
                callback(webdav.Errors.ResourceNotFound);
            }
            const { documentVersion } = this.getPathInformation(path);
            const documentKey = metadata.key;
            const etagValue = etag(new Date(metadata.updatedOn).toUTCString());

            if (ctx.context.request.headers['if-none-match'] === etagValue) {
                console.log('Returning 304 as file has not changed.');
                ctx.context.response.statusCode = 304;
                ctx.context.response.end();
                return;
            }

            this.getFileData(documentKey, documentVersion, (err, data) => {
                if (err) {
                    callback(webdav.Errors.ResourceNotFound);
                }

                const content = data.content;
                var stream = new webdav.VirtualFileReadable([content]);
                var contentType = mime.lookup(metadata.extension);
                ctx.context.response.setHeader('etag', etagValue);
                ctx.context.response.setHeader('Content-type', contentType);

                callback(undefined, stream);
            })
        });
    };

    _size(path, ctx, callback) {
        const { documentVersion, documentId } = this.getPathInformation(path);
        if (this.useCache && this.resources[documentId] && this.resources[documentId].size) {
            callback(undefined, this.resources[documentId].size);
        } else {
            this.getMetaData(path, (err, metadata) => {
                if (err) {
                    callback(webdav.Errors.ResourceNotFound);
                }
                const documentKey = metadata.key;
                this.getFileData(documentKey, documentVersion, (err, data) => {
                    if (err) {
                        callback(webdav.Errors.ResourceNotFound);
                    }
                    const size = data.size;

                    if (!this.resources[documentId])
                        this.resources[documentId] = {};

                    this.resources[documentId].size = size;
                    callback(undefined, size);
                })
            })
        }
    };

    _lockManager(path, ctx, callback) {
        const { documentId } = this.getPathInformation(path);
        this.getMetaData(path, (e) => {
            if (e) {
                return callback(webdav.Errors.ResourceNotFound);
            }

            if (!this.resources[documentId])
                this.resources[documentId] = {};

            if (!this.resources[documentId].locks)
                this.resources[documentId].locks = new webdav.LocalLockManager();

            callback(undefined, this.resources[documentId].locks);
        })
    };

    _propertyManager(path, ctx, callback) {
        this.getMetaData(path, (e) => {
            if (e) {
                return callback(webdav.Errors.ResourceNotFound);
            }

            if (!this.resources[documentId])
                this.resources[documentId] = {};

            if (!this.resources[documentId].props)
                this.resources[documentId].props = new webdav.LocalPropertyManager();

            callback(undefined, this.resources[documentId].props);
        })
    };

    _readDir(path, ctx, callback) {
        //Read Directory not supported
    };

    _creationDate(path, ctx, callback) {
        this._lastModifiedDate(path, ctx, callback);

        this.getMetaData(path, (e, data) => {
            if (e)
                return callback(webdav.Errors.ResourceNotFound);

            callback(undefined, new Date(data.createdOn).toISOString());
        })
    };

    _lastModifiedDate(path, ctx, callback) {
        this.getMetaData(path, (e, data) => {
            if (e)
                return callback(webdav.Errors.ResourceNotFound);

            callback(undefined, new Date(data.createdOn).toISOString());
        })
    };

    _type(path, ctx, callback) {
        const { documentId } = this.getPathInformation(path);
        if (this.useCache && this.resources[documentId] && this.resources[documentId].type) {
            callback(undefined, this.resources[documentId].type);
        } else {
            this.getMetaData(path, (e, data) => {
                if (e)
                    callback(webdav.Errors.ResourceNotFound);

                const type = webdav.ResourceType.File;

                if (!this.resources[documentId])
                    this.resources[documentId] = {};

                this.resources[documentId].type = type;
                callback(undefined, type);
            })
        }
    };

    _mimeType(path, ctx, callback) {
        this.getMetaData(path, (e, data) => {
            if (e)
                return callback(webdav.Errors.ResourceNotFound);

            callback(null, mime.lookup(data.extension));
        })
    }
}