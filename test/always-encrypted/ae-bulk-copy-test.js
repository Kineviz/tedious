const fs = require('fs');
const { pipeline, Readable } = require('readable-stream');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;
const assert = require('chai').assert;

const debugMode = false;

function getConfig() {
    const { config } = JSON.parse(
        fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
    );

    config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

    if (debugMode) {
        config.options.debug = {
            packet: true,
            data: true,
            payload: true,
            token: true
        };
    }

    return config;
}

describe('Bulk Load Tests', function () {
    this.timeout(60000);
    let connection;

    const createKeys = (cb) => {
        const request = new Request(`CREATE COLUMN MASTER KEY [CMK1] WITH (
          KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
          KEY_PATH = 'some-arbitrary-keypath'
        );`, (err) => {
            if (err) {
                return cb(err);
            }
            const request = new Request(`CREATE COLUMN ENCRYPTION KEY [CEK1] WITH VALUES (
            COLUMN_MASTER_KEY = [CMK1],
            ALGORITHM = 'RSA_OAEP',
            ENCRYPTED_VALUE = 0xDEADBEEF
          );`, (err) => {
                if (err) {
                    return cb(err);
                }
                return cb();
            });
            connection.execSql(request);
        });
        connection.execSql(request);
    };

    const dropKeys = (cb) => {
        const request = new Request('IF OBJECT_ID(\'dbo.test_always_encrypted\', \'U\') IS NOT NULL DROP TABLE dbo.test_always_encrypted;', (err) => {
            if (err) {
                return cb(err);
            }

            const request = new Request('IF (SELECT COUNT(*) FROM sys.column_encryption_keys WHERE name=\'CEK1\') > 0 DROP COLUMN ENCRYPTION KEY [CEK1];', (err) => {
                if (err) {
                    return cb(err);
                }

                const request = new Request('IF (SELECT COUNT(*) FROM sys.column_master_keys WHERE name=\'CMK1\') > 0 DROP COLUMN MASTER KEY [CMK1];', (err) => {
                    if (err) {
                        return cb(err);
                    }

                    cb();
                });
                connection.execSql(request);
            });
            connection.execSql(request);
        });
        connection.execSql(request);
    };

    this.beforeAll(function (done) {
        connection = new Connection(getConfig());
        // connection.on('debug', (msg) => console.log(msg));
        connection.on('connect', () => {
            dropKeys((err) => {
                if (err) {
                    return done(err);
                }
                createKeys(done);
            });
        });
    })

    beforeEach(function (done) {
        connection = new Connection(getConfig());
        connection.on('connect', done);

        if (debugMode) {
            connection.on('debug', (message) => console.log(message));
            connection.on('infoMessage', (info) =>
                console.log('Info: ' + info.number + ' - ' + info.message)
            );
            connection.on('errorMessage', (error) =>
                console.log('Error: ' + error.number + ' - ' + error.message)
            );
        }
    });

    afterEach(function (done) {
        if (!connection.closed) {
            connection.on('end', done);
            connection.close();
        } else {
            done();
        }
    });

    this.afterAll(function (done) {
        if (!connection.closed) {
            dropKeys(() => {
                connection.on('end', done);
                connection.close();
            });
        } else {
            done();
        }
    })

    it('should bulk copy from encrypted table to encrypted table', function (done) {
        const bulkLoad = connection.newBulkLoad('test_always_encrypted', (err) => {
            if (err) {
                done(err);
            }
            console.log('doneBULKCommand')
            // done();
        })

        // for (let [name, type, column] of [[
        //     'int_test',
        //     TYPES.Int,
        //     {
        //         encryptionType: 'DETERMINISTIC',
        //         algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_256',
        //         columnEncryptionKey: 'CEK1',
        //     }
        // ]]) {
        //     bulkLoad.addColumn(name, type, column);
        // }

        const request = new Request(bulkLoad.getTableCreationSql(), (err, rowCount) => {
            if(err) {
                done(err);
            }
            console.log('done Request');

            bulkLoad.addRow(4)
            connection.execBulkLoad(bulkLoad);         
        })
        console.log(bulkLoad.getTableCreationSql());

        connection.execSql(request);
    })
})