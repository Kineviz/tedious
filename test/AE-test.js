const { assert } = require('chai');
const Connection = require('../src/connection');
const Parser = require('../src/token/stream-parser');
const colMetadataParser = require('../src/token/colmetadata-token-parser');
const fs = require('fs');
const homedir = require('os').homedir();
const Request = require('../src/request');

const featureExtAckParser = require('../src/token/feature-ext-ack-parser');
const Colmetadata = require('../src/token/colmetadata-token-parser');

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

            it('ekValueCount should equal 1', function () {
                assert.equal(cekTable.ekValueCount, 1)
            })

            it('databaseId should equal 33', function () {
                assert.equal(cekTable.eK_INFO.databaseId, 33);
            })

            it('cekId should equal 3', function () {
                assert.equal(cekTable.eK_INFO.cekId, 3)
            })

            it('cekVersion should equal 1', function () {
                assert.equal(cekTable.eK_INFO.cekVersion, 1);
            })

            it('cekMDVersion should equal 188119578600049', function () {
                assert.equal(cekTable.eK_INFO.cekMDVersion, 188119578600049)
            })

            it('count should equal 1', function () {
                assert.equal(cekTable.eK_INFO.count, 1);
            })

            it('encryptedKey should equal 2', function () {
                for (const value of cekTable.eK_INFO.encryptionKeyValue[0].encryptedKey.values()) {
                    assert.equal(value, 2);
                }
            })

            it('keyStoreName should equal "MSSQL_CERTIFICATE_STORE"', function () {
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].keyStoreName, "MSSQL_CERTIFICATE_STORE")
            });

            it('keyPath should equal "CurrentUser/my/6F81B2D94DC933F092400B59660125D39CD89041"', function () {
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].keyPath, "CurrentUser/my/6F81B2D94DC933F092400B59660125D39CD89041");
            })

            it('asymmetricAlgo should equal "RSA_OAEP"', function () {
                assert.strictEqual(cekTable.eK_INFO.encryptionKeyValue[0].asymmetricAlgo, "RSA_OAEP");
            })
        })
    })

    describe('Cryptometadata-token-parser.ts test', function () {

        // This is a buffer that holds an example returned column metadata from the server
        // This message starts with the "count" component
        // The flags and cryptometadata is separated from the whole buffer for later modifications
        const beforeBuf = Buffer.from([0x02, 0x00, 0x01, 0x00, 0x21, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x39, 0x44, 0xf1, 0x00, 0x0d, 0xab, 0x00, 0x00, 0x01, 0x73, 0x02, 0x01, 0x6e, 0x00, 0x00, 0x01, 0x63, 0x00, 0x75, 0x00, 0x72, 0x00, 0x72, 0x00, 0x65, 0x00, 0x6e, 0x00, 0x74, 0x00, 0x75, 0x00, 0x73, 0x00, 0x65, 0x00, 0x72, 0x00, 0x2f, 0x00, 0x6d, 0x00, 0x79, 0x00, 0x2f, 0x00, 0x32, 0x00, 0x66, 0x00, 0x63, 0x00, 0x65, 0x00, 0x30, 0x00, 0x65, 0x00, 0x31, 0x00, 0x30, 0x00, 0x35, 0x00, 0x31, 0x00, 0x33, 0x00, 0x61, 0x00, 0x38, 0x00, 0x66, 0x00, 0x61, 0x00, 0x36, 0x00, 0x34, 0x00, 0x34, 0x00, 0x61, 0x00, 0x65, 0x00, 0x34, 0x00, 0x30, 0x00, 0x31, 0x00, 0x37, 0x00, 0x64, 0x00, 0x32, 0x00, 0x37, 0x00, 0x63, 0x00, 0x64, 0x00, 0x61, 0x00, 0x39, 0x00, 0x38, 0x00, 0x65, 0x00, 0x65, 0x00, 0x62, 0x00, 0x33, 0x00, 0x31, 0x00, 0x65, 0x00, 0x36, 0x00, 0x31, 0x00, 0x07, 0x51, 0x02, 0x12, 0xe9, 0x38, 0x13, 0x02, 0x6e, 0x08, 0xa7, 0x87, 0x06, 0x83, 0x28, 0xd9, 0x70, 0x41, 0x20, 0xe7, 0xdb, 0xa1, 0x56, 0x98, 0xcf, 0x41, 0x3e, 0xfe, 0x73, 0x6a, 0x51, 0xa6, 0x0c, 0x68, 0xd5, 0x64, 0x4b, 0x6e, 0x1b, 0xb0, 0x45, 0x53, 0xcc, 0x88, 0x66, 0x58, 0x84, 0x1b, 0xb3, 0x45, 0xf2, 0x74, 0xf6, 0x61, 0x80, 0x81, 0xfc, 0xd9, 0xe3, 0x35, 0x98, 0x3b, 0xb5, 0x98, 0xde, 0x25, 0x24, 0xee, 0x81, 0x7f, 0xfb, 0x54, 0x1b, 0xc3, 0xe4, 0xf9, 0xaf, 0x52, 0x1c, 0x64, 0x12, 0x3e, 0xe8, 0xea, 0xfd, 0xa7, 0x4c, 0xb6, 0x44, 0x79, 0x60, 0x9a, 0x45, 0x4f, 0x6c, 0xf0, 0x9f, 0x95, 0x1e, 0xe7, 0x70, 0x50, 0xe2, 0xc5, 0x79, 0xea, 0x8e, 0xed, 0x89, 0x87, 0x33, 0x2b, 0xc3, 0xb7, 0xc0, 0xac, 0x99, 0x8d, 0x09, 0xba, 0xae, 0x26, 0x78, 0x9f, 0x76, 0xb0, 0xa3, 0x7e, 0xd1, 0x81, 0xa7, 0x7a, 0x31, 0x91, 0x09, 0xf8, 0xe6, 0xac, 0x58, 0x4a, 0x5b, 0x19, 0xc5, 0x99, 0x27, 0xcc, 0x6e, 0x34, 0x64, 0x5b, 0xb1, 0xb0, 0xf1, 0x3b, 0x3f, 0x94, 0xac, 0xd0, 0xa9, 0x23, 0x01, 0x7b, 0x8b, 0xa4, 0x6e, 0x0e, 0xd3, 0xfe, 0x31, 0x7f, 0x9a, 0xc3, 0xd2, 0xea, 0x1a, 0x77, 0x71, 0x4d, 0x98, 0x71, 0xd4, 0xcd, 0x19, 0x08, 0x44, 0xf4, 0x31, 0xd0, 0x1e, 0xad, 0x9f, 0x28, 0x21, 0xc3, 0x27, 0x04, 0x48, 0xf6, 0x99, 0xae, 0x4d, 0xd7, 0x41, 0xb1, 0xcd, 0x8f, 0x24, 0x6d, 0xe2, 0x0c, 0xb8, 0xb6, 0x70, 0x49, 0xe0, 0xc4, 0x52, 0xdb, 0x66, 0xd3, 0x3b, 0xa8, 0xaf, 0x74, 0x60, 0x9a, 0x29, 0x65, 0x99, 0xe6, 0x2c, 0x54, 0xcc, 0x7f, 0x5f, 0xb6, 0xdf, 0x69, 0x9c, 0x8a, 0xc5, 0x25, 0xbd, 0xaa, 0x29, 0x84, 0x6f, 0x17, 0x68, 0x11, 0x31, 0x87, 0x08, 0x7b, 0x70, 0x63, 0x14, 0xb3, 0x59, 0x37, 0x67, 0x8f, 0xa5, 0xed, 0x7d, 0x13, 0xa8, 0x11, 0x94, 0xd8, 0x57, 0x49, 0xd5, 0xf9, 0xec, 0xfa, 0x85, 0x90, 0x66, 0x11, 0xf4, 0xcb, 0x37, 0x0a, 0xe5, 0x7e, 0x9d, 0x06, 0x74, 0x7b, 0xbf, 0x93, 0x73, 0xb5, 0xb9, 0x06, 0x2c, 0xb5, 0xe9, 0xc5, 0xa8, 0x70, 0x69, 0xb2, 0x0b, 0xa0, 0x34, 0x57, 0x43, 0xab, 0xad, 0x9b, 0x26, 0x19, 0xf4, 0xbd, 0xb7, 0x6c, 0xc2, 0x1c, 0x3e, 0x92, 0xbf, 0x55, 0x99, 0x8b, 0x7a, 0xbb, 0x5f, 0xcd, 0x26, 0x54, 0x79, 0x08, 0xa9, 0x1f, 0x80, 0x8d, 0x13, 0xa0, 0x8f, 0xb0, 0xa4, 0x88, 0x83, 0x5e, 0xd4, 0x67, 0x80, 0xb8, 0x0c, 0xe2, 0x65, 0xba, 0x0c, 0x5e, 0xa1, 0xe3, 0x1e, 0xb4, 0x91, 0xa3, 0x9f, 0x6e, 0x13, 0xcb, 0xfc, 0x59, 0xbb, 0x58, 0x74, 0xf9, 0xe4, 0x5f, 0xba, 0xfa, 0x90, 0xf1, 0x8e, 0xd8, 0x16, 0xa3, 0x88, 0x4e, 0x33, 0x41, 0x30, 0xff, 0xc5, 0x55, 0xb4, 0x9d, 0x2c, 0x47, 0x0f, 0xf8, 0x0a, 0x3c, 0x13, 0x90, 0xaf, 0xf2, 0x07, 0xa2, 0x2d, 0x78, 0xef, 0xc0, 0xc5, 0x31, 0x36, 0xe0, 0x57, 0x1f, 0x2d, 0xa5, 0xac, 0xb9, 0x38, 0x4d, 0x60, 0x32, 0x20, 0xa7, 0xa6, 0x9e, 0xa2, 0x2d, 0xdd, 0xf8, 0x8a, 0xfb, 0x19, 0x36, 0x0d, 0x63, 0x2a, 0xfd, 0x36, 0x35, 0x84, 0x12, 0x75, 0xca, 0x82, 0xea, 0xd4, 0x57, 0xfe, 0x54, 0x0e, 0x06, 0xe1, 0x7a, 0xf6, 0xf0, 0xa1, 0x38, 0x63, 0xb1, 0x39, 0x5f, 0x6d, 0x4e, 0x8f, 0x7a, 0xb8, 0x93, 0x95, 0x8b, 0xa6, 0x58, 0x13, 0x69, 0xf1, 0xc5, 0x82, 0x69, 0x26, 0xb6, 0x5d, 0x60, 0x2c, 0xaa, 0x9d, 0xc1, 0x7d, 0x84, 0x6e, 0x30, 0xba, 0x38, 0x5d, 0xd8, 0x48, 0xf1, 0x58, 0x9d, 0x43, 0xe9, 0xd5, 0x59, 0x73, 0x94, 0xd5, 0x44, 0x26, 0x87, 0xd4, 0x92, 0xad, 0x1b, 0x17, 0x4d, 0x00, 0x53, 0x00, 0x53, 0x00, 0x51, 0x00, 0x4c, 0x00, 0x5f, 0x00, 0x43, 0x00, 0x45, 0x00, 0x52, 0x00, 0x54, 0x00, 0x49, 0x00, 0x46, 0x00, 0x49, 0x00, 0x43, 0x00, 0x41, 0x00, 0x54, 0x00, 0x45, 0x00, 0x5f, 0x00, 0x53, 0x00, 0x54, 0x00, 0x4f, 0x00, 0x52, 0x00, 0x45, 0x00, 0x37, 0x00, 0x43, 0x00, 0x75, 0x00, 0x72, 0x00, 0x72, 0x00, 0x65, 0x00, 0x6e, 0x00, 0x74, 0x00, 0x55, 0x00, 0x73, 0x00, 0x65, 0x00, 0x72, 0x00, 0x2f, 0x00, 0x6d, 0x00, 0x79, 0x00, 0x2f, 0x00, 0x32, 0x00, 0x46, 0x00, 0x43, 0x00, 0x45, 0x00, 0x30, 0x00, 0x45, 0x00, 0x31, 0x00, 0x30, 0x00, 0x35, 0x00, 0x31, 0x00, 0x33, 0x00, 0x41, 0x00, 0x38, 0x00, 0x46, 0x00, 0x41, 0x00, 0x36, 0x00, 0x34, 0x00, 0x34, 0x00, 0x41, 0x00, 0x45, 0x00, 0x34, 0x00, 0x30, 0x00, 0x31, 0x00, 0x37, 0x00, 0x44, 0x00, 0x32, 0x00, 0x37, 0x00, 0x43, 0x00, 0x44, 0x00, 0x41, 0x00, 0x39, 0x00, 0x38, 0x00, 0x45, 0x00, 0x45, 0x00, 0x42, 0x00, 0x33, 0x00, 0x31, 0x00, 0x45, 0x00, 0x36, 0x00, 0x31, 0x00, 0x08, 0x52, 0x00, 0x53, 0x00, 0x41, 0x00, 0x5f, 0x00, 0x4f, 0x00, 0x41, 0x00, 0x45, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00]);
        const flags = Buffer.from([0x09, 0x08])
        const midBuf = Buffer.from([0xa5, 0x51, 0x00])
        const cyptoMetdadataBuf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x26, 0x04, 0x02, 0x01, 0x01])
        const afterBuf = Buffer.from([0x06, 0x6e, 0x00, 0x75, 0x00, 0x6d, 0x00, 0x62, 0x00, 0x65, 0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0xa7, 0x0a, 0x00, 0x09, 0x04, 0xd0, 0x00, 0x34, 0x07, 0x6c, 0x00, 0x65, 0x00, 0x74, 0x00, 0x74, 0x00, 0x65, 0x00, 0x72, 0x00, 0x73, 0x00, 0xd1, 0x41, 0x00, 0x01, 0x0b, 0x0b, 0x1b, 0xb7, 0x61, 0x6b, 0xa0, 0x12, 0x1a, 0x9c, 0xa0, 0x1d, 0x4c, 0x3b, 0xe4, 0xfd, 0x20, 0xc0, 0x9d, 0x6a, 0xd9, 0x88, 0xf2, 0x68, 0x01, 0x52, 0xe1, 0x16, 0xb6, 0x65, 0x5b, 0x4d, 0x73, 0xb4, 0xae, 0x58, 0x00, 0x2a, 0x67, 0x70, 0x09, 0xe3, 0xd4, 0x4f, 0xac, 0x8b, 0x94, 0x83, 0x58, 0x52, 0x5e, 0xb8, 0xef, 0x82, 0x1f, 0x0e, 0xab, 0x09, 0x78, 0xca, 0xfb, 0xa2, 0x40, 0xd2, 0x01, 0x00, 0x61, 0xd1, 0x41, 0x00, 0x01, 0xa1, 0x2b, 0x5e, 0xbb, 0x2c, 0xc3, 0xf0, 0xa2, 0xe7, 0x6f, 0xf0, 0xb1, 0x51, 0x37, 0xea, 0x06, 0x6d, 0x81, 0x06, 0xb6, 0x07, 0xfb, 0x06, 0x1b, 0xa7, 0xdb, 0xe3, 0xcd, 0xde, 0x62, 0x71, 0x72, 0x04, 0x03, 0x04, 0x8c, 0xa3, 0x50, 0x6e, 0x58, 0x49, 0x54, 0x38, 0xbd, 0x59, 0xfa, 0x10, 0xe8, 0x62, 0xe7, 0x5b, 0xe9, 0x11, 0x3c, 0x8c, 0x8d, 0x84, 0x18, 0x00, 0x72, 0x31, 0x59, 0x23, 0x68, 0x01, 0x00, 0x62, 0xd1, 0x41, 0x00, 0x01, 0x3c, 0x1b, 0x96, 0x40, 0x25, 0xe4, 0x48, 0x3f, 0x9f, 0x3b, 0x57, 0x85, 0x57, 0x76, 0x7b, 0xbd, 0x09, 0xd7, 0xce, 0xc9, 0x6d, 0x8b, 0x14, 0x1f, 0xf9, 0xdb, 0xc8, 0xe0, 0x4f, 0x27, 0x07, 0x90, 0x57, 0xb8, 0x4d, 0xb6, 0x45, 0x82, 0x48, 0xc2, 0x90, 0xfb, 0x2a, 0xe9, 0xe3, 0x9e, 0x63, 0x23, 0xf9, 0x14, 0x15, 0x65, 0x64, 0x88, 0x5a, 0x34, 0xc3, 0x10, 0xbb, 0x14, 0x95, 0xb2, 0xe6, 0xb4, 0x01, 0x00, 0x63, 0xff, 0x11, 0x00, 0xc1, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79, 0x00, 0x00, 0x00, 0x00, 0xfe, 0x00, 0x00, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

        // A example Algoname which will be parsed as "TestName"
        const AlgoName = Buffer.from([0x08, 0x54, 0x00, 0x65, 0x00, 0x73, 0x00, 0x74, 0x00, 0x4e, 0x00, 0x61, 0x00, 0x6d, 0x00, 0x65, 0x00])
        // This tedious version will trigger a different length for usertype
        const tediousVerOld = '7_1'

        const options = {}
        options.tdsVersion = '7_4'
        options.alwaysEncrypted = true

        it('should read Cryptometadata', function (done) {
            // If always encrypted is on, and current column is encrypted
            // Then try to parse the cryptometadata, otherwise skip this function
            const bufArry = [beforeBuf, flags, midBuf, cyptoMetdadataBuf, afterBuf]
            const buf = Buffer.concat(bufArry)
            const parser = new Parser({ token() { } }, {}, {});
            parser.buffer = buf;
            parser.options = options
            Colmetadata.colMetadataParser(parser, [], options, (token) => {
                // column 1 number is a encrypted column
                // 2048 is binary mask of 100000000000 for fEncrypted flag
                assert.equal(parseInt(token.columns[0].flags) & 2048, 2048);
                assert.equal(token.columns[0].cryptoMetaData.ordinal, 0);
                assert.equal(token.columns[0].cryptoMetaData.userType, 0);
                assert.equal(token.columns[0].cryptoMetaData.baseTypeInfo.type.name, 'IntN');
                assert.equal(token.columns[0].cryptoMetaData.baseTypeInfo.dataLength, 4);
                assert.equal(token.columns[0].cryptoMetaData.encryptionAlgo, 2);
                assert.equal(token.columns[0].cryptoMetaData.algoName, 'undefined');
                assert.equal(token.columns[0].cryptoMetaData.encryptionAlgoType, 1);
                assert.equal(token.columns[0].cryptoMetaData.normVersion, 1);

                // column 2 letters is a non-encrypted column
                // cryptoMetaData will not be parsed fro this column
                assert.equal(parseInt(token.columns[1].flags) & 2048, 0);
                assert.equal(token.columns[1].cryptoMetaData, undefined);
                done();
            })
        })
        it('Cryptometadata with tedious ver less then 7_2 ', function (done) {
            // Remove a byte for all the places that userType is parsed
            const beforeBufWithUShortUserType = Buffer.from([0x02, 0x00, 0x01, 0x00, 0x21, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x39, 0x44, 0xf1, 0x00, 0x0d, 0xab, 0x00, 0x00, 0x01, 0x73, 0x02, 0x01, 0x6e, 0x00, 0x00, 0x01, 0x63, 0x00, 0x75, 0x00, 0x72, 0x00, 0x72, 0x00, 0x65, 0x00, 0x6e, 0x00, 0x74, 0x00, 0x75, 0x00, 0x73, 0x00, 0x65, 0x00, 0x72, 0x00, 0x2f, 0x00, 0x6d, 0x00, 0x79, 0x00, 0x2f, 0x00, 0x32, 0x00, 0x66, 0x00, 0x63, 0x00, 0x65, 0x00, 0x30, 0x00, 0x65, 0x00, 0x31, 0x00, 0x30, 0x00, 0x35, 0x00, 0x31, 0x00, 0x33, 0x00, 0x61, 0x00, 0x38, 0x00, 0x66, 0x00, 0x61, 0x00, 0x36, 0x00, 0x34, 0x00, 0x34, 0x00, 0x61, 0x00, 0x65, 0x00, 0x34, 0x00, 0x30, 0x00, 0x31, 0x00, 0x37, 0x00, 0x64, 0x00, 0x32, 0x00, 0x37, 0x00, 0x63, 0x00, 0x64, 0x00, 0x61, 0x00, 0x39, 0x00, 0x38, 0x00, 0x65, 0x00, 0x65, 0x00, 0x62, 0x00, 0x33, 0x00, 0x31, 0x00, 0x65, 0x00, 0x36, 0x00, 0x31, 0x00, 0x07, 0x51, 0x02, 0x12, 0xe9, 0x38, 0x13, 0x02, 0x6e, 0x08, 0xa7, 0x87, 0x06, 0x83, 0x28, 0xd9, 0x70, 0x41, 0x20, 0xe7, 0xdb, 0xa1, 0x56, 0x98, 0xcf, 0x41, 0x3e, 0xfe, 0x73, 0x6a, 0x51, 0xa6, 0x0c, 0x68, 0xd5, 0x64, 0x4b, 0x6e, 0x1b, 0xb0, 0x45, 0x53, 0xcc, 0x88, 0x66, 0x58, 0x84, 0x1b, 0xb3, 0x45, 0xf2, 0x74, 0xf6, 0x61, 0x80, 0x81, 0xfc, 0xd9, 0xe3, 0x35, 0x98, 0x3b, 0xb5, 0x98, 0xde, 0x25, 0x24, 0xee, 0x81, 0x7f, 0xfb, 0x54, 0x1b, 0xc3, 0xe4, 0xf9, 0xaf, 0x52, 0x1c, 0x64, 0x12, 0x3e, 0xe8, 0xea, 0xfd, 0xa7, 0x4c, 0xb6, 0x44, 0x79, 0x60, 0x9a, 0x45, 0x4f, 0x6c, 0xf0, 0x9f, 0x95, 0x1e, 0xe7, 0x70, 0x50, 0xe2, 0xc5, 0x79, 0xea, 0x8e, 0xed, 0x89, 0x87, 0x33, 0x2b, 0xc3, 0xb7, 0xc0, 0xac, 0x99, 0x8d, 0x09, 0xba, 0xae, 0x26, 0x78, 0x9f, 0x76, 0xb0, 0xa3, 0x7e, 0xd1, 0x81, 0xa7, 0x7a, 0x31, 0x91, 0x09, 0xf8, 0xe6, 0xac, 0x58, 0x4a, 0x5b, 0x19, 0xc5, 0x99, 0x27, 0xcc, 0x6e, 0x34, 0x64, 0x5b, 0xb1, 0xb0, 0xf1, 0x3b, 0x3f, 0x94, 0xac, 0xd0, 0xa9, 0x23, 0x01, 0x7b, 0x8b, 0xa4, 0x6e, 0x0e, 0xd3, 0xfe, 0x31, 0x7f, 0x9a, 0xc3, 0xd2, 0xea, 0x1a, 0x77, 0x71, 0x4d, 0x98, 0x71, 0xd4, 0xcd, 0x19, 0x08, 0x44, 0xf4, 0x31, 0xd0, 0x1e, 0xad, 0x9f, 0x28, 0x21, 0xc3, 0x27, 0x04, 0x48, 0xf6, 0x99, 0xae, 0x4d, 0xd7, 0x41, 0xb1, 0xcd, 0x8f, 0x24, 0x6d, 0xe2, 0x0c, 0xb8, 0xb6, 0x70, 0x49, 0xe0, 0xc4, 0x52, 0xdb, 0x66, 0xd3, 0x3b, 0xa8, 0xaf, 0x74, 0x60, 0x9a, 0x29, 0x65, 0x99, 0xe6, 0x2c, 0x54, 0xcc, 0x7f, 0x5f, 0xb6, 0xdf, 0x69, 0x9c, 0x8a, 0xc5, 0x25, 0xbd, 0xaa, 0x29, 0x84, 0x6f, 0x17, 0x68, 0x11, 0x31, 0x87, 0x08, 0x7b, 0x70, 0x63, 0x14, 0xb3, 0x59, 0x37, 0x67, 0x8f, 0xa5, 0xed, 0x7d, 0x13, 0xa8, 0x11, 0x94, 0xd8, 0x57, 0x49, 0xd5, 0xf9, 0xec, 0xfa, 0x85, 0x90, 0x66, 0x11, 0xf4, 0xcb, 0x37, 0x0a, 0xe5, 0x7e, 0x9d, 0x06, 0x74, 0x7b, 0xbf, 0x93, 0x73, 0xb5, 0xb9, 0x06, 0x2c, 0xb5, 0xe9, 0xc5, 0xa8, 0x70, 0x69, 0xb2, 0x0b, 0xa0, 0x34, 0x57, 0x43, 0xab, 0xad, 0x9b, 0x26, 0x19, 0xf4, 0xbd, 0xb7, 0x6c, 0xc2, 0x1c, 0x3e, 0x92, 0xbf, 0x55, 0x99, 0x8b, 0x7a, 0xbb, 0x5f, 0xcd, 0x26, 0x54, 0x79, 0x08, 0xa9, 0x1f, 0x80, 0x8d, 0x13, 0xa0, 0x8f, 0xb0, 0xa4, 0x88, 0x83, 0x5e, 0xd4, 0x67, 0x80, 0xb8, 0x0c, 0xe2, 0x65, 0xba, 0x0c, 0x5e, 0xa1, 0xe3, 0x1e, 0xb4, 0x91, 0xa3, 0x9f, 0x6e, 0x13, 0xcb, 0xfc, 0x59, 0xbb, 0x58, 0x74, 0xf9, 0xe4, 0x5f, 0xba, 0xfa, 0x90, 0xf1, 0x8e, 0xd8, 0x16, 0xa3, 0x88, 0x4e, 0x33, 0x41, 0x30, 0xff, 0xc5, 0x55, 0xb4, 0x9d, 0x2c, 0x47, 0x0f, 0xf8, 0x0a, 0x3c, 0x13, 0x90, 0xaf, 0xf2, 0x07, 0xa2, 0x2d, 0x78, 0xef, 0xc0, 0xc5, 0x31, 0x36, 0xe0, 0x57, 0x1f, 0x2d, 0xa5, 0xac, 0xb9, 0x38, 0x4d, 0x60, 0x32, 0x20, 0xa7, 0xa6, 0x9e, 0xa2, 0x2d, 0xdd, 0xf8, 0x8a, 0xfb, 0x19, 0x36, 0x0d, 0x63, 0x2a, 0xfd, 0x36, 0x35, 0x84, 0x12, 0x75, 0xca, 0x82, 0xea, 0xd4, 0x57, 0xfe, 0x54, 0x0e, 0x06, 0xe1, 0x7a, 0xf6, 0xf0, 0xa1, 0x38, 0x63, 0xb1, 0x39, 0x5f, 0x6d, 0x4e, 0x8f, 0x7a, 0xb8, 0x93, 0x95, 0x8b, 0xa6, 0x58, 0x13, 0x69, 0xf1, 0xc5, 0x82, 0x69, 0x26, 0xb6, 0x5d, 0x60, 0x2c, 0xaa, 0x9d, 0xc1, 0x7d, 0x84, 0x6e, 0x30, 0xba, 0x38, 0x5d, 0xd8, 0x48, 0xf1, 0x58, 0x9d, 0x43, 0xe9, 0xd5, 0x59, 0x73, 0x94, 0xd5, 0x44, 0x26, 0x87, 0xd4, 0x92, 0xad, 0x1b, 0x17, 0x4d, 0x00, 0x53, 0x00, 0x53, 0x00, 0x51, 0x00, 0x4c, 0x00, 0x5f, 0x00, 0x43, 0x00, 0x45, 0x00, 0x52, 0x00, 0x54, 0x00, 0x49, 0x00, 0x46, 0x00, 0x49, 0x00, 0x43, 0x00, 0x41, 0x00, 0x54, 0x00, 0x45, 0x00, 0x5f, 0x00, 0x53, 0x00, 0x54, 0x00, 0x4f, 0x00, 0x52, 0x00, 0x45, 0x00, 0x37, 0x00, 0x43, 0x00, 0x75, 0x00, 0x72, 0x00, 0x72, 0x00, 0x65, 0x00, 0x6e, 0x00, 0x74, 0x00, 0x55, 0x00, 0x73, 0x00, 0x65, 0x00, 0x72, 0x00, 0x2f, 0x00, 0x6d, 0x00, 0x79, 0x00, 0x2f, 0x00, 0x32, 0x00, 0x46, 0x00, 0x43, 0x00, 0x45, 0x00, 0x30, 0x00, 0x45, 0x00, 0x31, 0x00, 0x30, 0x00, 0x35, 0x00, 0x31, 0x00, 0x33, 0x00, 0x41, 0x00, 0x38, 0x00, 0x46, 0x00, 0x41, 0x00, 0x36, 0x00, 0x34, 0x00, 0x34, 0x00, 0x41, 0x00, 0x45, 0x00, 0x34, 0x00, 0x30, 0x00, 0x31, 0x00, 0x37, 0x00, 0x44, 0x00, 0x32, 0x00, 0x37, 0x00, 0x43, 0x00, 0x44, 0x00, 0x41, 0x00, 0x39, 0x00, 0x38, 0x00, 0x45, 0x00, 0x45, 0x00, 0x42, 0x00, 0x33, 0x00, 0x31, 0x00, 0x45, 0x00, 0x36, 0x00, 0x31, 0x00, 0x08, 0x52, 0x00, 0x53, 0x00, 0x41, 0x00, 0x5f, 0x00, 0x4f, 0x00, 0x41, 0x00, 0x45, 0x00, 0x50, 0x00, 0x00, 0x00]);
            const cyptoMetdadataBufWithUShortUserType = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x26, 0x04, 0x02, 0x01, 0x01])
            const afterBufWithUShortUserType = Buffer.from([0x06, 0x6e, 0x00, 0x75, 0x00, 0x6d, 0x00, 0x62, 0x00, 0x65, 0x00, 0x72, 0x00, 0x00, 0x00, 0x09, 0x00, 0xa7, 0x0a, 0x00, 0x09, 0x04, 0xd0, 0x00, 0x34, 0x07, 0x6c, 0x00, 0x65, 0x00, 0x74, 0x00, 0x74, 0x00, 0x65, 0x00, 0x72, 0x00, 0x73, 0x00, 0xd1, 0x41, 0x00, 0x01, 0x0b, 0x0b, 0x1b, 0xb7, 0x61, 0x6b, 0xa0, 0x12, 0x1a, 0x9c, 0xa0, 0x1d, 0x4c, 0x3b, 0xe4, 0xfd, 0x20, 0xc0, 0x9d, 0x6a, 0xd9, 0x88, 0xf2, 0x68, 0x01, 0x52, 0xe1, 0x16, 0xb6, 0x65, 0x5b, 0x4d, 0x73, 0xb4, 0xae, 0x58, 0x00, 0x2a, 0x67, 0x70, 0x09, 0xe3, 0xd4, 0x4f, 0xac, 0x8b, 0x94, 0x83, 0x58, 0x52, 0x5e, 0xb8, 0xef, 0x82, 0x1f, 0x0e, 0xab, 0x09, 0x78, 0xca, 0xfb, 0xa2, 0x40, 0xd2, 0x01, 0x00, 0x61, 0xd1, 0x41, 0x00, 0x01, 0xa1, 0x2b, 0x5e, 0xbb, 0x2c, 0xc3, 0xf0, 0xa2, 0xe7, 0x6f, 0xf0, 0xb1, 0x51, 0x37, 0xea, 0x06, 0x6d, 0x81, 0x06, 0xb6, 0x07, 0xfb, 0x06, 0x1b, 0xa7, 0xdb, 0xe3, 0xcd, 0xde, 0x62, 0x71, 0x72, 0x04, 0x03, 0x04, 0x8c, 0xa3, 0x50, 0x6e, 0x58, 0x49, 0x54, 0x38, 0xbd, 0x59, 0xfa, 0x10, 0xe8, 0x62, 0xe7, 0x5b, 0xe9, 0x11, 0x3c, 0x8c, 0x8d, 0x84, 0x18, 0x00, 0x72, 0x31, 0x59, 0x23, 0x68, 0x01, 0x00, 0x62, 0xd1, 0x41, 0x00, 0x01, 0x3c, 0x1b, 0x96, 0x40, 0x25, 0xe4, 0x48, 0x3f, 0x9f, 0x3b, 0x57, 0x85, 0x57, 0x76, 0x7b, 0xbd, 0x09, 0xd7, 0xce, 0xc9, 0x6d, 0x8b, 0x14, 0x1f, 0xf9, 0xdb, 0xc8, 0xe0, 0x4f, 0x27, 0x07, 0x90, 0x57, 0xb8, 0x4d, 0xb6, 0x45, 0x82, 0x48, 0xc2, 0x90, 0xfb, 0x2a, 0xe9, 0xe3, 0x9e, 0x63, 0x23, 0xf9, 0x14, 0x15, 0x65, 0x64, 0x88, 0x5a, 0x34, 0xc3, 0x10, 0xbb, 0x14, 0x95, 0xb2, 0xe6, 0xb4, 0x01, 0x00, 0x63, 0xff, 0x11, 0x00, 0xc1, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79, 0x00, 0x00, 0x00, 0x00, 0xfe, 0x00, 0x00, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            const bufArry = [beforeBufWithUShortUserType, flags, midBuf, cyptoMetdadataBufWithUShortUserType, afterBufWithUShortUserType]
            const buf = Buffer.concat(bufArry)

            const parser = new Parser({ token() { } }, {}, {});
            options.tdsVersion = tediousVerOld
            parser.buffer = buf;
            parser.options = options

            Colmetadata.colMetadataParser(parser, [], options, (token) => {
                // Check that parsed before user type and after user type arestill valid
                assert.equal(token.columns[0].cryptoMetaData.ordinal, 0);
                assert.equal(token.columns[0].cryptoMetaData.userType, 0);
                assert.equal(token.columns[0].cryptoMetaData.baseTypeInfo.type.name, 'IntN');
                options.tdsVersion = '7_4'
                done();
            })
        })
        it('Cryptometadata with invalid datatype ', function () {
            // put a non-existed type in the crypto metadata, and expected an error
            const cyptoMetdadataBufWithWrongType = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x04, 0x02, 0x01, 0x01])
            const bufArry = [beforeBuf, flags, midBuf, cyptoMetdadataBufWithWrongType, afterBuf]
            const buf = Buffer.concat(bufArry)

            const parser = new Parser({ token() { } }, {}, {});
            parser.buffer = buf;
            parser.options = options
            //expected an error from typeInfoParse
            assert.throws(() => { colMetadataParser(parser, [], options, (token) => { }) })
        })
        it('Cryptometadata with algo type equal to 0 ', function (done) {
            // Insert a mock algorithm name in the cyptometadata
            const cyptoMetdadataBufWithAlgoName = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x26, 0x04, 0x00, 0x01, 0x01])
            const bufArry = [beforeBuf, flags, midBuf, cyptoMetdadataBufWithAlgoName.slice(0, 9), AlgoName, cyptoMetdadataBufWithAlgoName.slice(9, 11), afterBuf]
            const buf = Buffer.concat(bufArry)

            const parser = new Parser({ token() { } }, {}, {});
            parser.buffer = buf;
            parser.options = options
            Colmetadata.colMetadataParser(parser, [], options, (token) => {
                assert.equal(token.columns[0].cryptoMetaData.algoName, 'TestName');
                done();
            })
        })
    })

})


//------------------------------------------------

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