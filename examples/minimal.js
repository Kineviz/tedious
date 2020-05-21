var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;

var config = {
  "server": "localhost",
    "authentication": {
    "type": "default",
      "options": {
      "userName": "sa",
       "password": "Password1",
    }
  },
    "options":{
  "port": 1433,
  "database": "master",
  "columnEncryptionSetting": true,
  "encrypt": false,
}
}

var connection = new Connection(config);

connection.on('connect', function(err) {
    // If no error, then good to go...
    executeStatement();
  }
);

connection.on('debug', function(text) {
    //console.log(text);
  }
);

function executeStatement() {
  request = new Request("select top 1 * from test_always_encrypted", function(err, rowCount) {
    if (err) {
      console.log(err);
    } else {
      console.log(rowCount + ' rows');
    }

    connection.close();
  });

  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  request.on('columnMetadata', (columns) => {
    columns.forEach((column) => {
      console.log('>> ', column);
    })
  })

  request.on('done', function(rowCount, more) {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
