const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;

const fs = require('fs');
const { assert } = require('chai');

/* const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config; */

var config = {
  "server": "localhost",
  "authentication": {
    "type": "default",
    "options": {
      "userName": "sa",
      "password": "Password1",
    }
  },
  "options": {
    "port": 1433,
    "database": "master",
    "columnEncryptionSetting": true,
  }
}

config.options.debug = {
  packet: false,
  data: false,
  payload: false,
  token: false,
  log: true
};
config.options.columnEncryptionSetting = true;
const alwaysEncryptedCEK = Buffer.from([
  // decrypted column key must be 32 bytes long for AES256
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
config.options.encryptionKeyStoreProviders = [{
  key: 'TEST_KEYSTORE',
  value: {
    decryptColumnEncryptionKey: () => Promise.resolve(alwaysEncryptedCEK),
  },
}];
config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

config.options.encrypt = false;

describe('always encrypted', function () {
  this.timeout(100000);
  let connection;

  before(function () {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

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

  beforeEach(function (done) {
    connection = new Connection(config);
    // connection.on('debug', (msg) => console.log(msg));
    /* connection.on('connect', () => {
      dropKeys((err) => {
        if (err) {
          return done(err);
        }
        createKeys(done);
      });
    }); */
    connection.on('connect', () => {
      const request = new Request('IF OBJECT_ID(\'dbo.test_always_encrypted\', \'U\') IS NOT NULL DROP TABLE dbo.test_always_encrypted;', (err) => {
        if (err) {
          return done(err);
        }
        
        done();
      });
      connection.execSql(request);
    });
  });

  afterEach(function (done) {
    // if (!connection.closed) {
    //   /* dropKeys(() => {
    //     connection.on('end', done);
    //     connection.close();
    //   }); */
    // } else {
    //   connection.close();
    //   done();
    // }
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  it('should correctly insert/select the encrypted data', function (done) {
    const request = new Request(`CREATE TABLE test_always_encrypted (
      [int_test] int 
      ENCRYPTED WITH (
        ENCRYPTION_TYPE = DETERMINISTIC,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256',
        COLUMN_ENCRYPTION_KEY = [CEK1]
      )
    );`, (err) => {
      if (err) {
        return done(err);
      }

      const p3 = 123;
      const request = new Request('INSERT INTO test_always_encrypted ([int_test]) VALUES (@p3)', (err) => {
        if (err) {
          return done(err);
        }
        let values = [];
        const request = new Request('SELECT TOP 1 [int_test] FROM test_always_encrypted', (err) => {
          if (err) {
            return done(err);
          }

          try {
            assert.deepEqual(values, [p3]);
          } catch (error) {
            return done(error);
          }

          return done();
        });

        request.on('row', function (columns) {
          values = columns.map((col) => col.value);
        });

        connection.execSql(request);
      });

      request.addParameter('p3', TYPES.Int, p3);
      connection.execSql(request);
    });
    connection.execSql(request);
  });

  xit('should bulkLoad AE', function (done) {
    const bulkLoad = connection.newBulkLoad('test_always_encrypted', (err) => {
      if (err) {
        return done(err);
      }

      done();
    })

    for (let [name, type, column] of [[
      'test_int',
      TYPES.TinyInt,
      {
        encryptionType: 'DETERMINISTIC',
        algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_256',
        columnEncryptionKey: 'CEK1',
      }
    ]]) {
      bulkLoad.addColumn(name, type, column);
    }

    const request = new Request(bulkLoad.getTableCreationSql(), (err, rowCount) => {
      if (err) {
        done(err);
      }
      console.log('done Request')
      bulkLoad.addRow(2);
      connection.execBulkLoad(bulkLoad);
    })
    console.log(bulkLoad.getTableCreationSql());

    connection.execSqlBatch(request);

    connection.on('infoMessage', infoError);
    connection.on('errorMessage', infoError);
    connection.on('debug', debug);
  })

});

function infoError(info) {
  console.log(info.number + ' : ' + info.message);
}

function debug(message) {
  console.log(message);
}

