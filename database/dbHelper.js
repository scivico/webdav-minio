const { createConnection } = require("mongoose");
const { DocumentSchema } = require("./schema/DocumentSchema");
const _ = require('lodash');
let cachedConnection = null;

module.exports = class Database{
    modelMapper = {
        document: {
            schema: DocumentSchema,
            name: "Document"
        }
    };

    createConnection(connectionString) {
        if (!cachedConnection) {
            cachedConnection = createConnection(connectionString);
        }

        return cachedConnection;
    }

    getModel(connection, key, tableName) {
        if (_.includes(_.keys(this.modelMapper), key)) {
            const model = this.modelMapper[key];
            return connection.models[model.name] || connection.model(model.name, model.schema, tableName);
        }
        return new Error('Invalid Key');
    }
}