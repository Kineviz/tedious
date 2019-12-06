const { assert } = require('chai');
const Connection = require('../src/connection');
const Parser = require('../src/token/stream-parser');
const fs = require('fs');
const homedir = require('os').homedir();
const Request = require('../src/request');

const featureExtAckParser = require('../src/token/feature-ext-ack-parser');
const Colmetadata = require('../src/token/colmetadata-token-parser');
const sinon = require('sinon');

describe('AE Test', function () {
    let config = JSON.parse(fs.readFileSync(homedir + '/.tedious/test-connection-ae.json', 'utf8')).config;

    it('should connect to TediousDB', function (done) {
        let connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                console.log('connection error: ', err)
            } else {
                console.log('connected!')
                assert.isUndefined(err);
            }
            connection.close();
            done();
        })

        connection.on('debug', function (text) {
            // console.log(text);
        });
        connection.on('infoMessage', function (info) {
            // console.log('state: ', info.state, ' | ', 'message: ', info.message)
        })
    })

    describe('LOGIN7 Payload tests', function () {
        it('should send COLUMNENCRYPTION in LOGIN7', function (done) {
            const connection = new Connection(config);
            const payLoad = connection.sendLogin7PacketHelper_setupLogin7Payload();
            assert.isTrue(payLoad.colEncryption);
            done();
        })
    })

    describe('Feature-ext-ack-parser.ts test', function () {
        it('should return new FeatureExtAckToken with correct colEncryption feature data', function (done) {
            const buf = Buffer.alloc(7); // mimics expected featureextack response from server
            let offset = 0;
            offset = buf.writeUInt8(0x04, offset)
            offset = buf.writeUInt32LE(1, offset) // length (DWORD)
            offset = buf.writeUInt8(1, offset) // COLUMNENCRYPTION_VERSION / Feature Data (Byte)
            buf.writeUInt8(0xFF, offset); // Terminator 

            const parser = new Parser({ token() { } }, {}, {});
            parser.buffer = buf;

            featureExtAckParser(parser, [], [], (token) => {
                assert.equal(token.colEncryption[0], 1);// 2.2.7.11 Feature data should be 1 
                done();
            })
        })
    })

    describe('Colmetadata-token-parser.ts test', function () {
        describe('read CEK Table Metadata', function () {
            let cekTable;

            before(function (done) {
                //These example buffers contain values from a real response except for encryptedKey_Buf;
                //readCekTable()
                const ekValueCount_Buf = Buffer.from([1, 0]);

                //readEk_Info()
                const databaseId_Buf = Buffer.from([33, 0, 0, 0]);
                const cekId_Buf = Buffer.from([3, 0, 0, 0])
                const cekVersion_Buf = Buffer.from([1, 0, 0, 0]);
                const cekMDVersion_Buf = Buffer.from([113, 98, 168, 0, 24, 171, 0, 0]);
                const count_Buf = Buffer.from([1]);

                //readEncryptionKeyValue()
                const encryptedKey_Buf = Buffer.from([1, 0, 2])

                const keyStoreName_Buf = Buffer.from([
                    23, 77, 0, 83, 0, 83, 0, 81, 0, 76, 0, 95, 0, 67, 0, 69, 0, 82, 0, 84, 0, 73, 0, 70, 0, 73, 0, 67, 0, 65, 0, 84, 0, 69, 0, 95, 0, 83, 0, 84, 0, 79, 0,
                    82, 0, 69, 0
                ]);

                const keyPath_Buf = Buffer.from([
                    55, 0, 67, 0, 117, 0, 114, 0, 114, 0, 101, 0, 110, 0, 116, 0, 85, 0, 115, 0, 101, 0, 114, 0, 47, 0, 109, 0, 121, 0, 47, 0, 54, 0, 70, 0, 56, 0, 49, 0,
                    66, 0, 50, 0, 68, 0, 57, 0, 52, 0, 68, 0, 67, 0, 57, 0, 51, 0, 51, 0, 70, 0, 48, 0, 57, 0, 50, 0, 52, 0, 48, 0, 48, 0, 66, 0, 53, 0, 57, 0, 54, 0, 54,
                    0, 48, 0, 49, 0, 50, 0, 53, 0, 68, 0, 51, 0, 57, 0, 67, 0, 68, 0, 56, 0, 57, 0, 48, 0, 52, 0, 49, 0
                ]);

                const asymmetricAlgo_Buf = Buffer.from([8, 82, 0, 83, 0, 65, 0, 95, 0, 79, 0, 65, 0, 69, 0, 80, 0]);

                const sampleResponse_Buf = Buffer.concat([ekValueCount_Buf, databaseId_Buf, cekId_Buf, cekVersion_Buf, cekMDVersion_Buf, count_Buf, encryptedKey_Buf, keyStoreName_Buf, keyPath_Buf, asymmetricAlgo_Buf]);

                const parser = new Parser({ token() { } }, {}, { alwaysEncrypted: true });
                parser.buffer = sampleResponse_Buf;
                
                Colmetadata.readCekTable(parser, (data) => {
                    cekTable = data;
                    done();
                })
            })

            it('cekTable should not be undefined', function () {
                assert.isDefined(cekTable);
            })

            it('ekValueCount should equal 1', function() {
                assert.equal(cekTable.ekValueCount, 1)
            })

            it('databaseId should equal 33', function() {
                assert.equal(cekTable.eK_INFO.databaseId, 33);
            })

            it('cekId should equal 3', function(){
                assert.equal(cekTable.eK_INFO.cekId, 3)
            })

            it('cekVersion should equal 1', function(){
                assert.equal(cekTable.eK_INFO.cekVersion, 1);
            })

            it('cekMDVersion should equal 188119578600049', function() {
                assert.equal(cekTable.eK_INFO.cekMDVersion, 188119578600049)
            })

            it('count should equal 1', function() {
                assert.equal(cekTable.eK_INFO.count, 1);
            })

            it('encryptedKey should equal 2', function(){
                for(const value of cekTable.eK_INFO.encryptionKeyValue[0].encryptedKey.values()){
                    assert.equal(value, 2);
                }
            })

            it('keyStoreName should equal "MSSQL_CERTIFICATE_STORE"', function(){
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].keyStoreName, "MSSQL_CERTIFICATE_STORE")
            });

            it('keyPath should equal "CurrentUser/my/6F81B2D94DC933F092400B59660125D39CD89041"', function() {
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].keyPath, "CurrentUser/my/6F81B2D94DC933F092400B59660125D39CD89041");
            })

            it('asymmetricAlgo should equal "RSA_OAEP"', function() {
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].asymmetricAlgo, "RSA_OAEP");
            })
        })
    })




































    //Dummy test, remove later. 
    xdescribe('Dry run', function () {
        it('should do a simple query', function (done) {
            let connection = new Connection(config);

            connection.on('connect', (err) => {
                if (err) {
                    console.log('connection error: ', err)
                    connection.close();
                    done();
                } else {
                    sendQuery(connection);
                }
            })
            /* 
                        connection.on('debug', function (text) {
                            console.log(text);
                        });
                        connection.on('infoMessage', function (info) {
                            console.log('state: ', info.state, ' | ', 'message: ', info.message)
                        }) */

            function sendQuery(connection) {
                console.log('sending query')
                let request = new Request('SELECT * FROM DetTable', (err, rowCount) => {
                    if (err) {
                        console.log('Request err: ', err);
                    } else {
                        assert.isUndefined(err);
                        connection.close();
                        done();
                    }
                })

                /*                 let row = 1;
                                request.on('row', function (columns) {
                                    console.log('row: ', row)
                                    columns.forEach(function (column) {
                                        if (column.value === null) {
                                            console.log('NULL');
                                        } else {
                                            console.log(column);
                                        }
                                    });
                                    row += 1;
                                }); */

                connection.execSql(request);
            }
        })
    })
})